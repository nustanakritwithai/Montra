
import test from "node:test";
import assert from "node:assert/strict";
import type {Client} from "colyseus";
import {MyRoom} from "./MyRoom.js";
import {Player} from "./schema/MyRoomState.js";
import {CommandBucket} from "./GameRules.js";
import {characterStore, type CharacterSnapshot} from "./CharacterStore.js";
import {makeStarterInventory, type InventorySnapshot} from "./ItemRules.js";
import {newSwordTree, type SwordTree} from "./SkillCatalog.js";

type InternalRoom = {
  messages: Record<string,(client:Client,message:unknown)=>void>;
  persistentCharacters: Map<string,string>;
  inventories: Map<string,InventorySnapshot>;
  swordTrees: Map<string,SwordTree>;
  pendingWarps: Set<string>;
  pendingItemUses: Map<string,Promise<void>>;
  pendingRewards: Map<string,Promise<void>>;
  gates: Map<string,{swordTree:CommandBucket;attack:CommandBucket}>;
  recordSwordTraining(id:string,field:"strikes"):void;
  grantMonsterExperience(id:string,amount:number):void;
  sameCombatMap(id:string,targetId:string):boolean;
  broadcast: (...args:unknown[])=>void;
};

async function verifyShortcutWrite(failure:"none"|"disk"|"delivery") {
  const fail=failure==="disk";
  const room=new MyRoom(), internal=room as unknown as InternalRoom;
  const id="session_1", opponent="enemy_1";
  const player=new Player({pathId:"phutthaisawan",ancestryId:"woodland",level:10,x:-10,z:8,alive:true});
  const enemy=new Player({x:-10,z:9.5,alive:true});
  room.state.players.set(id,player);room.state.players.set(opponent,enemy);
  const inventory=makeStarterInventory();inventory.equippedWeaponSlot=2;
  const tree=newSwordTree();tree.learned=["footwork","guard"];
  internal.inventories.set(id,inventory);
  internal.swordTrees.set(id,tree);
  internal.persistentCharacters.set(id,"a".repeat(64));
  internal.gates.set(id,{swordTree:new CommandBucket(6,2),attack:new CommandBucket(4,4)});
  internal.broadcast=()=>{};
  const notices: Array<{type:string; data:unknown}>=[];
  const client={sessionId:id,send:(type:string,data:unknown)=>{
    if (failure==="delivery" && type==="sword_tree_changed") throw Error("simulated disconnect");
    notices.push({type,data});
  }} as unknown as Client;
  const original=characterStore.save, writes:CharacterSnapshot[]=[];
  let unblock!:()=>void;
  const slow=new Promise<void>(resolve=>{unblock=resolve;});
  characterStore.save=async snapshot=>{
    writes.push(structuredClone(snapshot));
    if(writes.length===1) {
      await slow;
      if (fail) throw Error("simulated disk failure");
    }
  };
  try {
    internal.messages.sword_tree_equip(client,{slot:0,skillId:"guard"});
    const pending=internal.pendingItemUses.get(id);
    assert.ok(pending,"shortcut save started");
    assert.equal(internal.pendingWarps.has(id),false,"shortcut assignment must not make player invulnerable");
    assert.equal(internal.sameCombatMap(id,opponent),true);
    internal.recordSwordTraining(id,"strikes");
    internal.messages.sword_skill(client,{skillId:"guard"});
    const readyAt=tree.cooldowns.guard;
    assert.ok(readyAt>Date.now(),"guard cast while shortcut save is in flight");
    internal.grantMonsterExperience(id,25);
    const reward=internal.pendingRewards.get(id);
    assert.ok(reward,"monster reward is queued behind the shortcut save");
    unblock();
    await pending;
    await reward;
    await new Promise(resolve=>setImmediate(resolve));
    const current=internal.swordTrees.get(id)!;
    assert.equal(player.experience,25,"monster reward is not lost");
    assert.equal(current.training.strikes,1);
    assert.equal(current.cooldowns.guard,readyAt);
    assert.equal(current.loadouts.phutthaisawan[0],fail ? null : "guard");
    if (fail) assert.ok(notices.some(notice=>notice.type==="command_rejected"),"failed save is reported");
    if (failure==="delivery") assert.ok(!notices.some(notice=>notice.type==="command_rejected"),"undelivered confirmation is not a disk failure");
    assert.ok(writes.some(snapshot=>snapshot.swordTree?.cooldowns.guard===readyAt &&
      snapshot.experience===25 && snapshot.swordTree.training.strikes===1 && snapshot.swordTree.loadouts.phutthaisawan[0]===(fail ? null : "guard")),
      "final save includes both the shortcut and concurrent combat progress");
  } finally {
    unblock();
    characterStore.save=original;
  }
}

test("shortcut saves preserve concurrent combat progress",()=>verifyShortcutWrite("none"));
test("failed shortcut saves retain and persist concurrent combat progress",()=>verifyShortcutWrite("disk"));
test("lost confirmations preserve saved progress without a false disk failure",()=>verifyShortcutWrite("delivery"));
