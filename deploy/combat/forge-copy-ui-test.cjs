const assert=require("node:assert/strict");
const fs=require("node:fs"),vm=require("node:vm"),path=require("node:path");
const source=fs.readFileSync(path.join(__dirname,"../../main.js"),"utf8");
const render=source.slice(source.indexOf("  function forgeSupplyCount("),source.indexOf("  function renderCardSocket("))+
  source.slice(source.indexOf("  function forgeRiskText("),source.indexOf("  // Presentation only:",source.indexOf("  function renderForge(")));
const id="acc_ring_atk_1",piece={itemId:id,forge:{rank:9,misses:0}};
const slots=[piece,{itemId:id},{itemId:id,socket:"card_possessed"},{itemId:"acc_ring_atk_2"}];
const stock={[id]:2},meta={name:"แหวน",level:1,recipe:[{}],forge:{primary:"melee",pool:["melee"],enhanceMax:4}};
const controls=new Map(),goals=[];
function $(key){
  if(!controls.has(key))controls.set(key,{value:"",dataset:{},replaceChildren(...options){this.options=options;this.value=options[0].value;}});
  return controls.get(key);
}
const config={chances:Array(10),maxMisses:3,rerollCost:60,enhanceSteps:Array(10)};
config.enhanceSteps[3]={copies:2,gold:48,chance:80,downgradeChance:20,breakChance:0,breakOnFailure:false};
config.enhanceSteps[9]={copies:4,gold:120,chance:40,downgradeChance:40,breakChance:20,breakOnFailure:true};
const ctx={$,forgeAnimationBusy:()=>false,beginForgeAnimation(){},renderItemPreview(){},room:{state:{forgeCatalog:JSON.stringify(config)}},bagMeta:()=>meta,economyReady:()=>true,
  forgePageAction:"enhance",forgePageTarget:0,renderForgePage:()=>draw(piece),inventoryState:{forgeCopies:stock},currentBagSlots:()=>slots,inspectingGear:null,selectedBagSlot:0,currentEquippedWeaponSlot:()=>0,
  gearStamp:()=>id,forgeLabel:()=>"",Option:class {constructor(text,value){Object.assign(this,{text,value});}},
  bindItemHuntButton:(...args)=>goals.push(args),itemHuntCount:(_id,include)=>include?2+stock[id]:0,
  personalItems:{},WEAPON_META:{},forgeNames:{melee:"โจมตี"},ownServerCharacter:()=>({alive:true,level:1}),
  economyGold:1000,economyPending:false,itemUsePending:false};
const draw=vm.runInNewContext(render+"\nrenderForge",ctx);
draw(piece);
assert.equal($("forgeEnhance").disabled,true);assert.match($("forgeOdds").textContent,/สำเร็จ 40%/);
assert.deepEqual($("forgeDonor").options.map(o=>o.value),["","1|"+id]); // Skip target, drilled and other model.
assert.deepEqual(goals.at(-1).slice(1),[id,6,false,true]);
stock[id]=3;$("forgeDonor").value="1|"+id;$("forgeDonor").onchange();
assert.equal($("forgeEnhance").disabled,false);
assert.match($("forgeOdds").textContent,/ลดขั้น 40% · แตก 20%/);
piece.socket="card_possessed";draw(piece);
assert.equal($("forgeEnhance").disabled,true);assert.match($("forgeSupply").textContent,/ถอดการ์ดก่อน/);
piece.forge.rank=10;draw(piece);
assert.equal($("forgeEnhance").disabled,true);assert.match($("forgeSupply").textContent,/\+10/);
const submitSource=source.slice(source.indexOf("  function submitForge("),source.indexOf("  function openBag()",source.indexOf("  function submitForge(")));
let confirm=false,prompt="",sent=null;
Object.assign(ctx,{drawerActive:"forge",forgePageAction:"enhance",forgePageIdentity:{itemId:id},forgeTargetItem:()=>piece,economyRequestId:()=>"forge_ui_confirmation",renderBag(){},economySend:(_name,data)=>{sent=data;},
  forgePageRoom:ctx.room,toast(){},window:{confirm(message){prompt=message;return confirm;}}});
const submit=vm.runInNewContext(submitSource+"\nsubmitForge",ctx);
delete piece.socket;piece.forge.rank=9;stock[id]=4;draw(piece);
submit("enhance");assert.equal(sent,null);assert.match(prompt,/สำเร็จ 40%/);assert.match(prompt,/ลดจาก \+9 เหลือ \+8 40% · แตกถาวร 20%/);
confirm=true;submit("enhance");assert.equal(sent.acceptBreak,true);assert.equal(sent.acceptDowngrade,true);assert.equal(sent.copies,4);
piece.forge.rank=3;piece.socket="card_possessed";draw(piece);
assert.equal($("forgeEnhance").disabled,false);assert.match($("forgeOdds").textContent,/ลดขั้น 20% · แตก 0%/);
submit("enhance");assert.equal(sent.acceptDowngrade,true);assert.equal(sent.acceptBreak,undefined);assert.match(prompt,/สำเร็จ 80%/);
const shelfSource=source.slice(source.indexOf("  function renderForgeStock("),source.indexOf("  function renderForge(item)"));
const shelf=vm.runInNewContext(shelfSource+"\nrenderForgeStock",ctx);
ctx.room.state.forgeCatalog=JSON.stringify({...config,claimCopies:true});ctx.inventoryState.slots=[null];
let owned=0;ctx.itemHuntCount=()=>owned;
shelf(id);assert.equal($("forgeStock").hidden,false);assert.equal($("forgeStockClaim").disabled,false);
assert.match($("forgeStockInfo").textContent,/จะเหลือ 3/);
sent=null;confirm=false;$("forgeStockClaim").onclick();assert.equal(sent,null);
confirm=true;$("forgeStockClaim").onclick();assert.equal(sent.gear,id);assert.equal(sent.expectedStock,4);
assert.match(prompt,/\+0 ผูกตัวละคร/);
ctx.inventoryState.slots=[piece];shelf();assert.equal($("forgeStockClaim").disabled,true);assert.match($("forgeStockInfo").textContent,/ช่องว่าง/);
ctx.inventoryState.slots=[null];owned=1;shelf();assert.equal($("forgeStockClaim").disabled,true);
delete stock[id];shelf();assert.equal($("forgeStock").hidden,true);
console.log("PASS forge preview, risk confirmation, spare stock, claim costs and capacity checks");
