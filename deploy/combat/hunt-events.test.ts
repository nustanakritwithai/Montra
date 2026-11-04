import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {HuntEventDirector,huntBonus,parseProposal} from './HuntEvents.js';
import {HuntEventStore} from './HuntEventStore.js';

const maps=[{mapId:'forbidden_forest',name:'ป่าต้องห้าม',players:2,minLevel:1,maxLevel:8,hasNormal:true,hasStrong:true}];
test('accept only an offered map and predefined event; reject unsafe text',()=>{
  assert.ok(parseProposal({mapId:'forbidden_forest',kind:'all_hunt',story:'หมอกปกคลุมป่าเหล่านักล่าจึงออกเดินทาง'},maps));
  assert.equal(parseProposal({mapId:'forbidden_forest',kind:'unknown',story:'หมอกปกคลุมป่าเหล่านักล่าจึงออกเดินทาง'},maps),null);
  assert.equal(parseProposal({mapId:'other',kind:'all_hunt',story:'หมอกปกคลุมป่าเหล่านักล่าจึงออกเดินทาง'},maps),null);
  assert.equal(parseProposal({mapId:'forbidden_forest',kind:'strong_hunt',story:'หมอกปกคลุมป่าเหล่านักล่าจึงออกเดินทาง'},[{...maps[0],hasStrong:false}]),null);
  assert.equal(parseProposal({mapId:'forbidden_forest',kind:'normal_hunt',story:'หมอกปกคลุมป่าเหล่านักล่าจึงออกเดินทาง'},[{...maps[0],hasNormal:false}]),null);
  assert.equal(parseProposal({mapId:'forbidden_forest',kind:'all_hunt',story:'รับไอเทมทอง 100 ฟรี'},maps),null);
});
test('server controls eligible bonus, per tier, and expiry',()=>{
  const event={id:'a',mapId:'forbidden_forest',mapName:'ป่าต้องห้าม',kind:'all_hunt' as const,story:'เรื่องราว',startsAt:10,endsAt:100,source:'typhoon' as const,goal:5,kills:0};
  assert.equal(huntBonus(event,'forbidden_forest','normal',100,50),10);
  assert.equal(huntBonus(event,'another','normal',100,50),0);
  assert.equal(huntBonus(event,'forbidden_forest','boss',100,50),0);
  assert.equal(huntBonus(event,'forbidden_forest','normal',100,100),0);
  assert.equal(huntBonus({...event,kind:'strong_hunt'},'forbidden_forest','normal',100,50),0);
  assert.equal(huntBonus({...event,kind:'strong_hunt'},'forbidden_forest','elite',100,50),20);
  assert.equal(huntBonus({...event,kills:5},'forbidden_forest','normal',100,50),15);
  assert.equal(huntBonus({...event,kind:'strong_hunt',kills:5},'forbidden_forest','elite',100,50),25);
  assert.equal(huntBonus({...event,kind:'normal_hunt'},'forbidden_forest','normal',100,50),15);
  assert.equal(huntBonus({...event,kind:'normal_hunt'},'forbidden_forest','elite',100,50),0);
});

test('eligible kills advance a shared bounded goal without changing captured snapshots',async()=>{
  let now=1000;const d=new HuntEventDirector(async()=>({mapId:'forbidden_forest',kind:'all_hunt',story:'เหล่านักล่าร่วมกันปกป้องพื้นที่'}),()=>now);
  d.observe('room',maps,now);await d.settle();const start=d.snapshot(now)!;
  assert.equal(start.goal,6);assert.equal(start.kills,0);
  assert.equal(d.recordKill('other','normal',true,now),false);
  assert.equal(d.recordKill('forbidden_forest','boss',true,now),false);
  assert.equal(d.recordKill('forbidden_forest','normal',false,now),false);
  for(let i=0;i<7;i++)d.recordKill('forbidden_forest','normal',true,now);
  assert.equal(start.kills,0);assert.equal(d.snapshot(now)!.kills,6);
  assert.equal(d.recordKill('forbidden_forest','normal',true,now),false);
  assert.equal(d.recordKill('forbidden_forest','normal',true,now+16*60000),false);
});
test('strong objective ignores normal monsters and abandoned model plans',async()=>{
  let now=1000;const d=new HuntEventDirector(async()=>({mapId:'forbidden_forest',kind:'strong_hunt',story:'เหล่านักล่าร่วมกันปกป้องพื้นที่'}),()=>now);
  d.observe('room',maps,now);await d.settle();assert.equal(d.recordKill('forbidden_forest','normal',true,now),false);assert.equal(d.recordKill('forbidden_forest','elite',true,now),true);assert.equal(d.snapshot(now)?.kills,1);
  let finish:(value:unknown)=>void=()=>{};
  const abandoned=new HuntEventDirector(()=>new Promise(resolve=>{finish=resolve;}),()=>now);
  abandoned.observe('room',maps,now);abandoned.forget('room');finish({mapId:'forbidden_forest',kind:'all_hunt',story:'เหล่านักล่าร่วมกันปกป้องพื้นที่'});
  await abandoned.settle();assert.equal(abandoned.snapshot(now),null);
});
test('normal objective counts ordinary monsters and excludes elite',async()=>{
  const d=new HuntEventDirector(async()=>({mapId:'forbidden_forest',kind:'normal_hunt',story:'เหล่านักล่าร่วมกันปกป้องพื้นที่'}),()=>1000);
  d.observe('room',maps,1000);await d.settle();assert.equal(d.recordKill('forbidden_forest','elite',true,1000),false);assert.equal(d.recordKill('forbidden_forest','normal',true,1000),true);assert.equal(d.snapshot(1000)?.kills,1);
});

