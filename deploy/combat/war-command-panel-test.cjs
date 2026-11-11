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
  const nodes = {}, sent = [];
  function option(textContent, value) { return {textContent, value}; }
  const context = {
    activeMapId: "moon_pass",
    worldDefinitions: {
      moon_pass: {name: "ด่านผนึกจันทรา"},
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
  return {context, nodes, sent, update};
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
