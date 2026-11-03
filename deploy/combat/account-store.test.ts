import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { AccountStore } from "./AccountStore.js";
import { CHARACTER_SLOTS, characterIdFromToken, CharacterStore } from "./CharacterStore.js";

test("legacy identity links once, sessions authenticate, and recovery revokes sessions", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "montra-account-test-"));
  const file = path.join(dir, "accounts.sqlite");
  const store = new AccountStore(file);
  const key = "mt1_" + "42".repeat(32);
  const password = "strong-test-password";
  try {
    const { recoveryCode } = await store.register("Example_User", password, key);
    await assert.rejects(store.register("another", password, key), /legacy_already_linked/);
    await assert.rejects(store.register("example_user", password), /account_unavailable/);
    await assert.rejects(store.login("example_user", "wrong-password-123"), /invalid_credentials/);
    const { session } = await store.login("example_user", password);
    assert.deepEqual(store.resolve(session)?.characterIds, CHARACTER_SLOTS.map(slot => characterIdFromToken(key, slot)));
    assert.equal(store.resolve(session + "x"), null);
    const next = await store.resetPassword("example_user", recoveryCode, "another-test-password");
    assert.equal(store.resolve(session), null);
    await assert.rejects(store.resetPassword("example_user", recoveryCode, password), /invalid_recovery/);
    await assert.rejects(store.login("example_user", password), /invalid_credentials/);
    const renewed = await store.login("example_user", "another-test-password");
    assert.ok(store.resolve(renewed.session));
    store.logout(renewed.session);
    assert.equal(store.resolve(renewed.session), null);
    assert.notEqual(next.recoveryCode, recoveryCode);
    store.close();
    const database = await readFile(file);
    for (const secret of [key, password, recoveryCode, session]) assert.equal(database.includes(secret), false);
  } finally {
    try { store.close(); } catch { /* already closed */ }
    await rm(dir, { recursive: true, force: true });
  }
});

test("linking an economy-backed legacy account keeps all slot IDs, progress and gold", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "montra-account-economy-"));
  const characters = new CharacterStore(dir, true), accounts = new AccountStore(path.join(dir,"accounts.sqlite"));
  const key = "mt1_" + "53".repeat(32), spawn={x:0,z:0};
  try {
    for (const slot of CHARACTER_SLOTS) {
      const record=(await characters.loadOrCreate(key,spawn,slot)).character;
      await characters.save({...record,level:3,experience:slot*11,build:{path:"blade",ancestry:"woodland"}});
    }
    const sql=new DatabaseSync(path.join(dir,"economy.sqlite"));
    sql.prepare("UPDATE accounts SET gold=? WHERE id=?").run(347,characterIdFromToken(key,1));sql.close();
    await accounts.register("legacy_user","legacy-test-password",key);
    const session=(await accounts.login("legacy_user","legacy-test-password")).session;
    const linked=accounts.resolve(session)!;
    for (const slot of CHARACTER_SLOTS) {
      const restored=(await characters.loadOrCreateById(linked.characterIds[slot-1],spawn,undefined,true)).character;
      assert.equal(restored.id,characterIdFromToken(key,slot));
      assert.equal(restored.experience,slot*11);assert.equal(restored.build?.path,"blade");
    }
    assert.equal(characters.economy.getAccount(linked.characterIds[0]).gold,347);
  } finally {accounts.close();characters.close();await rm(dir,{recursive:true,force:true});}
});

