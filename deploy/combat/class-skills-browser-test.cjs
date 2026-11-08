/** Real Chromium DOM regression of shipped class-book functions, HTML and CSS.
 * Synthetic server snapshots and captured sends only; no accounts or backend. */
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const serverCatalogs = require('./core-skill-catalog-fixture.cjs');
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
const serverCatalogs=${JSON.stringify(serverCatalogs)};
function catalog(path){return structuredClone(serverCatalogs[path]);}
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
 model:coreSkillGraphData,renderModal:renderSkillModalContent,
 setRanks(ranks){
   const path=ownServerCharacter().pathId;
   if(path==='phutthaisawan'||path==='muay_boran'){
     const key=path==='phutthaisawan'?'swordTreeData':'muayBookData', book=JSON.parse(ownServerCharacter()[key]);book.coreRanks=ranks;ownServerCharacter()[key]=JSON.stringify(book);
   }else{const state=path==='blade'?bladeBookState:path==='sentinel'?sentinelBookState:occultBookState;state.book[path==='mender'?'menderCoreRanks':'coreRanks']=ranks;}
   syncClassSkillBookContext();
 },
 rerender(){renderCoreSkillKnowledgeGraph(coreSkillGraphData(),document.querySelector('#drawerBody > div'));},

 navigate(){openDrawer('fixtureOther','Other panel','<p id=fixtureOtherPanel>Other panel</p>');},
 get drawerActive(){return drawerActive;},get demo(){return JSON.stringify(demoSwordTreeData);},
 setMode(value){mode=value;}, switchPath(path){ownServerCharacter().pathId=path;syncSwordTreeButton(ownServerCharacter());}};
