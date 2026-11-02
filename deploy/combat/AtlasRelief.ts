import type { GroundTerrain } from "./GroundTerrain.js";
import type { WorldMapDefinition } from "./WorldMaps.js";

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
const unit=(v:number)=>Math.max(0,Math.min(1,v));
function axis(lo:number,hi:number){
  const count=Math.ceil((hi-lo)/6);
  return Array.from({length:count+1},(_,i)=>lo+(hi-lo)*i/count);
}
export function atlasRelief(map:WorldMapDefinition){
  const shapes=forms[map.id];
  if(!ATLAS_RELIEF_ENABLED || !shapes)return {};
  const {minX,maxX,minZ,maxZ}=map.bounds,xs=axis(minX,maxX),zs=axis(minZ,maxZ);
  const pads=[map.spawn,...map.portals];
  const heights=zs.map(z=>xs.map(x=>{
    const height=shapes.reduce((sum,[,cx,cz,h,core,approach])=>sum+h*unit((core+approach-Math.hypot(x-cx,z-cz))/approach),0);
    if(!height)return 0;
    // An entire triangle touching a bridge, water or a transfer pad stays level.
    let clearance=Infinity;
    for(const p of pads)clearance=Math.min(clearance,Math.hypot(x-p.x,z-p.z)-12);
    for(const p of map.bridges??[])clearance=Math.min(clearance,Math.hypot(x-p.x,z-p.z)-12);
    for(const w of map.water??[]){
      const dx=Math.max(w.x-x,0,x-w.x-w.width),dz=Math.max(w.z-z,0,z-w.z-w.length);
      clearance=Math.min(clearance,Math.hypot(dx,dz)-9);
    }
    return Math.round(100*height*unit(clearance/16))/100;
  }));
  const terrain:GroundTerrain={xs,zs,heights,maxGrade:.52};
  return {terrain,reliefLabels:shapes.map(([name,x,z])=>({name,x,z}))};
}
