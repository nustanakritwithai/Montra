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
    setAttribute() {},
  };
}

function fixture({enabled = true, recovery = true, member = true, workshopSupported = false,
  purchaseSupported = false, missionSupported = false, governanceAvailable = false, marketSupported = false} = {}) {
  const nodes = {}, wire = [], timers = new Map();
  let serial = 0, now = 100;
  const walk = el => [el, ...el.children.flatMap(walk)];
  const $ = id => nodes[id] || (nodes.cityProductionContent && walk(nodes.cityProductionContent).find(el => el.id === id));
  const ctx = {
    $, document: {createElement: node}, performance: {now: () => now},
    room: {state: {cityProductionAvailable: enabled, cityRecoveryAvailable: recovery,
      cityWorkshopSupported: workshopSupported, cityPurchaseSupported: purchaseSupported, cityMissionSupported: missionSupported,
      cityGovernanceAvailable: governanceAvailable, cityMarketSupported: marketSupported},
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

test("the mission board distinguishes accepting, gathering and handing in a public job", () => {
  const f=fixture({member:false,missionSupported:true}), item="mat_raw_stone_2";
  f.ctx.openCityMission();
  assert.equal(f.wire.at(-1).command,"get_city_missions");
  const mission={id:"work",name:"กิลด์จันทรา",audience:"public",slots:1,remaining:1,reward:15,expiresAt:2_000_000,
    canAccept:true,progress:null};
  const board={enabled:true,required:3,item,serverNow:1_000_000};
  f.ctx.cityReceiveMission({...board,missions:[mission]});
  f.button("รับงาน").onclick();
  const accepted=f.wire.at(-1).payload;
  assert.equal(accepted.action,"mission_accept");
  f.ctx.cityReceiveResult(accepted);
  f.ctx.inventoryState.slots.push({itemId:item,quantity:3});
  f.ctx.cityReceiveMission({...board,missions:[{...mission,progress:2}]});
  assert.equal(f.button("ส่งงานและรับทอง").disabled,true);
  f.ctx.cityReceiveMission({...board,siege:true,missions:[{...mission,progress:3}]});
  assert.equal(f.button("ส่งงานและรับทอง").disabled,true);
  f.ctx.cityReceiveMission({...board,missions:[{...mission,progress:3}]});
  f.button("ส่งงานและรับทอง").onclick();
  const submitted=f.wire.at(-1).payload;
  assert.deepEqual(submitted,{requestId:submitted.requestId,action:"mission_submit",missionId:"work"});
});

test("the mission board can post guild-only warehouse work when regular stock is full", () => {
  const f=fixture({missionSupported:true});
  f.ctx.openCityMission();
  const board={enabled:true,warehouseMissions:true,required:3,item:"mat_raw_stone_2",serverNow:1_000_000,
    maxSlots:4,maxReward:100,hours:[1],atMoon:true,missions:[],
    manage:{epoch:2,canPost:true,gold:30,free:0,warehouseFree:6}};
  f.ctx.cityReceiveMission(board);
  const audience=f.nodes.cityProductionContent.children.find(el=>el.tag==="label" && el.textContent==="ผู้รับงาน").children[0];
  assert.equal(audience.value,"guild");
  assert.equal(audience.disabled,true);
  f.submit("เปิดภารกิจ",3,5);
  assert.equal(f.wire.at(-1).command,"get_city_missions");
  f.submit("เปิดภารกิจ",2,5);
  const order=f.wire.at(-1).payload;
  assert.deepEqual(order,{requestId:order.requestId,action:"mission_open",epoch:2,
    audience:"guild",slots:2,reward:5,hours:1,purpose:"warehouse"});
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

test("city hall shows reserved gold and only enables an on-site commander after the cooldown", () => {
  const f=fixture({governanceAvailable:true});
  f.state({site:"moon_pass",miningSite:"moon_pass"});
  f.button("ศาลาว่าการเมือง").onclick();
  assert.equal(f.wire.at(-1).command,"get_city_governance");
  const state={serverNow:1_000_000,epoch:2,nextAt:0,atMoon:true,commander:false,stock:[],history:[],used:7,capacity:60,
    treasury:{available:30,held:40,missionHeld:20,purchaseHeld:20,rushHeld:0,earned:100,paid:30}};
  f.ctx.cityReceiveGovernance(state);
  assert.equal(f.button("เน้นผลิต"),undefined);
  const ledger=f.nodes.cityProductionContent.children.find(group=>group.children[0].textContent==="ทองตลาดรวมของกิลด์");
  assert.match(ledger.children[1].textContent,/พร้อมใช้ 30 ทอง · กันไว้ 40 ทอง/);
  f.ctx.cityReceiveGovernance({...state,commander:true,nextAt:2_000_000});
  assert.equal(f.button("เน้นผลิต").disabled,true);
  f.ctx.cityReceiveGovernance({...state,commander:true,atMoon:false});
  assert.equal(f.button("เน้นผลิต").disabled,true);
  f.ctx.cityReceiveGovernance({...state,commander:true});
  f.button("เน้นผลิต").onclick();
  const request=f.wire.at(-1).payload;
  assert.deepEqual(request,{requestId:request.requestId,action:"policy_set",epoch:2,policy:"industry"});
});