test('SQLite restores active event, progress and cooldown and fails closed on invalid data',async()=>{
  const file=path.join(mkdtempSync(path.join(os.tmpdir(),'hunt-store-')),'hunt.sqlite');let now=1000;
  const ask=async()=>({mapId:'forbidden_forest',kind:'all_hunt',story:'เหล่านักล่าร่วมกันปกป้องพื้นที่'});
  const d=new HuntEventDirector(ask,()=>now,()=>new HuntEventStore(file));
  d.observe('one',maps,now);await d.settle();const first=d.snapshot(now)!;
  d.recordKill('forbidden_forest','normal',true,now);d.close();
  const restored=new HuntEventDirector(ask,()=>now,()=>new HuntEventStore(file));
  assert.equal(restored.snapshot(now)?.id,first.id);assert.equal(restored.snapshot(now)?.kills,1);
  now=first.endsAt+1;assert.equal(restored.snapshot(now),null);restored.close();
  let calls=0;const cooldown=new HuntEventDirector(async()=>{calls++;return ask();},()=>now,()=>new HuntEventStore(file));
  cooldown.observe('one',maps,now);await cooldown.settle();assert.equal(calls,0);
  now=first.endsAt+300001;cooldown.observe('one',maps,now);await cooldown.settle();assert.equal(calls,1);assert.notEqual(cooldown.snapshot(now)?.kind,first.kind);cooldown.close();
});

test('storage failure never advances an unrecorded goal',async()=>{
  let writes=0;const store={load:():null=>null,close:()=>{},save:()=>{if(++writes>1)throw Error('disk_full');}};
  const d=new HuntEventDirector(async()=>({mapId:'forbidden_forest',kind:'all_hunt',story:'เหล่านักล่าร่วมกันปกป้องพื้นที่'}),()=>1000,()=>store);
  d.observe('one',maps,1000);await d.settle();assert.equal(d.recordKill('forbidden_forest','normal',true,1000),false);assert.equal(d.snapshot(1000)?.kills,0);
});
test('corrupted stored schedule blocks planning and is reported',async()=>{
  const file=path.join(mkdtempSync(path.join(os.tmpdir(),'hunt-bad-')),'hunt.sqlite');const store=new HuntEventStore(file);store.close();
  const db=new DatabaseSync(file);db.prepare('INSERT INTO hunt_event_state(id,state) VALUES(1,?)').run('{"event":{"goal":-1}}');db.close();let calls=0;
  const d=new HuntEventDirector(async()=>{calls++;return {};},()=>1000,()=>new HuntEventStore(file));
  d.observe('room',maps,1000);await d.settle();assert.equal(d.status(1000).state,'storage_unavailable');assert.equal(calls,0);assert.equal(d.snapshot(1000),null);d.close();
});
test('one shared plan is asynchronous, falls back on invalid AI and does not run in empty maps',async()=>{
  let calls=0,now=1000;const d=new HuntEventDirector(async()=>{calls++;return {mapId:'bogus',kind:'x',story:'no'}},()=>now);
  d.observe('room',[],now);await d.settle();assert.equal(calls,0);
  d.observe('room',maps,now);d.observe('room',maps,now);await d.settle();assert.equal(calls,1);
  const e=d.snapshot(now);assert.equal(e?.source,'rules');assert.equal(e?.mapId,'forbidden_forest');
  d.observe('room',maps,now);await d.settle();assert.equal(calls,1);
  assert.equal(d.snapshot(e!.endsAt),null);
});
