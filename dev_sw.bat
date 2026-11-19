@echo off
chcp 65001 >nul
setlocal
pushd "%~dp0" || exit /b 1
where bun >nul 2>&1
if errorlevel 1 (
  echo Bun was not found. Install Bun and reopen this script.
  set "exitCode=1"
  goto :finish
)
if "%~1"=="" (
  call bun run dev:static:watch
) else (
  call bun run dev:static:watch -- %*
)
set "exitCode=%errorlevel%"
:finish
popd
if not "%exitCode%"=="0" pause
exit /b %exitCode%
