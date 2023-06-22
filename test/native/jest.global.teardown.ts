import * as test_env from "../test_env";

export default async () => {
    console.log('\nhello, this is just before end start running');
    console.log(test_env.AWS_IOT_ENV.MQTT311_PKCS11_LIB_PATH);
    console.log(process.env.AWS_TEST_PKCS11_LIB);
    // const pkcs11_lib = new io.Pkcs11Lib(process.env.AWS_TEST_PKCS11_LIB ?? "", Pkcs11Lib.InitializeFinalizeBehavior.STRICT);
    // pkcs11_lib.close()
};