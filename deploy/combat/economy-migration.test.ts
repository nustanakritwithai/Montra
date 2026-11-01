import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { CharacterStore } from "./CharacterStore.js";
const token="mt1_"+"cd".repeat(32);
test("legacy character migrates once and disabled mode fails closed", async ()=>{
  const dir=await mkdtemp(path.join(tmpdir(),"montra-economy-migrate-"));
  const legacy=new CharacterStore(dir), upgraded=new CharacterStore(dir,true), reopened=new CharacterStore(dir,true);
  try {
    const previous=(await legacy.loadOrCreate(token,{x:0,z:0})).character;
    previous.level=3; previous.hp=71; previous.inventory!.slots[0]!.quantity=2;
    await legacy.save(previous);
    const file=path.join(dir,previous.id+".json"), before=await readFile(file,"utf8");
    const loaded=(await upgraded.loadOrCreate(token,{x:3,z:3})).character;
    assert.equal(loaded.level,3); assert.equal(loaded.hp,71); assert.equal(loaded.inventory!.slots[0]!.quantity,2);
    assert.equal(upgraded.economy.getAccount(previous.id).gold,1000);
    upgraded.economy.listItem(previous.id,"request_0000000000000001",0,1,50);
    const restored=(await reopened.loadOrCreate(token,{x:0,z:0})).character;
    assert.equal(restored.inventory!.slots[0]!.quantity,1);
    assert.equal(await readFile(file,"utf8"),before,"legacy backup is not overwritten");
    await assert.rejects(legacy.loadOrCreate(token,{x:0,z:0}),/economy_database_requires_economy_mode/);
  } finally { legacy.close(); upgraded.close(); reopened.close(); await rm(dir,{recursive:true,force:true}); }
});
