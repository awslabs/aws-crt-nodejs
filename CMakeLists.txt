cmake_minimum_required(VERSION 3.9...3.31)
project(aws-crt-nodejs C)
option(BUILD_DEPS "Builds aws common runtime dependencies as part of build, only do this if you don't want to control your dependency chain." ON)

option(CMAKE_JS_PLATFORM "Target platform. Should match node's os.platform()")
if (NOT CMAKE_JS_PLATFORM)
    message(FATAL_ERROR "CMAKE_JS_PLATFORM must be set")
endif()

include(CTest)

# ensure that the release build has symbols
if (NOT CMAKE_BUILD_TYPE)
    set(CMAKE_BUILD_TYPE RelWithDebInfo)
endif()

include(GNUInstallDirs)

set(CMAKE_INSTALL_PREFIX "${CMAKE_CURRENT_SOURCE_DIR}/dist")

if (BUILD_DEPS)
    message(STATUS "Using submodule dependencies")
    list(APPEND CMAKE_MODULE_PATH "${CMAKE_CURRENT_LIST_DIR}/crt/aws-c-common/cmake")
    include(AwsFindPackage)

    set(IN_SOURCE_BUILD ON)
    set(BUILD_TESTING_PREV ${BUILD_TESTING})
    set(BUILD_TESTING OFF)

    add_subdirectory(crt/aws-c-common)
    if (UNIX AND NOT APPLE)
        include(AwsPrebuildDependency)
        # s2n-tls uses libcrypto during its configuration, so we need to prebuild aws-lc.
        aws_prebuild_dependency(
            DEPENDENCY_NAME AWSLC
            SOURCE_DIR ${CMAKE_CURRENT_SOURCE_DIR}/crt/aws-lc
            CMAKE_ARGUMENTS
                -DDISABLE_GO=ON
                -DDISABLE_PERL=ON
                -DBUILD_LIBSSL=OFF
                -DBUILD_TESTING=OFF
        )
        # prebuild s2n-tls.
        aws_prebuild_dependency(
            DEPENDENCY_NAME S2N
            SOURCE_DIR ${CMAKE_CURRENT_SOURCE_DIR}/crt/s2n
            CMAKE_ARGUMENTS
                -DUNSAFE_TREAT_WARNINGS_AS_ERRORS=OFF
                -DBUILD_TESTING=OFF
        )
    endif()

    add_subdirectory(crt/aws-c-sdkutils)
    add_subdirectory(crt/aws-c-io)
    add_subdirectory(crt/aws-c-cal)
    add_subdirectory(crt/aws-c-compression)
    add_subdirectory(crt/aws-c-event-stream)
    add_subdirectory(crt/aws-c-http)
    add_subdirectory(crt/aws-c-auth)
    add_subdirectory(crt/aws-c-mqtt)
    add_subdirectory(crt/aws-checksums)

    set(BUILD_TESTING ${BUILD_TESTING_PREV})
else()
    # this is required so we can use aws-c-common's CMake modules
    find_package(aws-c-common REQUIRED)

    include(AwsFindPackage)
    set(IN_SOURCE_BUILD OFF)
endif()

include(AwsCFlags)
include(AwsSharedLibSetup)
include(AwsSanitizers)
include(AwsCRuntime)

aws_determine_local_c_runtime(AWS_C_RUNTIME)

file(GLOB AWS_CRT_SRC
       "source/*.c"
)


if(MSVC)
    file(GLOB AWS_WINDOWS_SRC
        "source/windows/*.c"
    )
    message(STATUS "It's MSVC, enable win_delay_load_hook on windows")
    add_library(${PROJECT_NAME} SHARED ${AWS_CRT_SRC} ${AWS_WINDOWS_SRC})
else()
    add_library(${PROJECT_NAME} SHARED ${AWS_CRT_SRC})
endif()

aws_set_common_properties(${PROJECT_NAME})
aws_prepare_symbol_visibility_args(${PROJECT_NAME} "AWS_CRT_NODEJS")
aws_add_sanitizers(${PROJECT_NAME})
aws_split_debug_info(${PROJECT_NAME})

# Gives our library file a .node extension without any "lib" prefix
set_target_properties(${PROJECT_NAME} PROPERTIES PREFIX "" SUFFIX ".node")

target_include_directories(${PROJECT_NAME} PRIVATE
        $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include>
        $<INSTALL_INTERFACE:include>
        ${CMAKE_JS_INC})

aws_use_package(aws-c-http REQUIRED)
aws_use_package(aws-c-mqtt REQUIRED)
aws_use_package(aws-c-auth REQUIRED)
aws_use_package(aws-checksums REQUIRED)
aws_use_package(aws-c-event-stream REQUIRED)
target_link_libraries(${PROJECT_NAME} PRIVATE ${CMAKE_JS_LIB} ${DEP_AWS_LIBS})

set(destination bin/${CMAKE_JS_PLATFORM}-${NODE_ARCH}-${AWS_C_RUNTIME})
install(FILES "${CMAKE_CURRENT_BINARY_DIR}/${CMAKE_BUILD_TYPE}/aws-crt-nodejs.node"
    DESTINATION ${destination})
