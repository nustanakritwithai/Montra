import {randomUUID} from "node:crypto";
import {mkdirSync,readFileSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {DatabaseSync} from "node:sqlite";
import {FOREST_OBJECTIVES,objectiveAvailable} from "./ForestObjectives.js";
import {getWorldMap,WORLD_EXPANSION} from "./WorldMaps.js";

type WarPhase="battle"|"protected"|"open";
export type DirectorCandidate={objectiveId:string;mapId:string;mapName:string;kind:string;players:number;levelBand:string;warPhase:WarPhase|"none"};
export type DirectorEvent={id:string;objectiveId:string;mapId:string;mapName:string;name:string;story:string;startsAt:number;endsAt:number;source:"typhoon"|"rules"};
type Observation={at:number;players:Array<{mapId:string;level:number}>;wars:Record<string,WarPhase>};
type Fetcher=typeof fetch;
type DirectorState={event:DirectorEvent|null;nextAt:number;recent:string[];previousMap:string};
const DURATION_MS=15*60_000, REST_MS=5*60_000, OBSERVATION_TTL=45_000;
const TYPHOON_BASE="https://api.opentyphoon.ai/v1";
type TyphoonConfig={key:string;endpoint:string;model:string};
/** Only read the provider keys from an explicitly configured private env file. */
export function typhoonConfig(overrideKey?:string):TyphoonConfig|null {
  const values:Record<string,string>={},file=process.env.MONTRA_TYPHOON_ENV_FILE;
  if(file && overrideKey===undefined){
    try{
      const text=readFileSync(file,"utf8");
      for(const line of text.split(/\r?\n/)){
        const match=line.match(/^\s*(?:export\s+)?(TYPHOON_API_KEY|TYPHOON_BASE_URL|TYPHOON_MODEL)\s*=\s*(.*?)\s*$/);
        if(!match)continue;let value=match[2].trim();
        if(value.length>=2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))))value=value.slice(1,-1);
        values[match[1]]=value;
      }
    }catch{console.warn("MONTRA Director: configured Typhoon env file is unavailable");return null;}
  }
  const key=overrideKey ?? (process.env.MONTRA_TYPHOON_API_KEY || process.env.TYPHOON_API_KEY || values.TYPHOON_API_KEY || "");
  if(!key)return null;
  const base=process.env.MONTRA_TYPHOON_BASE_URL || process.env.TYPHOON_BASE_URL || values.TYPHOON_BASE_URL || TYPHOON_BASE;
  const model=process.env.MONTRA_TYPHOON_MODEL || process.env.TYPHOON_MODEL || values.TYPHOON_MODEL || "typhoon-v2.5-30b-a3b-instruct";
  try{
    const url=new URL(base);
    if(url.protocol!=="https:" || url.hostname!=="api.opentyphoon.ai" || url.username || url.password || url.search || url.hash ||
      (url.port && url.port!=="443") || url.pathname.replace(/\/+$/,"")!=="/v1" || !/^[a-zA-Z0-9._-]{1,100}$/.test(model))throw Error("invalid_typhoon_settings");
    return {key,endpoint:`${TYPHOON_BASE}/chat/completions`,model};
  }catch{console.warn("MONTRA Director: invalid Typhoon endpoint or model");return null;}
}
const safeStory=(value:unknown):string|null=>{
  if(typeof value!=="string")return null;
  const story=value.normalize("NFC").replace(/\s+/g," ").trim();
  if(story.length<8 || story.length>120 || /[<>\u0000-\u001f\d]|https?:|www\.|รางวัล|เหรียญ|ทอง|ไอเทม|นาที|ชั่วโมง|เปอร์เซ็นต์|ตลอดไป|ฟรี|%/i.test(story))return null;
  return story;
};

/** Small durable schedule; no player identities or credentials are stored. */
export class DirectorStore {
  private db:DatabaseSync;
  constructor(file:string){
    mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
    this.db=new DatabaseSync(file);
    this.db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS world_director(id INTEGER PRIMARY KEY CHECK(id=1), state TEXT NOT NULL)");
  }
  load():DirectorState|null {
    const row=this.db.prepare("SELECT state FROM world_director WHERE id=1").get();
    if(!row)return null;
    if(typeof row.state!=="string")throw Error("director_state_invalid");
    const data=JSON.parse(row.state) as DirectorState,event=data?.event;
    if(!data || !Number.isSafeInteger(data.nextAt) || data.nextAt<0 || !Array.isArray(data.recent) || data.recent.length>4 ||
      data.recent.some(id=>typeof id!=="string" || !Object.hasOwn(FOREST_OBJECTIVES,id)) || typeof data.previousMap!=="string" || data.previousMap.length>100)
      throw Error("director_state_invalid");
    if(event!==null){
      if(!event || typeof event.id!=="string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(event.id) ||
        typeof event.objectiveId!=="string" || !Object.hasOwn(FOREST_OBJECTIVES,event.objectiveId) || FOREST_OBJECTIVES[event.objectiveId].mapId!==event.mapId ||
        typeof event.mapName!=="string" || typeof event.name!=="string" || !safeStory(event.story) || !Number.isSafeInteger(event.startsAt) ||
        !Number.isSafeInteger(event.endsAt) || event.startsAt<0 || event.endsAt-event.startsAt!==DURATION_MS || (event.source!=="rules" && event.source!=="typhoon"))
        throw Error("director_state_invalid");
    }
    return {event,nextAt:data.nextAt,recent:[...data.recent],previousMap:data.previousMap};
  }
  save(state:DirectorState):void {
    this.db.prepare("INSERT INTO world_director(id,state) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET state=excluded.state").run(JSON.stringify(state));
  }
  close():void{this.db.close();}
}

