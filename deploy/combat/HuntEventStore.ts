import {mkdirSync} from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import type {HuntEvent,HuntKind} from './HuntEvents.js';

export type HuntState={event:HuntEvent|null;nextAt:number;previousMap:string;previousKind?:HuntKind|''};
export type HuntStore={load():HuntState|null;save(state:HuntState):void;close():void};
function validState(value:unknown):value is HuntState{
  if(!value || typeof value!=='object' || Array.isArray(value))return false;
  const s=value as HuntState,e=s.event;
  if(!Number.isSafeInteger(s.nextAt) || s.nextAt<0 || typeof s.previousMap!=='string' || (s.previousMap!=='' && !/^[a-z0-9_]{1,80}$/.test(s.previousMap)) || (s.previousKind!==undefined && !['','all_hunt','normal_hunt','strong_hunt'].includes(s.previousKind)))return false;
  if(e===null)return true;
  return Boolean(e && typeof e.id==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(e.id) &&
    typeof e.mapId==='string' && /^[a-z0-9_]{1,80}$/.test(e.mapId) && typeof e.mapName==='string' && e.mapName.length>0 && e.mapName.length<=100 &&
    (e.kind==='all_hunt' || e.kind==='normal_hunt' || e.kind==='strong_hunt') && typeof e.story==='string' && e.story.trim().length>=8 && e.story.length<=120 &&
    !/[<>\u0000-\u001f\d]|https?:|www\.|รางวัล|เหรียญ|ทอง|ไอเทม|นาที|ชั่วโมง|เปอร์เซ็นต์|ฟรี|%/i.test(e.story) &&
    Number.isSafeInteger(e.startsAt) && e.startsAt>=0 && Number.isSafeInteger(e.endsAt) && e.endsAt-e.startsAt===15*60_000 &&
    (e.source==='typhoon' || e.source==='rules') && Number.isInteger(e.goal) && e.goal>=5 && e.goal<=30 && Number.isInteger(e.kills) && e.kills>=0 && e.kills<=e.goal);
}
export class HuntEventStore implements HuntStore{
  private db:DatabaseSync;
  constructor(file:string){
    mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
    this.db=new DatabaseSync(file);
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; CREATE TABLE IF NOT EXISTS hunt_event_state (id INTEGER PRIMARY KEY CHECK(id=1), state TEXT NOT NULL)');
  }
  load():HuntState|null{
    const row=this.db.prepare('SELECT state FROM hunt_event_state WHERE id=1').get();
    if(!row)return null;
    if(typeof row.state!=='string')throw Error('hunt_state_invalid');
    const state:unknown=JSON.parse(row.state);
    if(!validState(state))throw Error('hunt_state_invalid');
    return state;
  }
  save(state:HuntState):void{
    if(!validState(state))throw Error('hunt_state_invalid');
    this.db.prepare('INSERT INTO hunt_event_state(id,state) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET state=excluded.state').run(JSON.stringify(state));
  }
  close():void{this.db.close();}
}
