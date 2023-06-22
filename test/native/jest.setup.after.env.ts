import * as io from "../../lib/native/io";
import {Pkcs11Lib} from "../../lib/native/io";

// PKCS11 tests on Musl will crash if we don't call C_Finalize due to issues with Softhsm.
// C_Finalize is only called in the case of Pkcs11Lib.InitializeFinalizeBehavior.STRICT.
// Therefore, this is a workaround to ensure that C_Finalize is called at the end to prevent a crash.
let pkcs11_lib: io.Pkcs11Lib | null;
beforeAll(async () => {
    if (process.env.AWS_TEST_PKCS11_LIB) {
        pkcs11_lib = new io.Pkcs11Lib(process.env.AWS_TEST_PKCS11_LIB, Pkcs11Lib.InitializeFinalizeBehavior.STRICT);
    }
});

afterAll(async () => {
    if (pkcs11_lib) {
        pkcs11_lib.close();
        pkcs11_lib = null;
    }
});
