set AWS_CRT_WINDOWS_SDK_VERSION=10.0.17763.0

npm install || goto error

:error
echo Failed with error #%errorlevel%.
exit /b %errorlevel%
