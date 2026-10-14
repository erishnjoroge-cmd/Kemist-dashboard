import {renderForwardLabPanel,handleForwardLabApi} from '../src/forward_lab_runtime.mjs';

const html=renderForwardLabPanel({source_freshness:{ok:true,age_minutes:2},metrics:{frozen_n:2,settled_n:1,wins:1,losses:0,hit_rate:1,mae:.5,simulated_even_money_net_units:1},open:[{sport:'NBA',player:'Test',stat_type:'Rebounds',direction:'MORE',line:8.5,projection:10.5,research_score:78,precision_gate:false}],recent_settled:[]});
if(!html.includes('FORWARD LAB')||!html.includes('RESEARCH')||!html.includes('100.0%')) throw new Error('panel render failed');
const calls=[];
const runtime={status:async()=>({summary:{ok:true}}),run:async()=>({ok:true,ran:true}),start:()=>({ok:true}),stop:()=>({ok:true})};
const sendJson=(status,body)=>calls.push({status,body});
if(!await handleForwardLabApi({pathname:'/api/forward-lab',method:'GET',sendJson,runtime})) throw new Error('GET route failed');
if(calls[0]?.status!==200||calls[0]?.body?.ok!==true) throw new Error('GET payload failed');
console.log(JSON.stringify({ok:true},null,2));
