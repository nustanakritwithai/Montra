import test from "node:test";
import assert from "node:assert/strict";
import type {Client} from "colyseus";
import {MyRoom} from "./MyRoom.js";
import {Player} from "./schema/MyRoomState.js";
import {guildStore} from "./GuildStore.js";
import {groundAt} from "./WorldMaps.js";
import type {Battlefield} from "./TerritoryWar.js";

type Internals={field:Battlefield;warSeats:Map<string,{guild:string;side:"attack"|"defend";camp:number}>;
  persistentCharacters:Map<string,string>;gateActions:Map<string,number>;useCityGate(client:Client,message:unknown):void};

test("ordinary gate handler opens either nearest gate but keeps defender inside/near checks",()=>{
  const store=guildStore(),now=Date.now();
  store.create("gate-attacker","A","Gate attackers");store.create("gate-defender","D","Gate defenders");
  const a=store.war.member("gate-attacker")!,d=store.war.member("gate-defender")!;
  const field=store.war.start("river_watch",a,now);
  store.war.side(field,d,now,true);
  const room=new MyRoom(),inside=room as unknown as Internals,id="defender";
  inside.field=field;inside.warSeats.set(id,{guild:d.id,side:"defend",camp:0});
  inside.persistentCharacters.set(id,"gate-defender");
  const player=new Player({characterName:"Defender",mapId:field.site,x:-22,z:-38.1,y:groundAt(field.site,-22,-38.1),alive:true,hp:416});
  room.state.players.set(id,player);
  const replies:{type:string;data:unknown}[]=[];
  const client={sessionId:id,send:(type:string,data:unknown)=>replies.push({type,data})} as unknown as Client;
  const use=(x:number,z:number)=>{
    player.x=x;player.z=z;player.y=groundAt(field.site,x,z);
    inside.gateActions.clear();replies.length=0;inside.useCityGate(client,{});
  };
  use(-22,-38.1);
  assert.deepEqual(replies,[]);assert.equal(store.war.inspect(field.site,now).gateClosed,false);
  use(-18,-22);
  assert.deepEqual(replies,[]);assert.equal(store.war.inspect(field.site,now).gateClosed,true);
  use(-22,-41.9);
  assert.deepEqual(replies,[{type:"territory_error",data:{reason:"war_gate_near"}}]);
  assert.equal(store.war.inspect(field.site,now).gateClosed,true);
  use(-22,-30);
  assert.deepEqual(replies,[{type:"territory_error",data:{reason:"war_gate_near"}}]);
  assert.equal(store.war.inspect(field.site,now).gateClosed,true);
});
