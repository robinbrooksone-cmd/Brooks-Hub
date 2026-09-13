@echo off
REM Double-click this to start the tracker (Windows).
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node isn't installed. Get it from https://nodejs.org ^(the LTS button^),
  echo   then double-click this file again.
  echo.
  pause
  exit /b 1
)

if "%PORT%"=="" set PORT=3100
start "" "http://127.0.0.1:%PORT%"
node server.js
pause
