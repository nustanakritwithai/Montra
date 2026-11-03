/** Export the playable server catalog. Run with tsx and pass a destination CSV path. */
import {writeFileSync} from "node:fs";
import {PERSONAL_ITEMS,personalItem} from "../deploy/combat/PersonalItems.js";
import {POTION_ID,SHRINE_SHARD,WEAPON_STATS} from "../deploy/combat/ItemRules.js";
import {personalGearGuides} from "../deploy/combat/GearGuides.js";

const pathNames:Record<string,string>={all:"ทุกสาย",muay_boran:"มวยไทยโบราณ",phutthaisawan:"นักดาบอยุธยา",blade:"คมดาบ",sentinel:"ผู้พิทักษ์",seer:"ผู้ร่ายเวท",mender:"ผู้เยียวยา"};
const slots:Record<string,string>={mainHand:"อาวุธหลัก",offHand:"มือรอง",head:"หัว",shoulders:"ไหล่",chest:"อก",arms:"แขน",leftHand:"มือซ้าย",rightHand:"มือขวา",legs:"กางเกง",feet:"เท้า",neck:"สร้อย",ring:"แหวนซ้ายหรือขวา",earring:"ตุ้มหูซ้ายหรือขวา",material:"วัตถุดิบ",catalyst:"วัสดุช่าง",card:"การ์ดมอนสเตอร์",consumable:"ของใช้"};
const ratings:Record<string,string>={melee:"ประชิด",ranged:"เวท",guard:"ป้องกันมอนสเตอร์",healing:"รักษา"};
const statNames:Record<string,string>={hp:"HP",stamina:"Stamina",mana:"MP",atk:"ATK",def:"DEF",magicAtk:"เวท",magicDef:"ต้านเวท"};
const rows:(string|number)[][]=[
  ["รหัส","ชื่อ","เลเวล","ตำแหน่ง / ประเภท","อาชีพที่ใช้ได้","แนะนำสำหรับ","ความหายาก","สเตตัสพื้นฐาน","ผลตีบวก +10 (PvE)","ออปชันที่สุ่มได้","ค่าออปชันสูงสุดของเลเวลนี้ (PvE)","การ์ดต่อชิ้น","สูตรคราฟต์","ค่าคราฟต์ (ทอง)","แหล่งหา"]
];
for(const [id,item] of Object.entries(PERSONAL_ITEMS)){
  const f=item.forge,level=item.level??1, cap=level<25?1:level<65?2:3;
  const stats=Object.entries(item.stats).map(([key,v])=>statNames[key]+" +"+v).join(" / ");
  const source=item.kind==="card"?item.monster+" "+item.chancePct+"%":item.dropMax?(item.recipe?"คราฟต์ / ":"")+"ล่ามอนสเตอร์ Lv."+level+(item.dropMax===level?"":"–"+item.dropMax):"คราฟต์";
  rows.push([id,item.name,level,slots[item.kind],pathNames[item.path],(item.recommended??[]).map(p=>pathNames[p]).join(" / "),item.rarity??"",stats|| (item.healHp?"ฟื้น "+item.healHp+" HP":""),
    f?ratings[f.primary]+" +"+f.enhanceMax:"",f?f.pool.map(k=>ratings[k]).join(" / "):"",f?Number((f.affixMax*cap/3).toFixed(2)):"",f?1:"",
    (item.recipe??[]).map(i=>i.item+" × "+i.qty).join(" + "),item.craftGold??"",source]);
}
const legacyNames:Record<string,string>={health_potion:"ยาเลือดเล็ก",shrine_shard:"เศษตราผู้พิทักษ์",ritual_dagger:"มีดหมอ",arcane_sword:"กระบี่อาคม",spirit_staff:"คทาวิญญาณ",shrine_glaive:"ง้าวจันทร์ผู้พิทักษ์",muay_wraps:"ผ้าคาดเชือก"};
for(const id of [POTION_ID,SHRINE_SHARD,...Object.keys(WEAPON_STATS)]){
  const weapon=Object.hasOwn(WEAPON_STATS,id);
  rows.push([id,legacyNames[id],id==="shrine_glaive"?12:1,weapon?"อาวุธหลัก":"ของเดิม","ตามกฎเดิม","","","","","","",weapon?1:"",id==="shrine_glaive"?"shrine_shard × 1":"",id==="shrine_glaive"?100:"","ระบบเดิม"]);
}
const destination=process.argv[2];if(!destination)throw Error("Expected a destination .csv path");
function writeCsv(file:string,table:(string|number)[][]){
  const csv=table.map(values=>values.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(",")).join("\r\n");
  writeFileSync(file,"\uFEFF"+csv+"\r\n","utf8");
}
writeCsv(destination,rows);
console.log("Exported "+(rows.length-1)+" item IDs");
if(process.argv[3]){
  const builds:(string|number)[][]=[["อาชีพ","ชุดแนะนำ Lv.100","ตำแหน่ง","รหัส","ชื่อ","ออปชันแนะนำ","การ์ดแนะนำ","มอนสเตอร์เจ้าของการ์ด","โอกาสดรอปการ์ด (%)","ตัวอย่างมอนสเตอร์ที่ดรอปอุปกรณ์","เลเวลมอนสเตอร์","แผนที่"]];
  const slotNames:Record<string,string>={...slots,leftEar:"ตุ้มหูซ้าย",rightEar:"ตุ้มหูขวา",leftRing:"แหวนซ้าย",rightRing:"แหวนขวา"};
  for(const path of Object.keys(pathNames).filter(p=>p!=="all"))for(const build of personalGearGuides(path,100)!.builds)for(const piece of build.slots){
    const item=PERSONAL_ITEMS[piece.id],card=personalItem(piece.card);
    builds.push([pathNames[path],build.name,slotNames[piece.position],piece.id,item.name,ratings[piece.affix],card?.name??"",card?.monster??"",card?.chancePct??"",piece.hunt?.monster??"",piece.hunt?.level??"",piece.hunt?.map??""]);
  }
  writeCsv(process.argv[3],builds);
}
