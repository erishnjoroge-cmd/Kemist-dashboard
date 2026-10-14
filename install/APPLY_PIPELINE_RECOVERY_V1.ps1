$ErrorActionPreference='Stop'
$Raw='https://raw.githubusercontent.com/erishnjoroge-cmd/Kemist-dashboard/main'
$Port=8790
$ExpectedServerBefore='13e8d695c736e5ee533a01f122f5fd317745aecd9b361fdabab15852d1ce931b'
$ExpectedServerAfter='76eca41a98bb378b0f94aac002d48c3a8404b8d38f3e319a897cd126bd8719ee'
$ExpectedWeeklyBefore='ca2e411e8d5b802c455747862e94b49267469749fcbc22be2de96269107eb3e8'
$ExpectedWeeklyAfter='2a9246953f79df5295f390172638fcc8f03ded40c9cee1b90b32cf82a5686576'

function Hash([string]$p){(Get-FileHash -Algorithm SHA256 -LiteralPath $p).Hash.ToLowerInvariant()}
function ReadSafe([string]$p){try{if(Test-Path -LiteralPath $p){return(Get-Content -LiteralPath $p -Raw -ErrorAction Stop)}}catch{};return''}
function ListenerPid([int]$p){try{$x=Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort $p -State Listen -ErrorAction SilentlyContinue|Select-Object -First 1;if($x){return[int]$x.OwningProcess}}catch{};return$null}
function JsonGet([string]$u,[int]$seconds=4){try{return Invoke-RestMethod -Uri $u -Method Get -TimeoutSec $seconds -Proxy $null}catch{return$null}}
function JsonPost([string]$u,[int]$seconds=90){try{return Invoke-RestMethod -Uri $u -Method Post -TimeoutSec $seconds -Proxy $null}catch{return$null}}

Write-Host ''
Write-Host '============================================================' -ForegroundColor Cyan
Write-Host ' KEMIST PIPELINE RECOVERY V1' -ForegroundColor Cyan
Write-Host '============================================================'
Write-Host 'Fixes internal dead lanes without pretending external data exists.'
Write-Host 'Backups first. No bet is placed by this installer.'
Write-Host ''

$roots=@((Join-Path $env:LOCALAPPDATA 'Kemist'),(Join-Path $env:USERPROFILE 'Downloads'),(Join-Path $env:USERPROFILE 'Desktop'),(Join-Path $env:USERPROFILE 'Documents'),(Join-Path $env:USERPROFILE 'OneDrive'))|Where-Object{$_ -and(Test-Path -LiteralPath $_)}|Select-Object -Unique
$candidates=@()
foreach($base in $roots){
  Write-Host "Searching $base ..." -ForegroundColor DarkGray
  Get-ChildItem -LiteralPath $base -Filter 'server.mjs' -File -Recurse -ErrorAction SilentlyContinue|ForEach-Object{
    try{
      $h=Hash $_.FullName;if($h-ne$ExpectedServerBefore-and$h-ne$ExpectedServerAfter){return}
      $root=$_.Directory.FullName;$score=0
      if($root-notmatch'(?i)backup|old|archive'){$score+=25}
      if(Test-Path -LiteralPath(Join-Path $root 'START_KEMIST.ps1')){$score+=20}
      if((ReadSafe(Join-Path $root 'data\canonical_runtime.txt'))-match'Port=8790'){$score+=100}
      if((ReadSafe(Join-Path $root 'data\runtime_port.txt')).Trim()-eq'8790'){$score+=50}
      $candidates+=[pscustomobject]@{Root=$root;Server=$_.FullName;Hash=$h;Score=$score;Write=$_.LastWriteTime}
    }catch{}
  }
}
if(-not$candidates){throw'SAFETY STOP: exact Forward-Lab Production runtime not found. Nothing changed.'}
$pick=$candidates|Sort-Object Score,Write -Descending|Select-Object -First 1
if($pick.Score-lt45){throw"SAFETY STOP: live-root confidence too low ($($pick.Score))."}
$Root=$pick.Root;$Server=$pick.Server;$Weekly=Join-Path $Root 'weekly_validation.mjs'
if(-not(Test-Path -LiteralPath $Weekly)){throw'weekly_validation.mjs missing.'}
$wh=Hash $Weekly;if($wh-ne$ExpectedWeeklyBefore-and$wh-ne$ExpectedWeeklyAfter){throw"SAFETY STOP: weekly_validation.mjs fingerprint mismatch: $wh"}
Write-Host "[1/8] Exact runtime: $Root" -ForegroundColor Green

