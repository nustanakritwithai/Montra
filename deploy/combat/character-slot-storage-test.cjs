const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { test } = require("node:test");
const vm = require("node:vm");

// Characterize the real helpers before moving them into a client module. Do not
// copy their implementation here or evaluate the game, account entry or network.
const source = readFileSync(resolve(__dirname, "../../main.js"), "utf8");
const start = source.indexOf("  function preferredSlotKey(endpoint) {");
const end = source.indexOf("  const sessionState = MONTRA_CLIENT_MODULES.createSessionState();", start);
assert.ok(start >= 0 && end > start, "Locate the existing slot storage helpers");
const helperSource = '"use strict";\n' + source.slice(start, end) + `\n({
  preferredSlotKey, slotPreviewKey, getPreferredSlot,
  readSlotPreviews, rememberSlotPreviews
})`;

const endpoint = "https://world.example.invalid:8443/montra";
const preferredKey = "montra_character_slot:world.example.invalid:8443";
const previewsKey = "montra_character_slots_preview:world.example.invalid:8443";
const plain = value => JSON.parse(JSON.stringify(value));

function memoryStorage(entries = []) {
  const data = new Map(entries), reads = [], writes = [];
  return {
    data, reads, writes,
    getItem(key) { reads.push(key); return data.has(key) ? data.get(key) : null; },
    setItem(key, value) { writes.push({ key, value }); data.set(key, String(value)); },
  };
}

function loadHelpers(storage, getStorage = () => storage) {
  let storageAccesses = 0;
  const sandbox = { URL };
  Object.defineProperty(sandbox, "localStorage", {
    get() { storageAccesses++; return getStorage(); },
  });
  const helpers = vm.runInNewContext(helperSource, sandbox, { timeout: 1000 });
  return { helpers, storageAccesses: () => storageAccesses };
}

test("storage keys retain legacy host-and-port namespaces without accessing storage", () => {
  const runtime = loadHelpers(undefined, () => { throw new Error("storage unavailable"); });
  const { preferredSlotKey, slotPreviewKey } = runtime.helpers;
  assert.equal(runtime.storageAccesses(), 0, "No eager storage lookup during initialization");
  assert.equal(preferredSlotKey(endpoint), preferredKey);
  assert.equal(slotPreviewKey(endpoint), previewsKey);
  for (const url of [
    "https://WORLD.example.invalid/path?mode=demo#slot",
    "https://world.example.invalid:443/other",
    "http://world.example.invalid:80/",
  ]) {
    assert.equal(preferredSlotKey(url), "montra_character_slot:world.example.invalid");
    assert.equal(slotPreviewKey(url), "montra_character_slots_preview:world.example.invalid");
  }
  assert.notEqual(preferredSlotKey(endpoint), preferredSlotKey("https://world.example.invalid/"));
  assert.notEqual(preferredSlotKey(endpoint), preferredSlotKey("https://other.example.invalid:8443/"));
  assert.equal(runtime.storageAccesses(), 0);
});

test("preferred slot accepts existing numeric representations of slots 1 through 3", () => {
  for (const [stored, expected] of [
    ["1", 1], ["2", 2], ["3", 3], ["2.0", 2], [" 3 ", 3], ["0x2", 2],
  ]) {
    const storage = memoryStorage([[preferredKey, stored]]);
    assert.equal(loadHelpers(storage).helpers.getPreferredSlot(endpoint), expected, stored);
    assert.deepEqual(storage.reads, [preferredKey]);
    assert.deepEqual(storage.writes, []);
  }
});

test("missing or invalid preferred slots fall back to slot 1 without writing a repair", () => {
  for (const stored of [null, "", " ", "0", "4", "-1", "2.5", "NaN", "Infinity", "broken"]) {
    const storage = memoryStorage(stored === null ? [] : [[preferredKey, stored]]);
    assert.equal(loadHelpers(storage).helpers.getPreferredSlot(endpoint), 1, String(stored));
    assert.deepEqual(storage.reads, [preferredKey]);
    assert.deepEqual(storage.writes, []);
  }
});

test("preview reads preserve existing arrays and do not silently sanitize or rewrite them", () => {
  // Reads currently accept any array shape. Validation belongs to the writer;
  // extraction must not quietly add a migration or invent authoritative data.
  const previews = [{ slot: 99, level: "7", extra: { note: "legacy preview" } }, null];
  const storage = memoryStorage([[previewsKey, JSON.stringify(previews)]]);
  assert.deepEqual(plain(loadHelpers(storage).helpers.readSlotPreviews(endpoint)), previews);
  assert.deepEqual(storage.reads, [previewsKey]);
  assert.deepEqual(storage.writes, []);
});

