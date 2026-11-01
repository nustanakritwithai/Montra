import test from "node:test";
import assert from "node:assert/strict";
import { parseChatMessage } from "./ChatRules.js";

test("chat accepts Thai and emoji, trims whitespace and does not interpret markup", () => {
  assert.deepEqual(parseChatMessage({ text: "  สวัสดี 👋  ", channel: "map" }), { text: "สวัสดี 👋", channel: "map" });
  assert.deepEqual(parseChatMessage({ text: "<img src=x onerror=alert(1)>", channel: "world" }), { text: "<img src=x onerror=alert(1)>", channel: "world" });
});

test("chat rejects empty, oversized, control and client-forged fields", () => {
  for (const payload of [null, {}, { text: " ", channel: "map" }, { text: "a".repeat(201), channel: "map" },
    { text: "hi\nthere", channel: "map" }, { text: "hi\u202ethere", channel: "map" },
    { text: "hi", channel: "world", name: "admin" }, { text: "hi", channel: "map", mapId: "forbidden_forest" },
    { text: "hi", channel: "other" }, { text: 123, channel: "map" }]) {
    assert.equal(parseChatMessage(payload), null);
  }
  assert.deepEqual(parseChatMessage({ text: "😀".repeat(200), channel: "world" }), { text: "😀".repeat(200), channel: "world" });
  assert.equal(parseChatMessage({ text: "😀".repeat(201), channel: "world" }), null);
});
