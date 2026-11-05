const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../../main.js'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'../../styles.css'),'utf8');
const index=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');
const slice=(start,end)=>{const a=source.indexOf(start),b=source.indexOf(end,a);assert(a>=0&&b>a,`missing source boundary: ${start}`);return source.slice(a,b);};
let groups=0;
function test(name,body){try{body();groups++;console.log('PASS '+name);}catch(error){error.message=name+': '+error.message;throw error;}}

// Minimal DOM with real class/text replacement semantics. Reject HTML writes so the
// extracted production renderers cannot accidentally turn catalog text into markup.
function node(tag='div'){
  let text='';const classes=new Set();
  const el={tagName:tag.toUpperCase(),hidden:false,attributes:{},children:[],
    classList:{contains:name=>classes.has(name),toggle(name,on){if(on)classes.add(name);else classes.delete(name);}},
    setAttribute(name,value){this.attributes[name]=String(value);},getAttribute(name){return this.attributes[name];},
    append(...children){this.children.push(...children);},replaceChildren(...children){text='';this.children=[...children];}};
  Object.defineProperties(el,{
    className:{get(){return [...classes].join(' ');},set(value){classes.clear();for(const name of String(value).split(/\s+/).filter(Boolean))classes.add(name);}},
    textContent:{get(){return text+this.children.map(child=>child.textContent).join('');},set(value){text=String(value);this.children=[];}},
    innerHTML:{set(){assert.fail('item renderers must use textContent, not innerHTML');}},
  });
  return el;
}
function fixture(){
  const hosts=new Map(),items={
    blade:{name:'ดาบคู่',kind:'mainHand',path:'blade',stats:{}},
    ring:{name:'แหวน',kind:'ring',stats:{}},ore:{name:'แร่เหล็ก',kind:'material',stats:{}},
    card:{name:'การ์ดมอนสเตอร์',kind:'card',stats:{}},seal:{name:'ตราอาคม',kind:'catalyst',stats:{}},
    medicine:{name:'ยาทดสอบ',kind:'consumable',stats:{}},tool:{name:'เบ็ด',kind:'tool',stats:{}},
  };
  const ctx={document:{createElement:node},$:id=>hosts.get(id),personalItems:items,
    WEAPON_META:{legacy:{name:'กริชเก่า',symbol:'†',bonus:''}},POTION_ITEM_ID:'health_potion',SHRINE_SHARD:'shrine_shard',statLine:()=>'',inventoryState:{slots:[]}};
  vm.createContext(ctx);
  vm.runInContext(slice('  const gearSymbols=','  let inspectingGear=')+slice('  function bagMeta(','  function wornGearAt(')+slice('  function renderEconomyItemPreviews(','  function openEconomy('),ctx);
  const host=id=>{const element=node();hosts.set(id,element);return element;};
  return {ctx,host,hosts,items};
}
function checkTile(tile,{name,symbol,badge='',filled=true,equipped=false}){
  assert.equal(tile.tagName,'DIV');assert.equal(tile.getAttribute('role'),'img');assert.equal(tile.getAttribute('aria-label'),name);
  for(const cls of ['bag-slot','item-slot'])assert(tile.classList.contains(cls),cls);
  assert.equal(tile.classList.contains('bag-filled'),filled);assert.equal(tile.classList.contains('bag-equipped'),equipped);
  assert.equal(tile.getAttribute('tabindex'),undefined);assert.equal(tile.getAttribute('aria-pressed'),undefined);assert.equal(tile.onclick,undefined);
  assert.equal(tile.children.length,2);
  assert.equal(tile.children[0].className,'bag-symbol');assert.equal(tile.children[0].textContent,symbol);
  assert.equal(tile.children[1].className,'bag-quantity');assert.equal(tile.children[1].textContent,badge);
  for(const child of tile.children){assert.equal(child.tagName,'SPAN');assert.equal(child.getAttribute('aria-hidden'),'true');assert.equal(child.children.length,0);}
}

test('item thumbnails reuse inventory classes and catalog symbols without becoming buttons',()=>{
  const {ctx}=fixture();
  for(const [id,name,symbol] of [['blade','ดาบคู่','🗡'],['ring','แหวน','◎'],['ore','แร่เหล็ก','◆'],['card','การ์ดมอนสเตอร์','▣'],['seal','ตราอาคม','✧'],['medicine','ยาทดสอบ','✚'],['legacy','กริชเก่า','†'],['tool','เบ็ด','⚒']]){
    checkTile(ctx.createItemTile(id),{name,symbol});
  }
});

test('quantity, forge rank and equipped state remain accurate and do not mutate source stacks',()=>{
  const {ctx}=fixture(),piece={itemId:'blade',quantity:3,forge:{rank:7}},before=JSON.stringify(piece);
  checkTile(ctx.createItemTile(piece),{name:'ดาบคู่ +7 ×3',symbol:'🗡',badge:'+7'});
  checkTile(ctx.createItemTile(piece,{quantity:2,rank:4,equipped:true}),{name:'ดาบคู่ +4 ×2 · สวมอยู่',symbol:'🗡',badge:'+4',equipped:true});
  checkTile(ctx.createItemTile(piece,{quantity:1,rank:0,equipped:true}),{name:'ดาบคู่ · สวมอยู่',symbol:'🗡',badge:'✓',equipped:true});
  checkTile(ctx.createItemTile('ore',{quantity:99}),{name:'แร่เหล็ก ×99',symbol:'◆',badge:'×99'});
  assert.equal(JSON.stringify(piece),before);
});

