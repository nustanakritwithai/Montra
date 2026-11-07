'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { root } = require('./chat-live-fixture.cjs');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function startServer() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'montra-chat-private-test-'));
  const cwd = path.join(root, 'combat-verify');
  // Reuse the canonical generated server; bind only loopback for this gate.
  const source = fs.readFileSync(path.join(cwd, 'src/index.ts'), 'utf8');
  const listen = 'server.listen(Number(process.env.PORT || 4108))';
  assert.equal(source.split(listen).length, 2);
  const entry = path.join(cwd, 'src/chat-live-' + path.basename(directory) + '.ts');
  fs.writeFileSync(entry, source.replace(listen, 'server.listen(Number(process.env.PORT), "127.0.0.1")') + '\nready.then(() => process.send?.({type: "montra-chat-ready"}));\n');
  const reservation = net.createServer();
  await new Promise((resolve,reject)=>{reservation.once('error',reject);reservation.listen(0,'127.0.0.1',resolve);});
  const port = reservation.address().port;
  await new Promise(resolve=>reservation.close(resolve));
  // Do not inherit credentials, external endpoints, proxies, NODE_OPTIONS or stores.
  const env = { PATH: process.env.PATH, NODE_ENV: 'test', PORT: String(port),
    MONTRA_CHARACTER_DIR: directory, MONTRA_TEST_URL: `http://127.0.0.1:${port}`,
    MONTRA_ACCOUNTS_REQUIRED: '0', MONTRA_ECONOMY_ENABLED: '1',
    MONTRA_WORLD_EXPANSION: '0', MONTRA_HUNT_EVENTS: '0',
    MONTRA_DIRECTOR_ENABLED: '0', MONTRA_DIRECTOR_PERSIST: '0',
    MONTRA_TYPHOON_API_KEY: '', TYPHOON_API_KEY: '' };
  const child = spawn(process.execPath, ['--require',path.join(__dirname,'chat-live-env.cjs'),'--import','tsx',entry], {cwd,env,stdio:['ignore','pipe','pipe','ipc']});
  let log = ''; child.stdout.on('data',data=>{log+=data;});child.stderr.on('data',data=>{log+=data;});
  let ready = false;child.on('message',message=>{if(message?.type==='montra-chat-ready')ready=true;});
  let spawnError;child.on('error',error=>{spawnError=error;});
  const closed = once(child,'close').catch(()=>{});
  const stop = async()=>{
    if(child.exitCode===null && !spawnError){child.kill('SIGTERM');await Promise.race([closed,sleep(3000)]);if(child.exitCode===null){child.kill('SIGKILL');await closed;}}
    fs.rmSync(entry,{force:true});fs.rmSync(directory,{recursive:true,force:true});
  };
  try {
    for(let attempt=0;attempt<100;attempt++){
      if(spawnError)throw spawnError;
      if(child.exitCode!==null)throw new Error(`Server exited: ${log}`);
      try {if(!ready){await sleep(100);continue;}await fetch(env.MONTRA_TEST_URL+'/montra/account/slots',{signal:AbortSignal.timeout(500)});return {env,cwd,endpoint:env.MONTRA_TEST_URL,stop,log:()=>log};}catch{}
      await sleep(100);
    }
    throw new Error(`Server readiness timeout: ${log}`);
  } catch(error){await stop();throw error;}
}
module.exports={startServer,sleep};
