/** Level-one class/advanced skill entry against shipped UI, real DOM and CSS.
 * Synthetic server catalogs/snapshots, captured sends, no account or backend. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { fixture: coreFixture } = require('./class-skills-hotbar-browser-test.cjs');
const serverData = require('./class-skills-advanced-fixture.cjs');
const root = path.resolve(__dirname, '../..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const classes = Object.keys(serverData.catalogs);
const kindFor = { phutthaisawan: 'sword', muay_boran: 'muay', blade: 'blade', sentinel: 'sentinel', seer: 'occult', mender: 'occult' };
function between(source, start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a);
  assert(a >= 0 && b > a, 'Missing production boundary: ' + start);
  return source.slice(a, b);
}
function fixture() {
  const base = coreFixture(), journey = read('src/client/ui/041-character-hud-and-journey.js');
  const objectives = read('src/client/ui/057-npcs-and-objectives.js');
  const tick = read('src/client/ui/042-vitals-chat-and-status.js').split('\n').find(line => line.includes('if(drawerActive==="fieldSkills"'));
  assert(tick, 'production advanced drawer refresh');
  const script = base.script + `
const advancedData=${JSON.stringify(serverData)};
let journeyOwner='',journeyNotes={},inventoryState=null,territoryState=null,forestObjectiveState=null;
const economyReady=()=>{throw new Error('Skill entry must not require economy readiness');};
const renderItemPreview=()=>{},createItemTile=()=>document.createElement('span'),itemHuntGuide=()=>null;
const fieldGearGoal=()=>({title:'Fixture quest',step:'Fixture progress',progress:'0/1'});
ui.quest=document.createElement('button');ui.quest.id='fixtureQuest';ui.quest.textContent='Quest';$('game').prepend(ui.quest);
${between(journey, '  function currentFieldTraining(', '  function refreshFieldPractice(')}
${between(journey, '  function openFieldTraining(', '  function fieldGearGoal(')}
${between(objectives, '  function openCurrentQuest(', '  ui.quest.addEventListener("click"')}
function advancedTick(){syncClassSkillBookContext();${tick}}
function fullSnapshot(path,level=1){
  const me=fixture.snapshot(path);Object.assign(me,{level,characterId:'fixture-'+path,mana:300,muayData:'{}'});
  const book=structuredClone(advancedData.books[path]);
  room.state.swordTreeCatalog=JSON.stringify(advancedData.catalogs.phutthaisawan);
  room.state.muayBookCatalog=JSON.stringify(advancedData.catalogs.muay_boran);
  if(path==='phutthaisawan')me.swordTreeData=JSON.stringify(book);
  else if(path==='muay_boran')me.muayBookData=JSON.stringify(book);
  else {
    const data={...structuredClone(advancedData.catalogs[path]),path,book,points:advancedData.points[path][level]};
    if(path==='blade')bladeBookState=data;else if(path==='sentinel')sentinelBookState=data;else occultBookState=data;
  }
  gearGuides=null;inventoryState=null;skillGraphKey='';delete skillGraphSel[fieldSkillKind()];
  fixture.syncHotbars();advancedTick();wire.length=0;notices.length=0;
}
function currentBook(){const me=ownServerCharacter();return me.pathId==='phutthaisawan'?JSON.parse(me.swordTreeData):me.pathId==='muay_boran'?JSON.parse(me.muayBookData):me.pathId==='blade'?bladeBookState?.book:me.pathId==='sentinel'?sentinelBookState?.book:occultBookState?.book;}
function updateBook(book){const me=ownServerCharacter();if(me.pathId==='phutthaisawan')me.swordTreeData=JSON.stringify(book);else if(me.pathId==='muay_boran')me.muayBookData=JSON.stringify(book);else (me.pathId==='blade'?bladeBookState:me.pathId==='sentinel'?sentinelBookState:occultBookState).book=book;advancedTick();}
Object.assign(fixture,{
 fullSnapshot,openAdvanced:openFieldDeepTraining,openQuest:()=>openCurrentQuest(true),tick:advancedTick,close:closeDrawer,
 advancedModel:()=>skillGraphModel(fieldSkillKind()),book:()=>structuredClone(currentBook()),
 select(id){skillGraphSel[fieldSkillKind()]=id;skillGraphKey='';advancedTick();},
 learnSnapshot(id,rank=0){const path=ownServerCharacter().pathId,book=currentBook();if(path==='seer'||path==='mender'){book.learned[path].push(id);book.loadouts[path][0]=id;book.training[path]=999;}else{book.learned.push(id);if(book.slots)book.slots[0]=id;else book.loadouts[book.school][0]=id;if(book.practice)Object.keys(book.practice).forEach(k=>book.practice[k]=999);if(book.training)Object.keys(book.training).forEach(k=>book.training[k]=999);}if(rank)book.ranks={[id]:rank};else delete book.ranks;updateBook(book);fixture.syncHotbars();},
 missingSnapshot(){const path=ownServerCharacter().pathId;if(path==='blade')bladeBookState=null;else if(path==='sentinel')sentinelBookState=null;else if(path==='seer'||path==='mender')occultBookState=null;else ownServerCharacter()[path==='phutthaisawan'?'swordTreeData':'muayBookData']='';skillGraphKey='';},
 setGuide(value){gearGuides=value;},setLevel(level){ownServerCharacter().level=level;advancedTick();}
});
fullSnapshot('phutthaisawan',1);
`;
  return { html: base.html, script };
}
async function fit(page, selector) {
  const info = await page.locator(selector).evaluate(el => {
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const r = el.getBoundingClientRect();
    return { left: r.left, right: r.right, width: r.width, height: r.height, viewport: innerWidth, overflow: document.documentElement.scrollWidth > innerWidth };
  });
  assert(!info.overflow, selector + ' does not overflow page');
  assert(info.left >= 0 && info.right <= info.viewport + 1, selector + ' stays inside viewport');
  assert(info.width >= 44 && info.height >= 40, selector + ' readable touch target');
}
async function expectGraph(page, className, level) {
  await page.locator('#fieldSkillGraph .sg-wrap').waitFor();
  const model = await page.evaluate(() => fixture.advancedModel());
  const catalog = serverData.catalogs[className];
  const ids = Object.keys(catalog.nodes || catalog.lessons).filter(id => !catalog.lessons?.[id]?.path || catalog.lessons[id].path === className);
  assert.deepEqual(model.nodes.map(n => n.id).sort(), ids.sort(), className + ' own complete advanced catalog');
  const rendered = await page.locator('#fieldSkillGraph [data-sg-node]').evaluateAll(nodes => nodes.map(n => n.dataset.sgNode));
  assert.deepEqual(rendered.sort(), ids.sort(), className + ' all future skills visible from Lv.' + level);
  assert(!/NaN|undefined/.test(await page.locator('#fieldSkillGraph').textContent()), 'complete graph copy');
  await fit(page, '#fieldCoreBook');
  const coreIds = Object.keys(catalog.core);
  assert.deepEqual((await page.locator('[data-sg-core]').evaluateAll(nodes=>nodes.map(n=>n.dataset.sgCore))).sort(),coreIds.sort(),'only own class core anchors');
  const roots = model.nodes.filter(n=>!n.requires.some(id=>ids.includes(id))).map(n=>n.id);
  assert.deepEqual((await page.locator('[data-sg-group-edge]').evaluateAll(nodes=>nodes.map(n=>n.dataset.sgGroupEdge))).sort(),roots.sort(),'grouping edge connects every advanced root');
  const prerequisites = model.nodes.flatMap(n=>n.requires.filter(id=>ids.includes(id)).map(id=>id+':'+n.id));
  assert.deepEqual((await page.locator('[data-sg-prereq]').evaluateAll(nodes=>nodes.map(n=>n.dataset.sgPrereq))).sort(),prerequisites.sort(),'solid edges match real server prerequisites only');
  assert.match(await page.locator('.sg-tree-key').textContent(),/ไม่ใช่เงื่อนไข/);
  for(const id of coreIds)await fit(page,'[data-sg-core="'+id+'"]');
  const corePoints=catalog.corePointLevels.filter(required=>level>=required).length;
  assert.match(await page.locator('.sg-core-heading').textContent(),new RegExp('แต้มแกน '+corePoints+' / '+corePoints));
  assert.equal(await page.locator('#classAdvancedBook').count(), 0, 'no recursive advanced entry');
  await page.locator('[data-sg-core]').first().click();
  assert.equal(await page.locator('#skillDetailModal').isVisible(),true,'core anchor opens existing detail modal');
  await page.locator('#skillModalCloseBtn').click();
  assert.equal(await page.locator('#fieldSkillGraph').isVisible(),true,'core modal close leaves combined tree open');
  return model;
}
async function selectNode(page, id) {
  // Use a real node click after scrolling both the drawer and graph viewport.
  const node = page.locator('[data-sg-node="' + id + '"]');
  await node.scrollIntoViewIfNeeded();
  await node.click();
  await page.locator('#fieldSkillGraph .sg-detail:not(.empty)').waitFor();
}
async function cases(page, check) {
  for (const className of classes) for (const level of [1, 10, 25, 26]) {
    await page.evaluate(({className,level}) => { fixture.close();fixture.fullSnapshot(className,level); }, {className,level});
    await page.locator('#quickSkills').click();
    await fit(page, '#classAdvancedBook');
    assert.equal(await page.locator('#drawerBody .kg-node').count(), 4, 'core book unchanged');
    await page.locator('#classAdvancedBook').click();
    const model = await expectGraph(page, className, level);
    assert.equal(model.points, serverData.points[className][level], 'actual initial server point pool');
    assert.equal(await page.locator('#fieldSkillGraph .sg-points b').textContent(), String(model.points));
    assert.match(await page.locator('#fieldSkillGraph .sg-sum').textContent(), new RegExp('ใช้ไป 0 / ' + model.points + ' แต้ม'));
    if(level===1){
      await page.locator('#drawer').evaluate(el=>{el.scrollTop=0;});
      await page.locator('#fieldSkillGraph .sg-view').evaluate(el=>{el.scrollTop=0;el.scrollLeft=0;});
      await check(className+'-connected-tree-lv1',true);
    }
    const blocked = model.nodes.find(n => n.level > level);
    assert(blocked, className + ' contains a later locked lesson');
    await selectNode(page, blocked.id);
    const learn = page.locator('[data-sg-learn="' + blocked.id + '"]');
    assert.equal(await learn.isDisabled(), true, 'future lesson remains blocked');
    const before = await page.evaluate(() => ({wire:fixture.wire.length,book:fixture.book()}));
    await learn.evaluate(el => el.click());
    assert.deepEqual(await page.evaluate(() => ({wire:fixture.wire.length,book:fixture.book()})), before, 'blocked click cannot spend or send');
    assert.match(await page.locator('.sg-detail .sg-checks').textContent(), new RegExp('เลเวล ' + blocked.level));
    await check(className + '-lv' + level, level === 1);
    await page.locator('#fieldCoreBook').click();
    assert.equal(await page.locator('#drawerBody .kg-node').count(), 4, 'Back returns to current core book');
    await page.locator('#classAdvancedBook').click();
    await expectGraph(page, className, level);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#drawer').isVisible(), false, 'Escape closes advanced book');
    assert.equal(await page.locator('#quickSkills').evaluate(el=>el===document.activeElement), true, 'original opener focus restored');
  }
  for (const className of classes) {
    // No inventory, economy data, or journey response is present in this route.
    await page.evaluate(path=>{fixture.fullSnapshot(path,1);fixture.openAdvanced();},className);
    await expectGraph(page,className,1);
    await page.locator('#drawerClose').click();
    // Existing quest drawer shows its secondary entry even at level one.
    await page.evaluate(()=>fixture.openQuest());
    assert.equal(await page.locator('#fieldDeepBook').isVisible(),true,'quest advanced entry at level one');
    await page.locator('#fieldDeepBook').click();
    await expectGraph(page,className,1);
    await page.locator('#drawerClose').click();
    // Open before the book arrives; a later server refresh must populate it.
    await page.evaluate(()=>{fixture.missingSnapshot();fixture.openAdvanced();});
    assert.equal(await page.locator('#fieldSkillGraph .sg-wrap').count(),0);
    assert.match(await page.locator('#fieldSkillGraph').textContent(),/กำลังอ่าน/);
    assert.equal(await page.locator('[data-sg-learn]').count(),0);
    await page.evaluate(path=>new Promise(resolve=>setTimeout(()=>{fixture.fullSnapshot(path,1);resolve();},30)),className);
    await expectGraph(page,className,1);
    await check(className+'-direct-quest-delayed');
    // Close while loading. A delayed snapshot cannot reopen or replace navigation.
    await page.locator('#drawerClose').click();
    await page.evaluate(()=>{fixture.missingSnapshot();fixture.openAdvanced();fixture.navigate();});
    await page.evaluate(path=>fixture.fullSnapshot(path,1),className);
    assert.equal(await page.locator('#fixtureOtherPanel').isVisible(),true);
    assert.equal(await page.locator('#fieldSkillGraph').count(),0);
    await page.locator('#drawerClose').click();
  }
  for (const className of classes) {
    await page.evaluate(path=>{fixture.fullSnapshot(path,1);fixture.openAdvanced();},className);
    const model=await page.evaluate(()=>fixture.advancedModel());
    const ready=model.nodes.find(n=>n.checks.every(c=>c.ok));assert(ready,'starter lesson is learnable');
    await selectNode(page,ready.id);
    const before=await page.evaluate(()=>fixture.book());
    await page.locator('[data-sg-learn="'+ready.id+'"]').click();
    const command=kindFor[className]==='sword'?{command:'sword_tree_learn',payload:{skillId:ready.id}}:{command:kindFor[className]+'_book',payload:{action:'learn',skillId:ready.id}};
    assert.deepEqual(await page.evaluate(()=>fixture.wire.at(-1)),command,'learn uses existing server command');
    assert.deepEqual(await page.evaluate(()=>fixture.book()),before,'no optimistic learn or point spend');
    await page.evaluate(id=>fixture.learnSnapshot(id),ready.id);
    assert.equal(await page.locator('.sg-points b').textContent(),'0','snapshot spends one server point');
    assert.match(await page.locator('.sg-sum').textContent(),/ใช้ไป 1 \/ 1 แต้ม/);
    assert.equal(await page.locator('[data-sg-equip]').count(),4 === model.slotCount ? 4 : 3,'existing advanced training slots preserved');
    assert.match(await page.locator('.sg-slots').textContent(),/ช่องวิชาเสริมสำหรับฝึก/);
    const beforeEquip=await page.evaluate(()=>fixture.book());
    const hotbarBefore=await page.locator('.learned-bar').innerHTML();
    await page.locator('[data-sg-equip="1"]').click();
    const equipCommand=kindFor[className]==='sword'?{command:'sword_tree_equip',payload:{skillId:ready.id,slot:1}}:{command:kindFor[className]+'_book',payload:{action:'equip',skillId:ready.id,slot:1}};
    assert.deepEqual(await page.evaluate(()=>fixture.wire.at(-1)),equipCommand,'existing training-slot command preserved');
    assert.deepEqual(await page.evaluate(()=>fixture.book()),beforeEquip,'equip still awaits server snapshot');
    await page.evaluate(()=>fixture.syncHotbars());
    assert.equal(await page.locator('.learned-bar').innerHTML(),hotbarBefore,'advanced training equip leaves main core hotbar unchanged');
    assert.deepEqual(await page.locator('.sword-hotbar:not([hidden]) [data-skill-id]').evaluateAll(nodes=>nodes.map(n=>n.dataset.skillId)),Object.keys(serverData.catalogs[className].core),'main hotbar still uses own four core skills');
    const unlearned=await page.evaluate(()=>fixture.advancedModel().nodes.find(n=>!n.learned).id);
    await selectNode(page,unlearned);
    assert.equal(await page.locator('[data-sg-learn]').isDisabled(),true,'empty point pool stays blocked');
    assert.match(await page.locator('[data-sg-learn]').textContent(),/แต้มไม่พอ/);
    await check(className+'-server-learn-and-spent-points');
    await page.locator('#drawerClose').click();
    // Retain the real detached node to exercise a stale event after class switch.
    await page.evaluate(path=>{fixture.fullSnapshot(path,1);fixture.openAdvanced();},className);
    await selectNode(page,ready.id);
    await page.evaluate(()=>{window.staleLearn=document.querySelector('[data-sg-learn]');});
    const next=classes[(classes.indexOf(className)+1)%classes.length];
    await page.evaluate(path=>fixture.fullSnapshot(path,1),next);
    assert.equal(await page.locator('#drawer').isVisible(),false,'class change closes advanced drawer');
    await page.evaluate(()=>window.staleLearn.click());
    assert.equal(await page.evaluate(()=>fixture.wire.length),0,'old class cannot learn after switch');
    await page.locator('#quickSkills').click();await page.locator('#classAdvancedBook').click();
    await expectGraph(page,next,1);
    await page.locator('#drawerClose').click();
    await check(className+'-class-switch-stale-event');
  }
}
async function main() {
  const { chromium } = require('playwright');
  const assets=fixture(), out=process.env.CLASS_SKILLS_ENTRY_EVIDENCE||path.join(root,'class-skills-browser-evidence','level-one');
  fs.mkdirSync(out,{recursive:true});
  const report={revision:process.env.GITHUB_SHA||'local checkout',node:process.version,cases:[],errors:[],blocked:[],limits:'Production-source isolated real DOM and CSS with actual server catalog literals and synthetic book snapshots. No account, live backend, or full-game playtest. Mobile is Chromium emulation.'};
  const server=http.createServer((req,res)=>{
    res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src data:; connect-src 'none'");
    res.setHeader('content-type',req.url==='/fixture.js'?'text/javascript; charset=utf-8':req.url==='/styles.css'?'text/css; charset=utf-8':'text/html; charset=utf-8');
    res.end(req.url==='/fixture.js'?assets.script:req.url==='/styles.css'?read('styles.css'):assets.html);
  });
  let browser;
  try {
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
    browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
    for(const [width,height] of [[1366,900],[390,844],[320,640]]) {
      const context=await browser.newContext({viewport:{width,height},isMobile:width<500,hasTouch:width<500,reducedMotion:'reduce',serviceWorkers:'block'});
      await context.route('**/*',route=>{if(new URL(route.request().url()).origin===origin)return route.continue();report.blocked.push(route.request().url());return route.abort();});
      const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));page.setDefaultTimeout(8000);
      try {
        await page.goto(origin);assert.deepEqual(report.errors,[]);
        await cases(page,async(name,screenshot=false)=>{assert.deepEqual(report.errors,[]);report.cases.push({name,width});if(screenshot)await page.screenshot({animations:'disabled',path:path.join(out,width+'-'+name+'.png')});});
      } catch(error) { await page.screenshot({path:path.join(out,width+'-failure.png')}).catch(()=>{});throw error; }
      finally { await context.close(); }
    }
    assert.deepEqual(report.errors,[]);assert.deepEqual(report.blocked,[]);
    console.log('PASS level-one skill entry browser: '+report.cases.length+' checks');
  } catch(error) {report.failure=error.stack;throw error;}
  finally {fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={fixture,cases};
