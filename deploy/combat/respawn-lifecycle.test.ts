import test from "node:test";
import assert from "node:assert/strict";
import {LegacyRespawns} from "./respawn-lifecycle-oracle.js";
import {Player} from "./schema/MyRoomState.js";
import {RULES} from "./GameRules.js";
function fixture(){
  const o=new LegacyRespawns(), events:string[]=[];
  o.broadcast=(type)=>events.push(type);o.saveCharacter=id=>{events.push(`save:${id}`);};o.monsterNavigator.clear=()=>{events.push("nav");};
  for(const id of ["a","b"]){o.state.players.set(id,new Player({alive:false,hp:0,flying:true}));o.playerRespawnAt.set(id,10);o.climbs.set(id,{});o.flightTransitions.set(id,{});o.activeDashes.set(id,{});o.lastAttackMs.set(id,5);}
  o.state.monster.alive=false;o.state.monster.hp=0;o.monsterRespawnAt=10;
  return {o,events};
}
test("original respawn exact boundary, monster first, player identity and cleanup before notice/save",()=>{
  const {o,events}=fixture(),a=o.state.players.get("a")!;o.simulatedMs=9;o.updateRespawns();assert.deepEqual(events,[]);
  o.simulatedMs=10;o.updateRespawns();assert.deepEqual(events,["nav","monster_respawn","player_respawn","save:a","player_respawn","save:b"]);
  assert.equal(o.state.players.get("a"),a);assert.equal(a.alive,true);assert.equal(a.hp,a.maxHp);assert.equal(a.flying,false);assert.equal(o.climbs.size,0);assert.equal(o.flightTransitions.size,0);assert.equal(o.activeDashes.size,0);assert.equal(o.lastAttackMs.size,0);assert.equal(o.lastMonsterAttackMs,-Infinity);assert.equal(o.monsterRespawnAt,0);assert.equal(o.state.monster.x,RULES.monsterSpawnX);
  o.updateRespawns();assert.equal(events.length,6);
});
test("original missing players consume deadlines, live iteration observes callback insertions",()=>{
  const {o,events}=fixture();o.simulatedMs=10;o.state.players.delete("a");
  o.saveCharacter=id=>{events.push(`save:${id}`);if(id==="b"){o.state.players.set("c",new Player({alive:false}));o.playerRespawnAt.set("c",10);}};
  o.updateRespawns();assert.deepEqual(events,["nav","monster_respawn","player_respawn","save:b","player_respawn","save:c"]);assert.equal(o.playerRespawnAt.size,0);
});
test("original camp fallback precedes mutation and throwing transport consumes only current deadline",()=>{
  const {o,events}=fixture();o.simulatedMs=10;o.warSeats.set("a",{camp:"lost"});o.clients.push({sessionId:"a",send:()=>{events.push("fallback");throw Error("transport");}});
  assert.throws(()=>o.updateRespawns(),/transport/);assert.deepEqual(events,["nav","monster_respawn","fallback"]);assert.equal(o.state.players.get("a")!.alive,false);assert.equal(o.playerRespawnAt.has("a"),false);assert.equal(o.playerRespawnAt.has("b"),true);
});
test("original zero monster deadline disabled and future player deadline retained",()=>{
 const {o,events}=fixture();o.monsterRespawnAt=0;o.simulatedMs=9;o.updateRespawns();assert.deepEqual(events,[]);assert.equal(o.playerRespawnAt.size,2);
});

