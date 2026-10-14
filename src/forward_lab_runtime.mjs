import {runForwardLabCycle,getForwardLabSummary,FORWARD_LAB_VERSION} from './forward_lab.mjs';

const esc=(v)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pct=(v)=>Number.isFinite(Number(v))?`${(Number(v)*100).toFixed(1)}%`:'—';

export function createForwardLabRuntime({rootDataDir='./data',intervalMs=300000,maxTotal=12,maxPerSport=3}={}){
  let timer=null;
  let running=false;
  let lastError=null;
  let lastRun=null;
  async function run(){
    if(running)return {ok:false,reason:'already_running'};
    running=true;
    try{lastRun=await runForwardLabCycle({rootDataDir,maxTotal,maxPerSport});lastError=null;return lastRun;}
    catch(err){lastError=String(err?.stack||err);return {ok:false,error:lastError};}
    finally{running=false;}
  }
  function start(){
    if(timer)return {ok:true,already_started:true,version:FORWARD_LAB_VERSION};
    timer=setInterval(()=>{void run();},Math.max(60000,Number(intervalMs)||300000));
    timer.unref?.();
    void run();
    return {ok:true,started:true,version:FORWARD_LAB_VERSION,interval_ms:Math.max(60000,Number(intervalMs)||300000)};
  }
  function stop(){if(timer){clearInterval(timer);timer=null;}return {ok:true,stopped:true};}
  async function status(){return {ok:true,version:FORWARD_LAB_VERSION,running,timer_scheduled:Boolean(timer),last_error:lastError,last_run:lastRun,summary:await getForwardLabSummary({rootDataDir})};}
  return {run,start,stop,status};
}

export function renderForwardLabPanel(summary={}){
  const m=summary?.metrics||{};
  const fresh=summary?.source_freshness||{};
  const freshness=fresh.ok?`FRESH • ${esc(fresh.age_minutes??'—')}m`:`STALE • ${esc(fresh.reason||'unknown')}`;
  const open=(summary?.open||[]).slice(0,8).map(x=>`<tr><td>${esc(x.sport)}</td><td>${esc(x.player)}</td><td>${esc(x.stat_type)}</td><td>${esc(x.direction)} ${esc(x.line)}</td><td>${esc(x.projection)}</td><td>${esc(x.research_score)}</td><td>${x.precision_gate?'RTL-ELIGIBLE':'RESEARCH'}</td></tr>`).join('')||'<tr><td colspan="7">No open Forward Lab freezes yet.</td></tr>';
  const recent=(summary?.recent_settled||[]).slice(0,8).map(x=>`<tr><td>${esc(x.sport)}</td><td>${esc(x.player)}</td><td>${esc(x.direction)} ${esc(x.line)}</td><td>${esc(x.actual??'—')}</td><td>${esc(x.grade)}</td><td>${esc(x.projection_error??'—')}</td></tr>`).join('')||'<tr><td colspan="6">No settled Forward Lab reps yet.</td></tr>';
  return `<div class="section forwardLab"><div class="sectionTitle"><div><h3>🧪 FORWARD LAB — TAKE THE EXAM</h3><div class="tiny">Research lane only. Pregame freezes remain separate from RTL / 2-of-2 money qualification.</div></div><span class="badge">${freshness}</span></div><div class="row"><div class="card"><div class="tiny">FROZEN REPS</div><div class="big">${esc(m.frozen_n??0)}</div></div><div class="card"><div class="tiny">SETTLED</div><div class="big">${esc(m.settled_n??0)}</div></div><div class="card"><div class="tiny">W / L</div><div class="big">${esc(m.wins??0)} / ${esc(m.losses??0)}</div></div><div class="card"><div class="tiny">HIT RATE</div><div class="big">${pct(m.hit_rate)}</div></div><div class="card"><div class="tiny">MAE</div><div class="big">${esc(m.mae??'—')}</div></div><div class="card"><div class="tiny">DIAGNOSTIC NET UNITS*</div><div class="big">${esc(m.simulated_even_money_net_units??0)}</div></div></div><div class="tiny" style="margin-top:6px">*Even-money diagnostic only; not a sportsbook payout model and not a profit guarantee.</div><h4>Open pregame freezes</h4><div class="tablewrap"><table><thead><tr><th>Sport</th><th>Player</th><th>Market</th><th>Lean</th><th>Projection</th><th>Score</th><th>Lane</th></tr></thead><tbody>${open}</tbody></table></div><h4>Recent settled reps</h4><div class="tablewrap"><table><thead><tr><th>Sport</th><th>Player</th><th>Pick</th><th>Actual</th><th>Grade</th><th>Error</th></tr></thead><tbody>${recent}</tbody></table></div></div>`;
}

export async function handleForwardLabApi({pathname,method,sendJson,runtime}){
  if(!runtime||typeof sendJson!=='function')return false;
  if(pathname==='/api/forward-lab'&&method==='GET'){sendJson(200,(await runtime.status()).summary);return true;}
  if(pathname==='/api/forward-lab/status'&&method==='GET'){sendJson(200,await runtime.status());return true;}
  if(pathname==='/api/forward-lab/run'&&method==='POST'){sendJson(200,await runtime.run());return true;}
  if(pathname==='/api/forward-lab/start'&&method==='POST'){sendJson(200,runtime.start());return true;}
  if(pathname==='/api/forward-lab/stop'&&method==='POST'){sendJson(200,runtime.stop());return true;}
  return false;
}
