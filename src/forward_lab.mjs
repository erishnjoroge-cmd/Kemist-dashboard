import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

export const FORWARD_LAB_VERSION = 'Kemist-Forward-Lab-v1.0';

const finite = (v) => Number.isFinite(Number(v));
const clamp = (x,a,b) => Math.max(a, Math.min(b, x));
const round = (v,d=3) => Number(Number(v).toFixed(d));
const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();

async function readJson(file, fallback={}) {
  try { return JSON.parse(await fs.readFile(file,'utf8')); } catch { return fallback; }
}
async function readNdjson(file) {
  try { return (await fs.readFile(file,'utf8')).split(/\r?\n/).filter(Boolean).map(x=>{try{return JSON.parse(x)}catch{return null}}).filter(Boolean); } catch { return []; }
}
async function appendNdjson(file, rows) {
  if (!rows.length) return;
  await fs.mkdir(path.dirname(file), {recursive:true});
  await fs.appendFile(file, rows.map(x=>JSON.stringify(x)).join('\n')+'\n','utf8');
}
async function writeJsonAtomic(file, obj) {
  await fs.mkdir(path.dirname(file), {recursive:true});
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tmp, JSON.stringify(obj,null,2),'utf8');
  await fs.rename(tmp,file);
}
function stableHash(parts) {
  return crypto.createHash('sha256').update(parts.map(x=>String(x??'')).join('|')).digest('hex').slice(0,24);
}
function marketIdentity(p) {
  return [String(p.sport||'').toUpperCase(), norm(p.player), norm(p.stat_type), String(p.start_time||'')].join('|');
}
function candidateKey(p) {
  return stableHash([FORWARD_LAB_VERSION, marketIdentity(p), Number(p.line), p.direction]);
}
function sourceFresh(latest, nowMs, maxAgeMinutes=20) {
  const stamps=[latest?.finished_at, latest?.board_captured_at].map(x=>Date.parse(x||'')).filter(Number.isFinite);
  if (!stamps.length) return {ok:false, age_minutes:null, reason:'missing_freshness_timestamp'};
  const age=Math.max(...stamps.map(t=>(nowMs-t)/60000));
  return {ok:age<=maxAgeMinutes, age_minutes:round(age,1), reason:age<=maxAgeMinutes?null:'source_stale'};
}
function researchEligibility(p, nowMs) {
  const reasons=[];
  const start=Date.parse(p?.start_time||'');
  const ratio=Number(p?.edge_uncertainty_ratio||0);
  const rawProb=Number(p?.raw_side_probability ?? 0);
  const edge=Math.abs(Number(p?.edge||0));
  const sample=Number(p?.sample_n||0);
  if (!Number.isFinite(start) || start <= nowMs + 5*60000) reasons.push('event_started_or_too_close');
  if (!finite(p?.line) || !finite(p?.projection)) reasons.push('missing_line_or_projection');
  if (!['MORE','LESS'].includes(String(p?.direction||'').toUpperCase())) reasons.push('direction_not_actionable');
  if (p?.reference_line_is_observed === false) reasons.push('line_not_observed');
  if (sample < 5) reasons.push('sample_under_5');
  if (edge <= 0) reasons.push('zero_edge');
  if (ratio < 0.75) reasons.push('ratio_under_0_75');
  if (rawProb < 0.70) reasons.push('raw_probability_under_70');
  return {ok:reasons.length===0,reasons};
}
function researchScore(p) {
  const ratio=Number(p?.edge_uncertainty_ratio||0);
  const rawProb=Number(p?.raw_side_probability||0);
  const sample=Math.min(12,Number(p?.sample_n||0));
  const calibration=Math.min(16,Number(p?.calibration_n||0));
  const wf=String(p?.projection_model||'').includes('walk_forward') ? 1 : 0;
  const observed=p?.reference_line_is_observed===false ? 0 : 1;
  return round(40*clamp(ratio/2.33,0,1)+30*clamp((rawProb-0.5)/0.49,0,1)+10*(sample/12)+10*(calibration/16)+5*wf+5*observed,2);
}
function pickCandidates(rows, nowMs, {maxTotal=12,maxPerSport=3}={}) {
  const eligible=[];
  for (const p of rows||[]) {
    const verdict=researchEligibility(p,nowMs);
    if (!verdict.ok) continue;
    eligible.push({...p,_forward_lab_score:researchScore(p)});
  }
  eligible.sort((a,b)=>b._forward_lab_score-a._forward_lab_score || Number(b.raw_side_probability||0)-Number(a.raw_side_probability||0));
  const perSport=new Map();
  const out=[];
  const seenMarket=new Set();
  for (const p of eligible) {
    const sport=String(p.sport||'UNK').toUpperCase();
    if ((perSport.get(sport)||0) >= maxPerSport) continue;
    const id=marketIdentity(p);
    if (seenMarket.has(id)) continue;
    out.push(p); seenMarket.add(id); perSport.set(sport,(perSport.get(sport)||0)+1);
    if (out.length>=maxTotal) break;
  }
  return out;
}
function settlementMatch(freeze, settlements) {
  const direct=settlements?.[freeze.source_freeze_key];
  if (direct) return direct;
  for (const s of Object.values(settlements||{})) {
    if (String(s?.market_identity||'')===String(freeze.market_identity||'') && Number(s?.line)===Number(freeze.line)) return s;
  }
  return null;
}
function grade(direction,line,actual) {
  if (!finite(actual)||!finite(line)) return 'PENDING';
  const a=Number(actual),l=Number(line),d=String(direction||'').toUpperCase();
  if (a===l) return 'PUSH';
  if (d==='MORE') return a>l?'WIN':'LOSS';
  if (d==='LESS') return a<l?'WIN':'LOSS';
  return 'PENDING';
}
function aggregate(rows) {
  const settled=rows.filter(x=>['WIN','LOSS','PUSH'].includes(x.grade));
  const decisions=settled.filter(x=>x.grade!=='PUSH');
  const wins=decisions.filter(x=>x.grade==='WIN').length;
  const losses=decisions.filter(x=>x.grade==='LOSS').length;
  const errors=settled.filter(x=>finite(x.actual)&&finite(x.projection)).map(x=>Number(x.actual)-Number(x.projection));
  const mae=errors.length?errors.reduce((s,x)=>s+Math.abs(x),0)/errors.length:null;
  const evenMoneyNet=wins-losses;
  const evenMoneyRoi=decisions.length?evenMoneyNet/decisions.length:null;
  return {frozen_n:rows.length,settled_n:settled.length,decisive_n:decisions.length,wins,losses,pushes:settled.length-decisions.length,hit_rate:decisions.length?round(wins/decisions.length,4):null,mae:mae==null?null:round(mae,3),simulated_even_money_net_units:evenMoneyNet,simulated_even_money_roi:evenMoneyRoi==null?null:round(evenMoneyRoi,4)};
}
function groupMetrics(rows,keyFn) {
  const g={};
  for (const r of rows) { const k=keyFn(r); (g[k] ||= []).push(r); }
  return Object.fromEntries(Object.entries(g).map(([k,v])=>[k,aggregate(v)]));
}

