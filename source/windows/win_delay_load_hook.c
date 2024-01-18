/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

/*
 * This file sets up a windows delay load hook that the dll would redirect to
 * the calling process (.exe file) instead of `node.exe`.
 *
 * This allows compiled addons to work when node.exe is renamed.
 */

#ifdef _MSC_VER

#    ifndef WIN32_LEAN_AND_MEAN
#        define WIN32_LEAN_AND_MEAN
#    endif
#    include <windows.h>

/* keep the space to prevent formatters from reordering this with the Windows.h header. */
#    include <delayimp.h>
#    include <string.h>

FARPROC WINAPI delayHook(unsigned dliNotify, PDelayLoadInfo pdli) {
    switch (dliNotify) {
        case dliNotePreLoadLibrary:

            // If you want to return control to the helper, return 0.
            // Otherwise, return your own HMODULE to be used by the
            // helper instead of having it call LoadLibrary itself.
            if (_stricmp(pdli->szDll, "node.exe") != 0) {
                // return control if we are not loading node.exe
                return NULL;
            }

            // As in Electron 4.x and higher, the symbols needed by native modules are exported by `electron.exe`
            // instead of `node.exe`. It is necessary to overwrite the node load process. More info about Electron
            // windows delay load issue:
            //     https://www.electronjs.org/docs/latest/tutorial/using-native-node-modules#a-note-about-win_delay_load_hook

            // If we call GetModuleHandle with NULL, GetModuleHandle returns a handle to the file used to create the
            // calling process (.exe file). This means if we launch the library through `node.exe`, GetModuleHandle
            // would still return `node.exe`. While in the case of electron, instead of loading `node`, GetModuleHandle
            // would return `electron.exe`.
            // This would also solve the issue where the node.exe is rename.
            return (FARPROC)GetModuleHandle(NULL);

        // Return control in the other cases.
        case dliStartProcessing:
        case dliNotePreGetProcAddress:
        case dliFailLoadLib:
        case dliFailGetProc:
        case dliNoteEndProcessing:
        default:
            return NULL;
    }
}

ExternC const PfnDliHook __pfnDliNotifyHook2 = delayHook;

#endif
