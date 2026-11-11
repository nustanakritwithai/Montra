// Test-only entry point: the runner creates an isolated temporary process.
import path from 'node:path';
import {writeSync} from 'node:fs';
import {defineServer, defineRoom} from 'colyseus';
import {MyRoom} from './MyRoom.js';
import {characterStore} from './CharacterStore.js';

const base = process.cwd();
const folder = path.basename(process.env.MONTRA_CHARACTER_DIR || '');
const economy = process.env.MONTRA_ECONOMY_ENABLED;
const classSuite = ['montra-class-skills-test-data', 'montra-advanced-test-data'].includes(folder) && economy === '1';
const restoreSuite = path.basename(base).startsWith('montra-skill-ws-restore-') &&
  ['source', 'restore'].includes(folder) && (economy === '0' || economy === '1');
if (process.env.NODE_ENV !== 'test' || process.env.MONTRA_TEST_SANDBOX !== base ||
    process.env.MONTRA_CHARACTER_DIR !== path.join(base, folder) ||
    !(classSuite || restoreSuite) || process.env.MONTRA_ACCOUNTS_REQUIRED !== '0' ||
    process.env.MONTRA_PROTOTYPE_PROTOCOL_V1 || process.env.MONTRA_ISOLATED_STAGING)
  throw new Error('unsafe class or restore test environment');
// No gameplay override: exercise the candidate's actual hard-disabled switch.
if ((new MyRoom() as unknown as {prototypeGameplayEnabled():boolean}).prototypeGameplayEnabled() !== false)
  throw new Error('prototype gameplay must remain hard-disabled');
// The integration parent kills only this disposable process at the checkpoint.
if(process.env.MONTRA_TEST_CRASH_AFTER_REWARD_PREPARE==='1'){
  if(!restoreSuite || folder!=='source')throw new Error('unsafe reward crash fixture');
  const checkpoint=():never=>{
    writeSync(1,'MONTRA_TEST_REWARD_PREPARED\n');
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0);
    throw new Error('reward crash fixture resumed');
  };
  if(characterStore.economyEnabled){
    const database=characterStore.economy,stage=database.stageMonsterReward.bind(database);
    database.stageMonsterReward=(id,snapshot)=>{stage(id,snapshot);checkpoint();};
  }else{
    const fixture=characterStore as unknown as {commitJsonMonsterReward:(id:string)=>Promise<void>};
    fixture.commitJsonMonsterReward=()=>checkpoint();
  }
}
const server=defineServer({rooms:{my_room:defineRoom(MyRoom)},gracefullyShutdown:false});
await server.listen(0,'127.0.0.1');
const addr=server.transport.server?.address();
if (!addr || typeof addr==='string' || addr.address!=='127.0.0.1')throw new Error('loopback binding required');
console.log('CLASS_TEST_PORT='+addr.port);
