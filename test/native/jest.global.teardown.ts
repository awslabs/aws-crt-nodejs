import * as io from "../../lib/native/io";
import * as test_env from "../test_env";
import {Pkcs11Lib} from "../../lib/native/io";

export default async () => {
    console.log('\nhello, this is just before end start running');
    const pkcs11_lib = new io.Pkcs11Lib(test_env.AWS_IOT_ENV.MQTT311_PKCS11_LIB_PATH, Pkcs11Lib.InitializeFinalizeBehavior.STRICT);
    pkcs11_lib.close()
};