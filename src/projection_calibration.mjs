import fs from 'node:fs/promises';
import path from 'node:path';

export const PROJECTION_CALIBRATION_VERSION='Kemist-Projection-Calibration-v2.0-Forward-Shrinkage';
const ROOT_DATA_DIR=path.resolve(process.env.KEMIST_ROOT_DATA_DIR || './data');
const LEGACY_FREEZE_FILE=path.join(ROOT_DATA_DIR,'prediction_freezes_v66.ndjson');
const FREEZE_FILE=path.join(ROOT_DATA_DIR,'projection_shadow','freezes.ndjson');
const SETTLEMENT_FILE=path.join(ROOT_DATA_DIR,'results_lab','settlements.json');
const finite=v=>Number.isFinite(Number(v));
const norm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const round=(v,d=2)=>Number(Number(v).toFixed(d));

async function readNdjson(file){try{return(await fs.readFile(file,'utf8')).split(/\r?\n/).filter(Boolean).map(x=>{try{return JSON.parse(x)}catch{return null}}).filter(Boolean)}catch{return[]}}
async function readJson(file,fallback){try{return JSON.parse(await fs.readFile(file,'utf8'))}catch{return fallback}}
function providerFotmobEvent(rec){for(const p of rec?.providers||[])if(String(p.provider||'').toLowerCase()==='fotmob'&&p.ok&&p.event_id)return String(p.event_id);return null}
function weightedMean(rows,key='residual'){
  let n=0,d=0;
  for(const r of rows){const v=Number(r[key]);const w=Number(r.weight||1);if(Number.isFinite(v)&&Number.isFinite(w)&&w>0){n+=v*w;d+=w}}
  return d?n/d:null;
}
function weightedMae(rows){
  let n=0,d=0;
  for(const r of rows){const v=Math.abs(Number(r.residual));const w=Number(r.weight||1);if(Number.isFinite(v)&&Number.isFinite(w)&&w>0){n+=v*w;d+=w}}
  return d?n/d:null;
}
function effectiveN(rows){return round(rows.reduce((s,r)=>s+Number(r.weight||1),0),1)}
function shrink(value,n,prior=12){return Number.isFinite(value)?value*(n/(n+prior)):0}
function subgroupDelta(rows,globalRaw,prior,cap){
  if(!rows.length||!Number.isFinite(globalRaw))return{n:0,raw:null,delta:0};
  const raw=weightedMean(rows);const n=effectiveN(rows);
  const delta=Number.isFinite(raw)?clamp((raw-globalRaw)*(n/(n+prior)),-cap,cap):0;
  return{n,raw:raw==null?null:round(raw,2),delta:round(delta,2)};
}

