import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {EventEmitter,once} from 'node:events';
import {childEnded,assertTestChildRunning,stopTestChild,leaveTestRoom,joinTestRoom,isPrototypeAdmissionRejection} from './prototype-test-process.mjs';

test('cleanup returns for an already signal-terminated synthetic child',async()=>{
 const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});
 const exited=once(child,'exit');child.kill('SIGTERM');await exited;
 assert.equal(childEnded(child),true);assert.throws(()=>assertTestChildRunning(child,undefined,'signaled'),/signaled/);
 await stopTestChild(child,{graceMs:100,killWaitMs:100});
});
test('cleanup observes a live synthetic child without missing exit',async()=>{
 const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});
 await stopTestChild(child,{graceMs:500,killWaitMs:500});assert.equal(childEnded(child),true);
});
test('cleanup escalates and remains bounded when a child ignores SIGTERM',async()=>{
 const child=Object.assign(new EventEmitter(),{pid:1,exitCode:null,signalCode:null});
 const signals=[];
 // A synthetic child can ignore TERM on every platform, including Windows.
 child.kill=signal=>{
  signals.push(signal);
  if(signal==='SIGKILL'){
   child.signalCode=signal;
   queueMicrotask(()=>child.emit('exit',null,signal));
  }
  return true;
 };
 await stopTestChild(child,{graceMs:10,killWaitMs:500});
 assert.deepEqual(signals,['SIGTERM','SIGKILL']);assert.equal(childEnded(child),true);
});

test('spawn errors fail startup promptly and cleanup never waits for a missing PID',async()=>{
 const child=spawn('/nonexistent/montra-synthetic-process',[],{stdio:'ignore'});
 const [error]=await once(child,'error');assert.throws(()=>assertTestChildRunning(child,error),/ENOENT/);
 await stopTestChild(child,{graceMs:100,killWaitMs:100});
});

test('stalled room leave times out and does not prevent synthetic child termination',async()=>{
 const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});
 try {await assert.rejects(leaveTestRoom({leave:()=>new Promise(()=>{})},30),/leave timed out/);}
 finally {await stopTestChild(child,{graceMs:500,killWaitMs:500});}
 assert.equal(childEnded(child),true);
});

test('stalled join times out, late rejection is handled, and child is terminated',async()=>{
 const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});let rejectJoin;
 const pending=new Promise((_,reject)=>{rejectJoin=reject;});
 try {
  await assert.rejects(joinTestRoom(()=>pending,30),/join timed out/);
  rejectJoin(new Error('late failure'));await new Promise(resolve=>setTimeout(resolve,20));
 } finally {await stopTestChild(child,{graceMs:500,killWaitMs:500});}
 assert.equal(childEnded(child),true);
});
test('room arriving after join timeout is closed',async()=>{
 let finishJoin,closed=false;const pending=new Promise(resolve=>{finishJoin=resolve;});
 await assert.rejects(joinTestRoom(()=>pending,30),/join timed out/);
 finishJoin({leave:async()=>{closed=true;}});await new Promise(resolve=>setTimeout(resolve,20));assert.equal(closed,true);
});

test('process watchdog bounds a leaked synthetic handle',async()=>{
 const helper=new URL('./prototype-test-process.mjs',import.meta.url).href;
 const code=`import {armTestDeadline} from ${JSON.stringify(helper)};armTestDeadline(50);setInterval(()=>{},1000);`;
 const child=spawn(process.execPath,['--input-type=module','-e',code],{stdio:'ignore'});
 let timer;
 try {
  const [exitCode]=await Promise.race([once(child,'exit'),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('watchdog failed')),3000);})]);
  assert.equal(exitCode,1);
 } finally {clearTimeout(timer);await stopTestChild(child,{graceMs:100,killWaitMs:500});}
});

test('incompatible admission assertion fails on timeout or transport error',async()=>{
 const stalled=joinTestRoom(()=>new Promise(()=>{}),20);
 await assert.rejects(assert.rejects(stalled,isPrototypeAdmissionRejection),{name:'AssertionError'});
 const transport=Promise.reject(Object.assign(new Error('connection refused'),{name:'MatchMakeError',code:526}));
 await assert.rejects(assert.rejects(transport,isPrototypeAdmissionRejection),{name:'AssertionError'});
 assert.equal(isPrototypeAdmissionRejection({name:'MatchMakeError',code:526,message:'prototype_client_required'}),true);
});
