@echo off
title GeoDash v2 Dashboard
cd /d "%~dp0"

rem ---- If service is already running, just open the browser ----
powershell -NoProfile -Command "try{Invoke-WebRequest -UseBasicParsing http://localhost:8126/index.html -TimeoutSec 2|Out-Null;exit 0}catch{exit 1}"
if not errorlevel 1 (
  start "" "http://localhost:8126/index.html"
  echo Service already running - browser opened.
  ping -n 3 127.0.0.1 >nul
  exit /b 0
)

echo ==============================================
echo   GeoDash v2 - local server
echo   http://localhost:8126/index.html
echo   Close this window to stop the service.
echo   (Tip: GeoDash-v2-singlefile.html needs no server)
echo ==============================================

start "" "http://localhost:8126/index.html"

where python >nul 2>nul
if not errorlevel 1 (
  python -m http.server 8126
  goto :end
)
where py >nul 2>nul
if not errorlevel 1 (
  py -m http.server 8126
  goto :end
)
where node >nul 2>nul
if not errorlevel 1 (
  set "npm_config_cache=%~dp0..\.npm-cache"
  call npx --yes http-server -p 8126 -c-1
  goto :end
)
rem Fallback: built-in Windows PowerShell server (no Python/Node needed)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1" 8126

:end
