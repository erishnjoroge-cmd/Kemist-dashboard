@echo off
setlocal
title KEMIST LEARNING LOOP RESCUE V1
set "KEMIST_PS1=%TEMP%\KEMIST_APPLY_LEARNING_LOOP_RESCUE_V1.ps1"
set "KEMIST_PS1_URL=https://raw.githubusercontent.com/erishnjoroge-cmd/Kemist-dashboard/main/install/APPLY_LEARNING_LOOP_RESCUE_V1.ps1"

echo Downloading Kemist Learning Loop Rescue V1 from GitHub...
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
  echo LEARNING LOOP RESCUE FAILED - window will remain open.
  pause
  exit /b 1
)
