/** Real Chromium DOM regression of shipped class-book functions, HTML and CSS.
 * Synthetic server snapshots and captured sends only; no accounts or backend. */
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const ids = {
  phutthaisawan: ['phuttha_core', 'sritra_core', 'atamat_core', 'chumphon_core'],
  muay_boran: ['chaiya', 'korat', 'lopburi', 'thasao'],
  blade: ['blade_vanish', 'blade_heavy', 'blade_withdraw', 'blade_fury'],
  sentinel: ['shock', 'bulwark', 'riposte', 'protect'],
  seer: ['seer_pot', 'seer_binding', 'seer_poison', 'seer_buffalo'],
  mender: ['mender_core_heal', 'mender_core_circle', 'mender_core_ward', 'mender_core_cleanse']
};
function between(source, start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a);
  assert(a >= 0 && b > a, `Missing source boundary: ${start}`);
  return source.slice(a, b);
}
function fixture() {
  const index = read('index.html');
  const drawer = between(index, '<section id="drawer"', '\n  </main>');
  const modal = between(index, '<div id="skillPopupBackdrop"', '<div id="equipPopupBackdrop"');
  const quick = index.match(/<button\b[^>]*id="quickSkills"[\s\S]*?<\/button>/);
  assert(quick, 'Shipped quickSkills markup');
  const bindings = read('src/client/input/058-field-control-bindings.js');
  const quickBinding = between(bindings, '$("quickSkills").onclick=', '$("mapButton").onclick=');
  const drawers = between(read('src/client/ui/046-drawers-and-chat.js'), '  function gateFieldInput', '  const journalOrigins');
  const drawerKeys = between(read('src/client/ui/046-drawers-and-chat.js'), '  document.addEventListener("keydown",event=>{', '  function updateChatBadge');
  const script = `
const $=id=>document.getElementById(id), wire=[], notices=[];
let mode='live', localId='fixture', gearGuides=null, catalogKey='', buildCatalog=null;
let drawerActive=null, drawerOpener=null, fieldTrainingTip=null, targetedSkill=null;
let bladeBookState=null, sentinelBookState=null, occultBookState=null;
let bladeBookRenderKey='', sentinelBookRenderKey='', occultBookRenderKey='';
let bladeRequestAt=-10000, sentinelRequestAt=-10000, occultRequestAt=-10000;
const ui={drawer:$('drawer'),drawerBody:$('drawerBody'),drawerTitle:$('drawerTitle'),shade:$('shade')};
const room={state:{players:new Map()},send:(command,payload)=>wire.push({command,payload})};
const ownServerCharacter=()=>room.state.players.get(localId);
const SFX=()=>{}, toast=message=>notices.push(message), cancelForgeAnimation=()=>{}, closeForgePicker=()=>{}, closeItemDetailModal=()=>{}, closeEquipPopup=()=>{};
const setTargetedSkill=value=>{targetedSkill=value;};
const handleForgePickerKey=()=>false, handleItemDetailKey=()=>false;
${drawers}
${read('src/client/ui/048-class-books-and-hotbars.js')}
${read('src/client/ui/049-skill-graph-and-details.js')}
${quickBinding}
${drawerKeys}
$('drawerClose').onclick=closeDrawer;
const classIds=${JSON.stringify(ids)};
function catalog(path){
 const core=Object.fromEntries(classIds[path].map(id=>[id,{name:id,description:'Synthetic server skill '+id,stamina:8,cooldownMs:1000}]));
 const progress=Object.fromEntries(classIds[path].map(id=>[id,{pvpDurationMs:450,pvpImmunityMs:4000,pvpFraction:.01,intervalMs:1000,scale:1,finalPower:.6,durationMs:2000,damageFactor:.5,counterPower:.8,counterIntervalMs:1000,range:3,power:1,pvpPower:.75,defense:.15,distance:2,followMs:1000,followPower:1,hits:3,hitPower:.5,staggerMs:300,pvePower:1,poisonBonus:.01,pveFraction:.01,castMs:100,tickFraction:.05,fraction:.1,bonus:.1}]));
 return {core,coreLevels:[1,10,25,40,55,70,85,100],corePointLevels:[1,5,10,15,20,30,45,60,75,90,100],coreProgress:{0:progress,1:progress}};
}
function snapshot(path){
 const book={coreRanks:{},menderCoreRanks:{},cooldowns:{},school:'phuttha',learned:[],training:{}};
 const me={pathId:path,level:100,alive:true,swordTreeData:JSON.stringify(book),muayBookData:JSON.stringify(book)};
 room.state.players.set(localId,me);
 room.state.swordTreeCatalog=JSON.stringify(catalog('phutthaisawan'));
 room.state.muayBookCatalog=JSON.stringify(catalog('muay_boran'));
 room.state.sentinelAvailable=room.state.bladeAvailable=room.state.occultAvailable=true;
 bladeBookState={...catalog('blade'),book:structuredClone(book)};
 sentinelBookState={...catalog('sentinel'),book:structuredClone(book)};
 occultBookState={...catalog(path==='mender'?'mender':'seer'),path,book:structuredClone(book)};
 return me;
}
window.fixture={snapshot,wire,notices,room,ownServerCharacter,swordData,syncSwordTreeButton,openSwordTree,
 navigate(){openDrawer('fixtureOther','Other panel','<p id=fixtureOtherPanel>Other panel</p>');},
 get drawerActive(){return drawerActive;},get demo(){return JSON.stringify(demoSwordTreeData);},
 setMode(value){mode=value;}, switchPath(path){ownServerCharacter().pathId=path;syncSwordTreeButton(ownServerCharacter());}};
snapshot('phutthaisawan');
`;
  return {script, html:`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"></head><body><main id="game">${quick[0]}<button id="fieldMenuButton">Menu</button><div id="shade" class="shade" hidden></div>${drawer}</main><div id="accountEntry" hidden></div>${modal}<script src="/fixture.js"></script></body></html>`};
}
async function cases(page, check) {
  for (const path of Object.keys(ids)) {
    await page.evaluate(path => fixture.snapshot(path), path);
    // Leave every menu entry stale-visible, with sword first: the original bug.
    await page.evaluate(() => document.querySelectorAll('.book-entry').forEach(e => e.hidden=false));
    for (let repeat=0;repeat<2;repeat++) {
      await page.locator('#quickSkills').click();
      const actual=await page.locator('#drawerBody [data-skill-glyph]').evaluateAll(nodes=>nodes.map(n=>n.dataset.skillGlyph).filter(id=>!id.startsWith('class_')));
      assert.deepEqual(actual.sort(), [...ids[path]].sort(), path+' renders only own four skills');
      await check(path+'-open-'+repeat);
      await page.locator('#drawerClose').click();
      assert.equal(await page.locator('#drawer').isVisible(),false);
    }
    await page.evaluate(()=>fixture.syncSwordTreeButton(fixture.ownServerCharacter()));
    assert.equal(await page.locator('#swordTreeButton').evaluate(e=>e.hidden),path!=='phutthaisawan');
  }
  await page.evaluate(()=>fixture.snapshot('phutthaisawan'));
  await page.locator('#quickSkills').click();
  await page.locator('[data-skill-id="phuttha_core"]').click();
  assert.equal(await page.locator('#skillDetailModal').isVisible(),true);
  // Exercise the shipped keyboard listener: first Escape dismisses only the
  // detail modal; the second dismisses the drawer and restores the opener.
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#skillDetailModal').isVisible(),false);
  assert.equal(await page.locator('#drawer').isVisible(),true);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#drawer').isVisible(),false);
  assert.equal(await page.locator('#quickSkills').evaluate(e=>e===document.activeElement),true);
  await page.locator('#quickSkills').click();
  assert.equal(await page.locator('#skillDetailModal').isVisible(),false);
  await page.locator('[data-skill-id="phuttha_core"]').click();
  // Simulate an application-driven close while the modal overlays the drawer.
  // Do not force a physical pointer through the modal backdrop.
  await page.evaluate(()=>document.getElementById('drawerClose').click());
  assert.equal(await page.locator('#skillDetailModal').isVisible(),false);
  assert.equal(await page.locator('#skillPopupBackdrop').isVisible(),false);
  assert.equal(await page.locator('#drawer').isVisible(),false);
  await page.locator('#quickSkills').click();
  assert.equal(await page.locator('#skillDetailModal').isVisible(),false);
  await page.locator('[data-skill-id="phuttha_core"]').click();
  await page.evaluate(()=>fixture.navigate());
  assert.equal(await page.locator('#fixtureOtherPanel').isVisible(),true);
  assert.equal(await page.locator('#skillDetailModal').isVisible(),false,'navigation closes modal');
  await page.locator('#drawerClose').click();
  await page.locator('#quickSkills').click();
  assert.equal(await page.locator('#skillDetailModal').isVisible(),false,'reopening does not restore modal');
  await check('modal-dismiss-navigation-reopen');
  await page.locator('[data-skill-id="phuttha_core"]').click();
  const before=await page.evaluate(()=>({tree:fixture.ownServerCharacter().swordTreeData,demo:fixture.demo}));
  await page.locator('#skillModalUpgradeBtn').click();
  assert.deepEqual(await page.evaluate(()=>fixture.wire),[{command:'sword_core_book',payload:{action:'upgrade',skillId:'phuttha_core'}}]);
  assert.deepEqual(await page.evaluate(()=>({tree:fixture.ownServerCharacter().swordTreeData,demo:fixture.demo})),before,'live rank remains server-authoritative');
  await page.evaluate(()=>{const me=fixture.ownServerCharacter(), tree=JSON.parse(me.swordTreeData);tree.coreRanks.phuttha_core=1;me.swordTreeData=JSON.stringify(tree);fixture.syncSwordTreeButton(me);});
  assert.match(await page.locator('#skillModalBadge').textContent(),/1\/8/,'server snapshot refreshes modal');
  await page.locator('#skillModalCloseBtn').click();
  assert.equal(await page.locator('#skillDetailModal').isVisible(),false);
  await page.locator('[data-skill-id="phuttha_core"]').click();
  await page.evaluate(()=>{window.staleUpgrade=document.getElementById('skillModalUpgradeBtn').onclick;fixture.switchPath('blade');window.staleUpgrade();});
  assert.equal(await page.evaluate(()=>fixture.wire.length),1,'stale modal upgrade cannot send after class change');
  assert.equal(await page.locator('#skillDetailModal').isVisible(),false,'class switch closes old modal');
  assert.equal(await page.locator('#drawer').isVisible(),false,'class switch closes old book');
  await page.locator('#quickSkills').click();
  assert.equal(await page.locator('#bladeBookBody').isVisible(),true);
  await page.locator('#drawerClose').click();
  for(const invalid of ['missing-catalog','invalid-catalog','missing-tree','invalid-tree','wrong-path','missing-player']) {
    await page.evaluate(invalid=>{
      fixture.snapshot('phutthaisawan');
      if(invalid==='missing-catalog')fixture.room.state.swordTreeCatalog='';
      if(invalid==='invalid-catalog')fixture.room.state.swordTreeCatalog='{';
      if(invalid==='missing-tree')fixture.ownServerCharacter().swordTreeData='';
      if(invalid==='invalid-tree')fixture.ownServerCharacter().swordTreeData='{';
      if(invalid==='wrong-path')fixture.ownServerCharacter().pathId='blade';
      if(invalid==='missing-player')fixture.room.state.players.clear();
      fixture.openSwordTree();
    },invalid);
    assert.equal(await page.evaluate(()=>fixture.swordData()),null,invalid+' never supplies demo');
    assert.equal(await page.locator('#drawer').isVisible(),false,invalid+' does not open sword book');
    await check(invalid);
  }
  await page.evaluate(()=>{fixture.setMode('demo');fixture.openSwordTree();});
  assert.equal(await page.locator('#swordTreeBody .kg-node').count(),4,'demo preview retained');
  await check('demo-preview');
}
async function main(){
 const {chromium}=require('playwright'), assets=fixture(), css=read('styles.css');
 const out=path.join(root,'class-skills-browser-evidence');fs.mkdirSync(out,{recursive:true});
 const report={revision:process.env.GITHUB_SHA||'local checkout',cases:[],errors:[],blocked:[],limits:'Isolated production-source real DOM with synthetic server snapshots. Not logged-in or full-game QA. Mobile is Chromium emulation.'};
 const server=http.createServer((req,res)=>{
  res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src data:; connect-src 'none'");
  const type=req.url==='/fixture.js'?'text/javascript':req.url==='/styles.css'?'text/css':'text/html';res.setHeader('Content-Type',type+'; charset=utf-8');
  res.end(req.url==='/fixture.js'?assets.script:req.url==='/styles.css'?css:assets.html);
 });
 let browser;
 try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true});
  for(const [width,height] of [[1366,900],[390,844],[320,640]]){
   const context=await browser.newContext({viewport:{width,height},isMobile:width<500,hasTouch:width<500,serviceWorkers:'block'});
   await context.route('**/*',route=>{if(new URL(route.request().url()).origin===origin)return route.continue();report.blocked.push(route.request().url());return route.abort();});
   const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
   try{
    await page.goto(origin,{waitUntil:'load'});assert.deepEqual(report.errors,[]);
    await cases(page,async name=>{assert.deepEqual(report.errors,[]);report.cases.push({name,width});await page.screenshot({path:path.join(out,width+'-'+name+'.png')});});
   }catch(error){await page.screenshot({path:path.join(out,width+'-failure.png')}).catch(()=>{});throw error;}
   finally{await context.close();}
  }
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.blocked,[]);
  console.log('PASS class skill browser: '+report.cases.length+' checks');
 }catch(error){report.failure=error.stack;throw error;}
 finally{fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={fixture,cases};
