$ErrorActionPreference='Stop'
$ExpectedBefore='eaec113ed4acb7bdabe4eb42664f2c3feb4ddb471b79ace7d6b395b9550b4c55'
$ExpectedAfter='13e8d695c736e5ee533a01f122f5fd317745aecd9b361fdabab15852d1ce931b'
$Raw='https://raw.githubusercontent.com/erishnjoroge-cmd/Kemist-dashboard/main'
$Port=8790

function Hash([string]$p){ (Get-FileHash -Algorithm SHA256 -LiteralPath $p).Hash.ToLowerInvariant() }
function ReadSafe([string]$p){ try{ if(Test-Path -LiteralPath $p){ return (Get-Content -LiteralPath $p -Raw -ErrorAction Stop) } }catch{}; return '' }
function ListenerPid([int]$p){ try{ $x=Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort $p -State Listen -ErrorAction SilentlyContinue|Select-Object -First 1; if($x){return [int]$x.OwningProcess} }catch{}; return $null }
function GetJson([string]$u,[int]$seconds=3){ try{ return Invoke-RestMethod -Uri $u -Method Get -TimeoutSec $seconds -Proxy $null }catch{return $null} }

Write-Host ''
Write-Host '============================================================' -ForegroundColor Cyan
Write-Host ' KEMIST FORWARD LAB - GITHUB LIVE APPLY' -ForegroundColor Cyan
Write-Host '============================================================'
Write-Host 'Exact Production 11.3 guard. Backup first. No RTL/2/2 gate changes.'
Write-Host ''

$searchRoots=@(
  (Join-Path $env:USERPROFILE 'Downloads'),
  (Join-Path $env:USERPROFILE 'Desktop'),
  (Join-Path $env:USERPROFILE 'Documents'),
  (Join-Path $env:USERPROFILE 'OneDrive'),
  (Join-Path $env:LOCALAPPDATA 'Kemist')
)|Where-Object{$_ -and (Test-Path -LiteralPath $_)}|Select-Object -Unique

$candidates=@()
foreach($base in $searchRoots){
  Write-Host "Searching $base ..." -ForegroundColor DarkGray
  Get-ChildItem -LiteralPath $base -Filter 'server.mjs' -File -Recurse -ErrorAction SilentlyContinue | ForEach-Object {
    try{
      $h=Hash $_.FullName
      if($h -ne $ExpectedBefore -and $h -ne $ExpectedAfter){ return }
      $root=$_.Directory.FullName
      $score=0
      if($root -notmatch '(?i)backup|old|archive'){ $score+=25 }
      if(Test-Path -LiteralPath (Join-Path $root 'START_KEMIST.ps1')){ $score+=20 }
      $runtime=ReadSafe (Join-Path $root 'data\canonical_runtime.txt')
      if($runtime -match 'Port=8790'){ $score+=100 }
      $rp=(ReadSafe (Join-Path $root 'data\runtime_port.txt')).Trim()
      if($rp -eq '8790'){ $score+=50 }
      $pidTxt=(ReadSafe (Join-Path $root 'data\server_v818.pid')).Trim()
      if($pidTxt -match '^\d+$' -and (Get-Process -Id ([int]$pidTxt) -ErrorAction SilentlyContinue)){ $score+=40 }
      $candidates += [pscustomobject]@{Root=$root;Server=$_.FullName;Hash=$h;Score=$score;Write=$_.LastWriteTime}
    }catch{}
  }
}

if(-not $candidates){ throw 'SAFETY STOP: no exact Production 11.3 server found in common Kemist locations. Nothing changed.' }
$pick=$candidates|Sort-Object Score,Write -Descending|Select-Object -First 1
$Root=$pick.Root
$Server=$pick.Server
Write-Host "[1/7] Exact Production root: $Root" -ForegroundColor Green
Write-Host "      SHA256: $($pick.Hash)" -ForegroundColor Green
if($pick.Score -lt 45){ throw "SAFETY STOP: exact file found but live-root confidence is too low (score $($pick.Score)). Nothing changed." }

$nodeCmd=Get-Command node.exe -ErrorAction SilentlyContinue
if(-not $nodeCmd){$nodeCmd=Get-Command node -ErrorAction SilentlyContinue}
if(-not $nodeCmd){throw 'Node.js was not found.'}
$node=$nodeCmd.Source