$patch=Join-Path $env:TEMP 'KEMIST_recover_dead_areas_v1.mjs'
Invoke-WebRequest -Uri "$Raw/patches/recover_dead_areas_v1.mjs" -OutFile $patch -UseBasicParsing -TimeoutSec 30
Write-Host '[2/8] Verified recovery patch downloaded.' -ForegroundColor Green

$listener=ListenerPid $Port
if($listener){$p=Get-CimInstance Win32_Process -Filter "ProcessId=$listener" -ErrorAction SilentlyContinue;if($p-and$p.Name-eq'node.exe'-and[string]$p.CommandLine-match'server\.mjs'){Stop-Process -Id $listener -Force -ErrorAction Stop;Start-Sleep -Milliseconds 500}else{throw"SAFETY STOP: port $Port belongs to a non-Kemist process."}}
Write-Host '[3/8] Runtime safely stopped.' -ForegroundColor Green

$nodeCmd=Get-Command node.exe -ErrorAction SilentlyContinue;if(-not$nodeCmd){$nodeCmd=Get-Command node -ErrorAction SilentlyContinue};if(-not$nodeCmd){throw'Node.js not found.'};$node=$nodeCmd.Source
& $node $patch $Root;if($LASTEXITCODE-ne0){throw'Recovery patch failed.'}
Write-Host '[4/8] CLAW / funnel / watchdog recovery patch applied.' -ForegroundColor Green

foreach($f in @('server.mjs','weekly_validation.mjs')){& $node --check (Join-Path $Root $f);if($LASTEXITCODE-ne0){throw"Syntax check failed: $f"}}
Write-Host '[5/8] Syntax checks PASS.' -ForegroundColor Green

# Provider-cache rescue: preserve copies, then force fresh athlete/gamelog resolution on the next sports cycle.
$data=Join-Path $Root 'data\multisport_engine';$stamp=Get-Date -Format 'yyyyMMdd_HHmmss'
foreach($name in @('athlete_cache.json','gamelog_cache.json')){$f=Join-Path $data $name;if(Test-Path -LiteralPath $f){Copy-Item -LiteralPath $f -Destination ($f+'.before_pipeline_recovery_'+$stamp+'.bak') -Force;Remove-Item -LiteralPath $f -Force}}
Write-Host '[6/8] Provider caches backed up and reset for fresh resolution.' -ForegroundColor Green

$starter=Join-Path $Root 'START_KEMIST.ps1';if(-not(Test-Path -LiteralPath $starter)){throw'START_KEMIST.ps1 missing.'}
& powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File $starter;if($LASTEXITCODE-ne0){throw'Kemist restart failed.'}
$health=$null;$forward=$null
for($i=0;$i-lt80;$i++){Start-Sleep -Milliseconds 500;$health=JsonGet "http://127.0.0.1:$Port/api/health" 2;$forward=JsonGet "http://127.0.0.1:$Port/api/forward-lab/status" 2;if($health-and$health.ok-and$forward-and$forward.ok){break}}
if(-not$health-or-not$health.ok){throw'Health API did not verify after restart.'};if(-not$forward-or-not$forward.ok){throw'Forward Lab did not verify after restart.'}
Write-Host '[7/8] Runtime + Forward Lab verified.' -ForegroundColor Green

# Refresh provider projections, then recompute the 2/2 command center with the repaired CLAW lane.
$sports=JsonPost "http://127.0.0.1:$Port/api/sports/run" 120
$weekly=JsonPost "http://127.0.0.1:$Port/api/weekly-validation/run" 60
$summary=JsonGet "http://127.0.0.1:$Port/api/weekly-validation" 5
Write-Host '[8/8] Multi-Sport + 2/2 Command Center refreshed.' -ForegroundColor Green
if($summary){
  $f=$summary.command_center.funnel
  Write-Host ("      Observed {0} | Projected {1} | CLAW open {2} | Pairable {3} | Legal pairs {4}" -f $f.observed_markets,$f.projected,$f.claw_open,$f.pairable,$f.legal_pairs) -ForegroundColor Cyan
  Write-Host ("      Strict Precision open: {0}" -f $f.strict_precision_open) -ForegroundColor DarkGray
}
Write-Host ''
Write-Host 'PIPELINE RECOVERY V1 IS LIVE.' -ForegroundColor Green
Write-Host 'Important: CLAW qualification is a model filter, not a guaranteed win probability.' -ForegroundColor Yellow
Write-Host 'CS2 still requires a genuine independent projection provider; this installer does not fabricate one.' -ForegroundColor Yellow
Start-Process "http://127.0.0.1:$Port/"
Read-Host 'Press Enter to close'
