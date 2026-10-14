import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';

const EXPECTED='eaec113ed4acb7bdabe4eb42664f2c3feb4ddb471b79ace7d6b395b9550b4c55';
const serverPath=path.resolve(process.argv[2]||'server.mjs');
const root=path.dirname(serverPath);
const sha=(s)=>crypto.createHash('sha256').update(s).digest('hex');
if(!fs.existsSync(serverPath)) throw new Error(`server not found: ${serverPath}`);
let s=fs.readFileSync(serverPath,'utf8');
if(s.includes("./forward_lab_runtime.mjs")){
  console.log('Forward Lab already integrated; no changes needed.');
  process.exit(0);
}
const got=sha(Buffer.from(s,'utf8'));
if(got!==EXPECTED) throw new Error(`SAFETY STOP: server.mjs fingerprint mismatch. expected ${EXPECTED} got ${got}`);
const backup=`${serverPath}.before_forward_lab_${new Date().toISOString().replace(/[:.]/g,'-')}.bak`;
fs.copyFileSync(serverPath,backup);

function once(oldText,newText,label){
  const n=s.split(oldText).length-1;
  if(n!==1) throw new Error(`Patch anchor ${label} expected exactly once; found ${n}`);
  s=s.replace(oldText,newText);
}

once(
"import { WEEKLY_VALIDATION_VERSION, runWeeklyValidationCycle, getWeeklyValidationSummary, weeklyValidationSelfTest } from './weekly_validation.mjs';",
"import { WEEKLY_VALIDATION_VERSION, runWeeklyValidationCycle, getWeeklyValidationSummary, weeklyValidationSelfTest } from './weekly_validation.mjs';\nimport { createForwardLabRuntime, renderForwardLabPanel, handleForwardLabApi } from './forward_lab_runtime.mjs';",
'import'
);

once(
"const CANONICAL_URL = process.env.KEMIST_CANONICAL_URL || `http://127.0.0.1:${PORT}`;",
"const CANONICAL_URL = process.env.KEMIST_CANONICAL_URL || `http://127.0.0.1:${PORT}`;\nconst forwardLabRuntime = createForwardLabRuntime({rootDataDir:'./data', intervalMs:300000, maxTotal:12, maxPerSport:3});",
'runtime-init'
);

once(
"const [latest, results, projectionShadow, projectionLearning, multiSport, multiSportEngine, weekly] = await Promise.all([getLatest(), getResultsSummary(), getProjectionShadowStatus(), getProjectionLearningSummary(), getMultiSportStatus(), getMultiSportEngineSummary(), getWeeklyValidationSummary()]);",
"const [latest, results, projectionShadow, projectionLearning, multiSport, multiSportEngine, weekly, forwardLabState] = await Promise.all([getLatest(), getResultsSummary(), getProjectionShadowStatus(), getProjectionLearningSummary(), getMultiSportStatus(), getMultiSportEngineSummary(), getWeeklyValidationSummary(), forwardLabRuntime.status()]);\n  const forwardLab = forwardLabState?.summary || {};",
'buildPage-data'
);

once(
"  <div class=\"section lab\"><div class=\"sectionTitle\"><div><h2 style=\"margin:0\">🧪 Kemist 2/2 Command Center</h2>",
"  ${renderForwardLabPanel(forwardLab)}\n\n  <div class=\"section lab\"><div class=\"sectionTitle\"><div><h2 style=\"margin:0\">🧪 Kemist 2/2 Command Center</h2>",
'dashboard-panel'
);

once(
"    if (url.pathname === '/api/patterns' && req.method === 'GET') return sendJson(res, 200, await getPatternStats());",
"    if (await handleForwardLabApi({pathname:url.pathname,method:req.method,sendJson:(status,obj)=>sendJson(res,status,obj),runtime:forwardLabRuntime})) return;\n    if (url.pathname === '/api/patterns' && req.method === 'GET') return sendJson(res, 200, await getPatternStats());",
'api-routes'
);

once(
"goat_guardian:goatGuardianView() });\n    if (url.pathname === '/api/multisport'",
"goat_guardian:goatGuardianView(), forward_lab:await forwardLabRuntime.status() });\n    if (url.pathname === '/api/multisport'",
'health-status'
);

once(
"learning_heartbeat:learningHeartbeatView(), goat_guardian:goatGuardianView() });\n    return sendJson(res, 404",
"learning_heartbeat:learningHeartbeatView(), goat_guardian:goatGuardianView(), forward_lab:await forwardLabRuntime.status() });\n    return sendJson(res, 404",
'raw-status'
);

once(
"  if (!SKIP_SPORTS_AUTOSTART) { startSportsWorker(true); console.log(`automatic Multi-Sport Lab scheduled every ${SPORTS_INTERVAL_SECONDS}s with immediate intake`); }",
"  if (!SKIP_SPORTS_AUTOSTART) { startSportsWorker(true); console.log(`automatic Multi-Sport Lab scheduled every ${SPORTS_INTERVAL_SECONDS}s with immediate intake`); }\n  forwardLabRuntime.start(); console.log('Forward Lab worker scheduled every 5 minutes with immediate research freeze cycle');",
'autostart'
);

fs.writeFileSync(serverPath,s,'utf8');
console.log(JSON.stringify({ok:true,server:serverPath,backup,new_sha256:sha(Buffer.from(s,'utf8'))},null,2));
