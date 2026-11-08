/** Real DOM/CSS/image decode with production item renderers and a real catalog.
 * Isolated UI only. No production accounts, saves, or backend mutations. */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
async function main(){
 const {chromium}=require('playwright'),manifest=JSON.parse(read('assets/items/manifest.json'));
 const output=path.join(root,'item-art-browser-evidence');fs.mkdirSync(output,{recursive:true});
 const catalog=JSON.parse(read('item-art-browser-evidence/catalog.json'));
 const source=read('src/client/ui/030-item-art-and-comparison.js');
 const functions=source.slice(0,source.indexOf('  function wornGearAt('));
 const inventory=read('src/client/ui/052-help-and-inventory.js');
 const loopStart=inventory.indexOf('    for (let i = 0; i < totalSlots; i++) {',inventory.indexOf('  function renderBag()'));
 const loopEnd=inventory.indexOf('    const chosen = inspectingGear',loopStart);assert(loopStart>=0&&loopEnd>loopStart);
 const slotLoop=inventory.slice(loopStart,loopEnd);
 const legacy={ritual_dagger:{name:'มีดหมอ',symbol:'†'},arcane_sword:{name:'กระบี่อาคม',symbol:'⚔'},spirit_staff:{name:'คทาวิญญาณ',symbol:'✴'},shrine_glaive:{name:'ง้าวจันทร์ผู้พิทักษ์',symbol:'⚔'},muay_wraps:{name:'ผ้าคาดเชือก',symbol:'✊'}};
 const canonical=manifest.cells.filter(c=>c.status==='canonical');
 const samples=canonical.map(c=>({key:c.key,id:c.exactIds[0]||Object.keys(catalog).find(id=>catalog[id].family&&c.families.includes(catalog[id].family))||Object.keys(catalog).find(id=>c.families.includes(id.replace(/_\d+$/,'')))}));
 assert(samples.every(s=>s.id));
 const script=`const $=id=>document.getElementById(id),personalItems=${JSON.stringify(catalog)},WEAPON_META=${JSON.stringify(legacy)},POTION_ITEM_ID='health_potion',SHRINE_SHARD='shrine_shard',statNames={};\n${functions}\nconst samples=${JSON.stringify(samples)};\nfor(const s of samples){const card=document.createElement('article');card.dataset.key=s.key;const title=document.createElement('small');title.textContent=s.key;card.append(title);for(const surface of ['bag','worn','candidate','detail']){const host=document.createElement('div');host.className='surface-'+surface;const tile=createItemTile({itemId:s.id,quantity:4,forge:{rank:7}},{equipped:surface==='worn'});if(surface==='candidate')tile.classList.add('equip-candidate-slot');if(surface==='worn')tile.classList.add('wear-tile');host.append(tile);card.append(host);}document.getElementById('gallery').append(card);}\nfunction renderInventorySlots(slots){const totalSlots=2,capacity=slots.length,equipped=0,selectedBagSlot=0,bagCategoryFilter='all',isItemInCategory=()=>true,shardName='เศษตรา';${slotLoop}}\nwindow.fixture={createItemTile,renderItemTile,renderItemPreview,getItemArtKey,personalItems,renderInventorySlots};`;
 const html='<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><style>html,body{overflow:auto!important;position:static!important;background:#152528;color:#eee;height:auto!important}h1{font-size:20px}#gallery{display:grid;grid-template-columns:repeat(auto-fit,minmax(270px,1fr));gap:10px;padding:12px}article{padding:10px;border:1px solid #53615d;display:flex;flex-wrap:wrap;gap:8px}article small{width:100%;font-size:13px}article .bag-slot{width:50px;height:50px;min-height:50px}article .surface-detail .bag-slot{width:72px;height:72px}article .surface-detail .bag-symbol{width:56px;height:56px}#lifecycle{padding:12px}</style></head><body><h1>MONTRA item artwork</h1><div id="lifecycle"><div id="replacement"></div><button class="bag-slot" id="bagSlot0"><span class="bag-symbol"></span><span class="bag-quantity"></span></button><button class="bag-slot" id="bagSlot1"><span class="bag-symbol"></span><span class="bag-quantity"></span></button><div id="preview"></div></div><main id="gallery"></main><script src="/fixture.js"></script></body></html>';
 const report={cases:[],errors:[],limits:'Production item functions/CSS in isolated DOM with current server catalog. Desktop and mobile Chromium emulation; no production-account or physical-device test.'};
 const server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'");
  if(pathname==='/fixture.js'){res.setHeader('Content-Type','text/javascript');res.end(script);return;}
  if(pathname==='/styles.css'){res.setHeader('Content-Type','text/css');res.end(read('styles.css'));return;}
  if(/^\/assets\/items\/[a-zA-Z0-9_-]+\.webp$/.test(pathname)){const file=path.join(root,pathname);if(fs.existsSync(file)){res.setHeader('Content-Type','image/webp');res.end(fs.readFileSync(file));return;}}
  if(pathname==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);return;}
  res.statusCode=404;res.end();
 });
 let browser;
 try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true});
  for(const width of [1366,390,320]){
   const context=await browser.newContext({viewport:{width,height:900},isMobile:width<500,hasTouch:width<500,serviceWorkers:'block'});
   await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
   const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
   await page.goto(origin,{waitUntil:'load'});assert.deepEqual(report.errors,[]);
   const results=await page.locator('#gallery article').evaluateAll(nodes=>Promise.all(nodes.map(async n=>{
    const tiles=[...n.querySelectorAll('.bag-slot')],images=tiles.map(t=>getComputedStyle(t.querySelector('.bag-symbol')).backgroundImage);
    const decoded=await Promise.all(images.map(url=>new Promise(resolve=>{const image=new Image();image.onload=()=>resolve({width:image.naturalWidth,height:image.naturalHeight});image.onerror=()=>resolve(null);image.src=url.slice(5,-2);})));
    return {key:n.dataset.key,images,decoded,labels:tiles.map(t=>t.getAttribute('aria-label')),badges:tiles.map(t=>t.querySelector('.bag-quantity').textContent),bounds:tiles.map(t=>{const a=t.getBoundingClientRect(),b=t.querySelector('.bag-symbol').getBoundingClientRect();return {tileWidth:a.width,iconWidth:b.width,iconHeight:b.height};})};
   })));
   assert.equal(results.length,118);
   for(const result of results){assert(result.decoded.every(x=>x&&x.width===256&&x.height===256),result.key+' decode');assert(result.images.every(x=>x===result.images[0]),result.key+' surfaces match');assert(result.labels.every(x=>x&&x.includes('+7')),result.key+' labels');assert(result.badges.every(x=>x==='+7'));assert(result.bounds.every(x=>x.iconWidth>0&&x.iconHeight>0&&x.iconWidth<=x.tileWidth));}
   const lifecycle=await page.evaluate(()=>{
    const host=document.getElementById('replacement');fixture.renderItemTile('replacement','wp_twins_1');const first=host.firstChild;
    fixture.renderItemTile('replacement','card_possessed');const replaced=first!==host.firstChild&&host.firstChild.dataset.itemArt==='sheet_card_possessed';
    fixture.renderItemTile('replacement',null);const cleared=host.hidden&&host.childElementCount===0;
    const unknown=fixture.createItemTile('unknown_item');
    fixture.renderInventorySlots([{itemId:'wp_twins_1',quantity:1},{itemId:'card_possessed',quantity:3}]);
    const slot=document.getElementById('bagSlot1'),filled=slot.dataset.itemArt==='sheet_card_possessed';
    fixture.renderInventorySlots([{itemId:'wp_twins_1',quantity:1},null]);const emptied=!slot.hasAttribute('data-item-art')&&!slot.hasAttribute('data-item-rarity');
    fixture.renderInventorySlots([null,{itemId:'card_possessed',quantity:3}]);fixture.renderInventorySlots([null]);
    const locked=!slot.hasAttribute('data-item-art')&&!slot.hasAttribute('data-item-rarity')&&slot.querySelector('.bag-symbol').textContent==='·';
    fixture.renderItemPreview('preview','use_mana_1','Example');fixture.renderItemPreview('preview',null);
    return {replaced,cleared,filled,emptied,locked,unknownArt:unknown.getAttribute('data-item-art'),unknownText:unknown.querySelector('.bag-symbol').textContent,previewCleared:document.getElementById('preview').hidden&&document.getElementById('preview').childElementCount===0,overflow:document.documentElement.scrollWidth>innerWidth};
   });
   assert.deepEqual(lifecycle,{replaced:true,cleared:true,filled:true,emptied:true,locked:true,unknownArt:null,unknownText:'◈',previewCleared:true,overflow:false});
   await page.screenshot({path:path.join(output,width+'-item-gallery.png'),fullPage:true,animations:'disabled'});
   report.cases.push({width,artworks:results.length,surfaces:4,decoded:472,lifecycle});await context.close();
  }
  assert.deepEqual(report.errors,[]);console.log('PASS item browser: 118 artworks × 4 surfaces × 3 viewports; replacement, clearing and unknown fallback');
 }catch(error){report.failure=error.stack;throw error;}
 finally{fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
