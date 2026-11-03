const fs=require("node:fs"),vm=require("node:vm"),assert=require("node:assert/strict");
const source=fs.readFileSync("main.js","utf8");
{
  const start=source.indexOf("  function sgRankText("),end=source.indexOf("  const SG_GLYPH",start);
  assert.ok(start>=0 && end>start,"graph rank labels must exist");
  const labels=vm.runInNewContext(source.slice(start,end)+"\nsgRankText");
  assert.match(labels("occult",{effect:"heal",rank:2,nextLv:65}),/PvE และ PvP.*\+4%.*\+6%/);
  assert.match(labels("sentinel",{effect:"ward",rank:5}),/PvE และ PvP.*\+10%/);
  assert.match(labels("sentinel",{effect:"stun",rank:2}),/ดาเมจมอนสเตอร์ \+8%/);
}
for(const spec of [
  {name:"Blade",next:"syncOccultUI",branch:"edge",id:"hidden_edge"},
]){
  const start=source.indexOf("  function render"+spec.name+"Book("),end=source.indexOf("  function "+spec.next+"(",start);
  assert.ok(start>=0 && end>start,"book renderer must exist");
  const container={innerHTML:"",contains:()=>false,querySelectorAll:()=>[]},reset={};
  const book={learned:[spec.id],slots:[spec.id,null,null,null],practice:{},ranks:{[spec.id]:1}};
  const data={book,lessons:{[spec.id]:{name:"ทดสอบ",description:"ทดสอบ",branch:spec.branch,effect:"strike",level:1,requires:[],practice:{},power:1,stamina:10,cooldownMs:1000}},practiceLabels:{},points:13,rankLevels:[25,45,65,85,95],rankable:[spec.id]};
  const context={document:{activeElement:null},ownServerCharacter:()=>({level:25}),$:id=>id.endsWith("BookBody")?container:reset,room:{send(){}},window:{confirm:()=>false}};
  context[spec.name.toLowerCase()+"BookState"]=data;context[spec.name.toLowerCase()+"BookRenderKey"]="";
  vm.runInNewContext(source.slice(start,end)+"\nrender"+spec.name+"Book();",context);
  assert.match(container.innerHTML,/แต้มว่าง 11/);
  assert.match(container.innerHTML,/ขั้น 2\/6/);
  assert.match(container.innerHTML,/ขั้นถัดไป Lv\.45/);
  assert.match(container.innerHTML,new RegExp("data-"+spec.name.toLowerCase()+"-upgrade"));
}
{
  const start=source.indexOf("  function renderOccultBook("),end=source.indexOf("  let selectedMuaySkill",start);
  const container={innerHTML:"",contains:()=>false,querySelectorAll:()=>[]},dummy={};
  const lesson={name:"ทดสอบ",description:"ทดสอบ",path:"mender",effect:"pve_rice",level:25,requires:[],training:0,range:12,stamina:18,cooldownMs:6000};
  const data={path:"mender",points:13,book:{learned:{seer:[],mender:["mender_pve_rice"]},loadouts:{mender:["mender_pve_rice",null,null,null]},training:{mender:8},ranks:{mender_pve_rice:1},mastery:{mender:{}}},lessons:{mender_pve_rice:lesson},masteryLabels:{mender:{}},rankLevels:[25,45,65,85,95],rankable:["mender_pve_rice"]};
  const context={document:{activeElement:null},ownServerCharacter:()=>({level:25,pathId:"mender"}),$:id=>id==="occultBookBody"?container:dummy,occultBookState:data,occultBookRenderKey:"",window:{confirm:()=>false},room:{send(){}},closeDrawer(){},toggleFlight(){}};
  vm.runInNewContext(source.slice(start,end)+"\nrenderOccultBook();",context);
  assert.match(container.innerHTML,/แต้มว่าง 11/);assert.match(container.innerHTML,/data-occult-upgrade/);
}
{
  const start=source.indexOf("  function renderSentinelBook("),end=source.indexOf("  function syncBladeUI(",start);
  const container={innerHTML:"",querySelectorAll:()=>[]},dummy={};
  const ids=["shock","bulwark","riposte","protect"],core=Object.fromEntries(ids.map(id=>[id,{name:id,description:id,stamina:20,cooldownMs:10000}]));
  const progress=Array.from({length:9},()=>({shock:{range:3.5,monsterStunMs:700},bulwark:{defense:.25,durationMs:6000},riposte:{durationMs:2000,damageFactor:.75,counterPower:1,counterIntervalMs:450},protect:{durationMs:6000,tauntRange:8,tauntMs:3000}}));
  const data={book:{coreRanks:{riposte:1}},core,coreLevels:[5,15,25,35,45,60,80,100],corePointLevels:[5,15,25,35,45,55,65,75,80,85,95,100],coreProgress:progress};
  const context={sentinelBookState:data,ownServerCharacter:()=>({level:25}),$:id=>id==="sentinelBookBody"?container:dummy,sentinelBookRenderKey:"",window:{confirm:()=>false},room:{send(){}}};
  vm.runInNewContext(source.slice(start,end)+"\nrenderSentinelBook();",context);
  assert.ok(container.innerHTML.includes("แต้มวิชา 2 / 3"));assert.ok(container.innerHTML.includes('data-sentinel-core-upgrade="riposte"'));
  assert.ok(container.innerHTML.includes("รับแทน 30%"));assert.equal((container.innerHTML.match(/data-sentinel-core-upgrade=/g)||[]).length,4);
}
{
  const start=source.indexOf("  function renderSeerCoreBook("),end=source.indexOf("  let selectedMuaySkill",start);
  const container={innerHTML:"",querySelectorAll:()=>[]},dummy={};
  const ids=["seer_pot","seer_binding","seer_poison","seer_buffalo"],core=Object.fromEntries(ids.map(id=>[id,{name:id,description:id,stamina:20,cooldownMs:10000}]));
  const coreProgress=Array.from({length:9},()=>({seer_pot:{pvePower:1},seer_binding:{range:10,poisonBonus:0,pvpDurationMs:25000,pvpImmunityMs:40000},seer_poison:{range:12,pveFraction:.02,pvpFraction:.04,intervalMs:2500},seer_buffalo:{range:15,power:2,castMs:900}}));
  const data={book:{coreRanks:{seer_binding:1}},core,coreLevels:[5,15,25,35,45,60,80,100],corePointLevels:[5,15,25,35,45,55,65,75,80,85,95,100],coreProgress};
  const context={occultBookRenderKey:"",$:()=>dummy,window:{confirm:()=>false},room:{send(){}}};
  vm.runInNewContext(source.slice(start,end)+"\nrenderSeerCoreBook",context)(data,{level:25},container);
  assert.ok(container.innerHTML.includes("แต้มวิชา 2 / 3"));
  assert.ok(container.innerHTML.includes('data-seer-core-upgrade="seer_binding"'));
  assert.ok(container.innerHTML.includes("จนเหลือ 1 HP"));
  assert.ok(container.innerHTML.includes("PvP สะกด 25 วิ"));
  assert.ok(container.innerHTML.includes("พิษ PvP 4%"));
  assert.equal((container.innerHTML.match(/data-seer-core-upgrade=/g)||[]).length,4);
}
{
  const start=source.indexOf("  function renderMenderCoreBook("),end=source.indexOf("  let selectedMuaySkill",start);
  const container={innerHTML:"",querySelectorAll:()=>[]},dummy={};
  const ids=["mender_core_heal","mender_core_circle","mender_core_ward","mender_core_cleanse"],core=Object.fromEntries(ids.map(id=>[id,{name:id,description:id,stamina:20,cooldownMs:10000}]));
  const coreProgress=Array.from({length:9},()=>({mender_core_heal:{range:12,tickFraction:.02,durationMs:10000,intervalMs:2000},mender_core_circle:{range:8,fraction:.30},mender_core_ward:{range:7,durationMs:4000},mender_core_cleanse:{range:8,bonus:.10,durationMs:10000}}));
  const data={book:{menderCoreRanks:{mender_core_heal:1}},core,coreLevels:[5,15,25,35,45,60,80,100],corePointLevels:[5,15,25,35,45,55,65,75,80,85,95,100],coreProgress};
  const context={occultBookRenderKey:"",$:()=>dummy,window:{confirm:()=>false},room:{send(){}}};
  vm.runInNewContext(source.slice(start,end)+"\nrenderMenderCoreBook",context)(data,{level:25},container);
  assert.ok(container.innerHTML.includes("แต้มวิชา 2 / 3"));
  assert.ok(container.innerHTML.includes('data-mender-core-upgrade="mender_core_heal"'));
  assert.ok(container.innerHTML.includes("ล้างพิษ คำสาป และสถานะหยุด"));
  assert.ok(container.innerHTML.includes("ป้องกันการโจมตี 100%"));
  assert.equal((container.innerHTML.match(/data-mender-core-upgrade=/g)||[]).length,4);
}
{
  const start=source.indexOf("  function renderMuayBook("),end=source.indexOf("  function swordData(",start);
  const container={innerHTML:"",querySelectorAll:()=>[]},dummy={};
  const levels=[5,15,25,35,45,60,80,100],points=[5,15,25,35,45,55,65,75,80,85,95,100];
  const core={
    chaiya:{name:"ไชยา",description:"ตั้งรับ",stamina:18,cooldownMs:12000},
    korat:{name:"โคราช",description:"หมัดหนัก",stamina:24,cooldownMs:12000},
    lopburi:{name:"ลพบุรี",description:"ฉากพุ่ง",stamina:18,cooldownMs:10000},
    thasao:{name:"ท่าเสา",description:"พุ่งรัว",stamina:24,cooldownMs:12000}
  };
  const progress=Array.from({length:9},(_,rank)=>({
    chaiya:{durationMs:2000+400*rank,damageFactor:0.65,counterPower:1,counterIntervalMs:400},
    korat:{scale:1,finalPower:0.75},
    lopburi:{distance:3,followMs:3000,followPower:1.05,staggerMs:0},
    thasao:{range:7,hits:3,hitPower:0.26,staggerMs:600}
  }));
  const data={me:{level:25,muayBookData:"v"},book:{coreRanks:{chaiya:1}},catalog:{core,coreLevels:levels,corePointLevels:points,coreManaPerRank:1,coreProgress:progress}};
  const context={muayBookData:()=>data,$:id=>id==="muayBookBody"?container:dummy,muayBookRenderKey:"",window:{confirm:()=>false},room:{send(){}}};
  vm.runInNewContext(source.slice(start,end)+"\nrenderMuayBook();",context);
  assert.match(container.innerHTML,/แต้มวิชา 2 \/ 3/);
  assert.match(container.innerHTML,/ขั้น 1\/8/);
  assert.match(container.innerHTML,/ขั้นต่อไป Lv\.15/);
  assert.match(container.innerHTML,/data-core-upgrade="chaiya"/);
  assert.match(container.innerHTML,/ปัจจุบัน/);
  assert.match(container.innerHTML,/ขั้นถัดไป/);
}
{
  const start=source.indexOf("  function renderSwordTree("),end=source.indexOf("  function ancestryHint(",start);
  const container={innerHTML:"",querySelectorAll:()=>[]},dummy={};
  const ids=["phuttha_core","sritra_core","atamat_core","chumphon_core"],core=Object.fromEntries(ids.map(id=>[id,{name:id,description:id,stamina:20,cooldownMs:10000}]));
  const progress=Array.from({length:9},()=>({phuttha_core:{scale:1,finalPower:.65},sritra_core:{durationMs:2000,damageFactor:.7,counterPower:1,counterIntervalMs:400},atamat_core:{range:3.5,power:.85},chumphon_core:{range:8,defense:.1,durationMs:8000}}));
  const data={me:{level:25,swordTreeData:"v"},tree:{coreRanks:{sritra_core:1}},catalog:{core,coreLevels:[5,15,25,35,45,60,80,100],corePointLevels:[5,15,25,35,45,55,65,75,80,85,95,100],coreProgress:progress}};
  const context={swordData:()=>data,$:id=>id==="swordTreeBody"?container:dummy,swordTreeRenderKey:"",window:{confirm:()=>false},room:{send(){}}};
  vm.runInNewContext(source.slice(start,end)+"\nrenderSwordTree();",context);
  assert.ok(container.innerHTML.includes("แต้มวิชา 2 / 3"));assert.ok(container.innerHTML.includes("ขั้น 1/8"));
  assert.ok(container.innerHTML.includes('data-sword-core-upgrade="sritra_core"'));assert.ok(container.innerHTML.includes("สวนซ้ำทุก"));
  assert.equal((container.innerHTML.match(/data-sword-core-upgrade=/g)||[]).length,4);
}
{
  const start=source.indexOf("  function renderBladeCoreBook("),end=source.indexOf("  function syncOccultUI(",start);
  const container={innerHTML:"",querySelectorAll:()=>[]},dummy={};
  const ids=["blade_vanish","blade_heavy","blade_withdraw","blade_fury"],core=Object.fromEntries(ids.map(id=>[id,{name:id,description:id,stamina:20,cooldownMs:10000}]));
  const coreProgress=Array.from({length:9},()=>({blade_vanish:{durationMs:5000},blade_heavy:{range:3,power:1.9,pvpPower:1.9},blade_withdraw:{power:1,pvpPower:1,distance:2.5},blade_fury:{bonus:.2,durationMs:8000}}));
  const data={book:{coreRanks:{blade_vanish:1}},core,coreLevels:[5,15,25,35,45,60,80,100],corePointLevels:[5,15,25,35,45,55,65,75,80,85,95,100],coreProgress};
  const context={bladeBookRenderKey:"",$:()=>dummy,window:{confirm:()=>false},room:{send(){}}};
  vm.runInNewContext(source.slice(start,end)+"\nrenderBladeCoreBook",context)(data,{level:25},container);
  assert.match(container.innerHTML,/แต้มวิชา 2 \/ 3/);assert.match(container.innerHTML,/หายตัวทันที/);
  assert.equal((container.innerHTML.match(/data-blade-core-upgrade=/g)||[]).length,4);
}
console.log("MONTRA skill rank book render passed");
