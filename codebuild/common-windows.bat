
@echo off

@setlocal enableextensions enabledelayedexpansion

pushd %~dp0\..

cd %CODEBUILD_SRC_DIR%
npm run build || goto error

popd
@endlocal
goto :EOF

:error
popd
@endlocal
echo Failed with error #%errorlevel%.
exit /b %errorlevel%
