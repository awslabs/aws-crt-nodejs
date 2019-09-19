{
    "variables": {
        "deps_install_dir": "'<!(node -p \"process.env.AWS_C_INSTALL ? process.env.AWS_C_INSTALL.replace(/\\\"+/g,'') : require('path').join(process.cwd(), 'deps_build', 'install')\")'",
        "build_args": "<!(node -p \"require('./package.json').debug ? \'--debug\' : \'--release\'\")"
    },
    "targets": [
        {
            "target_name": "run-deps-build",
            "type": "none",
            "actions": [
                {
                    "action_name": "deps-build",
                    "inputs": [
                        "<!@(node -p \"require('fs').readdirSync('./aws-c-common/').map(f=>'aws-c-common/'+f).join(' ')\")"
                    ],
                    "outputs": [
                        "../deps_build/install/include/aws/common/common.h"
                    ],
                    "action": ["node", "./dist/scripts/deps_build.js", "<(build_args)"],
                    "message": "building dependencies"
                }
            ],
        },
        {
            "target_name": "<(module_name)",
            "dependencies": ["run-deps-build"],
            "sources": [
                "<!@(node -p \"require('fs').readdirSync('./source/').map(f=>'source/'+f).join(' ')\")",
            ],
            "defines": [
                "NAPI_VERSION=<(napi_build_version)",
            ],
            "include_dirs": [
                "<!(node -p \"require('path').join(<(deps_install_dir),'include')\")",
            ],
            "library_dirs": [
                "<!(node -p \"require('path').join(<(deps_install_dir),'lib')\")",
            ],
            "libraries": [
                "-laws-c-mqtt",
                "-laws-c-http",
                "-laws-c-io",
                "-laws-c-common",
                "-laws-c-cal",
            ],
            "conditions": [
                ["OS=='win'", {
                    "cflags": [
                        "/Wall",
                        "/WX",
                        "/NODEFAULTLIB:library",
                    ],
                    "libraries": [
                        "-lSecur32",
                        "-lCrypt32",
                        "-lAdvapi32",
                        "-lBCrypt",
                        "-lKernel32",
                        "-lWs2_32",
                        "-lLIBCMT",
                    ],
                }, {
                    "cflags": [
                        "-std=gnu99",
                        "-Wall",
                        "-Wextra",
                        "-pedantic",
                    ],
                }],
                ["OS=='linux'", {
                    "libraries": [
                        "-ls2n",
                        "-lcrypto",
                        "-lgcc",
                    ],
                }],
                ["OS=='mac'", {
                    "libraries": [
                        "-l/System/Library/Frameworks/Security.framework",
                    ],
                }],
            ],
        },
        {
            "target_name": "copy-binary",
            "type": "none",
            "dependencies": [ "<(module_name)" ],
            "copies": [
                {
                    "files": [
                        "<(PRODUCT_DIR)/<(module_name).node"
                    ],
                    "destination": "<(module_path)"
                }
            ]
        },
    ]
}