test('legacy potion, shrine shard, unknown and empty items have understandable fallback labels',()=>{
  const {ctx}=fixture();
  checkTile(ctx.createItemTile('health_potion'),{name:'ยาเลือดเล็ก',symbol:'🧪'});
  checkTile(ctx.createItemTile({itemId:'shrine_shard',quantity:5}),{name:'เศษตราศาลร้าง ×5',symbol:'◈',badge:'×5'});
  checkTile(ctx.createItemTile('not_in_catalog'),{name:'not_in_catalog',symbol:'◈'});
  checkTile(ctx.createItemTile(null),{name:'ช่องว่าง',symbol:'·',filled:false});
  checkTile(ctx.createItemTile(undefined),{name:'ช่องว่าง',symbol:'·',filled:false});
});

test('catalog names, symbols and preview captions stay inert text',()=>{
  const {ctx,items,host}=fixture(),danger='<img src=x onerror="throw 1"> & <script>throw 2</script>';
  items.unsafe={name:danger,kind:'material',stats:{}};
  ctx.WEAPON_META.unsafe_symbol={name:'ชื่อทดสอบ',symbol:danger};
  checkTile(ctx.createItemTile('unsafe'),{name:danger,symbol:'◆'});
  checkTile(ctx.createItemTile('unsafe_symbol'),{name:'ชื่อทดสอบ',symbol:danger});
  const preview=host('preview');ctx.renderItemPreview('preview','unsafe',danger);
  assert.equal(preview.children[1].children[0].textContent,danger);assert.equal(preview.children[1].children[1].textContent,danger);
  assert.equal(preview.children[1].children[0].children.length,0);assert.equal(preview.children[1].children[1].children.length,0);
});

test('preview refreshes replace old nodes and clearing an item hides and empties its host',()=>{
  const {ctx,host}=fixture(),tile=host('tile'),preview=host('preview');
  ctx.renderItemTile('tile',{itemId:'blade',forge:{rank:2}},{equipped:true});const old=tile.children[0];
  ctx.renderItemTile('tile','ore',{quantity:4});assert.equal(tile.children.length,1);assert.notEqual(tile.children[0],old);assert.equal(tile.hidden,false);
  checkTile(tile.children[0],{name:'แร่เหล็ก ×4',symbol:'◆',badge:'×4'});
  ctx.renderItemTile('tile',null);assert.equal(tile.hidden,true);assert.equal(tile.children.length,0);
  ctx.renderItemPreview('preview','blade','สวมอยู่');assert.equal(preview.children.length,2);assert.equal(preview.children[1].className,'item-preview-info');
  ctx.renderItemPreview('preview','ore');assert.equal(preview.hidden,false);assert.equal(preview.children.length,2);assert.equal(preview.children[1].children.length,1);assert.equal(preview.children[1].children[0].textContent,'แร่เหล็ก');
  ctx.renderItemPreview('preview',undefined);assert.equal(preview.hidden,true);assert.equal(preview.children.length,0);
  assert.doesNotThrow(()=>{ctx.renderItemTile('missing','blade');ctx.renderItemPreview('missing','ore');});
});

