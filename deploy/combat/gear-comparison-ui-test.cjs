const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const source=fs.readFileSync("main.js","utf8");
function section(first,last){
  const start=source.indexOf(first),end=source.indexOf(last,start);
  assert(start>=0 && end>start);return source.slice(start,end);
}
const items={
  guard:{kind:"ring",stats:{def:3}},
  old:{kind:"ring",stats:{atk:2},forge:{primary:"healing",enhanceMax:5,affixMax:3}},
  new:{kind:"ring",stats:{atk:4,mana:5},forge:{primary:"healing",enhanceMax:7,affixMax:4,affixTierCap:3}},
  staff:{kind:"mainHand",stats:{mana:8}},card:{name:"การ์ดทดสอบ",stats:{atk:3}},
};
const gear={equipment:{leftRing:"guard",rightRing:"old"},equipmentSockets:{rightRing:"card"},
  equipmentForges:{rightRing:{rank:10,affix:{stat:"healing",tier:3}}}};
const env={personalItems:items,inventoryState:gear,gearGuides:{level:100,baseMana:318,manaCap:320},
  currentEquippedWeaponSlot:()=>0,ownServerCharacter:()=>({level:100}),economyReady:()=>true,
  statNames:{atk:"โจมตี",def:"ป้องกัน",mana:"มานา"},forgeNames:{melee:"ประชิด",healing:"รักษา"},
  WEAPON_META:{ritual_dagger:{melee:4}},bodyLabels:{leftRing:"แหวนซ้าย",rightRing:"แหวนขวา"}};
const api=vm.runInNewContext(section("  function statLine(","  const bodyLabels")+
  section("  function wearPositions(","  function gearDestination")+
  section("  function wornGearAt(","  let demoWeaponSlot")+
  section("  function guideDestination(","  function selectGuideCopy")+
  "({gearComparison,wornGearAt,guideDestination,guideUpgradeStep})",env);
const slots=[{itemId:"staff"}],entry={position:"leftRing",id:"new",affix:"healing",card:"card"};
const partner={position:"rightRing",id:"guard"},build=[entry,partner];
const pos=api.guideDestination(entry,build,slots);
assert.equal(pos,"rightRing");assert.equal(api.guideDestination(partner,build,slots),"leftRing");
const worn=api.wornGearAt(pos,slots);
let delta=api.gearComparison({itemId:"new"},worn,slots);
for(const expected of ["โจมตี -1","รักษา -8","320 → 320"])assert(delta.includes(expected),delta);
delta=api.gearComparison({itemId:"new",socket:"card",forge:{rank:10,affix:{stat:"healing",tier:3}}},worn,slots);
for(const expected of ["โจมตี +2","รักษา +3"])assert(delta.includes(expected),delta);
assert.equal(api.gearComparison(worn,worn,slots),"สเตตัสและโบนัส PvE เท่ากัน");
assert.match(api.gearComparison({itemId:"ritual_dagger"},null,slots),/โบนัส PvE ประชิด \+4/);
assert.match(api.guideUpgradeStep(entry,{itemId:"new"},10),/เจาะรู/);
assert.match(api.guideUpgradeStep(entry,{itemId:"new",socket:"card",forge:{rank:9}},10),/\+10/);
assert.match(api.guideUpgradeStep(entry,{itemId:"new",socket:"card",forge:{rank:10,affix:{stat:"healing",tier:1}}},10),/ขั้น 3/);
console.log("PASS physical accessory slot, worn card and forge comparison, effective mana and gear upgrade steps");
