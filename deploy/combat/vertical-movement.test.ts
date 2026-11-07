import test from "node:test";
import assert from "node:assert/strict";
import {MyRoom} from "./MyRoom.js";
import {Player} from "./schema/MyRoomState.js";
import type {WorldPoint} from "./HeightRules.js";

type Harness = {
  climbs:Map<string,WorldPoint>;
  flightTransitions:Map<string,{targetY:number;landing:boolean}>;
  updateClimbs(dt:number):void;
  updateFlights(dt:number):void;
  broadcast(...args:unknown[]):void;
  saveCharacter(id:string):void;
};
function fixture(){
  const room=new MyRoom(), tick=room as unknown as Harness, events:unknown[]=[];
  tick.broadcast=(...args)=>{events.push(args);};
  tick.saveCharacter=id=>{events.push(["save",id]);};
  const player=new Player({x:0,y:0,z:0,alive:true});
  room.state.players.set("p",player);
  return {room,tick,events,player};
}
test("vertical flight: fixed speed, no horizontal drift, completion before save, once only",()=>{
  const {tick,events,player}=fixture();
  tick.flightTransitions.set("p",{targetY:6,landing:false});
  tick.updateFlights(.05);
  assert.equal(player.y,.2);assert.equal(player.x,0);assert.equal(player.z,0);
  assert.equal(player.combatState,"ascending");assert.equal(player.flying,false);assert.deepEqual(events,[]);
  for(let i=0;i<29;i++)tick.updateFlights(.05);
  assert.equal(player.y,6);assert.equal(player.flying,true);assert.equal(player.combatState,"idle");
  assert.equal(tick.flightTransitions.size,0);
  assert.deepEqual(events,[["flight_finished",{playerId:"p",altitude:6,flying:true},{afterNextPatch:true}],["save","p"]]);
  tick.updateFlights(1);assert.equal(events.length,2);
  tick.flightTransitions.set("p",{targetY:0,landing:true});tick.updateFlights(.05);
  assert.equal(player.y,5.8);assert.equal(player.flying,true);assert.equal(player.combatState,"descending");
  for(let i=0;i<29;i++)tick.updateFlights(.05);assert.equal(player.y,0);assert.equal(player.flying,false);assert.equal(events.length,4);
});
test("climb progresses in 3D, completes once without a save",()=>{
  const {tick,events,player}=fixture();
  tick.climbs.set("p",{x:0,y:4,z:0});tick.updateClimbs(.1);
  assert.ok(Math.abs(player.y-.23)<1e-12);assert.equal(player.combatState,"climbing");assert.deepEqual(events,[]);
  tick.updateClimbs(2);assert.equal(player.y,4);assert.equal(player.combatState,"idle");assert.equal(tick.climbs.size,0);
  assert.deepEqual(events,[["climb_finished",{playerId:"p",height:4},{afterNextPatch:true}]]);
  tick.updateClimbs(2);assert.equal(events.length,1);
});
test("dead and missing actors lose transitions without movement, notices, or saves",()=>{
  const {tick,events,player}=fixture();player.alive=false;
  for(const id of ["p","missing"]){tick.climbs.set(id,{x:0,y:4,z:0});tick.flightTransitions.set(id,{targetY:6,landing:false});}
  tick.updateClimbs(.5);tick.updateFlights(.5);
  assert.equal(player.y,0);assert.equal(tick.climbs.size,0);assert.equal(tick.flightTransitions.size,0);assert.deepEqual(events,[]);
});

