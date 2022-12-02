import Builder
import json
import os
import re
import subprocess
import sys
import tempfile

class CrtCiTest(Builder.Action):

    def _write_environment_script_secret_to_env(self, env, secret_name):
        mqtt5_ci_environment_script = env.shell.get_secret(secret_name)
        env_line = re.compile('^export\s+(\w+)=(.+)')

        lines = mqtt5_ci_environment_script.splitlines()
        for line in lines:
            env_pair_match = env_line.match(line)
            if env_pair_match.group(1) and env_pair_match.group(2):
                env.shell.setenv(env_pair_match.group(1), env_pair_match.group(2))

    def _write_secret_to_temp_file(self, env, secret_name):
        secret_value = env.shell.get_secret(secret_name)

        temp_file = tempfile.NamedTemporaryFile()
        temp_file.write(str.encode(secret_value))
        temp_file.flush()

        return temp_file

    def run(self, env):
        env.shell.setenv("AWS_TESTING_COGNITO_IDENTITY", env.shell.get_secret("aws-c-auth-testing/cognito-identity"))

        self._write_environment_script_secret_to_env(env, "mqtt5-testing/github-ci-environment")

        with self._write_secret_to_temp_file(env, "unit-test/certificate") as cert_file, self._write_secret_to_temp_file(env, "unit-test/privatekey") as key_file:

            env.shell.setenv("AWS_TEST_MQTT5_IOT_CORE_CERTIFICATE_PATH", cert_file.name)
            env.shell.setenv("AWS_TEST_MQTT5_IOT_CORE_KEY_PATH", key_file.name)

            node_result = os.system("npm run test:native")
            browser_result = os.system("npm run test:browser")

        if node_result or browser_result:
            # Failed
            actions.append("exit 1")

        actions = []

        return Builder.Script(actions, name='crt-ci-test')