snapshot('phutthaisawan');
`;
  return {script, html:`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"></head><body><main id="game">${quick[0]}<button id="fieldMenuButton">Menu</button><div id="shade" class="shade" hidden></div>${drawer}</main><div id="accountEntry" hidden></div>${modal}<script src="/fixture.js"></script></body></html>`};
}
async function assertModalArtwork(page) {
  const state = await page.evaluate(() => {
    const glyph = document.getElementById('skillModalGlyph'), badge = document.getElementById('skillModalBadge');
    const g = glyph.getBoundingClientRect(), b = badge.getBoundingClientRect();
    return { image: getComputedStyle(glyph).backgroundImage, width: g.width, height: g.height,
      overlap: Math.max(0, Math.min(g.right, b.right) - Math.max(g.left, b.left)) * Math.max(0, Math.min(g.bottom, b.bottom) - Math.max(g.top, b.top)),
      badgeInside: b.left >= 0 && b.right <= innerWidth && b.top >= 0 && b.bottom <= innerHeight,
      text: badge.textContent };
  });
  assert.match(state.image, /^url\("data:image\/svg\+xml,/);
  assert(state.width >= 40 && state.height >= 40, 'modal artwork retains readable dimensions');
  assert.equal(state.overlap, 0, 'status badge never covers any part of the skill artwork');
  assert(state.badgeInside && state.text, 'status stays visible inside the viewport');
}
async function artworkCases(page, check) {
  for (const [className, skills] of Object.entries(ids)) {
    await page.evaluate(({className, skills}) => {
      const panel = document.createElement('section'); panel.id = 'artworkAudit';
      panel.style.cssText = 'position:fixed;inset:12px;z-index:2000;overflow:auto;background:#10191c;padding:12px';
      panel.innerHTML = '<h2>' + className + ': artwork surfaces</h2>' + skills.map(id =>
        '<article data-audit-skill="'+id+'" style="margin:20px 0"><strong>'+id+'</strong><div style="display:flex;justify-content:space-around;gap:8px;padding:8px 0">' +
        ['skill-book-icon','kg-glyph','skill-modal-glyph','glyph'].map(surface => '<div style="text-align:center"><small style="display:block;font-size:10px">'+surface.replace('skill-','')+'</small><span class="'+surface+'" data-skill-glyph="'+id+'">✦</span></div>').join('') + '</div></article>').join('');
      document.body.append(panel);
    }, {className, skills});
    const rows = await page.locator('#artworkAudit [data-audit-skill]').evaluateAll(nodes => Promise.all(nodes.map(async node => {
      const surfaces = [...node.querySelectorAll('[data-skill-glyph]')].map(e => ({image:getComputedStyle(e).backgroundImage,width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height}));
      const decoded = await Promise.all(surfaces.map(s => new Promise(resolve => {
        if (!s.image.startsWith('url("data:image/svg+xml,')) return resolve(false);
        const image = new Image(); image.onload = () => resolve(image.naturalWidth > 0 && image.naturalHeight > 0); image.onerror = () => resolve(false);
        image.src = s.image.slice(5,-2);
      })));
      return {id:node.dataset.auditSkill,surfaces,decoded};
    })));
    for (const row of rows) {
      assert(row.decoded.every(Boolean), row.id+' decodes on every surface');
      assert(row.surfaces.every(s => s.width > 0 && s.height > 0 && s.image === row.surfaces[0].image), row.id+' has matching visible artwork on every surface');
    }
    await check('artwork-'+className);
    await page.locator('#artworkAudit').evaluate(e => e.remove());
  }
}
async function assertGraphGeometry(page) {
 await page.waitForFunction(()=>[...document.querySelectorAll('.kg-edge')].length===4 && [...document.querySelectorAll('.kg-edge')].every(e=>e.getAttribute('d')));
 const geometry=await page.evaluate(()=>{
   const board=document.querySelector('.radial-4way'), svg=board.querySelector('svg'), b=svg.getBoundingClientRect();
   const box=e=>{const r=e.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2,w:r.width,h:r.height,left:r.left,right:r.right,top:r.top,bottom:r.bottom};};
   const center=box(board.querySelector('.kg-center-class-orb'));
   return {center,centerBox:box(board.querySelector(".kg-center-class-node")),width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,
     nodes:[...board.querySelectorAll('.kg-node')].map(node=>({id:node.dataset.skillId,box:box(node),orb:box(node.querySelector('.kg-orb')),badge:box(board.querySelector('.kg-stream-badge-'+['top','right','bottom','left'][[...board.querySelectorAll('.kg-node')].indexOf(node)])),
       d:board.querySelector('[data-kg-edge="'+node.dataset.skillId+'"]').getAttribute('d').match(/-?[\d.]+/g).map(Number)})),svg:{x:b.left,y:b.top}};
 });
 assert.equal(geometry.overflow,false,'no horizontal page overflow');
 for(const [i,n] of geometry.nodes.entries()){
   assert(n.box.left>=0 && n.box.right<=geometry.width,'node '+n.id+' stays inside viewport');
   assert(n.box.w>=44&&n.box.h>=44,'touch target');
   assert(Math.max(0,Math.min(n.box.right,n.badge.right)-Math.max(n.box.left,n.badge.left))*Math.max(0,Math.min(n.box.bottom,n.badge.bottom)-Math.max(n.box.top,n.badge.top))===0,n.id+' direction label does not overlap node');
   const cb=geometry.centerBox;
   assert(Math.max(0,Math.min(n.box.right,cb.right)-Math.max(n.box.left,cb.left))*Math.max(0,Math.min(n.box.bottom,cb.bottom)-Math.max(n.box.top,cb.top))===0,n.id+' node does not overlap class center');
   const {center:c,svg}=geometry, angle=Math.atan2(n.orb.y-c.y,n.orb.x-c.x);
   const expected=[c.x-svg.x+Math.cos(angle)*(c.w/2+2),c.y-svg.y+Math.sin(angle)*(c.w/2+2),n.orb.x-svg.x-Math.cos(angle)*(n.orb.w/2+4),n.orb.y-svg.y-Math.sin(angle)*(n.orb.w/2+4)];
   n.d.forEach((x,j)=>assert(Math.abs(x-expected[j])<.8,n.id+' connector endpoint '+j));
   if(i===0)assert(n.orb.y<c.y);if(i===1)assert(n.orb.x>c.x);if(i===2)assert(n.orb.y>c.y);if(i===3)assert(n.orb.x<c.x);
 }
}
async function radialCases(page, check) {
 const commands={phutthaisawan:'sword_core_book',muay_boran:'muay_book',blade:'blade_book',sentinel:'sentinel_book',seer:'occult_book',mender:'occult_book'};
 for(const [className,skills] of Object.entries(ids)){
   await page.evaluate(path=>{fixture.snapshot(path);fixture.wire.length=0;},className);
   await page.locator('#quickSkills').click();await assertGraphGeometry(page);
   await check(className+'-radial-layout');
   for(const id of skills){
     await page.locator('[data-skill-id="'+id+'"]').click();await assertModalArtwork(page);
     assert.equal(await page.locator('#skillModalName').textContent(),serverCatalogs[className].core[id].name);
     assert.match(await page.locator('#skillModalBadge').textContent(),/0\/8/);
     assert(!/NaN|undefined/.test(await page.locator('#skillDetailModal').textContent()),'complete current/next descriptions');
     const before=await page.evaluate(()=>JSON.stringify(fixture.model().ranks));
     await page.locator('#skillModalUpgradeBtn').click();
     const sent=await page.evaluate(()=>fixture.wire.pop());
     assert.deepEqual(sent,{command:commands[className],payload:{action:className==='phutthaisawan'?'upgrade':'core_upgrade',skillId:id}});
     assert.equal(await page.evaluate(()=>JSON.stringify(fixture.model().ranks)),before,'no optimistic rank mutation');
     await page.evaluate(id=>fixture.setRanks({[id]:1}),id);
     assert.match(await page.locator('#skillModalBadge').textContent(),/1\/8/);await assertModalArtwork(page);
     await page.evaluate(id=>fixture.setRanks({[id]:8}),id);
     assert.equal(await page.locator('#skillModalUpgradeBtn').isDisabled(),true,'max rank');
     await page.locator('#skillModalCloseBtn').click();
     await page.evaluate(()=>fixture.setRanks({}));
   }
   // Level and point constraints come from the current catalog, not other skills.
   await page.evaluate(()=>{fixture.ownServerCharacter().level=1;fixture.rerender();});
   await page.locator('[data-skill-id="'+skills[0]+'"]').click();
   assert.equal(await page.locator('#skillModalUpgradeBtn').isDisabled(),true,'level gate');
   await page.keyboard.press('Escape');
   await page.evaluate(skills=>{fixture.ownServerCharacter().level=100;fixture.setRanks({[skills[0]]:8,[skills[1]]:4});fixture.rerender();},skills);
   await page.locator('[data-skill-id="'+skills[2]+'"]').click();
   assert.equal(await page.locator('#skillModalUpgradeBtn').isDisabled(),true,'point pool exhausted');
   await page.keyboard.press('Escape');
   const reset=page.locator('#drawerBody .st-footer-actions button');
   page.once('dialog',d=>d.dismiss());await reset.click();
   assert.equal(await page.evaluate(()=>fixture.wire.length),0,'cancel reset sends nothing');
   page.once('dialog',d=>d.accept());await reset.click();
   assert.deepEqual(await page.evaluate(()=>fixture.wire.pop()),{command:commands[className],payload:{action:className==='phutthaisawan'?'reset':'core_reset'}});
   assert.equal(await page.evaluate(()=>fixture.model().spent),12,'reset waits for server');
   await page.evaluate(()=>{fixture.setRanks({});fixture.rerender();});
   // Native button activation and stale handler protection.
   await page.locator('[data-skill-id="'+skills[0]+'"]').focus();await page.keyboard.press('Enter');
   assert.equal(await page.locator('#skillDetailModal').isVisible(),true);
   await page.evaluate(()=>{window.staleUpgrade=document.getElementById('skillModalUpgradeBtn').onclick;});
   await page.evaluate(path=>fixture.switchPath(path==='seer'?'mender':'seer'),className);
   await page.evaluate(()=>window.staleUpgrade());
   assert.equal(await page.evaluate(()=>fixture.wire.length),0,'stale class cannot upgrade');
   assert.equal(await page.locator('#drawer').isVisible(),false);
   await check(className+'-radial-actions');
 }
 // Resize an open graph (portrait/landscape) and verify the actual SVG endpoints.
 await page.evaluate(()=>fixture.snapshot('phutthaisawan'));await page.locator('#quickSkills').click();
 const original=page.viewportSize();await page.setViewportSize({width:844,height:390});await page.waitForTimeout(100);await assertGraphGeometry(page);
 await page.setViewportSize(original);await page.waitForTimeout(100);await assertGraphGeometry(page);
 await page.locator('#drawerClose').click();await check('radial-resize');
}
async function cases(page, check) {
  await radialCases(page, check);
  // Long localized copy must scroll inside the body without hiding rank or actions.
  await page.evaluate(()=>fixture.snapshot('blade'));await page.locator('#quickSkills').click();
  await page.locator('[data-skill-id="blade_heavy"]').click();
  await page.evaluate(()=>{const desc=document.getElementById('skillModalDesc');desc.textContent=desc.textContent.repeat(8);});
  const scroll=await page.locator('#skillModalBody').evaluate(e=>{e.scrollTop=e.scrollHeight;return {top:e.scrollTop,height:e.clientHeight,full:e.scrollHeight};});
  assert(scroll.top>0 && scroll.height<scroll.full,'long description has its own scroll area');
  await assertModalArtwork(page);
  for(const selector of ['#skillModalClose','#skillModalUpgradeBtn','#skillModalCloseBtn']) {
    const box=await page.locator(selector).boundingBox(),viewport=page.viewportSize();
    assert(box.x>=0 && box.y>=0 && box.x+box.width<=viewport.width && box.y+box.height<=viewport.height,selector+' remains in viewport while body scrolls');
  }
  await check('modal-long-copy-scroll');await page.locator('#skillModalCloseBtn').click();await page.locator('#drawerClose').click();
  for (const path of Object.keys(ids)) {
    await page.evaluate(path => fixture.snapshot(path), path);
    // Leave every menu entry stale-visible, with sword first: the original bug.
    await page.evaluate(() => document.querySelectorAll('.book-entry').forEach(e => e.hidden=false));
    for (let repeat=0;repeat<2;repeat++) {
      await page.locator('#quickSkills').click();
      const actual=await page.locator('#drawerBody [data-skill-glyph]').evaluateAll(nodes=>nodes.map(n=>n.dataset.skillGlyph).filter(id=>!id.startsWith('class_')));
      assert.deepEqual(actual.sort(), [...ids[path]].sort(), path+' renders only own four skills');
      const images = await page.locator('#drawerBody [data-skill-glyph]').evaluateAll(nodes => nodes.map(e => getComputedStyle(e).backgroundImage));
      assert(images.every(image => image.startsWith('url("data:image/svg+xml,')), path+' actual book has no blank artwork');
      await check(path+'-open-'+repeat);
      if (path === 'phutthaisawan' && repeat === 0) for (const id of ids[path]) {
        await page.locator('[data-skill-id="'+id+'"]').click();
        await assertModalArtwork(page); await check(id+'-unlearned');
        await page.locator('#skillModalCloseBtn').click();
      }
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
  await assertModalArtwork(page); await check('sword-modal-learned');
  await page.evaluate(()=>{const me=fixture.ownServerCharacter(),tree=JSON.parse(me.swordTreeData);tree.coreRanks.phuttha_core=8;me.swordTreeData=JSON.stringify(tree);fixture.syncSwordTreeButton(me);});
  assert.match(await page.locator('#skillModalBadge').textContent(),/8\/8/);
  await assertModalArtwork(page); await check('sword-modal-max-rank');
  // Restore an upgradable snapshot so the existing stale-handler check remains meaningful.
  await page.evaluate(()=>{const me=fixture.ownServerCharacter(),tree=JSON.parse(me.swordTreeData);tree.coreRanks.phuttha_core=1;me.swordTreeData=JSON.stringify(tree);fixture.syncSwordTreeButton(me);});
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
    await artworkCases(page,async name=>{assert.deepEqual(report.errors,[]);report.cases.push({name,width});await page.screenshot({animations:'disabled',path:path.join(out,width+'-'+name+'.png')});});
    await cases(page,async name=>{assert.deepEqual(report.errors,[]);report.cases.push({name,width});await page.screenshot({animations:'disabled',path:path.join(out,width+'-'+name+'.png')});});
   }catch(error){await page.screenshot({animations:'disabled',path:path.join(out,width+'-failure.png')}).catch(()=>{});throw error;}
   finally{await context.close();}
  }
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.blocked,[]);
  console.log('PASS class skill browser: '+report.cases.length+' checks');
 }catch(error){report.failure=error.stack;throw error;}
 finally{fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={fixture,cases};