/** One server-process director shared by all normal-world rooms. The model can
 * choose only a server-approved objective; gameplay and rewards stay server-owned. */
export class WorldDirector {
  private rooms=new Map<string,Observation>();
  private current:DirectorEvent|null=null;
  private nextAt=0;
  private planning=false;
  private recent:string[]=[];
  private previousMap="";
  private store?:DirectorStore;
  private initialized=false;
  private retryLoadAt=0;
  constructor(private readonly apiKey:string|undefined=undefined,private readonly fetcher:Fetcher=fetch,
    private readonly storeFactory?:()=>DirectorStore){}

  private ensureLoaded(now:number):boolean {
    if(this.initialized)return true;
    if(now<this.retryLoadAt)return false;
    try{
      this.store=this.storeFactory?.();const saved=this.store?.load();
      if(saved){this.current=saved.event;this.nextAt=saved.nextAt;this.recent=saved.recent;this.previousMap=saved.previousMap;}
      this.initialized=true;return true;
    }catch{
      try{this.store?.close();}catch{}this.store=undefined;this.retryLoadAt=now+15_000;
      console.error("MONTRA Director: cannot load persistent schedule");return false;
    }
  }
  private save(event:DirectorEvent|null,nextAt=this.nextAt,recent=this.recent,previousMap=this.previousMap):void {
    this.store?.save({event,nextAt,recent,previousMap});
  }
  close():void{this.store?.close();this.store=undefined;this.initialized=false;}
  restore(now=Date.now()):DirectorEvent|null {
    return this.ensureLoaded(now)?this.snapshot(now):null;
  }

