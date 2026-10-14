import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {runForwardLabCycle} from '../src/forward_lab.mjs';

const root=await fs.mkdtemp(path.join(os.tmpdir(),'kemist-forward-lab-'));
await fs.mkdir(path.join(root,'multisport_engine'),{recursive:true});
const now=Date.parse('2026-10-14T20:00:00Z');
const start='2026-10-15T01:00:00Z';
const projection={sport:'NBA',league:'NBA',player:'Test Player',team:'TST',stat_type:'Rebounds',start_time:start,line:8.5,projection:10.5,uncertainty:2,edge:2,direction:'MORE',sample_n:8,calibration_n:8,raw_side_probability:.82,edge_uncertainty_ratio:1,reference_line_is_observed:true,precision_gate:false,precision_firewall_reasons:['edge_uncertainty_ratio_under_2_33'],projection_model:'walk_forward_v3_qualified',engine_patch:'test-patch'};
await fs.writeFile(path.join(root,'multisport_engine','latest.json'),JSON.stringify({finished_at:'2026-10-14T19:58:00Z',board_captured_at:'2026-10-14T19:58:30Z',projected_n:1,engine_patch:'test-patch',latest_projections:[projection]},null,2));
await fs.writeFile(path.join(root,'multisport_engine','freezes.ndjson'),'');
await fs.writeFile(path.join(root,'multisport_engine','settlements.json'),JSON.stringify({items:{}},null,2));

const first=await runForwardLabCycle({rootDataDir:root,nowMs:now});
if(!first.ok || first.new_freezes!==1 || first.metrics.frozen_n!==1 || first.metrics.settled_n!==0) throw new Error(`freeze phase failed: ${JSON.stringify(first)}`);
if(first.open[0]?.money_qualified!==false || first.open[0]?.lane!=='FORWARD_LAB_RESEARCH') throw new Error('research lane separation failed');

const identity=first.open[0].market_identity;
await fs.writeFile(path.join(root,'multisport_engine','settlements.json'),JSON.stringify({items:{settled_test:{market_identity:identity,line:8.5,actual:11,settled_at:'2026-10-15T03:30:00Z'}}},null,2));
const second=await runForwardLabCycle({rootDataDir:root,nowMs:now+60000});
if(second.new_freezes!==0) throw new Error('dedupe failed');
if(second.metrics.wins!==1 || second.metrics.losses!==0 || second.metrics.hit_rate!==1) throw new Error(`settlement grading failed: ${JSON.stringify(second.metrics)}`);
if(second.metrics.mae!==0.5) throw new Error(`MAE failed: ${second.metrics.mae}`);

console.log(JSON.stringify({ok:true,first:first.metrics,second:second.metrics},null,2));
