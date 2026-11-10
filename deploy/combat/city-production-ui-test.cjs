const assert = require("node:assert/strict");
const {readFileSync} = require("node:fs");
const {join} = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = readFileSync(join(__dirname, "../../src/client/ui/056-party-guild-and-rebirth.js"), "utf8");
const start = source.indexOf("  const cityRawItems=");
const end = source.indexOf("  let rebirthState=", start);
assert(start >= 0 && end > start);

const wood = "mat_raw_wood_1", stone = "mat_raw_stone_1", metal = "mat_metal_1";
const plain = value => JSON.parse(JSON.stringify(value));

function node(tag = "div") {
  return {
    tag, children: [], disabled: false, textContent: "",
    get valueAsNumber() { return Number(this.value); },
    append(...children) {
      this.children.push(...children);
      if (this.tag === "select" && this.value === undefined) this.value = this.children[0].value;
    },
    replaceChildren(...children) { this.children = children; },
  };
}

function fixture({enabled = true, recovery = true, member = true} = {}) {
  const nodes = {}, wire = [], timers = new Map();
  let serial = 0, now = 100;
  const walk = el => [el, ...el.children.flatMap(walk)];
  const $ = id => nodes[id] || (nodes.cityProductionContent && walk(nodes.cityProductionContent).find(el => el.id === id));
  const ctx = {
    $, document: {createElement: node}, performance: {now: () => now},
    room: {state: {cityProductionAvailable: enabled, cityRecoveryAvailable: recovery},
      send(command, payload) { wire.push({command, payload: plain(payload)}); }},
    guildState: member ? {id: "guild-1", name: "สามลาน"} : null,
    inventoryState: {slots: [{itemId: wood, quantity: 10}, {itemId: stone, quantity: 6}]},
    economyReady: () => true, bagMeta: id => ({name: id}),
    economyItemName: item => item.itemId+" × "+item.quantity,
    economyRequestId: () => "request_city_ui_"+ ++serial,
    marketText: (tag, _className, text) => Object.assign(node(tag), {textContent: text || ""}),
    openGuild() {},
    openDrawer(name) {
      ctx.drawerActive = name;
      for (const id of ["cityBack","cityRefresh","cityStatus","cityProductionContent"]) nodes[id] = node();
    },
    setTimeout(fn, delay) { timers.set(++serial,{fn,delay}); return serial; },
    clearTimeout(id) { timers.delete(id); },
    window: {confirm: () => true},
  };
  vm.runInNewContext(source.slice(start,end),ctx);
  const elements = () => walk(nodes.cityProductionContent);
  const button = text => elements().find(el => el.tag === "button" && el.textContent === text);
  const submit = (text, ...values) => {
    const form = elements().find(el => el.tag === "form" && el.children.some(child => child.textContent === text));
    assert(form);
    form.children.filter(child => child.tag === "label").forEach((label,index) => label.children[0].value = values[index]);
    form.onsubmit({preventDefault() {}});
  };
  const state = (changes = {}) => ctx.cityReceiveState({
    guildId: "guild-1", atCity: true, serverNow: 1_000_000, epoch: 1, level: 1, used: 12, capacity: 60, marketGold: 30,
    stock: [{item: wood, quantity: 4}, {item: stone, quantity: 5}, {item: metal, quantity: 3}],
    reclaim: [], listings: [], officer: true, canDisband: true, job: null, costs: null,
    recipe: {inputs: [{item: wood, amount: 1}, {item: stone, amount: 2}], output: metal, durationMs: 120_000,
      rush: {gold: 15, durationMs: 60_000}}, ...changes,
  });
  ctx.openCityProduction();
  return {ctx, nodes, wire, timers, button, submit, state, $, setNow: value => {now=value;}};
}

test("old server sends no city commands; a paused server retains cancellation and reclaim", () => {
  const old = fixture({recovery: false});
  assert.deepEqual(old.wire, []);
  const paused = fixture({enabled: false});
  paused.state({listings: [{id: "listing", quantity: 1, price: 30}], reclaim: [{epoch: 2,item: wood,quantity: 2}]});
  assert.equal(paused.button("ฝากวัตถุดิบ"), undefined);
  assert.equal(paused.button("เริ่มผลิต · 120 วิ"), undefined);
  assert.equal(paused.button("ตั้งขายในตลาดโลก"), undefined);
  assert(paused.button("รับ "+wood));
  paused.button("ยกเลิกขาย").onclick();
  assert.equal(paused.wire.at(-1).payload.action, "cancel");
});

