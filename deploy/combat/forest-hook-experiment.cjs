/* Test-only source fork in an isolated temporary directory. The fork deliberately
 * calls a trusted test hook during iteration and can mutate live test state: it is
 * NOT a safe production API and is never imported by the actual server. */
const {test,after}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createHash}=require('node:crypto'),{pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'../..'),source=path.join(root,'deploy/combat'),staged=path.join(root,'combat-verify/src/rooms');
const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
let temp;
function replaceOnce(text,needle,replacement,label){const first=text.indexOf(needle);if(first<0||text.indexOf(needle,first+needle.length)>=0)throw Error(`unsafe test-only fork: ${label} marker absent or ambiguous`);return text.slice(0,first)+replacement+text.slice(first+needle.length);}
const ready=(async()=>{
 assert.equal(process.env.MONTRA_WORLD_EXPANSION,'1');
 for(const [a,b] of [['ForestEncounters.ts','ForestEncounters.ts'],['MyRoomState.ts','schema/MyRoomState.ts'],['GameRules.ts','GameRules.ts'],['WorldMaps.ts','WorldMaps.ts'],['MonsterRRT.ts','MonsterRRT.ts'],['MonsterProfiles.ts','MonsterProfiles.ts'],['OccultPrototypeRules.ts','OccultPrototypeRules.ts']])assert.equal(hash(path.join(source,a)),hash(path.join(staged,b)),`${a} does not match staged source`);
 temp=fs.mkdtempSync(path.join(os.tmpdir(),'montra-forest-hook-'));
 for(const name of ['baseline','fork']){
  const home=path.join(temp,name);fs.mkdirSync(path.join(home,'src'),{recursive:true});fs.cpSync(staged,path.join(home,'src/rooms'),{recursive:true});
  fs.symlinkSync(path.join(root,'combat-verify/node_modules'),path.join(home,'node_modules'),'dir');fs.writeFileSync(path.join(home,'package.json'),'{"type":"module"}\n');
 }
 const fork=path.join(temp,'fork/src/rooms/ForestEncounters.ts');let code=fs.readFileSync(fork,'utf8');
 code=replaceOnce(code,'export class ForestEncounters {',`export class ForestEncounters {
  // TEST FORK ONLY: deliberately reentrant, not a production interface.
  private __testHook?: (event:any)=>void;
  setTestHook(hook:(event:any)=>void):void { this.__testHook=hook; }
  private __testEvent(event:any):void { if(this.__testHook)this.__testHook(Object.freeze(event)); }
`,'class');
 const life='this.lives.set(id,{actor,zone,x,z,profile,respawnAt:0,lastAttack:-Infinity,returning:false,\n        nextChargeAt:0,windupUntil:0,interruptUntil:0,interruptResistUntil:0,tauntOwner:"",tauntUntil:0,tauntResistUntil:0,nav:new MonsterRRTNavigator(zone.obstacles,zone.map.bounds)});';
 code=replaceOnce(code,life,life+'\n      if(this.__testHook)this.__testEvent({kind:this.monsters.has(id)?"spawn":"initialized_inactive",monsterId:id,mapId:actor.mapId,to:Object.freeze({x:actor.x,y:actor.y,z:actor.z})});','initial spawn');
 const withdraw='if(this.traceEnabled)this.traceEvent({kind:"withdrawn",now,monsterId:id,mapId:life.actor.mapId,from:{x:life.actor.x,y:life.actor.y,z:life.actor.z}});';
 code=replaceOnce(code,withdraw,withdraw+'\n        if(this.__testHook)this.__testEvent({kind:"withdrawn",now,monsterId:id,mapId:life.actor.mapId});','withdraw');
 const active='if(this.traceEnabled)this.traceEvent({kind:"activated",now,monsterId:id,mapId:life.actor.mapId,to:{x:life.actor.x,y:life.actor.y,z:life.actor.z}});';
 code=replaceOnce(code,active,active+'\n        if(this.__testHook)this.__testEvent({kind:"activated",now,monsterId:id,mapId:life.actor.mapId,to:Object.freeze({x:life.actor.x,y:life.actor.y,z:life.actor.z})});','activation');
 const respawn='if(this.traceEnabled)this.traceEvent({kind:"respawned",now,monsterId:id,mapId:m.mapId,to:{x:m.x,y:m.y,z:m.z}});respawn(id);';
 code=replaceOnce(code,respawn,'if(this.__testHook)this.__testEvent({kind:"respawned",now,monsterId:id,mapId:m.mapId,to:Object.freeze({x:m.x,y:m.y,z:m.z})});'+respawn,'respawn');
 code=replaceOnce(code,'const from=(this.traceEnabled || walk) ? {x:m.x,y:m.y,z:m.z} : undefined;','const from=(this.traceEnabled || walk || this.__testHook) ? {x:m.x,y:m.y,z:m.z} : undefined;','movement capture');
 const move='m.facing=facingTo(next.x-m.x,next.z-m.z);m.x=next.x;m.z=next.z;m.y=groundAt(map.id,m.x,m.z);';
 code=replaceOnce(code,move,move+'\n        if(from && this.__testHook)this.__testEvent({kind:"move",now,monsterId:id,mapId:m.mapId,from:Object.freeze({...from}),to:Object.freeze({x:m.x,y:m.y,z:m.z})});','movement commit');
 fs.writeFileSync(fork,code);
 const load=async(folder,file)=>import(pathToFileURL(path.join(temp,folder,'src/rooms',file)).href);
 return {base:await load('baseline','ForestEncounters.ts'),fork:await load('fork','ForestEncounters.ts'),schema:await load('fork','schema/MyRoomState.ts'),baseSchema:await load('baseline','schema/MyRoomState.ts'),rules:await load('fork','OccultPrototypeRules.ts')};
})();
after(()=>{if(temp)fs.rmSync(temp,{recursive:true,force:true});});
function setup(ForestEncounters,MyRoomState,Player,hook){
 const state=new MyRoomState(),forest=new ForestEncounters(state.monsters);if(hook)forest.setTestHook(hook);forest.initialize(false);
 const a=state.monsters.get('forest_west_1'),b=state.monsters.get('forest_west_2');for(const id of [...state.monsters.keys()])if(id!==a.id&&id!==b.id)state.monsters.delete(id);
 Object.assign(a,{x:-27.5,z:-17});Object.assign(b,{x:-27.4,z:-17});state.players.set('hero',new Player({x:-25.8,y:0,z:-17,mapId:'forbidden_forest',alive:true,hp:100,maxHp:100}));return {state,forest,a,b};
}
const snap=m=>({id:m.id,x:m.x,y:m.y,z:m.z,hp:m.hp,alive:m.alive,targetId:m.targetId,aiState:m.aiState});
test('test fork with hook disabled matches unmodified actual module in this synthetic scenario',async()=>{
 const {base,fork,schema,baseSchema}=await ready;
 const cases=[setup(base.ForestEncounters,baseSchema.MyRoomState,baseSchema.Player),setup(fork.ForestEncounters,schema.MyRoomState,schema.Player)];
 const results=[];for(const x of cases){const calls=[],state=()=>[snap(x.a),snap(x.b)];
  x.forest.update(1050,.05,x.state.players,new Set(),(id,m,force)=>calls.push(['hit',id,m.id,force??1,state()]),id=>calls.push(['respawn',id,state()]));const after=state();
  assert.equal(x.forest.kill(x.a.id,1100),true);x.state.players.clear();x.forest.update(26100,.05,x.state.players,new Set(),()=>{},id=>calls.push(['respawn',id,state()]));results.push({after,final:state(),calls});}
 assert.deepEqual(results[1],results[0]);
});
test('actual movement commit can resolve a synthetic trap before a later real forest attack',async()=>{
 const {base,fork,schema,baseSchema,rules}=await ready;
 const normal=setup(base.ForestEncounters,baseSchema.MyRoomState,baseSchema.Player),normalHits=[];
 normal.forest.update(1050,.05,normal.state.players,new Set(),(id,m)=>normalHits.push([id,m.id]),()=>{});assert.deepEqual(normalHits,[['hero','forest_west_2']]);
 let active=rules.createAshTrap(null,{castId:'synthetic',ownerId:'test-seer',mapId:'forbidden_forest',position:{x:-27.42,y:0,z:-17},now:0,armDelayMs:1000,durationMs:5000,radius:.06});
 const log=[];let x;
 const hook=e=>{if(e.kind!=='move'||e.monsterId!=='forest_west_1')return;log.push('movement-committed');
  const result=rules.observeTrapBatch(active,{now:e.now,ownerValid:true,movements:[{previousAt:1000,monsterId:e.monsterId,mapId:e.mapId,previous:e.from,current:e.to,eligible:true}]});
  active=result.state;if(result.event?.type!=='trap_triggered')return;log.push('trap-consumed');
  const candidates=[x.a,x.b].map(m=>({id:m.id,mapId:m.mapId,alive:m.alive,position:{x:m.x,y:m.y,z:m.z}}));
  const ids=rules.selectTrapTargets(result.event,candidates,()=>true);assert.deepEqual(ids,['forest_west_1','forest_west_2']);
  for(const id of ids){assert.equal(x.forest.kill(id,e.now),true);log.push('killed:'+id);}
 };
 x=setup(fork.ForestEncounters,schema.MyRoomState,schema.Player,hook);const hits=[];
 x.forest.update(1050,.05,x.state.players,new Set(),(id,m)=>hits.push([id,m.id]),()=>{});
 assert.deepEqual(log,['movement-committed','trap-consumed','killed:forest_west_1','killed:forest_west_2']);assert.deepEqual(hits,[]);assert.equal(x.a.alive,false);assert.equal(x.b.alive,false);assert.equal(active,null);
});
test('test hook labels initial spawn, regional activation and withdrawal, and respawn as discontinuities',async()=>{
 const {fork,schema}=await ready,{ATLAS_SPAWNS}=await import(pathToFileURL(path.join(temp,'fork/src/rooms/WorldAtlas.ts')).href),events=[];
 const state=new schema.MyRoomState(),forest=new fork.ForestEncounters(state.monsters);forest.setTestHook(e=>events.push(e));forest.initialize(false);
 const initial=events.filter(e=>e.kind==='spawn');assert.ok(initial.some(e=>e.monsterId==='forest_west_1'));assert.ok(initial.every(e=>e.from===undefined));events.length=0;
 const m=state.monsters.get('forest_west_1');assert.equal(forest.kill(m.id,100),true);m.x+=4;
 forest.update(25100,.05,state.players,new Set(),()=>{},()=>{});assert.ok(events.some(e=>e.kind==='respawned'&&e.monsterId===m.id));assert.equal(events.some(e=>e.kind==='move'&&e.monsterId===m.id),false);
 events.length=0;const region=ATLAS_SPAWNS[0];state.players.set('traveler',new schema.Player({x:region.x,y:0,z:region.z,mapId:region.mapId,alive:true}));
 forest.update(25200,.05,state.players,new Set(),()=>{},()=>{});assert.ok(events.some(e=>e.kind==='activated'&&e.monsterId===region.id));events.length=0;
 state.players.clear();forest.update(25250,.05,state.players,new Set(),()=>{},()=>{});assert.ok(events.some(e=>e.kind==='withdrawn'&&e.monsterId===region.id));
});
test('throwing test hook demonstrates partial movement and stops later actors; it is not a safe production callback',async()=>{
 const {fork,schema}=await ready;let x;const thrown=Error('test hook failure');
 x=setup(fork.ForestEncounters,schema.MyRoomState,schema.Player,e=>{if(e.kind==='move'&&e.monsterId==='forest_west_1')throw thrown;});const initial=x.a.x,hits=[];
 assert.throws(()=>x.forest.update(1050,.05,x.state.players,new Set(),(id,m)=>hits.push(m.id),()=>{}),e=>e===thrown);
 assert.ok(x.a.x>initial,'movement was already committed');assert.deepEqual(hits,[],'later actor was not processed');
});
