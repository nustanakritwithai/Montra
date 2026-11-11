const assert = require("node:assert/strict");
const {readFileSync} = require("node:fs");
const {join} = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = readFileSync(join(__dirname, "../../src/client/ui/047-maps-and-strategy.js"), "utf8");
const start = source.indexOf("  const warPhase=");
const end = source.indexOf("  function updateAtlasOwner(", start);
assert(start >= 0 && end > start);

function fixture() {
  const nodes = {}, sent = [], openedMaps = [];
  function option(textContent, value) { return {textContent, value}; }
  const context = {
    activeMapId: "moon_pass", mode: "live",
    worldDefinitions: {
      moon_pass: {name: "ด่านผนึกจันทรา", strategic: {sites: [{kind:"fort",name:"ธงจันทรา",x:12,z:-36}]}},
      other: {name: "แผนที่ถัดไป"},
      tri_wiang_castle: {name: "ปราสาทตรีเวียง", strategic: {
        objectives: [1, 2, 3, 4, 5, 6].map(id => ({id, name: "จุด "+id})),
      }},
    },
    territoryState: {},
    Option: option,
    $: id => nodes[id],
    window: {confirm: () => true},
    room: {send(command, payload) { sent.push({command, payload: JSON.parse(JSON.stringify(payload))}); }},
    openMap(){openedMaps.push(context.activeMapId);},
    openDrawer(_name, _title, markup) {
      for (const [tag, id] of markup.matchAll(/<[a-z][a-z0-9]*\b[^<>]*\bid="([^"]+)"[^<>]*>/g)) {
        nodes[id] = {
          hidden: /\shidden(?=\s|>)/.test(tag), dataset: {}, options: [], attributes: {},
          setAttribute(key, value) { this.attributes[key] = value; },
          replaceChildren(...options) { this.options = options; this.value = options[0]?.value; },
        };
      }
    },
  };
  vm.runInNewContext(source.slice(start, end), context);
  context.openWarPanel();
  const update = local => {
    context.territoryState = {local};
    context.renderWarPanel();
  };
  return {context, nodes, sent, openedMaps, update};
}

test("war overview shows the server timer and factions and clears battle controls on map change", () => {
  const {context, nodes, sent, update} = fixture();
  update({site: "moon_pass", phase: "battle", seconds: 65, owner: "กิลด์จันทรา", attackName: "กิลด์สามลาน",
    defendName: "กิลด์จันทรา", progress: -8, goal: 60, canJoin: true});
  assert.equal(nodes.warBattle.hidden, false);
  assert.equal(nodes.warClock.textContent, "01:05");
  assert.equal(nodes.warClock.attributes["aria-label"], "1 นาที 5 วินาที");
  assert.equal(nodes.warAttackName.textContent, "กิลด์สามลาน");
  assert.equal(nodes.warGauge.dataset.side, "defend");
  assert.equal(nodes.warGauge.value, 8);
  assert.equal(nodes.warAction.hidden, false);
  nodes.warAction.onclick();
  assert.deepEqual(sent.at(-1), {command: "territory_join", payload: {}});
  update({site: "moon_pass", phase: "protected"});
  assert.equal(nodes.warBattle.hidden, true);
  assert.equal(nodes.warStatus.dataset.tone, "protected");
  assert.equal(nodes.warAction.hidden, true);
  context.activeMapId = "other";
  context.renderWarPanel();
  assert.equal(nodes.warHeading.textContent, "แผนที่ถัดไป");
  for (const id of ["warOwner", "warBattle", "warDetails", "warAction", "warCargoPanel", "estatePanel"]) {
    assert.equal(nodes[id].hidden, true, id);
  }
  assert.equal(nodes.warAtlasLink.hidden, false);
  assert.equal(nodes.warAction.onclick, null);
});

test("a war board opened from the city exposes its return action only for that entry point", () => {
  const {context, nodes} = fixture();
  assert.equal(nodes.warBack.hidden,true);
  let returned=0;
  context.openWarPanel(()=>returned++);
  assert.equal(nodes.warBack.hidden,false);
  nodes.warBack.onclick();
  assert.equal(returned,1);
});

test("castle front options follow the battle rules and preserve selection between updates", () => {
  const {context, nodes, sent, update} = fixture();
  context.activeMapId = "tri_wiang_castle";
  const battle = {site: context.activeMapId, phase: "battle", seconds: 99, canJoin: true,
    pilot: {score: {attack: 80, defend: 0}, points: []}};
  update(battle);
  assert.equal(nodes.castleFrontLabel.hidden, false);
  assert.deepEqual(nodes.castleFront.options.map(option => option.value), ["2", "4", "5"]);
  assert.equal(nodes.warAttackScore.textContent, "80 คะแนน");
  assert.equal(nodes.warDefendScore.textContent, "0 คะแนน");
  assert.equal(nodes.warCapture.hidden, true);
  nodes.castleFront.value = "5";
  update({...battle, seconds: 98});
  nodes.warAction.onclick();
  assert.deepEqual(sent.at(-1), {command: "territory_join", payload: {objectiveId: 5}});
});

