/** Export the playable server catalog. Run with tsx and pass a destination CSV path. */
import {writeFileSync} from "node:fs";
import {PERSONAL_ITEMS} from "../deploy/combat/PersonalItems.js";
import {POTION_ID,SHRINE_SHARD,WEAPON_STATS} from "../deploy/combat/ItemRules.js";

const pathNames:Record<string,string>={all:"ทุกสาย",muay_boran:"มวยไทยโบราณ",phutthaisawan:"นักดาบอยุธยา",blade:"คมดาบ",sentinel:"ผู้พิทักษ์",seer:"ผู้ร่ายเวท",mender:"ผู้เยียวยา"};
const slots:Record<string,string>={mainHand:"อาวุธหลัก",offHand:"มือรอง",head:"หัว",shoulders:"ไหล่",chest:"อก",arms:"แขน",leftHand:"มือซ้าย",rightHand:"มือขวา",legs:"กางเกง",feet:"เท้า",neck:"สร้อย",ring:"แหวนซ้ายหรือขวา",earring:"ตุ้มหูซ้ายหรือขวา",material:"วัตถุดิบ",catalyst:"วัสดุช่าง",card:"การ์ดมอนสเตอร์",consumable:"ของใช้"};
const ratings:Record<string,string>={melee:"ประชิด",ranged:"เวท",guard:"ป้องกันมอนสเตอร์",healing:"รักษา"};
const statNames:Record<string,string>={hp:"HP",stamina:"Stamina",atk:"ATK",def:"DEF",magicAtk:"เวท",magicDef:"ต้านเวท"};
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
const csv=rows.map(values=>values.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(",")).join("\r\n");
writeFileSync(destination,"\uFEFF"+csv+"\r\n","utf8");
console.log("Exported "+(rows.length-1)+" item IDs");