test('market, auction and trade selections update quantity previews and clear invalid choices',()=>{
  const {ctx,host}=fixture();ctx.inventoryState.slots=[{itemId:'ore',quantity:9}];
  assert.match(source,/renderItemPreview\("fieldGoalItem",goal\?\.comparison\?\.piece\|\|goal\?\.recipe\|\|goal\?\.bossGear/);
  for(const id of ['marketItem','auctionItem','tradeItem']){
    host(id).value='0';host(id.replace('Item','Amount')).value='2';host(id+'Preview');
  }
  ctx.renderEconomyItemPreviews();
  assert.match(source,/renderItemPreview\("fieldGoalItem",goal\?\.comparison\?\.piece\|\|goal\?\.recipe\|\|goal\?\.bossGear/);
  for(const id of ['marketItem','auctionItem','tradeItem']){
    checkTile(ctx.$(id+'Preview').children[0],{name:'แร่เหล็ก ×2',symbol:'◆',badge:'×2'});
    assert.match(ctx.$(id+'Preview').children[1].textContent,/ในกระเป๋า 9 ชิ้น.*จำนวนที่กรอก 2/);
  }
  ctx.$('marketItem').value='none';ctx.$('auctionItem').value='99';ctx.$('tradeAmount').value='invalid';ctx.renderEconomyItemPreviews();
  for(const id of ['marketItemPreview','auctionItemPreview']){assert.equal(ctx.$(id).hidden,true);assert.equal(ctx.$(id).children.length,0);}
  checkTile(ctx.$('tradeItemPreview').children[0],{name:'แร่เหล็ก ×9',symbol:'◆',badge:'×9'});
  assert.equal(ctx.inventoryState.slots[0].quantity,9);
});

test('inventory and item displays share one 50px size and inherit the same slot skin',()=>{
  const rules=[...css.replace(/\/\*[\s\S]*?\*\//g,'').matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([,selector,body])=>({selector:selector.trim(),body}));
  const rule=selector=>{const found=rules.filter(r=>r.selector===selector);assert(found.length,`missing CSS ${selector}`);return found.map(r=>r.body).join(';');};
  assert.match(rule(':root'),/--item-slot-size\s*:\s*50px\b/);
  for(const prop of ['max-width','max-height'])assert.match(rule('.bag-slot'),new RegExp(`${prop}\\s*:\\s*var\\(--item-slot-size\\)`));
  for(const selector of ['.bag-slot.item-slot','.wear-tile'])for(const prop of ['width','height'])assert.match(rule(selector),new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*var\\(--item-slot-size\\)`));
  for(const selector of ['.bag-grid','.equip-candidate-grid'])assert.match(rule(selector),/grid-template-columns\s*:[^;]*var\(--item-slot-size\)/);
  assert.match(rule('.bag-slot.item-slot'),/flex\s*:\s*0 0 var\(--item-slot-size\)/);assert.match(rule('.bag-slot.item-slot'),/pointer-events\s*:\s*none/);assert.match(rule('.bag-slot.item-slot'),/flex-direction\s*:\s*row/);
  for(const selector of ['.bag-slot.item-slot','.wear-tile','.equip-candidate-slot'])assert.doesNotMatch(rule(selector),/(?:^|;)\s*(?:background|border(?:-radius|-color)?|box-shadow)\s*:/,`${selector} must inherit inventory skin`);
  assert.match(rule('.item-slot-host[hidden],.item-preview[hidden]'),/display\s*:\s*none/);
  assert.match(rule('.craft-ingredients li'),/grid-template-columns\s*:\s*var\(--item-slot-size\)/);
  assert(!rules.some(r=>r.selector==='.craft-ingredients span'),'ingredient text rules must not style thumbnail symbols');
});

test('all item display surfaces use shared thumbnails while interactive inventory slots stay buttons',()=>{
  const ids=['equipWornItem','cpWeaponItem','bagDetailItem','guideTargetItem','guideCurrentItem','guideCardItem','guideNextItem','bagReturnItem','benchOutputItem','craftShrineOutput','craftShrineInput','socketItemPreview','forgeStockItem','forgeCopyItem','forgeDonorItem','forgeSealItem','forgeItemSymbol','tradeOwnItem','tradeOtherItem','huntItemPreview','fieldGoalItem','fieldCurrentItem'];
  for(const id of ids){assert((source+index).includes(`id="${id}"`),`missing host ${id}`);assert.match(source,new RegExp(`renderItem(?:Tile|Preview)\\("${id}"\\s*,`),`missing shared renderer ${id}`);}
  assert.match(source,/renderItemPreview\("fieldGoalItem",goal\?\.comparison\?\.piece\|\|goal\?\.recipe\|\|goal\?\.bossGear/);
  for(const id of ['marketItem','auctionItem','tradeItem'])assert(source.includes(`id="${id}Preview"`),`missing selected preview ${id}`);
  assert.match(slice('  function renderWorkbench(','  function renderCraft('),/row\.append\(createItemTile\(part\.item,\{quantity:part\.qty\}\),name,count\)/);
  const central=slice('  function renderCentralMarket(','  function renderEconomy()');
  assert.match(central,/row\.append\(createItemTile\(entry\.item\),content\)/);assert.match(central,/row\.append\(createItemTile\(\{itemId:item\.item,quantity:1\}\),info,button\)/);
  assert.match(slice('  function renderEconomy()','  function renderEconomyItemPreviews('),/row\.append\(createItemTile\(listing\.item\),details,action\)/);
  assert.match(source,/<button type="button" class="bag-slot bag-filled equip-candidate-slot/);
  assert.match(source,/class="bag-slot wear-tile"/);assert.match(source,/<button type="button" class="bag-slot" id="bagSlot/);
  assert.match(source,/slot\.querySelector\("\.bag-symbol"\)\.textContent = itemSymbol\(item\?\.itemId\)/);
  assert.doesNotMatch(slice('  function createItemTile(','  function wornGearAt('),/economySend|addEventListener|\.onclick\s*=/,'display helpers must never send or bind mutations');
});

test('forge hidden materials and centered modal controls keep the shared theme',()=>{
  assert.match(css,/\.forge-material \.item-preview\[hidden\]\s*\{\s*display\s*:\s*none\s*;/);
  for(const control of ['.primary','.secondary','select']){
    const selector='.drawer-body '+control+',.item-detail-modal '+control+' {';
    assert(css.includes(selector),`shared control theme ${control}`);
  }
});

console.log(`PASS shared item displays: ${groups} focused regression groups`);
