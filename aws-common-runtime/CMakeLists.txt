cmake_minimum_required(VERSION 3.1)

project(aws-crt)
list(APPEND CMAKE_MODULE_PATH "${PROJECT_SOURCE_DIR}/cmake")

if(NOT CMAKE_BUILD_TYPE)
    set(CMAKE_BUILD_TYPE Release)
endif()

include(ExternalProject)

set(AWS_DEPS_INSTALL_DIR "${CMAKE_INSTALL_PREFIX}" CACHE PATH "Dependencies install directory.")
set(AWS_DEPS_BIN_DIR "${AWS_DEPS_INSTALL_DIR}/bin" CACHE PATH "Dependencies binary install directory.")
set(AWS_DEPS_LIB_DIR "${AWS_DEPS_INSTALL_DIR}/lib" CACHE PATH "Dependencies library install directory.")
set(AWS_DEPS_BUILD_DIR "${CMAKE_BINARY_DIR}/build" CACHE PATH "Dependencies build directory.")

set(AWS_C_COMMON_DIR "${CMAKE_CURRENT_SOURCE_DIR}/aws-c-common")
include(BuildAwsCCommon)

if (UNIX AND NOT APPLE)
    set(S2N_DIR "${CMAKE_CURRENT_SOURCE_DIR}/s2n")
    include(BuildS2N)
endif()

set(AWS_C_IO_DIR "${CMAKE_CURRENT_SOURCE_DIR}/aws-c-io")
include(BuildAwsCIO)

set(AWS_C_COMPRESSION_DIR "${CMAKE_CURRENT_SOURCE_DIR}/aws-c-compression")
include(BuildAwsCCompression)

set(AWS_C_HTTP_DIR "${CMAKE_CURRENT_SOURCE_DIR}/aws-c-http")
include(BuildAwsCHttp)

set(AWS_C_MQTT_DIR "${CMAKE_CURRENT_SOURCE_DIR}/aws-c-mqtt")
include(BuildAwsCMqtt)

set(AWS_C_CAL_DIR "${CMAKE_CURRENT_SOURCE_DIR}/aws-c-cal")
include(BuildAwsCCal)

set(AWS_C_AUTH_DIR "${CMAKE_CURRENT_SOURCE_DIR}/aws-c-auth")
include(BuildAwsCAuth)

add_dependencies(AwsCCompression AwsCCommon)
add_dependencies(AwsCMqtt AwsCHttp)
add_dependencies(AwsCHttp AwsCIO AwsCCompression)
add_dependencies(AwsCCal AwsCCommon)
add_dependencies(AwsCAuth AwsCHttp AwsCCal)
add_dependencies(AwsCIO AwsCCommon)

if (UNIX AND NOT APPLE)
    add_dependencies(AwsCIO S2N)
endif()

