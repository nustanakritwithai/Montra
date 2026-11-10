const assert = require("node:assert/strict");
const {readFileSync} = require("node:fs");
const {join} = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = readFileSync(join(__dirname, "../../src/client/ui/056-party-guild-and-rebirth.js"), "utf8");
const start = source.indexOf("  const cityProduct=");
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

function fixture({enabled = true, recovery = true, member = true, workshopSupported = false, purchaseSupported = false} = {}) {
  const nodes = {}, wire = [], timers = new Map();
  let serial = 0, now = 100;
  const walk = el => [el, ...el.children.flatMap(walk)];
  const $ = id => nodes[id] || (nodes.cityProductionContent && walk(nodes.cityProductionContent).find(el => el.id === id));
  const ctx = {
    $, document: {createElement: node}, performance: {now: () => now},
    room: {state: {cityProductionAvailable: enabled, cityRecoveryAvailable: recovery,
      cityWorkshopSupported: workshopSupported, cityPurchaseSupported: purchaseSupported},
      send(command, payload) { wire.push({command, payload: plain(payload)}); }},
    guildState: member ? {id: "guild-1", name: "สามลาน"} : null,
    inventoryState: {slots: [{itemId: wood, quantity: 10}, {itemId: stone, quantity: 6}]},
    economyReady: () => true, bagMeta: id => ({name: id}),
    economyItemName: item => item.itemId+" × "+item.quantity,
    economyRequestId: () => "request_city_ui_"+ ++serial,
    marketText: (tag, _className, text) => Object.assign(node(tag), {textContent: text || ""}),
    openGuild() {},
    openEconomy() {},
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

const workshop = {
  enabled: true, unlocked: true, atCity: true, siege: false, epoch: 2, used: 1, slots: 4,
  fee: 5, durationMs: 120_000, serverNow: 1_000_000,
  inputs: [{item: wood, amount: 1}, {item: stone, amount: 2}], output: {item: metal, quantity: 1},
};

test("a guildless visitor can send bag slots when the public workshop is open", () => {
  const f=fixture({member:false,workshopSupported:true});
  assert.deepEqual(f.wire.map(msg=>msg.command),["get_city_production","get_city_disband_claims"]);
  for (const state of [{atCity:false},{siege:true},{unlocked:false},{used:4}]) {
    f.ctx.cityReceiveWorkshop({...workshop,...state});
    assert.equal(f.button("ฝากผลิต"),undefined);
  }
  f.ctx.cityReceiveWorkshop(workshop);
  f.button("ฝากผลิต").onclick();
  assert.deepEqual(f.wire.at(-1).payload,{requestId:f.wire.at(-1).payload.requestId,
    action:"workshop_start",epoch:2,woodSlot:0,stoneSlot:1});
});

test("a visitor can claim a finished personal job after workshop intake is disabled", () => {
  const f=fixture({member:false,workshopSupported:true});
  f.ctx.cityReceiveWorkshop({...workshop,enabled:false,atCity:false,
    job:{id:"personal-job",readyAt:1_002_000,item:metal,quantity:1}});
  assert.equal(f.$("cityWorkshopClaim").disabled,true);
  f.setNow(2100);
  f.ctx.updateCityCountdown();
  assert.equal(f.$("cityWorkshopClaim").disabled,false);
  f.$("cityWorkshopClaim").onclick();
  assert.deepEqual(f.wire.at(-1).payload,{requestId:f.wire.at(-1).payload.requestId,
    action:"workshop_claim",jobId:"personal-job"});
});

test("the Moon Pass panel uses its recipe, bag slots and real market item", () => {
  const f=fixture(),ore="mat_raw_stone_2",metalTwo="mat_metal_2";
  f.ctx.inventoryState.slots=[{itemId:wood,quantity:10},{itemId:ore,quantity:4},{itemId:metal,quantity:4}];
  f.state({site:"moon_pass",cityName:"ด่านผนึกจันทรา",miningSite:"moon_pass",epoch:2,
    stock:[{item:ore,quantity:3},{item:metal,quantity:2},{item:metalTwo,quantity:1}],
    recipe:{inputs:[{item:metal,amount:1},{item:ore,amount:2}],output:metalTwo,amount:1,durationMs:120_000},
    listings:[{id:"moon-metal",item:metalTwo,quantity:2,price:30}]});
  const summary=f.nodes.cityProductionContent.children[0];
  assert.equal(summary.children[0].textContent,"ด่านผนึกจันทรา");
  const select=summary.children.find(el=>el.tag==="label").children[0];
  assert.deepEqual(select.children.map(option=>option.value),["1","2"]);
  f.submit("ฝากวัตถุดิบ",2);
  const sent=f.wire.at(-1).payload;
  assert.deepEqual(sent,{requestId:sent.requestId,action:"deposit",epoch:2,slot:1,item:ore,amount:2});
  const listed=f.nodes.cityProductionContent.children.find(group=>group.children[0].textContent==="ประกาศขายของกิลด์");
  assert.match(listed.children[1].children[0].textContent,/mat_metal_2/);
});

const purchase={item:metal,enabled:true,atMoon:false,siege:false,maxAmount:20,maxUnitPrice:1_000_000,serverNow:1_000_000,
  open:{id:"moon-order",guild:"ช่างจันทรา",remaining:3,amount:5,unitPrice:20,expiresAt:2_000_000}};

test("market sellers can send partial quantities and resend the same request after a timeout", () => {
  const f=fixture({member:false,purchaseSupported:true});
  f.ctx.inventoryState.slots.push({itemId:metal,quantity:2});
  f.ctx.openCityPurchase();
  assert.equal(f.wire.at(-1).command,"get_city_purchase_orders");
  f.ctx.cityReceivePurchase({...purchase,siege:true});
  assert.equal(f.button("ส่งของและรับทอง"),undefined);
  f.ctx.cityReceivePurchase(purchase);
  assert.equal(f.button("ยกเลิกใบสั่งซื้อ"),undefined);
  f.submit("ส่งของและรับทอง",2);
  const sent=f.wire.at(-1);
  assert.deepEqual(sent.payload,{requestId:sent.payload.requestId,action:"purchase_fill",orderId:"moon-order",slot:2,amount:2});
  [...f.timers.values()].find(timer=>timer.delay===6000).fn();
  f.button("ส่งคำขอเดิมซ้ำ").onclick();
  assert.deepEqual(f.wire.at(-1),sent);
  f.ctx.cityReceiveResult({...sent.payload,gold:40});
  assert.match(f.nodes.cityStatus.textContent,/40 ทอง/);
});

test("officers can open only on site and cancel a paused order", () => {
  const f=fixture({purchaseSupported:true});
  f.ctx.openCityPurchase();
  const owner={...purchase,open:null,manage:{epoch:3,free:10,gold:100}};
  f.ctx.cityReceivePurchase(owner);
  assert.equal(f.button("เปิดใบสั่งซื้อ"),undefined);
  f.ctx.cityReceivePurchase({...owner,atMoon:true});
  f.submit("เปิดใบสั่งซื้อ",4,15);
  const sent=f.wire.at(-1).payload;
  assert.deepEqual(sent,{requestId:sent.requestId,action:"purchase_open",epoch:3,amount:4,unitPrice:15});
  f.ctx.cityReceiveResult(sent);
  f.ctx.cityReceivePurchase({...purchase,enabled:false,canCancel:true});
  f.button("ยกเลิกใบสั่งซื้อ").onclick();
  assert.equal(f.wire.at(-1).payload.action,"purchase_cancel");
});
