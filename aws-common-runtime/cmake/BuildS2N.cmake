if("${TARGET_ARCH}" STREQUAL ANDROID)
    ExternalProject_Add(S2N
            PREFIX ${AWS_DEPS_BUILD_DIR}
            DOWNLOAD_COMMAND ""
            SOURCE_DIR ${S2N_DIR}
            BUILD_IN_SOURCE 0
            LIST_SEPARATOR |
            UPDATE_COMMAND ""
            CMAKE_ARGS
            -DCMAKE_INSTALL_PREFIX=${AWS_DEPS_INSTALL_DIR}
            -DCMAKE_PREFIX_PATH=${CMAKE_PREFIX_PATH}
            -DCMAKE_BUILD_TYPE=${CMAKE_BUILD_TYPE}
            -DBUILD_SHARED_LIBS=${BUILD_SHARED_LIBS}
            -DCMAKE_TOOLCHAIN_FILE=${CMAKE_TOOLCHAIN_FILE}
            -DANDROID_NATIVE_API_LEVEL=${ANDROID_NATIVE_API_LEVEL}
            -DANDROID_ABI=${ANDROID_ABI}
            -DANDROID_TOOLCHAIN_NAME=${ANDROID_TOOLCHAIN_NAME}
            -DANDROID_STANDALONE_TOOLCHAIN=${ANDROID_STANDALONE_TOOLCHAIN}
            -DANDROID_STL=${ANDROID_STL}
            -DCMAKE_C_FLAGS=${CMAKE_C_FLAGS}
            -DBUILD_TESTING=OFF
            -DUSE_S2N_PQ_CRYPTO=OFF
            )
else()
    ExternalProject_Add(S2N
            PREFIX ${AWS_DEPS_BUILD_DIR}
            DOWNLOAD_COMMAND ""
            SOURCE_DIR ${S2N_DIR}
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
