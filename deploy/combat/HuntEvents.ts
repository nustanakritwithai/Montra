import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import type {MonsterTier} from './MonsterProfiles.js';
import {HuntEventStore,type HuntStore} from './HuntEventStore.js';

export type HuntKind='all_hunt'|'normal_hunt'|'strong_hunt';
export type HuntMap={mapId:string;name:string;players:number;minLevel:number;maxLevel:number;hasNormal:boolean;hasStrong:boolean};
export type HuntEvent={id:string;mapId:string;mapName:string;kind:HuntKind;story:string;startsAt:number;endsAt:number;source:'typhoon'|'rules';goal:number;kills:number};
type Proposal={mapId:string;kind:HuntKind;story:string};
type Ask=(maps:HuntMap[],avoidKind?:HuntKind|'')=>Promise<unknown>;
const DURATION=15*60_000,REST=5*60_000,OBSERVATION_TTL=45_000;
const storyValid=(s:unknown):s is string=>typeof s==='string' && s.trim().length>=8 && s.length<=120 && !/[<>\u0000-\u001f\d]|https?:|www\.|รางวัล|เหรียญ|ทอง|ไอเทม|นาที|ชั่วโมง|เปอร์เซ็นต์|ฟรี|%/i.test(s);
export function parseProposal(value:unknown,maps:HuntMap[]):Proposal|null{
  if(!value || typeof value!=='object' || Array.isArray(value))return null;
  const p=value as Record<string,unknown>;
  const map=maps.find(m=>m.mapId===p.mapId);
  if(typeof p.mapId!=='string' || !map || (p.kind!=='all_hunt' && p.kind!=='normal_hunt' && p.kind!=='strong_hunt') || (p.kind==='normal_hunt' && !map.hasNormal) || (p.kind==='strong_hunt' && !map.hasStrong) || !storyValid(p.story))return null;
  return {mapId:p.mapId,kind:p.kind,story:p.story.normalize('NFC').trim()};
}
export function huntBonus(event:HuntEvent|null,mapId:string,tier:MonsterTier,base:number,now=Date.now()):number{
  if(!event || now<event.startsAt || now>=event.endsAt || event.mapId!==mapId || !Number.isSafeInteger(base) || base<=0 || tier==='boss')return 0;
  const extra=event.kills>=event.goal ? 5 : 0;
  if(event.kind==='all_hunt')return Math.floor(base*(10+extra)/100);
  if(event.kind==='normal_hunt')return tier==='weak' || tier==='normal'?Math.floor(base*(15+extra)/100):0;
  return tier==='strong' || tier==='elite'?Math.floor(base*(20+extra)/100):0;
}
export async function askHuntTyphoon(maps:HuntMap[],avoidKind:HuntKind|''=''):Promise<unknown>{
  const response=await fetch('http://127.0.0.1:8787/api/chat',{method:'POST',headers:{'content-type':'application/json'},signal:AbortSignal.timeout(10_000),body:JSON.stringify({messages:[
    {role:'system',content:'คุณเป็นผู้กำกับเหตุการณ์ล่ามอนสเตอร์ในเกม เลือก mapId จากรายการเท่านั้น และ kind เป็น all_hunt, normal_hunt หรือ strong_hunt เท่านั้น normal_hunt ต้อง hasNormal เป็น true และ strong_hunt ต้อง hasStrong เป็น true หลีกเลี่ยง kind ที่ระบุใน avoidKind แต่ง story ภาษาไทยบรรยากาศสั้นไม่เกิน 120 ตัวอักษร ห้ามอ้างว่ามีมอนสเตอร์ใหม่ ห้ามระบุรางวัล เวลา ตัวเลข หรือกติกา ตอบ JSON {"mapId":"...","kind":"...","story":"..."}'},
    {role:'user',content:JSON.stringify({maps,avoidKind})}],temperature:0.5,max_tokens:250})});
  if(!response.ok)throw Error('model_unavailable');
  const body=await response.json() as {content?:unknown};
  if(typeof body.content!=='string' || body.content.length>2000)throw Error('model_invalid');
  return JSON.parse(body.content.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));
}
export class HuntEventDirector{
  private rooms=new Map<string,{at:number;maps:HuntMap[]}>();
  private event:HuntEvent|null=null;
  private nextAt=0;
  private pending:Promise<void>|null=null;
  private previousMap='';
  private previousKind:HuntKind|''='';
  private ask:Ask;
  private clock:()=>number;
  private storeFactory?:()=>HuntStore;
  private store?:HuntStore;
  private initialized=false;
  private storageProblem=false;
  private retryAt=0;
  constructor(ask:Ask=askHuntTyphoon,clock:()=>number=Date.now,storeFactory?:()=>HuntStore){this.ask=ask;this.clock=clock;this.storeFactory=storeFactory;}
  private ensureLoaded(now:number):boolean{
    if(this.initialized)return true;
    if(now<this.retryAt)return false;
    try{
      this.store=this.storeFactory?.();const state=this.store?.load();
      if(state){this.event=state.event;this.nextAt=state.nextAt;this.previousMap=state.previousMap;this.previousKind=state.previousKind??'';}
      this.initialized=true;this.storageProblem=false;return true;
    }catch{
      try{this.store?.close();}catch{}this.store=undefined;this.retryAt=now+15_000;
      this.storageProblem=true;console.error('MONTRA hunt state unavailable');return false;
    }
  }
  private save(event:HuntEvent|null,nextAt=this.nextAt,previousMap=this.previousMap,previousKind=this.previousKind):boolean{
    try{this.store?.save({event,nextAt,previousMap,previousKind});this.storageProblem=false;return true;}catch{this.storageProblem=true;console.error('MONTRA hunt state save failed');return false;}
  }
  close():void{this.store?.close();this.store=undefined;this.initialized=false;}
  observe(room:string,maps:HuntMap[],now=this.clock()):void{
    if(!room)return;
    this.rooms.set(room,{at:now,maps:maps.filter(m=>/^[a-z0-9_]{1,80}$/.test(m.mapId) && typeof m.name==='string' && m.name.length<=100 && typeof m.hasNormal==='boolean' && typeof m.hasStrong==='boolean' && Number.isSafeInteger(m.players) && m.players>0 && Number.isInteger(m.minLevel) && Number.isInteger(m.maxLevel) && m.minLevel>=1 && m.maxLevel<=100 && m.maxLevel>=m.minLevel)});
    this.tick(now);
  }
  forget(room:string):void{this.rooms.delete(room);}
  snapshot(now=this.clock()):HuntEvent|null{
    if(!this.ensureLoaded(now))return null;
    if(this.event && now>=this.event.endsAt){
      const nextAt=this.event.endsAt+REST;
      if(!this.save(null,nextAt))return null;
      this.nextAt=nextAt;this.event=null;
    }
    return this.event?{...this.event}:null;
  }
  status(now=this.clock()){
    const event=this.snapshot(now);
    return {state:this.initialized && !this.storageProblem?'ready':'storage_unavailable',event,nextAt:this.nextAt,planning:Boolean(this.pending),serverNow:now};
  }
  /** Called once for a real server-owned kill, never once per party member. */
  recordKill(mapId:string,tier:MonsterTier,eligible:boolean,now=this.clock()):boolean{
    if(!this.ensureLoaded(now))return false;
    const event=this.event;
    if(!eligible || !event || now<event.startsAt || now>=event.endsAt || event.mapId!==mapId || event.kills>=event.goal || tier==='boss' || (event.kind==='strong_hunt' && tier!=='strong' && tier!=='elite') || (event.kind==='normal_hunt' && tier!=='normal' && tier!=='weak'))return false;
    const updated={...event,kills:event.kills+1};
    if(!this.save(updated))return false;
    this.event=updated;
    if(updated.kills===updated.goal)console.info('MONTRA hunt objective completed',JSON.stringify({id:updated.id,mapId:updated.mapId,goal:updated.goal}));
    return true;
  }
  settle():Promise<void>{return this.pending ?? Promise.resolve();}
  private options(now:number):HuntMap[]{
    const out=new Map<string,HuntMap>();
    for(const [id,room] of this.rooms){
      if(now-room.at>OBSERVATION_TTL){this.rooms.delete(id);continue;}
      for(const m of room.maps){const old=out.get(m.mapId);out.set(m.mapId,old?{...old,players:old.players+m.players,minLevel:Math.min(old.minLevel,m.minLevel),maxLevel:Math.max(old.maxLevel,m.maxLevel),hasNormal:old.hasNormal||m.hasNormal,hasStrong:old.hasStrong||m.hasStrong}:{...m});}
    }
    return [...out.values()].sort((a,b)=>b.players-a.players || a.mapId.localeCompare(b.mapId)).slice(0,24);
  }
  private tick(now:number):void{
    if(!this.ensureLoaded(now) || this.snapshot(now) || this.event || this.pending || now<this.nextAt)return;
    const options=this.options(now);if(!options.length)return;
    const choices=options.length>1?options.filter(m=>m.mapId!==this.previousMap):options;
    this.pending=(async()=>{
      let proposal:Proposal|null=null,failed=false;
      try{proposal=parseProposal(await this.ask(choices,this.previousKind),choices);}catch{failed=true;}
      if(proposal && proposal.kind===this.previousKind){
        const selected=choices.find(m=>m.mapId===proposal!.mapId)!;
        const alternatives:HuntKind[]=['all_hunt',...(selected.hasNormal?['normal_hunt' as const]:[]),...(selected.hasStrong?['strong_hunt' as const]:[])];
        if(alternatives.some(kind=>kind!==this.previousKind))proposal=null;
      }
      const source=proposal?'typhoon':'rules';
      const first=choices[0],alternatives:HuntKind[]=['all_hunt',...(first.hasNormal?['normal_hunt' as const]:[]),...(first.hasStrong?['strong_hunt' as const]:[])];
      proposal ??= {mapId:first.mapId,kind:alternatives.find(kind=>kind!==this.previousKind)??alternatives[0],story:'เหล่าผู้เดินทางร่วมมือกันรับมือกับวิญญาณในพื้นที่'};
      const at=this.clock(),map=this.options(at).find(m=>m.mapId===proposal!.mapId);
      if(!map){this.nextAt=at+15_000;return;}
      const event:HuntEvent={id:randomUUID(),mapId:map.mapId,mapName:map.name,kind:proposal.kind,story:proposal.story,startsAt:at,endsAt:at+DURATION,source,goal:Math.max(5,Math.min(30,map.players*3)),kills:0};
      if(!this.save(event,this.nextAt,map.mapId,event.kind)){this.nextAt=at+15_000;return;}
      this.event=event;
      this.previousMap=map.mapId;
      this.previousKind=event.kind;
      console.info('MONTRA hunt event started',JSON.stringify({id:this.event.id,mapId:map.mapId,kind:proposal.kind,source,goal:this.event.goal,endsAt:this.event.endsAt,...(source==='rules'?{reason:failed?'unavailable':'invalid_proposal'}:{})}));
    })().finally(()=>{this.pending=null;});
  }
}
const storeFactory=process.env.MONTRA_WORLD_EXPANSION==='1' && process.env.MONTRA_HUNT_EVENTS!=='0' ? ()=>{
  const directory=process.env.MONTRA_CHARACTER_DIR || fileURLToPath(new URL('../../data/characters',import.meta.url));
  return new HuntEventStore(path.join(directory,'hunt-event.sqlite'));
} : undefined;
export const huntEventDirector=new HuntEventDirector(undefined,undefined,storeFactory);
