import { WORLD_MAPS, getWorldMap, groundAt, isSafeWorldPoint } from "./WorldMaps.js";
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

/** Decorative access to existing services; all original server checks remain in force. */
export function serviceNpcsFor(mapId:string):ServiceNpc[] {
  const map=getWorldMap(mapId);if(!map)return [];
  const capital=mapId==="ritual_village" || map.strategic?.kind==="capital";
  const index=Math.max(0,mapOrder.indexOf(mapId));
  const requested:NpcService[]=capital ? ["mentor",...roles.filter(role=>role!=="mentor")] : map.strategic?.kind==="territory" ? ["strategy","guild","smith"] :
    [roles[index%roles.length],roles[(index+3)%roles.length],roles[(index+5)%roles.length]];
  const areas=map.restAreas?.length ? map.restAreas : [{...map.spawn,radius:5,name:"จุดพัก"}];
  const keeper=objectiveRanger(mapId),placed:ServiceNpc[]=[];
  for(const role of requested){
    let chosen:ServiceNpc|undefined;
    for(const area of areas){
      const r=Math.max(1.2,Math.min(4.8,area.radius-.8));
      for(let n=0;n<16;n++){
        const angle=n*Math.PI/8,x=Math.round((area.x+Math.cos(angle)*r)*100)/100,z=Math.round((area.z+Math.sin(angle)*r)*100)/100,y=groundAt(mapId,x,z);
        if(!isSafeWorldPoint(map,{x,y,z}) || map.portals.some(p=>Math.hypot(p.x-x,p.z-z)<3.1) ||
           (keeper && Math.hypot(keeper.x-x,keeper.z-z)<3.5) ||
           (mapId==="ritual_village" && Math.hypot(x-2.4,z-2.4)<3.2) ||
           placed.some(p=>Math.hypot(p.x-x,p.z-z)<3.2))continue;
        chosen={id:`${mapId}_${role}`,role,name:NPC_SERVICES[role].name,x,y,z,radius:2.7};break;
      }
      if(chosen)break;
    }
    if(chosen)placed.push(chosen);
  }
  return placed;
}

/** Add private world-room presentation data without mutating map definitions. */
export function mapsWithServiceNpcs() {
  return Object.fromEntries(Object.entries(WORLD_MAPS).map(([id,map])=>[id,{...map,serviceNpcs:serviceNpcsFor(id)}]));
}
