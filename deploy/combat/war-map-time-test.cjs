const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const atlas = readFileSync('src/client/ui/047-maps-and-strategy.js', 'utf8');
const journey = readFileSync('src/client/ui/041-character-hud-and-journey.js', 'utf8');
const slice = (source, start, end) => {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from);
  return source.slice(from, to);
};

test('the war board formats the selected fort timer from server time', () => {
  const nodes = {
    warTerritories: {hidden: false}, warTerritorySite: {value: 'moon_pass'},
    warTerritoryStatus: {}, warTerritoryOwner: {}, warTerritoryRoute: {},
  };
  const context = vm.createContext({
    $: id => nodes[id], activeMapId: 'camp', territoryReceivedAt: 1000, performance: {now: () => 2500},
    territoryState: {serverNow: 10000, owners: {moon_pass: 'กิลด์จันทรา'}, warTimes: {moon_pass: {phase: 'protected', phaseEndsAt: 18000}}},
    warLocalDate: () => '04:00', warPhase: () => 'จบศึกแล้ว',
  });
  vm.runInContext(slice(atlas, '  function warTerritoryLabel(', '  function renderWarSchedule('), context);
  const label = context.warTerritoryLabel;
  assert.equal(label(null, 1000), 'รอข้อมูล');
  assert.equal(label({phase: 'open'}, 1000), 'พร้อมเปิดศึก');
  assert.equal(label({phase: 'battle', phaseEndsAt: 301000}, 1000), 'รบ 5:00');
  assert.equal(label({phase: 'protected', phaseEndsAt: 28801000}, 1000), 'คุ้มครอง 8:00:00');
  assert.equal(label({phase: 'protected', phaseEndsAt: 1000}, 1000), 'กำลังอัปเดต');
  context.updateWarTerritoryStatus();
  assert.match(nodes.warTerritoryStatus.textContent, /^คุ้มครอง 0:07 · เปิดตีได้ 04:00/);
  assert.equal(nodes.warTerritoryOwner.textContent, 'ผู้ครอง · กิลด์จันทรา');
  assert.equal(nodes.warTerritoryRoute.hidden, false);
  context.activeMapId = 'moon_pass';
  context.updateWarTerritoryStatus();
  assert.equal(nodes.warTerritoryRoute.hidden, true);
});

function element(tag) {
  const attributes = {}, classes = new Set();
  return {
    tag, attributes, style: {}, dataset: {}, children: [],
    classList: {add: value => classes.add(value), toggle: (value,on) => on ? classes.add(value) : classes.delete(value), contains: value => classes.has(value)},
    setAttribute: (key,value) => { attributes[key] = value; },
    append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.children = children; },
    get offsetTop() { return parseFloat(this.style.top) * 8.27; },
    get offsetLeft() { return parseFloat(this.style.left) * 4; },
    clientHeight: 320, clientWidth: 312, scrollTop: 0, scrollLeft: 0,
  };
}

function atlasFixture({boats = true, helm = false} = {}) {
  const maps = {
    ritual_village: {name: 'หมู่บ้านอาคม', portals: [{targetMapId: 'forbidden_forest',x: 10,z: 20}], waterGates: [{id: 'to_marsh', targetMapId: 'drowned_marsh', x: 30, z: 40}]},
    forbidden_forest: {name: 'ป่าต้องห้าม', portals: [{targetMapId: 'drowned_marsh', x: 50, z: 60}]},
    drowned_marsh: {name: 'บึงพราย', portals: [], waterGates: []},
  };
  const nodes = {}, sent = [], actions = [];
  let markup = '';
  const context = vm.createContext({
    $: id => nodes[id], worldDefinitions: maps, activeMapId: 'ritual_village', travelRoutes: null,
    room: {state: {boatsAvailable: boats,cityMarketSupported: true}, send: (...args) => sent.push(args)},
    boatAtHelm: () => helm, sailThroughGate: id => actions.push(id), closeDrawer: () => actions.push('close'), openMap: () => actions.push('local'),
    document: {createElement: element,createElementNS: (_namespace,tag) => element(tag)},
    openDrawer(_name,_title,html) {
      markup = html;
      for (const [,tag,id] of html.matchAll(/<([a-z]+)\b[^>]*\bid="([^"]+)"/g)) nodes[id] = element(tag);
    },
  });
  vm.runInContext(slice(atlas,'  const atlasCells =','  const warErrors=')+
    slice(journey,'  function travelRoute(','  function currentItemHunt(')+
    slice(atlas,'  function openStrategicMap(','  function openMap()'),context);
  return {context,nodes,sent,actions,get markup(){return markup;}};
}

test('atlas opens on the travel map, highlights actual land and water links, and returns to its opener', () => {
  const f = atlasFixture();
  f.context.openStrategicMap(undefined,() => f.actions.push('back'));
  assert.ok(f.markup.indexOf('id="atlasBoard"') < f.markup.indexOf('id="atlasDetail"'));
  assert.doesNotMatch(f.markup,/atlasTradeRoute|atlasCityMarket|warTerritory|data-war-site/);
  assert.deepEqual(f.sent, []);
  const [svg, origin, forest, marsh] = f.nodes.atlasBoard.children;
  assert.equal(origin.attributes['aria-current'], 'location');
  assert.equal(origin.attributes['aria-pressed'], 'true');
  assert.equal(f.nodes.atlasDetail.children[1].textContent, '● คุณอยู่ที่นี่');
  marsh.onclick();
  assert.equal(marsh.attributes['aria-pressed'], 'true');
  assert.match(f.nodes.atlasDetail.children[1].textContent, /ผ่าน 2 ประตู · ประตูแรกไป ป่าต้องห้าม/);
  assert.equal(svg.children.filter(line => line.classList.contains('route')).length, 2);
  f.nodes.atlasWater.onclick();
  assert.equal(f.nodes.atlasWater.attributes['aria-pressed'], 'true');
  assert.match(f.nodes.atlasDetail.children[1].textContent, /ผ่าน 1 ประตู · ประตูแรกไป บึงพราย/);
  const highlighted = svg.children.filter(line => line.classList.contains('route'));
  assert.equal(highlighted.length, 1);
  assert.equal(highlighted[0].attributes['data-atlas-link'], 'waterGates');
  assert.ok(!f.nodes.atlasDetail.children.some(el => el.tag === 'button'));
  forest.onclick();
  assert.match(f.nodes.atlasDetail.children[1].textContent, /ยังไม่มีเส้นทางน้ำ/);
  f.nodes.atlasRecenter.onclick();
  assert.equal(origin.attributes['aria-pressed'], 'true');
  f.nodes.backLocalMap.onclick();
  assert.deepEqual(f.actions, ['back']);
});

test('a helmsman uses the existing gate command, and older servers keep a land-only atlas', () => {
  const f = atlasFixture({helm: true});
  f.context.openStrategicMap('drowned_marsh');
  assert.equal(f.nodes.atlasBoard.dataset.travel, 'waterGates');
  f.nodes.atlasDetail.children.find(el => el.tag === 'button').onclick();
  assert.deepEqual(f.actions, ['to_marsh', 'close']);
  const old = atlasFixture({boats: false});
  old.context.openStrategicMap('drowned_marsh');
  assert.equal(old.nodes.atlasWater, undefined);
  assert.match(old.nodes.atlasDetail.children[1].textContent, /ผ่าน 2 ประตู/);
});