  observe(roomId:string,players:Observation["players"],now=Date.now(),wars:Observation["wars"]={}):void {
    if(!roomId)return;
    if(!this.ensureLoaded(now))return;
    const safeWars=Object.fromEntries(Object.entries(wars).filter(([id,phase])=>!!getWorldMap(id) && ["battle","protected","open"].includes(phase)));
    this.rooms.set(roomId,{at:now,players:players.filter(p=>typeof p.mapId==="string" && Number.isInteger(p.level) && p.level>=1 && p.level<100),wars:safeWars});
    this.tick(now);
  }
  forget(roomId:string):void {this.rooms.delete(roomId);}
  snapshot(now=Date.now()):DirectorEvent|null {
    if(this.current && (now>=this.current.endsAt || !objectiveAvailable(this.current.objectiveId))){
      this.nextAt=Math.max(this.nextAt,this.current.endsAt+REST_MS);this.current=null;
      try{this.save(null);}catch{console.error("MONTRA Director: cannot save event expiry");}
    }
    return this.current;
  }
  eligible(eventId:string|undefined,objectiveId:string,claims:readonly string[],now=Date.now()):boolean {
    const event=this.snapshot(now);
    return Boolean(event && eventId===event.id && objectiveId===event.objectiveId && !claims.includes(event.id));
  }
  private candidates(now:number):DirectorCandidate[] {
    const population=new Map<string,number[]>();
    const wars=new Map<string,WarPhase>();
    for(const [id,observation] of this.rooms){
      if(now-observation.at>OBSERVATION_TTL){this.rooms.delete(id);continue;}
      for(const p of observation.players){const levels=population.get(p.mapId) ?? [];levels.push(p.level);population.set(p.mapId,levels);}
      for(const [mapId,phase] of Object.entries(observation.wars))wars.set(mapId,phase);
    }
    const all:DirectorCandidate[]=[];
    for(const [mapId,levels] of population){
      const map=getWorldMap(mapId);if(!map)continue;
      const available=Object.entries(FOREST_OBJECTIVES).filter(([id,def])=>def.mapId===mapId && objectiveAvailable(id) &&
        (def.kind==="delivery" || def.kind==="defense" || def.kind==="escort" || id.startsWith("patrol_") || id.startsWith("frontier_")) &&
        levels.some(level=>level+5>=Number(def.levels.match(/\d+/)?.[0] ?? 1)));
      for(const [objectiveId,def] of available)all.push({objectiveId,mapId,mapName:map.name,kind:def.kind ?? (objectiveId.startsWith("frontier_")?"hunt":"patrol"),players:levels.length,
        levelBand:`${Math.floor((Math.min(...levels)-1)/10)*10+1}-${Math.min(100,Math.ceil(Math.max(...levels)/10)*10)}`,warPhase:wars.get(mapId) ?? "none"});
    }
    return all.sort((a,b)=>b.players-a.players || a.mapId.localeCompare(b.mapId) || a.objectiveId.localeCompare(b.objectiveId)).slice(0,24);
  }
  private tick(now:number):void {
    if(this.snapshot(now) || this.planning || now<this.nextAt)return;
    const options=this.candidates(now);if(!options.length)return;
    this.planning=true;
    void this.plan(options).then(choice=>{
      const at=Date.now();
      // Do not start a stale plan if the last player left while the API was running.
      if(!this.candidates(at).some(candidate=>candidate.objectiveId===choice.option.objectiveId)){this.nextAt=at+15_000;return;}
      const def=FOREST_OBJECTIVES[choice.option.objectiveId];
      const event:DirectorEvent={id:randomUUID(),objectiveId:choice.option.objectiveId,mapId:choice.option.mapId,mapName:choice.option.mapName,
        name:`เหตุการณ์: ${def.name}`,story:choice.story,startsAt:at,endsAt:at+DURATION_MS,source:choice.source};
      const recent=[...this.recent,choice.option.objectiveId].slice(-4);
      this.save(event,this.nextAt,recent,choice.option.mapId);
      this.current=event;this.recent=recent;this.previousMap=choice.option.mapId;
    }).catch(()=>{console.error("MONTRA Director: cannot create or persist event");this.nextAt=Date.now()+15_000;}).finally(()=>{this.planning=false;});
  }
  private async plan(options:DirectorCandidate[]):Promise<{option:DirectorCandidate;story:string;source:"typhoon"|"rules"}> {
    const fresh=options.filter(option=>!this.recent.includes(option.objectiveId));
    const varied=fresh.some(option=>option.mapId!==this.previousMap)?fresh.filter(option=>option.mapId!==this.previousMap):fresh;
    const choices=(varied.length?varied:options).slice().sort((a,b)=>
      Number(b.warPhase==="battle" && (b.kind==="delivery" || b.kind==="defense"))-Number(a.warPhase==="battle" && (a.kind==="delivery" || a.kind==="defense")));
    const fallback=()=>({option:choices[0],story:"ผู้ดูแลพื้นที่ขอกำลังช่วยเหลือ ผู้เดินทางที่อยู่ใกล้สามารถเข้าร่วมได้",source:"rules" as const});
    const config=typhoonConfig(this.apiKey);
    if(!config)return fallback();
    try{
      const response=await this.fetcher(config.endpoint,{
        method:"POST",headers:{"content-type":"application/json",authorization:`Bearer ${config.key}`},redirect:"error",
        signal:AbortSignal.timeout(6000),body:JSON.stringify({model:config.model,temperature:0.5,max_tokens:180,
          messages:[{role:"system",content:"คุณเป็นผู้กำกับเหตุการณ์เกมไทย เลือก objectiveId เพียงหนึ่งค่าจากรายการที่ให้ หาก warPhase เป็น battle ให้พิจารณาภารกิจช่วยเหลือในโลกปกติ แต่ห้ามอ้างว่ามีผลต่อศึกหรือผู้ชนะ ตอบ JSON เท่านั้น: {\"objectiveId\":\"...\",\"story\":\"...\"} story เป็นข้อความภาษาไทยสั้นไม่เกิน 120 ตัวอักษร ห้ามระบุเวลา รางวัล ตัวเลข เงิน ไอเทม หรือกติกาใหม่"},
            {role:"user",content:JSON.stringify({choices})}]})});
      if(!response.ok){console.warn("MONTRA Director: Typhoon request failed",response.status);return fallback();}
      const body=await response.json() as {choices?:Array<{message?:{content?:unknown}}>};
      const content=body.choices?.[0]?.message?.content;if(typeof content!=="string" || content.length>2000){console.warn("MONTRA Director: invalid Typhoon response");return fallback();}
      const cleaned=content.trim().replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/,""),result=JSON.parse(cleaned) as {objectiveId?:unknown;story?:unknown};
      const option=choices.find(item=>item.objectiveId===result.objectiveId),story=safeStory(result.story);
      if(option && story)return {option,story,source:"typhoon"};
      console.warn("MONTRA Director: rejected Typhoon event proposal");return fallback();
    }catch{console.warn("MONTRA Director: Typhoon unavailable or invalid response");return fallback();}
  }
}
const persistentStore=WORLD_EXPANSION && process.env.MONTRA_DIRECTOR_PERSIST!=="0" ? ()=>{
  const directory=process.env.MONTRA_CHARACTER_DIR || fileURLToPath(new URL("../../data/characters",import.meta.url));
  return new DirectorStore(path.join(directory,"world-director.sqlite"));
} : undefined;
export const worldDirector=new WorldDirector(undefined,fetch,persistentStore);
