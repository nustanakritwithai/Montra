/** Report-only, parse-only microbenchmark. Never executes shipped client code. */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {Script} from 'node:vm';
import {performance} from 'node:perf_hooks';
import {createHash} from 'node:crypto';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
export function summary(values){
  if(!values.length||values.some(x=>!Number.isFinite(x)))throw Error('Finite nonempty sample required');
  const a=[...values].sort((a,b)=>a-b);
  return {n:a.length,min:a[0],median:a[Math.floor(a.length/2)],p95:a[Math.ceil(a.length*.95)-1],max:a.at(-1)};
}
export function scripts(root){
  return [...readFileSync(join(root,'index.html'),'utf8').matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)]
    .map(m=>m[1]).filter(s=>s.startsWith('./')).map(src=>{
      const name=src.split('?')[0],file=resolve(root,name);
      if(!file.startsWith(resolve(root)+'/'))throw Error('Outside root');
      const code=readFileSync(file,'utf8');return {name,code,bytes:Buffer.byteLength(code),sha256:createHash('sha256').update(code).digest('hex')};
    });
}
export function compare(baseline,candidate){
  const sets={baseline:scripts(baseline),candidate:scripts(candidate)},samples={baseline:[],candidate:[]};
  // Alternate order; use distinct comments to avoid V8's identical-source compilation cache.
  for(let i=0;i<34;i++)for(const label of i%2?['candidate','baseline']:['baseline','candidate']){
    const start=performance.now();
    for(const file of sets[label])new Script(`${file.code}\n// performance sample ${i} ${label}`,{filename:file.name});
    if(i>=4)samples[label].push(performance.now()-start);
  }
  return {kind:'parse-only microbenchmark, not runtime/module invocation or browser startup',node:process.version,
    platform:process.platform,cpu:os.cpus()[0]?.model,cpus:os.cpus().length,
    revisions:Object.fromEntries(Object.entries({baseline,candidate}).map(([k,r])=>[k,execFileSync('git',['-C',r,'rev-parse','HEAD'],{encoding:'utf8'}).trim()])),
    files:Object.fromEntries(Object.entries(sets).map(([k,v])=>[k,v.map(({code,...metadata})=>metadata)])),
    compileMs:Object.fromEntries(Object.entries(samples).map(([k,v])=>[k,{raw:v,...summary(v)}])),verdict:'MEASUREMENT ONLY: no timing acceptance threshold calibrated'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const [baseline,candidate,out]=process.argv.slice(2);if(!out)throw Error('Usage: compare.mjs BASELINE_ROOT CANDIDATE_ROOT OUTPUT_DIR');
  mkdirSync(out,{recursive:true});writeFileSync(join(out,'parse.json'),JSON.stringify(compare(resolve(baseline),resolve(candidate)),null,2));
}
