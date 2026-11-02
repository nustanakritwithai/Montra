
import test from "node:test";
import assert from "node:assert/strict";
import type {Client} from "colyseus";
import {MyRoom} from "./MyRoom.js";
import {Player} from "./schema/MyRoomState.js";
import {CommandBucket} from "./GameRules.js";
import {makeStarterInventory, type InventorySnapshot} from "./ItemRules.js";
import {newSwordTree, type SwordTree} from "./SkillCatalog.js";

type TestRoom = {
  messages:Record<string,(client:Client,message:unknown)=>void>;
  inventories:Map<string,InventorySnapshot>;
  swordTrees:Map<string,SwordTree>;
  gates:Map<string,{attack:CommandBucket}>;
  clients:{find:(predicate:unknown)=>Client|undefined};
  swordGuards:Map<string,{until:number;factor:number;direction:boolean;counterUntil:number}>;
  swordGuardDamage(id:string,attacker:{x:number;z:number},damage:number):number;
  simulatedMs:number;
  canOccupy(x:number,z:number,y:number,flying:boolean,mapId:string):boolean;
  bodyPathClear(mapId:string,from:unknown,to:unknown):boolean;
  broadcast:(...args:unknown[])=>void;
};

test("gap closer stops when the path crosses an obstacle even if the destination is clear",()=>{
  const room=new MyRoom(), internal=room as unknown as TestRoom;
  const player=new Player({pathId:"phutthaisawan",level:10,x:-10,z:8,y:0,alive:true,stamina:100});
  const opponent=new Player({x:-6,z:8,y:0,alive:true,hp:100,maxHp:100});
  const playerId="player_1",targetId="target_1";
  room.state.players.set(playerId,player);room.state.players.set(targetId,opponent);
  const inventory=makeStarterInventory();inventory.equippedWeaponSlot=2;
  const tree=newSwordTree();tree.learned=["footwork"];
  internal.inventories.set(playerId,inventory);
  internal.swordTrees.set(playerId,tree);
  internal.gates.set(playerId,{attack:new CommandBucket(4,4)});
  internal.broadcast=()=>{};
  internal.bodyPathClear=()=>true;
  const notices:Array<{type:string;data:{reason?:string}}>=[];
  const client={sessionId:playerId,send:(type:string,data:{reason?:string})=>notices.push({type,data})} as unknown as Client;
  internal.canOccupy=(x)=>x < -9 || x > -8;
  internal.messages.sword_skill(client,{skillId:"footwork",targetId});
  assert.ok(notices.some(notice=>notice.type==="command_rejected"&&notice.data.reason==="sword_blocked"));
  assert.equal(player.x,-10);assert.equal(opponent.hp,100);assert.equal(player.stamina,100);
  assert.equal(tree.cooldowns.footwork,undefined);

  internal.canOccupy=()=>true;
  internal.messages.sword_skill(client,{skillId:"footwork",targetId});
  assert.ok(player.x>-10,"legal path moves the character");
  assert.ok(opponent.hp<100,"legal path deals damage");
  assert.ok(tree.cooldowns.footwork>Date.now(),"legal path starts cooldown");
});

test("a disconnected client cannot interrupt guard damage resolution",()=>{
  const room=new MyRoom(), internal=room as unknown as TestRoom, id="player_1";
  const player=new Player({pathId:"phutthaisawan",x:-10,z:8,alive:true});
  const tree=newSwordTree();
  room.state.players.set(id,player);
  internal.swordTrees.set(id,tree);
  internal.swordGuards.set(id,{until:1000,factor:0.5,direction:false,counterUntil:0});
  internal.clients.find=()=>({send:()=>{throw Error("simulated disconnect");}} as unknown as Client);
  assert.equal(internal.swordGuardDamage(id,{x:-10,z:9},10),5);
  assert.equal(tree.training.blocks,1);
  assert.equal(internal.swordGuards.get(id)?.counterUntil,3000);
});

test("counter status notices follow authoritative guard and counter order",()=>{
  const room=new MyRoom(), internal=room as unknown as TestRoom;
  const id="player_1", enemyId="target_1";
  const player=new Player({pathId:"phutthaisawan",level:20,x:-10,z:8,y:0,alive:true,stamina:100,facing:Math.PI});
  const opponent=new Player({x:-10,z:9.5,y:0,alive:true,hp:100,maxHp:100});
  room.state.players.set(id,player);room.state.players.set(enemyId,opponent);
  const inventory=makeStarterInventory();inventory.equippedWeaponSlot=2;
  const tree=newSwordTree();tree.school="sritrairat";tree.learned=["footwork","guard","measure","riposte"];
  internal.inventories.set(id,inventory);internal.swordTrees.set(id,tree);
  internal.gates.set(id,{attack:new CommandBucket(4,4)});
  internal.broadcast=()=>{};internal.bodyPathClear=()=>true;internal.canOccupy=()=>true;
  const messages:string[]=[];
  const client={sessionId:id,send:(type:string)=>messages.push(type)} as unknown as Client;
  internal.clients.find=()=>client;
  internal.messages.sword_skill(client,{skillId:"measure"});
  assert.equal(internal.swordGuardDamage(id,opponent,10),4);
  internal.messages.sword_skill(client,{skillId:"riposte",targetId:enemyId});
  assert.deepEqual(messages.filter(type=>type==="sword_counter_cleared" || type==="sword_guarded"),
    ["sword_counter_cleared","sword_guarded","sword_counter_cleared"]);
});

test("counter and guard windows cannot be used before a block or at expiry",()=>{
  const room=new MyRoom(), internal=room as unknown as TestRoom, id="player_1", enemyId="target_1";
  const player=new Player({pathId:"phutthaisawan",level:20,x:-10,z:8,y:0,alive:true,stamina:100});
  const opponent=new Player({x:-10,z:9.5,y:0,alive:true,hp:100,maxHp:100});
  room.state.players.set(id,player);room.state.players.set(enemyId,opponent);
  const inventory=makeStarterInventory();inventory.equippedWeaponSlot=2;
  const tree=newSwordTree();tree.school="sritrairat";tree.learned=["footwork","guard","measure","riposte"];
  internal.inventories.set(id,inventory);internal.swordTrees.set(id,tree);
  internal.gates.set(id,{attack:new CommandBucket(4,4)});
  internal.swordGuards.set(id,{until:1200,factor:0.5,direction:false,counterUntil:0});
  internal.broadcast=()=>{};internal.bodyPathClear=()=>true;internal.canOccupy=()=>true;
  const reasons:string[]=[];
  const client={sessionId:id,send:(type:string,data:{reason?:string})=>{if(type==="command_rejected")reasons.push(data.reason ?? "");}} as unknown as Client;
  internal.messages.sword_skill(client,{skillId:"riposte",targetId:enemyId});
  assert.deepEqual(reasons,["sword_counter_required"]);
  assert.equal(opponent.hp,100);assert.equal(player.stamina,100);
  internal.simulatedMs=1200;
  assert.equal(internal.swordGuardDamage(id,opponent,10),10,"guard expires at the boundary");
  internal.swordGuards.get(id)!.counterUntil=3000;
  internal.simulatedMs=3000;
  internal.messages.sword_skill(client,{skillId:"riposte",targetId:enemyId});
  assert.deepEqual(reasons,["sword_counter_required","sword_counter_required"]);
  assert.equal(tree.cooldowns.riposte,undefined);
});
