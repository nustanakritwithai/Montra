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
  const gates=()=>store.war.inspect(field.site,now).gates;
  use(-22,-38.1);
  assert.deepEqual(replies,[]);assert.deepEqual(gates(),{"south--18":{hp:120,closed:true},"north--22":{hp:120,closed:false}});
  // The room's movement guard follows the per-gate state it just wrote.
  const mv=room as unknown as Movement;
  assert.deepEqual([...mv.closedFieldGates],["south--18"]);
  assert.equal(mv.canOccupy(-18,-20,0,false,"river_watch"),false,"closed south gate still blocks");
  assert.equal(mv.canOccupy(-22,-40,0,false,"river_watch"),true,"opened north gate lets players through");
  use(-18,-22);
  assert.deepEqual(replies,[]);assert.deepEqual(gates(),{"south--18":{hp:120,closed:false},"north--22":{hp:120,closed:false}});
  use(-22,-41.9);
  assert.deepEqual(replies,[{type:"territory_error",data:{reason:"war_gate_near"}}]);
  assert.equal(gates()!["north--22"].closed,false);
  use(-22,-30);
  assert.deepEqual(replies,[{type:"territory_error",data:{reason:"war_gate_near"}}]);
  assert.equal(gates()!["south--18"].closed,false);
});

type Movement={closedFieldGates:Set<string>;canOccupy(x:number,z:number,feetY:number,flying?:boolean,mapId?:string):boolean};
test("every closed ordinary gate blocks movement, not only the first gate",()=>{
  const room=new MyRoom(),inside=room as unknown as Movement & {field:Battlefield};
  inside.field={site:"river_watch",seq:1};
  const north={x:-22,z:-41.4+1.4},south={x:-18,z:-21.4+1.4};
  const free=(p:{x:number;z:number})=>inside.canOccupy(p.x,p.z,0,false,"river_watch");
  inside.closedFieldGates=new Set();
  assert.equal(free(north),true);assert.equal(free(south),true);
  inside.closedFieldGates=new Set(["north--22"]);
  assert.equal(free(north),false,"closed north gate blocks");assert.equal(free(south),true);
  inside.closedFieldGates=new Set(["south--18","north--22"]);
  assert.equal(free(north),false);assert.equal(free(south),false);
});

test("castle and river-city gate commands without gateId reply war_gate_id",()=>{
  for(const site of ["tri_wiang_castle","sam_lan_estuary"]){
    const room=new MyRoom(),inside=room as unknown as Internals;
    inside.field={site,seq:1};
    const replies:{type:string;data:unknown}[]=[];
    const client={sessionId:"x",send:(type:string,data:unknown)=>replies.push({type,data})} as unknown as Client;
    for(const m of [{},null,{gateId:""},{gateId:3}]){
      replies.length=0;inside.useCityGate(client,m);
      assert.deepEqual(replies,[{type:"territory_error",data:{reason:"war_gate_id"}}],site+" "+JSON.stringify(m));
    }
  }
});
