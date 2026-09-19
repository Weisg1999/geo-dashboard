@echo off
title Build GeoDash v2 Single-File
cd /d "%~dp0"

where python >nul 2>nul
if not errorlevel 1 (
  python tools\build-singlefile.py
  goto :end
)
where py >nul 2>nul
if not errorlevel 1 (
  py tools\build-singlefile.py
  goto :end
)
echo Python not found. Install Python 3 or run manually:
echo   node node_modules\.bin\esbuild js\dash\main.js --bundle --format=iife --minify --outfile=.build\bundle.js
echo   python tools\build-singlefile.py

:end
echo.
pause
