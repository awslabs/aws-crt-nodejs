import Builder
import os
import re
import tempfile

class CrtCiTest(Builder.Action):

    def _write_environment_script_secret_to_env(self, env, secret_name):
        mqtt5_ci_environment_script = env.shell.get_secret(secret_name)
        env_line = re.compile('^export\s+(\w+)=(.+)')

        lines = mqtt5_ci_environment_script.splitlines()
        for line in lines:
            env_pair_match = env_line.match(line)
            if env_pair_match.group(1) and env_pair_match.group(2):
                env.shell.setenv(env_pair_match.group(1), env_pair_match.group(2), quiet=True)

    def _write_secret_to_temp_file(self, env, secret_name):
        secret_value = env.shell.get_secret(secret_name)

        fd, filename = tempfile.mkstemp()
        os.write(fd, str.encode(secret_value))
        os.close(fd)

        return filename

    def run(self, env):
        env.shell.setenv("AWS_TESTING_COGNITO_IDENTITY", env.shell.get_secret("aws-c-auth-testing/cognito-identity"), quiet=True)

        self._write_environment_script_secret_to_env(env, "mqtt5-testing/github-ci-environment")

        # Unfortunately, we can't use NamedTemporaryFile and a with-block because NamedTemporaryFile is not readable
        # on Windows.
        try:
            cert_file_name = self._write_secret_to_temp_file(env, "unit-test/certificate")
            key_file_name = self._write_secret_to_temp_file(env, "unit-test/privatekey")

            env.shell.setenv("AWS_TEST_MQTT5_IOT_CORE_CERTIFICATE_PATH", cert_file_name, quiet=True)
            env.shell.setenv("AWS_TEST_MQTT5_IOT_CORE_KEY_PATH", key_file_name, quiet=True)

            if os.system("npm run test:browser:ci"):
                # Failed
                actions.append("exit 1")

        finally:
            if cert_file_name:
                os.remove(cert_file_name)
            if key_file_name:
                os.remove(key_file_name)

        actions = []

        return Builder.Script(actions, name='crt-ci-test')
