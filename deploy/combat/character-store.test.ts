import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  CharacterStore, characterIdFromToken, getGuestToken,
  parseCharacterName, claimCharacter, releaseCharacter,
} from "./CharacterStore.js";

const tokenA = "mt1_" + "ab".repeat(32);
const tokenB = "mt1_" + "cd".repeat(32);
const spawn = { x: 0, z: 0 };

async function withTempStore(callback: (store: CharacterStore, dir: string) => Promise<void>) {
  const dir = await mkdtemp(path.join(tmpdir(), "montra-s2-"));
  try { await callback(new CharacterStore(dir), dir); }
  finally { await rm(dir, { recursive: true, force: true }); }
}

test("S2: guest token validation, session claim and no public raw token", () => {
  assert.equal(getGuestToken({}), null);
  assert.equal(getGuestToken(null), null);
  assert.equal(getGuestToken({ guestToken: tokenA }), tokenA);
  assert.throws(() => getGuestToken({ guestToken: "mt1_hack" }), /invalid_character_token/);
  assert.throws(() => characterIdFromToken("../x"), /invalid_character_token/);
  const id = characterIdFromToken(tokenA);
  assert.match(id, /^[0-9a-f]{64}$/);
  assert.ok(!id.includes(tokenA));
  assert.equal(claimCharacter(id, "session-a"), true);
  assert.equal(claimCharacter(id, "session-b"), false);
  releaseCharacter(id, "session-b"); // wrong owner cannot steal lease
  assert.equal(claimCharacter(id, "session-b"), false);
  releaseCharacter(id, "session-a");
  assert.equal(claimCharacter(id, "session-b"), true);
  releaseCharacter(id, "session-b");
});

test("S2: Thai character names and injection are validated", () => {
  assert.equal(parseCharacterName({ name: "นที" }), "นที");
  assert.equal(parseCharacterName({ name: "Montra 2" }), "Montra 2");
  assert.equal(parseCharacterName({ name: "<script>" }), null);
  assert.equal(parseCharacterName({ name: "ก" }), null);
  assert.equal(parseCharacterName({ name: "x".repeat(21) }), null);
  assert.equal(parseCharacterName({ name: "นที", hp: 9999 }), null);
});

test("S2: guest character survives a brand-new store instance and saves only hashed filenames", async () => {
  await withTempStore(async (store, dir) => {
    const first = await store.loadOrCreate(tokenA, spawn);
    assert.equal(first.created, true);
    assert.equal(first.character.name, "นักเดินทาง");
    assert.equal(first.character.pkKills, 0);
    const modified = { ...first.character, name: "คนเดินทาง", pkKills: 7, pkDeaths: 3,
      x: -4.5, z: 2.75, hp: 63, updatedAt: new Date().toISOString() };
    await store.save(modified);
    const loaded = await new CharacterStore(dir).loadOrCreate(tokenA, { x: 9, z: 9 });
    assert.equal(loaded.created, false);
    assert.equal(loaded.character.name, "คนเดินทาง");
    assert.equal(loaded.character.pkKills, 7);
    assert.equal(loaded.character.pkDeaths, 3);
    assert.equal(loaded.character.hp, 63);
    assert.equal(loaded.character.x, -4.5);
    const file = path.join(dir, characterIdFromToken(tokenA) + ".json");
    const disk = await readFile(file, "utf8");
    assert.ok(!disk.includes(tokenA), "secret guest token must not be stored in records");
  });
});

test("S2: concurrent autosaves serialize and cannot overwrite the latest state", async () => {
  await withTempStore(async (store) => {
    const first = (await store.loadOrCreate(tokenB, spawn)).character;
    await Promise.all([
      store.save({ ...first, pkKills: 1, updatedAt: new Date().toISOString() }),
      store.save({ ...first, pkKills: 2, updatedAt: new Date().toISOString() }),
      store.save({ ...first, pkKills: 3, updatedAt: new Date().toISOString() }),
    ]);
    const latest = await store.loadOrCreate(tokenB, spawn);
    assert.equal(latest.character.pkKills, 3);
  });
});

test("S2: corrupt character records fail closed instead of resetting progress", async () => {
  await withTempStore(async (store, dir) => {
    const original = (await store.loadOrCreate(tokenA, spawn)).character;
    const file = path.join(dir, original.id + ".json");
    await writeFile(file, "{broken");
    await assert.rejects(store.loadOrCreate(tokenA, spawn));
    assert.equal(await readFile(file, "utf8"), "{broken");

    await writeFile(file, JSON.stringify({ ...original, pkKills: 999999999999 }));
    await assert.rejects(store.loadOrCreate(tokenA, spawn), /character_record_invalid/);
  });
});
