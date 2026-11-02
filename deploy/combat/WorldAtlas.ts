import type { HuntCamp, WorldMapDefinition, WorldPortal, WorldWall } from "./WorldMaps.js";

import { PROVINCES } from "./StrategicProvinces.js";

type XZ = {x:number; z:number};
type XY = readonly [number,number];
type Court = readonly [string,number,number,readonly number[],string];
type Region = {
  id:string; name:string; range:readonly [number,number]; hint:string; courts:readonly Court[];
  routes:readonly (readonly XY[])[]; marker:XY; scatter:readonly XY[];
  walls?:WorldWall[]; crossings?:number[]; noFlight?:boolean;
};
const point=([x,z]:XY):XZ=>({x,z});
const wall=(x:number,z:number,width:number,length:number):WorldWall=>({x,z,width,length});
export const MARSH_GATE=point([48,-84]);
export const TEMPLE_NORTH_GATE=point([32,-65]);
export const RIFT_WARDEN={id:"atlas_rift_warden",name:"ราชันรอยแยก",level:100,x:29,z:-50,strikeRadius:3.8,respawnMs:180000} as const;
const islandRoutes:XY[][]=[
  [[0,26],[-22,16],[-22,8],[-22,-17],[22,-17],[22,-36],[0,-43],[0,-58]],
  [[0,26],[22,12],[22,-17]], [[-22,-17],[-22,-36],[0,-43]],
];
const regions:Region[]=[
  {id:"bamboo_frontier",name:"ดงไผ่ชายเวียง",range:[25,35],hint:PROVINCES.bamboo_frontier.hint,
   courts:[["ลานหน่อไผ่",-20,4,[25,26,27],"ผีตาไผ่"],["ค่ายพรานเก่า",20,-17,[29,31],"พรานพราย"],["ลานรากแดง",0,-41,[33,35],"อสูรรากไผ่"]],
   routes:[[[0,26],[-20,13],[-20,4],[-23,-22],[0,-41],[0,-58]],[[0,26],[20,7],[20,-17],[18,-30],[0,-41]],[[-20,4],[0,-8],[20,-17]]],
   marker:[-12,-46],scatter:[[-31,5],[30,-22],[11,-45],[-32,-30]]},
  {id:"lotus_basin",name:"บึงบัวนาค",range:[40,52],hint:PROVINCES.lotus_basin.hint,crossings:[-6,-29],
   courts:[["บ่อตะวันตก",-22,8,[40,41,43],"ภูตบัวธูป"],["คุ้งเรือแตก",22,-17,[45,47],"พรายคนพาย"],["ค่ายเกล็ดนาค",0,-43,[50,52],"อสรพิษบึง"]],
   routes:islandRoutes,marker:[-9,-50],scatter:[[-34,7],[32,-18],[-32,-39],[15,-45]]},
  {id:"drowned_marsh",name:"บึงพราย",range:[10,22],hint:"ข้ามสะพานไม้ระหว่างเกาะ ติดตามโคมเขียวไปท่าน้ำเหนือ",crossings:[-6,-29],
   courts:[["เกาะกกผี",-22,8,[10,12,14],"พรายกอกก"],["ท่าน้ำจมน้ำ",22,-17,[15,17],"เงาคนแจว"],["ศาลพราย",0,-43,[19,22],"ผีเฝ้าศาลน้ำ"]],
   routes:islandRoutes,marker:[-9,-50],scatter:[[-34,7],[34,-17],[-32,-39],[15,-45]]},
  {id:"moon_cemetery",name:"ป่าช้าเงาจันทร์",range:[18,32],hint:"ทางจากวัดและบึงพบกันที่ลานจันทร์ ตามทางโคมไปเชิงเขา",
   courts:[["เนินป้ายวิญญาณ",-22,2,[18,20,22],"เงาหลุมศพ"],["ลานเผาศพ",22,-15,[24,27],"ผู้เฝ้าเชิงตะกอน"],["ลานจันทร์ดับ",0,-41,[29,32],"วิญญาณเงาจันทร์"]],
   routes:[[[-18,25],[0,21],[18,25]],[[0,21],[-22,11],[-22,2],[-24,-24],[0,-41],[0,-58]],[[0,21],[22,4],[22,-15],[20,-30],[0,-41]],[[-22,2],[0,-7],[22,-15]],[[-22,11],[-34,12]]],
   marker:[10,-45],scatter:[[-34,-1],[33,-15],[-12,-39],[1,8]]},
  {id:"hex_ridge",name:"ดงอาคมบนเขา",range:[28,45],hint:"เลาะช่องเขาฝั่งตะวันตก แล้วเลือกระหว่างสันเขากับทางวนรอบหุบ",
   courts:[["เชิงผาหินสลัก",-23,6,[28,30,33],"ภูตเชิงผา"],["ช่องเขาอาคม",23,-18,[35,39],"อสูรเถาวัลย์"],["ยอดผาผนึก",-14,-42,[42,45],"ผู้พิทักษ์หน้าผา"]],
   walls:[wall(-14,-6,45,2.4),wall(-22,-26,40,2.4)],
   routes:[[[0,26],[-23,17],[-23,6],[-26,-10],[12,-12],[23,-18],[27,-30],[-14,-35],[-14,-42],[0,-58]],[[-26,-10],[-32,-19],[-32,-34],[-14,-42]]],
   marker:[-25,-47],scatter:[[-34,6],[34,-18],[0,-45],[33,11]]},
  {id:"naga_cavern",name:"ถ้ำนาค",range:[40,58],hint:"เดินผ่านช่องหินไปห้องเกล็ดนาค เขตถ้ำใช้การเดินและ Dash",noFlight:true,
   courts:[["โถงหินงอก",0,7,[40,42,45],"เงาหินงอก"],["ห้องเกล็ดนาค",-22,-16,[48,51],"บริวารนาค"],["โพรงแก้วนาคา",13,-40,[54,58],"พญาเกล็ดแก้ว"]],
   walls:[wall(-40,-7,16,2),wall(-12,-7,29,2),wall(31,-7,10,2),wall(-14,-29,20,2),wall(23,-29,16,2)],
   routes:[[[0,26],[0,7],[-18,1],[-18,-12],[-22,-16],[-20,-21],[15,-21],[15,-34],[13,-40],[0,-58]],[[0,7],[24,2],[24,-16],[15,-21]],[[-22,-16],[-24,-34],[0,-46],[13,-40]]],
   marker:[26,-47],scatter:[[-10,9],[-33,-18],[2,-42],[35,-36]]},
  {id:"fallen_city",name:"เมืองอาคมล่ม",range:[55,72],hint:"ใช้ถนนหลักหรือเลี้ยวเข้าซอยตลาด ผ่านหอนาฬิกาไปประตูเหนือ",
   courts:[["ตลาดร้าง",-23,4,[55,58,61],"เงาพ่อค้า"],["ซอยตราผนึก",23,-16,[63,66],"ทหารตราแตก"],["จัตุรัสหอนาฬิกา",0,-43,[69,72],"ขุนเฝ้านคร"]],
   walls:[wall(-15,-10,9,8),wall(7,-9,8,8),wall(-16,-36,10,12),wall(8,-35,8,11)],
   routes:[[[0,26],[0,4],[-23,4],[-23,-16],[0,-16],[23,-16],[23,-43],[0,-43],[0,-58]],[[0,4],[23,4],[23,-16]],[[0,4],[0,-43]],[[-23,-16],[-23,-43],[0,-43]]],
   marker:[-11,-49],scatter:[[-34,4],[34,-16],[11,-46],[-32,-30]]},
  {id:"asura_peak",name:"เขาอสุรา",range:[68,85],hint:"ทางเลียบผาผ่านค่ายหน้า ทางแท่นบูชามีอสุราที่แข็งแรงกว่า",
   courts:[["ค่ายเชิงผา",-21,2,[68,71,73],"อสุราลาดตระเวน"],["ลานหอกเพลิง",20,-17,[75,78],"พลหอกอสุรา"],["แท่นสังเวย",-4,-43,[82,85],"องครักษ์เพลิง"]],
   walls:[wall(-12,-9,19,2),wall(-15,-30,25,2)],
   routes:[[[0,26],[-21,12],[-21,2],[-23,-16],[20,-17],[24,-34],[-4,-43],[0,-58]],[[0,26],[18,7],[20,-17]],[[-23,-16],[-28,-34],[-4,-43]]],
   marker:[-16,-46],scatter:[[-33,2],[31,-17],[8,-47],[34,-37]]},
  {id:"spirit_rift",name:"รอยแยกแดนวิญญาณ",range:[80,100],hint:"ล่าบนเกาะวิญญาณ หรือแยกไปลานราชันทางตะวันออกเฉียงเหนือ",crossings:[-6,-29],
   courts:[["เกาะเศษฝัน",-22,8,[80,83,86],"เงาเศษฝัน"],["สะพานดาราดับ",22,-17,[88,92],"ผู้กลืนแสง"],["วงผนึกสุดท้าย",0,-43,[96,100],"วิญญาณปลายกาล"]],
   routes:[...islandRoutes.slice(1),islandRoutes[0].slice(0,-1),[[0,-43],[17,-43],[29,-50]]],
   marker:[-12,-49],scatter:[[-33,8],[33,-17],[8,-53],[35,-47]]},
];

