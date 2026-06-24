@echo off
setlocal

cd /d "D:\GitHub\ARCH-PORTFOLIO"
cls

echo ==================================================
echo   Architectural Center - Local Website Server
echo ==================================================
echo.
echo Website running at http://localhost:8000
echo Press CTRL + C to stop the server.
echo.

where python >nul 2>&1
if not errorlevel 1 (
    echo Starting server with Python...
    start "" "http://localhost:8000"
    python -m http.server 8000
    goto server_stopped
)

where py >nul 2>&1
if not errorlevel 1 (
    echo Starting server with the Python launcher...
    start "" "http://localhost:8000"
    py -m http.server 8000
    goto server_stopped
)

echo ERROR: Python was not found.
echo Install Python, then run this file again.
echo.
pause
exit /b 1

:server_stopped
echo.
echo The local website server has stopped.
pause
