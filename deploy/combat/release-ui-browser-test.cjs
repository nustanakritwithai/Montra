/** Isolated browser regression, not logged-in live QA. Production renderer functions,
 * markup and assembled CSS; synthetic catalog/inventory, captured room sends only.
 * No account, backend, WebSocket or external resource is used. */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'release-ui-browser-evidence');
const source=fs.readFileSync(root+'/main.js','utf8'),css=fs.readFileSync(root+'/styles.css','utf8'),index=fs.readFileSync(root+'/index.html','utf8');
function fixtureScript(type){
 let s=fs.readFileSync(root+'/deploy/combat/'+(type==='market'?'market-catalog-ui-test.cjs':'crafting-pages-ui-test.cjs'),'utf8').replace(/\r\n/g,'\n');
 const first=s.indexOf('const slice='),last=s.indexOf(type==='market'?"\ntest('catalog":'\nif(require.main');
 assert(first>=0&&last>first,'fixture setup boundaries');s=s.slice(first,last);
 // Real DOM replaces the deliberately simple node mocks in the repository fixtures.
 const start=s.indexOf('function node('),end=s.indexOf(type==='market'?'\nconst find=':'\nfunction fixture()',start);
 assert(start>=0&&end>start,'mock node boundaries');
 s=s.slice(0,start)+'function node(tag="div"){return document.createElement(tag);}\n'+s.slice(end);
 s=s.replace("const $=id=>elements.get(id)||null",'const $=id=>document.getElementById(id)');
 s=s.replace('const ctx={','const ctx=bridge({');
 const contextEnd=type==='market'?'  };\n  vm.createContext(ctx);':'  };\n  ctx.room=';
 assert(s.includes(contextEnd),'context object boundary');
 s=s.replace(contextEnd,contextEnd.replace('  };','  });'));
 // Retain fixture data and dependency stubs, but use native DOM/Option and real
 // renderer functions. Global script insertion preserves lexical state between
 // source slices, unlike indirect eval. Any fixture/script error fails the run.
 const shim=`let bridgeReady=false;function bridge(target){return new Proxy(target,{get(target,key){return bridgeReady?window[key]:target[key];},set(target,key,value){if(bridgeReady)window[key]=value;else target[key]=value;return true;}});}
 const vm={createContext(ctx){
   ctx.document=document;ctx.Option=Option;ctx.window=window;
   ctx.closeDrawer=()=>{if(typeof closeCraftRecipePopup==="function")closeCraftRecipePopup(false);window.drawerActive=null;document.getElementById('drawer').hidden=true;};
   ctx.openDrawer=(name,title,html)=>{window.drawerActive=name;document.getElementById('drawer').hidden=false;document.getElementById('drawerBody').innerHTML=html;document.getElementById('drawerTitle').textContent=title;};
   for(const [key,value] of Object.entries(ctx))if(!['document','window'].includes(key))window[key]=value;
   bridgeReady=true;
 },runInContext(code){const script=document.createElement('script');script.textContent=code;document.body.append(script);}};`;

 return 'const source='+JSON.stringify(source)+';const index='+JSON.stringify(index)+';const assert=(condition,msg)=>{if(!condition)throw Error(msg)};'+shim+s+'\nwindow.f=fixture();'+(type==='craft'?'f.ctx.openCraftingPage();':'')+
  `document.getElementById('fixtureOpen').onclick=()=>f.ctx.${type==='craft'?'openCraftingPage':'openEconomy'}();document.getElementById('drawerClose').onclick=f.ctx.closeDrawer;`;
}
function html(){return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Isolated release UI regression</title><link rel="stylesheet" href="/styles.css"></head><body><button id="fixtureOpen" type="button">Reopen isolated fixture</button><section id="drawer" class="drawer" role="dialog" aria-modal="true" aria-labelledby="drawerTitle" hidden><div class="drawer-grip"></div><div class="drawer-header"><h2 id="drawerTitle"></h2><button id="drawerClose" class="close" aria-label="ปิด">✕</button></div><div id="drawerBody" class="drawer-body"></div></section><script src="/fixture.js"></script></body></html>`;}
async function marketCases(page,check){
 await page.evaluate(()=>{f.page([f.row(1),f.row(2,'weapon')]);f.callbacks.market_overview({credit:0,auctions:[],supply:{items:[{item:'wood',price:10,remaining:3}]}});});
 await check('market-search');
 assert.equal(await page.locator('.wm-header h2').textContent(),'ตลาดกลาง');
 assert.deepEqual(await page.locator('.wm-tabs button:visible').allTextContents(),['ค้นหา','ราคาตลาด','รายการที่อยากได้','ขาย','รายการของฉัน','ประมูล','กฎตลาด','เทรดใกล้ตัว','ร้านค้าสำรอง']);
 assert.equal(await page.locator('#wmCityPurchase').isVisible(),false);
 assert.equal(await page.locator('#wmBuy').textContent(),'ซื้อ');
 assert.equal(await page.locator('#wmPick').textContent(),'เลือกไอเท็มในรายการ');
 assert.equal(await page.locator('#wmShown').textContent(),'แสดง 2 รายการ');
 assert.doesNotMatch(await page.locator('#worldMarket').innerText(),/World Market|Search|Market price|Wish list|My orders|Enhance at least|All must match|Time left|shown|Pick an item|\bBuy\b|\bmaterial\b/);
 await page.locator('#wmRowsBody .wm-row').last().click();
 await page.locator('#wmDetailsBtn').click();
 assert.match(await page.locator('#wmDetails').innerText(),/ต้องการเลเวล 25/);
 await check('market-thai-details');
 await page.evaluate(()=>{document.getElementById('wmRefresh').click();[...f.timers.values()].at(-1)();});
 assert.match(await page.locator('#wmRowsBody').innerText(),/โหลดรายการไม่สำเร็จ/);
 await check('market-thai-error');
 await page.locator('#wmRefresh').click();
 assert.match(await page.locator('#wmRowsBody').innerText(),/กำลังโหลดสินค้า/);
 await check('market-thai-loading');
 await page.evaluate(()=>f.page([]));
 assert.match(await page.locator('#wmRowsBody').innerText(),/ไม่พบสินค้า/);
 await check('market-thai-empty');
 await page.evaluate(()=>f.run('activeTrade={tradeId:"fixture-trade",own:null,other:null};openEconomy()'));
 assert.equal(await page.locator('#worldMarket').getAttribute('data-view'),'trade');
 assert.equal(await page.locator('#economyTradePanel').isVisible(),true);
 assert.equal(await page.locator('#wmSearch').isVisible(),false);
 await check('market-active-trade-reopen');
 await page.evaluate(()=>f.run('activeTrade=null'));
 await page.locator('#wmTab-search').click();
 await page.evaluate(()=>f.page([f.row(1),f.row(2,'weapon')]));
 await page.locator('#wmRowsBody .wm-row').first().click();
 await page.locator('#wmBuy').click();
 assert.match(await page.locator('#wmPick').textContent(),/ยืนยันซื้อ/);
 assert.equal(await page.evaluate(()=>f.wire.filter(x=>x.command==='market_buy').length),0);
 await page.locator('#wmClose').click();assert.equal(await page.locator('#drawer').isVisible(),false);
 await page.locator('#fixtureOpen').click();
 assert.doesNotMatch(await page.locator('#wmPick').textContent(),/ยืนยันซื้อ/);
 await check('market-reopen-clears-confirmation');
 for(const view of ['sell','orders','auction','rules','price','wish','trade','supply','search']){
  await page.locator('#wmTab-'+view).click();
  assert.equal(await page.locator('#worldMarket').getAttribute('data-view'),view);
  assert.equal(await page.locator('#wmSearch').isVisible(),view==='search');
  assert.equal(await page.locator('#wmRules').isVisible(),view==='rules');
  assert.equal(await page.locator('#wmSoon').isVisible(),['price','wish'].includes(view));
  if(['sell','orders'].includes(view))assert.equal(await page.locator('#marketSellForm').evaluate(e=>e.open),view==='sell');
  const panel={sell:'Shop',orders:'Shop',auction:'Auction',trade:'Trade',supply:'Supply'}[view];
  if(panel)assert.equal(await page.locator('#economy'+panel+'Panel').isVisible(),true);
  if(view==='trade')assert.equal(await page.locator('#tradeInvite').isEnabled(),true);
  if(view==='supply')assert.equal(await page.locator('#starterSupplyRows .market-product-action').isVisible(),true);
  await check('market-'+view);
  await page.locator('#wmClose').click();await page.locator('#fixtureOpen').click();
  assert.equal(await page.locator('#worldMarket').getAttribute('data-view'),view);
  await check('market-reopen-'+view);
 }
 await page.locator('#wmCategoryToggle').click();assert.equal(await page.locator('#wmCategoryList').isVisible(),false);
 await check('market-collapsed-categories');
 await page.locator('#wmCategoryToggle').click();assert.equal(await page.locator('#wmCategoryList').isVisible(),true);
 await page.locator('#wmName').fill('ไม้');await page.locator('#wmName').press('Enter');
 assert.equal(await page.evaluate(()=>f.lastBrowse().payload.query),'ไม้');
 await page.evaluate(()=>f.page([f.row(3)]));
 assert.equal(await page.locator('#wmRowsBody .wm-row').count(),1);
 await check('market-query-results');
 // Synthetic room records only: no mutation was actually submitted anywhere.
 assert.equal(await page.evaluate(()=>f.wire.filter(x=>/^(market_buy|market_create|market_cancel|auction_bid|starter_supply_buy|trade_request)$/.test(x.command)).length),0);
}
async function craftCases(page,check){
 await check('craft-initial');
 await page.locator('#ckCategory-all').click();
 assert.equal(await page.locator('#craftRecipeGrid > button').count(),6);
 await page.locator('#craftRecipeNext').click();assert.match(await page.locator('#craftRecipePage').textContent(),/หน้า 2\//);
 await page.locator('#craftRecipePrev').click();assert.match(await page.locator('#craftRecipePage').textContent(),/หน้า 1\//);
 for(const [category,kinds] of [['medicine',['consumable']],['weapons',['mainHand']],['armor',['ring','earring','chest']],['materials',['material','catalyst','consumable','tool']]]){
  await page.locator('#ckCategory-'+category).click();
  const values=await page.evaluate(()=>[...document.getElementById('benchRecipe').options].map(o=>f.items[o.value].kind));
  assert(values.length>0&&values.every(kind=>kinds.includes(kind)),category);
  assert.equal(await page.locator('#ckCategory-'+category).getAttribute('aria-pressed'),'true');
  await check('craft-'+category);
 }
 await page.locator('#ckCategory-all').click();await page.locator('#benchRecipe').selectOption('ring_25');
 assert.equal(await page.locator('#benchOutput').textContent(),'แหวน');
 await page.locator('#benchIngredient').click();assert.equal(await page.locator('#benchRecipe').inputValue(),'mat_ingot_1');
 await page.locator('#benchIngredient').click();assert.equal(await page.locator('#benchRecipe').inputValue(),'mat_charcoal_1');
 await check('craft-nested-ingredient');
 await page.locator('#benchBack').click();assert.equal(await page.locator('#benchRecipe').inputValue(),'mat_ingot_1');
 await page.locator('#benchBack').click();assert.equal(await page.locator('#benchRecipe').inputValue(),'ring_25');
 assert.equal(await page.locator('#benchBack').isVisible(),false);await check('craft-restored-recipe');
 await page.locator('#craftRecipePopupClose').click();
 for(const category of ['food','furniture']){
  await page.locator('#ckCategory-'+category).click();
  assert.equal(await page.locator('#craftComingSoon').isVisible(),true);
  assert.match(await page.locator('#craftComingSoon').textContent(),/เร็วๆ นี้/);
  assert.equal(await page.locator('#craftRecipePane').isVisible(),false);
  assert.equal(await page.locator('#craftDetailPane').isVisible(),false);
  // Also exercise a stale handler, which must not submit the hidden prior recipe.
  await page.evaluate(()=>document.getElementById('benchCraft').onclick());
  assert.equal(await page.evaluate(()=>f.mutations().length),0);
  await check('craft-unsupported-'+category);
 }
 await page.locator('#drawerClose').click();assert.equal(await page.locator('#drawer').isVisible(),false);
 await page.locator('#fixtureOpen').click();
 assert.equal(await page.locator('#craftComingSoon').isVisible(),false);
 assert.equal(await page.locator('#craftRecipePopup').isVisible(),false);
 await check('craft-reopen');
 await page.locator('#ckCategory-weapons').click();
 await page.locator('#craftRecipeGrid > button').first().click();
 assert.equal(await page.locator('#craftRecipeGrid > button[aria-pressed="true"]').count(),1);
 assert.equal(await page.locator('#benchCraft').isEnabled(),true);
 await page.locator('#benchCraft').click();
 await page.evaluate(()=>document.getElementById('benchCraft').onclick());
 assert.equal(await page.evaluate(()=>f.mutations().length),1);
 assert.equal(await page.locator('#benchCraft').isEnabled(),false);
 await page.evaluate(()=>f.callbacks.craft_result({itemId:'blade_25',spentGold:60}));
 assert.equal(await page.locator('#benchCraft').isEnabled(),true);
 await check('craft-mock-result');
}
async function main(){
 fs.mkdirSync(out,{recursive:true});
 const report={revision:process.env.GITHUB_SHA||'local (see checkout HEAD)',cases:[],errors:[],layoutFailures:[],blockedOrigins:[],limits:'Isolated real-DOM fixture with synthetic data and captured sends. Not full-game or logged-in backend QA. Mobile is Chromium emulation.'};
 const scripts={market:fixtureScript('market'),craft:fixtureScript('craft')};
 const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src data:; connect-src 'none'");
  if(url.pathname==='/styles.css'){res.setHeader('content-type','text/css');return res.end(css);}
  if(url.pathname==='/fixture.js'){res.setHeader('content-type','text/javascript; charset=utf-8');return res.end(scripts[new URL(req.headers.referer).pathname.slice(1)]);}
  if(!['/market','/craft'].includes(url.pathname)){res.writeHead(404);return res.end();}
  res.setHeader('content-type','text/html; charset=utf-8');res.end(html());
 });
 let browser;
 try{
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true});
  for(const [width,height] of [[1366,900],[390,844],[320,640]])for(const type of ['market','craft']){
   const context=await browser.newContext({viewport:{width,height},isMobile:width<500,hasTouch:width<500,serviceWorkers:'block'});
   await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin===origin)return route.continue();report.blockedOrigins.push(u.origin);return route.abort();});
   const page=await context.newPage();page.on('pageerror',error=>report.errors.push({type,width,message:error.message}));
   const check=async name=>{
    assert.deepEqual(report.errors,[],'no browser runtime errors');
    const state=await page.evaluate(()=>({viewport:innerWidth,pageWidth:document.documentElement.scrollWidth,drawerWidth:document.getElementById('drawer').clientWidth,drawerScrollWidth:document.getElementById('drawer').scrollWidth,bodyWidth:document.getElementById('drawerBody').clientWidth,bodyScrollWidth:document.getElementById('drawerBody').scrollWidth,leaks:[...document.querySelectorAll('#drawer [hidden]')].filter(e=>getComputedStyle(e).display!=='none').map(e=>e.id)}));
    report.cases.push({name,width,...state});
    const failures=[];
    if(state.pageWidth>state.viewport+1)failures.push('page overflows');
    if(state.drawerScrollWidth>state.drawerWidth+1)failures.push('drawer overflows');
    if(state.bodyScrollWidth>state.bodyWidth+1)failures.push('drawer body overflows');
    if(state.leaks.length)failures.push('hidden CSS leaks');
    if(failures.length){
     const elements=await page.evaluate(()=>{
      const body=document.getElementById('drawerBody'),edge=body.getBoundingClientRect().right;
      return [...body.querySelectorAll('*')].filter(el=>el.getClientRects().length&&el.getBoundingClientRect().right>edge+1).slice(0,30).map(el=>({tag:el.tagName,id:el.id,className:el.className,clientWidth:el.clientWidth,scrollWidth:el.scrollWidth,right:el.getBoundingClientRect().right,bodyRight:edge}));
     });
     report.layoutFailures.push({name,width,failures,...state,elements});
    }
    await page.screenshot({path:path.join(out,width+'-'+name+'.png')});
   };
   try{await page.goto(origin+'/'+type,{waitUntil:'load'});assert.deepEqual(report.errors,[]);if(type==='market')await marketCases(page,check);else await craftCases(page,check);}
   catch(error){
    report.overflowElements=await page.evaluate(()=>{
     const body=document.getElementById('drawerBody'),edge=body.getBoundingClientRect().right;
     return [...body.querySelectorAll('*')].filter(el=>el.getClientRects().length&&el.getBoundingClientRect().right>edge+1).slice(0,30).map(el=>({tag:el.tagName,id:el.id,className:el.className,clientWidth:el.clientWidth,scrollWidth:el.scrollWidth,right:el.getBoundingClientRect().right,bodyRight:edge}));
    }).catch(()=>[]);
    await page.screenshot({path:path.join(out,width+'-'+type+'-failure.png')}).catch(()=>{});throw error;
   }
   finally{await context.close();}
  }
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.blockedOrigins,[],'fixture attempted external traffic');
  assert.deepEqual(report.layoutFailures,[],'browser layout/hidden checks failed (all viewports collected)');
  console.log('PASS release UI browser: '+report.cases.length+' layout/flow checks');
 }catch(error){report.failure=error.stack||String(error);throw error;}finally{fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));if(browser)await browser.close();if(server.listening)await new Promise(resolve=>server.close(resolve));}
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={fixtureScript,marketCases,craftCases};
