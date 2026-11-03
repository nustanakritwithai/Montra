export const BOSS_RESPAWN_MS=20*60_000;
type Theme="grove"|"hunter"|"guard"|"spirit";
function boss(mapId:string,name:string,level:number,x:number,z:number,theme:Theme,fragmentName:string,gearName:string){
  return {mapId,id:"boss_"+mapId,name,level,x,z,theme,tier:"boss" as const,respawnMs:BOSS_RESPAWN_MS,
    strikeRadius:3.2,fragment:`mat_boss_${mapId}` as const,gear:`acc_boss_${mapId}` as const,fragmentName,gearName};
}
// Each home sits on a foot route outside portals and rest wards.
export const REGIONAL_BOSSES=[
  boss("bound_temple","อสูรระฆังผนึก",20,-23,-45,"spirit","สะเก็ดระฆังผนึก","ตุ้มหูเสียงระฆัง"),
  boss("drowned_marsh","พญาพรายเรือล่ม",22,-53,-82,"hunter","เกล็ดพรายเรือล่ม","แหวนพรายกระแสน้ำ"),
  boss("moon_cemetery","ท้าวเงาจันทร์ดับ",32,55,-82,"spirit","เศษจันทร์ดับ","ตุ้มหูจันทร์ดับ"),
  boss("moon_pass","อสูรเฝ้าสายแร่",34,61,-51,"guard","ผลึกสายแร่","สร้อยผลึกจันทรา"),
  boss("bamboo_frontier","ขุนอสูรไผ่แดง",35,-68,-82,"grove","ข้อไผ่อาคม","สร้อยไผ่แดง"),
  boss("hex_ridge","จ้าวพายุสามตรา",45,56,-87,"spirit","เศษตราวายุ","ตุ้มหูวายุสามตรา"),
  boss("lotus_basin","พญานาคบัวเพลิง",52,76,-80,"grove","เกสรนาคเพลิง","สร้อยเกสรนาคา"),
  boss("river_watch","จ้าวสมิงท่าน้ำ",54,-55,-24,"hunter","เขี้ยวสมิงท่าน้ำ","แหวนเขี้ยวสมิง"),
  boss("twin_neck_pass","ครุฑเฝ้าสันผา",55,95,-45,"hunter","ขนครุฑสันผา","แหวนครุฑสันผา"),
  boss("sam_lan_estuary","ขุนพรายสมอเหล็ก",56,-192,-32,"guard","สะเก็ดสมอเหล็ก","สร้อยสมอเหล็ก"),
  boss("naga_cavern","นาคราชเขี้ยวนิล",58,-52,-85,"guard","เกล็ดเขี้ยวนิล","สร้อยเกล็ดเขี้ยวนิล"),
  boss("fallen_city","ขุนกลองอาถรรพ์",72,60,-85,"spirit","หมุดกลองอาถรรพ์","ตุ้มหูกลองอาถรรพ์"),
  boss("tri_wiang_castle","ขุนศึกเกราะเวียง",74,-140,-184,"guard","เกล็ดเกราะเวียง","สร้อยเกราะเวียง"),
  boss("asura_peak","อสูรเจ้าเตาหลวง",85,-67,-88,"hunter","ถ่านเพลิงอสุรา","แหวนเพลิงเตาหลวง"),
];
export function regionalBossOn(mapId:string){return REGIONAL_BOSSES.find(b=>b.mapId===mapId);}
