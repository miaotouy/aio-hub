@echo off
chcp 65001 >nul
setlocal
pushd "%~dp0" || exit /b 1
where bun >nul 2>&1
if errorlevel 1 (
  echo Bun was not found. Install Bun and reopen this script.
  pause
  popd
  exit /b 1
)
call bun run electron:dev %*
set "exitCode=%errorlevel%"
popd
if not "%exitCode%"=="0" pause
exit /b %exitCode%
