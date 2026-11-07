import test from "node:test";
import assert from "node:assert/strict";
import {MyRoom} from "./MyRoom.js";
import {Player} from "./schema/MyRoomState.js";
import {RULES} from "./GameRules.js";
type Harness={
  destinations:Map<string,{x:number;z:number}>;crestTurns:Map<string,{x:number;z:number}[]>;
  activeDashes:Map<string,{dx:number;dz:number;remaining:number}>;
  updatePlayerMovement(dt:number):void;
  refreshMastery(id:string):void;
  canOccupy(x:number,z:number,layer:number,flying:boolean,mapId:string):boolean;
  moveOnSurface(p:Player,x:number,z:number):void;
  broadcast(...args:unknown[]):void;
};
function fixture(){
 const room=new MyRoom(),tick=room as unknown as Harness,events:unknown[]=[];
 const player=new Player({x:0,y:0,z:0,alive:true});
 room.state.players.set("p",player);
 tick.refreshMastery=()=>{};tick.canOccupy=()=>true;
 tick.moveOnSurface=(p,x,z)=>{p.x=x;p.z=z;};
 tick.broadcast=(...args)=>{events.push(args);};
 return {room,tick,player,events};
}
test("original dash has priority over destinations, finishes once with deferred patch",()=>{
 const {tick,player,events}=fixture();
 tick.destinations.set("p",{x:-10,z:0});
 tick.activeDashes.set("p",{dx:1,dz:0,remaining:1});
 tick.updatePlayerMovement(.01);
 assert.equal(player.x,RULES.dashSpeed*.01);
 assert.equal(player.combatState,"dashing");assert.equal(events.length,0);
 tick.updatePlayerMovement(1);
 assert.ok(Math.abs(player.x-1)<1e-12);assert.equal(tick.activeDashes.size,0);
 assert.equal(tick.destinations.size,1);
 assert.deepEqual(events,[["dash_finished",{playerId:"p",blocked:false},{afterNextPatch:true}]]);
});
test("original dead actors discard dash but retain destination without mutation or notices",()=>{
 const {tick,player,events}=fixture();player.alive=false;
 tick.activeDashes.set("p",{dx:1,dz:0,remaining:1});tick.destinations.set("p",{x:10,z:0});
 tick.updatePlayerMovement(1);assert.equal(player.x,0);assert.equal(tick.activeDashes.size,0);
 assert.equal(tick.destinations.size,1);assert.equal(events.length,0);
});
test("original wall slide chooses X before Z, blocked destination is discarded",()=>{
 const {tick,player}=fixture();tick.destinations.set("p",{x:10,z:10});
 tick.canOccupy=(x,z)=>z===0;tick.updatePlayerMovement(.1);
 assert.ok(player.x>0);assert.equal(player.z,0);assert.equal(player.combatState,"moving");
 tick.canOccupy=()=>false;tick.updatePlayerMovement(.1);
 assert.equal(tick.destinations.size,0);assert.equal(player.combatState,"idle");
});
test("original dash completion callback throws after cleanup and before later actor",()=>{
 const {room,tick,player}=fixture(),later=new Player({x:0,y:0,z:0,alive:true});
 room.state.players.set("later",later);tick.destinations.set("later",{x:10,z:0});
 tick.activeDashes.set("p",{dx:1,dz:0,remaining:1});
 tick.broadcast=()=>{throw Error("notice");};
 assert.throws(()=>tick.updatePlayerMovement(1),/notice/);
 assert.ok(Math.abs(player.x-1)<1e-12);assert.equal(tick.activeDashes.size,0);
 assert.equal(player.combatState,"idle");assert.equal(later.x,0);
});

