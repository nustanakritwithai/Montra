import { WORLD_MAPS, getWorldMap, groundAt, isSafeWorldPoint, isWorldSegmentClear, type WorldMapDefinition } from "./WorldMaps.js";
import { objectiveRanger } from "./ForestObjectives.js";
import { getWarDefinition, WAR_ENTRY_RADIUS } from "./TerritoryWar.js";
import { RIVER_WAREHOUSE_PLOT } from "./RiverCity.js";
import {
  CITY_GOVERNANCE_ENABLED, CITY_HAUL_ENABLED, CITY_MINING_ENABLED, CITY_MINING_SITE, CITY_MISSIONS_ENABLED,
  CITY_PRODUCTION_ENABLED, CITY_PRODUCTION_SITE, CITY_TRADE_CONTRACTS_ENABLED,
} from "./CityProductionRules.js";

const regionalServices={
  smith:{name:"ช่างอาคม",action:"อุปกรณ์และงานช่าง",dialogue:"ข้าช่วยดูอุปกรณ์ งานคราฟต์ ตีบวก และการ์ดให้ได้"},
  market:{name:"นายหน้าตลาด",action:"เปิดตลาดและการค้า",dialogue:"มาดูของฝากขายหรือแลกเปลี่ยนกับผู้เล่นคนอื่นได้"},
  guild:{name:"นายทะเบียนกิลด์",action:"จัดการกิลด์",dialogue:"อยากตั้งกิลด์ ดูสมาชิก หรือประสานกำลังรบ คุยกับข้าได้"},
  party:{name:"ผู้ประสานปาร์ตี้",action:"เปิดปาร์ตี้",dialogue:"รวมเพื่อนออกสำรวจและแบ่งหน้าที่กันได้ที่นี่"},
  travel:{name:"นักเดินทาง",action:"ดูแผนที่",dialogue:"ข้าช่วยดูเส้นทาง จุดพัก และทางออกของพื้นที่นี้ได้"},
  strategy:{name:"เสนาธิการ",action:"ดูแผนที่ยุทธศาสตร์",dialogue:"ตรวจด่าน เส้นทาง และเวลาของสงครามแต่ละพื้นที่ได้"},
  mentor:{name:"ครูวิชา",action:"ดูวิชาอาชีพ",dialogue:"มาตรวจวิชาของเจ้าได้ การเรียนบางวิชายังต้องทำที่ลานหมู่บ้าน"},
  guide:{name:"ผู้แนะนำ",action:"เปิดคู่มือ",dialogue:"หากเพิ่งมาถึง ข้าช่วยอธิบายวิธีเล่นและการเดินทางได้"},
} as const;
export const NPC_SERVICES={
  ...regionalServices,
  war:{name:"นายทหารรับศึก",action:"เปิดกระดานศึก",dialogue:"ดูผู้ครองพื้นที่และสถานะศึกที่นี่ นายทหารและผู้บัญชาการยื่นท้าชิงได้ที่จุดนี้"},
  cityWarehouse:{name:"นายคลังเมือง",action:"เปิดคลังเมือง",dialogue:"ตรวจสต็อก ฝากวัตถุดิบ และติดตามโครงการขยายคลังของกิลด์"},
  cityFactory:{name:"ช่างโรงงานเมือง",action:"เปิดโรงงานเมือง",dialogue:"ตรวจสูตร คิวผลิต และผลผลิตของโรงงานเมือง"},
  cityMissions:{name:"ผู้ประกาศภารกิจเมือง",action:"เปิดกระดานภารกิจเมือง",dialogue:"ดูงานเก็บแร่ งานขนเสบียง และสัญญาจัดซื้อที่เปิดรับ"},
  cityHall:{name:"เสมียนศาลาว่าการ",action:"เปิดศาลาว่าการเมือง",dialogue:"เจ้าหน้าที่กิลด์ตรวจยอดทองตลาด นโยบาย และเสบียงที่กันไว้ก่อนศึกได้ที่นี่"},
} as const;
type RegionalService=keyof typeof regionalServices;
export type NpcService=keyof typeof NPC_SERVICES;
export type ServiceNpc=Readonly<{id:string;role:NpcService;name:string;x:number;y:number;z:number;radius:number}>;
const roles=Object.keys(regionalServices) as RegionalService[];
const mapOrder=Object.keys(WORLD_MAPS).sort();
const placementCache=new Map<string,ServiceNpc[]>();
// The mentor and the newcomer guide stay in the central quarter; the trades stand around the east market.
const villageAnchors:Record<RegionalService,{x:number;z:number}>={
  mentor:{x:-2,z:3},guide:{x:-3,z:14},
  smith:{x:42,z:9},market:{x:34,z:-11},guild:{x:44,z:-19},party:{x:33,z:4},travel:{x:40,z:-24},strategy:{x:50,z:-6}
};
const villageCore=(role:NpcService)=>role==="mentor" || role==="guide";
const siteOrder:Record<RegionalService,readonly string[]>={
  smith:["mine","market","port"],market:["market","port"],guild:["palace","fort","market"],party:["grove","shrine","market"],
  travel:["port","bridge","market"],strategy:["fort","palace","tower"],mentor:["shrine","palace"],guide:["shrine","market","grove"]
};
type Point={x:number;z:number};
type GroundPoint=Point & {y:number};
function anchorsFor(map:WorldMapDefinition,role:RegionalService):Point[]{
  if(map.id==="ritual_village")return [villageAnchors[role]];
  const sites=map.strategic?.sites ?? [],points:Point[]=[];
  // A named workshop is a better match than a generic mine or market.
  if(role==="smith")points.push(...sites.filter(s=>/ช่าง|หลอม/.test(s.name)));
  for(const kind of siteOrder[role])points.push(...sites.filter(s=>s.kind===kind));
  const rests=(map.restAreas ?? []).filter(area=>map.portals.every(p=>Math.hypot(p.x-area.x,p.z-area.z)>8));
  const camps=map.camps ?? [],campIndex:Record<RegionalService,number>={guide:0,travel:0,party:1,smith:1,market:2,strategy:2,guild:3,mentor:3};
  const offset=camps.length?campIndex[role]%camps.length:0,rotated=[...camps.slice(offset),...camps.slice(0,offset)];
  if(role==="smith" && rests.length)points.push(...rests,...rotated);
  else points.push(...rotated,...rests);
  // Route waypoints are a last resort for regions without named landmarks.
  for(const path of map.paths ?? [])if(path.length)points.push(path[Math.floor(path.length/2)]);
  points.push(map.spawn);
  return points;
}
function nearbyRoad(map:WorldMapDefinition,point:{x:number;y:number;z:number}):boolean {
  const paths=map.paths ?? [];if(!paths.length)return true;
  return paths.some(path=>path.some(p=>Math.hypot(point.x-p.x,point.z-p.z)<=18 &&
    isSafeWorldPoint(map,{x:p.x,y:groundAt(map.id,p.x,p.z),z:p.z}) && isWorldSegmentClear(map.id,point,p)));
}

