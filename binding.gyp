{
    "targets": [
        {
            "target_name": "aws-crt-nodejs",
            "sources": [
                "<!@(node -p \"require('fs').readdirSync('./source/').map(f=>'source/'+f).join(' ')\")",
            ],
            "include_dirs": [
                "<!(echo $AWS_C_INSTALL/include)"
            ],
            "conditions": [
                ["OS=='win'", {
                    "cflags": [
                        "/Wall",
                        "/WX",
                    ],
                }, {
                    "cflags": [
                        "-std=c99",
                        "-Werror",
                        "-Wall",
                        "-Wextra",
                        "-pedantic",
                    ],
                }],
                ["OS=='linux'", {
                    "libraries=": [
                        "-laws-c-mqtt",
                        "-laws-c-io",
                        "-laws-c-common",
                        "-ls2n",
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