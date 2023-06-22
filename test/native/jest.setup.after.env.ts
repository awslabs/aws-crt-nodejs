import * as io from "../../lib/native/io";
import {Pkcs11Lib} from "../../lib/native/io";

let pkcs11_lib: io.Pkcs11Lib  | null;
beforeAll(async () => {
    if(process.env.AWS_TEST_PKCS11_LIB){
        pkcs11_lib = new io.Pkcs11Lib(process.env.AWS_TEST_PKCS11_LIB, Pkcs11Lib.InitializeFinalizeBehavior.STRICT);
    }
});

afterAll(async () => {
    if(pkcs11_lib){
        pkcs11_lib.close();
    }
    pkcs11_lib = null;
});