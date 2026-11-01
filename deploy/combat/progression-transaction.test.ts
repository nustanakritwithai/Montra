import test from "node:test";
import assert from "node:assert/strict";
import type { Client } from "colyseus";
import { MyRoom } from "./MyRoom.js";
import { Player } from "./schema/MyRoomState.js";
import { characterStore } from "./CharacterStore.js";
import { makeStarterInventory, type InventorySnapshot } from "./ItemRules.js";
import { emptyAllocations, type Allocations } from "./Progression.js";

test("failed stat save never spends points or changes active stats", async () => {
  const room = new MyRoom();
  const id = "test-session";
  const p = new Player({ level:2, experience:0, hp:100, maxHp:240, statPoints:3, atk:21, alive:true });
  room.state.players.set(id,p);
  const state = room as unknown as {
    statAllocations: Map<string, Allocations>;
    persistentCharacters: Map<string, string>;
    inventories: Map<string, InventorySnapshot>;
    pendingItemUses: Map<string, Promise<void>>;
  };
  state.statAllocations.set(id,emptyAllocations());
  state.persistentCharacters.set(id,"a".repeat(64));
  state.inventories.set(id,makeStarterInventory());
  const notices: string[] = [];
  const client = { sessionId:id, send: (kind: string) => { notices.push(kind); } } as unknown as Client;
  const save = characterStore.save;
  characterStore.save = async () => { throw new Error("simulated_disk_failure"); };
  try {
    room.messages.allocate_stat(client,{stat:"atk"});
    const pending = state.pendingItemUses.get(id);
    assert.ok(pending);
    await pending;
    assert.equal(p.statPoints,3);
    assert.equal(p.atk,21);
    assert.equal(state.statAllocations.get(id)?.atk,0);
    assert.ok(notices.includes("character_save_error"));
    assert.ok(!notices.includes("stat_allocated"));
  } finally { characterStore.save = save; }
});

test("failed EXP save never grants or acknowledges the reward", async () => {
  const room = new MyRoom();
  const id = "test-reward";
  const p = new Player({ level:1, experience:50, hp:100, maxHp:240, alive:true });
  room.state.players.set(id,p);
  const state = room as unknown as {
    statAllocations: Map<string, Allocations>;
    persistentCharacters: Map<string, string>;
    inventories: Map<string, InventorySnapshot>;
    pendingRewards: Map<string, Promise<void>>;
    grantMonsterExperience: (id: string) => void;
  };
  state.statAllocations.set(id,emptyAllocations());
  state.persistentCharacters.set(id,"b".repeat(64));
  state.inventories.set(id,makeStarterInventory());
  const notices: string[] = [];
  const client = { sessionId:id, send: (kind: string) => { notices.push(kind); } } as unknown as Client;
  room.clients.push(client);
  const save = characterStore.save;
  characterStore.save = async () => { throw new Error("simulated_disk_failure"); };
  try {
    state.grantMonsterExperience(id);
    const pending = state.pendingRewards.get(id);
    assert.ok(pending);
    await pending;
    assert.equal(p.level,1); assert.equal(p.experience,50);
    assert.ok(notices.includes("character_save_error"));
    assert.ok(!notices.includes("experience_gained"));
  } finally { characterStore.save = save; }
});
