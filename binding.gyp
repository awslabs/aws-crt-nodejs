{
    "targets": [
        {
            "target_name": "aws-crt-nodejs",
            "sources": [
                "<!@(node -p \"require('fs').readdirSync('./source/').map(f=>'source/'+f).join(' ')\")",
            ],
            "defines": [
                "AWS_USE_LIBUV"
            ],
            "include_dirs": [
                "<!(node -p \"require('path').join(process.env.AWS_C_INSTALL.replace(/\\\"+/g,''),'include')\")",
            ],
            "library_dirs": [
                "<!(node -p \"require('path').join(process.env.AWS_C_INSTALL.replace(/\\\"+/g,''),'lib')\")",
            ],
            "libraries": [
                "-laws-c-mqtt",
                "-laws-c-io",
                "-laws-c-common",
            ],
            "conditions": [
                ["OS=='win'", {
                    "cflags": [
                        "/Wall",
                        "/WX",
                    ],
                    "libraries": [
                        "-lSecur32",
                        "-lCrypt32",
                        "-lAdvapi32",
                        "-lBCrypt",
                        "-lKernel32",
                        "-lWs2_32",
                    ],
                }, {
                    "cflags": [
                        "-std=gnu99",
                        "-Werror",
                        "-Wall",
                        "-Wextra",
                        "-pedantic",
                        "-Wno-zero-length-array",
                    ],
                }],
                ["OS=='linux'", {
                    "libraries": [
                        "-ls2n",
                        "-lcrypto",
                        "-lgcc",
                    ],
                }],
            ],
        },
    ]
}