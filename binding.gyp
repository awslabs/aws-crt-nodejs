{
    "targets": [
        {
            "target_name": "aws-crt-nodejs",
            "sources": [
                "<!@(node -p \"require('fs').readdirSync('./source/').map(f=>'source/'+f).join(' ')\")",
            ],
            "include_dirs": [
                "<!(echo $AWS_C_INSTALL/include)",
            ],
            "defines": [
                "AWS_USE_LIBUV",
                "NAPI_VERSION=4"
            ],
            "conditions": [
                ["OS=='win'", {
                    "cflags": [
                        "/Wall",
                        "/WX",
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
                    "libraries=": [
                        "-laws-c-mqtt",
                        "-laws-c-io",
                        "-laws-c-common",
                        "-ls2n",
                        "-lcrypto"
                    ],
                }],
            ],
            "library_dirs": [
                "<!(echo $AWS_C_INSTALL/lib)"
            ],
            "libraries": [
                "-laws-c-mqtt",
                "-laws-c-io",
                "-laws-c-common",
            ],
        },
    ]
}