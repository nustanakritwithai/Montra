const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../../main.js'),'utf8');
const index=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');
const slice=(start,end)=>{const a=source.indexOf(start),b=source.indexOf(end,a);assert(a>=0&&b>a,start);return source.slice(a,b);};
const elements=new Map(),sent=[],prompts=[],routes=[],effects=[];
const document={activeElement:null,createElement:tag=>control(tag)};
function control(tag='div'){
  const classes=new Set();
  const el={tagName:tag.toUpperCase(),value:'',textContent:'',hidden:false,disabled:false,open:false,dataset:{},attributes:{},children:[],
    classList:{toggle(k,on){if(on)classes.add(k);else classes.delete(k);},contains:k=>classes.has(k)},
    setAttribute(k,v){this.attributes[k]=String(v);},getAttribute(k){return this.attributes[k];},
    replaceChildren(...children){this.children=[...children];this.value=children[0]?.value||'';},append(...children){this.children.push(...children);},
    contains(other){return this===other||this.children.some(child=>child.contains?.(other));},
    querySelectorAll(selector){const descendants=this.children.flatMap(child=>[child,...(child.querySelectorAll?.('*')||[])]);return selector==='*'?descendants:descendants.filter(child=>selector==='[aria-pressed="true"]'?child.attributes?.['aria-pressed']==='true':child.tagName==='BUTTON'&&!child.disabled);},
    querySelector(selector){return this.querySelectorAll(selector)[0]||null;},getClientRects(){return this.hidden?[]:[{}];},
    focus(){document.activeElement=this;},click(){if(!this.disabled)this.onclick?.({target:this});},showModal(){this.open=true;},close(){this.open=false;},scrollIntoView(){this.scrolled=true;}};
  Object.defineProperty(el,'options',{get(){return this.children;}});return el;
}
const $=id=>elements.get(id)||null;
const id='wp_twins_25',ring='acc_ring_atk_1';
const profile={primary:'melee',pool:['melee','guard'],enhanceMax:10,affixMax:6,affixTierCap:2,materialTier:2};
const metadata={[id]:{name:'ดาบคู่',kind:'mainHand',level:25,forge:profile,recipe:[{item:'metal',qty:1}]},[ring]:{name:'แหวน',kind:'ring',level:1,forge:{...profile,affixTierCap:1},copyLimit:2},ref_seal_2:{name:'ตราอาคม',kind:'catalyst'}};
const forged=(name,rank=5)=>({instanceId:name,revision:2,rank,misses:0,affix:{stat:'melee',tier:1},rerollMisses:2});
const piece={itemId:id,quantity:1,forge:forged('sword')};
const inventory={slots:[piece,{itemId:id,quantity:1,forge:forged('donor',0)},null,...Array(9).fill(null)],equippedWeaponSlot:0,equipment:{leftRing:ring,rightRing:ring},equipmentForges:{leftRing:forged('left'),rightRing:forged('right')},equipmentSockets:{leftRing:'card'},forgeCopies:{[id]:8,[ring]:4}};
const config={chances:Array(10).fill(100),rerollCost:60,rareAfter:4,claimCopies:true,enhanceSteps:Array.from({length:10},(_,rank)=>({copies:1+Math.floor(rank/3),gold:12*(rank+1),chance:rank>4?78:100,downgradeChance:rank>4?20:0,breakChance:rank>4?2:0,breakOnFailure:rank>4}))};
const me={alive:true,level:25,persistent:true};let ready=true,accepted=false;
const ctx={$,document,Date:{now:()=>10000},setTimeout:()=>1,clearTimeout(){},cancelAnimationFrame(){},economyPendingRequest:null,refreshArtisanWallet(){},createItemTile:()=>control(),renderItemTile(){},renderItemPreview(){},triggerBagPanelPop(){},Option:class{constructor(text,value){Object.assign(this,{text,value});}},inventoryState:inventory,room:{state:{forgeCatalog:JSON.stringify(config)}},drawerActive:null,
  // Keep audiovisual feedback observable without a renderer or audio device.
  getLocalAvatar:()=>null,localId:'hero',
  ...Object.fromEntries(['SFX','shakeCamera','sparks','floatAtPlayer','triggerCombatCallout'].map(name=>[name,(...args)=>effects.push({name,args})])),
  economyReady:()=>ready,currentBagSlots:()=>inventory.slots,currentEquippedWeaponSlot:()=>inventory.equippedWeaponSlot,
  bagMeta:id=>metadata[id],personalItems:metadata,WEAPON_META:{},bodyLabels:{leftRing:'แหวนซ้าย',rightRing:'แหวนขวา'},forgeNames:{melee:'โจมตีประชิด',guard:'ป้องกันมอนสเตอร์'},
  ownServerCharacter:()=>me,economyPending:false,itemUsePending:false,economyGold:1000,selectedBagSlot:0,inspectingGear:null,benchTrail:[],
  itemHuntCount:(id,stock=false)=>id==='ref_seal_2'?2:inventory.slots.filter(x=>x?.itemId===id).length+Object.values(inventory.equipment).filter(x=>x===id).length+(stock?(inventory.forgeCopies[id]||0):0),
  bindItemHuntButton:(button,id)=>{button.hidden=!id;},economyRequestId:()=>`request_${sent.length}`,window:{matchMedia:()=>({matches:true}),confirm:message=>{prompts.push(message);return accepted;}},
  economySend:(command,payload,durable)=>{sent.push({command,payload,durable});if(durable){ctx.economyPending=true;ctx.economyPendingRequest={room:ctx.room,command,requestId:payload.requestId};}},
  openDrawer:(name,title,html)=>{ctx.drawerActive=name;ctx.title=title;elements.clear();for(const match of html.matchAll(/<([a-z][a-z0-9]*)\b[^>]*id="([^"]+)"/g))elements.set(match[2],control(match[1]));if($("forgePicker"))$("forgePicker").append($("forgePickerClose"),$("forgePickerGrid"));ctx.html=html;},
  openBag:()=>{ctx.drawerActive='bag';routes.push('bag');elements.clear();for(const id of ['cardSocketPanel','craftPanel'])elements.set(id,control());},
  selectBenchRecipe:(...args)=>routes.push(args),renderBag:()=>{if(ctx.drawerActive==='forge')ctx.renderForgePage();}};
const code=slice('  function wornGearAt(','  function pieceStat(')+slice('  function gearStamp(','  function accessoryStamp(')+slice('  function forgeLabel(','  function salvageSelectedGear(')+slice('  function renderForgeStock(','  function openBag()');
vm.createContext(ctx);vm.runInContext(code,ctx);
const callbacks={};ctx.joined=ctx.room;ctx.joined.onMessage=(name,handler)=>{callbacks[name]=handler;};
ctx.finishEconomyPending=()=>{ctx.economyPending=false;ctx.economyPendingRequest=null;};ctx.toast=()=>{};
vm.runInContext(slice('      joined.onMessage("craft_result",','      joined.onMessage("market_result",'),ctx);
const run=code=>vm.runInContext(code,ctx);
const pick=key=>{$('forgeTargetButton').click();const button=$('forgePickerGrid').children.find(child=>child.dataset.forgeTarget===key);assert(button,`picker choice ${key}`);button.click();};
run('openSmith()');assert.equal(ctx.drawerActive,'smith');$('smithEnhance').onclick();
assert.equal(ctx.drawerActive,'forge');assert.equal(ctx.title,'ตีบวกอุปกรณ์');assert.equal($('forgeTargetButton').dataset.target,'bag:0');
assert.equal($('forgeEnhanceSection').hidden,false);assert.equal($('forgeRerollSection').hidden,true);assert.equal(ctx.forgeTargetChoices().length,4);assert.equal($('forgeGear'),null);
assert.match($('forgeInfo').textContent,/PvE/);assert.match($('forgeEnhance').textContent,/89 ทอง/);
// Selecting an equipped body accessory uses its true side, identity and card.
pick('worn:leftRing');assert.equal($('forgeEnhance').disabled,true);assert.equal($('forgeCardHelp').hidden,false);
pick('worn:rightRing');assert.equal($('forgeEnhance').disabled,false);
$('forgeEnhance').onclick();assert.equal(sent.filter(x=>x.durable).length,0);assert.match(prompts.at(-1),/แตกถาวร 2%/);
accepted=true;$('forgeEnhance').onclick();let command=sent.at(-1);
assert.equal(command.command,'forge_weapon');assert.equal(command.payload.slot,'rightRing');assert.equal(command.payload.stamp,'right.2');assert.equal(command.payload.copies,2);assert.equal(command.payload.acceptBreak,true);assert.equal(command.payload.acceptDowngrade,true);
assert.equal($('forgeTargetButton').disabled,true);const count=sent.length;$('forgeEnhance').onclick();assert.equal(sent.length,count,'double click cannot duplicate a pending mutation');
callbacks.forge_result({requestId:command.payload.requestId,itemId:ring,action:'enhance',success:true,forge:{rank:6}});run('renderForgePage()');assert.equal($('forgeTargetButton').disabled,false);assert.equal($('forgeStockGear').disabled,false,'stock choice is restored after reveal');
assert.equal(effects[0].args[0],'bell');assert.deepEqual(effects[2].args.slice(0,4),['gold',0,1.2,0]);
assert.equal(effects.at(-1).args[0],'forge_success');
// Revisions update in place; replacement instances never silently become the target.
inventory.equipmentForges.rightRing.revision=3;run('renderForgePage()');assert.equal($('forgeTargetButton').dataset.target,'worn:rightRing');
inventory.equipmentForges.rightRing=forged('replacement');run('renderForgePage()');assert.equal($('forgeTargetButton').dataset.target,'');assert.equal($('forgePanel').hidden,true);
run('openForgePage("reroll",0)');assert.equal($('forgeEnhanceSection').hidden,true);assert.equal($('forgeRerollSection').hidden,false);
assert.match($('forgeAffixInfo').textContent,/แทนที่ของเดิม/);assert.match($('forgeRerollPity').textContent,/2\/4/);
$('forgeReroll').onclick();command=sent.at(-1);assert.deepEqual(Object.keys(command.payload).sort(),['action','requestId','slot','stamp']);assert.equal(command.payload.action,'reroll');assert.equal(command.payload.slot,0);
callbacks.forge_result({requestId:command.payload.requestId,itemId:id,action:'reroll',forge:piece.forge});ctx.economyGold=0;run('renderForgePage()');assert.equal($('forgeReroll').disabled,true);
ctx.economyGold=1000;const countItems=ctx.itemHuntCount;ctx.itemHuntCount=()=>0;run('renderForgePage()');assert.equal($('forgeReroll').disabled,true);ctx.itemHuntCount=countItems;
me.alive=false;run('renderForgePage()');assert.equal($('forgeReroll').disabled,true);assert.match($('forgeActionStatus').textContent,/เกิดใหม่/);
me.alive=true;me.level=1;run('renderForgePage()');assert.equal($('forgeReroll').disabled,true);me.level=25;
// Destruction applies to inventory immediately but remains masked until its receipt.
run('openForgePage("enhance",0)');$('forgeEnhance').onclick();const brokenRequest=sent.at(-1);
assert.equal(brokenRequest.payload.action,'enhance');inventory.slots[0]=null;run('renderForgePage()');
assert.equal($('forgeTargetButton').dataset.target,'bag:0','pending presentation keeps submitted target');
callbacks.forge_result({requestId:brokenRequest.payload.requestId,itemId:id,broken:true,forge:piece.forge,action:'enhance'});
assert.equal(ctx.economyPending,false);assert.equal($('forgeTargetButton').dataset.target,'');assert.equal($('forgePanel').hidden,true);assert.equal($('forgeStock').hidden,false);assert.equal($('forgeStock').open,true);assert.equal($('forgeStockGear').value,id);assert.match($('forgeOutcome').textContent,/แตก/);
assert.equal(effects.at(-1).args[0],'forge_fail');
inventory.slots[2]={itemId:id,quantity:1,forge:forged('claimed',0)};ctx.economyPending=true;
callbacks.forge_copy_claimed({gear:id,instanceId:'claimed',remaining:7});
assert.equal(ctx.economyPending,false);assert.equal($('forgeTargetButton').dataset.target,'bag:2','claim selects returned instance, not another identical model');
// Legacy first-forge identity acquisition remains selected, then protects its new identity.
inventory.slots[0]={itemId:id,quantity:1};run('openForgePage("enhance",0)');inventory.slots[0].forge=forged('new');run('renderForgePage()');assert.equal($('forgeTargetButton').dataset.target,'bag:0');
inventory.slots[0].forge=forged('other');run('renderForgePage()');assert.equal($('forgeTargetButton').dataset.target,'');
// Card routes retain the exact body target; recipes now use the dedicated crafting route.
run('openForgePage("enhance","leftRing")');$('forgeCardHelp').onclick();assert.equal(ctx.drawerActive,'bag');assert.equal(ctx.inspectingGear,'leftRing');assert.equal($('cardSocketPanel').scrolled,true);
run('openForgePage("enhance",1)');const recipeRoutes=routes.length;$('forgeCopyRecipe').onclick();assert.equal(routes.length,recipeRoutes+1);assert.deepEqual(routes.at(-1),['all','25',id]);
// Disconnect, room replacement and unsupported servers cannot retain actionable controls.
run('openForgePage("enhance",1)');ready=false;run('renderForgePage()');assert.equal($('forgeTargetButton').disabled,true);assert.equal($('forgePanel').hidden,true);assert.equal($('forgeStock').hidden,true);
ready=true;run('openForgePage("enhance",1)');ctx.room={state:{forgeCatalog:JSON.stringify(config)}};run('renderForgePage()');assert.equal($('forgeTargetButton').dataset.target,'');
run('openForgePage("enhance",1)');ctx.room.state.forgeCatalog='';run('renderForgePage()');assert.equal($('forgePanel').hidden,true);assert.match($('forgePageStatus').textContent,/ยังไม่ส่ง/);
// Existing event paths dispatch through renderBag, which now also refreshes the forge page.
assert.match(source,/if \(drawerActive === "forge"\) \{ renderForgePage\(\); return; \}/);
assert.match(source,/if\(drawerActive==="forge" && slot>=0 && !forgeAnimationBusy\(\)\)\{cancelForgeAnimation\(false\);forgePresentationResult=null;selectForgeTarget\(slot\)/);
assert.match(source,/forge\.onclick=\(\)=>openForgePage\("enhance",goal\.slot\)/);
assert.match(source,/smith:"character",forge:"character"/);
const bagCode=slice('  function openBag()','  function updateFieldAlerts()');assert(!bagCode.includes('id="forgePanel"'));assert(!bagCode.includes('id="forgeStock"'));assert(index.includes('id="bagForge"'));assert(!bagCode.includes('id="bagForge"'),'forge shortcut lives in the global item modal');
// Both the paperdoll character tab and the bag use one shared shortcut binder.
const profileCode=slice('  function openCharacterProfile()','  // Taps on any game button');
assert(!profileCode.includes('id="forgePanel"'));assert(!profileCode.includes('id="forgeStock"'));assert(profileCode.includes('id="cpForge"'));
assert.equal([...source.matchAll(/function submitForge\(/g)].length,1);
const shortcut={},workshop={},opened=[],binder={closeItemDetailModal(){},drawerActive:"bag",BAG_PAGE_SIZE:0,BAG_TOTAL_PAGES:0,ui:{drawerBody:{querySelectorAll:()=>[]}},$:id=>id==='bagForge'?shortcut:id==='cpForge'?workshop:null,INVENTORY_SLOTS:0,bodyLabels:{},inspectingGear:'leftRing',selectedBagSlot:3,
  currentEquippedWeaponSlot:()=>4,openForgePage:(...args)=>opened.push(args),openSmith:()=>opened.push("smith"),journeyNotesForPlayer:()=>({}),economyReady:()=>false};
vm.runInNewContext(slice('  function bindBagControls()','  function renderBag()')+'\nbindBagControls()',binder);
shortcut.onclick();assert.deepEqual(opened.at(-1),['enhance','leftRing']);binder.inspectingGear='mainHand';shortcut.onclick();assert.deepEqual(opened.at(-1),['enhance',4]);binder.inspectingGear=null;shortcut.onclick();assert.deepEqual(opened.at(-1),['enhance',3]);
binder.drawerActive="character";vm.runInNewContext(slice('  function bindBagControls()','  function renderBag()')+'\nbindBagControls()',binder);workshop.onclick();assert.equal(opened.at(-1),"smith");
assert.match(source,/closeEquipPopup\(\); openForgePage\("enhance", target\)/);
// Real pending timeout sends only read requests and refreshes the open item view.
let timeout,refreshes=0;const wire=[];
const pending={failForgeAnimation(){},economyPendingRequest:null,economyPending:false,economyTimer:null,economyReady:()=>true,room:{send:(command,payload)=>wire.push({command,payload})},centralMarketVersion:0,
  setTimeout:handler=>{timeout=handler;return 1;},clearTimeout(){},cancelAnimationFrame(){},toast(){},renderEconomy(){},renderBag(){refreshes++;}};
vm.createContext(pending);vm.runInContext(slice('  function finishEconomyPending(','  function economyReady()')+slice('  function economySend(','  function economyRequestId()'),pending);
pending.economySend('forge_weapon',{requestId:'one'},true);pending.economySend('forge_weapon',{requestId:'two'},true);assert.equal(wire.length,1);
timeout();assert.equal(pending.economyPending,false);assert.deepEqual(wire.map(x=>x.command),['forge_weapon','get_economy','market_list']);assert.equal(refreshes,2);
pending.room.send=()=>{throw Error('offline');};pending.economySend('forge_weapon',{requestId:'three'},true);assert.equal(pending.economyPending,false);assert.equal(refreshes,3);
console.log('PASS dedicated forge pages: routes, selection, body sockets, identity, requests, reroll, pending, break recovery, legacy IDs and disconnect');
