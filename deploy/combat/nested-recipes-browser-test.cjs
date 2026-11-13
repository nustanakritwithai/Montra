// Real DOM + production CSS with a synthetic server catalog. No live account or mutations.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {fixtureScript}=require('./release-ui-browser-test.cjs');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'nested-recipes-browser-evidence');
async function main(){
 fs.mkdirSync(out,{recursive:true});
 const report={cases:[],errors:[],limits:'Isolated production UI with synthetic server data; Chromium mobile emulation, no live account or backend.'};
 const script=fixtureScript('craft');
 const drawerSource=fs.readFileSync(root+'/src/client/ui/046-drawers-and-chat.js','utf8');
 const keyStart=drawerSource.indexOf('  document.addEventListener("keydown",event=>{',drawerSource.indexOf('  function setFieldLayout'));
 const keyEnd=drawerSource.indexOf('  function updateChatBadge',keyStart);assert(keyStart>=0&&keyEnd>keyStart);
 const drawerKeys='window.ui={drawer:document.getElementById("drawer")};window.handleForgePickerKey=()=>false;window.handleItemDetailKey=()=>false;'+drawerSource.slice(keyStart,keyEnd);
 const server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname==='/fixture.js'){res.setHeader('content-type','text/javascript; charset=utf-8');return res.end(script);}
  if(pathname==='/styles.css'){res.setHeader('content-type','text/css');return res.end(fs.readFileSync(root+'/styles.css'));}
  if(pathname.startsWith('/assets/items/')&&!pathname.includes('..')){const file=path.join(root,pathname);if(fs.existsSync(file)){res.setHeader('content-type','image/png');return res.end(fs.readFileSync(file));}}
  if(pathname!=='/craft'){res.writeHead(404);return res.end();}
  res.setHeader('content-type','text/html; charset=utf-8');res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/styles.css"></head><body><div id="accountEntry" hidden></div><button id="fixtureOpen">Reopen fixture</button><section id="drawer" class="drawer"><div class="drawer-header"><h2 id="drawerTitle"></h2><button id="drawerClose">ปิด</button></div><div id="drawerBody" class="drawer-body"></div></section><script src="/fixture.js"></script></body></html>');
 });
 let browser;
 try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
  for(const [width,height] of [[1366,900],[390,844],[320,640],[844,390]]){
   const context=await browser.newContext({viewport:{width,height},isMobile:width<500,hasTouch:width<500});
   await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
   const page=await context.newPage();page.on('pageerror',error=>report.errors.push(error.message));
   const check=async name=>{
    assert.deepEqual(report.errors,[]);
    const state=await page.evaluate(()=>({page:document.documentElement.scrollWidth,viewport:innerWidth,body:document.getElementById('drawerBody').clientWidth,scroll:document.getElementById('drawerBody').scrollWidth,hiddenLeaks:[...document.querySelectorAll('#drawer [hidden]')].filter(e=>getComputedStyle(e).display!=='none').map(e=>e.id)}));
    const popup=await page.locator('#craftRecipePopup').evaluate(e=>({open:e.open,scroll:e.scrollWidth,width:e.clientWidth,bodyScroll:document.getElementById('craftRecipePopupBody').scrollWidth,body:document.getElementById('craftRecipePopupBody').clientWidth}));if(popup.open){assert(popup.scroll<=popup.width+1,JSON.stringify(popup));assert(popup.bodyScroll<=popup.body+1,JSON.stringify(popup));}
    assert(state.page<=state.viewport+1);assert(state.scroll<=state.body+1,JSON.stringify(state));assert.deepEqual(state.hiddenLeaks,[]);
    report.cases.push({width,name,...state});await page.screenshot({path:path.join(out,width+'-'+name+'.png')});
   };
   await page.goto(origin+'/craft');await page.addScriptTag({content:drawerKeys});
   assert.equal(await page.locator('#craftRecipePopup').isVisible(),false);
   await check('picker-without-popup');
   await page.locator('#craftRecipeGrid > button').first().click();
   assert.equal(await page.locator('#craftRecipePopup').evaluate(e=>e.open),true);
   assert.equal(await page.evaluate(()=>document.activeElement.id),'craftRecipePopupTitle');
   const popupState=await page.locator('#craftRecipePopup').evaluate(e=>{const r=e.getBoundingClientRect();return {width:r.width,height:r.height,x:r.x,y:r.y,sw:e.scrollWidth,cw:e.clientWidth};});
   assert(popupState.width<=522 && popupState.width<=width-18,JSON.stringify(popupState));assert(popupState.height<=height-20);assert(popupState.x>=0 && popupState.y>=0);assert(popupState.sw<=popupState.cw+1);
   await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.id),'craftRecipePopupClose');
   await page.keyboard.press('Shift+Tab');assert.equal(await page.evaluate(()=>document.activeElement.closest('dialog')?.id),'craftRecipePopup');
   await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.id),'craftRecipePopupClose');
   await page.keyboard.press('Escape');
   assert.equal(await page.locator('#craftRecipePopup').isVisible(),false);assert.equal(await page.locator('#drawer').isVisible(),true);
   assert.equal(await page.evaluate(()=>document.activeElement.classList.contains('ck-recipe')),true);
   await page.evaluate(()=>document.getElementById('benchCraft').onclick());assert.equal(await page.evaluate(()=>f.mutations().length),0);
   await page.locator('#craftRecipeGrid > button').first().click();await page.mouse.click(1,1);
   assert.equal(await page.locator('#craftRecipePopup').isVisible(),false);
   await check('popup-close-restores-picker');
   await page.evaluate(()=>{f.items.raw_ore={name:'หินปนแร่',kind:'material',refinesTo:'mat_metal_1'};f.choose('all','blade_25');});
   await page.locator('#benchRecipeExplorer').scrollIntoViewIfNeeded();await check('root-formula');
   assert.equal(await page.locator('#benchCraft').evaluate(e=>{const b=e.getBoundingClientRect();return b.y>=0&&b.bottom<=innerHeight}),true,'craft action stays visible without scrolling');
   const clickItem=async(host,id)=>{const target=page.locator(host+' button[data-item="'+id+'"]').first();if(width<500)await target.tap();else await target.click();};
   await clickItem('#benchCreatedFrom','mat_ingot_1');await page.locator('#benchUsesLabel').click();await clickItem('#benchUsedFor','blade_25');
   assert.equal(await page.evaluate(()=>document.activeElement.id),'craftRecipePopupTitle');
   await page.keyboard.press('Escape');assert.equal(await page.locator('#craftRecipePopup').isVisible(),false);assert.equal(await page.locator('#drawer').isVisible(),true);
   await page.evaluate(()=>f.choose('all','blade_25'));await page.evaluate(()=>document.activeElement.blur());await page.keyboard.press('Escape');
   assert.equal(await page.locator('#craftRecipePopup').isVisible(),false);assert.equal(await page.locator('#drawer').isVisible(),true);
   await check('root-node-and-lost-focus-escape');
   await page.evaluate(()=>f.choose('all','blade_25'));
   await clickItem('#benchCreatedFrom','mat_ingot_1');assert.equal(await page.locator('#benchInspectTitle').textContent(),'แท่งเหล็ก');await check('ingot-formula');
   await clickItem('#benchCreatedFrom','mat_metal_1');assert.match(await page.locator('#benchCreatedFrom').textContent(),/หินปนแร่.*มี 0 \/ 2.*ขาด 2.*แร่เหล็ก.*×1.*แปรรูป/);await check('refining-formula');
   await clickItem('#benchCreatedFrom','raw_ore');assert.match(await page.locator('#benchCreatedFrom').textContent(),/ไม่มีสูตรสร้างหรือแปรรูป/);await check('raw-material');
   await page.locator('#benchInspectBack').click();assert.equal(await page.locator('#benchInspectTitle').textContent(),'แร่เหล็ก');
   await page.locator('#benchInspectRoot').click();assert.equal(await page.locator('#benchCraftDetails').isVisible(),true);
   const ingredient=page.locator('#benchCreatedFrom button[data-ingredient-qty][data-item="mat_ingot_1"]');await ingredient.focus();
   await page.evaluate(()=>{f.run('renderBag();renderBag()');f.callbacks.economy_state({gold:999});});
   assert.equal(await ingredient.evaluate(e=>e===document.activeElement),true,'live polling preserves keyboard focus');
   await ingredient.press('Enter');assert.equal(await page.locator('#benchInspectTitle').textContent(),'แท่งเหล็ก');
   await page.locator('#benchUsesLabel').click();await page.locator('#benchUsesNext').click();assert.match(await page.locator('#benchUsesCount').textContent(),/หน้า 2/);await check('used-for-pagination');
   await page.evaluate(()=>document.getElementById('benchCraft').onclick());assert.equal(await page.evaluate(()=>f.mutations().length),0);
   const node=page.locator('#benchCreatedFrom button[data-item="mat_charcoal_1"]');await node.focus();await node.press('Enter');assert.equal(await page.locator('#benchInspectTitle').textContent(),'ถ่าน');
   await page.evaluate(()=>f.callbacks.economy_state({gold:1}));assert.equal(await page.locator('#benchInspectTitle').textContent(),'ถ่าน');
   await page.locator('#benchInspectChoose').click();assert.equal(await page.locator('#benchRecipe').inputValue(),'mat_charcoal_1');assert.equal(await page.locator('#benchCraftDetails').isVisible(),true);await check('choose-nested-recipe');
   await clickItem('#benchCreatedFrom','mat_raw_wood_1');await page.locator('#craftRecipePopupClose').click();await page.locator('#drawerClose').click();await page.locator('#fixtureOpen').click();assert.equal(await page.locator('#benchInspectBack').isVisible(),false);await check('reopen-clears-trail');assert.equal(await page.locator('#craftRecipePopup').isVisible(),false);
   await page.locator('#craftRecipeGrid > button').first().click();assert.equal(await page.locator('#benchInspectBack').isVisible(),false);
   await page.evaluate(()=>f.run('room={...room};renderCraftingPage()'));assert.equal(await page.locator('#craftRecipePopup').isVisible(),false);
   await check('room-reset-closes-popup');
   assert.equal(await page.evaluate(()=>f.wire.filter(x=>/craft_weapon|refine_resource/.test(x.command)).length),0);
   if(process.env.MONTRA_RECIPE_CATALOG){
    const catalog=JSON.parse(fs.readFileSync(process.env.MONTRA_RECIPE_CATALOG,'utf8'));
    await page.evaluate(catalog=>{f.ctx.personalItems=catalog;f.ctx.catalogRevision++;f.run('selectBenchRecipe("all","1","wp_twins_1")');},catalog);
    await page.locator('#benchRecipeExplorer').scrollIntoViewIfNeeded();await check('actual-sword-formula');
    await clickItem('#benchCreatedFrom','mat_metal_1');assert.match(await page.locator('#benchCreatedFrom').textContent(),/ก้อนหินปนแร่ชั้น1/);await check('actual-ore-refining');
    await clickItem('#benchCreatedFrom','mat_raw_stone_1');assert.match(await page.locator('#benchCreatedFrom').textContent(),/ไม่มีสูตรสร้างหรือแปรรูป/);await check('actual-raw-stone');
    assert.equal(await page.evaluate(()=>f.wire.filter(x=>/craft_weapon|refine_resource/.test(x.command)).length),0);
   }
   await context.close();
  }
  console.log('PASS nested recipe browser: '+report.cases.length+' layout/flow checks');
 }catch(error){report.failure=error.stack;throw error;}finally{fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
