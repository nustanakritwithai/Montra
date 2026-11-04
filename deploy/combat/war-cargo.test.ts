import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,rm} from "node:fs/promises";
import path from "node:path";
import type {Client} from "colyseus";
import {MyRoom} from "./MyRoom.js";
import {Player} from "./schema/MyRoomState.js";
import {CommandBucket} from "./GameRules.js";
import {characterStore} from "./CharacterStore.js";
import {guildStore} from "./GuildStore.js";
import {makeClassInventory,type InventorySnapshot} from "./ItemRules.js";
import {groundAt} from "./WorldMaps.js";
import {warSites,type Battlefield} from "./TerritoryWar.js";

type Internals={messages:Record<string,(client:Client,message:unknown)=>void>;field:Battlefield;battleActive:boolean;simulatedMs:number;
  warSeats:Map<string,{side:"attack"|"defend";guild:string;camp:number}>;persistentCharacters:Map<string,string>;playerSpawn:Map<string,{x:number;y:number;z:number}>;
  inventories:Map<string,InventorySnapshot>;gates:Map<string,{guild:CommandBucket}>;warCargo:Map<string,unknown>;pendingRewards:Map<string,Promise<void>>};

test("cargo requires a real journey from base to the war objective",async()=>{
  const dir=await mkdtemp(path.join(process.cwd(),"montra-cargo-"));
  const mutable=characterStore as unknown as {directory:string},oldDirectory=mutable.directory,save=characterStore.save;
  mutable.directory=dir;characterStore.save=async()=>{};
  const guild=guildStore();
  try{
    const id="cargo-player",character="a".repeat(64);guild.create(character,"Tester","Cargo Guild");
    const member=guild.war.member(character)!;const field=guild.war.start("moon_pass",member,Date.now());
    const room=new MyRoom(),inside=room as unknown as Internals,point=warSites.moon_pass;
    const base={x:point.x+20,z:point.z,y:groundAt("moon_pass",point.x+20,point.z)};
    const player=new Player({characterName:"Tester",mapId:"moon_pass",...base,pathId:"seer",ancestryId:"shrine",level:1,alive:true,hp:240});
    room.state.players.set(id,player);inside.field=field;inside.battleActive=true;inside.persistentCharacters.set(id,character);
    inside.inventories.set(id,makeClassInventory("seer"));inside.playerSpawn.set(id,base);
    inside.warSeats.set(id,{side:"attack",guild:member.id,camp:0});inside.gates.set(id,{guild:new CommandBucket(6,2)});
    const events:string[]=[];const client={sessionId:id,send:(type:string)=>events.push(type)} as unknown as Client;
    inside.messages.territory_supply(client,{action:"pickup"});assert.equal(inside.warCargo.has(id),true);
    inside.messages.territory_supply(client,{action:"deliver"});assert.equal(guild.war.supplyCount(field,member.id),0);
    player.x=point.x;player.z=point.z;player.y=groundAt("moon_pass",point.x,point.z);inside.simulatedMs=9000;
    inside.messages.territory_supply(client,{action:"deliver"});await inside.pendingRewards.get(id);
    assert.equal(inside.warCargo.has(id),false);assert.equal(guild.war.supplyCount(field,member.id),1);
    assert.ok(events.includes("war_supply_notice"));assert.ok(player.experience>0);
  }finally{guild.close();characterStore.save=save;mutable.directory=oldDirectory;await rm(dir,{recursive:true,force:true});}
});
