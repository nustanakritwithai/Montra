const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

class Element {
  constructor(tag) { this.tag = tag; this.children = []; this.listeners = {}; this.textContent = ""; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  addEventListener(name, callback) { this.listeners[name] = callback; }
  setAttribute() {}
}
function find(node, predicate) {
  if (predicate(node)) return node;
  for (const child of node.children) { const found = find(child, predicate); if (found) return found; }
}
async function scenario(responses) {
  const root = new Element("root"), card = new Element("card"), requests = [];
  const slot = {slot: 1, revision: "test-revision", occupied: true, name: "ทดสอบ", path: "blade", level: 1};
  let leaves = 0;
  const storage = {getItem: () => "test-session", setItem() {}, removeItem() {}};
  const window = {};
  const context = {
    window, URL, sessionStorage: storage, localStorage: storage,
    document: {getElementById: id => id === "accountEntry" ? root : card, createElement: tag => new Element(tag)},
    setTimeout: callback => { queueMicrotask(callback); return 1; },
    fetch: async (url, options) => {
      if (url.endsWith("/slots")) return {ok: true, status: 200, json: async () => ({guest: false, slots: [slot]})};
      assert.ok(url.endsWith("/delete-character"));
      requests.push(JSON.parse(options.body));
      const response = responses[Math.min(requests.length - 1, responses.length - 1)];
      if (response === "network") throw Error("network");
      return {ok: response === "ok", status: response === "ok" ? 200 : 409, json: async () => response === "ok" ? {ok: true} : {error: response}};
    },
  };
  vm.runInNewContext(fs.readFileSync("account-entry.js", "utf8"), context);
  window.MontraEntry.start(() => {}, async () => { leaves++; });
  await new Promise(resolve => setImmediate(resolve));
  find(card, el => el.textContent === "ลบตัวละครช่อง 1").listeners.click();
  const form = find(card, el => el.tag === "form");
  find(form, el => el.tag === "input").value = "ทดสอบ";
  await form.onsubmit({preventDefault() {}});
  return {requests, leaves, card};
}
(async () => {
  const released = await scenario(["character_online", "character_online", "ok"]);
  assert.equal(released.requests.length, 3, "retry while the server finishes leaving");
  assert.equal(released.leaves, 1);
  assert.ok(released.requests.every(r => r.revision === "test-revision" && r.name === "ทดสอบ"));
  const active = await scenario(["character_online"]);
  assert.ok(active.requests.length > 1 && active.requests.length <= 25, "retry must be bounded");
  assert.match(find(active.card, e => e.className === "account-error").textContent, /อุปกรณ์|แท็บ/);
  const guild = await scenario(["character_in_guild"]);
  assert.equal(guild.requests.length, 1, "do not retry other refusal reasons");
  const network = await scenario(["network"]);
  assert.equal(network.requests.length, 1, "do not retry ambiguous network failures");
  console.log("MONTRA character deletion UI retry passed");
})().catch(error => { console.error(error); process.exitCode = 1; });