export async function getProjectionCalibrationProfile(){
  const [legacy,fresh,settlements]=await Promise.all([
    readNdjson(LEGACY_FREEZE_FILE),readNdjson(FREEZE_FILE),readJson(SETTLEMENT_FILE,{items:{}})
  ]);
  const actualMap=new Map();
  for(const rec of Object.values(settlements.items||{})){
    if(!finite(rec.actual_passes))continue;
    const eid=providerFotmobEvent(rec);if(!eid)continue;
    actualMap.set(`${norm(rec.identity?.player)}|${eid}`,Number(rec.actual_passes));
  }
  const all=[
    ...legacy.map(x=>({...x,source:'legacy'})),
    ...fresh.filter(x=>x.shadow_eligible===true).map(x=>({...x,source:'continuous'}))
  ];
  const latest=new Map();
  for(const f of all){
    if(!f.player||!f.match_id||!finite(f.fair_projection))continue;
    const key=`${norm(f.player)}|${String(f.match_id)}`;
    const actual=actualMap.get(key);if(!finite(actual))continue;
    const at=Date.parse(f.frozen_at||'');const start=Date.parse(f.match_start||'');
    if(Number.isFinite(start)&&Number.isFinite(at)&&at>=start)continue;
    const old=latest.get(key);
    if(!old||Date.parse(f.frozen_at||'')>Date.parse(old.frozen_at||''))latest.set(key,f);
  }
  const joined=[...latest.entries()].map(([key,f])=>{
    const actual=actualMap.get(key),est=Number(f.fair_projection);
    const ageDays=Math.max(0,(Date.now()-(Date.parse(f.match_start||f.frozen_at||'')||Date.now()))/86400000);
    const recency=clamp(1-ageDays/180,0.55,1);
    const sourceWeight=f.source==='continuous'?1:0.6;
    const weight=recency*sourceWeight;
    const line=finite(f.line)?Number(f.line):null;
    const dir=String(f.direction||((line!=null&&est>line)?'MORE':(line!=null&&est<line)?'LESS':'PASS'));
    return{residual:Number(actual)-est,position:String(f.position||'UNK').toUpperCase(),direction:dir,weight,source:f.source,at:(Date.parse(f.match_start||f.frozen_at||'')||0)};
  }).filter(x=>finite(x.residual)).sort((a,b)=>a.at-b.at);
  const n=effectiveN(joined);
  const globalRaw=weightedMean(joined);
  const globalBias=clamp(shrink(globalRaw,n,14),-4.5,4.5);
  const mae=weightedMae(joined);
  const recent=joined.slice(-10);
  const recentMae=weightedMae(recent);
  const uncertaintyMultiplier=mae&&recentMae?clamp(recentMae/mae,0.95,1.25):1;
  const byPosition={};
  for(const pos of ['GK','D','M','F','UNK']){
    const g=joined.filter(x=>x.position===pos);
    byPosition[pos]=subgroupDelta(g,globalRaw,8,2.5);
  }
  const byDirection={};
  for(const dir of ['MORE','LESS']){
    const g=joined.filter(x=>x.direction===dir);
    byDirection[dir]=subgroupDelta(g,globalRaw,10,1.5);
  }
  return{
    ok:true,version:PROJECTION_CALIBRATION_VERSION,sample_n:n,raw_global_bias:globalRaw==null?null:round(globalRaw,2),
    serving_global_bias:round(globalBias,2),overall_mae:mae==null?null:round(mae,2),recent10_mae:recentMae==null?null:round(recentMae,2),
    uncertainty_multiplier:round(uncertaintyMultiplier,3),by_position:byPosition,by_direction:byDirection
  };
}

export function calibrateProjection(fair,line,profile){
  const rawProjection=Number(fair?.exact_projection);
  const rawUncertainty=Math.max(1,Number(fair?.uncertainty)||1);
  if(!Number.isFinite(rawProjection))return fair;
  const rawEdge=Number.isFinite(Number(line))?rawProjection-Number(line):0;
  const rawDirection=rawEdge>0?'MORE':rawEdge<0?'LESS':'PASS';
  const pos=String(fair?.position||'UNK').toUpperCase();
  const global=Number(profile?.serving_global_bias||0);
  const posDelta=Number(profile?.by_position?.[pos]?.delta||0);
  const dirDelta=Number(profile?.by_direction?.[rawDirection]?.delta||0);
  let adjustment=global+posDelta+dirDelta;
  const n=Number(profile?.sample_n||0);
  if(n<12)adjustment*=n/12;
  adjustment=clamp(adjustment,-5,5);
  const calibrated=rawProjection+adjustment;
  let uncertaintyMult=Number(profile?.uncertainty_multiplier||1);
  if(n<20)uncertaintyMult=Math.max(uncertaintyMult,1.08);
  const calibratedUncertainty=Math.max(rawUncertainty,rawUncertainty*uncertaintyMult);
  return{
    ...fair,
    raw_exact_projection:round(rawProjection,1),
    exact_projection:round(calibrated,1),
    raw_uncertainty:round(rawUncertainty,1),
    uncertainty:round(calibratedUncertainty,1),
    calibration_version:profile?.version||PROJECTION_CALIBRATION_VERSION,
    calibration_sample_n:n,
    calibration_bias_adjustment:round(adjustment,2),
    calibration_global_bias:round(global,2),
    calibration_position_delta:round(posDelta,2),
    calibration_direction_delta:round(dirDelta,2),
    calibration_uncertainty_multiplier:round(uncertaintyMult,3)
  };
}

export function projectionCalibrationSelfTest(){
  const p={version:PROJECTION_CALIBRATION_VERSION,sample_n:24,serving_global_bias:2.5,uncertainty_multiplier:1.1,by_position:{M:{delta:0.5}},by_direction:{LESS:{delta:-0.4}}};
  const out=calibrateProjection({exact_projection:40,uncertainty:6,position:'M'},45,p);
  return{ok:out.exact_projection===42.6&&out.uncertainty===6.6&&out.raw_exact_projection===40,output:out};
}
