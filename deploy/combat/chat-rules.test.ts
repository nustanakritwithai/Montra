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


test("party, private and bug chat accept only their authorized payload shape",()=>{
  assert.deepEqual(parseChatMessage({channel:"party",text:"ทีม"}),{channel:"party",text:"ทีม"});
  assert.deepEqual(parseChatMessage({channel:"private",text:"ส่วนตัว",targetId:"abc-123"}),{channel:"private",text:"ส่วนตัว",targetId:"abc-123"});
  assert.deepEqual(parseChatMessage({channel:"bug",text:"ติดกำแพง"}),{channel:"bug",text:"ติดกำแพง"});
  for(const payload of [{channel:"private",text:"x"},{channel:"private",text:"x",targetId:"../x"},{channel:"private",text:"x",targetId:"abc",name:"admin"},{channel:"party",text:"x",targetId:"abc"},{channel:"bug",text:"x",path:"../../x"}])assert.equal(parseChatMessage(payload),null);
});