test("character setup persists class before admission and preserves existing progress", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "montra-account-characters-"));
  const characters = new CharacterStore(dir);
  const key = "mt1_" + "81".repeat(32), id = characterIdFromToken(key);
  const spawn = {x:0,z:0};
  try {
    await assert.rejects(characters.loadOrCreateById(id, spawn, undefined, true), /character_setup_required/);
    assert.equal((await characters.listSlots([id, characterIdFromToken(key,2), characterIdFromToken(key,3)]))[0].occupied, false);
    const initial = await characters.loadOrCreateById(id, spawn, {name:"นักมวย", build:{path:"muay_boran",ancestry:"shrine"}}, true);
    assert.equal(initial.character.build?.path, "muay_boran");
    assert.equal(initial.character.inventory?.slots[initial.character.inventory.equippedWeaponSlot!]?.itemId, "muay_wraps");
    await characters.save({...initial.character, level:2, experience:12});
    const existing = await characters.loadOrCreateById(id, spawn, {name:"Other",build:{path:"blade",ancestry:"woodland"}}, true);
    assert.equal(existing.character.build?.path, "muay_boran");
    assert.equal(existing.character.name, "นักมวย");
    assert.equal(existing.character.experience, 12);
    const legacyId = characterIdFromToken(key,2);
    const legacy = await characters.loadOrCreateById(legacyId,spawn);
    await characters.save({...legacy.character, name:"นักเดินทาง", experience:19});
    const linked = await characters.loadOrCreateById(legacyId,spawn,{name:"ignored",build:{path:"seer",ancestry:"shrine"}},true);
    assert.equal(linked.character.name,"นักเดินทาง");
    assert.equal(linked.character.experience,19);
    assert.equal(linked.character.build?.path,"seer");
  } finally { characters.close(); await rm(dir, {recursive:true,force:true}); }
});

test("all six paths create a persistent character with a usable starter weapon", async () => {
  const dir=await mkdtemp(path.join(tmpdir(),"montra-account-classes-")), characters=new CharacterStore(dir);
  try {
    const cases=[["muay_boran","muay_wraps"],["phutthaisawan","arcane_sword"],["blade","arcane_sword"],["sentinel","arcane_sword"],["seer","spirit_staff"],["mender","spirit_staff"]] as const;
    for(const [i,[job,weapon]] of cases.entries()) {
      const token="mt1_"+i.toString(16).padStart(64,"0"), id=characterIdFromToken(token);
      const first=(await characters.loadOrCreateById(id,{x:0,z:0},{name:"ทดสอบ",build:{path:job,ancestry:"shrine"}},true)).character;
      assert.equal(first.inventory?.slots[first.inventory.equippedWeaponSlot!]?.itemId,weapon);
      const saved=(await characters.loadOrCreateById(id,{x:0,z:0},undefined,true)).character;
      assert.equal(saved.build?.path,job);
    }
  } finally {characters.close();await rm(dir,{recursive:true,force:true});}
});

test("guest recovery and conversion preserve character identities and revoke other sessions", async () => {
  const dir=await mkdtemp(path.join(tmpdir(),"montra-guest-account-")), store=new AccountStore(path.join(dir,"accounts.sqlite"));
  try {
    const guest=store.createGuest(),initial=store.resolve(guest.session)!;
    assert.equal(initial.guest,true);
    const other=store.guestLogin(guest.guestKey);
    assert.deepEqual(store.resolve(other.session)?.characterIds,initial.characterIds);
    await store.upgradeGuest(guest.session,"guest_upgrade","upgrade-password-123");
    assert.equal(store.resolve(other.session),null);
    assert.throws(()=>store.guestLogin(guest.guestKey),/invalid_guest_key/);
    const login=await store.login("guest_upgrade","upgrade-password-123");
    assert.equal(store.resolve(login.session)?.guest,false);
    assert.deepEqual(store.resolve(login.session)?.characterIds,initial.characterIds);
  } finally {store.close();await rm(dir,{recursive:true,force:true});}
});

test("retiring slots cannot be reversed by reusing the old guest token",async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),"montra-retired-account-")),store=new AccountStore(path.join(dir,"accounts.sqlite"));
  try {
    const legacy="mt1_"+"63".repeat(32);
    await store.register("retired_user","retired-password-123",legacy);
    const session=(await store.login("retired_user","retired-password-123")).session,first=store.resolve(session)!;
    for(const slot of CHARACTER_SLOTS)store.retireCharacter(first.accountId,slot,first.characterIds[slot-1]);
    const changed=store.resolve(session)!;
    assert.equal(changed.accountId,first.accountId);
    assert.ok(changed.characterIds.every(id=>!first.characterIds.includes(id)));
    assert.throws(()=>store.retireCharacter(first.accountId,1,first.characterIds[0]),/slot_changed/);
    await assert.rejects(store.register("another_user","another-password-123",legacy),/legacy_already_linked/);
  } finally {store.close();await rm(dir,{recursive:true,force:true});}
});
