import {forwardLabSelfTest} from '../src/forward_lab.mjs';
const out=forwardLabSelfTest();
console.log(JSON.stringify(out,null,2));
if(!out.ok) process.exit(1);
