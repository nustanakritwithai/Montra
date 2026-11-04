import { WORLD_MAPS, getWorldMap, groundAt, isSafeWorldPoint, isWorldSegmentClear, type WorldMapDefinition } from "./WorldMaps.js";
import { objectiveRanger } from "./ForestObjectives.js";

export const NPC_SERVICES={
  smith:{name:"ช่างอาคม",action:"อุปกรณ์และงานช่าง",dialogue:"ข้าช่วยดูอุปกรณ์ งานคราฟต์ ตีบวก และการ์ดให้ได้"},
  market:{name:"นายหน้าตลาด",action:"เปิดตลาดและการค้า",dialogue:"มาดูของฝากขายหรือแลกเปลี่ยนกับผู้เล่นคนอื่นได้"},
  guild:{name:"นายทะเบียนกิลด์",action:"จัดการกิลด์",dialogue:"อยากตั้งกิลด์ ดูสมาชิก หรือประสานกำลังรบ คุยกับข้าได้"},
  party:{name:"ผู้ประสานปาร์ตี้",action:"เปิดปาร์ตี้",dialogue:"รวมเพื่อนออกสำรวจและแบ่งหน้าที่กันได้ที่นี่"},
  travel:{name:"นักเดินทาง",action:"ดูแผนที่",dialogue:"ข้าช่วยดูเส้นทาง จุดพัก และทางออกของพื้นที่นี้ได้"},
  strategy:{name:"เสนาธิการ",action:"ดูแผนที่ยุทธศาสตร์",dialogue:"ตรวจด่าน เส้นทาง และเวลาของสงครามแต่ละพื้นที่ได้"},
  mentor:{name:"ครูวิชา",action:"ดูวิชาอาชีพ",dialogue:"มาตรวจวิชาของเจ้าได้ การเรียนบางวิชายังต้องทำที่ลานหมู่บ้าน"},
  guide:{name:"ผู้แนะนำ",action:"เปิดคู่มือ",dialogue:"หากเพิ่งมาถึง ข้าช่วยอธิบายวิธีเล่นและการเดินทางได้"},
} as const;
export type NpcService=keyof typeof NPC_SERVICES;
export type ServiceNpc=Readonly<{id:string;role:NpcService;name:string;x:number;y:number;z:number;radius:number}>;
const roles=Object.keys(NPC_SERVICES) as NpcService[];
const mapOrder=Object.keys(WORLD_MAPS).sort();
const placementCache=new Map<string,ServiceNpc[]>();
const villageAnchors:Record<NpcService,{x:number;z:number}>={
  mentor:{x:-2,z:3},smith:{x:-3,z:8},market:{x:3,z:-7},guild:{x:-3,z:-10},
  party:{x:3,z:9},travel:{x:0,z:-12},strategy:{x:4,z:-3},guide:{x:-3,z:14}
};
const siteOrder:Record<NpcService,readonly string[]>={
  smith:["mine","market","port"],market:["market","port"],guild:["palace","fort","market"],party:["grove","shrine","market"],
  travel:["port","bridge","market"],strategy:["fort","palace","tower"],mentor:["shrine","palace"],guide:["shrine","market","grove"]
};
type Point={x:number;z:number};
function anchorsFor(map:WorldMapDefinition,role:NpcService):Point[]{
  if(map.id==="ritual_village")return [villageAnchors[role]];
  const sites=map.strategic?.sites ?? [],points:Point[]=[];
  // A named workshop is a better match than a generic mine or market.
  if(role==="smith")points.push(...sites.filter(s=>/ช่าง|หลอม/.test(s.name)));
  for(const kind of siteOrder[role])points.push(...sites.filter(s=>s.kind===kind));
  const rests=(map.restAreas ?? []).filter(area=>map.portals.every(p=>Math.hypot(p.x-area.x,p.z-area.z)>8));
  const camps=map.camps ?? [],campIndex:Record<NpcService,number>={guide:0,travel:0,party:1,smith:1,market:2,strategy:2,guild:3,mentor:3};
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
  const requested:NpcService[]=capital ? ["mentor",...roles.filter(role=>role!=="mentor")] : map.strategic?.kind==="territory" ? ["strategy","guild","smith","market","travel","guide"] :
    [roles[index%roles.length],roles[(index+3)%roles.length],roles[(index+5)%roles.length]];
  const keeper=objectiveRanger(mapId),placed:ServiceNpc[]=[];
  for(const [roleIndex,role] of requested.entries()){
    let chosen:ServiceNpc|undefined;
    const anchors=anchorsFor(map,role),distances=mapId==="ritual_village"?[0,2,4,6]:[5,8,12,16,24];
    for(const separation of [9,5,3.2]){
      for(const anchor of anchors){
        for(const distance of distances){
          for(let n=0;n<(distance===0?1:16);n++){
            const angle=(n+roleIndex*3)*Math.PI/8,x=Math.round((anchor.x+Math.cos(angle)*distance)*100)/100,z=Math.round((anchor.z+Math.sin(angle)*distance)*100)/100,y=groundAt(mapId,x,z),point={x,y,z};
            if(!isSafeWorldPoint(map,point) || map.portals.some(p=>Math.hypot(p.x-x,p.z-z)<(role==="travel"?4.5:8)) ||
              (keeper && Math.hypot(keeper.x-x,keeper.z-z)<5) || (mapId==="ritual_village" && Math.hypot(x-2.4,z-2.4)<3.2) ||
              (mapId==="ritual_village" && Math.abs(x)>5) || (map.camps ?? []).some(c=>Math.hypot(c.x-x,c.z-z)<8) ||
              (role==="mentor" && mapId==="ritual_village" && Math.hypot(x,z)>5.5) ||
              placed.some(p=>Math.hypot(p.x-x,p.z-z)<separation) || !nearbyRoad(map,point))continue;
            chosen={id:`${mapId}_${role}`,role,name:NPC_SERVICES[role].name,x,y,z,radius:2.7};break;
          }
          if(chosen)break;
        }
        if(chosen)break;
      }
      if(chosen)break;
    }
    if(chosen)placed.push(chosen);
  }
  placementCache.set(mapId,placed);return placed.map(npc=>({...npc}));
}

/** Add private world-room presentation data without mutating map definitions. */
export function mapsWithServiceNpcs() {
  return Object.fromEntries(Object.entries(WORLD_MAPS).map(([id,map])=>[id,{...map,serviceNpcs:serviceNpcsFor(id)}]));
}
