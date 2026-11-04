/** Only run against a private server and disposable montra-resource-test-* data. */
import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {Client} from '@colyseus/sdk';

const endpoint=process.env.MONTRA_TEST_URL,dir=process.env.MONTRA_CHARACTER_DIR;
if(!/^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/.test(endpoint||'') || !dir || !path.basename(dir).startsWith('montra-resource-test-'))throw Error('isolated resource test environment required');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn,label,timeout=10000){const end=Date.now()+timeout;while(Date.now()<end){const value=fn();if(value)return value;await sleep(40);}throw Error('timeout: '+label);}
const rooms=[];
try{
  await mkdir(dir,{recursive:true});
  for(const spec of [
    {kind:'wood',node:'forbidden_forest/tree-west-1',x:-3.4,z:6},
    {kind:'stone',node:'forbidden_forest/stone-north-1',x:8,z:-9},
  ]){
    const token='mt1_'+randomBytes(32).toString('hex');
    const id=createHash('sha256').update(token).digest('hex');
    const slots=new Array(12).fill(null);slots[0]={itemId:'health_potion',quantity:2};slots[1]={itemId:'ritual_dagger',quantity:1};
    await writeFile(path.join(dir,id+'.json'),JSON.stringify({version:1,id,name:'Gather QA',level:1,experience:0,pkKills:0,pkDeaths:0,x:spec.x,y:0,z:spec.z,hp:240,mapId:'forbidden_forest',inventory:{version:1,slots,equippedWeaponSlot:1},updatedAt:new Date().toISOString()}),{flag:'wx'});
    const room=await new Client(endpoint).create('my_room',{guestToken:token,worldVersion:1});rooms.push(room);
    const events=[];room.onMessage('*',(type,data)=>events.push({type,data}));
    await until(()=>room.state?.players?.get(room.sessionId),'join');
    room.send('harvest_resource',{node:spec.kind==='wood'?'forbidden_forest/stone-north-1':'forbidden_forest/tree-west-1',requestId:'far_'+randomBytes(12).toString('hex')});
    const error=await until(()=>events.find(e=>e.type==='economy_error'),'far rejection');assert.equal(error.data.reason,'resource_range');
    await sleep(500);
    room.send('harvest_resource',{node:spec.node,requestId:'near_'+randomBytes(12).toString('hex')});
    const result=await until(()=>events.find(e=>e.type==='resource_result'),'near harvest');
    assert.equal(result.data.action,'harvest');assert.equal(result.data.item,`mat_raw_${spec.kind}_1`);assert.ok(result.data.quantity>0);
  }
  console.log('PASS: actual server players reject distant nodes and gather nearby forest wood and stone');
}finally{for(const room of rooms.reverse())await room.leave().catch(()=>{});}
