import {FOREST_OBJECTIVES,objectiveAvailable,objectiveRanger,type ForestObjective} from "./ForestObjectives.js";
import {getWorldMap,isSafeWorldPoint} from "./WorldMaps.js";

export type QuestChoice={id:string;name:string;mapId:string;mapName:string;levels:string;kind:string;steps:number;camp:string};

/** Only quests with an enabled map, actual quest giver and a portal route are offered. */
export function questChoices(mapId:string,level:number):QuestChoice[]{
  if(level>=100 || !getWorldMap(mapId))return [];
  const distance=new Map<string,number>([[mapId,0]]),queue=[mapId];
  for(let i=0;i<queue.length;i++){
    const id=queue[i],map=getWorldMap(id);if(!map)continue;
    for(const portal of map.portals){
      const target=getWorldMap(portal.targetMapId);
      if(!target || distance.has(target.id) || !isSafeWorldPoint(target,portal.targetSpawn))continue;
      distance.set(target.id,distance.get(id)!+1);queue.push(target.id);
    }
  }
  const all=Object.entries(FOREST_OBJECTIVES).flatMap(([id,def])=>{
    const map=getWorldMap(def.mapId),steps=distance.get(def.mapId),numbers=def.levels.match(/\d+/g)?.map(Number) ?? [1];
    const low=Math.min(...numbers),high=Math.max(...numbers);
    if(!map || steps===undefined || low>level+5 || !objectiveAvailable(id) || !objectiveRanger(def.mapId))return [];
    const gap=level<low?low-level:level>high?level-high:0;
    const kind=def.kind ?? (def.stages?"patrol":"hunt");
    return [{id,name:def.name,mapId:def.mapId,mapName:map.name,levels:def.levels,kind,steps,camp:def.camp,score:gap*3+steps*2}];
  }).sort((a,b)=>a.score-b.score || a.steps-b.steps || a.id.localeCompare(b.id));
  // Preserve nearby, level-appropriate choices while giving Typhoon different activity types.
  const chosen:typeof all=[],kinds=new Set<string>();
  for(const choice of all){if(chosen.length>=6)break;if(!kinds.has(choice.kind)){chosen.push(choice);kinds.add(choice.kind);}}
  for(const choice of all){if(chosen.length>=6)break;if(!chosen.includes(choice))chosen.push(choice);}
  return chosen.map(({score:_score,...choice})=>choice);
}

export function preferredQuestId(question:string,choices:readonly QuestChoice[]):string|undefined {
  const kind=/คุ้มกัน/.test(question)?"escort":/ป้องกัน/.test(question)?"defense":/ส่งเสบียง|ส่งของ/.test(question)?"delivery":
    /หลายค่าย|ลาดตระเวน/.test(question)?"patrol":/บอส|อีลิท|elite/i.test(question)?"elite":/ล่ามอน|ตีมอน/.test(question)?"hunt":undefined;
  return kind?choices.find(item=>item.kind===kind)?.id:undefined;
}

/** Descriptions and progress are always generated from the server's definitions. */
export function questAdvice(mapId:string,level:number,active:ForestObjective|null,selectedId?:string):string{
  if(active){
    const def=FOREST_OBJECTIVES[active.id],map=def && getWorldMap(def.mapId);
    if(!def || !map)return "ภารกิจเดิมอยู่ในพื้นที่ที่ยังไม่เปิด ตรวจรายการกับผู้มอบงานก่อน";
    const next=def.kind==="delivery" && active.progress>=def.goal-1?`นำเสบียงไปส่งผู้มอบงานที่ ${def.destinationName ?? "ปลายทาง"}`:
      def.kind==="escort"?`คุยกับผู้มอบงานที่ ${map.name} เพื่อเริ่มคุ้มกัน`:
      def.kind==="defense"?`ไปยังเขต ${def.camp} แล้วเริ่มป้องกัน`:
      def.stages?.[active.progress]?`เป้าหมายถัดไป: ${def.stages[active.progress].camp}`:`ไปยัง ${def.camp} ใน ${map.name}`;
    return `ภารกิจปัจจุบัน: ${def.name} · ${map.name} (${active.progress}/${def.goal})\n${next}\nทำงานนี้ต่อ หรือคุยกับผู้มอบงานเพื่อยกเลิกก่อนรับงานใหม่`;
  }
  if(level>=100)return "ถึง Lv.100 แล้ว ยังรับภารกิจเก็บ EXP ใหม่ไม่ได้ คุยกับครูวิชาเพื่อดูการเกิดใหม่";
  const choices=questChoices(mapId,level),choice=choices.find(item=>item.id===selectedId) ?? choices[0];
  if(!choice)return "ยังไม่พบภารกิจที่เหมาะกับระดับและเส้นทางที่เปิดอยู่ ลองคุยกับผู้มอบงานหรือเปิดแผนที่";
  const type:Record<string,string>={hunt:"ล่ามอนสเตอร์",patrol:"ลาดตระเวนหลายจุด",delivery:"ล่าและส่งเสบียง",defense:"ป้องกันพื้นที่",escort:"คุ้มกันผู้เดินทาง",elite:"ปราบศัตรูระดับ Elite"};
  return `แนะนำ: ${choice.name} · ${type[choice.kind] ?? "ภารกิจพื้นที่"}\nพื้นที่ ${choice.mapName} · ${choice.levels} · ${choice.camp}${choice.steps?` · ผ่านทางเชื่อม ${choice.steps} แผนที่`:" · อยู่ในแผนที่นี้"}\nเดินไปคุยกับผู้มอบงานในพื้นที่เพื่อดูและรับภารกิจ ระดับที่แสดงเป็นระดับแนะนำ`;
}