/** Decorative access to existing services; all original server checks remain in force. */
export function serviceNpcsFor(mapId:string):ServiceNpc[] {
  const cached=placementCache.get(mapId);if(cached)return cached.map(npc=>({...npc}));
  const map=getWorldMap(mapId);if(!map)return [];
  const capital=mapId==="ritual_village" || map.strategic?.kind==="capital";
  const index=Math.max(0,mapOrder.indexOf(mapId));
  const requested:RegionalService[]=capital ? ["mentor",...roles.filter(role=>role!=="mentor")] : map.strategic?.kind==="territory" ? ["strategy","guild","smith","market","travel","guide"] :
    [roles[index%roles.length],roles[(index+3)%roles.length],roles[(index+5)%roles.length]];
  const keeper=objectiveRanger(mapId),placed:ServiceNpc[]=[];
  const place=(role:NpcService,anchors:Point[],distances:number[],roleIndex:number,radius=2.7,
    fits:(point:GroundPoint)=>boolean=point=>nearbyRoad(map,point))=>{
    // A war entry can share its center with a portal or sit next to a camp.
    const portalGap=role==="war"?3.1:role==="travel"?4.5:8;
    const campGap=role==="war"?4:8;
    for(const separation of [9,5,3.2]){
      for(const anchor of anchors){
        for(const distance of distances){
          for(let n=0;n<(distance===0?1:16);n++){
            const angle=(n+roleIndex*3)*Math.PI/8,x=Math.round((anchor.x+Math.cos(angle)*distance)*100)/100,z=Math.round((anchor.z+Math.sin(angle)*distance)*100)/100,y=groundAt(mapId,x,z),point={x,y,z};
            if(!isSafeWorldPoint(map,point) || map.portals.some(p=>Math.hypot(p.x-x,p.z-z)<portalGap) ||
              (keeper && Math.hypot(keeper.x-x,keeper.z-z)<5) || (mapId==="ritual_village" && Math.hypot(x-2.4,z-2.4)<3.2) ||
              (mapId==="ritual_village" && villageCore(role) && Math.abs(x)>5) || (map.camps ?? []).some(c=>Math.hypot(c.x-x,c.z-z)<campGap) ||
              (role==="mentor" && mapId==="ritual_village" && Math.hypot(x,z)>5.5) ||
              placed.some(p=>Math.hypot(p.x-x,p.z-z)<separation) || !fits(point))continue;
            placed.push({id:`${mapId}_${role}`,role,name:NPC_SERVICES[role].name,x,y,z,radius});
            return;
          }
        }
      }
    }
  };
  for(const [roleIndex,role] of requested.entries())
    place(role,anchorsFor(map,role),mapId==="ritual_village"?[0,2,4,6]:[5,8,12,16,24],roleIndex);
  const war=getWarDefinition(mapId),warNpcRadius=1.8;
  if(war){
    const {entry}=war;
    place("war",[entry],[3.15,2.8,2.3,1.8],0,warNpcRadius,point=>
      Math.hypot(point.x-entry.x,point.z-entry.z)+warNpcRadius<=WAR_ENTRY_RADIUS &&
      isWorldSegmentClear(mapId,point,entry));
  }
  const river=mapId===CITY_PRODUCTION_SITE,moon=mapId===CITY_MINING_SITE && CITY_MINING_ENABLED;
  if(CITY_PRODUCTION_ENABLED && (river || moon)){
    const cityDistances=[5,8,12,16];
    if(river){
      const plot=RIVER_WAREHOUSE_PLOT;
      place("cityWarehouse",[plot],[4,2,0],2,2.7,point=>
        Math.hypot(point.x-plot.x,point.z-plot.z)+2.7<=plot.radius && isWorldSegmentClear(mapId,point,plot));
    }else place("cityWarehouse",anchorsFor(map,"guild"),cityDistances,2);
    place("cityFactory",anchorsFor(map,"smith"),cityDistances,3);
    if(moon && CITY_GOVERNANCE_ENABLED)place("cityHall",anchorsFor(map,"strategy"),cityDistances,4);
    if(CITY_MINING_ENABLED && (CITY_MISSIONS_ENABLED || CITY_HAUL_ENABLED || CITY_TRADE_CONTRACTS_ENABLED))
      place("cityMissions",anchorsFor(map,"market"),cityDistances,5);
  }
  placementCache.set(mapId,placed);return placed.map(npc=>({...npc}));
}

/** Add private world-room presentation data without mutating map definitions. */
export function mapsWithServiceNpcs() {
  return Object.fromEntries(Object.entries(WORLD_MAPS).map(([id,map])=>[id,{...map,serviceNpcs:serviceNpcsFor(id)}]));
}
