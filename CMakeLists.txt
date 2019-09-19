cmake_minimum_required(VERSION 3.1)

option(BUILD_DEPS "Builds aws common runtime dependencies as part of build, only do this if you don't want to control your dependency chain." ON)

if (UNIX AND NOT APPLE)
    include(GNUInstallDirs)
elseif(NOT DEFINED CMAKE_INSTALL_LIBDIR)
    set(CMAKE_INSTALL_LIBDIR "lib")
endif()

if (${CMAKE_INSTALL_LIBDIR} STREQUAL "lib64")
    set(FIND_LIBRARY_USE_LIB64_PATHS true)
endif()

if (BUILD_DEPS)
    set(AWS_DEPS_BUILD_DIR ${CMAKE_CURRENT_BINARY_DIR}/deps CACHE STRING "If BUILD_DEPS is on, aws common runtime dependencies build in this directory.")
    set(AWS_DEPS_INSTALL_DIR ${CMAKE_CURRENT_BINARY_DIR}/deps/install)

    list(APPEND CMAKE_PREFIX_PATH ${AWS_DEPS_INSTALL_DIR})

    message(STATUS "AWS Common Runtime is installing to: ${AWS_DEPS_INSTALL_DIR}")

    string(REPLACE ";" "|" CMAKE_PREFIX_PATH_BAR "${CMAKE_PREFIX_PATH}")
    message(STATUS "ROOT prefix path: ${CMAKE_PREFIX_PATH}")

    file(MAKE_DIRECTORY ${AWS_DEPS_BUILD_DIR})
    execute_process(
            COMMAND ${CMAKE_COMMAND} -G ${CMAKE_GENERATOR}
            -DTARGET_ARCH=${TARGET_ARCH}
            -DCMAKE_TOOLCHAIN_FILE=${CMAKE_TOOLCHAIN_FILE}
            -DCMAKE_BUILD_TYPE=${CMAKE_BUILD_TYPE}
            -DBUILD_SHARED_LIBS=${BUILD_SHARED_LIBS}
            -DCMAKE_PREFIX_PATH=${CMAKE_PREFIX_PATH_BAR}
            -DCMAKE_INSTALL_PREFIX=${AWS_DEPS_INSTALL_DIR}
            -DCMAKE_RUNTIME_OUTPUT_DIRECTORY=${CMAKE_CURRENT_BINARY_DIR}/bin
            -DCMAKE_C_FLAGS=${CMAKE_C_FLAGS}
            ${CMAKE_CURRENT_SOURCE_DIR}/aws-common-runtime
            WORKING_DIRECTORY ${AWS_DEPS_BUILD_DIR}
            RESULT_VARIABLE BUILD_AWSCRT_EXIT_CODE
    )

    if (NOT ${BUILD_AWSCRT_EXIT_CODE} EQUAL 0)
        message(FATAL_ERROR "Failed to configure aws crt libraries.")
    endif()
    execute_process(COMMAND ${CMAKE_COMMAND} --build ${AWS_DEPS_BUILD_DIR} --config ${CMAKE_BUILD_TYPE}
            RESULT_VARIABLE BUILD_AWSCRT_EXIT_CODE)

    if (NOT ${BUILD_AWSCRT_EXIT_CODE} EQUAL 0)
        message(FATAL_ERROR "Failed to build aws crt libraries.")
    endif()
    message(STATUS "AWS Common Runtime is installed at: ${AWS_DEPS_INSTALL_DIR}")

    #the following two lines are done in this branch intentionally, don't move it. project() does some magic that
    #we don't want happening until we're done with the above code.
    list(APPEND CMAKE_PREFIX_PATH "${AWS_DEPS_INSTALL_DIR}")

    project(aws-crt-nodejs C)

else()
    #the following two lines are done in this branch intentionally, don't move it. project() does some magic that
    #we want happening exactly right now.
    project(aws-crt-nodejs C)

endif()

if (POLICY CMP0069)
    cmake_policy(SET CMP0069 NEW) # Enable LTO/IPO if available in the compiler, see AwsCFlags
endif()

set(CMAKE_INSTALL_PREFIX "${CMAKE_CURRENT_SOURCE_DIR}/dist")
list(APPEND CMAKE_MODULE_PATH "${CMAKE_PREFIX_PATH}/${CMAKE_INSTALL_LIBDIR}/cmake")

include(AwsCFlags)
include(AwsSharedLibSetup)
include(AwsSanitizers)

file(GLOB AWS_CRT_SRC
       "source/*.c"
)

add_library(${CMAKE_PROJECT_NAME} SHARED ${AWS_CRT_SRC})
aws_set_common_properties(${CMAKE_PROJECT_NAME})
aws_prepare_symbol_visibility_args(${CMAKE_PROJECT_NAME} "AWS_CRT_NODEJS")
aws_add_sanitizers(${CMAKE_PROJECT_NAME})

# Gives our library file a .node extension without any "lib" prefix
set_target_properties(${PROJECT_NAME} PROPERTIES PREFIX "" SUFFIX ".node")

target_include_directories(${CMAKE_PROJECT_NAME} PRIVATE
        $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include>
        $<INSTALL_INTERFACE:include>
        ${CMAKE_JS_INC})

find_package(aws-c-http REQUIRED)
find_package(aws-c-mqtt REQUIRED)
find_package(aws-c-auth REQUIRED)
target_link_libraries(${CMAKE_PROJECT_NAME} PRIVATE ${CMAKE_JS_LIB} AWS::aws-c-auth AWS::aws-c-http AWS::aws-c-mqtt)

install(FILES "${CMAKE_CURRENT_BINARY_DIR}/${CMAKE_BUILD_TYPE}/aws-crt-nodejs.node"
    DESTINATION "native")