test("missing, malformed or non-array preview JSON produces an empty array", () => {
  for (const stored of [null, "", "not json", "[", "null", "true", "7", '"text"', "{}", "[]"]) {
    const storage = memoryStorage(stored === null ? [] : [[previewsKey, stored]]);
    assert.deepEqual(plain(loadHelpers(storage).helpers.readSlotPreviews(endpoint)), [], String(stored));
    assert.deepEqual(storage.reads, [previewsKey]);
    assert.deepEqual(storage.writes, []);
  }
});

test("preview writes require exactly three entries before touching storage", () => {
  const runtime = loadHelpers(undefined, () => { throw new Error("must not access storage"); });
  for (const slots of [undefined, null, {}, "abc", [], [{}], [{}, {}], [{}, {}, {}, {}]]) {
    assert.equal(runtime.helpers.rememberSlotPreviews(endpoint, slots), undefined);
  }
  assert.equal(runtime.storageAccesses(), 0);
});

test("preview writes keep only display fields, renumber slots and leave input unchanged", () => {
  const longName = "ก".repeat(30);
  const input = Object.freeze([
    Object.freeze({ slot: 42, occupied: true, unavailable: false, name: longName,
      level: Number.MAX_SAFE_INTEGER, inventory: ["fixture item"], session: "fixture-only" }),
    Object.freeze({ slot: 77, occupied: 1, unavailable: "true", name: 123, level: "9" }),
    null,
  ]);
  const before = plain(input);
  const storage = memoryStorage();
  const { helpers } = loadHelpers(storage);
  assert.equal(helpers.rememberSlotPreviews(endpoint, input), undefined);
  const expected = [
    { slot: 1, occupied: true, unavailable: false, name: "ก".repeat(24), level: Number.MAX_SAFE_INTEGER },
    { slot: 2, occupied: false, unavailable: false, name: "", level: 0 },
    { slot: 3, occupied: false, unavailable: false, name: "", level: 0 },
  ];
  assert.deepEqual(storage.reads, []);
  assert.deepEqual(storage.writes, [{ key: previewsKey, value: JSON.stringify(expected) }]);
  assert.deepEqual(plain(helpers.readSlotPreviews(endpoint)), expected);
  assert.deepEqual(plain(input), before);
});

test("preview field normalization retains strict booleans, safe integers and UTF-16 slicing", () => {
  const levels = [0, -2, Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER,
    Number.MAX_SAFE_INTEGER + 1, 1.5, NaN, Infinity, "2", null, undefined];
  for (const level of levels) {
    const storage = memoryStorage();
    loadHelpers(storage).helpers.rememberSlotPreviews(endpoint, [
      { occupied: false, unavailable: true, name: "ก".repeat(23) + "😀", level }, {}, {},
    ]);
    const saved = JSON.parse(storage.data.get(previewsKey))[0];
    assert.deepEqual(saved, {
      slot: 1, occupied: false, unavailable: true,
      name: ("ก".repeat(23) + "😀").slice(0, 24),
      level: Number.isSafeInteger(level) ? level : 0,
    });
  }
});

test("unavailable localStorage and failed reads use fallbacks without crashing", () => {
  const inaccessible = loadHelpers(undefined, () => { throw new Error("storage access denied"); }).helpers;
  assert.equal(inaccessible.getPreferredSlot(endpoint), 1);
  assert.deepEqual(plain(inaccessible.readSlotPreviews(endpoint)), []);
  assert.doesNotThrow(() => inaccessible.rememberSlotPreviews(endpoint, [{}, {}, {}]));

  let reads = 0;
  const failedRead = loadHelpers({
    getItem() { reads++; throw new Error("read failed"); },
    setItem() { assert.fail("Read failures must not write repairs"); },
  }).helpers;
  assert.equal(failedRead.getPreferredSlot(endpoint), 1);
  assert.deepEqual(plain(failedRead.readSlotPreviews(endpoint)), []);
  assert.equal(reads, 2);
});

test("preview write failure is swallowed and not retried", () => {
  const writes = [];
  const { helpers } = loadHelpers({
    getItem() { assert.fail("Writing previews must not read storage"); },
    setItem(key) { writes.push(key); throw new Error("quota exceeded"); },
  });
  assert.doesNotThrow(() => helpers.rememberSlotPreviews(endpoint, [{}, {}, {}]));
  assert.deepEqual(writes, [previewsKey]);
});

test("invalid endpoint errors remain contained by read and write helpers", () => {
  const storage = memoryStorage();
  const { helpers } = loadHelpers(storage);
  assert.throws(() => helpers.preferredSlotKey("not a URL"), { name: "TypeError" });
  assert.throws(() => helpers.slotPreviewKey("not a URL"), { name: "TypeError" });
  assert.equal(helpers.getPreferredSlot("not a URL"), 1);
  assert.deepEqual(plain(helpers.readSlotPreviews("not a URL")), []);
  assert.doesNotThrow(() => helpers.rememberSlotPreviews("not a URL", [{}, {}, {}]));
  assert.deepEqual(storage.reads, []);
  assert.deepEqual(storage.writes, []);
});