import {RespawnLifecycle,type RespawnPorts} from "./RespawnLifecycle.js";
import {MyRoom} from "./MyRoom.js";
type Internals={players:Map<string,number>;monsterAt:number};
function extracted(o:LegacyRespawns){
  const owner=new RespawnLifecycle();
  for(const [id,at] of o.playerRespawnAt)owner.schedulePlayer(id,at);
  owner.scheduleMonster(o.monsterRespawnAt);
  // Test instrumentation only. No production caller receives the owned Map.
  const state=owner as unknown as Internals;
  o.playerRespawnAt=state.players;
  Object.defineProperty(o,"monsterRespawnAt",{get:()=>state.monsterAt,set:(at:number)=>owner.scheduleMonster(at)});
  const ports:RespawnPorts<Player>={
    now:()=>o.simulatedMs,clearMonsterNavigation:()=>o.monsterNavigator.clear(),
    monsterRespawned:()=>{o.lastMonsterAttackMs=-Infinity;o.broadcast("monster_respawn",{targetId:RULES.monsterId});},
    player:id=>o.state.players.get(id),
    spawn:id=>{const camp=o.warSeats.get(id)?.camp,front=camp?o.fieldCamp(id,camp):undefined;
      const spawn=front ?? o.playerSpawn.get(id) ?? {x:0,z:0};
      if(camp && !front)o.clients.find(c=>c.sessionId===id)?.send("territory_error",{reason:"war_camp_fallback"});return spawn;},
    clearVertical:id=>{o.climbs.delete(id);o.flightTransitions.delete(id);},clearDash:id=>{o.activeDashes.delete(id);},
    playerRespawned:id=>{o.lastAttackMs.delete(id);o.broadcast("player_respawn",{playerId:id});void o.saveCharacter(id);},
  };
  return {owner,ports,run:()=>owner.update(o.state.monster,ports)};
}
function snapshot(o:LegacyRespawns,events:unknown[]){return {events,players:[...o.state.players].map(([id,p])=>[id,p.toJSON()]),monster:o.state.monster.toJSON(),pending:[...o.playerRespawnAt],monsterAt:o.monsterRespawnAt,lastMonsterAttack:o.lastMonsterAttackMs,climbs:[...o.climbs],flight:[...o.flightTransitions],dash:[...o.activeDashes],attack:[...o.lastAttackMs]};}
function result(run:()=>void){try{run();return "ok";}catch(error){return (error as Error).message;}}

test("differential owner and actual room adapter preserve normal, interrupted and reentrant transitions",()=>{
  for(const adapter of [false,true])for(const mode of ["normal","missing","fallback","front","nav-throw","notify-throw","save-throw","insert","reenter","clock-change"]){
    const old=fixture(),next=fixture(),runtime=extracted(next.o);
    // Invoke the real room adapter against a constrained fake room, not a rewritten adapter.
    const room=Object.assign(next.o,{respawns:runtime.owner});
    const roomRun=()=> (MyRoom.prototype as unknown as {updateRespawns():void}).updateRespawns.call(room);
    for(const {o,events} of [old,next]){
      o.simulatedMs=10;
      o.playerSpawn.set("a",{x:2,z:3});
      if(mode==="missing")o.state.players.delete("a");
      if(mode==="fallback" || mode==="front"){
        o.warSeats.set("a",{camp:"camp"});o.clients.push({sessionId:"a",send:(type,payload)=>{events.push(JSON.stringify([type,payload]));if(mode==="fallback")throw Error("fallback");}});
        if(mode==="front")o.fieldCamp=()=>({x:4,z:5});
      }
      if(mode==="nav-throw")o.monsterNavigator.clear=()=>{events.push("nav");throw Error("nav");};
      if(mode==="notify-throw")o.broadcast=(type)=>{events.push(type);if(type==="player_respawn")throw Error("notice");};
      let reentered=false;
      o.saveCharacter=id=>{
        events.push(`save:${id}`);
        if(mode==="save-throw")throw Error("save");
        if(mode==="clock-change")o.simulatedMs=0;
        if(mode==="insert" && id==="a"){o.state.players.set("c",new Player({alive:false}));o.playerRespawnAt.set("c",10);}
        if(mode==="reenter" && !reentered){reentered=true;if(o===old.o)o.updateRespawns();else if(adapter)roomRun();else runtime.run();}
      };
    }
    const before=next.o.state.players.get("a");
    assert.equal(result(adapter?roomRun:runtime.run),result(()=>old.o.updateRespawns()),`${adapter}/${mode}`);
    assert.deepEqual(snapshot(next.o,next.events),snapshot(old.o,old.events),`${adapter}/${mode}`);
    assert.equal(next.o.state.players.get("a"),before);
  }
});

