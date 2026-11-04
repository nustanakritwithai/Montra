import test from "node:test";
import assert from "node:assert/strict";
import {MyRoom} from "./MyRoom.js";
import {Player} from "./schema/MyRoomState.js";
import {warSites} from "./TerritoryWar.js";

type Internals={field:{site:string;seq:number};battleActive:boolean;simulatedMs:number;
  warSeats:Map<string,{side:"attack"|"defend";guild:string;camp:number}>;persistentCharacters:Map<string,string>;
  lastPvpMs:Map<string,number>;warParticipation:Map<string,{lastSupport?:number}>;
  healAmount(owner:string,target:string,base:number):number;markWarSupport(owner:string,target:string,underAttack:boolean):void};

test("only effective healing or protection of an engaged ally contributes support",()=>{
  const room=new MyRoom(),inside=room as unknown as Internals,point=warSites.moon_pass;
  inside.field={site:"moon_pass",seq:1};inside.battleActive=true;inside.simulatedMs=20_000;
  const healer=new Player({mapId:"moon_pass",x:point.x+8,z:point.z,alive:true,hp:100,maxHp:100});
  const ally=new Player({mapId:"moon_pass",x:point.x,z:point.z,alive:true,hp:40,maxHp:100});
  room.state.players.set("healer",healer);room.state.players.set("ally",ally);
  inside.persistentCharacters.set("healer","a".repeat(64));inside.persistentCharacters.set("ally","b".repeat(64));
  inside.warSeats.set("healer",{side:"attack",guild:"g",camp:0});inside.warSeats.set("ally",{side:"attack",guild:"g",camp:0});
  inside.healAmount("healer","ally",20);assert.equal(inside.warParticipation.has("healer"),false);
  inside.lastPvpMs.set("ally",19_000);ally.hp=100;inside.healAmount("healer","ally",20);assert.equal(inside.warParticipation.has("healer"),false);
  ally.hp=40;inside.healAmount("healer","ally",20);assert.equal(inside.warParticipation.get("healer")?.lastSupport,20_000);
  inside.warParticipation.clear();inside.warSeats.set("ally",{side:"defend",guild:"other",camp:0});
  inside.markWarSupport("healer","ally",true);assert.equal(inside.warParticipation.has("healer"),false);
  inside.warSeats.set("ally",{side:"attack",guild:"g",camp:0});inside.markWarSupport("healer","ally",true);
  assert.equal(inside.warParticipation.get("healer")?.lastSupport,20_000);
});
