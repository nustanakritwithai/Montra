const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../../main.js'),'utf8');
const slice=(start,end)=>{const a=source.indexOf(start),b=source.indexOf(end,a);assert(a>=0&&b>a,start);return source.slice(a,b);};
const elements=new Map(),sent=[],prompts=[],routes=[];
function control(){return {value:'',textContent:'',hidden:false,disabled:false,dataset:{},attributes:{},options:[],setAttribute(k,v){this.attributes[k]=v;},replaceChildren(...children){this.options=children;this.value=children[0]?.value||'';},scrollIntoView(){this.scrolled=true;}};}
const $=id=>elements.get(id)||null;
const id='wp_twins_25',ring='acc_ring_atk_1';
const profile={primary:'melee',pool:['melee','guard'],enhanceMax:10,affixMax:6,affixTierCap:2,materialTier:2};
const metadata={[id]:{name:'ดาบคู่',kind:'mainHand',level:25,forge:profile,recipe:[{item:'metal',qty:1}]},[ring]:{name:'แหวน',kind:'ring',level:1,forge:{...profile,affixTierCap:1},copyLimit:2},ref_seal_2:{name:'ตราอาคม',kind:'catalyst'}};
const forged=(name,rank=5)=>({instanceId:name,revision:2,rank,misses:0,affix:{stat:'melee',tier:1},rerollMisses:2});
const piece={itemId:id,quantity:1,forge:forged('sword')};
const inventory={slots:[piece,{itemId:id,quantity:1,forge:forged('donor',0)},null,...Array(9).fill(null)],equippedWeaponSlot:0,equipment:{leftRing:ring,rightRing:ring},equipmentForges:{leftRing:forged('left'),rightRing:forged('right')},equipmentSockets:{leftRing:'card'},forgeCopies:{[id]:8,[ring]:4}};
const config={chances:Array(10).fill(100),rerollCost:60,rareAfter:4,claimCopies:true,enhanceSteps:Array.from({length:10},(_,rank)=>({copies:1+Math.floor(rank/3),gold:12*(rank+1),chance:rank>4?78:100,downgradeChance:rank>4?20:0,breakChance:rank>4?2:0,breakOnFailure:rank>4}))};
const me={alive:true,level:25,persistent:true};let ready=true,accepted=false;
const ctx={$,renderItemTile(){},renderItemPreview(){},Option:class{constructor(text,value){Object.assign(this,{text,value});}},inventoryState:inventory,room:{state:{forgeCatalog:JSON.stringify(config)}},drawerActive:null,
  economyReady:()=>ready,currentBagSlots:()=>inventory.slots,currentEquippedWeaponSlot:()=>inventory.equippedWeaponSlot,
  bagMeta:id=>metadata[id],personalItems:metadata,WEAPON_META:{},bodyLabels:{leftRing:'แหวนซ้าย',rightRing:'แหวนขวา'},forgeNames:{melee:'โจมตีประชิด',guard:'ป้องกันมอนสเตอร์'},
  ownServerCharacter:()=>me,economyPending:false,itemUsePending:false,economyGold:1000,selectedBagSlot:0,inspectingGear:null,benchTrail:[],
  itemHuntCount:(id,stock=false)=>id==='ref_seal_2'?2:inventory.slots.filter(x=>x?.itemId===id).length+Object.values(inventory.equipment).filter(x=>x===id).length+(stock?(inventory.forgeCopies[id]||0):0),
  bindItemHuntButton:(button,id)=>{button.hidden=!id;},economyRequestId:()=>`request_${sent.length}`,window:{confirm:message=>{prompts.push(message);return accepted;}},
  economySend:(command,payload,durable)=>{sent.push({command,payload,durable});if(durable)ctx.economyPending=true;},
  openDrawer:(name,title,html)=>{ctx.drawerActive=name;ctx.title=title;elements.clear();for(const match of html.matchAll(/id="([^"]+)"/g))elements.set(match[1],control());ctx.html=html;},
  openBag:()=>{ctx.drawerActive='bag';routes.push('bag');elements.clear();for(const id of ['cardSocketPanel','craftPanel'])elements.set(id,control());},
  selectBenchRecipe:(...args)=>routes.push(args),renderBag:()=>{if(ctx.drawerActive==='forge')ctx.renderForgePage();}};
const code=slice('  function wornGearAt(','  function pieceStat(')+slice('  function gearStamp(','  function accessoryStamp(')+slice('  function forgeLabel(','  function salvageSelectedGear(')+slice('  function renderForgeStock(','  function openBag()');
vm.createContext(ctx);vm.runInContext(code,ctx);
const callbacks={};ctx.joined=ctx.room;ctx.joined.onMessage=(name,handler)=>{callbacks[name]=handler;};
ctx.finishEconomyPending=()=>{ctx.economyPending=false;};ctx.toast=()=>{};
vm.runInContext(slice('      joined.onMessage("craft_result",','      joined.onMessage("market_result",'),ctx);
const run=code=>vm.runInContext(code,ctx);
run('openSmith()');assert.equal(ctx.drawerActive,'smith');$('smithEnhance').onclick();
assert.equal(ctx.drawerActive,'forge');assert.equal(ctx.title,'ตีบวกอุปกรณ์');assert.equal($('forgeGear').value,'bag:0');
assert.equal($('forgeEnhanceSection').hidden,false);assert.equal($('forgeRerollSection').hidden,true);assert.equal($('forgeGear').options.length,5);
assert.match($('forgeInfo').textContent,/PvE/);assert.match($('forgeEnhance').textContent,/89 ทอง/);
// Selecting an equipped body accessory uses its true side, identity and card.
$('forgeGear').value='worn:leftRing';$('forgeGear').onchange();assert.equal($('forgeEnhance').disabled,true);assert.equal($('forgeCardHelp').hidden,false);
$('forgeGear').value='worn:rightRing';$('forgeGear').onchange();assert.equal($('forgeEnhance').disabled,false);
$('forgeEnhance').onclick();assert.equal(sent.filter(x=>x.durable).length,0);assert.match(prompts.at(-1),/แตกถาวร 2%/);
accepted=true;$('forgeEnhance').onclick();let command=sent.at(-1);
assert.equal(command.command,'forge_weapon');assert.equal(command.payload.slot,'rightRing');assert.equal(command.payload.stamp,'right.2');assert.equal(command.payload.copies,2);assert.equal(command.payload.acceptBreak,true);assert.equal(command.payload.acceptDowngrade,true);
assert.equal($('forgeGear').disabled,true);const count=sent.length;$('forgeEnhance').onclick();assert.equal(sent.length,count,'double click cannot duplicate a pending mutation');
ctx.economyPending=false;run('renderForgePage()');assert.equal($('forgeGear').disabled,false);
// Revisions update in place; replacement instances never silently become the target.
inventory.equipmentForges.rightRing.revision=3;run('renderForgePage()');assert.equal($('forgeGear').value,'worn:rightRing');
inventory.equipmentForges.rightRing=forged('replacement');run('renderForgePage()');assert.equal($('forgeGear').value,'');assert.equal($('forgePanel').hidden,true);
run('openForgePage("reroll",0)');assert.equal($('forgeEnhanceSection').hidden,true);assert.equal($('forgeRerollSection').hidden,false);
assert.match($('forgeAffixInfo').textContent,/แทนที่ของเดิม/);assert.match($('forgeRerollPity').textContent,/2\/4/);
$('forgeReroll').onclick();command=sent.at(-1);assert.deepEqual(Object.keys(command.payload).sort(),['action','requestId','slot','stamp']);assert.equal(command.payload.action,'reroll');assert.equal(command.payload.slot,0);
ctx.economyPending=false;ctx.economyGold=0;run('renderForgePage()');assert.equal($('forgeReroll').disabled,true);
ctx.economyGold=1000;const countItems=ctx.itemHuntCount;ctx.itemHuntCount=()=>0;run('renderForgePage()');assert.equal($('forgeReroll').disabled,true);ctx.itemHuntCount=countItems;
me.alive=false;run('renderForgePage()');assert.equal($('forgeReroll').disabled,true);assert.match($('forgeActionStatus').textContent,/เกิดใหม่/);
me.alive=true;me.level=1;run('renderForgePage()');assert.equal($('forgeReroll').disabled,true);me.level=25;
// An inventory update after destruction removes the selection but leaves recovery stock.
inventory.slots[0]=null;run('renderForgePage()');assert.equal($('forgeGear').value,'');assert.equal($('forgePanel').hidden,true);assert.equal($('forgeStock').hidden,false);
ctx.economyPending=true;callbacks.forge_result({itemId:id,broken:true,forge:piece.forge,action:'enhance'});
assert.equal(ctx.economyPending,false);assert.equal($('forgeStock').open,true);assert.equal($('forgeStockGear').value,id);
inventory.slots[2]={itemId:id,quantity:1,forge:forged('claimed',0)};ctx.economyPending=true;
callbacks.forge_copy_claimed({gear:id,instanceId:'claimed',remaining:7});
assert.equal(ctx.economyPending,false);assert.equal($('forgeGear').value,'bag:2','claim selects returned instance, not another identical model');
// Legacy first-forge identity acquisition remains selected, then protects its new identity.
inventory.slots[0]={itemId:id,quantity:1};run('openForgePage("enhance",0)');inventory.slots[0].forge=forged('new');run('renderForgePage()');assert.equal($('forgeGear').value,'bag:0');
inventory.slots[0].forge=forged('other');run('renderForgePage()');assert.equal($('forgeGear').value,'');
// Card routes retain the exact body target; recipes now use the dedicated crafting route.
run('openForgePage("enhance","leftRing")');$('forgeCardHelp').onclick();assert.equal(ctx.drawerActive,'bag');assert.equal(ctx.inspectingGear,'leftRing');assert.equal($('cardSocketPanel').scrolled,true);
run('openForgePage("enhance",1)');const recipeRoutes=routes.length;$('forgeCopyRecipe').onclick();assert.equal(routes.length,recipeRoutes+1);assert.deepEqual(routes.at(-1),['all','25',id]);
// Disconnect, room replacement and unsupported servers cannot retain actionable controls.
run('openForgePage("enhance",1)');ready=false;run('renderForgePage()');assert.equal($('forgeGear').disabled,true);assert.equal($('forgePanel').hidden,true);assert.equal($('forgeStock').hidden,true);
ready=true;run('openForgePage("enhance",1)');ctx.room={state:{forgeCatalog:JSON.stringify(config)}};run('renderForgePage()');assert.equal($('forgeGear').value,'');
run('openForgePage("enhance",1)');ctx.room.state.forgeCatalog='';run('renderForgePage()');assert.equal($('forgePanel').hidden,true);assert.match($('forgePageStatus').textContent,/ยังไม่ส่ง/);
// Existing event paths dispatch through renderBag, which now also refreshes the forge page.
assert.match(source,/if \(drawerActive === "forge"\) \{ renderForgePage\(\); return; \}/);
assert.match(source,/if\(drawerActive==="forge" && slot>=0\)selectForgeTarget\(slot\)/);
assert.match(source,/forge\.onclick=\(\)=>openForgePage\("enhance",goal\.slot\)/);
assert.match(source,/smith:"character",forge:"character"/);
const bagCode=slice('  function openBag()','  function updateFieldAlerts()');assert(!bagCode.includes('id="forgePanel"'));assert(!bagCode.includes('id="forgeStock"'));assert(bagCode.includes('id="bagForge"'));
// Both the paperdoll character tab and the bag use one shared shortcut binder.
const profileCode=slice('  function openCharacterProfile()','  // Taps on any game button');
assert(!profileCode.includes('id="forgePanel"'));assert(!profileCode.includes('id="forgeStock"'));assert(profileCode.includes('id="cpForge"'));
assert.equal([...source.matchAll(/function submitForge\(/g)].length,1);
const shortcut={},workshop={},opened=[],binder={drawerActive:"bag",BAG_PAGE_SIZE:0,BAG_TOTAL_PAGES:0,ui:{drawerBody:{querySelectorAll:()=>[]}},$:id=>id==='bagForge'?shortcut:id==='cpForge'?workshop:null,INVENTORY_SLOTS:0,bodyLabels:{},inspectingGear:'leftRing',selectedBagSlot:3,
  currentEquippedWeaponSlot:()=>4,openForgePage:(...args)=>opened.push(args),openSmith:()=>opened.push("smith"),journeyNotesForPlayer:()=>({}),economyReady:()=>false};
vm.runInNewContext(slice('  function bindBagControls()','  function renderBag()')+'\nbindBagControls()',binder);
shortcut.onclick();assert.deepEqual(opened.at(-1),['enhance','leftRing']);binder.inspectingGear='mainHand';shortcut.onclick();assert.deepEqual(opened.at(-1),['enhance',4]);binder.inspectingGear=null;shortcut.onclick();assert.deepEqual(opened.at(-1),['enhance',3]);
binder.drawerActive="character";vm.runInNewContext(slice('  function bindBagControls()','  function renderBag()')+'\nbindBagControls()',binder);workshop.onclick();assert.equal(opened.at(-1),"smith");
assert.match(source,/closeEquipPopup\(\); openForgePage\("enhance", target\)/);
// Real pending timeout sends only read requests and refreshes the open item view.
let timeout,refreshes=0;const wire=[];
const pending={economyPending:false,economyTimer:null,economyReady:()=>true,room:{send:(command,payload)=>wire.push({command,payload})},centralMarketVersion:0,
  setTimeout:handler=>{timeout=handler;return 1;},clearTimeout(){},toast(){},renderEconomy(){},renderBag(){refreshes++;}};
vm.createContext(pending);vm.runInContext(slice('  function finishEconomyPending()','  function economyReady()')+slice('  function economySend(','  function economyRequestId()'),pending);
pending.economySend('forge_weapon',{requestId:'one'},true);pending.economySend('forge_weapon',{requestId:'two'},true);assert.equal(wire.length,1);
timeout();assert.equal(pending.economyPending,false);assert.deepEqual(wire.map(x=>x.command),['forge_weapon','get_economy','market_list']);assert.equal(refreshes,2);
pending.room.send=()=>{throw Error('offline');};pending.economySend('forge_weapon',{requestId:'three'},true);assert.equal(pending.economyPending,false);assert.equal(refreshes,3);
console.log('PASS dedicated forge pages: routes, selection, body sockets, identity, requests, reroll, pending, break recovery, legacy IDs and disconnect');