test("stock form sends the selected bag slot and ambiguous retries reuse the same request", () => {
  const f = fixture();
  f.state();
  const select = f.nodes.cityProductionContent.children[0].children.find(el => el.tag === "label").children[0];
  select.value = "1";select.onchange();
  f.submit("ฝากวัตถุดิบ",5);
  const sent = f.wire.at(-1);
  assert.deepEqual(sent, {command: "city_production", payload: {
    requestId: sent.payload.requestId, action:"deposit", epoch:1, slot:1, item:stone, amount:5,
  }});
  assert(f.button("ฝากวัตถุดิบ").disabled);
  f.ctx.cityReceiveResult({requestId: "wrong", action:"deposit"});
  assert(f.button("ฝากวัตถุดิบ").disabled);
  [...f.timers.values()].find(timer => timer.delay===6000).fn();
  f.button("ส่งคำขอเดิมซ้ำ").onclick();
  assert.deepEqual(f.wire.at(-1),sent);
  f.ctx.cityReceiveResult({requestId: sent.payload.requestId, action:"deposit"});
  assert.equal(f.nodes.cityStatus.textContent,"ฝากวัตถุดิบแล้ว");
  assert(!f.button("ฝากวัตถุดิบ").disabled);
});

test("factory time uses the server timestamp and refreshes once when due", () => {
  const f=fixture();
  f.state({job: {id:"job",readyAt:1_002_000}});
  assert.match(f.$("cityJobClock").textContent,/2 วินาที/);
  f.setNow(2100);
  f.ctx.updateCityCountdown();
  f.ctx.updateCityCountdown();
  assert.equal(f.wire.filter(message=>message.command==="get_city_production").length,2);
  assert.match(f.$("cityJobClock").textContent,/ครบเวลา/);
});

test("a former commander can read and claim a partial payout without a guild", () => {
  const f=fixture({enabled: false, member: false});
  assert.deepEqual(f.wire,[{command:"get_city_disband_claims",payload:{}}]);
  f.ctx.cityReceiveClaims({assets: [{guildId:"former",name:"กิลด์เดิม",item:"gold",amount:30}]});
  f.submit("รับ ทองตลาด",12);
  assert.deepEqual(f.wire.at(-1).payload,{
    requestId:f.wire.at(-1).payload.requestId,action:"claim_disband",guildId:"former",item:"gold",amount:12,
  });
});

test("construction shows progress and sends the correct source, role and epoch", () => {
  const f=fixture();
  const project={plot:"ลานด้านเหนือของคลังข้าวหลวง",atPlot:true,siege:false,commander:true,capacity:90,
    durationMs:300_000,status:null,materials:[{item:wood,amount:12,reserved:0},{item:metal,amount:4,reserved:0}]};
  f.state({construction:{...project,atPlot:false}});
  assert.equal(f.button("เปิดโครงการขยายคลัง").disabled,true);
  f.state({construction:{...project,commander:false}});
  assert.equal(f.button("เปิดโครงการขยายคลัง"),undefined);
  f.state({construction:project});
  f.button("เปิดโครงการขยายคลัง").onclick();
  assert.equal(f.wire.at(-1).payload.action,"warehouse_start");
  f.ctx.cityReceiveResult(f.wire.at(-1).payload);

  const collecting={...project,status:"collecting"};
  f.state({construction:collecting,officer:false});
  assert.equal(f.button("จัดสรรจากคลัง · "+metal),undefined);
  f.submit("สมทบ "+wood,6);
  assert.deepEqual(f.wire.at(-1).payload,{requestId:f.wire.at(-1).payload.requestId,
    action:"warehouse_contribute",epoch:1,slot:0,item:wood,amount:6});
  f.ctx.cityReceiveResult(f.wire.at(-1).payload);
  f.state({construction:{...collecting,siege:true}});
  assert.equal(f.button("สมทบ "+wood),undefined);
  f.state({construction:collecting});
  f.submit("จัดสรรจากคลัง · "+metal,3);
  assert.deepEqual(f.wire.at(-1).payload,{requestId:f.wire.at(-1).payload.requestId,
    action:"warehouse_allocate",epoch:1,item:metal,amount:3});
});

test("construction timer holds for a siege and refreshes once when due", () => {
  const f=fixture();
  const project={status:"building",plot:"ลานคลัง",capacity:90,durationMs:300_000,readyAt:1_002_000,materials:[]};
  f.state({construction:{...project,siege:true}});
  assert.match(f.$("cityConstructionClock").textContent,/รอผลศึก/);
  f.state({construction:project});
  assert.match(f.$("cityConstructionClock").textContent,/2 วินาที/);
  f.setNow(2100);
  f.ctx.updateCityCountdown();
  f.ctx.updateCityCountdown();
  assert.equal(f.wire.filter(message=>message.command==="get_city_production").length,2);
});
