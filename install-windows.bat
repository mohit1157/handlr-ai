@echo off
title Handlr AI Installer
echo.
echo ============================================
echo    HANDLR AI — Windows Installer
echo ============================================
echo.

:: Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo Node.js is not installed!
    echo.
    echo Please install Node.js from: https://nodejs.org
    echo Download the LTS version, install it, then run this script again.
    echo.
    pause
    exit /b 1
)

:: Check Node version
for /f "tokens=1 delims=v" %%a in ('node -v') do set NODE_VER=%%a
echo Found Node.js: %NODE_VER%

:: Check if Chrome is installed
set CHROME_FOUND=0
if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" set CHROME_FOUND=1
if exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" set CHROME_FOUND=1
if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" set CHROME_FOUND=1

if %CHROME_FOUND% equ 0 (
    echo.
    echo WARNING: Google Chrome not found!
    echo Browser automation requires Chrome. Install from: https://google.com/chrome
    echo.
)

:: Run setup wizard
echo.
echo Starting setup wizard...
echo.
node setup.js

pause
