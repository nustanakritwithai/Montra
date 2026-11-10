/** Test-only runner. Starts and owns a fresh loopback server for each suite. */
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const suiteNames=process.argv.slice(2);
const selections=suiteNames.length?suiteNames:['contract','advanced'];
if(selections.some(name=>!['contract','advanced'].includes(name)))throw Error('Usage: isolated-class-integrations.mjs [contract] [advanced]');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const loader=import.meta.resolve('tsx');
const entry=fileURLToPath(new URL('./src/rooms/isolated-class-test-server.ts',import.meta.url));
const suites={
  contract:{file:'class-skills-contract-integration.mjs',dir:'montra-class-skills-test-data',world:'1',timeout:240000},
  advanced:{file:'advanced-class-integration.mjs',dir:'montra-advanced-test-data',world:'0',timeout:180000},
};
async function kill(child){
  if(!child?.pid || child.exitCode!==null || child.signalCode!==null)return;
  const exited=once(child,'exit');child.kill('SIGTERM');const timer=setTimeout(()=>child.kill('SIGKILL'),4000);
  try{await exited;}finally{clearTimeout(timer);}
}
async function run(name){
  const spec=suites[name],home=await mkdtemp(path.join(os.tmpdir(),'montra-isolated-suite-'));
  const chars=path.join(home,spec.dir);await mkdir(chars);
  const env={NODE_ENV:'test',HOME:home,TMPDIR:home,MONTRA_TEST_SANDBOX:home,MONTRA_CHARACTER_DIR:chars,
    MONTRA_ACCOUNTS_REQUIRED:'0',MONTRA_ECONOMY_ENABLED:'1',MONTRA_WORLD_EXPANSION:spec.world,
    MONTRA_HUNT_EVENTS:'0',MONTRA_DIRECTOR_ENABLED:'0',MONTRA_DIRECTOR_PERSIST:'0'};
  let server,test,serverOutput='',testOutput='',serverError,interrupted;
  const onInt=()=>{interrupted='SIGINT';test?.kill('SIGTERM');server?.kill('SIGTERM');};
  const onTerm=()=>{interrupted='SIGTERM';test?.kill('SIGTERM');server?.kill('SIGTERM');};
  process.once('SIGINT',onInt);process.once('SIGTERM',onTerm);
  try{
    server=spawn(process.execPath,['--import',loader,entry],{cwd:home,env,stdio:['ignore','pipe','pipe'],windowsHide:true});
    server.stdout.on('data',buf=>{serverOutput+=buf;});server.stderr.on('data',buf=>{serverOutput+=buf;});server.on('error',err=>{serverError=err;});
    let match;const end=Date.now()+20000;
    while(!(match=serverOutput.match(/CLASS_TEST_PORT=(\d+)/))){
      if(interrupted)throw Error('interrupted by '+interrupted);
      if(serverError)throw serverError;
      if(server.exitCode!==null || server.signalCode!==null)throw Error('server exited before readiness');
      if(Date.now()>end)throw Error('server readiness timed out');await sleep(25);
    }
    const port=Number(match[1]);if(!Number.isInteger(port)||port<1||port>65535)throw Error('bad ephemeral port');
    const testFile=fileURLToPath(new URL('./'+spec.file,import.meta.url));
    test=spawn(process.execPath,['--import',loader,testFile],{cwd:home,env:{...env,MONTRA_TEST_URL:`http://127.0.0.1:${port}`},stdio:['ignore','pipe','pipe'],windowsHide:true});
    test.stdout.on('data',buf=>{testOutput+=buf;process.stdout.write(buf);});test.stderr.on('data',buf=>{testOutput+=buf;process.stderr.write(buf);});
    let timedOut=false;const timer=setTimeout(()=>{timedOut=true;test.kill('SIGKILL');},spec.timeout);
    let code,signal;try{[code,signal]=await once(test,'exit');}finally{clearTimeout(timer);}
    if(interrupted)throw Error('interrupted by '+interrupted);
    if(timedOut || code!==0)throw Error(`${name} failed: ${timedOut?'timeout':`exit ${code} signal ${signal}`}`);
    console.log(`PASS isolated ${name} suite`);
  }catch(error){throw Error(`${String(error)}\nTest output:\n${testOutput}\nServer output:\n${serverOutput}`);}
  finally{process.removeListener('SIGINT',onInt);process.removeListener('SIGTERM',onTerm);await kill(test);await kill(server);await rm(home,{recursive:true,force:true});}
}
for(const suite of selections)await run(suite);
