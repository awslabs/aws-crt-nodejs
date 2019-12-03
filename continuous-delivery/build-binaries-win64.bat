npm install || goto error

:error
echo Failed with error #%errorlevel%.
exit /b %errorlevel%
