"""
Set up this machine for running the PKCS#11 tests.
If SoftHSM2 cannot be installed, the tests are skipped.
"""

import Builder

import json
import os
import pathlib
import re
import subprocess
import sys
import tempfile


class Pkcs11TestSetup(Builder.Action):
    def run(self, env):
        self.env = env

        # currently, we only support PKCS#11 on unix
        if sys.platform == 'darwin' or sys.platform == 'win32':
            print(f"PKCS#11 on '{sys.platform}' is not currently supported. " +
                  "PKCS#11 tests are disabled")
            return
        # run on arm for Raspberry Pi
        elif 'linux' in sys.platform and os.uname()[4][:3] == 'arm':
            print(f"PKCS#11 on 'ARM' is not currently supported. PKCS#11 tests are disabled")
            return

        # try to install SoftHSM2, so we can run PKCS#11 tests
        try:
            softhsm2_install_action = Builder.InstallPackages(['softhsm'])
            softhsm2_install_action.run(self.env)
        except Exception:
            print("WARNING: SoftHSM2 could not be installed. PKCS#11 tests are disabled")
            return

        softhsm2_lib = self._find_softhsm2_lib()
        if softhsm2_lib is None:
            print("WARNING: libsofthsm2.so not found. PKCS#11 tests are disabled")
            return

        # put SoftHSM2 config file and token directory under the temp dir.
        softhsm2_dir = os.path.join(tempfile.gettempdir(), 'softhsm2')
        conf_path = os.path.join(softhsm2_dir, 'softhsm2.conf')
        token_dir = os.path.join(softhsm2_dir, 'tokens')
        if os.path.exists(token_dir):
            env.shell.rm(token_dir)
        env.shell.mkdir(token_dir)
        self._setenv('SOFTHSM2_CONF', conf_path)
        pathlib.Path(conf_path).write_text(
            f"directories.tokendir = {token_dir}\n")

        # bail out if softhsm is too old
        # 2.1.0 is a known offender that crashes on exit if C_Finalize() isn't called
        if self._get_softhsm2_version() < (2, 2, 0):
            print("WARNING: SoftHSM2 installation is too old. PKCS#11 tests are disabled")
            return

        # create token
        token_label = 'my-token'
        pin = '0000'
        self._exec_softhsm2_util('--init-token', '--free', '--label', token_label,
                                 '--pin', pin, '--so-pin', '0000')

        # figure out which slot the token ended up in.
        #
        # older versions of SoftHSM2 (ex: 2.1.0) make us pass --slot number to the --import command.
        # (newer versions let us pass --label name instead)
        #
        # to learn the slot of our new token examine the output of the --show-slots command.
        # we can't just examine the output of --init-token because some versions
        # of SoftHSM2 (ex: 2.2.0) reassign tokens to random slots without printing out where they went.
        token_slot = self._find_sofhsm2_token_slot()

        # add private key to token
        # key must be in PKCS#8 format
        # we have this stored in secretsmanager
        key_path = self._tmpfile_from_secret(
            'unit-test/privatekey-p8', 'privatekey.p8.pem')
        key_label = 'my-key'
        self._exec_softhsm2_util('--import', key_path, '--slot', token_slot,
                                 '--label', key_label, '--id', 'BEEFCAFE', '--pin', pin)

        # set env vars for tests
        self._setenv('AWS_TEST_PKCS11_LIB', softhsm2_lib)
        self._setenv('AWS_TEST_PKCS11_PIN', pin)
        self._setenv('AWS_TEST_PKCS11_TOKEN_LABEL', token_label)
        self._setenv('AWS_TEST_PKCS11_KEY_LABEL', key_label)

    def _find_softhsm2_lib(self):
        """Return path to SoftHSM2 shared lib, or None if not found"""

        # note: not using `ldconfig --print-cache` to find it because
        # some installers put it in weird places where ldconfig doesn't look
        # (like in a subfolder under lib/)

        for lib_dir in ['lib64', 'lib']:  # search lib64 before lib
            for base_dir in ['/usr/local', '/usr', '/', ]:
                search_dir = os.path.join(base_dir, lib_dir)
                for root, dirs, files in os.walk(search_dir):
                    for file_name in files:
                        if 'libsofthsm2.so' == file_name:
                            return os.path.join(root, file_name)
        return None

    def _exec_softhsm2_util(self, *args, **kwargs):
        if not 'check' in kwargs:
            kwargs['check'] = True

        result = self.env.shell.exec('softhsm2-util', *args, **kwargs)

        # older versions of softhsm2-util (2.1.0 is a known offender)
        # return error code 0 and print the help if invalid args are passed.
        # This should be an error.
        #
        # invalid args can happen because newer versions of softhsm2-util
        # support more args than older versions, so what works on your
        # machine might not work on some ancient docker image.
        if 'Usage: softhsm2-util' in result.output:
            raise Exception('softhsm2-util failed')

        return result

    def _get_softhsm2_version(self):
        output = self._exec_softhsm2_util('--version').output
        match = re.match('([0-9+])\.([0-9]+).([0-9]+)', output)
        return (int(match.group(1)), int(match.group(2)), int(match.group(3)))

    def _find_sofhsm2_token_slot(self):
        """Return slot ID of first initialized token"""

        output = self._exec_softhsm2_util('--show-slots').output

        # --- output looks like ---
        # Available slots:
        # Slot 0
        #    Slot info:
        #        ...
        #        Token present:    yes
        #    Token info:
        #        ...
        #        Initialized:      yes
        current_slot = None
        current_info_block = None
        for line in output.splitlines():
            # check for start of "Slot <ID>" block
            m = re.match(r"Slot ([0-9]+)", line)
            if m:
                current_slot = m.group(1)
                current_info_block = None
                continue

            if current_slot is None:
                continue

            # check for start of next indented block, like "Token info"
            m = re.match(r"    ([^ ].*)", line)
            if m:
                current_info_block = m.group(1)
                continue

            if current_info_block is None:
                continue

            # if we're in token block, check for "Initialized: yes"
            if "Token info" in current_info_block:
                if re.match(r" *Initialized: *yes", line):
                    return current_slot

        raise Exception('No initialized tokens found')

    def _setenv(self, var, value):
        """
        Set environment variable now,
        and ensure the environment variable is set again when tests run
        """
        self.env.shell.setenv(var, value)
        self.env.project.config['test_env'][var] = value

    def _get_secret(self, secret_id):
        """get string from secretsmanager"""

        # NOTE: using AWS CLI instead of boto3 because we know CLI is already
        # installed wherever builder is run. Once upon a time we tried using
        # boto3 by installing it while the builder was running but this didn't
        # work in some rare scenarios.

        cmd = ['aws', 'secretsmanager', 'get-secret-value',
               '--secret-id', secret_id]
        # NOTE: print command args, but use "quiet" mode so that output isn't printed.
        # we don't want secrets leaked to the build log
        print('>', subprocess.list2cmdline(cmd))
        result = self.env.shell.exec(*cmd, check=True, quiet=True)
        secret_value = json.loads(result.output)
        return secret_value['SecretString']

    def _tmpfile_from_secret(self, secret_name, file_name):
        """get file contents from secretsmanager, store as file under /tmp, return file path"""
        file_contents = self._get_secret(secret_name)
        file_path = os.path.join(tempfile.gettempdir(), file_name)
        print(f"Writing to: {file_path}")
        pathlib.Path(file_path).write_text(file_contents)
        return file_path