test("detailed city policy keeps an unsubmitted selection and uses the newest revision", () => {
  const {nodes, sent, update} = fixture();
  const government = {revision: 2, focus: "balanced", focusCost: 10, balance: 40, available: 12,
    officer: true, commander: true, market: 1, warehouse: 1, workshop: 1,
    prices: {market: 30, warehouse: 30, workshop: 30}};
  const local = {site: "moon_pass", phase: "protected"};
  update({...local, government});
  assert.equal(nodes.estateBalance.textContent, 40);
  assert.equal(nodes.estateAvailable.textContent, 12);
  nodes.estateFocus.value = "trade";
  update({...local, government: {...government, revision: 3}});
  assert.equal(nodes.estateFocus.value, "trade");
  assert.equal(nodes.estateFocusApply.disabled, false);
  nodes.estateFocusApply.onclick();
  assert.deepEqual(sent.at(-1), {command: "territory_govern", payload: {site: "moon_pass", revision: 3, action: "focus_trade"}});
  update({...local, government: {...government, revision: 4, focus: "trade"}});
  assert.equal(nodes.estateFocusApply.disabled, true);
});

test("the war board can mark the muster point and automatically switches to the live capture flag", () => {
  const {context,nodes,update,openedMaps,sent}=fixture();
  update({site:"moon_pass",phase:"open",canStart:true});
  assert.equal(context.warObjectiveGuide({x:0,z:0}),null);
  assert.equal(nodes.warObjectiveMap.hidden,false);
  nodes.warObjectiveMap.onclick();
  assert.deepEqual(openedMaps,["moon_pass"]);
  const muster=context.warObjectiveGuide({x:0,z:0});
  assert.match(muster.title,/จุดเปิดศึก/);
  assert.equal(muster.to.x,12);
  context.territoryState.local={site:"moon_pass",phase:"battle",inField:true,side:"attack",
    civic:{flag:{x:-4,z:25,name:"ธงสนามแยก"}}};
  const flag=context.warObjectiveGuide({x:0,z:0});
  assert.equal(flag.title,"ธงสนามแยก");
  assert.equal(flag.to.z,25);
  assert.equal(flag.radius,5);
  assert.deepEqual(sent,[]);
  context.activeMapId="other";
  assert.equal(context.warObjectiveGuide({x:0,z:0}),null);
  context.activeMapId="moon_pass";
  context.territoryState.local={site:"moon_pass",phase:"protected",inField:true};
  assert.equal(context.warObjectiveGuide({x:0,z:0}),null);
});

test("river city points to supplies, the next closed ring, and then the command court", () => {
  const {context}=fixture();
  const posts=[{id:"M",name:"ตลาด",x:30,z:5},{id:"S",name:"คลัง",x:-30,z:5},{id:"F",name:"โรงช่าง",x:1,z:1}];
  const gate=id=>({id,box:{x:0,z:-6,width:8,length:2}});
  const map={strategic:{riverCity:{posts,nodes:{A:{x:0,z:176}}},rampart:{gates:[gate("G11"),gate("G12"),gate("G21")]},
    sites:[{kind:"fort",name:"ลานบัญชาการ",x:4,z:-20}]}};
  const local={phase:"open",canStart:true,side:"attack"};
  assert.equal(context.warObjectiveTarget(local,map,null,true).to.z,176);
  const river={supplied:false,posts:[],gates:{G11:{closed:false},G12:{closed:true},G21:{closed:true}}};
  Object.assign(local,{phase:"battle",inField:true,river});
  const hero={x:28,z:0};
  assert.match(context.warObjectiveTarget(local,map,hero).title,/^M /);
  river.posts=[{id:"M",owner:"attack",contested:false}];
  assert.equal(context.warObjectiveTarget(local,map,hero).title,"G21");
  river.supplied=true;
  assert.equal(context.warObjectiveTarget(local,map,hero).title,"T ลานบัญชาการ");
});

test("castle guidance distinguishes opening points, locked throne, and a supplied throne attack", () => {
  const {context}=fixture();
  const objectives=[1,2,3,4,5,6,7].map(id=>({id,name:"จุด "+id,x:id*10,z:0}));
  const map={strategic:{objectives}},hero={x:69,z:0};
  const pilot={points:objectives.filter(point=>point.id<7).map(point=>({id:point.id,owner:null})),
    throne:{defended:true,attack:{outer:2,middle:2,route:true}}};
  const local={phase:"battle",inField:true,side:"attack",seconds:2400,pilot};
  assert.equal(context.warObjectiveTarget(local,map,hero).to.id,3);
  local.seconds=901;
  assert.equal(context.warObjectiveTarget(local,map,hero).to.id,6);
  local.seconds=900;
  assert.equal(context.warObjectiveTarget(local,map,hero).to.id,7);
  pilot.throne.attack.route=false;
  assert.equal(context.warObjectiveTarget(local,map,hero).to.id,6);
  pilot.throne=null;pilot.points=pilot.points.filter(point=>[2,4,5].includes(point.id));
  assert.equal(context.warObjectiveTarget(local,map,hero).to.id,5);
});

test("tapping the battle HUD opens the local map without starting movement", () => {
  const navigation=readFileSync(join(__dirname,"../../src/client/input/039-movement-flight-and-climbing.js"),"utf8");
  const start=navigation.indexOf("  function startQuestNavigation()");
  const end=navigation.indexOf("\n  function ",start+10);
  let opened=0;
  vm.runInNewContext(navigation.slice(start,end)+"\nstartQuestNavigation();",{
    ui:{quest:{classList:{contains:()=>true}}},openMap:()=>opened++,
  });
  assert.equal(opened,1);
});
