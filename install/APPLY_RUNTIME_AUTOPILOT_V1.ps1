$ErrorActionPreference = 'Stop'
$Raw = 'https://raw.githubusercontent.com/erishnjoroge-cmd/Kemist-dashboard/main'
$TargetDir = Join-Path $env:LOCALAPPDATA 'Kemist\Autopilot'
$Worker = Join-Path $TargetDir 'KEMIST_RUNTIME_AUTOPILOT_V1.ps1'
$TaskName = 'Kemist Runtime Autopilot V1'
New-Item -ItemType Directory -Force -Path $TargetDir | Out-Null

Write-Host ''
Write-Host '============================================================' -ForegroundColor Cyan
Write-Host ' KEMIST RUNTIME AUTOPILOT V1' -ForegroundColor Cyan
Write-Host '============================================================'
Write-Host 'Keeps live refresh/settlement workers moving without marking failed data as fresh.'
Write-Host 'No model thresholds, picks, grades, CLAW, Precision, RTL or 2/2 rules are changed.'
Write-Host ''

$Url = "$Raw/install/KEMIST_RUNTIME_AUTOPILOT_V1.ps1?build=20261014-autopilot1"
Invoke-WebRequest -Uri $Url -OutFile $Worker -UseBasicParsing -TimeoutSec 30
Write-Host '[1/4] Autopilot worker downloaded.' -ForegroundColor Green

$errors = $null
[void][System.Management.Automation.Language.Parser]::ParseFile($Worker,[ref]$null,[ref]$errors)
if ($errors.Count -gt 0) { throw 'Autopilot worker PowerShell parse failed.' }
Write-Host '[2/4] Worker syntax verified.' -ForegroundColor Green

$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ("-NoLogo -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"{0}`"" -f $Worker)
$trigger = New-ScheduledTaskTrigger -Once -At ((Get-Date).AddMinutes(1)) -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration ([TimeSpan]::MaxValue)
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
Write-Host '[3/4] Hidden 5-minute Runtime Autopilot scheduled.' -ForegroundColor Green

& powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File $Worker
Start-Sleep -Seconds 2
$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop
Write-Host ("[4/4] First pass complete. Task state: {0}" -f $task.State) -ForegroundColor Green
Write-Host ''
Write-Host 'RUNTIME AUTOPILOT V1 IS LIVE.' -ForegroundColor Green
Write-Host 'If providers fail, Kemist will remain stale rather than pretending data is fresh.' -ForegroundColor Yellow
Write-Host ("Log: {0}" -f (Join-Path $TargetDir 'runtime_autopilot.log')) -ForegroundColor DarkGray
Read-Host 'Press Enter to close'
