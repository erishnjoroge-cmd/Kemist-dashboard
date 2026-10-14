import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';

const target=path.resolve(process.argv[2]||'results_lab.mjs');
const EXPECTED='5d2f0a1037466876eb3d1478a3a05bedcbe69545b9a5210fc598c7ab39d68855';
const EXPECTED_AFTER='1734d20352f4193ba00fbe6006369f3fca2e5602ee4a9f33d8f75a756c5bcca9';
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
if(!fs.existsSync(target)) throw new Error(`missing ${target}`);
let s=fs.readFileSync(target,'utf8');
const got=sha(target);
if(got!==EXPECTED && got!==EXPECTED_AFTER) throw new Error(`SAFETY STOP results_lab.mjs fingerprint mismatch: ${got}`);
if(got===EXPECTED_AFTER){console.log(JSON.stringify({ok:true,already_applied:true,sha:got},null,2));process.exit(0)}
const backup=`${target}.before_projection_settlement_rescue_${new Date().toISOString().replace(/[:.]/g,'-')}.bak`;
fs.copyFileSync(target,backup);
function once(a,b,label){const n=s.split(a).length-1;if(n!==1)throw new Error(`anchor ${label}: expected 1 found ${n}`);s=s.replace(a,b)}
once(
"const INTEGRITY_REPORT_FILE = path.join(RESULTS_DATA_DIR, 'integrity_report.json');\nconst FOUNDATION_SCHEMA_VERSION = 1;",
"const INTEGRITY_REPORT_FILE = path.join(RESULTS_DATA_DIR, 'integrity_report.json');\nconst PROJECTION_FREEZE_FILE = path.join(ROOT_DATA_DIR, 'projection_shadow', 'freezes.ndjson');\nconst FOUNDATION_SCHEMA_VERSION = 1;",
'projection-freeze-path');
once(
"export async function refreshResultsQueue({ now = nowIso() } = {}) {\n  await ensureResultsDir();\n  const nowMs = parseIsoMs(now) ?? Date.now();\n  const histories = await buildMarketHistories();",
"export async function refreshResultsQueue({ now = nowIso() } = {}) {\n  await ensureResultsDir();\n  const nowMs = parseIsoMs(now) ?? Date.now();\n  const histories = await buildMarketHistories();\n  const projectionFreezes = (await readNdjson(PROJECTION_FREEZE_FILE)).rows;",
'queue-load-freezes');
once(
"  current.version = RESULTS_VERSION;\n  current.updated_at = now;",
`  // Projection Settlement Rescue: Board Sentinel history is not a complete list of
  // immutable pregame decisions. If a projected market disappears from the board
  // before/after kickoff, the old queue builder never created a Results Lab item,
  // leaving the Projection Learning Loop stuck in AWAITING RESULT forever. Rescue
  // eligible pregame freezes into the same identity-locked settlement pipeline.
  const rescueCutoffMs = nowMs - RESULTS_LOOKBACK_DAYS * 86400000;
  let rescuedProjectionDecisions = 0;
  const rescueSeen = new Set();
  for (const f of projectionFreezes || []) {
    if (!f?.player || !f?.team || !f?.opponent || !f?.match_id || !finite(f?.line)) continue;
    if (f.shadow_eligible !== true) continue;
    const startMs = parseIsoMs(f.match_start);
    const frozenMs = parseIsoMs(f.frozen_at);
    if (startMs == null || frozenMs == null || frozenMs >= startMs) continue;
    if (startMs < rescueCutoffMs || startMs > nowMs) continue;
    const identityKey = \`${norm(f.player)}|${String(f.match_id)}\`;
    if (rescueSeen.has(identityKey)) continue;
    rescueSeen.add(identityKey);
    let alreadySettled = false;
    for (const rec of Object.values(settlements.items || {})) {
      if (norm(rec?.identity?.player) !== norm(f.player)) continue;
      const fot = (rec?.providers || []).find(p => String(p?.provider || '').toLowerCase() === 'fotmob' && p?.ok && p?.event_id != null);
      if (fot && String(fot.event_id) === String(f.match_id)) { alreadySettled = true; break; }
    }
    if (alreadySettled) continue;
    const marketKey = \`projection_rescue|${String(f.match_id)}|${norm(f.player)}|passes attempted\`;
    const prev = current.items[marketKey] || {};
    const state = queueStateFor(f.match_start, nowMs);
    const retryDue = parseIsoMs(prev.next_retry_at);
    let status = state.status;
    if (['CANCELLED','DNP_OR_NO_STAT','UNTRAINABLE'].includes(prev.status)) status = prev.status;
    else if (['RETRY','PROVIDER_CONFLICT','RESULT_UNAVAILABLE'].includes(prev.status) && state.status === 'PENDING_RESULT') {
      status = retryDue != null && retryDue > nowMs ? prev.status : 'PENDING_RESULT';
    }
    current.items[marketKey] = {
      ...prev,
      market_key: marketKey,
      anon_id: prev.anon_id || \`K-PRJ-${crypto.createHash('sha1').update(identityKey).digest('hex').slice(0,7).toUpperCase()}\`,
      identity: { player: f.player, team: f.team, opponent: f.opponent, league: 'SOCCER', event_id: String(f.match_id), group_key: String(f.match_id), start_time: f.match_start },
      features: {
        opening_line: Number(f.line), closing_line: Number(f.line), net_line_move: 0,
        line_move_direction: 'FLAT', line_move_count: 0, last_30m_net: 0, last_2h_net: 0,
        pregame_snapshot_count: 1, verified_complete_snapshots: 0, visual_trusted_snapshots: 0,
        visual_trust_ratio: 0, opening_visual_slot: null, closing_visual_slot: null,
        visual_promotion: 0, visual_move_count: 0, closing_dislocation: 0, max_abs_dislocation: 0,
        inversion_snapshots: 0, inversion_rate: 0, verified_disappearances: 0, verified_reappearances: 0,
        first_seen_at: f.frozen_at, last_pregame_seen_at: f.frozen_at,
        close_age_minutes: Math.max(0, round((startMs - frozenMs) / 60000, 1)),
        feature_quality: 'PROJECTION_RESCUE'
      },
      status, due_at: state.due_at, queue_source: 'PROJECTION_SETTLEMENT_RESCUE',
      source_freeze_key: f.freeze_key || null, source_shadow_version: f.shadow_version || null,
      first_queued_at: prev.first_queued_at || now, last_refreshed_at: now
    };
    rescuedProjectionDecisions++;
  }
  current.projection_settlement_rescue = { at: now, eligible_checked: projectionFreezes.length, queued_or_refreshed: rescuedProjectionDecisions };

  current.version = RESULTS_VERSION;\n  current.updated_at = now;`,
'queue-rescue-insert');
fs.writeFileSync(target,s,'utf8');
console.log(JSON.stringify({ok:true,backup,sha:sha(target)},null,2));
