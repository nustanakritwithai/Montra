'use strict';
// Explicit live-workflow check; never discovered by the dependency-free client glob.
const assert=require('node:assert/strict');
const path=require('node:path');
const {root}=require('./fixtures/chat-live-fixture.cjs');
// Verify the installed SDK listener contract used by packet observations.

const {Room}=require(path.join(root,'combat-verify/node_modules/@colyseus/sdk/build/index.cjs'));
const room=new Room('fixture'),observed=[];
room.onMessage('*',(type,data)=>observed.push(['fallback',type,data]));
room.onMessage('chat_message',data=>observed.push(['production',data]));
room.onMessage('chat_message',data=>observed.push(['observer',data]));
room.dispatchMessage('chat_message',{text:'packet'});
assert.deepEqual(observed,[['production',{text:'packet'}],['observer',{text:'packet'}]]);
console.log('PASS installed SDK observation contract (synthetic unit test, no browser)');

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
