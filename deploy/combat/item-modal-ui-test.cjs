const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../../main.js'),'utf8'),index=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');
const slice=(start,end)=>{const a=source.indexOf(start),b=source.indexOf(end,a);assert(a>=0&&b>a,`missing source boundary: ${start}`);return source.slice(a,b);};
const plain=value=>JSON.parse(JSON.stringify(value));let groups=0;
function test(name,body){try{body();groups++;console.log('PASS '+name);}catch(error){error.message=name+': '+error.message;throw error;}}
// Run real modal, drawer, bag, forge and card renderers against the static index modal.
// DOM focus respects hidden/inert ancestors; this does not replace visual browser QA.
function dom(){
  const elements=new Map(),listeners=new Map(),document={activeElement:null,addEventListener(type,fn){listeners.set(type,fn);}};
  function node(tag='div'){
    let text='',value='';const classes=new Set();
    const el={tagName:tag.toUpperCase(),parentNode:null,children:[],dataset:{},attributes:{},hidden:false,disabled:false,inert:false,open:false,showCount:0,closeCount:0,
      classList:{contains:k=>classes.has(k),add(...keys){keys.forEach(k=>classes.add(k));},remove(...keys){keys.forEach(k=>classes.delete(k));},toggle(k,on){if(on===undefined)on=!classes.has(k);if(on)classes.add(k);else classes.delete(k);return on;}},
      setAttribute(k,v){v=String(v);this.attributes[k]=v;if(k==='class')this.className=v;if(k==='id'){this.id=v;elements.set(v,this);}if(k==='value')value=v;if(k==='hidden')this.hidden=true;if(k==='disabled')this.disabled=true;if(k.startsWith('data-'))this.dataset[k.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=v;},
      getAttribute(k){return this.attributes[k];},
      removeAttribute(k){delete this.attributes[k];},
      append(...children){for(const child of children){if(child.parentNode)child.parentNode.children=child.parentNode.children.filter(c=>c!==child);child.parentNode=this;this.children.push(child);if(this.tagName==='SELECT'&&this.children.length===1)value=String(child.value);}},
      appendChild(child){this.append(child);return child;},addEventListener(type,handler){this["on"+type]=handler;},
      replaceChildren(...children){for(const child of this.children){if(child.contains(document.activeElement))document.activeElement=document.body;child.parentNode=null;}this.children=[];text='';value='';this.append(...children);},
      contains(other){return this===other||this.children.some(child=>child.contains(other));},
      querySelectorAll(selector){const all=this.children.flatMap(child=>[child,...child.querySelectorAll('*')]);if(selector==='*')return all;return all.filter(child=>selector.split(',').some(part=>{
        part=part.trim();const enabled=part.match(/^(button|input|select|textarea):not\(:disabled\)$/);if(enabled)return child.tagName===enabled[1].toUpperCase()&&!child.disabled;
        if(part==='[tabindex="0"]')return child.getAttribute('tabindex')==='0';if(part==='[aria-pressed="true"]'||part==='[data-journal-tab][aria-pressed=true]')return child.getAttribute('aria-pressed')==='true';
        if(part==='[data-bag-tab]')return child.getAttribute('data-bag-tab')!==undefined;if(part==='a[href]')return child.tagName==='A'&&child.getAttribute('href');
        if(part.startsWith('.'))return child.classList.contains(part.slice(1));if(part.startsWith('#'))return child.id===part.slice(1);if(/^[a-z]+$/.test(part))return child.tagName===part.toUpperCase();assert.fail('unmodeled selector '+part);
      }));},
      querySelector(selector){return this.querySelectorAll(selector)[0]||null;},
      getClientRects(){for(let current=this;current;current=current.parentNode)if(current.hidden||(current.tagName==='DIALOG'&&!current.open))return [];return this.isConnected?[{}]:[];},
      getBoundingClientRect(){return {left:10,right:310,top:20,bottom:420};},
      focus(){if(this.isConnected&&!this.disabled&&!this.inertTree&&this.getClientRects().length)document.activeElement=this;},
      click(){if(!this.disabled&&!this.inertTree&&this.getClientRects().length)this.onclick?.({target:this,clientX:30,clientY:40});},
      showModal(){assert.equal(this.tagName,'DIALOG');assert(this.isConnected);assert.equal(this.open,false);this.open=true;this.showCount++;},
      close(){assert.equal(this.tagName,'DIALOG');this.open=false;this.closeCount++;this.onclose?.();},scrollIntoView(){this.scrolled=true;},
    };
    Object.defineProperties(el,{
      className:{get(){return [...classes].join(' ');},set(next){classes.clear();for(const c of String(next).split(/\s+/).filter(Boolean))classes.add(c);}},
      textContent:{get(){return text+this.children.map(child=>child.textContent).join('');},set(next){this.replaceChildren();text=String(next);}},
      value:{get(){return value;},set(next){next=String(next);value=this.tagName==='SELECT'&&!this.children.some(c=>c.value===next)?'':next;}},
      options:{get(){return this.children;}},lastChild:{get(){return this.children.at(-1);}},inertTree:{get(){return !!this.inert||!!this.parentNode?.inertTree;}},isConnected:{get(){return this===document.body||!!this.parentNode?.isConnected;}},
      innerHTML:{configurable:true,get(){return this.html||'';},set(html){parse(this,html);}},
    });return el;
  }
  document.createElement=node;document.body=node('body');document.activeElement=document.body;
  const mount=(id,tag='div',parent=document.body)=>{const el=node(tag);el.setAttribute('id',id);parent.append(el);return el;};
  const game=mount('game'),drawer=mount('drawer','aside',game),shade=mount('shade','div',game),body=mount('drawerBody','div',drawer),title=mount('drawerTitle','h2',drawer);
  const menu=mount('fieldMenu','div',drawer);const menuTab=node('button');menuTab.setAttribute('aria-pressed','true');menu.append(menuTab);
  mount('drawerMenuBack','button',drawer);mount('fieldMenuButton','button',game);mount('worldInput','button',game);drawer.hidden=true;shade.hidden=true;
  function parse(host,html){
    for(const child of host.querySelectorAll('*'))if(child.id)elements.delete(child.id);
    host.replaceChildren();host.html=html;const stack=[host];
    for(const token of html.matchAll(/<\/?[a-z][^>]*>/gi)){
      const part=token[0];if(part.startsWith('</')){stack.pop();continue;}
      const match=part.match(/^<([a-z][a-z0-9]*)\b([^>]*)>/i);if(!match)continue;
      const child=node(match[1]);for(const attr of match[2].matchAll(/([\w-]+)(?:="([^"]*)")?/g))child.setAttribute(attr[1],attr[2]??'');
      stack.at(-1).append(child);if(!['input','img','br','hr','meta','link'].includes(match[1]))stack.push(child);
    }
  }
  const globalHost=node();parse(globalHost,index.slice(index.indexOf('    <div id="itemModalBackdrop"'),index.indexOf('  <script src="./account-entry.js')));
  document.body.append(...globalHost.children);const account=mount('accountEntry');account.hidden=true;
  return {document,node,elements,listeners,$:id=>elements.get(id)||null,ui:{drawer,shade,drawerBody:body,drawerTitle:title}};
}
function fixture(){
  const d=dom(),wire=[],toasts=[],routes=[],guidance=[],player={alive:true,level:25,pathId:'blade',hp:40,maxHp:100,persistent:true};
  const forge={primary:'melee',pool:['melee'],enhanceMax:10,affixMax:6,affixTierCap:2,materialTier:2};
  const forged=instanceId=>({instanceId,revision:3,rank:5,misses:0});
  const items={weapon:{name:'ดาบทดสอบ',kind:'mainHand',path:'blade',level:25,stats:{atk:3},forge},ring:{name:'แหวนทดสอบ',kind:'ring',level:1,stats:{hp:2},forge,copyLimit:2},potion:{name:'ยาเลือด',kind:'consumable',healHp:30},ore:{name:'แร่',kind:'material'},card:{name:'การ์ดทดสอบ',kind:'card',level:1,stats:{atk:1}},ref_seal_2:{name:'ตรา',kind:'catalyst'}};
  const inventory={slots:[{itemId:'weapon',quantity:1,forge:forged('blade'),socket:'card'},{itemId:'ring',quantity:1,forge:forged('ring')},{itemId:'potion',quantity:3},{itemId:'ore',quantity:10},null,null],equippedWeaponSlot:0,equipment:{leftRing:'ring',rightRing:'ring'},equipmentForges:{leftRing:forged('left'),rightRing:forged('right')},equipmentSockets:{leftRing:'card'},forgeCopies:{weapon:10,ring:10}};
  const config={chances:Array(10).fill(100),rerollCost:60,rareAfter:4,claimCopies:true,enhanceSteps:Array.from({length:10},(_,rank)=>({copies:2,gold:50,chance:78,downgradeChance:20,breakChance:2,breakOnFailure:rank>=5}))};
  const ctx={renderLootHistory(){},clearCombatVfx(){},...d,triggerVoiceGuidance:step=>guidance.push(step),finishEconomyPending(){},clearTimeout(){},cancelAnimationFrame(){},drawerActive:null,drawerOpener:null,fieldTrainingTip:null,SFX(){},closeEquipPopup(){},mode:'live',inventoryState:inventory,personalItems:items,WEAPON_META:{},POTION_ITEM_ID:'potion',SHRINE_SHARD:'shrine_shard',shardName:'เศษศาล',
    BAG_PAGE_SIZE:4,BAG_TOTAL_PAGES:2,INVENTORY_SLOTS:6,bagCurrentPage:0,bagCategoryFilter:'all',selectedBagSlot:0,inspectingGear:null,preferredGearSlot:null,confirmBindKey:null,benchTrail:[],
    rarityNames:{common:'พื้นฐาน'},gearJobs:{blade:'นักดาบ'},bodyLabels:{leftRing:'แหวนซ้าย',rightRing:'แหวนขวา'},forgeNames:{melee:'ประชิด'},statNames:{atk:'โจมตี',hp:'HP'},statLine:()=>'',gearComparison:()=>'+1',
    currentBagSlots:()=>ctx.inventoryState?.slots,currentEquippedWeaponSlot:()=>ctx.inventoryState?.equippedWeaponSlot,ownServerCharacter:()=>player,economyReady:()=>ctx.mode==='live'&&!!ctx.room?.state?.economyAvailable,
    economyGold:10000,economyPending:false,itemUsePending:false,itemUseSequence:0,setTimeout(){},cardDrill:{itemId:'ore',quantity:1,gold:10},gearGuides:null,craftResultRoom:null,craftResultMessage:'',
    economyRequestId:()=>`request_${wire.length}`,economySend:(command,payload,durable)=>{wire.push({command,payload:plain(payload),durable});if(durable)ctx.economyPending=true;},window:{confirm:()=>true},
    Option:function(text,value){const el=d.node('option');el.textContent=text;el.value=value;return el;},
    itemHuntCount:(id,stock=false)=>id==='ref_seal_2'?5:inventory.slots.filter(p=>p?.itemId===id).length+(stock?(inventory.forgeCopies[id]||0):0),bindItemHuntButton:button=>{button.hidden=true;},
    journeyNotesForPlayer:()=>({}),salvageSelectedGear(){},handleUseBagItem:()=>routes.push('use'),setBagPage:p=>{ctx.bagCurrentPage=p;},updateBagPagerUi(){},isItemInCategory:()=>true,
    bagMultiPageSliderHtml:()=>'<div id="bagGrid">'+Array.from({length:8},(_,i)=>`<button type="button" class="bag-slot" id="bagSlot${i}"><span class="bag-symbol"></span><span class="bag-quantity"></span></button>`).join('')+'</div>',
    renderGearGuide:()=>{d.$('gearGuide').hidden=true;},toast:message=>toasts.push(message),closeCraftRecipePanel(){},openCraftRecipePanel(){},refreshArtisanWallet(){},renderWorkbench(){},renderCraft(){},selectBenchRecipe:(...args)=>{routes.push(args);ctx.openCraftingPage();},
  };
  ctx.room={state:{economyAvailable:true,inventoryAvailable:true,weaponsAvailable:true,forgeCatalog:JSON.stringify(config)},send:(command,payload)=>wire.push({command,payload:plain(payload),durable:true})};
  vm.createContext(ctx);const run=code=>vm.runInContext(code,ctx);
  run(slice('  const gearSymbols=','  let inspectingGear=')+slice('  function wearPositions(','  function pieceStat(')+slice('  function bagKilnRecipe(','  let craftPagePosition=')+slice('  function gearStamp(','  function salvageSelectedGear(')+slice('  function renderCardSocket(','  function openBag()')+slice('  function ensureItemDetailModalElements()','  const gearCoreSkills=')+slice('  function openBag()','  function updateFieldAlerts()')+slice('  function gateFieldInput(','  const journalOrigins='));
  run(slice('  document.addEventListener("keydown",event=>{\n    if (ui.drawer.hidden','  function updateChatBadge('));
  const useRealEquipHandler=()=>run(slice('  function sendBagCommand(','  function ensureItemDetailModalElements()'));
  const open=()=>ctx.openBag(),select=slot=>{const button=d.$('bagSlot'+slot);button.focus();button.click();},modal=()=>d.$('itemDetailModal'),snapshot=()=>JSON.stringify({inventory,gold:ctx.economyGold});
  return {...d,ctx,run,wire,toasts,routes,guidance,player,inventory,items,open,select,modal,snapshot,useRealEquipHandler,mutations:()=>wire.filter(e=>e.durable)};
}

test('already equipped gear has details and dismiss controls',()=>{
  const f=fixture();f.open();f.select(0);const modal=f.modal();
  for(const id of ['itemDetailModal','itemModalBackdrop','skillDetailModal','skillPopupBackdrop','equipPopup','equipPopupBackdrop'])assert.equal(f.$(id).parentNode,f.document.body,`independent body-level overlay ${id}`);
  assert.equal(modal.getAttribute('role'),'dialog');assert.equal(modal.getAttribute('aria-modal'),'true');
  assert.deepEqual(modal.querySelectorAll('button, input, select, summary, a[href], [tabindex="0"]').filter(control=>control.getClientRects().length).map(control=>control.id),['itemModalClose','bagDetailEnhance','itemModalCloseBtn']);
  for(const id of ['bagDetailItem','bagItemName','bagItemDescription','bagPanelStats','itemMetaLevel','itemMetaBound','itemMetaPrice'])assert(modal.contains(f.$(id)),id);
  for(const id of ['bagReturnItem','socketItemPreview','cardSocketPanel','socketCardChoice','cardSocketAction','gearGuide','guideTargetItem','bagOpenCraft','wearSidePicker','useBagItem','bagTrack','refineResource','bagKiln','sellBagMaterial','salvageGear','bagQuickDiff']){
    assert(f.ui.drawer.contains(f.$(id)),id);assert.equal(modal.contains(f.$(id)),false,id);
    assert.equal([...(index+source).matchAll(new RegExp(`id="${id}"`,'g'))].length,1,`unique host ${id}`);
  }
  assert.equal(f.$('bagForge'),null);
  assert.match(f.$('bagPanelStats').innerHTML,/ระดับตีบวกปัจจุบัน.*\+5 ขั้น/);
  assert.match(f.$('bagPanelStats').innerHTML,/การ์ดทดสอบ/);
});

test('actual inventory click opens populated modal, inerts drawer and focuses close without mutation',()=>{
  const f=fixture();f.open();assert.deepEqual(f.guidance,['gear']);const before=f.snapshot(),count=f.wire.length;f.select(1);assert.deepEqual(f.guidance,['gear'],'item selection does not repeat bag-open guidance');
  assert.equal(f.modal().hidden,false);assert.equal(f.modal().inert,false);assert.equal(f.$('itemModalBackdrop').hidden,false);assert.equal(f.ui.drawer.inert,true);assert.equal(f.$('worldInput').inert,true);
  assert.equal(f.document.activeElement,f.$('itemModalClose'));assert.equal(f.ctx.selectedBagSlot,1);assert.equal(f.$('bagItemName').textContent,'แหวนทดสอบ');assert.match(f.$('bagDetailItem').children[0].getAttribute('aria-label'),/แหวนทดสอบ \+5/);
  assert.equal(f.$('wearSidePicker').hidden,false);assert.equal(f.$('cardSocketPanel').hidden,false);assert.equal(f.$('bagSlot1').getAttribute('aria-pressed'),'true');
  f.$('useBagItem').click();f.$('cardSocketAction').click();assert.equal(f.routes.length,0,'inert management cannot act while reading details');
  f.$('bagSlot0').click();assert.equal(f.ctx.selectedBagSlot,1,'inert bag cannot change modal selection');assert.equal(f.snapshot(),before);assert.equal(f.wire.length,count);assert.equal(f.mutations().length,0);
});

test('empty and locked slots do not open modal or mutate selection',()=>{
  const f=fixture();f.open();const before=f.snapshot();f.select(4);assert.equal(f.modal().hidden,true);assert.match(f.toasts.at(-1),/ว่าง/);f.select(7);assert.equal(f.modal().hidden,true);assert.match(f.toasts.at(-1),/ยังไม่ปลดล็อก/);assert.equal(f.snapshot(),before);assert.equal(f.mutations().length,0);
  f.ctx.drawerActive='forge';f.ctx.openItemDetailModal(0);assert.equal(f.modal().hidden,true,'modal cannot open outside bag');
});

test('close buttons and backdrop restore exact opener, retain selection and keep world inert',()=>{
  for(const id of ['itemModalClose','itemModalCloseBtn','itemModalBackdrop']){
    const f=fixture();f.open();f.select(1);const before=f.snapshot();f.$(id).click();assert.equal(f.modal().hidden,true,id);assert.equal(f.modal().inert,true,id);assert.equal(f.$('itemModalBackdrop').hidden,true,id);assert.equal(f.$('itemModalBackdrop').inert,true,id);assert.equal(f.ui.drawer.inert,false,id);assert.equal(f.$('worldInput').inert,true,id);assert.equal(f.document.activeElement,f.$('bagSlot1'),id);
    for(let i=0;i<8;i++){assert.equal(f.$('bagSlot'+i).classList.contains('bag-selected'),i===1,id);assert.equal(f.$('bagSlot'+i).getAttribute('aria-pressed'),String(i===1),id);}
    assert.equal(f.snapshot(),before);assert.equal(f.mutations().length,0);
  }
});

test('reopening preserves original opener and invalid opener falls back to current slot',()=>{
  const f=fixture();f.open();f.select(1);f.ctx.openItemDetailModal(2);assert.equal(f.$('bagItemName').textContent,'ยาเลือด');f.ctx.closeItemDetailModal();assert.equal(f.document.activeElement,f.$('bagSlot1'));
  f.select(1);f.$('bagSlot1').hidden=true;f.ctx.openItemDetailModal(2);f.ctx.closeItemDetailModal();assert.equal(f.document.activeElement,f.$('bagSlot2'));assert.equal(f.ui.drawer.inert,false);
  f.ctx.closeItemDetailModal();assert.equal(f.document.activeElement,f.$('bagSlot2'),'already closed is a no-op');
});

test('actual Escape listener closes item modal before drawer and restores game focus only afterward',()=>{
  const f=fixture();f.$('fieldMenuButton').focus();f.open();f.select(1);const key=()=>{const event={key:'Escape',preventDefault(){this.prevented=true;}};f.listeners.get('keydown')(event);assert.equal(event.prevented,true);};
  key();assert.equal(f.modal().hidden,true);assert.equal(f.ui.drawer.hidden,false);assert.equal(f.ctx.drawerActive,'bag');assert.equal(f.document.activeElement,f.$('bagSlot1'));assert.equal(f.$('worldInput').inert,true);
  key();assert.equal(f.ctx.drawerActive,null);assert.equal(f.ui.drawer.hidden,true);assert.equal(f.$('worldInput').inert,false);assert.equal(f.document.activeElement,f.$('fieldMenuButton'));assert.equal(f.mutations().length,0);
});

test('Tab traps visible enabled modal controls and recovers focus from outside',()=>{
  const f=fixture();f.open();f.select(1);const first=f.$('itemModalClose'),last=f.$('itemModalCloseBtn');
  const tab=(shiftKey=false)=>{const event={key:'Tab',shiftKey,preventDefault(){this.prevented=true;}};f.listeners.get('keydown')(event);return event;};
  last.focus();assert.equal(tab().prevented,true);assert.equal(f.document.activeElement,first);first.focus();assert.equal(tab(true).prevented,true);assert.equal(f.document.activeElement,last);
  f.document.activeElement=f.document.body;assert.equal(tab().prevented,true);assert.equal(f.document.activeElement,first);f.document.activeElement=f.document.body;assert.equal(tab(true).prevented,true);assert.equal(f.document.activeElement,last);
  first.focus();f.$('useBagItem').focus();assert.equal(f.document.activeElement,first);assert.equal(tab().prevented,undefined);assert.equal(f.ctx.handleItemDetailKey({key:'ArrowDown'}),false);
  f.ctx.closeItemDetailModal();assert.equal(f.ctx.handleItemDetailKey({key:'Tab'}),false);
});

test('bag craft shortcut opens the dedicated crafting page',()=>{
  const f=fixture();f.open();const before=f.snapshot(),modal=f.modal();f.$('bagOpenCraft').click();
  assert.equal(f.ctx.drawerActive,'crafting');assert.equal(f.modal(),modal);assert.equal(modal.hidden,true);assert.equal(f.$('itemModalBackdrop').hidden,true);assert.equal(f.ui.drawer.inert,false);assert.equal(f.$('worldInput').inert,true);assert.equal(f.document.activeElement,f.$('drawerMenuBack'));assert(f.$('personalBench'));assert.equal(f.snapshot(),before);assert.equal(f.mutations().length,0);
  f.$('craftBag').click();assert.equal(f.ctx.drawerActive,'bag');assert.equal(modal.hidden,true);f.select(1);assert.equal(modal.hidden,false,'modal remains reusable after route changes');
});

test('item picture opens the exact craft recipe and closes the detail overlay without a mutation',()=>{
  const f=fixture();f.items.ring.recipe=[{item:'ore',qty:2}];f.open();f.select(1);
  const link=f.$('bagDetailRecipe'),before=f.snapshot();
  assert.equal(link.hidden,false);assert.equal(link.getAttribute('aria-label'),'ดูสูตร แหวนทดสอบ');
  const tab={key:'Tab',shiftKey:true,preventDefault(){this.prevented=true;}};
  f.$('itemModalClose').focus();f.listeners.get('keydown')(tab);assert.equal(tab.prevented,undefined);
  link.focus();f.listeners.get('keydown')(tab);assert.equal(tab.prevented,true);assert.equal(f.document.activeElement,f.$('itemModalCloseBtn'));
  link.click();assert.deepEqual(f.routes.at(-1),['all','1','ring']);
  assert.equal(f.ctx.drawerActive,'crafting');assert.equal(f.modal().hidden,true);assert.equal(f.ui.drawer.inert,false);
  assert.equal(f.snapshot(),before);assert.equal(f.mutations().length,0);
});

test('small equip button keeps bind confirmation and sends the selected accessory to the free side',()=>{
  const f=fixture();f.useRealEquipHandler();delete f.inventory.equipment.rightRing;f.open();f.select(1);
  const equip=f.$('bagDetailEquip');assert.equal(equip.hidden,false);assert.equal(equip.textContent,'ติดตั้ง');
  assert.equal(equip.disabled,false);assert.equal(f.modal().contains(equip),true);
  equip.focus();equip.click();
  assert.equal(equip.textContent,'ยืนยันผูกและสวม');assert.equal(f.mutations().length,0);
  equip.click();equip.click();
  assert.deepEqual(f.mutations(),[{command:'equip_gear',payload:{slot:1,position:'rightRing',expected:'ring',stamp:'ring.3'},durable:true}]);
  assert.equal(equip.disabled,true);assert.equal(f.document.activeElement,f.$('itemModalClose'));
  f.inventory.slots[1]=null;f.ctx.itemUsePending=false;f.ctx.renderBag();assert.equal(equip.hidden,true);
});

test('equip button uses the original weapon command and is unavailable for unusable items',()=>{
  const f=fixture();f.useRealEquipHandler();f.inventory.equippedWeaponSlot=null;f.inventory.slots[0].bound=true;f.open();
  const equip=f.$('bagDetailEquip');f.select(0);f.player.level=10;f.ctx.renderBag();
  assert.equal(equip.disabled,true);equip.click();assert.equal(f.mutations().length,0);
  f.player.level=25;f.ctx.renderBag();f.ctx.closeItemDetailModal();equip.click();assert.equal(f.mutations().length,0);
  f.select(2);assert.equal(equip.hidden,true);equip.click();assert.equal(f.mutations().length,0);
  f.ctx.closeItemDetailModal();f.select(0);equip.click();
  assert.deepEqual(f.mutations(),[{command:'equip_weapon',payload:{slot:0},durable:true}]);
  f.inventory.equippedWeaponSlot=0;f.ctx.itemUsePending=false;f.ctx.renderBag();assert.equal(equip.hidden,true);
});

test('recipe picture routes raw kiln materials and the legacy shrine ingredient',()=>{
  const f=fixture();
  f.items.mat_raw_wood_1={name:'ไม้ดิบ',kind:'material'};
  f.items.mat_charcoal_1={name:'ถ่านไม้ชั้น 1',kind:'material',station:'kiln',level:10,recipe:[{item:'mat_raw_wood_1',qty:2}]};
  f.inventory.slots[3]={itemId:'mat_raw_wood_1',quantity:3};
  f.open();f.select(3);assert.equal(f.$('bagDetailRecipe').getAttribute('aria-label'),'ดูสูตร ถ่านไม้ชั้น 1');
  f.$('bagDetailRecipe').click();assert.deepEqual(f.routes.at(-1),['kiln','10','mat_charcoal_1']);
  f.inventory.slots[3]={itemId:'shrine_shard',quantity:1};
  f.ctx.room.state.craftRecipe=JSON.stringify({output:'shrine_glaive',ingredient:'shrine_shard'});
  f.open();f.select(3);f.$('bagDetailRecipe').click();
  assert.equal(f.ctx.drawerActive,'crafting');assert.equal(f.modal().hidden,true);
  assert.equal(f.$('craftPanel').open,true);assert.equal(f.$('craftPanel').scrolled,true);assert.equal(f.mutations().length,0);
});

test('small produce button opens the production page for the selected material',()=>{
  const f=fixture();f.open();f.select(2);
  const produce=f.$('bagDetailProduce');assert.equal(produce.hidden,true);
  f.ctx.closeItemDetailModal();f.select(3);assert.equal(produce.hidden,false);
  const before=f.snapshot();produce.click();
  assert.equal(f.ctx.drawerActive,'crafting');assert.equal(f.modal().hidden,true);assert.equal(f.ui.drawer.inert,false);
  assert.equal(f.ctx.craftMaterialId,'ore');assert.equal(f.$('benchGroup').value,'all');
  assert.equal(f.snapshot(),before);assert.equal(f.mutations().length,0);
});

test('item picture stays visible and returns focus when a recipe becomes unavailable',()=>{
  const f=fixture();f.items.ring.recipe=[{item:'ore',qty:2}];f.open();f.select(1);
  const link=f.$('bagDetailRecipe');link.focus();
  delete f.items.ring.recipe;f.ctx.renderBag();
  assert.equal(link.hidden,true);assert.equal(link.onclick,null);assert.equal(f.document.activeElement,f.$('itemModalClose'));
  assert.equal(f.$('bagDetailItem').hidden,false);
  f.items.ring.recipe=[{item:'ore',qty:2}];f.ctx.room.state.economyAvailable=false;f.ctx.renderBag();
  assert.equal(link.hidden,true);link.click();assert.equal(f.ctx.drawerActive,'bag');assert.equal(f.mutations().length,0);
});

test('forge bag details and card help retain the exact equipped side',()=>{
  const f=fixture();f.ctx.openForgePage('enhance','leftRing');assert.equal(f.$('forgeCardHelp').hidden,false);const before=f.snapshot(),modal=f.modal();
  f.$('forgeBag').click();assert.equal(modal.hidden,false);assert.equal(f.$('bagItemName').textContent,'แหวนทดสอบ');assert.equal(f.ctx.inspectingGear,'leftRing');
  f.$('bagDetailEnhance').click();
  assert.equal(f.ctx.drawerActive,'forge');assert.equal(f.$('forgeTargetButton').dataset.target,'worn:leftRing');
  f.$('forgeCardHelp').click();
  assert.equal(f.ctx.drawerActive,'forge');assert.equal(f.$('forgeTargetButton').dataset.target,'worn:leftRing');assert.equal(f.modal(),modal);assert.equal(modal.hidden,true);assert.equal(f.ui.drawer.inert,false);assert.equal(f.$('cardSocketPanel').hidden,false);assert.equal(f.$('cardSocketPanel').getClientRects().length,1);assert.match(f.$('cardSocketAction').textContent,/ถอดการ์ด/);
  assert.equal(f.snapshot(),before);assert.equal(f.mutations().length,0);
  f.$('cardSocketAction').click();const sent=f.mutations();assert.equal(sent.length,1);assert.equal(sent[0].command,'card_socket');assert.deepEqual(sent[0].payload,{requestId:sent[0].payload.requestId,target:'leftRing',gear:'ring',expected:'card',action:'remove',card:null,stamp:'left.3'});
});

test('monster card details open the existing drill tab and gear picker without sending a mutation',()=>{
  const f=fixture();f.inventory.slots[2]={itemId:'card',quantity:1};f.open();f.select(2);
  const drill=f.$('bagDetailDrill'),before=f.snapshot();
  assert.equal(drill.hidden,false);assert.equal(drill.disabled,false);
  f.ctx.economyPending=true;f.ctx.renderBag();
  assert.equal(drill.disabled,true);drill.click();assert.equal(f.ctx.drawerActive,'bag');
  f.ctx.economyPending=false;f.ctx.renderBag();
  drill.click();
  assert.equal(f.ctx.drawerActive,'forge');
  assert.equal(f.modal().hidden,true);assert.equal(f.ui.drawer.inert,false);
  assert.equal(f.$('forgeTabDrill').getAttribute('aria-pressed'),'true');
  assert.equal(f.$('forgeTargetButton').dataset.target,'');
  assert.equal(f.$('forgePicker').open,true);
  const ring=f.$('forgePickerGrid').children.find(button=>button.dataset.forgeTarget==='bag:1');
  assert(ring);ring.click();
  assert.equal(f.$('forgePicker').open,false);
  assert.equal(f.$('forgeTargetButton').dataset.target,'bag:1');
  assert.match(f.$('cardSocketAction').textContent,/เจาะรู/);
  assert.deepEqual(f.mutations(),[]);assert.equal(f.snapshot(),before);
  f.open();f.select(1);assert.equal(drill.hidden,true);assert.equal(drill.onclick,null);
});

test('drawer navigation, close and reconnect teardown cannot leave modal or inert drawer behind',()=>{
  for(const target of ['smith','character','fieldMenu']){
    const f=fixture();f.open();f.select(1);f.ctx.openDrawer(target,target,'');assert.equal(f.modal().hidden,true,target);assert.equal(f.$('itemModalBackdrop').hidden,true,target);assert.equal(f.ui.drawer.inert,false,target);assert.equal(f.ctx.drawerActive,target);assert.equal(f.document.activeElement.getClientRects().length,1,target);
  }
  const f=fixture();f.$('fieldMenuButton').focus();f.open();f.select(1);f.ctx.closeDrawer();assert.equal(f.modal().hidden,true);assert.equal(f.ui.drawer.inert,false);assert.equal(f.$('worldInput').inert,false);assert.equal(f.document.activeElement,f.$('fieldMenuButton'));
  // Execute the real showDemo teardown prefix before its unrelated world reset.
  f.open();f.select(1);f.run(slice('  function showDemo() {','    clearFishing(false);')+'\n}');f.ctx.showDemo();assert.equal(f.modal().hidden,true);assert.equal(f.$('itemModalBackdrop').hidden,true);assert.equal(f.ui.drawer.inert,false);
});

test('live inventory refresh updates open modal without losing focus or creating duplicate controls',()=>{
  const f=fixture();f.open();f.select(1);const modal=f.modal(),close=f.$('itemModalCloseBtn'),card=f.$('cardSocketPanel');close.focus();f.inventory.slots[1].forge.rank=6;f.ctx.renderBag();
  assert.equal(f.modal(),modal);assert.equal(f.$('itemModalCloseBtn'),close);assert.equal(f.$('cardSocketPanel'),card);assert.equal(f.document.activeElement,close);assert.match(f.$('bagDetailItem').children[0].getAttribute('aria-label'),/\+6/);
  f.inventory.slots[1]=null;f.ctx.renderBag();assert.equal(f.$('bagItemName').textContent,'ช่องว่าง');assert.equal(f.$('cardSocketPanel').hidden,true);assert.equal(f.$('useBagItem').disabled,true);assert.equal(f.mutations().length,0);f.$('itemModalClose').click();assert.equal(f.ui.drawer.inert,false);
});
test('health potion render produces one healing stat card, including legacy fallback',()=>{
  const f=fixture();f.open();f.select(2);const html=f.$('bagPanelStats').html;
  assert.equal([...html.matchAll(/ฟื้นฟูพลังชีวิต/g)].length,1);assert.equal([...html.matchAll(/\+30 HP/g)].length,1);
  delete f.items.potion;f.ctx.renderBag();assert.equal([...f.$('bagPanelStats').html.matchAll(/ฟื้นฟูพลังชีวิต/g)].length,1);
});
test('static popups close on completed activation without pointer-down click-through',()=>{
  assert(index.indexOf('</main>')<index.indexOf('id="itemDetailModal"'));
  assert(index.indexOf('</main>')<index.indexOf('id="equipPopup"'));
  for(const id of ['itemModalClose','itemModalCloseBtn','itemModalBackdrop']){
    const f=fixture();f.open();f.select(1);const before=f.snapshot();
    const event={preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;}};
    assert.equal(f.$(id).onpointerdown,null,'pointer down must not remove the overlay early');
    f.$(id).onclick(event);
    assert.equal(event.prevented,true);assert.equal(event.stopped,true);assert.equal(f.modal().hidden,true);
    assert.equal(f.document.activeElement,f.$('bagSlot1'));assert.equal(f.snapshot(),before);assert.equal(f.mutations().length,0);
    f.$(id).onclick();assert.equal(f.modal().hidden,true,'subsequent click is idempotent');
  }
});

test('details render only in the modal and the drawer still manages the selected item',()=>{
  const f=fixture();f.open();f.select(1);
  assert.equal(f.$('bagQuickDetail'),null);
  for(const id of ['bagDetailItem','bagItemName','bagPanelStats','bagItemDescription']){
    assert(f.modal().contains(f.$(id)),id);
    assert.equal(f.ui.drawer.contains(f.$(id)),false,id);
  }
  assert.equal(f.$('bagItemName').textContent,'แหวนทดสอบ');
  f.ctx.closeItemDetailModal();const sides=f.$('wearSidePicker').children;sides[1].click();assert.equal(sides[1].getAttribute('aria-pressed'),'true');
  f.$('useBagItem').click();assert.equal(f.routes.at(-1),'use');
  f.$('useBagItem').disabled=true;f.$('useBagItem').click();assert.equal(f.routes.filter(x=>x==='use').length,1);
  assert.equal(f.modal().hidden,true);assert.equal(f.mutations().length,0);
});

console.log(`PASS centered item modal: ${groups} focused regression groups`);
