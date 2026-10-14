@echo off
setlocal
title KEMIST FORWARD LAB - GITHUB LIVE APPLY
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0APPLY_FORWARD_LAB_LIVE.ps1"
if errorlevel 1 (
  echo.
  echo INSTALL FAILED - window will remain open.
  pause
)
