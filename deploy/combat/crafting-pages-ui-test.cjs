const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../../main.js'),'utf8');
const index=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');
const slice=(start,end)=>{const a=source.indexOf(start),b=source.indexOf(end,a);assert(a>=0&&b>a,`missing source boundary: ${start}`);return source.slice(a,b);};
const line=needle=>{const matches=source.split('\n').filter(s=>s.includes(needle));assert.equal(matches.length,1,`unique route: ${needle}`);return matches[0];};
const plain=value=>JSON.parse(JSON.stringify(value));
let assertions=0;
function test(name,body){try{body();assertions++;console.log('PASS '+name);}catch(error){error.message=name+': '+error.message;throw error;}}
// Model native select behavior, including invalid assignments and automatic first-option selection.
// This is deliberately stricter than a plain {value:''} stub: an impossible recipe ID cannot persist.
function node(tag='div'){
  let value='';const classes=new Set();
  const el={tagName:tag.toUpperCase(),textContent:'',hidden:false,disabled:false,dataset:{},attributes:{},children:[],open:false,
    classList:{toggle(k,on){if(on)classes.add(k);else classes.delete(k);},contains:k=>classes.has(k)},
    setAttribute(k,v){this.attributes[k]=String(v);},getAttribute(k){return this.attributes[k];},
    replaceChildren(...children){this.children=[];value='';this.append(...children);},
    append(...children){for(const child of children)this.appendChild(child);},
    appendChild(child){this.children.push(child);if(this.tagName==='SELECT'&&this.children.length===1)value=String(child.value);return child;},
    showModal(){this.open=true;},close(){this.open=false;},focus(){},scrollIntoView(){this.scrolled=true;},addEventListener(){},querySelectorAll(){return [];},click(){if(!this.disabled)this.onclick?.();}};
  Object.defineProperties(el,{className:{get(){return [...classes].join(' ');},set(next){classes.clear();for(const name of String(next).split(/\s+/).filter(Boolean))classes.add(name);}},options:{get(){return this.children;}},value:{get(){return value;},set(next){next=String(next);value=this.tagName==='SELECT'&&!this.children.some(c=>String(c.value)===next)?'':next;}}});
  return el;
}
function fixture(){
  const elements=new Map(),wire=[],toasts=[],callbacks={},timers=new Map();let timerId=0,request=0;
  const $=id=>elements.get(id)||null;
  const def=(name,kind,level,extra={})=>({name,kind,level,path:'all',stats:{},recipe:[{item:'mat_ingot_1',qty:2}],...extra});
  const items={
    blade_1:def('ดาบแรก','mainHand',1,{path:'blade',family:'sword'}),
    blade_25:def('ดาบคู่','mainHand',25,{path:'blade',family:'sword',craftGold:60}),
    blade_50:def('ดาบสูง','mainHand',50,{path:'blade',family:'sword'}),
    seer_25:def('ไม้เท้า','mainHand',25,{path:'seer',family:'sword'}),
    ring_25:def('แหวน','ring',25,{recommended:['blade'],copyLimit:2}),
    ear_25:def('ตุ้มหู','earring',25,{recommended:['seer']}),
    chest_25:def('เสื้อ','chest',25,{recommended:['blade']}),
    boss_1:def('แหวนบอสต้น','ring',1,{sourceBoss:'guardian',family:'boss_ring'}),
    boss_50:def('แหวนบอสสูง','ring',50,{sourceBoss:'guardian',family:'boss_ring'}),
    potion_1:def('ยาทดสอบ','consumable',1,{recipe:[{item:'mat_raw_wood_1',qty:1}]}),
    tool_1:def('เครื่องมือ','tool',1),seal_1:def('ตราอาคม','catalyst',1),
    mat_charcoal_1:def('ถ่าน','material',1,{station:'kiln',family:'mat_charcoal',craftGold:0,recipe:[{item:'mat_raw_wood_1',qty:2}]}),
    mat_ingot_1:def('แท่งเหล็ก','material',1,{station:'kiln',family:'mat_ingot',craftGold:0,recipe:[{item:'mat_metal_1',qty:2},{item:'mat_charcoal_1',qty:1}]}),
    mat_raw_wood_1:{name:'ไม้ดิบ',kind:'material'},mat_metal_1:{name:'แร่เหล็ก',kind:'material'},
    shrine_shard:{name:'เศษตรา',kind:'material'},shrine_glaive:{name:'ง้าวจันทร์ผู้พิทักษ์',kind:'mainHand'},
  };
  const slots=[{itemId:'mat_ingot_1',quantity:2},{itemId:'mat_charcoal_1',quantity:3},{itemId:'mat_metal_1',quantity:4},{itemId:'mat_raw_wood_1',quantity:5},{itemId:'shrine_shard',quantity:6},...Array(7).fill(null)];
  const shrine={id:'shrine_glaive_recipe',ingredient:'shrine_shard',quantity:5,gold:80,itemLevel:25,output:'shrine_glaive'};
  const player={alive:true,level:25,pathId:'blade',persistent:true};
  const ctx={$,Option:class{constructor(text,value){this.text=text;this.value=String(value);}},document:{createElement:tag=>node(tag)},
    mode:'live',drawerActive:null,personalItems:items,cardDrill:{gold:10},catalogRevision:1,workbenchGold:40,refineInput:2,
    inventoryState:{version:1,slots,equippedWeaponSlot:null,equipment:{},forgeCopies:{}},economyGold:1000,economyPending:false,economyTimer:null,itemUsePending:false,
    centralMarketVersion:0,INVENTORY_SLOTS:12,POTION_ITEM_ID:'small_potion',SHRINE_SHARD:'shrine_shard',WEAPON_META:{},
    bodyLabels:{chest:'อก',leftRing:'แหวนซ้าย',rightRing:'แหวนขวา',leftEar:'ตุ้มหูซ้าย',rightEar:'ตุ้มหูขวา'},
    bagMeta:id=>items[id],statLine:()=>'',ownServerCharacter:()=>player,currentBagSlots:()=>ctx.inventoryState?.slots,
    currentEquippedWeaponSlot:()=>ctx.inventoryState?.equippedWeaponSlot,
    itemHuntCount:id=>(ctx.inventoryState?.slots||[]).reduce((n,s)=>n+(s?.itemId===id?s.quantity:0),0)+Object.values(ctx.inventoryState?.equipment||{}).filter(x=>x===id).length,
    itemHuntSource:()=>({open:true}),bindItemHuntButton:(button,id,quantity)=>{button.hidden=!id;button.target=id;button.quantity=quantity;},
    refreshOpenFieldQuest(){assert.notEqual(ctx.drawerActive,'quest','quest details use their dedicated receipt fixture');},
    renderEconomy(){ctx.economyRenders++;},economyRenders:0,economyRequestId:()=>`request_${++request}`,
    toast:message=>toasts.push(message),setTimeout:fn=>{timers.set(++timerId,fn);return timerId;},clearTimeout:id=>timers.delete(id),
    openDrawer(name,title,html){ctx.drawerActive=name;ctx.title=title;ctx.html=html;elements.clear();
      for(const match of html.matchAll(/<([a-z][a-z0-9]*)\b([^>]*\bid="([^"]+)"[^>]*)>/g)){const el=node(match[1]);el.hidden=/\bhidden\b/.test(match[2]);elements.set(match[3],el);}
      for(const match of html.matchAll(/<select\b[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g))for(const o of match[2].matchAll(/<option value="([^"]*)">([^<]*)<\/option>/g))$(match[1]).appendChild(new ctx.Option(o[2],o[1]));
    },
    closeItemDetailModal(){},openBag(){ctx.drawerActive='bag';elements.clear();},openForgePage(){ctx.drawerActive='forge';},fishingPending:false,
  };
  ctx.room={state:{economyAvailable:true,craftRecipe:JSON.stringify(shrine)},send:(command,payload)=>wire.push({command,payload:plain(payload)})};
  ctx.joined=ctx.room;ctx.joined.onMessage=(name,handler)=>{callbacks[name]=handler;};
  vm.createContext(ctx);
  vm.runInContext(slice('  let lootInventoryCounts =', '  let demoWeaponSlot ='),ctx);
  const run=code=>vm.runInContext(code,ctx);
  run(slice('  const gearSymbols=','  let inspectingGear=')+
    slice('  function bagMeta(','  function wornGearAt(')+
    slice('  function wearPositions(','  function gearDestination(')+
    slice('  const benchTrail=[];','  function gearStamp(')+
    slice('  let craftBatchMax=','  function openForgePage(')+
    slice('  function renderBag()','  const gearCoreSkills=')+
    slice('  let economyPendingRequest=','  function economyItemName(')+
    slice('  function economySend(','  function economyRequestId()'));
  run(slice('      joined.onMessage("economy_state",','      joined.onMessage("market_state",')+
    slice('      joined.onMessage("craft_queue",','      joined.onMessage("card_socket_result",')+
    slice('      joined.onMessage("inventory_state",','      joined.onMessage("weapon_equipped",')+
    slice('      joined.onMessage("item_catalog_page",','      joined.onMessage("gear_guides",')+
    slice('      joined.onMessage("economy_error",','      joined.onMessage("trade_update",'));
  const choose=(group,id,position=null)=>{ctx.targetGroup=group;ctx.targetId=id;ctx.targetPosition=position;run('selectBenchRecipe(targetGroup,String(personalItems[targetId].level||1),targetId,targetPosition)');};
  const change=(id,value)=>{$(id).value=value;$(id).onchange();};
  const ids=()=>Array.from($('benchRecipe').options,o=>o.value);
  const mutations=()=>wire.filter(x=>x.command==='craft_weapon');
  const payload=(changes={})=>({...plain(ctx.inventoryState),...changes,version:1});
  return {ctx,run,$,elements,wire,callbacks,timers,items,slots,player,shrine,choose,change,ids,mutations,payload,toasts};
}

if(require.main===module){
test('supported server previews batch requirements and acknowledges a queued craft',()=>{
  const f=fixture();
  f.run('openCraftingPage()');
  f.callbacks.economy_state({gold:1000,craftBatchMax:10,craftQueueMax:3});
  assert(f.wire.some(msg=>msg.command==='get_craft_queue'));
  const now=Date.now();
  f.callbacks.craft_queue({serverNow:now,jobs:[]});
  f.choose('all','mat_charcoal_1');
  f.$('benchQuantity').value='2';
  f.$('benchQuantity').oninput();
  assert.match(f.$('benchIngredients').children[0].children[2].textContent,/5 \/ 4/);
  f.$('benchQueue').click();
  const order=f.wire.find(msg=>msg.command==='craft_enqueue');
  assert.equal(order.payload.quantity,2);
  f.callbacks.craft_queue({serverNow:now,requestId:order.payload.requestId,jobs:[
    {id:'job-ready',recipeId:'mat_charcoal_1',quantity:2,startsAt:now-12000,readyAt:now-1000},
  ]});
  assert.equal(f.ctx.economyPending,false);
  const claim=f.$('craftQueueJobs').children[0].children[1];
  assert.equal(claim.disabled,false);claim.click();
  assert.equal(f.wire.find(msg=>msg.command==='craft_claim').payload.jobId,'job-ready');
});

test('smith routes to dedicated crafting page and back, with a fresh economy read',()=>{
  const f=fixture();f.run('openSmith()');f.$('smithCraft').click();
  assert.equal(f.ctx.drawerActive,'crafting');assert.match(f.ctx.title,/สร้างของ/);assert.equal(f.$('personalBench').hidden,false);
  assert.equal(f.wire.at(-1).command,'get_economy');assert.equal(f.$('benchGroup').value,'role');assert.equal(f.$('craftGold').textContent,'1,000 ทอง');
  f.$('craftHome').click();assert.equal(f.ctx.drawerActive,'smith');f.$('smithCraft').click();f.$('craftBag').click();assert.equal(f.ctx.drawerActive,'bag');
});

test('crafting output, materials and shrine recipes use accessible inventory thumbnails',()=>{
  const f=fixture();f.choose('all','blade_25');
  const check=(tile,name,symbol,badge='')=>{
    assert.equal(tile.tagName,'DIV');assert.equal(tile.getAttribute('role'),'img');assert.equal(tile.getAttribute('aria-label'),name);
    for(const cls of ['bag-slot','item-slot','bag-filled'])assert(tile.classList.contains(cls),cls);
    assert.equal(tile.onclick,undefined);assert.equal(tile.getAttribute('tabindex'),undefined);
    assert.equal(tile.children[0].className,'bag-symbol');assert.equal(tile.children[0].textContent,symbol);assert.equal(tile.children[0].getAttribute('aria-hidden'),'true');
    assert.equal(tile.children[1].className,'bag-quantity');assert.equal(tile.children[1].textContent,badge);assert.equal(tile.children[1].getAttribute('aria-hidden'),'true');
  };
  check(f.$('benchOutputItem').children[0],'ดาบคู่','🗡');assert.equal(f.$('benchOutput').textContent,'ดาบคู่');
  let rows=f.$('benchIngredients').children;assert.equal(rows.length,1);
  check(rows[0].children[0].children[0],'แท่งเหล็ก ×2','◆','×2');assert.equal(rows[0].children[1].textContent,'แท่งเหล็ก');assert.equal(rows[0].children[2].textContent,'2 / 2');
  check(f.$('craftShrineOutput').children[0],'ง้าวจันทร์ผู้พิทักษ์','◈');
  check(f.$('craftShrineInput').children[0],'เศษตรา ×5','◆','×5');
  f.choose('kiln','mat_ingot_1');check(f.$('benchOutputItem').children[0],'แท่งเหล็ก','◆');
  rows=f.$('benchIngredients').children;assert.equal(rows.length,2);check(rows[0].children[0].children[0],'แร่เหล็ก ×2','◆','×2');check(rows[1].children[0].children[0],'ถ่าน','◆');
  f.run('renderBag();renderBag();');assert.equal(f.$('benchOutputItem').children.length,1);assert.equal(f.$('benchIngredients').children.length,2,'refresh replaces thumbnails rather than accumulating them');
  for(const item of Object.values(f.items))delete item.recipe;
  f.ctx.catalogRevision++;f.run('renderBag()');assert.equal(f.$('benchOutputItem').hidden,true);assert.equal(f.$('benchOutputItem').children.length,0);assert.equal(f.$('benchIngredients').children.length,0);
  assert.equal(f.mutations().length,0,'display updates never send crafting mutations');
});

test('personal recipe sends exactly recipeId/requestId, locks double clicks and reports server result',()=>{
  const f=fixture();f.choose('all','blade_25');assert.equal(f.$('benchCraft').disabled,false);assert.equal(f.$('benchCost').textContent,'60 ทอง');
  f.$('benchCraft').onclick();assert.deepEqual(f.mutations(),[{command:'craft_weapon',payload:{recipeId:'blade_25',requestId:'request_1'}}]);
  assert.equal(f.ctx.economyPending,true);assert.equal(f.$('benchCraft').disabled,true);assert.match(f.$('craftActionStatus').textContent,/กำลังรอผล/);
  f.$('benchCraft').onclick();f.$('craftGlaive').onclick();assert.equal(f.mutations().length,1);
  f.callbacks.craft_result({itemId:'blade_25',spentGold:60});assert.equal(f.ctx.economyPending,false);assert.match(f.$('craftActionStatus').textContent,/ดาบคู่.*60/);
  f.$('benchCraft').onclick();assert.equal(f.mutations()[1].payload.requestId,'request_2');assert(!f.$('craftActionStatus').textContent.includes('สำเร็จ'));
});

test('live gold and inventory events refresh counts, costs and insufficient-resource guards',()=>{
  const f=fixture();f.choose('all','blade_25');f.callbacks.economy_state({gold:59});assert.equal(f.$('benchCraft').disabled,true);assert.equal(f.$('craftGold').textContent,'59 ทอง');
  f.$('benchCraft').onclick();assert.equal(f.mutations().length,0);f.callbacks.economy_state({gold:60});assert.equal(f.$('benchCraft').disabled,false);
  const changed=f.payload();changed.slots[0].quantity=1;f.callbacks.inventory_state(changed);assert.equal(f.$('benchCraft').disabled,true);
  const row=f.$('benchIngredients').children[0];assert.equal(row.children[2].textContent,'1 / 2');assert.equal(row.children[0].children[0].children[1].textContent,'×2','thumbnail shows required quantity, not current stock');assert.equal(row.classList.contains('missing'),true);
  f.ctx.inventoryState.forgeCopies.mat_ingot_1=99;f.ctx.inventoryState.equipment.leftRing='mat_ingot_1';f.run('renderBag()');
  assert.equal(f.$('benchCraft').disabled,true,'only carried material stacks satisfy crafting ingredients');
  changed.slots[0].quantity=2;f.callbacks.inventory_state(changed);assert.equal(f.$('benchCraft').disabled,false);
  f.ctx.economyGold=null;f.run('renderBag()');f.$('benchCraft').onclick();assert.equal(f.mutations().length,0);assert.equal(f.$('benchCraft').disabled,true);
});

test('submission rechecks gold, material quantity, level and life state before sending',()=>{
  for(const [name,mutate] of [
    ['gold',f=>f.ctx.economyGold=0],['materials',f=>f.ctx.inventoryState.slots[0].quantity=1],
    ['level',f=>f.player.level=1],['death',f=>f.player.alive=false],['inventory loading',f=>f.ctx.inventoryState=null],
  ]){
    const f=fixture();f.choose('all','blade_25');assert.equal(f.$('benchCraft').disabled,false);mutate(f);f.$('benchCraft').onclick();
    assert.equal(f.mutations().length,0,name);assert.equal(f.$('benchCraft').disabled,true,name);
    if(name==='death')assert.match(f.$('craftActionStatus').textContent,/เกิดใหม่/);
  }
});

test('role/all/material/kiln/boss filters preserve recipe families and explicit level choices',()=>{
  const f=fixture();f.run('openCraftingPage()');let ids=f.ids();
  assert(ids.includes('blade_25'));assert(!ids.includes('blade_1'));assert(!ids.includes('blade_50'));assert(!ids.includes('seer_25'));assert(!ids.includes('ear_25'));
  f.change('benchGroup','all');ids=f.ids();assert(ids.includes('blade_25'));assert(ids.includes('seer_25'));assert(ids.includes('ear_25'));
  f.change('benchGroup','materials');assert(f.ids().length>=5);assert(f.ids().every(id=>['material','catalyst','consumable','tool'].includes(f.items[id].kind)));
  f.change('benchGroup','kiln');assert.deepEqual(f.ids().sort(),['mat_charcoal_1','mat_ingot_1']);
  f.change('benchGroup','boss');assert.deepEqual(f.ids(),['boss_50']);assert.equal(f.$('benchCraft').disabled,true,'boss auto lists higher-tier boss recipe but cannot craft underlevel');
  f.change('benchLevel','1');assert.deepEqual(f.ids(),['boss_1']);
  f.change('benchGroup','all');f.change('benchLevel','current');assert(f.ids().every(id=>f.items[id].level===25));
  f.change('benchLevel','50');assert(f.ids().includes('blade_50'));assert.equal(f.$('benchCraft').disabled,true);
  f.change('benchLevel','auto');f.player.level=50;f.run('renderBag()');assert(f.ids().includes('blade_50'));assert(!f.ids().includes('blade_25'));
});

test('both accessory sides and ordinary body positions filter correctly; supply filters ignore body position',()=>{
  for(const [position,kind] of [['leftRing','ring'],['rightRing','ring'],['leftEar','earring'],['rightEar','earring'],['chest','chest'],['mainHand','mainHand']]){
    const f=fixture();f.ctx.position=position;f.run('openCraftingPage(position)');f.change('benchGroup','all');
    assert(f.ids().length>0,position);assert(f.ids().every(id=>f.items[id].kind===kind),position);
    f.change('benchGroup','kiln');assert.deepEqual(f.ids().sort(),['mat_charcoal_1','mat_ingot_1']);
    f.change('benchGroup','materials');assert(f.ids().includes('potion_1'));f.change('benchGroup','boss');assert(f.ids().includes('boss_50'));
  }
});

test('nested ingredient trail restores exact recipe, level, group and body side; kiln accepts zero gold',()=>{
  const f=fixture();f.choose('all','ring_25','rightRing');assert.equal(f.$('benchRecipe').value,'ring_25');
  f.$('benchIngredient').click();assert.equal(f.$('benchRecipe').value,'mat_ingot_1');assert.equal(f.$('benchGroup').value,'kiln');assert.equal(f.$('benchCost').textContent,'0 ทอง');
  f.$('benchIngredient').click();assert.equal(f.$('benchRecipe').value,'mat_charcoal_1');assert.equal(f.$('benchCraft').textContent,'เผาถ่าน');
  f.ctx.economyGold=0;f.run('renderBag()');assert.equal(f.$('benchCraft').disabled,false);f.$('benchCraft').click();assert.equal(f.mutations().at(-1).payload.recipeId,'mat_charcoal_1');
  f.callbacks.craft_result({itemId:'mat_charcoal_1',spentGold:0});assert.match(f.$('craftActionStatus').textContent,/เผาถ่านสำเร็จ/);
  f.$('benchBack').click();assert.equal(f.$('benchRecipe').value,'mat_ingot_1');assert.equal(f.$('benchCraft').textContent,'หลอมเหล็ก');
  f.$('benchBack').click();assert.equal(f.$('benchRecipe').value,'ring_25');assert.equal(f.$('benchGroup').value,'all');assert.equal(f.$('benchLevel').value,'25');assert.equal(f.run('craftPagePosition'),'rightRing');
  assert.equal(f.$('benchBack').hidden,true);assert(f.ids().every(id=>f.items[id].kind==='ring'));
  f.$('benchIngredient').click();f.change('benchGroup','materials');assert.equal(f.$('benchBack').hidden,true,'manual filtering clears obsolete back trail');
});

test('catalog and connection guards hide stale mutation panels and defer requested recipes until catalog arrives',()=>{
  for(const mutate of [f=>f.ctx.mode='demo',f=>f.ctx.room.state.economyAvailable=false,f=>f.player.persistent=false,f=>f.ctx.room=null]){
    const f=fixture();f.choose('all','blade_25');mutate(f);f.run('renderBag()');assert.equal(f.$('personalBench').hidden,true);assert.equal(f.$('craftPanel').hidden,true);
    f.$('benchCraft').onclick();f.$('craftGlaive').onclick();assert.equal(f.mutations().length,0);
  }
  const f=fixture();f.ctx.cardDrill=null;f.choose('all','ring_25','leftRing');assert.equal(f.$('personalBench').hidden,true);assert.match(f.$('craftPageStatus').textContent,/โหลดสูตร/);
  f.$('benchCraft').onclick();assert.equal(f.mutations().length,0);
  f.callbacks.inventory_state(f.payload({catalogReady:true,cardDrill:{gold:10},workbenchGold:41}));assert.equal(f.$('personalBench').hidden,false);assert.equal(f.$('benchRecipe').value,'ring_25');assert.equal(f.$('benchCost').textContent,'41 ทอง');assert.equal(f.$('craftRecipePopup').open,true,'deferred explicit choice opens its popup after catalog arrives');
  f.ctx.room.state.craftRecipe='';f.run('renderBag()');assert.equal(f.$('craftPanel').hidden,true);f.$('craftGlaive').onclick();assert.equal(f.mutations().length,0);
});

test('empty and changing catalogs invalidate choices, refresh costs, and never submit unknown recipes',()=>{
  const f=fixture();f.choose('all','blade_25');
  f.callbacks.item_catalog_page({items:{blade_25:{...f.items.blade_25,craftGold:95},blade_new:{...f.items.blade_25,family:'new',name:'สูตรใหม่'}}});
  f.run('renderBag()');assert.equal(f.$('benchRecipe').value,'blade_25');assert.equal(f.$('benchCost').textContent,'95 ทอง');assert(f.ids().includes('blade_new'));
  f.$('benchRecipe').value='unknown_recipe';f.$('benchCraft').onclick();assert.equal(f.mutations().length,0);assert.equal(f.$('benchCraft').disabled,true);
  for(const item of Object.values(f.items))delete item.recipe;
  f.ctx.catalogRevision++;f.run('renderBag()');assert.deepEqual(f.ids(),[]);assert.equal(f.$('benchCraft').disabled,true);assert.match(f.$('benchInfo').textContent,/ไม่มีสูตร/);
  f.$('benchCraft').onclick();assert.equal(f.mutations().length,0);
});

test('missing-material tracker follows the selected ingredient and refreshes without rebuilding the drawer',()=>{
  const f=fixture();f.choose('kiln','mat_ingot_1');f.ctx.inventoryState.slots[1]=null;f.ctx.inventoryState.slots[2]=null;f.run('renderBag()');
  assert.equal(f.$('benchHuntChoice').hidden,false);assert.deepEqual(Array.from(f.$('benchHuntChoice').options,o=>o.value),['mat_metal_1','mat_charcoal_1']);
  assert.equal(f.$('benchTrackSupply').target,'mat_metal_1');assert.equal(f.$('benchTrackSupply').quantity,2);
  f.change('benchHuntChoice','mat_charcoal_1');assert.equal(f.$('benchTrackSupply').target,'mat_charcoal_1');assert.equal(f.$('benchTrackSupply').quantity,1);
  const update=f.payload();update.slots[1]={itemId:'mat_charcoal_1',quantity:1};f.callbacks.inventory_state(update);
  assert.equal(f.$('benchHuntChoice').hidden,true);assert.equal(f.$('benchTrackSupply').target,'mat_metal_1');assert.equal(f.$('benchCraft').disabled,true);
});

test('navigation and reopening cannot replay a stale callback or escape a shared pending mutation',()=>{
  const f=fixture();f.choose('all','blade_25');const staleClick=f.$('benchCraft').onclick;f.$('craftHome').click();staleClick();assert.equal(f.mutations().length,0);
  f.$('smithCraft').click();f.choose('all','blade_25');f.$('benchCraft').click();f.run('openCraftingPage()');f.$('benchCraft').onclick();f.$('craftGlaive').onclick();
  assert.equal(f.mutations().length,1);assert.equal(f.$('benchCraft').disabled,true);assert.equal(f.$('craftGlaive').disabled,true);
  f.$('craftBag').click();assert.doesNotThrow(()=>f.run('renderWorkbench(currentBagSlots());renderCraft(currentBagSlots());renderBag();'));
  f.callbacks.craft_result({itemId:'blade_25',spentGold:60});assert.equal(f.ctx.drawerActive,'bag');assert.equal(f.ctx.economyPending,false);
});

test('legacy shrine recipe keeps its exact request and shard/gold/death/stock guards',()=>{
  const f=fixture();f.run('openCraftingPage()');assert.equal(f.$('craftPanel').hidden,false);assert.equal(f.$('craftGlaive').disabled,false);
  f.$('craftGlaive').onclick();assert.deepEqual(f.mutations()[0].payload,{recipeId:'shrine_glaive_recipe',requestId:'request_1'});
  f.callbacks.craft_result({itemId:'shrine_glaive',spentGold:80});assert.match(f.$('craftActionStatus').textContent,/ง้าวจันทร์ผู้พิทักษ์/);
  for(const mutate of [g=>g.ctx.economyGold=79,g=>g.ctx.inventoryState.slots[4].quantity=4,g=>g.player.alive=false,g=>g.ctx.inventoryState.forgeCopies.shrine_glaive=99]){
    const g=fixture();g.run('openCraftingPage()');mutate(g);g.$('craftGlaive').onclick();assert.equal(g.$('craftGlaive').disabled,true);assert.equal(g.mutations().length,0);
  }
});

test('duplicate gear and paired copies honor carried/worn quantities and full forge stock',()=>{
  const f=fixture();f.choose('all','ring_25','leftRing');f.ctx.inventoryState.equipment={leftRing:'ring_25',rightRing:'ring_25'};f.ctx.inventoryState.forgeCopies.ring_25=98;
  f.run('renderBag()');assert.equal(f.$('benchCraft').disabled,false);assert.match(f.$('benchInfo').textContent,/คราฟต์ชิ้นซ้ำเข้าคลังช่าง/);assert.match(f.$('benchOwned').textContent,/มีแล้ว 2 ชิ้น/);
  f.ctx.inventoryState.forgeCopies.ring_25=99;f.run('renderBag()');assert.equal(f.$('benchCraft').disabled,true);f.$('benchCraft').onclick();assert.equal(f.mutations().length,0);
  delete f.ctx.inventoryState.equipment.rightRing;f.run('renderBag()');assert.equal(f.$('benchCraft').disabled,false,'missing physical copy can still be created with a full copy bank');
  f.callbacks.craft_result({itemId:'ring_25',banked:true,spentGold:40});assert.match(f.$('craftActionStatus').textContent,/เข้าคลังช่าง/);
});

test('economy failure/timeout refresh the crafting page without replaying a mutation',()=>{
  const f=fixture();f.choose('all','blade_25');f.$('benchCraft').onclick();f.callbacks.economy_error({reason:'craft_missing_material'});
  assert.equal(f.ctx.economyPending,false);assert.equal(f.$('benchCraft').disabled,false);assert.equal(f.toasts.at(-1),'วัตถุดิบไม่ครบ');
  f.$('benchCraft').onclick();const before=f.mutations().length;const timeout=[...f.timers.values()].at(-1);timeout();
  assert.equal(f.ctx.economyPending,false);assert.equal(f.$('benchCraft').disabled,false);assert.equal(f.mutations().length,before);assert.deepEqual(f.wire.slice(-2).map(x=>x.command),['get_economy','market_list']);
  f.ctx.room.send=()=>{throw Error('offline');};f.$('benchCraft').onclick();assert.equal(f.ctx.economyPending,false);assert.equal(f.$('benchCraft').disabled,false);assert.equal(f.toasts.at(-1),'ส่งคำขอไม่สำเร็จ');
});

test('stale room events cannot clear pending state, change gold, replace inventory or leak success',()=>{
  const f=fixture();f.choose('all','ring_25','rightRing');f.$('benchIngredient').click();
  const inventory=f.ctx.inventoryState;f.ctx.room={state:{economyAvailable:true,craftRecipe:''},send(){}};f.ctx.economyPending=true;
  f.callbacks.economy_state({gold:1});f.callbacks.inventory_state(f.payload({slots:Array(12).fill(null)}));f.callbacks.craft_result({itemId:'blade_25',spentGold:60});f.callbacks.economy_error({reason:'insufficient_gold'});
  assert.equal(f.ctx.economyPending,true);assert.equal(f.ctx.economyGold,1000);assert.equal(f.ctx.inventoryState,inventory);assert.equal(f.toasts.length,0);
  f.run('renderBag()');assert.equal(f.run('craftPagePosition'),null);assert.equal(f.run('benchTrail.length'),0);assert.equal(f.$('benchBack').hidden,true);
  f.ctx.economyPending=false;f.run('renderBag()');assert.equal(f.$('craftActionStatus').textContent,'');
});

test('item guide and station recipe entry routes open the dedicated page directly',()=>{
  const f=fixture();
  // Guide button: preserve the exact paired-body destination in the route.
  Object.assign(f.ctx,{copy:null,dest:'leftRing',item:f.items.ring_25,entry:{id:'ring_25',position:'leftRing'}});f.elements.set('guideOpen',node('button'));
  f.run(slice('    const button=$("guideOpen");','  }\n  const benchTrail=[];'));f.$('guideOpen').click();assert.equal(f.$('benchRecipe').value,'ring_25');assert.equal(f.run('craftPagePosition'),'leftRing');
  // Bag raw wood / metal / charcoal shortcuts all enter the matching kiln recipe.
  for(const [itemId,target] of [['mat_raw_wood_1','mat_charcoal_1'],['mat_metal_1','mat_ingot_1'],['mat_charcoal_1','mat_ingot_1']]){
    f.ctx.drawerActive='bag';f.ctx.chosen={itemId};f.elements.set('bagKiln',node('button'));
    f.run('{'+slice('    const kiln=$("bagKiln"),target=','    if(!refine.hidden){')+'}');f.$('bagKiln').click();assert.equal(f.ctx.drawerActive,'crafting');assert.equal(f.$('benchRecipe').value,target);
  }
  // Forge copies: both ordinary recipes and the legacy shrine route skip the old bag panel.
  for(const itemId of ['blade_25','shrine_glaive']){
    f.ctx.drawerActive='forge';f.ctx.meta=f.items[itemId];f.ctx.item={itemId};f.ctx.recipe=node('button');f.run(line('recipe.onclick=()=>{if(meta.recipe)selectBenchRecipe('));f.ctx.recipe.onclick();
    assert.equal(f.ctx.drawerActive,'crafting');if(itemId==='blade_25')assert.equal(f.$('benchRecipe').value,itemId);else{assert.equal(f.$('craftPanel').open,true);assert.equal(f.$('craftPanel').scrolled,true);}
  }
  // Field objectives preserve ordinary/boss grouping.
  for(const itemId of ['blade_25','boss_50']){
    f.ctx.drawerActive='quest';f.ctx.goal={recipe:itemId};f.ctx.recipe=node('button');f.run(line('recipe.onclick=()=>{selectBenchRecipe(personalItems[goal.recipe].sourceBoss?'));f.ctx.recipe.onclick();
    assert.equal(f.ctx.drawerActive,'crafting');assert.equal(f.$('benchRecipe').value,itemId);assert.equal(f.$('benchGroup').value,f.items[itemId].sourceBoss?'boss':'all');
  }
});

test('bag/profile contain no duplicate crafting panels; live HUD and shared refresh fanout include crafting',()=>{
  for(const code of [index,slice('  function openBag()','  function updateFieldAlerts()'),slice('  function openCharacterProfile()','  // Taps on any game button')]){
    for(const id of ['personalBench','benchRecipe','benchCraft','craftPanel','craftGlaive'])assert(!code.includes(`id="${id}"`),`duplicate ${id}`);
  }
  assert.match(source,/if \(drawerActive === "crafting"\) \{ renderCraftingPage\(\); return; \}/);
  assert.match(slice('  function updateHud(now)','  async function connectOnline('),/\["bag","character","forge","crafting"\]\.includes\(drawerActive\)\) renderBag\(\)/);
  assert.match(source,/smith:"character",forge:"character",crafting:"character"/);
  assert.equal([...source.matchAll(/function submitCraft\(/g)].length,1);
  assert.equal([...source.matchAll(/sendCraftMutation\(queued\?"craft_enqueue":"craft_weapon"/g)].length,1,'both crafting actions use the shared mutation sender');
  assert.equal([...(source+index).matchAll(/id="personalBench"/g)].length,1);assert.equal([...(source+index).matchAll(/id="craftGlaive"/g)].length,1);
});
console.log(`PASS dedicated crafting page: ${assertions} focused regression groups`);

}
module.exports={fixture};
