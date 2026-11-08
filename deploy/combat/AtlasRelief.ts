import type { GroundTerrain } from "./GroundTerrain.js";
import { FORT } from "./HeightRules.js";
import type { WorldMapDefinition, WorldWall } from "./WorldMaps.js";

export const ATLAS_RELIEF_ENABLED=process.env.MONTRA_ATLAS_RELIEF==="1";
// Flat core radius and approach length are authored in metres around existing landmarks.
type Landform=readonly [name:string,x:number,z:number,height:number,core:number,approach:number];
const forms:Record<string,readonly Landform[]>={
  hex_ridge:[["ผาสามตรา",79,-73,5,11,25],["ลานเสาหินลม",67,4,3,9,19],["ช่องเขาอาคม",23,-18,-2.4,6,14]],
  naga_cavern:[["โถงผลึกคราม",-68,6,-2.6,7,19],["บัลลังก์เขี้ยวนาค",-96,-65,3.8,12,21],["โพรงแก้วนาคา",13,-40,-3.5,7,17]],
  asura_peak:[["ปากเตาหลวง",-90,-76,5,12,24],["เพิงช่างศิลา",-110,-23,3,7,19],["ลานตีหอก",-71,8,-2,8,16]],
  bamboo_frontier:[["เนินดงไผ่ผนึก",-86,-74,3.8,12,22],["ร่องตาน้ำ",-92,-27,-2.2,8,16],["ลานไผ่คราม",-73,6,2.4,7,13]],
  drowned_marsh:[["ตลิ่งสุสานเรือ",-80,-63,2.8,13,25],["เนินศาลพราย",0,-43,1.8,6,15]],
  lotus_basin:[["สันดินลานนาคน้ำลึก",96,-65,3.6,10,22],["เนินเหนือสะพานไข่มุก",66,-57,3.1,8,18],["ตลิ่งบ่อตะวันตก",-22,12,2,6,16]],
  moon_cemetery:[["เนินป้ายวิญญาณ",-22,2,2.8,7,17],["แอ่งลานโลงจันทร์",76,4,-2.7,10,17],["เนินลานระฆังดับ",93,-61,3.5,10,21]],
  fallen_city:[["ลานกลองประกาศิต",88,-69,3.8,12,22],["ตรอกโรงพิมพ์ยันต์",69,8,-2.4,10,17],["จัตุรัสหอนาฬิกา",0,-43,2,8,15]],
  spirit_rift:[["เกาะวงแหวนดาวดับ",-87,-78,4.5,11,21],["ลานราชัน",29,-50,3.8,7,15],["สันเกาะทางใต้",-55,23,2.2,6,14]],
};
const originalForms:Record<string,readonly Landform[]>={
  ritual_village:[["เนินลานตะวันตก",-13,9,1.7,2.2,6],["สวนหลังเรือน",13,-8,1.3,2,5]],
  forbidden_forest:[["สันรากไม้ตะวันออก",26,-24,3.2,9,15],["แอ่งค่ายเงาไม้",-28,-55,-2.3,9,14],["เนินศาลผู้พิทักษ์",-14,-90,4,8,16]],
  bound_temple:[["ลานอุโบสถ",0,-55,3.2,12,16],["ระเบียงจารึก",-27,-18,-1.8,6,13],["ฐานหอระฆัง",27,-23,2.4,8,15]],
  mantra_capital:[["ลานคุ้มหลวง",0,-35,3.2,8,16],["เนินตลาดสี่ประตู",-16,1,1.8,5,11]],
  moon_pass:[["เนินโรงคัดแร่",82,-58,4.6,10,17],["เนินศาลช่องขนเงิน",49,-89,2.9,8,16],["ร่องทางเกวียน",48,35,-1.8,7,13]],
  river_watch:[["คันดินลานเสบียง",-67,-56,3.4,10,19],["เนินต้นน้ำ",25,-85,2.8,11,17],["ร่องทางท่าตะวันออก",47,-22,-1.8,7,14]],
  sam_lan_estuary:[["ลานบัญชาการ",32,-48,4.5,17,23],["เนินตลาดท่าเรือ",112,48,3.4,19,30],["ลานคลังตะวันตก",-112,0,2.5,17,25],["ที่ลุ่มริมสะพาน",67,119,-1.8,10,16]],
  tri_wiang_castle:[["ลานกลองกลาง",0,54,8,10,40],["เชิงผาตะวันออก",270,35,18,14,58],["เนินคลังหลวง",-88,-39,5,10,24],["ลุ่มฝั่งท่าตะวันตก",-238,35,-5,9,24],["ลานพระราชฐาน",0,-61,6,12,28]]
};
const unit=(v:number)=>Math.max(0,Math.min(1,v));
function axis(lo:number,hi:number,step:number){
  const count=Math.ceil((hi-lo)/step);
  return Array.from({length:count+1},(_,i)=>lo+(hi-lo)*i/count);
}
export function atlasRelief(map:WorldMapDefinition){
  const shapes=forms[map.id];
  if(!ATLAS_RELIEF_ENABLED || !shapes)return {};
  return buildRelief(map,shapes,6);
}
export function originalRelief(map:WorldMapDefinition){
  const shapes=originalForms[map.id];
  if(process.env.MONTRA_ORIGINAL_RELIEF!=="1" || !shapes)return {};
  const step=map.id==="tri_wiang_castle"?7:map.id==="sam_lan_estuary"?7:map.id==="ritual_village"?1:3;
  return buildRelief(map,shapes,step,true);
}
function buildRelief(map:WorldMapDefinition,shapes:readonly Landform[],step:number,original=false){
  const {minX,maxX,minZ,maxZ}=map.bounds,xs=axis(minX,maxX,step),zs=axis(minZ,maxZ,step);
  const foundations:WorldWall[]=[...map.strategic?.rampart?.deck??[]];
  for(const s of map.strategic?.rampart?.stairs??[])
    foundations.push({x:Math.min(s.foot.x,s.top.x)-2,z:Math.min(s.foot.z,s.top.z)-2,width:Math.abs(s.foot.x-s.top.x)+4,length:Math.abs(s.foot.z-s.top.z)+4});
  const village=map.id==="ritual_village";
  if(village)foundations.push({x:FORT.ladderFootX-2,z:FORT.z-FORT.length/2-2,width:6,length:FORT.length+4},{x:-6,z:-4,width:13,length:8},...(map.walls??[]));
  const guard=original?Math.SQRT2*step+.6:9;
  const pad=original?guard+2:12,blend=original?Math.max(6,step*(map.id==="moon_pass"?5:2.5)):16;
  const dryEdges=[...map.water??[],...foundations];
  const pads=[map.spawn,...map.portals];
  const heights=zs.map(z=>xs.map(x=>{
    const height=shapes.reduce((sum,[,cx,cz,h,core,approach])=>sum+h*unit((core+approach-Math.hypot(x-cx,z-cz))/approach),0);
    if(!height)return 0;
    // An entire triangle touching a bridge, water or a transfer pad stays level.
    let clearance=Infinity;
    for(const p of pads)clearance=Math.min(clearance,Math.hypot(x-p.x,z-p.z)-pad);
    for(const p of map.bridges??[])clearance=Math.min(clearance,Math.hypot(x-p.x,z-p.z)-pad);
    for(const w of dryEdges){
      const dx=Math.max(w.x-x,0,x-w.x-w.width),dz=Math.max(w.z-z,0,z-w.z-w.length);
      clearance=Math.min(clearance,Math.hypot(dx,dz)-guard);
    }
    // Leave enough run between the compact castle walls and the high ground in either triangle direction.
    const level=map.id==="tri_wiang_castle"
      ? Math.sign(height)*Math.min(Math.abs(height),Math.max(0,clearance)*.35)
      : height*unit(clearance/blend);
    return Math.round(100*level)/100;
  }));
  const terrain:GroundTerrain={xs,zs,heights,maxGrade:.52};
  return {terrain,reliefLabels:shapes.map(([name,x,z])=>({name,x,z}))};
}