test("seeded differential schedule, overwrite, cancellation, clear and due processing",()=>{
 const old=fixture(),next=fixture(),runtime=extracted(next.o);let seed=6756;
 const rand=(n:number)=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};
 for(let i=0;i<700;i++){
  const id=["a","b","missing"][rand(3)],at=rand(8)*10,op=rand(5);
  if(op===0){old.o.playerRespawnAt.set(id,at);runtime.owner.schedulePlayer(id,at);}
  if(op===1){old.o.playerRespawnAt.delete(id);runtime.owner.forgetPlayer(id);}
  if(op===2){old.o.playerRespawnAt.clear();runtime.owner.clearPlayers();}
  if(op===3){old.o.monsterRespawnAt=at;runtime.owner.scheduleMonster(at);old.o.state.monster.alive=next.o.state.monster.alive=false;}
  if(op===4){old.o.simulatedMs=next.o.simulatedMs=at;old.o.updateRespawns();runtime.run();}
  assert.deepEqual(snapshot(next.o,next.events),snapshot(old.o,old.events),`operation ${i}`);
 }
});

test("negative controls detect wrong boundary, premature deletion, snapshot iteration and swallowed errors",()=>{
 // Each deliberate fault must be distinguished by the same full-state comparator.
 for(const fault of ["early","delete","snapshot","swallow"]){
  const old=fixture(),next=fixture(),runtime=extracted(next.o);
  old.o.simulatedMs=next.o.simulatedMs=fault==="early"?9:10;
  if(fault==="early")next.o.simulatedMs=10;
  if(fault==="delete")runtime.owner.forgetPlayer("a");
  if(fault==="snapshot")for(const {o} of [old,next])o.saveCharacter=id=>{if(id==="a"){o.state.players.set("c",new Player({alive:false}));o.playerRespawnAt.set("c",10);}};
  if(fault==="snapshot")next.o.saveCharacter=()=>{};
  if(fault==="swallow")for(const {o} of [old,next])o.broadcast=()=>{throw Error("transport");};
  const expected=result(()=>old.o.updateRespawns()),actual=result(()=>{if(fault==="swallow"){try{runtime.run();}catch{}}else runtime.run();});
  assert.throws(()=>assert.deepEqual({result:actual,state:snapshot(next.o,next.events)},{result:expected,state:snapshot(old.o,old.events)}),fault);
 }
});

import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
test("death/reward/save sequencing and room tick order remain frozen to 6756eca",()=>{
  const source=readFileSync(new URL("./MyRoom.ts",import.meta.url),"utf8")
    .replace("this.respawns.schedulePlayer(id, this.simulatedMs + RULES.playerRespawnMs)","this.playerRespawnAt.set(id, this.simulatedMs + RULES.playerRespawnMs)")
    .replace("this.respawns.scheduleMonster(this.simulatedMs + RULES.monsterRespawnMs)","this.monsterRespawnAt = this.simulatedMs + RULES.monsterRespawnMs");
  {const start=source.indexOf("  private tick("),end=source.indexOf("  private ",start+10);assert.equal(createHash("sha256").update(source.slice(start,end)).digest("hex"),"168e5c0eef0e4e666096e8119b1fc210d7db454aa5c71e995ba9cd6ceeff47d7","tick");}
  {const start=source.indexOf("  private knockoutPlayer("),end=source.indexOf("  private ",start+10);assert.equal(createHash("sha256").update(source.slice(start,end)).digest("hex"),"af4cf8e18ecb1abd4a95b83874d08f70ff7e09751b6aa41e42174f5d6761db9e","knockoutPlayer");}
  {const start=source.indexOf("  private killMonster("),end=source.indexOf("  private ",start+10);assert.equal(createHash("sha256").update(source.slice(start,end)).digest("hex"),"aacecdde2deec9038c678b6cfd33e721cb28ff7e85ef14aa69e9f1f4bff3d8c3","killMonster");}
});