$download=@{
  'forward_lab.mjs'="$Raw/src/forward_lab.mjs";
  'forward_lab_runtime.mjs'="$Raw/src/forward_lab_runtime.mjs";
  'integrate_forward_lab_into_production.mjs'="$Raw/patches/integrate_forward_lab_into_production.mjs"
}
foreach($name in $download.Keys){
  $dest=Join-Path $Root $name
  if(Test-Path -LiteralPath $dest){ Copy-Item -LiteralPath $dest -Destination ($dest+'.before_github_forward_lab.bak') -Force }
  Invoke-WebRequest -Uri $download[$name] -OutFile $dest -UseBasicParsing -TimeoutSec 30
}
Write-Host '[2/7] Forward Lab modules downloaded from GitHub main.' -ForegroundColor Green

$listener=ListenerPid $Port
if($listener){
  $p=Get-CimInstance Win32_Process -Filter "ProcessId=$listener" -ErrorAction SilentlyContinue
  if($p -and $p.Name -eq 'node.exe' -and [string]$p.CommandLine -match 'server\.mjs'){
    Stop-Process -Id $listener -Force -ErrorAction Stop
    for($i=0;$i -lt 50;$i++){Start-Sleep -Milliseconds 100;if(-not (ListenerPid $Port)){break}}
  }else{ throw "SAFETY STOP: port $Port is owned by a non-Kemist process (PID $listener)." }
}
Write-Host '[3/7] Canonical runtime safely stopped for patch.' -ForegroundColor Green

$current=Hash $Server
if($current -eq $ExpectedBefore){
  & $node (Join-Path $Root 'integrate_forward_lab_into_production.mjs') $Server
  if($LASTEXITCODE -ne 0){throw 'Production patch failed. Backup remains intact.'}
}elseif($current -eq $ExpectedAfter){
  Write-Host '      Forward Lab server integration already present; patch skipped.' -ForegroundColor Yellow
}else{throw 'SAFETY STOP: server changed between discovery and patch. Nothing further changed.'}

$after=Hash $Server
if($after -ne $ExpectedAfter){throw "SAFETY STOP: patched server hash is unexpected: $after"}
Write-Host '[4/7] Exact server integration verified.' -ForegroundColor Green

foreach($f in @('server.mjs','forward_lab.mjs','forward_lab_runtime.mjs')){
  & $node --check (Join-Path $Root $f)
  if($LASTEXITCODE -ne 0){throw "Syntax check failed: $f"}
}
Write-Host '[5/7] Node syntax checks PASS.' -ForegroundColor Green

$starter=Join-Path $Root 'START_KEMIST.ps1'
if(-not (Test-Path -LiteralPath $starter)){throw 'START_KEMIST.ps1 is missing from the exact Production root.'}
& powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File $starter
if($LASTEXITCODE -ne 0){throw 'Kemist restart failed.'}

$fl=$null;$health=$null
for($i=0;$i -lt 80;$i++){
  Start-Sleep -Milliseconds 500
  $health=GetJson "http://127.0.0.1:$Port/api/health" 2
  $fl=GetJson "http://127.0.0.1:$Port/api/forward-lab/status" 2
  if($health -and $health.ok -and $fl -and $fl.ok){break}
}
if(-not $health -or -not $health.ok){throw 'Kemist restarted but /api/health did not verify.'}
if(-not $fl -or -not $fl.ok){throw 'Kemist restarted but Forward Lab status did not verify.'}
Write-Host '[6/7] LIVE API PASS: Kemist health + Forward Lab status.' -ForegroundColor Green

Start-Process "http://127.0.0.1:$Port/"
Write-Host '[7/7] Dashboard opened.' -ForegroundColor Green
Write-Host ''
Write-Host 'FORWARD LAB IS LIVE.' -ForegroundColor Green
Write-Host 'Research reps can now freeze and settle even when RTL/2/2 remains closed.' -ForegroundColor Green
Write-Host 'No Precision/RTL/2-of-2 thresholds were loosened.' -ForegroundColor Green
Write-Host ''
Read-Host 'Press Enter to close'
