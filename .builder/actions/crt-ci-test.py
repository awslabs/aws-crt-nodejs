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
                env.shell.setenv(env_pair_match.group(1), env_pair_match.group(2), quiet=True)

    def _write_secret_to_temp_file(self, env, secret_name):
        secret_value = env.shell.get_secret(secret_name)

        fd, filename = tempfile.mkstemp()
        os.write(fd, str.encode(secret_value))
        os.close(fd)

        return filename

    def _build_and_run_eventstream_echo_server(self, env):
        java_sdk_dir = None
        proc = None

        try:
            env.shell.exec(["mvn", "--version"])

            # maven is installed, so this is a configuration we can start an event stream echo server
            java_sdk_dir = env.shell.mktemp()

            env.shell.exec(["git", "clone", "https://github.com/aws/aws-iot-device-sdk-java-v2"], working_dir=java_sdk_dir)

            sdk_dir = os.path.join(java_sdk_dir, "aws-iot-device-sdk-java-v2", "sdk")
            env.shell.pushd(sdk_dir)

            try:
                env.shell.exec(["mvn", "compile"])
                env.shell.exec(["mvn", "test", "-DskipTests=true"])
                env.shell.exec(["mvn", "dependency:build-classpath", "-Dmdep.outputFile=classpath.txt"])

                with open('classpath.txt', 'r') as file:
                    classpath = file.read()

                print(f'Classpath: {classpath}')

                echo_server_command = ["java", "-classpath", f"{sdk_dir}/target/test-classes:{sdk_dir}/target/classes:{classpath}", "software.amazon.awssdk.eventstreamrpc.echotest.EchoTestServiceRunner", "127.0.0.1", "8033"]

                print(f'Echo server command: {echo_server_command}')

                # bypass builder's exec wrapper since it doesn't allow for background execution
                proc = subprocess.Popen(echo_server_command)

                env.shell.setenv("AWS_TEST_EVENT_STREAM_ECHO_SERVER_HOST", "127.0.0.1", quiet=False)
                env.shell.setenv("AWS_TEST_EVENT_STREAM_ECHO_SERVER_PORT", "8033", quiet=False)
            finally:
                env.shell.popd()

        finally:
            print('Test')

        return proc, java_sdk_dir

    def run(self, env):

        # Unfortunately, we can't use NamedTemporaryFile and a with-block because NamedTemporaryFile is not readable
        # on Windows.
        try:
            proc, java_sdk_dir = self._build_and_run_eventstream_echo_server(env)

            env.shell.setenv("AWS_TESTING_COGNITO_IDENTITY", env.shell.get_secret("aws-c-auth-testing/cognito-identity"), quiet=True)

            self._write_environment_script_secret_to_env(env, "mqtt5-testing/github-ci-environment")


            cert_file_name = self._write_secret_to_temp_file(env, "unit-test/certificate")
            key_file_name = self._write_secret_to_temp_file(env, "unit-test/privatekey")

            env.shell.setenv("AWS_TEST_MQTT5_IOT_CORE_CERTIFICATE_PATH", cert_file_name, quiet=True)
            env.shell.setenv("AWS_TEST_MQTT5_IOT_CORE_KEY_PATH", key_file_name, quiet=True)

            if os.system("npm run test:native"):
                # Failed
                actions.append("exit 1")
        finally:
            if proc:
                proc.terminate()
                proc.wait()
            if cert_file_name:
                os.remove(cert_file_name)
            if key_file_name:
                os.remove(key_file_name)
            if java_sdk_dir:
                env.shell.rm(java_sdk_dir)

        actions = []

        return Builder.Script(actions, name='crt-ci-test')
