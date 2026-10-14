@echo off
setlocal
title KEMIST RUNTIME AUTOPILOT V1
set "KEMIST_PS1=%TEMP%\KEMIST_APPLY_RUNTIME_AUTOPILOT_V1.ps1"
set "KEMIST_PS1_URL=https://raw.githubusercontent.com/erishnjoroge-cmd/Kemist-dashboard/main/install/APPLY_RUNTIME_AUTOPILOT_V1.ps1?build=20261014-autopilot1"

echo Downloading Kemist Runtime Autopilot V1 from GitHub...
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "try { Invoke-WebRequest -Uri '%KEMIST_PS1_URL%' -OutFile '%KEMIST_PS1%' -UseBasicParsing -TimeoutSec 30; exit 0 } catch { Write-Host $_.Exception.Message -ForegroundColor Red; exit 1 }"
if errorlevel 1 (
  echo.
  echo DOWNLOAD FAILED - nothing was changed.
  pause
  exit /b 1
)
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%KEMIST_PS1%"
if errorlevel 1 (
  echo.
  echo RUNTIME AUTOPILOT INSTALL FAILED - window will remain open.
  pause
  exit /b 1
)
