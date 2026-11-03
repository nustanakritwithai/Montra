const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const source=fs.readFileSync("main.js","utf8");
const start=source.indexOf("  function salvageSelectedGear("),end=source.indexOf("  function renderCardSocket(",start);
assert(start>=0 && end>start && source.includes('$("salvageGear").onclick=salvageSelectedGear'));
const stampStart=source.indexOf("  function gearStamp("),stampEnd=source.indexOf("  function accessoryStamp(",stampStart);
assert(stampStart>=0 && stampEnd>stampStart);
const item={itemId:"wp_twins_10",bound:true,forge:{instanceId:"example",revision:2},socket:"card_rift_warden"};
const prompts=[],sent=[];
let accepted=false,equipped=null;
const ui={selectedBagSlot:2,currentBagSlots:()=>[null,null,item],currentEquippedWeaponSlot:()=>equipped,inspectingGear:null,
  personalItems:{wp_twins_10:{name:"ดาบคู่",salvage:{item:"mat_metal_7",quantity:3}},mat_metal_7:{name:"แร่เหล็ก"},card_rift_warden:{name:"การ์ดราชัน"}},
  economyReady:()=>true,economyPending:false,itemUsePending:false,forgeLabel:()=>" +1",renderBag:()=>{},economyRequestId:()=>"ui_request",
  window:{confirm:msg=>{prompts.push(msg);return accepted;}},economySend:(...args)=>sent.push(args)};
const click=vm.runInNewContext(source.slice(stampStart,stampEnd)+source.slice(start,end)+"\nsalvageSelectedGear",ui);
click();assert.equal(sent.length,0);
assert.match(prompts[0],/ดาบคู่ \+1/);assert.match(prompts[0],/แร่เหล็ก ×3/);assert.match(prompts[0],/คืนการ์ดราชัน/);
accepted=true;click();
assert.deepEqual(JSON.parse(JSON.stringify(sent)),[["salvage_gear",{requestId:"ui_request",slot:2,gear:"wp_twins_10",stamp:"example.2",bound:true,socket:"card_rift_warden"},true]]);
equipped=2;click();equipped=null;ui.inspectingGear="neck";click();ui.inspectingGear=null;ui.economyPending=true;click();
assert.equal(prompts.length,2);assert.equal(sent.length,1);
console.log("PASS salvage preview, cancel, confirmation and equipped-item guards");