export async function runForwardLabCycle({rootDataDir='./data',nowMs=Date.now(),maxTotal=12,maxPerSport=3}={}) {
  const root=path.resolve(rootDataDir);
  const latestFile=path.join(root,'multisport_engine','latest.json');
  const sourceFreezeFile=path.join(root,'multisport_engine','freezes.ndjson');
  const sourceSettlementFile=path.join(root,'multisport_engine','settlements.json');
  const labDir=path.join(root,'forward_lab');
  const freezeFile=path.join(labDir,'freezes.ndjson');
  const stateFile=path.join(labDir,'state.json');

  const [latest,existing,sourceFreezes,sourceSettlementDoc]=await Promise.all([
    readJson(latestFile,{}), readNdjson(freezeFile), readNdjson(sourceFreezeFile), readJson(sourceSettlementFile,{items:{}})
  ]);
  const freshness=sourceFresh(latest,nowMs);
  const existingKeys=new Set(existing.map(x=>x.forward_lab_key));
  const sourceByIdentity=new Map(sourceFreezes.map(x=>[`${x.market_identity}|${Number(x.line)}`,x]));
  const chosen=freshness.ok?pickCandidates(latest.latest_projections||[],nowMs,{maxTotal,maxPerSport}):[];
  const newRows=[];
  for (const p of chosen) {
    const key=candidateKey(p); if (existingKeys.has(key)) continue;
    const src=sourceByIdentity.get(`${marketIdentity(p)}|${Number(p.line)}`);
    newRows.push({
      version:FORWARD_LAB_VERSION,forward_lab_key:key,frozen_at:new Date(nowMs).toISOString(),market_identity:marketIdentity(p),
      source_freeze_key:src?.freeze_key||null,sport:String(p.sport||'UNK').toUpperCase(),league:p.league||null,player:p.player||null,team:p.team||null,
      stat_type:p.stat_type||null,start_time:p.start_time||null,line:Number(p.line),projection:Number(p.projection),uncertainty:Number(p.uncertainty),
      edge:Number(p.edge),direction:String(p.direction||'').toUpperCase(),raw_side_probability:Number(p.raw_side_probability||0),
      edge_uncertainty_ratio:Number(p.edge_uncertainty_ratio||0),sample_n:Number(p.sample_n||0),calibration_n:Number(p.calibration_n||0),
      precision_gate:Boolean(p.precision_gate),precision_blockers:Array.isArray(p.precision_firewall_reasons)?p.precision_firewall_reasons:[],
      projection_model:p.projection_model||null,research_score:Number(p._forward_lab_score||0),source_engine_patch:p.engine_patch||latest.engine_patch||null,
      lane:'FORWARD_LAB_RESEARCH',money_qualified:false
    });
  }
  await appendNdjson(freezeFile,newRows);
  const all=[...existing,...newRows];
  const settlements=sourceSettlementDoc.items||{};
  const graded=all.map(f=>{
    const s=settlementMatch(f,settlements);
    const actual=finite(s?.actual)?Number(s.actual):null;
    return {...f,grade:s?grade(f.direction,f.line,actual):'PENDING',actual,settled_at:s?.settled_at||null,projection_error:actual==null?null:round(actual-Number(f.projection),3)};
  });
  const summary={
    ok:true,version:FORWARD_LAB_VERSION,updated_at:new Date(nowMs).toISOString(),source_freshness:freshness,
    source_projected_n:Number(latest.projected_n||0),source_engine_patch:latest.engine_patch||null,new_freezes:newRows.length,
    metrics:aggregate(graded),by_sport:groupMetrics(graded,r=>r.sport||'UNK'),by_market:groupMetrics(graded,r=>`${r.sport||'UNK'}|${r.stat_type||'UNK'}`),
    open:graded.filter(x=>x.grade==='PENDING').sort((a,b)=>Date.parse(a.start_time||0)-Date.parse(b.start_time||0)).slice(0,50),
    recent_settled:graded.filter(x=>x.grade!=='PENDING').sort((a,b)=>Date.parse(b.settled_at||0)-Date.parse(a.settled_at||0)).slice(0,50),
    note:'Forward Lab is a research lane. It records immutable pregame projections even when Precision/RTL is closed. It does not convert a research projection into a money-qualified play. Simulated even-money units are diagnostic only and are not a sportsbook payout model.'
  };
  await writeJsonAtomic(stateFile,summary);
  return summary;
}

export async function getForwardLabSummary({rootDataDir='./data'}={}) {
  return readJson(path.join(path.resolve(rootDataDir),'forward_lab','state.json'),{ok:false,version:FORWARD_LAB_VERSION,reason:'no_forward_lab_state_yet'});
}

export function forwardLabSelfTest() {
  const now=Date.parse('2026-10-14T20:00:00Z');
  const p={sport:'NBA',player:'Test Player',stat_type:'Rebounds',start_time:'2026-10-15T01:00:00Z',line:8.5,projection:10.5,uncertainty:2,edge:2,direction:'MORE',sample_n:8,calibration_n:8,raw_side_probability:.82,edge_uncertainty_ratio:1,reference_line_is_observed:true};
  const v=researchEligibility(p,now);
  return {ok:v.ok && researchScore(p)>0,verdict:v,score:researchScore(p)};
}
