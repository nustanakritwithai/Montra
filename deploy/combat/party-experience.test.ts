import test from "node:test";
import assert from "node:assert/strict";
import { MyRoom } from "./MyRoom.js";
import { Monster, Player } from "./schema/MyRoomState.js";
import type { PartyManager } from "./PartyManager.js";

test("party EXP is split equally among living nearby same-map members",()=>{
  const room=new MyRoom();
  room.state.monster=new Monster({x:0,y:0,z:0});
  room.state.players.set("a",new Player({x:1,y:0,z:0,alive:true,level:1,mapId:"ritual_village"}));
  room.state.players.set("b",new Player({x:5,y:0,z:0,alive:true,level:1,mapId:"ritual_village"}));
  room.state.players.set("far",new Player({x:21,y:0,z:0,alive:true,level:1,mapId:"ritual_village"}));
  room.state.players.set("other",new Player({x:1,y:0,z:0,alive:true,level:1,mapId:"forbidden_forest"}));
  const state=room as unknown as {parties:PartyManager;persistentCharacters:Map<string,string>;sameCombatMap:(a:string,b:string)=>boolean;awardMonsterExperience:(id:string)=>void;grantMonsterExperience:(id:string,amount?:number)=>void};
  for(const id of ["a","b","far","other"])state.persistentCharacters.set(id,id);
  for(const id of ["b","far","other"]) {const invite=state.parties.invite("a",id,0);state.parties.accept(id,invite.id,1);}
  assert.equal(state.sameCombatMap("a","b"),false,"party members cannot attack each other");
  const awarded:Array<[string,number|undefined]>=[];
  state.grantMonsterExperience=(id,amount)=>{awarded.push([id,amount]);};
  state.awardMonsterExperience("a");
  assert.deepEqual(awarded,[["a",50],["b",50]]);
  room.state.players.get("b")!.alive=false;awarded.length=0;
  state.awardMonsterExperience("a");
  assert.deepEqual(awarded,[["a",100]]);
});
