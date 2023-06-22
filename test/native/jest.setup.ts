import * as io from "../../lib/native/io";
import * as test_env from "../test_env";
import {Pkcs11Lib} from "../../lib/native/io";

let pkcs11_lib: io.Pkcs11Lib  | null;
beforeAll(async () => {
    console.error("before all");
    if(test_env.AWS_IOT_ENV.MQTT311_PKCS11_LIB_PATH !== ""){
        pkcs11_lib = new io.Pkcs11Lib(test_env.AWS_IOT_ENV.MQTT311_PKCS11_LIB_PATH, Pkcs11Lib.InitializeFinalizeBehavior.STRICT);
    }
});

afterAll(async () => {
    console.error("after all");
    if(pkcs11_lib){
        pkcs11_lib.close();
    }
    pkcs11_lib = null;
});