type GateEnd=readonly [string,number,number];
const edges:readonly (readonly [GateEnd,GateEnd])[]=[
  [["forbidden_forest",48,-84],["drowned_marsh",0,26]],
  [["bound_temple",32,-65],["moon_cemetery",-18,25]],
  [["drowned_marsh",0,-58],["moon_cemetery",18,25]],
  [["ritual_village",4,-16],["mantra_capital",0,26]],
  [["mantra_capital",-34,-14],["bamboo_frontier",0,26]],
  [["bamboo_frontier",0,-58],["moon_cemetery",-34,12]],
  [["moon_cemetery",0,-58],["moon_pass",0,26]],
  [["moon_pass",0,-58],["hex_ridge",0,26]],
  [["mantra_capital",0,-58],["moon_pass",-34,6]],
  [["mantra_capital",34,-14],["lotus_basin",0,26]],
  [["lotus_basin",0,-58],["river_watch",34,-14]],
  [["hex_ridge",0,-58],["naga_cavern",0,26]],
  [["naga_cavern",0,-58],["river_watch",0,26]],
  [["river_watch",0,-58],["fallen_city",0,26]],
  [["fallen_city",0,-58],["asura_peak",0,26]],
  [["asura_peak",0,-58],["spirit_rift",0,26]],
];
export function atlasPortals(mapId:string): WorldPortal[] {
  const portals:WorldPortal[]=[];
  for(const [a,b] of edges){
    const source=a[0]===mapId?a:b[0]===mapId?b:undefined;
    if(!source)continue;
    const target=source===a?b:a;
    portals.push({id:source[0]+"_to_"+target[0],x:source[1],z:source[2],targetMapId:target[0],
      targetSpawn:{x:target[1],y:0,z:target[2]+(target[2]>0?-1.25:1.25)}});
  }
  return portals;
}
function channels(z:number): WorldWall[] {
  // Solid ground spans the two 7-unit bridge gaps at X ±22.
  return [wall(-42,z,16.5,4),wall(-18.5,z,37,4),wall(25.5,z,16.5,4)];
}
export const ATLAS_MAPS:Readonly<Record<string,WorldMapDefinition>>=Object.freeze(Object.fromEntries(regions.map(region=>{
  const portals=atlasPortals(region.id);
  const camps:HuntCamp[]=region.courts.map(([name,x,z,levels],i)=>({id:"court"+(i+1),name,x,z,levels}));
  const spawn=region.id==="moon_cemetery"?{x:0,y:0,z:21}:{x:0,y:0,z:24.75};
  const map:WorldMapDefinition={id:region.id,name:region.name,bounds:{minX:-42,maxX:42,minZ:-65,maxZ:32},spawn,portals,camps,
    region:{range:region.range,hint:region.hint,noFlight:region.noFlight===true},
    restAreas:[{...spawn,radius:4.5,name:"ศาลพักทางเข้า"},...portals.filter(p=>Math.hypot(p.x-spawn.x,p.z-spawn.z)>4).map(p=>({x:p.x,z:p.z,radius:3.6,name:"ศาลประตู"}))],
    strategic:PROVINCES[region.id],
    paths:region.routes.map(route=>route.map(point)),walls:region.walls,
    boss:region.id==="spirit_rift"?RIFT_WARDEN:undefined,
    water:region.crossings?.flatMap(channels),
    obstacles:[{id:"landmark",...point(region.marker),radius:2.2},...region.scatter.map((p,i)=>({id:"relic-"+i,...point(p),radius:1.1}))]};
  return [map.id,map];
})));
export function isAtlasMap(id:string){return Object.prototype.hasOwnProperty.call(ATLAS_MAPS,id);}
export type AtlasSpawn={id:string;name:string;mapId:string;x:number;z:number;level:number;tier:"normal"|"strong"|"boss"};
export const ATLAS_SPAWNS:readonly AtlasSpawn[]=[
  ...regions.flatMap(region=>region.courts.flatMap(([,x,z,levels,name],camp)=>
    levels.map((level,i):AtlasSpawn=>({id:`atlas_${region.id}_${camp+1}_${i+1}`,name,mapId:region.id,level,
      x:x+[-4,4,0][i],z:z+[-3,3,5][i],tier:region.id==="asura_peak"&&camp===2?"strong":"normal"})))),
  {...RIFT_WARDEN,mapId:"spirit_rift",tier:"boss"},
];
export const ATLAS_TARGETS:ReadonlySet<string>=new Set(ATLAS_SPAWNS.map(s=>s.id));