import {LegacyVerticalMovement} from "./vertical-movement-oracle.js";
import {WORLD_MAPS, groundAt} from "./WorldMaps.js";
test("room ticks match frozen baseline across terrain, tick sizes, ascent, landing and cancellation",()=>{
  for(const map of Object.values(WORLD_MAPS)){
    for(const dt of [0,.016,.05,.1,.25]){
      const {room,tick,events,player}=fixture(), old=new LegacyVerticalMovement();
      player.mapId=map.id;player.x=3;player.z=-2;player.y=groundAt(map.id,3,-2);
      const reference=new Player({mapId:map.id,x:player.x,y:player.y,z:player.z,alive:true});old.state.players.set("p",reference);
      const snapshot=(p:Player)=>({x:p.x,y:p.y,z:p.z,facing:p.facing,flying:p.flying,combatState:p.combatState});
      for(const landing of [false,true]){
        const transition={targetY:landing?0:6,landing};tick.flightTransitions.set("p",{...transition});old.flightTransitions.set("p",{...transition});
        for(let n=0;n<110;n++){
          tick.updateFlights(dt);old.updateFlights(dt);
          assert.deepEqual(snapshot(player),snapshot(reference));assert.deepEqual(events,old.events);
          assert.deepEqual([...tick.flightTransitions],[...old.flightTransitions]);
        }
      }
      const destination={x:5,y:player.y+4,z:0};tick.climbs.set("p",{...destination});old.climbs.set("p",{...destination});
      for(let n=0;n<110;n++){
        tick.updateClimbs(dt);old.updateClimbs(dt);
        assert.deepEqual(snapshot(player),snapshot(reference));assert.deepEqual(events,old.events);assert.deepEqual([...tick.climbs],[...old.climbs]);
      }
      room.state.players.delete("p");old.state.players.delete("p");
      tick.updateClimbs(dt);old.updateClimbs(dt);tick.updateFlights(dt);old.updateFlights(dt);
      assert.deepEqual([...tick.climbs],[...old.climbs]);assert.deepEqual([...tick.flightTransitions],[...old.flightTransitions]);assert.deepEqual(events,old.events);
    }
  }
});

test("completion callbacks observe committed state and new transitions wait until next tick",()=>{
  const {room,tick,player}=fixture();
  const second=new Player({x:0,y:0,z:0,alive:true});room.state.players.set("second",second);
  tick.flightTransitions.set("p",{targetY:0,landing:true});
  const order:string[]=[];
  tick.broadcast=()=>{
    assert.equal(tick.flightTransitions.has("p"),false);assert.equal(player.combatState,"idle");assert.equal(player.flying,false);
    tick.flightTransitions.set("second",{targetY:6,landing:false});order.push("broadcast");
  };
  tick.saveCharacter=()=>{order.push("save");};
  tick.updateFlights(.05);
  assert.deepEqual(order,["broadcast","save"]);assert.equal(second.y,0);
  tick.updateFlights(.05);assert.equal(second.y,.2);assert.equal(second.combatState,"ascending");
});

test("completion broadcast failures preserve committed state and stop the tick before save or later actors",()=>{
  for(const kind of ["climb","flight"] as const){
    const {room,tick,player,events}=fixture();
    const second=new Player({x:0,y:0,z:0,alive:true});room.state.players.set("second",second);
    if(kind==="climb"){
      tick.climbs.set("p",{x:0,y:0,z:0});tick.climbs.set("second",{x:0,y:4,z:0});
    }else{
      tick.flightTransitions.set("p",{targetY:0,landing:true});tick.flightTransitions.set("second",{targetY:6,landing:false});
    }
    const failure=new Error("broadcast failed");tick.broadcast=()=>{throw failure;};
    assert.throws(()=>kind==="climb"?tick.updateClimbs(.05):tick.updateFlights(.05),error=>error===failure);
    const transitions=kind==="climb"?tick.climbs:tick.flightTransitions;
    assert.equal(transitions.has("p"),false);assert.equal(transitions.has("second"),true);
    assert.equal(player.combatState,"idle");assert.equal(second.y,0);assert.deepEqual(events,[]);
  }
});

test("climb completion uses a snapshot when callbacks add or cancel transitions",()=>{
  const {room,tick}=fixture();
  for(const id of ["second","added"])room.state.players.set(id,new Player({x:0,y:0,z:0,alive:true}));
  tick.climbs.set("p",{x:0,y:0,z:0});tick.climbs.set("second",{x:0,y:4,z:0});
  tick.broadcast=()=>{tick.climbs.delete("second");tick.climbs.set("added",{x:0,y:4,z:0});};
  tick.updateClimbs(.1);
  // Cancellation during iteration does not change the already-captured tick entries.
  assert.ok(Math.abs(room.state.players.get("second")!.y-.23)<1e-12);
  assert.equal(room.state.players.get("added")!.y,0);
});