import {HorizontalMovement} from "./HorizontalMovement.js";
import {LegacyHorizontalMovement, type HorizontalPlayer} from "./horizontal-movement-oracle.js";
import {WORLD_MAPS,groundAt} from "./WorldMaps.js";
function scenario(legacy:boolean,mapId:string,mode:string,collision:string,dt:number,fail:string){
 const p:HorizontalPlayer={x:0,z:0,y:groundAt(mapId,0,0),mapId,flying:mode==="flight",mounted:mode==="mount",facing:0,combatState:"idle",targetId:"stale"};
 if(mode==="crest")p.y+=4;
 const calls:unknown[]=[];
 let count=0;
 const surface={
  canOccupy(x:number,z:number,layer:number,flying:boolean,map:string){
   calls.push(["collision",x,z,layer,flying,map]);if(fail==="collision" && ++count===2)throw Error("collision");
   return collision==="open" || collision==="x" && z===0 || collision==="z" && x===0;
  },
  moveOnSurface(player:HorizontalPlayer,x:number,z:number){
   calls.push(["surface",x,z]);if(fail==="surface")throw Error("surface");
   player.x=x;player.z=z;player.y=groundAt(player.mapId,x,z)+(mode==="crest"?4:0);
  }
 };
 const finished=(id:string,blocked:boolean)=>{calls.push(["finish",id,blocked]);if(fail==="finish")throw Error("finish");};
 const owner=legacy
  ?new LegacyHorizontalMovement(surface,(_type,payload)=>finished(payload.playerId,payload.blocked))
  :new HorizontalMovement(surface,finished);
 owner.destinations.set("p",{x:2,z:2});
 if(mode==="crest")owner.crestTurns.set("p",[{x:1,z:0},{x:2,z:1}]);
 if(mode==="dash")owner.activeDashes.set("p",{dx:1,dz:0,remaining:1});
 const frames:unknown[]=[];
 for(let i=0;i<8;i++){
  let error:string|undefined;
  try{if(!owner.updateDash("p",p,dt))owner.updateDestination("p",p,dt,RULES.playerSpeed);}
  catch(e){error=(e as Error).message;}
  frames.push({p:{...p},d:[...owner.destinations].map(([k,v])=>[k,{...v}]),c:[...owner.crestTurns].map(([k,v])=>[k,v.map(t=>({...t}))]),a:[...owner.activeDashes].map(([k,v])=>[k,{...v}]),calls:structuredClone(calls),error});
  if(error)break;
 }
 return frames;
}
test("extracted owner matches frozen baseline over maps, timing, collision axes, mounts, flight, crest and throwing callbacks",()=>{
 let scenarios=0;
 for(const mapId of Object.keys(WORLD_MAPS))
 for(const mode of ["walk","mount","flight","crest","dash"])
 for(const collision of ["open","x","z","blocked"])
 for(const dt of [0,.016,.05,.25,1])
 for(const fail of ["none","collision","surface","finish"]){
  assert.deepEqual(scenario(false,mapId,mode,collision,dt,fail),scenario(true,mapId,mode,collision,dt,fail),[mapId,mode,collision,dt,fail].join("/"));
  scenarios++;
 }
 assert.ok(scenarios>=400);
});
test("room pause, warp, climb and flight gates cancel dash before mastery and preserve destinations",()=>{
 for(const gate of ["pause","warp","climb","flight"]){
  const {tick,player,events}=fixture();
  const gates=tick as unknown as {
   basicAttackPaused(id:string):boolean;
   pendingWarps:Set<string>;climbs:Map<string,unknown>;flightTransitions:Map<string,unknown>;
  };
  if(gate==="pause")gates.basicAttackPaused=()=>true;
  if(gate==="warp")gates.pendingWarps.add("p");
  if(gate==="climb")gates.climbs.set("p",{});
  if(gate==="flight")gates.flightTransitions.set("p",{});
  tick.refreshMastery=()=>{throw Error("must remain before mastery");};
  tick.activeDashes.set("p",{dx:1,dz:0,remaining:1});tick.destinations.set("p",{x:10,z:0});
  tick.updatePlayerMovement(1);
  assert.equal(player.x,0);assert.equal(tick.activeDashes.size,0);
  assert.equal(tick.destinations.size,1);assert.deepEqual(events,[]);
 }
});
test("idle resets target and consumes crest points without consuming the destination",()=>{
 const {tick,player}=fixture();player.targetId="stale";
 tick.updatePlayerMovement(.1);assert.equal(player.targetId,"");assert.equal(player.combatState,"idle");
 player.y=4;tick.destinations.set("p",{x:2,z:0});tick.crestTurns.set("p",[{x:0,z:0}]);
 tick.updatePlayerMovement(.1);assert.equal(tick.crestTurns.get("p")?.length,0);assert.equal(tick.destinations.size,1);
});
