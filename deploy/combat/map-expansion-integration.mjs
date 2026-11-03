/** Isolated test server only: never use live saves or a public endpoint. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {Client} from '@colyseus/sdk';
const endpoint=process.env.MONTRA_TEST_URL,dir=process.env.MONTRA_CHARACTER_DIR;
if(!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(endpoint||'')||!dir||!path.basename(dir).startsWith('montra-world-test-'))throw Error('isolated world test environment required');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label,ms=6000){const end=Date.now()+ms;while(Date.now()<end){if(fn())return;await sleep(50)}throw Error('timeout: '+label)}
const token=n=>'mt1_'+String(n).repeat(64);
const digest=(t,slot=1)=>createHash('sha256').update(slot===1?t:'MONTRA/CHARACTER-SLOT/v1/'+slot+'/'+t).digest('hex');
const file=(t,slot=1)=>path.join(dir,digest(t,slot)+'.json');
const own=r=>r.state?.players?.get(r.sessionId);
const rooms=[];
async function open(t,roomId,slot=1){const c=new Client(endpoint);const opts={guestToken:t,characterSlot:slot,worldVersion:1};const r=roomId?await c.joinById(roomId,opts):await c.create('my_room',opts);rooms.push(r);r.onMessage('*',()=>{});await until(()=>own(r),'join');return r;}
async function leave(r){await r.leave();rooms.splice(rooms.indexOf(r),1);await sleep(250);}
async function seed(t,mapId,x,z,slot=1){const r=await open(t,undefined,slot);await leave(r);const f=file(t,slot),s=JSON.parse(await readFile(f,'utf8'));s.level=1;s.experience=0;s.hp=240;s.stamina=100;s.mapId=mapId;s.x=x;s.y=0;s.z=z;s.build={path:'seer',ancestry:'woodland'};s.inventory.slots[0].quantity=2;await writeFile(f,JSON.stringify(s));}
try{
 if(process.env.MONTRA_MAP_TEST_STAGE==='read'){
   const expected=JSON.parse(await readFile(path.join(dir,'map-restart-expectations.json'),'utf8'));
   for(const e of expected){const r=await open(e.token,undefined,e.slot);const p=own(r);assert.equal(p.mapId,e.mapId);assert.ok(Math.abs(p.x-e.x)<1e-5,'wire X within float32 precision');assert.ok(Math.abs(p.z-e.z)<1e-5,'wire Z within float32 precision');assert.equal(p.level,e.level);assert.equal(p.experience,e.experience);await leave(r);const disk=JSON.parse(await readFile(file(e.token,e.slot),'utf8'));assert.equal(disk.x,e.x);assert.equal(disk.z,e.z);assert.equal(disk.inventory.slots[0].quantity,2);}
   console.log('PASS: actual process restart preserves all 3 expanded-map slots and inventory');
 }else{
   await assert.rejects(new Client(endpoint).create('my_room',{}),/world_client_update_required/);
   await mkdir(dir,{recursive:true});
   for(const slot of [1,2,3])await seed(token(1),'forbidden_forest',30+slot,-40,slot);
   await seed(token(2),'ritual_village',0,0);await seed(token(3),'forbidden_forest',-33,-20);await seed(token(4),'ritual_village',2,0);
   const a=await open(token(1)),b=await open(token(2),a.roomId),c=await open(token(3),a.roomId),d=await open(token(4),a.roomId);
   await until(()=>a.state.monsters && [...a.state.monsters.values()].filter(m=>m.mapId==='forbidden_forest').length===17 && a.state.players.size===4,'all four clients and 17 forest enemies');
   const manifest=JSON.parse(a.state.worldDefinition);assert.equal(manifest.maps.forbidden_forest.bounds.maxX,60);
   const rejects=[];b.onMessage('command_rejected',e=>rejects.push(e.reason));
   b.send('attack',{targetId:d.sessionId});await until(()=>rejects.includes('target_unavailable'),'safe town rejects PK');
   await sleep(1100);rejects.length=0;b.send('shoot',{targetId:'forest_west_1'});await until(()=>rejects.includes('target_unavailable'),'cross-map monster rejected');
   a.send('move',{x:35,z:-40});await until(()=>Math.abs(own(a).x-35)<.1,'walk past old boundary');
   a.send('dash',{dx:1,dz:0});await until(()=>own(a).x>39,'dash past old boundary');
   a.send('summon',{});await until(()=>a.state.summons.get(a.sessionId)?.x>35,'guardian follows outside old boundary');
   a.send('fly',{});await until(()=>own(a).flying&&Math.abs(own(a).y-6)<.1,'flight outside old boundary');
   a.send('move',{x:45,z:-40});await until(()=>own(a).x>44.8,'flying movement');
   a.send('fly',{});await until(()=>!own(a).flying&&own(a).y===0,'landing');
   const hits=[];c.onMessage('experience_gained',e=>hits.push(e));
   const target=c.state.monsters.get('forest_west_1'),startingHp=target.hp;
   c.send('attack',{targetId:target.id});
   await until(()=>target.hp<startingHp,'first forest hit');
   await until(()=>hits.length===1,'forest kill awards EXP',35000);assert.equal(hits[0].amount,125);
   await until(()=>c.state.monsters.get('forest_west_1').alive===false,'dead enemy state patch');assert.equal(c.state.monsters.get('forest_west_2').alive,true);
   const cHp=own(c).hp;c.send('move',{x:-40,z:-30});await sleep(500);assert.ok(cHp>0);
   const bad=[];a.onMessage('command_rejected',e=>bad.push(e.reason));a.send('move',{x:999,z:-40});await until(()=>bad.includes('invalid_move'),'bounds forgery rejected');
   await leave(d);await leave(b);await leave(c);await leave(a);
   await seed(token(5),'ritual_village',-4,-17);const w=await open(token(5));
   w.send('warp',{portalId:'village_to_forest'});await until(()=>own(w).mapId==='forbidden_forest','warp to expanded forest');assert.equal(own(w).z,12);
   // Cooldown uses simulation time; a busy render/test host may advance it slower than wall time.
   let warpRejection;w.onMessage('command_rejected',notice=>{warpRejection=notice.reason;});
   for(let attempt=0;attempt<10 && own(w).mapId!=='ritual_village';attempt++){
     await sleep(attempt===0?3100:650);warpRejection=undefined;
     w.send('warp',{portalId:'forest_to_village'});
     await until(()=>own(w).mapId==='ritual_village'||warpRejection,'return warp response');
     if(warpRejection)assert.equal(warpRejection,'warp_cooldown');
   }
   assert.equal(own(w).mapId,'ritual_village');await leave(w);
   const expected=[];for(const slot of [1,2,3]){const disk=JSON.parse(await readFile(file(token(1),slot),'utf8'));assert.equal(disk.inventory.slots[0].quantity,2);expected.push({token:token(1),slot,mapId:disk.mapId,x:disk.x,z:disk.z,level:disk.level,experience:disk.experience});}
   await writeFile(path.join(dir,'map-restart-expectations.json'),JSON.stringify(expected));
   console.log('PASS: four players, 16 enemies plus the guardian, safe zones, cross-map rejection, extended walk/dash/flight/summon, EXP, bounds and return warp');
 }
}finally{for(const r of [...rooms].reverse())await r.leave().catch(()=>{});}
