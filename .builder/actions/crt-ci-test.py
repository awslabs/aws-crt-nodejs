import atexit
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

    def _write_s3_to_temp_file(self, env, s3_file):
        try:
            tmp_file = tempfile.NamedTemporaryFile(delete=False)
            tmp_file.flush()
            tmp_s3_filepath = tmp_file.name
            cmd = ['aws', '--region', 'us-east-1', 's3', 'cp',
                    s3_file, tmp_s3_filepath]
            env.shell.exec(*cmd, check=True, quiet=True)
            return tmp_s3_filepath
        except:
            print (f"ERROR: Could not get S3 file from URL {s3_file}!")
            raise RuntimeError("Could not get S3 file from URL")

    def _build_and_run_eventstream_echo_server(self, env):
        java_sdk_dir = None

        try:
            env.shell.exec(["mvn", "--version"], check=True)

            # maven is installed, so this is a configuration we can start an event stream echo server
            java_sdk_dir = env.shell.mktemp()

            env.shell.exec(["git", "clone", "https://github.com/aws/aws-iot-device-sdk-java-v2"], working_dir=java_sdk_dir, check=True)

            sdk_dir = os.path.join(java_sdk_dir, "aws-iot-device-sdk-java-v2", "sdk")
            env.shell.pushd(sdk_dir)

            try:
                # The EchoTest server is in test-only code
                env.shell.exec(["mvn", "test-compile"], check=True)

                env.shell.exec(["mvn", "dependency:build-classpath", "-Dmdep.outputFile=classpath.txt"], check=True)

                with open('classpath.txt', 'r') as file:
                    classpath = file.read()

                test_class_path = os.path.join(sdk_dir, "target", "test-classes")
                target_class_path = os.path.join(sdk_dir, "target", "classes")
                directory_separator = os.pathsep

                echo_server_command = ["java", "-classpath", f"{test_class_path}{directory_separator}{target_class_path}{directory_separator}{classpath}", "software.amazon.awssdk.eventstreamrpc.echotest.EchoTestServiceRunner", "127.0.0.1", "8033"]

                print(f'Echo server command: {echo_server_command}')

                # bypass builder's exec wrapper since it doesn't allow for background execution
                proc = subprocess.Popen(echo_server_command)

                @atexit.register
                def _terminate_echo_server():
                    proc.terminate()
                    proc.wait()

                env.shell.setenv("AWS_TEST_EVENT_STREAM_ECHO_SERVER_HOST", "127.0.0.1", quiet=False)
                env.shell.setenv("AWS_TEST_EVENT_STREAM_ECHO_SERVER_PORT", "8033", quiet=False)
            finally:
                env.shell.popd()

        except:
            print('Failed to set up event stream server.  Eventstream CI tests will not be run.')

        return java_sdk_dir

    def run(self, env):

        actions = []
        java_sdk_dir = None
        cert_file_name = None
        key_file_name = None

        # PKCS12 setup (MacOS only)
        if (sys.platform == "darwin"):
            pkcs12_file_name = self._write_s3_to_temp_file(env, "s3://aws-crt-test-stuff/unit-test-key-pkcs12.pem")
            env.shell.setenv("AWS_TEST_MQTT311_IOT_CORE_PKCS12_KEY", pkcs12_file_name)
            env.shell.setenv("AWS_TEST_MQTT311_IOT_CORE_PKCS12_KEY_PASSWORD", "PKCS12_KEY_PASSWORD")

        try:
            java_sdk_dir = self._build_and_run_eventstream_echo_server(env)

            env.shell.setenv("AWS_TESTING_COGNITO_IDENTITY", env.shell.get_secret("aws-c-auth-testing/cognito-identity"), quiet=True)

            # Unfortunately, we can't use NamedTemporaryFile and a with-block because NamedTemporaryFile is not readable
            # on Windows.
            self._write_environment_script_secret_to_env(env, "mqtt5-testing/github-ci-environment")

            cert_file_name = self._write_secret_to_temp_file(env, "unit-test/certificate")
            key_file_name = self._write_secret_to_temp_file(env, "unit-test/privatekey")

            env.shell.setenv("AWS_TEST_MQTT5_IOT_CORE_CERTIFICATE_PATH", cert_file_name, quiet=True)
            env.shell.setenv("AWS_TEST_MQTT5_IOT_CORE_KEY_PATH", key_file_name, quiet=True)

            env.shell.exec(["npm", "run", "test:native"], check=True)
        except:
            print(f'Failure while running tests')
            actions.append("exit 1")
        finally:
            if cert_file_name:
                os.remove(cert_file_name)
            if key_file_name:
                os.remove(key_file_name)
            if java_sdk_dir:
                env.shell.rm(java_sdk_dir)

        return Builder.Script(actions, name='crt-ci-test')
