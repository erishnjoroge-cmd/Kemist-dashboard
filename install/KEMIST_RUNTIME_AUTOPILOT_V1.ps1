$ErrorActionPreference = 'SilentlyContinue'
$Port = 8790
$Base = "http://127.0.0.1:$Port"
$LogDir = Join-Path $env:LOCALAPPDATA 'Kemist\Autopilot'
$Log = Join-Path $LogDir 'runtime_autopilot.log'
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

function Log([string]$Message) {
  $line = "{0} {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message
  Add-Content -LiteralPath $Log -Value $line
}
function GetJson([string]$Url,[int]$Timeout=5) {
  try { return Invoke-RestMethod -Uri $Url -Method Get -TimeoutSec $Timeout -Proxy $null } catch { return $null }
}
function PostJson([string]$Url,[int]$Timeout=120) {
  try { return Invoke-RestMethod -Uri $Url -Method Post -TimeoutSec $Timeout -Proxy $null } catch { return $null }
}
function AgeMinutes($Value) {
  try {
    if (-not $Value) { return 999999 }
    $dt = [DateTimeOffset]::Parse([string]$Value)
    return ([DateTimeOffset]::Now - $dt).TotalMinutes
  } catch { return 999999 }
}

$health = GetJson "$Base/api/health" 4
if (-not $health -or -not $health.ok) {
  Log 'health unavailable; no freshness is fabricated'
  exit 0
}

$weekly = GetJson "$Base/api/weekly-validation" 6
$learning = GetJson "$Base/api/projection/learning" 6

$needsSports = $false
if (-not $weekly) {
  $needsSports = $true
} else {
  $fresh = $weekly.command_center.pipeline_freshness
  if ($fresh) {
    $multiAge = AgeMinutes $fresh.multisport_timestamp
    if ($multiAge -gt 8) { $needsSports = $true }
  }
  if (($weekly.command_center.funnel.projected -as [int]) -eq 0) { $needsSports = $true }
}

if ($needsSports) {
  $sports = PostJson "$Base/api/sports/run" 180
  if ($sports) { Log 'multisport refresh requested successfully' }
  else { Log 'multisport refresh returned no JSON; source remains honestly stale' }
}

# Recompute the command center after any provider refresh. This never forces a candidate to qualify.
$recalc = PostJson "$Base/api/weekly-validation/run" 90
if ($recalc) { Log 'weekly validation recomputed' }

# Drain verified-result backlog opportunistically without changing any grades.
if ($learning -and ([int]($learning.awaiting_result_n)) -gt 0) {
  $resultRun = PostJson "$Base/api/results/run?force=1" 180
  if ($resultRun) { Log ("results pass requested; awaiting_before={0}" -f $learning.awaiting_result_n) }
}

$after = GetJson "$Base/api/weekly-validation" 6
if ($after) {
  $f = $after.command_center.funnel
  Log ("funnel observed={0} projected={1} claw={2} pairable={3} legal={4}" -f $f.observed_markets,$f.projected,$f.claw_open,$f.pairable,$f.legal_pairs)
}
