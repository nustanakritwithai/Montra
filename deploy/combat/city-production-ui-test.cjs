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
    tag, children: [], disabled: false, textContent: "", dataset:{},
    get lastElementChild() { return this.children.at(-1); },
    get valueAsNumber() { return Number(this.value); },
    append(...children) {
      for(const child of children)child.parentElement=this;
      this.children.push(...children);
      if (this.tag === "select" && this.value === undefined) this.value = this.children[0].value;
    },
    replaceChildren(...children) { this.children = children; },
    insertBefore(child,before) { this.children.splice(this.children.indexOf(before),0,child); },
    contains(child) { return this === child || this.children.some(node=>node.contains(child)); },
    focus() { this.focused = true; },
    scrollIntoView() { this.scrolled = true; },
    querySelectorAll(selector) {
      const key=selector==="[data-contract-deadline]"?"contractDeadline":null;
      return this.children.flatMap(child=>[...(key && child.dataset[key]?[child]:[]),...child.querySelectorAll(selector)]);
    },
    querySelector(tag) { return this.children.find(child=>child.tag===tag) || this.children.map(child=>child.querySelector(tag)).find(Boolean); },
    setAttribute(key,value) { (this.attributes ||= {})[key]=value; },
  };
}

function fixture({enabled = true, recovery = true, member = true, workshopSupported = false,
  purchaseSupported = false, missionSupported = false, governanceAvailable = false, marketSupported = false} = {}) {
  const nodes = {}, wire = [], timers = new Map();
  let serial = 0, now = 100;
  const walk = el => [el, ...el.children.flatMap(walk)];
  const $ = id => nodes[id] || (nodes.cityProductionContent && walk(nodes.cityProductionContent).find(el => el.id === id));
  const ctx = {
    $, mode:"live", territoryState:null, document: {createElement: node}, performance: {now: () => now}, activeMapId: "sam_lan_estuary",
    room: {state: {cityProductionAvailable: enabled, cityRecoveryAvailable: recovery,
      cityWorkshopSupported: workshopSupported, cityPurchaseSupported: purchaseSupported, cityMissionSupported: missionSupported,
      cityGovernanceAvailable: governanceAvailable, cityMarketSupported: marketSupported},
      send(command, payload) { wire.push({command, payload: plain(payload)}); }},
    guildState: member ? {id: "guild-1", name: "สามลาน"} : null,
    inventoryState: {slots: [{itemId: wood, quantity: 10}, {itemId: stone, quantity: 6}]},
    economyReady: () => true, bagMeta: id => ({name: id}),
    createItemTile: id => Object.assign(node(),{className:"bag-slot item-slot",itemId:id}),
    economyItemName: item => item.itemId+" × "+item.quantity,
    economyRequestId: () => "request_city_ui_"+ ++serial,
    marketText: (tag, className, text) => Object.assign(node(tag), {className,textContent: text || ""}),
    openGuild() {},
    openEconomy() {},
    openDrawer(name,title) {
      ctx.drawerActive = name;
      ctx.drawerTitle = title;
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

test("the mission board distinguishes accepting, gathering and handing in a public job", () => {
  const f=fixture({member:false,missionSupported:true}), item="mat_raw_stone_2";
  f.ctx.openCityMission();
  assert.equal(f.wire.at(-1).command,"get_city_missions");
  const mission={id:"work",name:"กิลด์จันทรา",audience:"public",slots:1,remaining:1,reward:15,expiresAt:2_000_000,
    canAccept:true,progress:null};
  const board={enabled:true,required:3,item,serverNow:1_000_000};
  f.ctx.cityReceiveMission({...board,missions:[mission]});
  const card=f.$("cityMissionOpen").querySelector("article");
  assert.equal(card.querySelector("h4").dataset.guildIcon,"ore");
  const terms=card.children.find(el=>el.className==="city-mission-terms");
  assert.equal(terms.children[0].children[0].itemId,item);
  assert.equal(terms.children[0].children[0].attributes["aria-hidden"],"true");
  assert.equal(terms.children[0].children[1].textContent,item+" × 3");
  assert.equal(terms.children[1].children[1].textContent,"15 ทอง");
  assert.equal(card.querySelector("time").dateTime,new Date(mission.expiresAt).toISOString());
  f.button("รับงาน").onclick();
  const accepted=f.wire.at(-1).payload;
  assert.equal(accepted.action,"mission_accept");
  assert.equal(f.button("รับงาน").disabled,true);
  f.button("รับงาน").onclick();
  assert.equal(f.wire.filter(entry=>entry.payload.action==="mission_accept").length,1);
  [...f.timers.values()].find(timer=>timer.delay===6000).fn();
  assert.match(f.nodes.cityStatus.textContent,/ยังไม่ได้รับผล/);
  f.button("ส่งคำขอเดิมซ้ำ").onclick();
  assert.deepEqual(f.wire.at(-1).payload,accepted);
  f.ctx.cityReceiveResult(accepted);
  assert.match(f.nodes.cityStatus.textContent,/รับงานแล้ว/);
  f.ctx.cityReceiveMission({...board,missions:[{...mission,progress:0}]});
  assert.equal(f.$("cityMissionActive").querySelector("progress").value,0);
  f.ctx.inventoryState.slots.push({itemId:item,quantity:2});
  f.ctx.cityReceiveMission({...board,missions:[{...mission,progress:2}]});
  assert.equal(f.button("ส่งงานและรับทอง").disabled,true);
  f.ctx.cityReceiveMission({...board,missions:[{...mission,progress:3}]});
  assert.equal(f.button("ส่งงานและรับทอง").disabled,true);
  assert.match(f.$("cityMissionActive").querySelector("article").children.map(el=>el.textContent).join(" "),/ในกระเป๋าอีก 1 ชิ้น/);
  f.ctx.inventoryState.slots.at(-1).quantity=3;
  f.ctx.cityReceiveMission({...board,siege:true,missions:[{...mission,progress:3}]});
  assert.equal(f.button("ส่งงานและรับทอง").disabled,true);
  assert.equal(f.button("คืนงาน").disabled,false);
  f.ctx.cityReceiveMission({...board,missions:[{...mission,progress:3}]});
  f.button("ส่งงานและรับทอง").onclick();
  const submitted=f.wire.at(-1).payload;
  assert.deepEqual(submitted,{requestId:submitted.requestId,action:"mission_submit",missionId:"work"});
  f.ctx.cityReceiveResult({...submitted,gold:15});
  f.ctx.cityReceiveMission({...board,missions:[]});
  assert.match(f.nodes.cityStatus.textContent,/ได้รับ 15 ทอง/);
  assert.equal(f.$("cityMissionActive").querySelector("article"),undefined);
});

test("a full or newly claimed mission shows its state and reloads the board on a race", () => {
  const f=fixture({member:false,missionSupported:true});
  f.ctx.openCityMission();
  const mission={id:"work",name:"กิลด์จันทรา",audience:"public",slots:1,remaining:1,reward:15,expiresAt:2_000_000,
    canAccept:true,progress:null};
  const board={enabled:true,required:3,item:"mat_raw_stone_2",serverNow:1_000_000};
  f.ctx.cityReceiveMission({...board,missions:[mission]});
  f.button("รับงาน").onclick();
  f.ctx.cityReceiveError({requestId:f.wire.at(-1).payload.requestId,reason:"city_mission_full"});
  assert.equal(f.wire.at(-1).command,"get_city_missions");
  f.ctx.cityReceiveMission({...board,missions:[{...mission,remaining:0,canAccept:false}]});
  assert.equal(f.button("รับงาน").disabled,true);
  assert(f.$("cityMissionOpen").querySelector("article").children.some(el=>el.textContent==="งานเต็ม"));
  assert.match(f.nodes.cityStatus.textContent,/มีคนรับครบแล้ว/);
});

test("the mission board can post guild-only warehouse work when regular stock is full", () => {
  const f=fixture({missionSupported:true});
  f.ctx.openCityMission();
  const board={enabled:true,warehouseMissions:true,required:3,item:"mat_raw_stone_2",serverNow:1_000_000,
    maxSlots:4,maxReward:100,hours:[1],atMoon:true,missions:[],
    manage:{epoch:2,canPost:true,gold:30,free:0,warehouseFree:6}};
  f.ctx.cityReceiveMission(board);
  const audience=f.$("cityMissionAudience");
  assert.equal(audience.value,"guild");
  assert.equal(audience.disabled,true);
  const slots=f.$("cityMissionSlots"),reward=f.$("cityMissionReward");
  slots.value="3";slots.oninput();
  assert.equal(f.button("เปิดภารกิจ").disabled,true);
  assert.match(f.$("cityMissionQuote").textContent,/สูงสุด 2 คน/);
  slots.value="2";reward.value="20";reward.oninput();
  assert.equal(f.button("เปิดภารกิจ").disabled,true);
  assert.match(f.$("cityMissionQuote").textContent,/กันค่าจ้าง 40 ทอง · กันพื้นที่ 6 ชิ้น · ทองตลาดไม่พอ/);
  f.ctx.document.activeElement=reward;
  f.ctx.cityReceiveMission(board);
  assert.equal(f.$("cityMissionSlots").value,"2");
  assert.equal(f.$("cityMissionReward").value,"20");
  assert.equal(f.$("cityMissionReward").focused,true);
  f.submit("เปิดภารกิจ",3,5);
  assert.equal(f.wire.at(-1).command,"get_city_missions");
  f.submit("เปิดภารกิจ",2,5);
  const order=f.wire.at(-1).payload;
  assert.deepEqual(order,{requestId:order.requestId,action:"mission_open",epoch:2,
    audience:"guild",slots:2,reward:5,hours:1,purpose:"warehouse"});
  f.ctx.cityReceiveResult(order);
  f.ctx.cityReceiveMission({...board,manage:null});
  assert.equal(f.$("cityMissionManage"),undefined);
});

test("the freight board sends the selected scope, destination tenure and delivery only on site", () => {
  const f=fixture({missionSupported:true}), moon="moon_pass", river="sam_lan_estuary";
  f.ctx.openCityMission();
  const board={enabled:true,required:3,item:"mat_raw_stone_2",serverNow:1_000_000,missions:[]};
  const hauls={enabled:true,paused:false,atCity:moon,jobs:[],manage:{epoch:7,destination:river,destinationEpoch:8,
    needsApproval:true,item:"mat_metal_2",amount:4,reward:30}};
  f.ctx.cityReceiveMission({...board,hauls});
  f.submit("เปิดงานขนเสบียง",3,12);
  const opened=f.wire.at(-1).payload;
  assert.deepEqual(opened,{requestId:opened.requestId,action:"haul_open",epoch:7,destination:river,destinationEpoch:8,
    amount:3,reward:12,audience:"public"});
  f.ctx.cityReceiveResult(opened);
  const job={id:"freight",source:moon,destination:river,name:"กิลด์จันทรา",item:"mat_metal_2",amount:3,reward:12,
    audience:"public",state:"carrying",carrying:true,expires:2_000_000};
  const carrying={...hauls,jobs:[job],manage:null};
  f.ctx.cityReceiveMission({...board,hauls:carrying});
  assert.match(f.$("cityMissionActive").querySelector("h4").textContent,/^ขนเสบียง/);
  assert.equal(f.$("cityMissionOpen").querySelector("article"),undefined);
  assert.equal(f.button("ส่งเสบียงและรับทอง").disabled,true);
  f.ctx.cityReceiveMission({...board,hauls:{...carrying,atCity:river,paused:true}});
  assert.equal(f.button("ส่งเสบียงและรับทอง").disabled,true);
  f.ctx.cityReceiveMission({...board,hauls:{...carrying,atCity:river}});
  assert.equal(f.button("ส่งเสบียงและรับทอง").disabled,false);
  f.button("ส่งเสบียงและรับทอง").onclick();
  assert.equal(f.wire.at(-1).payload.action,"haul_deliver");
  assert.equal(f.wire.at(-1).payload.haulId,"freight");
});

test("the contract board refreshes a stale purchase quote and allows a committed delivery with intake paused", () => {
  const f=fixture({missionSupported:true}), moon="moon_pass", river="sam_lan_estuary";
  f.ctx.openCityMission();
  const board={enabled:true,required:3,item:"mat_raw_stone_2",serverNow:1_000_000,missions:[]};
  const contracts={enabled:true,paused:false,source:river,destination:moon,atCity:moon,atMarket:moon,job:null,
    manage:{epoch:7,canOpen:true,maxAmount:12,maxGold:100}};
  f.ctx.cityReceiveMission({...board,tradeContracts:contracts});
  f.submit("เปิดสัญญาจัดซื้อ",6,96);
  const opened=f.wire.at(-1).payload;
  assert.deepEqual(opened,{requestId:opened.requestId,action:"contract_open",epoch:7,amount:6,gold:96});
  f.ctx.cityReceiveResult(opened);
  const job={id:"contract",name:"กิลด์จันทรา",amount:6,gold:96,total:90,expires:2_000_000};
  f.ctx.cityReceiveMission({...board,tradeContracts:{...contracts,manage:null,job}});
  assert.equal(f.button("ซื้อแร่และรับสัญญา").disabled,true);
  f.ctx.cityReceiveMission({...board,tradeContracts:{...contracts,manage:null,job,atCity:river,atMarket:river}});
  f.button("ซื้อแร่และรับสัญญา").onclick();
  const accepted=f.wire.at(-1).payload;
  assert.deepEqual(accepted,{requestId:accepted.requestId,action:"contract_accept",contractId:"contract",total:90});
  f.ctx.cityReceiveError({requestId:accepted.requestId,reason:"city_market_price_changed"});
  assert.equal(f.wire.at(-1).command,"get_city_missions");
  f.ctx.cityReceiveMission({...board,tradeContracts:{...contracts,enabled:false,job:{...job,yours:true,carrying:true}}});
  assert.match(f.$("cityMissionActive").querySelector("h4").textContent,/^สัญญาจัดซื้อ/);
  assert.equal(f.button("ส่งสินค้าตามสัญญา").disabled,false);
  f.button("ส่งสินค้าตามสัญญา").onclick();
  const delivered=f.wire.at(-1).payload;
  assert.deepEqual(delivered,{requestId:delivered.requestId,action:"contract_deliver",contractId:"contract"});
  f.ctx.cityReceiveResult({...delivered,trade:{amount:6,total:96,buying:false}});
  assert.match(f.nodes.cityStatus.textContent,/ได้รับ 96 ทอง/);
});

test("the city hall only permits spending reserved supplies after defense and binds the request to the set", () => {
  const f=fixture({governanceAvailable:true});
  f.state({site:"moon_pass",miningSite:"moon_pass"});
  f.button("ศาลาว่าการเมือง").onclick();
  const state={serverNow:1_000_000,epoch:2,nextAt:2_000_000,atMoon:true,commander:true,stock:[],history:[],used:9,capacity:60,
    treasury:{available:30,held:0,missionHeld:0,purchaseHeld:0,rushHeld:0,earned:30,paid:0},supplyEnabled:true};
  const supply={id:"reserve-1",status:"held",materials:[{item:"mat_metal_2",amount:3,stock:0}]};
  f.ctx.cityReceiveGovernance({...state,supply});
  assert.equal(f.button("ซ่อมประตูหลังศึก").disabled,true);
  assert.equal(f.button("เริ่มผลิตด้วยเสบียง").disabled,true);
  f.ctx.cityReceiveGovernance({...state,siege:true,supply:{...supply,canRepair:true,canRecover:true}});
  assert.equal(f.button("ซ่อมประตูหลังศึก").disabled,true);
  assert.equal(f.button("คืนเสบียงเข้าคลัง").disabled,true);
  f.ctx.cityReceiveGovernance({...state,supply:{...supply,canRepair:true,canRecover:true}});
  assert.equal(f.button("ซ่อมประตูหลังศึก").disabled,false);
  f.button("ซ่อมประตูหลังศึก").onclick();
  const request=f.wire.at(-1).payload;
  assert.deepEqual(request,{requestId:request.requestId,action:"supply_repair",epoch:2,supplyId:"reserve-1"});
});

test("local market submits the selected batch total only at the broker and uses new prices after rejection", () => {
  const f=fixture({marketSupported:true,member:false});
  const river="sam_lan_estuary", moon="moon_pass";
  f.ctx.openCityMarket();
  assert.equal(f.wire.at(-1).command,"get_city_markets");
  const riverMarket={site:river,epoch:1,status:"open",prices:[10,10,11],manage:null};
  const moonMarket={site:moon,epoch:2,status:"open",prices:[16,15,15],manage:null};
  const state={atMarket:null,markets:[riverMarket,moonMarket],serverNow:1_000_000,history:[],
    wallet:100,walletSpace:100,itemCount:0,bagSpace:5};
  f.ctx.cityReceiveMarkets(state);
  assert.equal(f.button("ยืนยันซื้อแร่"),undefined);
  f.ctx.cityReceiveMarkets({...state,atMarket:river});
  f.submit("ยืนยันซื้อแร่",3);
  const initial=f.wire.at(-1).payload;
  assert.deepEqual(initial,{requestId:initial.requestId,action:"local_market_trade",site:river,epoch:1,amount:3,total:31});
  f.ctx.cityReceiveError({requestId:initial.requestId,reason:"city_market_price_changed"});
  f.ctx.cityReceiveMarkets({...state,atMarket:river,markets:[{...riverMarket,prices:[11,11,12]},moonMarket]});
  f.submit("ยืนยันซื้อแร่",3);
  assert.equal(f.wire.at(-1).payload.total,34);
  f.ctx.cityReceiveResult(f.wire.at(-1).payload);
  f.ctx.cityReceiveMarkets({...state,atMarket:moon,itemCount:2});
  f.submit("ยืนยันขายแร่",2);
  assert.equal(f.wire.at(-1).payload.total,31);
  assert.equal(f.wire.at(-1).payload.site,moon);
});

test("the neutral board uses its own quote, submits the selected bag slot, and permits remote returns", () => {
  const f=fixture({marketSupported:true,member:false}), river="sam_lan_estuary";
  f.ctx.inventoryState.slots.push({itemId:metal,quantity:4});
  f.ctx.openCityMarket();
  const original={site:river,epoch:null,status:"unowned",prices:[],manage:null};
  const market={site:river,epoch:0,item:metal,side:"sell",neutral:true,enabled:true,status:"open",prices:[12,14],space:10,
    maxPrice:100,offers:[]};
  const state={atMarket:river,markets:[original],neutralMarket:market,serverNow:1_000_000,history:[],
    wallet:100,walletSpace:100,itemCount:4,bagSpace:20};
  f.ctx.cityReceiveMarkets(state);
  assert.equal(f.ctx.cityMarketRows()[0].epoch,0);
  f.submit("ฝากแร่ขึ้นขาย",3,14);
  const listed=f.wire.at(-1).payload;
  assert.deepEqual(listed,{requestId:listed.requestId,action:"neutral_market_list",epoch:0,slot:2,amount:3,unitPrice:14});
  f.ctx.cityReceiveResult(listed);
  f.submit("ยืนยันซื้อแร่",2);
  const bought=f.wire.at(-1).payload;
  assert.deepEqual(bought,{requestId:bought.requestId,action:"neutral_market_buy",epoch:0,amount:2,total:26});
  f.ctx.cityReceiveResult(bought);
  const retired={...market,epoch:null,enabled:false,prices:[],offers:[{id:"offer",state:"retired",remaining:2,unitPrice:14}]};
  f.ctx.cityReceiveMarkets({...state,atMarket:null,neutralMarket:retired});
  assert.equal(f.button("ฝากแร่ขึ้นขาย"),undefined);
  f.button("รับแร่คืน").onclick();
  assert.equal(f.wire.at(-1).payload.action,"neutral_market_withdraw");
  assert.equal(f.wire.at(-1).payload.offerId,"offer");
});

test("market owns both price comparisons and mission owns the confirmed delivery pin", () => {
  const f=fixture({marketSupported:true,missionSupported:true}), river="sam_lan_estuary", moon="moon_pass", camp="camp";
  const journey=readFileSync(join(__dirname,"../../src/client/ui/041-character-hud-and-journey.js"),"utf8");
  const visited=[];
  const gate={targetMapId:river,x:1,z:2},nextGate={targetMapId:moon,x:3,z:4},broker={role:"market",x:5,z:6};
  Object.assign(f.ctx,{activeMapId:camp,travelRoutes:null,
    ownServerCharacter:()=>({characterId:"merchant"}),openStrategicMap:(site,back)=>visited.push({site,back}),
    worldDefinitions:{[camp]:{name:"ค่าย",portals:[gate]},[river]:{name:"สามลาน",portals:[nextGate]},
      [moon]:{name:"จันทรา",portals:[],serviceNpcs:[broker]}}});
  vm.runInNewContext(journey.slice(journey.indexOf("  function travelRoute("),journey.indexOf("  function currentItemHunt(")),f.ctx);
  const origin={site:river,item:metal,side:"sell",status:"open",prices:[12,12,14]};
  const destination={site:moon,item:metal,side:"buy",status:"open",prices:[15,15,14]};
  const item="mat_metal_2",reverse={site:river,item,side:"buy",epoch:0,neutralReturn:true,status:"open",prices:[45,40]};
  const job={id:"contract",amount:3,gold:50,total:38,expires:1_120_000,carrying:false,yours:false};
  const contracts={source:river,destination:moon,job,manage:null,paused:false,enabled:true};
  const report={deals:2,units:4,gold:52,delivered:1,lastPurchase:null};
  const state={serverNow:1_000_000,markets:[origin,destination],history:[],wallet:100,bagSpace:10,
    tradeRoute:{contracts,report},returnMarkets:[reverse,{site:moon,item,side:"sell",status:"open",prices:[37,37]}]};
  f.ctx.openCityMarket();
  f.ctx.cityReceiveMarkets(state);
  const walk=el=>[el,...el.children.flatMap(walk)];
  const text=el=>walk(el).map(child=>child.textContent).join("\n");
  assert.match(text(f.$("cityTradeComparison")),/ซื้อที่สามลาน 2 ดีล · 4 ชิ้น · ส่งสัญญาสำเร็จ 1 งาน · เฉลี่ย 13 ทอง/);
  f.$("cityTradeComparison").open=true;
  for(const id of ["cityTradeOutbound","cityTradeReturn"]){
    const input=f.$(id);input.value="2";input.oninput();
  }
  assert.match(text(f.$("cityTradeComparison")),/ซื้อ 2 ชิ้น · 24 ทอง · ขายประมาณ 30 ทอง · ส่วนต่าง \+6 ทอง/);
  assert.match(text(f.$("cityTradeComparison")),/ซื้อ 2 ชิ้น · 74 ทอง · ขายประมาณ 85 ทอง · ส่วนต่าง \+11 ทอง/);
  assert.equal(f.$("cityContractCountdown"),undefined);
  f.button("ปักหมุดไปซื้อ").onclick();
  assert.equal(visited.at(-1).site,river);
  visited.at(-1).back();
  f.ctx.cityReceiveMarkets(state);
  assert.equal(f.ctx.drawerActive,"cityMarket");
  assert.equal(f.$("cityTradeComparison").open,true);
  assert.equal(f.$("cityTradeReturn").value,"2");

  f.ctx.openCityMission();
  f.ctx.cityReceiveMission({serverNow:1_001_000,missions:[],tradeContracts:contracts});
  assert.equal(f.$("cityTradeComparison"),undefined);
  assert.match(text(f.nodes.cityProductionContent),/ซื้อที่ต้นทาง 38 ทอง · ส่วนต่าง \+12 ทอง/);
  f.button("ปักหมุดไปซื้อแร่").onclick();
  assert.equal(visited.at(-1).site,river);
  assert.equal(f.ctx.cityTradeHudGuide().to,gate);
  visited.at(-1).back();
  assert.equal(f.ctx.drawerActive,"cityMission");
  f.ctx.activeMapId=river;
  const carrying={...contracts,job:{...job,yours:true,carrying:true,total:null}};
  f.ctx.cityReceiveMission({serverNow:1_002_000,missions:[],tradeContracts:carrying});
  assert.equal(f.ctx.currentCityTradePin().site,moon);
  assert.equal(f.ctx.cityTradeHudGuide().to,nextGate);
  f.ctx.activeMapId=moon;
  assert.equal(f.ctx.cityTradeHudGuide().to,broker);
  f.ctx.territoryState={warTimes:{[moon]:{phase:"battle"}}};
  assert.equal(f.ctx.cityTradeHudGuide().to,undefined);
  f.ctx.territoryState=null;
  f.ctx.cityReceiveMission({serverNow:1_003_000,missions:[],tradeContracts:{...carrying,atMarket:moon}});
  assert.equal(f.button("ส่งสินค้าตามสัญญา").disabled,false);
  f.setNow(125_000);
  f.ctx.updateCityContractDeadline();
  assert.match(f.$("cityContractCountdown").textContent,/สัญญาถึงกำหนดแล้ว/);
  assert.equal(f.button("ส่งสินค้าตามสัญญา").disabled,true);
  assert.equal(f.ctx.cityTradeHudGuide(),null);
  assert.equal(f.$("cityContractPin").hidden,true);
});

test("the market requires an on-site member, a valid amount and confirmation before funding the guild", () => {
  const f=fixture({marketSupported:true}), moon="moon_pass", river="sam_lan_estuary";
  f.ctx.openCityMarket();
  const state={atSite:moon,markets:[],serverNow:1_000_000,history:[],wallet:100};
  const contribution={epoch:8,available:0,receipts:[],siege:false};
  f.ctx.cityReceiveMarkets(state);
  assert.equal(f.button("สมทบทองตลาด"),undefined);
  f.ctx.cityReceiveMarkets({...state,atSite:river,contribution});
  assert.equal(f.button("สมทบทองตลาด"),undefined);
  f.ctx.cityReceiveMarkets({...state,contribution:{...contribution,siege:true}});
  assert.equal(f.button("สมทบทองตลาด"),undefined);
  f.ctx.cityReceiveMarkets({...state,contribution});
  f.submit("สมทบทองตลาด",101);
  assert.equal(f.wire.at(-1).command,"get_city_markets");
  f.ctx.window.confirm=()=>false;
  f.submit("สมทบทองตลาด",96);
  assert.equal(f.wire.at(-1).command,"get_city_markets");
  f.ctx.window.confirm=()=>true;
  f.submit("สมทบทองตลาด",96);
  const sent=f.wire.at(-1).payload;
  assert.deepEqual(sent,{action:"market_contribute",epoch:8,amount:96,requestId:sent.requestId});
  f.ctx.cityReceiveResult({...sent,available:96});
  assert.match(f.nodes.cityStatus.textContent,/สมทบทองตลาดกิลด์แล้ว 96 ทอง/);
});

test("the return quote uses tier-two quantities and the disabled market can release its budget", () => {
  const f=fixture({marketSupported:true});
  const river="sam_lan_estuary", moon="moon_pass", item="mat_metal_2";
  f.ctx.openCityMarket();
  const inbound={site:river,item,side:"buy",epoch:1,status:"open",prices:[38,38],manage:null};
  const outbound={site:moon,item,side:"sell",epoch:2,status:"open",prices:[36,37,37],manage:null};
  const state={atSite:river,atMarket:river,markets:[],returnMarkets:[inbound,outbound],serverNow:1_000_000,
    history:[],wallet:100,walletSpace:100,itemCount:12,bagSpace:12,returnInventory:{itemCount:1,bagSpace:4}};
  f.ctx.cityReceiveMarkets(state);
  assert.match(f.ctx.cityMarketRouteQuote(outbound,[inbound,outbound]),/เทียบ 2 ชิ้น · จ่าย 73 ทอง · ขายได้ประมาณ 76 ทอง/);
  f.submit("ยืนยันขายแร่",2);
  assert.equal(f.wire.at(-1).command,"get_city_markets");
  f.submit("ยืนยันขายแร่",1);
  const sale=f.wire.at(-1).payload;
  assert.deepEqual(sale,{requestId:sale.requestId,action:"local_market_trade",site:river,epoch:1,item,amount:1,total:38});
  f.ctx.cityReceiveResult(sale);
  assert.match(f.nodes.cityStatus.textContent,/ขายแร่แล้ว · ได้รับ 38 ทอง/);
  f.ctx.cityReceiveMarkets({...state,enabled:true,returnMarkets:[{...inbound,enabled:false,prices:[],status:"disabled",
    manage:{open:true,configured:true,commander:true,limit:12,stock:0,gold:70,budget:40,maxBudget:100,history:[]}}]});
  assert.equal(f.button("กันงบรับซื้อ"),undefined);
  f.submit("คืนงบรับซื้อ",40);
  assert.equal(f.wire.at(-1).payload.item,item);
  assert.equal(f.wire.at(-1).payload.amount,-40);
});

test("neutral return orders show wallet escrow, accept a quoted sale and support off-site partial claims", () => {
  const f=fixture({marketSupported:true,member:false}), river="sam_lan_estuary", item="mat_metal_2";
  f.ctx.openCityMarket();
  const city={site:river,item,side:"buy",status:"unowned",prices:[]};
  const reverse={...city,epoch:0,neutralReturn:true,status:"open",enabled:true,prices:[45,40],
    orders:[],maxAmount:12,maxPrice:1_000_000};
  const state={atMarket:river,markets:[],returnMarkets:[city],neutralReturnMarket:reverse,
    serverNow:1_000_000,history:[],wallet:100,walletSpace:100,itemCount:0,bagSpace:2,
    returnInventory:{itemCount:2,bagSpace:1}};
  f.ctx.cityReceiveMarkets(state);
  f.submit("เปิดใบสั่งซื้อที่สามลาน",3,40);
  assert.equal(f.wire.at(-1).command,"get_city_markets");
  f.submit("เปิดใบสั่งซื้อที่สามลาน",2,40);
  const bid=f.wire.at(-1).payload;
  assert.deepEqual(bid,{requestId:bid.requestId,action:"neutral_return_open",epoch:0,amount:2,unitPrice:40});
  f.ctx.cityReceiveResult({...bid,held:80});
  f.submit("ยืนยันขายแร่",2);
  const sell=f.wire.at(-1).payload;
  assert.deepEqual(sell,{requestId:sell.requestId,action:"neutral_return_sell",epoch:0,amount:2,total:85});
  f.ctx.cityReceiveResult({...sell,total:85});
  f.ctx.cityReceiveMarkets({...state,atMarket:null,neutralReturnMarket:{...reverse,epoch:null,enabled:false,prices:[],
    orders:[{id:"old-order",state:"cancelled",unitPrice:40,pending:2,remaining:1,held:0}]}});
  assert.equal(f.button("เปิดใบสั่งซื้อที่สามลาน"),undefined);
  assert.equal(f.button("ยกเลิกใบสั่งซื้อ"),undefined);
  f.submit("รับแร่จากใบสั่งซื้อ",2);
  assert.equal(f.wire.at(-1).payload.action,"neutral_return_sell");
  f.submit("รับแร่จากใบสั่งซื้อ",1);
  const claim=f.wire.at(-1).payload;
  assert.deepEqual(claim,{requestId:claim.requestId,action:"neutral_return_claim",orderId:"old-order",amount:1});
});

test("warehouse and factory NPC entry points focus their own sections when city state arrives", () => {
  const f=fixture();
  f.ctx.openCityProduction("warehouse");
  f.state();
  assert.equal(f.$("cityWarehouseSection").scrolled,true);
  assert.equal(f.$("cityFactorySection").scrolled,undefined);
  f.ctx.openCityProduction("factory");
  assert.equal(f.$("cityFactorySection").scrolled,true);
  f.state();
  assert.equal(f.$("cityFactorySection").scrolled,undefined);
  assert.equal(f.nodes.cityBack.textContent,"← กิลด์");
});

test("a selected city's production page waits for matching data and keeps the same return action", () => {
  const f=fixture({marketSupported:true}), moon="moon_pass", river="sam_lan_estuary";
  let returned=0;
  f.ctx.activeMapId=moon;
  f.state({site:river,miningSite:moon,cityName:"เวียงปากน้ำสามลาน"});
  f.ctx.openCityProduction("warehouse",{site:moon,back:()=>returned++});
  assert.equal(f.nodes.cityBack.textContent,"← ข้อมูลเมือง");
  assert.equal(f.$("cityWarehouseSection"),undefined);
  assert.equal(f.nodes.cityProductionContent.children[0].textContent,"กำลังโหลดข้อมูลเมือง…");
  f.state({site:moon,miningSite:moon,cityName:"ด่านผนึกจันทรา"});
  assert.equal(f.$("cityWarehouseSection").children[0].textContent,"ด่านผนึกจันทรา");
  assert.equal(f.$("cityWarehouseSection").scrolled,true);
  f.button("ตลาดประจำเมือง").onclick();
  assert.equal(f.ctx.drawerActive,"cityMarket");
  assert.equal(f.nodes.cityProductionContent.dataset.site,moon);
  f.nodes.cityBack.onclick();
  assert.equal(returned,1);
  f.ctx.activeMapId=river;
  f.ctx.openCityProduction("factory",{site:moon,back:()=>returned++});
  assert.equal(f.$("cityFactorySection"),undefined);
  assert(f.button("ดูเส้นทาง"));
  f.nodes.cityBack.onclick();
  assert.equal(returned,2);
});

test("a guild market shortcut puts the selected market first and retains both back paths", () => {
  const f=fixture({marketSupported:true}), moon="moon_pass", river="sam_lan_estuary";
  let returned=0, route;
  f.ctx.openStrategicMap=(site,back)=>{route={site,back};};
  f.ctx.openCityMarket({site:moon,back:()=>returned++});
  f.ctx.cityReceiveMarkets({serverNow:1_000_000,history:[],markets:[
    {site:river,epoch:1,status:"open",prices:[12]},
    {site:moon,epoch:2,status:"open",prices:[15]},
  ]});
  const sections=f.nodes.cityProductionContent.children.filter(el=>el.tag==="section");
  assert.match(sections[0].children[0].textContent,/^ด่านผนึกจันทรา/);
  assert.match(sections[1].children[0].textContent,/^เวียงปากน้ำสามลาน/);
  f.button("ดูเส้นทาง").onclick();
  assert.equal(route.site,moon);
  route.back();
  assert.equal(f.nodes.cityProductionContent.dataset.site,moon);
  f.nodes.cityBack.onclick();
  assert.equal(returned,1);
  f.ctx.openCityMarket();
  assert.equal(f.nodes.cityBack.textContent,"← ตลาดโลก");
  assert.equal(f.nodes.cityProductionContent.dataset.site,undefined);
});

test("the Sam Lan guild shortcut presents intercity work while the main board retains Moon Pass missions", () => {
  const f=fixture({missionSupported:true});
  const snapshot={serverNow:1_000_000,missions:[{name:"กิลด์จันทรา",progress:null,reward:10,slots:1,remaining:1,canAccept:true}],
    item:metal,required:5,enabled:true};
  f.ctx.openCityMission({site:"sam_lan_estuary",back(){}});
  f.ctx.cityReceiveMission(snapshot);
  assert.equal(f.ctx.drawerTitle,"งานระหว่างเมือง");
  assert.equal(f.$("cityMissionOpen").children[1].textContent,"ยังไม่มีงานระหว่างเมืองที่เปิดให้ตัวละครนี้");
  f.ctx.openCityMission();
  f.ctx.cityReceiveMission(snapshot);
  assert.match(f.$("cityMissionOpen").querySelector("h4").textContent,/งานเก็บแร่ · กิลด์จันทรา/);
  assert.equal(f.nodes.cityBack.textContent,"← ตลาดโลก");
});

test("a delivery route returns through the selected city's mission board", () => {
  const f=fixture({missionSupported:true}), river="sam_lan_estuary", moon="moon_pass";
  let route,returned=0;
  f.ctx.openStrategicMap=(site,back)=>{route={site,back};};
  f.ctx.openCityMission({site:river,back:()=>returned++});
  f.ctx.cityReceiveMission({serverNow:1_000_000,missions:[],hauls:{enabled:true,atCity:river,
    jobs:[{id:"haul",source:river,destination:moon,name:"สามลาน",item:metal,amount:4,reward:15,
      state:"carrying",carrying:true,audience:"guild",expires:2_000_000}]}});
  f.button("ดูเส้นทางส่งเสบียง").onclick();
  assert.equal(route.site,moon);
  route.back();
  assert.equal(f.ctx.drawerTitle,"งานระหว่างเมือง");
  f.nodes.cityBack.onclick();
  assert.equal(returned,1);
});

test("service NPCs dispatch to city panels and keep war actions on the war board", () => {
  const code=readFileSync(join(__dirname,"../../src/client/ui/057-npcs-and-objectives.js"),"utf8");
  const visual=readFileSync(join(__dirname,"../../src/client/world/015-forest-gates-and-services.js"),"utf8");
  const calls=[],body=node(),buttons={};
  const ctx={
    $:id=>buttons[id] ||= node(),
    ui:{drawerBody:body},document:{createElement:node},bindSpeechButton(){},
    openDrawer(){body.replaceChildren();},ownServerCharacter:()=>null,
    activeMapId:"moon_pass",citySiteNames:{moon_pass:"จันทรา"},
    room:{state:{cityMarketSupported:true,cityPurchaseSupported:true}},
    territoryState:{local:{site:"moon_pass"}},
  };
  for(const handler of ["openSmith","openEconomy","openGuild","openParty","openMap","openStrategicMap","openHelp",
    "openWarPanel","openCityProduction","openCityMission","openCityGovernance","openCityMarket","openCityPurchase"]){
    ctx[handler]=(...args)=>calls.push([handler,...args]);
  }
  vm.runInNewContext(visual.slice(visual.indexOf("  const serviceNpcUi="),visual.indexOf("  const serviceNpcLooks="))+
    code.slice(code.indexOf("  function openServiceNpc("),code.indexOf("  function syncQuestRanger(")),ctx);
  for(const [role,expected] of [
    ["war",["openWarPanel"]],["cityWarehouse",["openCityProduction","warehouse"]],
    ["cityFactory",["openCityProduction","factory"]],["cityMissions",["openCityMission"]],
    ["cityHall",["openCityGovernance"]],["market",["openCityMarket"]],
  ]){
    ctx.openServiceNpc({role,name:role});
    assert.ok(buttons.serviceNpcAction.textContent);
    buttons.serviceNpcAction.onclick();
    assert.deepEqual(calls.at(-1),expected);
  }
  body.children.find(button=>button.textContent==="เปิดตลาดโลก").onclick();
  assert.deepEqual(calls.at(-1),["openEconomy"]);
  body.children.find(button=>button.textContent==="เปิดใบสั่งซื้อกิลด์").onclick();
  assert.deepEqual(calls.at(-1),["openCityPurchase"]);
  ctx.activeMapId="other_map";
  ctx.openServiceNpc({role:"market",name:"นายหน้าตลาด"});
  buttons.serviceNpcAction.onclick();
  assert.deepEqual(calls.at(-1),["openEconomy"]);
  assert.equal(body.children.length,0);
});

test("city hall shows reserved gold and only enables an on-site commander after the cooldown", () => {
  const f=fixture({governanceAvailable:true});
  f.state({site:"moon_pass",miningSite:"moon_pass"});
  f.button("ศาลาว่าการเมือง").onclick();
  assert.equal(f.wire.at(-1).command,"get_city_governance");
  const state={serverNow:1_000_000,epoch:2,nextAt:0,atMoon:true,commander:false,stock:[],history:[],used:7,capacity:60,
    treasury:{available:30,held:40,missionHeld:20,purchaseHeld:20,rushHeld:0,earned:100,paid:30}};
  f.ctx.cityReceiveGovernance(state);
  assert.equal(f.button("เน้นผลิต"),undefined);
  assert.equal(f.$("cityHallAvailable").textContent,"30");
  assert.equal(f.$("cityHallHeld").textContent,"40");
  assert.equal(f.$("cityHallCapacity").textContent,"7 / 60");
  const ledger=f.$("cityHallLedger");
  assert.match(ledger.children[1].textContent,/กันใบสั่งซื้อ 20 · ค่าจ้างภารกิจ 20/);
  ledger.open=true;
  f.ctx.cityReceiveGovernance({...state,commander:true,nextAt:2_000_000});
  assert.equal(f.$("cityHallLedger").open,true);
  assert.equal(f.$("cityHallStorage").open,false);
  assert.equal(f.button("เน้นผลิต").disabled,true);
  f.ctx.cityReceiveGovernance({...state,commander:true,atMoon:false});
  assert.equal(f.button("เน้นผลิต").disabled,true);
  f.ctx.cityReceiveGovernance({...state,commander:true});
  f.button("เน้นผลิต").onclick();
  const request=f.wire.at(-1).payload;
  assert.deepEqual(request,{requestId:request.requestId,action:"policy_set",epoch:2,policy:"industry"});
});
