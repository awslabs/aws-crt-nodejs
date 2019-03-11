/*
 * Copyright 2010-2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License").
 * You may not use this file except in compliance with the License.
 * A copy of the License is located at
 *
 *  http://aws.amazon.com/apache2.0
 *
 * or in the "license" file accompanying this file. This file is distributed
 * on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either
 * express or implied. See the License for the specific language governing
 * permissions and limitations under the License.
 */

import child_process from 'child_process';
import fs from 'fs';
import path from 'path';

async function run_and_check(command: string) {
    return new Promise<string>((resolve, reject) => {
        child_process.exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error(stderr);
                reject(error);
            }
            resolve(stdout);
        });
    });
}

const is_64bit = process.arch == 'x64' || process.arch == 'arm64';
const is_32bit = process.arch == 'x32' || process.arch == 'arm';

const is_arm = process.arch == 'arm' || process.arch == 'arm64';
const is_windows = process.platform == 'win32';

/* Capture the include path of Node dependencies */
const node_install_path = path.resolve(process.argv[0], '..', '..');
const node_include_path = path.resolve(node_install_path, 'include', 'node');

const cross_compile_string = (is_32bit && !is_windows) ? '-DCMAKE_C_FLAGS=-m32' : '';

async function get_generator_string(): Promise<string | null> {
    return new Promise(async (resolve) => {
        if (!is_windows) {
            resolve(null);
        } else {
            const prog_x86_path = process.env['PROGRAMFILES(x86)'] as string;

            let vs_version;
            if (fs.existsSync(path.join(prog_x86_path, 'Microsoft Visual Studio', '2019'))) {
                vs_version = '16.0';
                console.log('found installed version of Visual Studio 2019');
            } else if (fs.existsSync(path.join(prog_x86_path, 'Microsoft Visual Studio', '2017'))) {
                vs_version = '15.0';
                console.log('found installed version of Visual Studio 2017');
            } else if (fs.existsSync(path.join(prog_x86_path, 'Microsoft Visual Studio 14.0'))) {
                vs_version = '14.0';
                console.log('found installed version of Visual Studio 2015');
            } else {
                console.log('Making an attempt at calling vswhere')
                const vswhere_args = [
                    '%ProgramFiles(x86)%\\Microsoft Visual Studio\\Installer\\vswhere.exe',
                    '-legacy',
                    '-latest',
                    '-property',
                    'installationVersion',
                ].join(' ');
                let vswhere_output: string | undefined;

                try {
                    await run_and_check(vswhere_args);
                } catch (e) {
                    console.error('No version of MSVC compiler could be found!');
                    process.exit(1);
                }

                if (vswhere_output) {
                    for (const out of vswhere_output.split('\n')) {
                        vs_version = out;
                    }
                } else {
                    console.error('No MSVC compiler could be found!');
                    process.exit(1);
                }
            }

            const vs_major_version = (vs_version as string).split('.')[0]

            const cmake_help_output = await run_and_check('cmake --help');

            let vs_version_gen_str: string | undefined;
            for (const out in cmake_help_output.split('\n')) {
                const trimmed_out = out.trim();
                if (trimmed_out.search('Visual Studio') && trimmed_out.search(vs_major_version)) {
                    console.log('selecting generator:', trimmed_out);
                    vs_version_gen_str = trimmed_out.split('[')[0].trim();
                    break;
                }
            }

            if (!vs_version_gen_str) {
                console.error('CMake does not recognize an installed version of visual studio on your system.');
                process.exit(1);
            }

            if (is_64bit) {
                console.log('64bit version of python detected, using win64 builds')
                vs_version_gen_str = vs_version_gen_str + ' Win64'
            }

            vs_version_gen_str = '-G' + vs_version_gen_str;
            console.log('Succesfully determined generator as ', vs_version_gen_str);
            resolve(vs_version_gen_str);
        }
    });
}

const current_dir = path.resolve(__dirname, '..', '..');
const build_dir = path.join(current_dir, 'deps_build');

if (!fs.existsSync(build_dir)) {
    fs.mkdirSync(build_dir);
}
process.chdir(build_dir);

const dep_install_path = process.env.AWS_C_INSTALL || path.join(build_dir, 'install');

let lib_dir = 'lib';
if (fs.existsSync(path.join(dep_install_path, 'lib64'))) {
    lib_dir = 'lib64';
}

async function build_dependency(lib_name: string, ...cmake_args: string[]) {
    const lib_source_dir = path.join(current_dir, lib_name);
    // Skip library if it wasn't pulled
    if (!fs.existsSync(path.join(lib_source_dir, 'CMakeLists.txt'))) {
        console.log('skipping', lib_name);
        lib_dir = 'lib';
        return;
    }

    const lib_build_dir = path.join(build_dir, lib_name);
    if (!fs.existsSync(lib_build_dir)) {
        fs.mkdirSync(lib_build_dir)
    }
    process.chdir(lib_build_dir)

    const all_cmake_args = [
        'cmake',
        await get_generator_string(),
        cross_compile_string,
        '"-DCMAKE_PREFIX_PATH=' + [dep_install_path, node_install_path].join(';') + '"',
        '-DCMAKE_INSTALL_PREFIX=' + dep_install_path,
        '-DBUILD_SHARED_LIBS=OFF',
        '-DBUILD_TESTING=OFF',
        '-DCMAKE_INSTALL_LIBDIR=' + lib_dir,
        '-DCMAKE_BUILD_TYPE=Release',
        '-DCMAKE_C_FLAGS=-I' + node_include_path,
        cmake_args.join(' '),
        lib_source_dir,
    ].join(' ');
    const build_cmd = ['cmake', '--build', './', '--config', 'release', '--target', 'install'].join(' ');

    await run_and_check(all_cmake_args);
    await run_and_check(build_cmd);

    process.chdir(build_dir);
}

(async () => {
    try {
        if (process.platform != 'darwin' && !is_windows) {
            await build_dependency('s2n');
        }
        await build_dependency('aws-c-common');
        await build_dependency('aws-c-io', '-DUSE_LIBUV=ON');
        await build_dependency('aws-c-mqtt');
        await build_dependency('aws-c-cal');
    } catch (e) {
        console.error(e);
        process.exit(-1);
    }
})();
