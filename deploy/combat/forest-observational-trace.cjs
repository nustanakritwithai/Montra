/* Differential, synthetic in-process tests. This trace is not a combat scheduler. */
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {pathToFileURL}=require('node:url');
async function load(dir){
 assert.ok(dir && path.isAbsolute(dir),'pass isolated staging copy path');
 const [{ForestEncounters},{MyRoomState,Player},{ATLAS_SPAWNS}]=await Promise.all(['ForestEncounters.ts','schema/MyRoomState.ts','WorldAtlas.ts'].map(f=>import(pathToFileURL(path.join(dir,f)).href)));
 return {ForestEncounters,MyRoomState,Player,ATLAS_SPAWNS};
}
const position=m=>({x:m.x,y:m.y,z:m.z});
async function scenario(dir,mode){
 const {ForestEncounters,MyRoomState,Player}=await load(dir),state=new MyRoomState(),forest=mode==='baseline'?new ForestEncounters(state.monsters):new ForestEncounters(state.monsters,undefined,mode==='trace');
 forest.initialize(false);const a=state.monsters.get('forest_west_1'),b=state.monsters.get('forest_west_2');
 for(const id of [...state.monsters.keys()])if(id!==a.id&&id!==b.id)state.monsters.delete(id);
 state.players.set('first',new Player({x:a.x+3,y:a.y,z:a.z,mapId:a.mapId,alive:true,hp:100}));
 state.players.set('second',new Player({x:b.x+.5,y:b.y,z:b.z,mapId:b.mapId,alive:true,hp:100}));
 const calls=[],snapshot=()=>[a,b].map(m=>({id:m.id,...position(m),hp:m.hp,alive:m.alive,aiState:m.aiState,targetId:m.targetId}));
 const hit=(target,m,force)=>calls.push({type:'hit',target,id:m.id,force:force??1,actors:snapshot()}),respawn=id=>calls.push({type:'respawn',id,actors:snapshot()});
 const observations=[];
 forest.update(1000,.05,state.players,new Set(),hit,respawn);observations.push(snapshot());
 forest.update(1050,.05,state.players,new Set(),hit,respawn);observations.push(snapshot());
 assert.equal(forest.kill(a.id,1100),true);observations.push(snapshot());
 state.players.clear();forest.update(26100,.05,state.players,new Set(),hit,respawn);observations.push(snapshot());
 return {observations,calls,forest,state,a,b};
}
test('instrumented disabled and enabled gameplay match original forest behavior',async()=>{
 const baseline=await scenario(process.env.FOREST_TRACE_BASELINE,'baseline'),off=await scenario(process.env.FOREST_TRACE_CANDIDATE,'off'),on=await scenario(process.env.FOREST_TRACE_CANDIDATE,'trace');
 for(const actual of [off,on]){assert.deepEqual(actual.observations,baseline.observations);assert.deepEqual(actual.calls,baseline.calls);}
 assert.deepEqual(off.forest.drainTrace(),{events:[],overflow:false,incomplete:false});
 const batch=on.forest.drainTrace();assert.equal(batch.overflow,false);assert.equal(batch.incomplete,false);assert.ok(batch.events.some(e=>e.kind==='move'));assert.ok(batch.events.some(e=>e.kind==='attack_requested'));assert.ok(batch.events.some(e=>e.kind==='died'));assert.ok(batch.events.some(e=>e.kind==='respawned'));
});
test('trace captures mutation and callback request order, snapshots are isolated and deeply frozen',async()=>{
 const {ForestEncounters,MyRoomState,Player}=await load(process.env.FOREST_TRACE_CANDIDATE),state=new MyRoomState(),forest=new ForestEncounters(state.monsters,undefined,true);forest.initialize(false);
 const a=state.monsters.get('forest_west_1'),b=state.monsters.get('forest_west_2');for(const id of [...state.monsters.keys()])if(![a.id,b.id].includes(id))state.monsters.delete(id);
 state.players.set('a',new Player({x:a.x+3,y:a.y,z:a.z,mapId:a.mapId,alive:true}));state.players.set('b',new Player({x:b.x+.5,y:b.y,z:b.z,mapId:b.mapId,alive:true}));
 let reentrant;forest.update(1000,.05,state.players,new Set(),()=>{reentrant=forest.drainTrace();},()=>{});
 assert.deepEqual(reentrant,{events:[],overflow:false,incomplete:true},'a reentrant existing callback cannot drain partial records');
 const batch=forest.drainTrace();assert.equal(batch.overflow,false);assert.equal(batch.incomplete,false);assert.deepEqual(batch.events.map(e=>[e.kind,e.monsterId]),[['move',a.id],['attack_requested',b.id]]);
 assert.ok(Object.isFrozen(batch)&&Object.isFrozen(batch.events));for(const e of batch.events){assert.ok(Object.isFrozen(e));if(e.from)assert.ok(Object.isFrozen(e.from));if(e.to)assert.ok(Object.isFrozen(e.to));}
 const captured=batch.events[0].to.x;a.x+=8;assert.equal(batch.events[0].to.x,captured);assert.notEqual(batch.events[0].to,a);
 assert.deepEqual(forest.drainTrace(),{events:[],overflow:false,incomplete:false});
});
test('regional activation and withdrawal report explicit discontinuities',async()=>{
 const {ForestEncounters,MyRoomState,Player,ATLAS_SPAWNS}=await load(process.env.FOREST_TRACE_CANDIDATE),state=new MyRoomState(),forest=new ForestEncounters(state.monsters,undefined,true);forest.initialize(false);
 const spawn=ATLAS_SPAWNS[0];assert.ok(spawn);state.players.set('traveler',new Player({x:spawn.x,y:0,z:spawn.z,mapId:spawn.mapId,alive:true}));
 forest.update(1000,.05,state.players,new Set(),()=>{},()=>{});const active=forest.drainTrace();assert.ok(active.events.some(e=>e.kind==='activated'&&e.monsterId===spawn.id));
 state.players.clear();forest.update(1050,.05,state.players,new Set(),()=>{},()=>{});const inactive=forest.drainTrace();assert.ok(inactive.events.some(e=>e.kind==='withdrawn'&&e.monsterId===spawn.id));
});
test('bounded buffer marks overflow as incomplete and resets after drain',async()=>{
 const {ForestEncounters,MyRoomState,Player}=await load(process.env.FOREST_TRACE_CANDIDATE),state=new MyRoomState(),forest=new ForestEncounters(state.monsters,undefined,true);forest.initialize(false);
 const m=state.monsters.get('forest_west_1');for(const id of [...state.monsters.keys()])if(id!==m.id)state.monsters.delete(id);
 state.players.set('p',new Player({x:m.x+3,y:m.y,z:m.z,mapId:m.mapId,alive:true}));const x=m.x,z=m.z;
 // Synthetic resets deliberately stress capacity; they are not modeled as game movement.
 for(let i=0;i<1100;i++){m.x=x;m.z=z;forest.update(1000+i*50,.05,state.players,new Set(),()=>{},()=>{});}
 const batch=forest.drainTrace();assert.equal(batch.events.length,1024);assert.equal(batch.overflow,true);assert.equal(batch.incomplete,true);assert.deepEqual(forest.drainTrace(),{events:[],overflow:false,incomplete:false});
});
test('throwing hit callback propagates the same error and marks partial batch incomplete',async()=>{
 const {ForestEncounters,MyRoomState,Player}=await load(process.env.FOREST_TRACE_CANDIDATE),state=new MyRoomState(),forest=new ForestEncounters(state.monsters,undefined,true);forest.initialize(false);
 const a=state.monsters.get('forest_west_1'),b=state.monsters.get('forest_west_2');for(const id of [...state.monsters.keys()])if(id!==a.id&&id!==b.id)state.monsters.delete(id);
 state.players.set('a',new Player({x:a.x+3,y:a.y,z:a.z,mapId:a.mapId,alive:true}));state.players.set('b',new Player({x:b.x+.5,y:b.y,z:b.z,mapId:b.mapId,alive:true}));
 const original=Error('existing hit failed');assert.throws(()=>forest.update(1000,.05,state.players,new Set(),()=>{throw original;},()=>{}),error=>error===original);
 const batch=forest.drainTrace();assert.equal(batch.overflow,false);assert.equal(batch.incomplete,true);assert.deepEqual(batch.events.map(e=>e.kind),['move','attack_requested']);
 assert.deepEqual(forest.drainTrace(),{events:[],overflow:false,incomplete:false});
});
test('throwing respawn callback also marks the trace incomplete without replacing error',async()=>{
 const {ForestEncounters,MyRoomState}=await load(process.env.FOREST_TRACE_CANDIDATE),state=new MyRoomState(),forest=new ForestEncounters(state.monsters,undefined,true);forest.initialize(false);
 const m=state.monsters.get('forest_west_1');for(const id of [...state.monsters.keys()])if(id!==m.id)state.monsters.delete(id);
 assert.equal(forest.kill(m.id,100),true);forest.drainTrace();const original=Error('existing respawn failed');
 assert.throws(()=>forest.update(25100,.05,state.players,new Set(),()=>{},()=>{throw original;}),error=>error===original);
 const batch=forest.drainTrace();assert.equal(batch.incomplete,true);assert.equal(batch.overflow,false);assert.deepEqual(batch.events.map(e=>e.kind),['respawned']);
});
