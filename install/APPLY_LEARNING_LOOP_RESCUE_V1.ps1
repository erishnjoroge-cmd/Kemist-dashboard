$ErrorActionPreference = 'Stop'
$Raw = 'https://raw.githubusercontent.com/erishnjoroge-cmd/Kemist-dashboard/main'
$Port = 8790
$ExpectedServer = '76eca41a98bb378b0f94aac002d48c3a8404b8d38f3e319a897cd126bd8719ee'
$ExpectedResultsBefore = '5d2f0a1037466876eb3d1478a3a05bedcbe69545b9a5210fc598c7ab39d68855'
$ExpectedResultsAfter = '1734d20352f4193ba00fbe6006369f3fca2e5602ee4a9f33d8f75a756c5bcca9'

function Hash([string]$Path) { return (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash.ToLowerInvariant() }
function ReadSafe([string]$Path) { try { if (Test-Path -LiteralPath $Path) { return (Get-Content -LiteralPath $Path -Raw -ErrorAction Stop) } } catch {} return '' }
function ListenerPid([int]$PortNumber) { try { $x = Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort $PortNumber -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; if ($x) { return [int]$x.OwningProcess } } catch {} return $null }
function JsonGet([string]$Url,[int]$Seconds=5) { try { return Invoke-RestMethod -Uri $Url -Method Get -TimeoutSec $Seconds -Proxy $null } catch { return $null } }
function JsonPost([string]$Url,[int]$Seconds=180) { try { return Invoke-RestMethod -Uri $Url -Method Post -TimeoutSec $Seconds -Proxy $null } catch { return $null } }

Write-Host ''
Write-Host '============================================================' -ForegroundColor Cyan
Write-Host ' KEMIST LEARNING LOOP RESCUE V1.2' -ForegroundColor Cyan
Write-Host '============================================================'
Write-Host 'Repairs the stuck Results -> Projection Learning settlement path.'
Write-Host 'Uses a versioned rescue patch path to avoid stale raw GitHub caching.'
Write-Host 'No projection thresholds, CLAW rules, RTL rules, or 2/2 rules are changed.'
Write-Host ''

$beforeLearning = JsonGet "http://127.0.0.1:$Port/api/projection/learning" 4
if ($beforeLearning) {
  Write-Host ("Before: verified N {0} | current-engine N {1} | awaiting result {2}" -f $beforeLearning.verified_market_n,$beforeLearning.current_engine_n,$beforeLearning.awaiting_result_n) -ForegroundColor DarkGray
}

$roots = @(
  (Join-Path $env:LOCALAPPDATA 'Kemist'),
  (Join-Path $env:USERPROFILE 'Downloads'),
  (Join-Path $env:USERPROFILE 'Desktop'),
  (Join-Path $env:USERPROFILE 'Documents'),
  (Join-Path $env:USERPROFILE 'OneDrive')
) | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -Unique

$candidates = @()
foreach ($base in $roots) {
  Write-Host "Searching $base ..." -ForegroundColor DarkGray
  Get-ChildItem -LiteralPath $base -Filter 'server.mjs' -File -Recurse -ErrorAction SilentlyContinue | ForEach-Object {
    try {
      if ((Hash $_.FullName) -ne $ExpectedServer) { return }
      $root = $_.Directory.FullName
      $score = 0
      if ($root -notmatch '(?i)backup|old|archive') { $score += 25 }
      if (Test-Path -LiteralPath (Join-Path $root 'START_KEMIST.ps1')) { $score += 20 }
      if ((ReadSafe (Join-Path $root 'data\canonical_runtime.txt')) -match 'Port=8790') { $score += 100 }
      if ((ReadSafe (Join-Path $root 'data\runtime_port.txt')).Trim() -eq '8790') { $score += 50 }
      $candidates += [pscustomobject]@{ Root=$root; Server=$_.FullName; Score=$score; Write=$_.LastWriteTime }
    } catch {}
  }
}
if (-not $candidates) { throw 'SAFETY STOP: exact recovered Production runtime not found. Nothing changed.' }
$pick = $candidates | Sort-Object Score,Write -Descending | Select-Object -First 1
if ($pick.Score -lt 45) { throw "SAFETY STOP: live-root confidence too low ($($pick.Score))." }
$Root = $pick.Root
$Results = Join-Path $Root 'results_lab.mjs'
if (-not (Test-Path -LiteralPath $Results)) { throw 'results_lab.mjs missing.' }
$resultsHash = Hash $Results
if ($resultsHash -ne $ExpectedResultsBefore -and $resultsHash -ne $ExpectedResultsAfter) { throw "SAFETY STOP: results_lab.mjs fingerprint mismatch: $resultsHash" }
Write-Host "[1/7] Exact runtime: $Root" -ForegroundColor Green

$patch = Join-Path $env:TEMP 'KEMIST_projection_settlement_rescue_v1_2.mjs'
$patchUrl = "$Raw/patches/projection_settlement_rescue_v1_2.mjs?build=20261014-v12"
Invoke-WebRequest -Uri $patchUrl -OutFile $patch -UseBasicParsing -TimeoutSec 30
Write-Host '[2/7] Versioned settlement rescue patch V1.2 downloaded.' -ForegroundColor Green

$listener = ListenerPid $Port
if ($listener) {
  $p = Get-CimInstance Win32_Process -Filter "ProcessId=$listener" -ErrorAction SilentlyContinue
  if ($p -and $p.Name -eq 'node.exe' -and [string]$p.CommandLine -match 'server\.mjs') {
    Stop-Process -Id $listener -Force -ErrorAction Stop
    Start-Sleep -Milliseconds 700
  } else { throw "SAFETY STOP: port $Port belongs to a non-Kemist process." }
}
Write-Host '[3/7] Runtime safely stopped.' -ForegroundColor Green

$nodeCmd = Get-Command node.exe -ErrorAction SilentlyContinue
if (-not $nodeCmd) { $nodeCmd = Get-Command node -ErrorAction SilentlyContinue }
if (-not $nodeCmd) { throw 'Node.js not found.' }
$node = $nodeCmd.Source
& $node $patch $Results
if ($LASTEXITCODE -ne 0) { throw 'Projection Settlement Rescue V1.2 patch failed.' }
if ((Hash $Results) -ne $ExpectedResultsAfter) { throw "SAFETY STOP: final Results Lab hash unexpected: $(Hash $Results)" }
& $node --check $Results
if ($LASTEXITCODE -ne 0) { throw 'results_lab.mjs syntax check failed.' }
Write-Host '[4/7] Results Lab rescue installed and syntax verified.' -ForegroundColor Green

$starter = Join-Path $Root 'START_KEMIST.ps1'
if (-not (Test-Path -LiteralPath $starter)) { throw 'START_KEMIST.ps1 missing.' }
& powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File $starter
if ($LASTEXITCODE -ne 0) { throw 'Kemist restart failed.' }
$health = $null
for ($i=0; $i -lt 80; $i++) {
  Start-Sleep -Milliseconds 500
  $health = JsonGet "http://127.0.0.1:$Port/api/health" 2
  if ($health -and $health.ok) { break }
}
if (-not $health -or -not $health.ok) { throw 'Kemist health did not verify after restart.' }
Write-Host '[5/7] Runtime health verified.' -ForegroundColor Green

Write-Host '[6/7] Running one forced Results settlement pass (up to 50 due items)...' -ForegroundColor Yellow
$resultRun = JsonPost "http://127.0.0.1:$Port/api/results/run?force=1" 240
if (-not $resultRun) { Write-Host '      Results run timed out or returned no JSON; worker will continue automatically.' -ForegroundColor Yellow }
else { Write-Host ("      attempted {0} | settled {1} | pending {2}" -f $resultRun.attempted,$resultRun.summary.settled_markets,$resultRun.summary.pending_results) -ForegroundColor Cyan }

Start-Sleep -Seconds 2
$afterLearning = JsonGet "http://127.0.0.1:$Port/api/projection/learning" 8
$queueFile = Join-Path $Root 'data\results_lab\settlement_queue.json'
$rescueQueued = $null
if (Test-Path -LiteralPath $queueFile) {
  try { $q = Get-Content -LiteralPath $queueFile -Raw | ConvertFrom-Json; $rescueQueued = $q.projection_settlement_rescue.queued_or_refreshed } catch {}
}
Write-Host '[7/7] Learning loop re-read.' -ForegroundColor Green
if ($afterLearning) {
  Write-Host ("      verified N {0} | current-engine N {1} | awaiting result {2} | current hit rate {3:P1}" -f $afterLearning.verified_market_n,$afterLearning.current_engine_n,$afterLearning.awaiting_result_n,$afterLearning.current_engine_hit_rate) -ForegroundColor Cyan
}
if ($null -ne $rescueQueued) { Write-Host ("      projection settlement rescue queued/refreshed: {0}" -f $rescueQueued) -ForegroundColor Cyan }
Write-Host ''
Write-Host 'LEARNING LOOP RESCUE V1.2 IS LIVE.' -ForegroundColor Green
Write-Host 'The old 45.5% number will change only when newly rescued games settle; it is not overwritten or fabricated.' -ForegroundColor Yellow
Write-Host 'Results worker remains on and will keep processing the rescued backlog.' -ForegroundColor Yellow
Start-Process "http://127.0.0.1:$Port/"
Read-Host 'Press Enter to close'
