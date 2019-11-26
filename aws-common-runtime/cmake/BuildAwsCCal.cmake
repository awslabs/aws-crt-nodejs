if("${TARGET_ARCH}" STREQUAL ANDROID)
    ExternalProject_Add(AwsCCal
            PREFIX ${AWS_DEPS_BUILD_DIR}
            DOWNLOAD_COMMAND ""
            SOURCE_DIR ${AWS_C_CAL_DIR}
            BUILD_IN_SOURCE 0
            LIST_SEPARATOR |
            UPDATE_COMMAND ""
            CMAKE_ARGS
            -DCMAKE_INSTALL_PREFIX=${AWS_DEPS_INSTALL_DIR}
            -DCMAKE_BUILD_TYPE=${CMAKE_BUILD_TYPE}
            -DBUILD_SHARED_LIBS=${BUILD_SHARED_LIBS}
            -DCMAKE_TOOLCHAIN_FILE=${CMAKE_TOOLCHAIN_FILE}
            -DANDROID_NATIVE_API_LEVEL=${ANDROID_NATIVE_API_LEVEL}
            -DANDROID_ABI=${ANDROID_ABI}
            -DANDROID_TOOLCHAIN_NAME=${ANDROID_TOOLCHAIN_NAME}
            -DANDROID_STANDALONE_TOOLCHAIN=${ANDROID_STANDALONE_TOOLCHAIN}
            -DANDROID_STL=${ANDROID_STL}
            -DENABLE_HW_OPTIMIZATION=OFF
            -DCMAKE_C_FLAGS=${CMAKE_C_FLAGS}
            -DBUILD_TESTING=OFF
            )
elseif(MSVC)
    ExternalProject_Add(AwsCCal
            PREFIX ${AWS_DEPS_BUILD_DIR}
            DOWNLOAD_COMMAND ""
            SOURCE_DIR ${AWS_C_CAL_DIR}
            BUILD_IN_SOURCE 0
            LIST_SEPARATOR |
            UPDATE_COMMAND ""
            CMAKE_ARGS
            -DCMAKE_INSTALL_PREFIX=${AWS_DEPS_INSTALL_DIR}
            -DCMAKE_BUILD_TYPE=${CMAKE_BUILD_TYPE}
            -DBUILD_SHARED_LIBS=${BUILD_SHARED_LIBS}
            -DCMAKE_TOOLCHAIN_FILE=${CMAKE_TOOLCHAIN_FILE}
            -DCMAKE_RUNTIME_OUTPUT_DIRECTORY=${CMAKE_RUNTIME_OUTPUT_DIRECTORY}
            -DCMAKE_C_FLAGS=${CMAKE_C_FLAGS}
            -DBUILD_TESTING=OFF
            )
else()
    ExternalProject_Add(AwsCCal
            PREFIX ${AWS_DEPS_BUILD_DIR}
            DOWNLOAD_COMMAND ""
            SOURCE_DIR ${AWS_C_CAL_DIR}
            BUILD_IN_SOURCE 0
            LIST_SEPARATOR |
            CMAKE_ARGS
            -DCMAKE_PREFIX_PATH=${CMAKE_PREFIX_PATH}
            -DCMAKE_INSTALL_PREFIX=${AWS_DEPS_INSTALL_DIR}
            -DCMAKE_BUILD_TYPE=${CMAKE_BUILD_TYPE}
            -DBUILD_SHARED_LIBS=${BUILD_SHARED_LIBS}
            -DCMAKE_TOOLCHAIN_FILE=${CMAKE_TOOLCHAIN_FILE}
            -DCMAKE_C_FLAGS=${CMAKE_C_FLAGS}
            -DBUILD_TESTING=OFF
            )
endif()
