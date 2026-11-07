'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');
const {parts,root}=require('./fixtures/chat-live-fixture.cjs');
const {fixture}=require('./fixtures/chat-controller-harness.cjs');
const f=fixture({
  state004:parts.controller+'\n'+parts.commandBindings,
  view042:parts.view,controls046:parts.controls,
  message044:parts.message,report044:parts.report,
});
f.env.drawerActive=null;
f.evaluate(parts.rejection);
f.tab('map');f.input('invalid\u0001control');f.submit();f.submit();
const sends=()=>f.trace.filter(entry=>entry[0]==='send');
assert.equal(sends().length,1,'Same-turn pending suppression');
f.handlers.get('command_rejected')({reason:'invalid_chat'});
assert.equal(f.nodes.get('cb-input').value,'invalid\u0001control');
assert(![...f.timers.values()].some(timer=>timer.ms===5000),'Rejection clears pending timer');
assert(f.trace.some(entry=>entry[0]==='toast'&&entry[1]==='ข้อความไม่ถูกต้องหรือยาวเกิน 200 ตัวอักษร'));
f.input('retry');f.submit();assert.equal(sends().length,2,'Immediate retry after rejection');
f.receive(f.message({senderId:'self',text:'retry'}));assert.equal(f.nodes.get('cb-input').value,'');
assert(![...f.timers.values()].some(timer=>timer.ms===5000),'Real-handler acknowledgement clears pending timer');
// Verify the installed SDK listener contract used by packet observations.
const {Room}=require(path.join(root,'combat-verify/node_modules/@colyseus/sdk/build/index.cjs'));
const room=new Room('fixture'),observed=[];
room.onMessage('*',(type,data)=>observed.push(['fallback',type,data]));
room.onMessage('chat_message',data=>observed.push(['production',data]));
room.onMessage('chat_message',data=>observed.push(['observer',data]));
room.dispatchMessage('chat_message',{text:'packet'});
assert.deepEqual(observed,[['production',{text:'packet'}],['observer',{text:'packet'}]]);
console.log('PASS live fixture unit contracts: exact rejection/ack bindings, pending reset and SDK observation (synthetic unit test, no browser)');

// The same preload must prevent dotenv from importing host credentials/settings.
const {spawnSync}=require('node:child_process');
const os=require('node:os'),fs=require('node:fs');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'montra-chat-env-test-'));
try {
  const envFile=path.join(dir,'.env');
  fs.writeFileSync(envFile,'MONTRA_TEST_POISON=must-not-load\nMONTRA_CHARACTER_DIR=must-not-override\n');
  const check=spawnSync(process.execPath,['--require',path.join(__dirname,'fixtures/chat-live-env.cjs'),'-e',
    `const assert=require('node:assert/strict');require('dotenv').config({path:process.argv[1],override:true});assert.equal(process.env.MONTRA_TEST_POISON,undefined);assert.equal(process.env.MONTRA_CHARACTER_DIR,'isolated');`,envFile],
    {cwd:path.join(root,'combat-verify'),env:{PATH:process.env.PATH,MONTRA_CHARACTER_DIR:'isolated'},encoding:'utf8'});
  assert.equal(check.status,0,check.stderr);
  console.log('PASS live server dotenv isolation preload');
} finally {fs.rmSync(dir,{recursive:true,force:true});}
