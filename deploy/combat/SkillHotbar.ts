/** Versioned presentation loadouts. Combat resources stay in their original books. */
import {SWORD_CORE,SWORD_NODES,SWORD_SCHOOLS,type SwordTree} from './SkillCatalog.js';
import {MUAY_CORE,MUAY_LESSONS,MUAY_SCHOOLS,MUAY_SKILLS,isMuayFoundation,type MuayBook} from './MuayRules.js';
import {BLADE_CORE,BLADE_LESSONS,type BladeBook} from './BladeRules.js';
import {SENTINEL_CORE,SENTINEL_LESSONS,type SentinelBook} from './SentinelRules.js';
import {SEER_CORE,MENDER_CORE,OCCULT_LESSONS,type OccultBook} from './OccultRules.js';
/** Operational rollback switch: preserve saved layouts while serving the legacy protocol. */
export const MIXED_SKILLS_ENABLED=process.env.MONTRA_MIXED_SKILLS!=='0';
export type HotbarSlot={kind:'core'|'advanced';id:string}|null;
export type MixedSkillLoadouts={version:1;loadouts:Record<string,HotbarSlot[]>};
export type HotbarBooks={swordTree?:SwordTree;muayBook?:MuayBook;bladeBook?:BladeBook;sentinelBook?:SentinelBook;occultBook?:OccultBook};
const cores:Record<string,object>={phutthaisawan:SWORD_CORE,muay_boran:MUAY_CORE,blade:BLADE_CORE,sentinel:SENTINEL_CORE,seer:SEER_CORE,mender:MENDER_CORE};
const record=(v:unknown):v is Record<string,unknown>=>!!v && typeof v==='object' && !Array.isArray(v);
export function hotbarSchool(path:string,b:HotbarBooks):string{return path==='phutthaisawan'?b.swordTree?.school??'phutthaisawan':path==='muay_boran'?b.muayBook?.school??'chaiya':'';}
export function defaultHotbar(path:string):HotbarSlot[]{return Object.keys(cores[path]??{}).map(id=>({kind:'core',id}));}
export function validHotbarScope(path:string,school:string):boolean{return Object.hasOwn(cores,path) && (path==='phutthaisawan'?Object.hasOwn(SWORD_SCHOOLS,school):path==='muay_boran'?Object.hasOwn(MUAY_SCHOOLS,school):school==='');}
export function availableHotbarSlot(path:string,school:string,slot:HotbarSlot,b:HotbarBooks):boolean{
 if(!slot)return true;if(slot.kind==='core')return Object.hasOwn(cores[path]??{},slot.id);
 const id=slot.id;
 if(path==='phutthaisawan'){const n=SWORD_NODES[id];return !!n && !!b.swordTree?.learned.includes(id) && n.effect!=='passive' && (n.school==='common'||n.school===school);}
 if(path==='muay_boran'){const n=(MUAY_LESSONS as Record<string,{school:string}>)[id];return !!n && Object.hasOwn(MUAY_SKILLS,id) && !!b.muayBook?.learned.some(s=>s===id) && (isMuayFoundation(id)||n.school===school);}
 if(path==='blade'||path==='sentinel'){const book=path==='blade'?b.bladeBook:b.sentinelBook;const n=(path==='blade'?BLADE_LESSONS:SENTINEL_LESSONS) as Record<string,{effect:string}>;return !!n[id] && n[id].effect!=='passive' && !!book?.learned.some(s=>s===id);}
 if(path==='seer'||path==='mender'){const n=(OCCULT_LESSONS as Record<string,{effect:string;path:string}>)[id];return !!n && n.path===path && n.effect!=='passive' && !!b.occultBook?.learned[path].some(s=>s===id);}
 return false;
}
export function validateHotbarSlots(value:unknown,path:string):HotbarSlot[]{
 if(!Array.isArray(value)||value.length!==4)throw Error('invalid_skill_hotbar');
 const seen=new Set<string>();let advanced=0;
 return value.map(slot=>{if(slot===null)return null;if(!record(slot)||Object.keys(slot).length!==2||(slot.kind!=='core'&&slot.kind!=='advanced')||typeof slot.id!=='string'||slot.id.length>80)throw Error('invalid_skill_hotbar');
 const key=slot.kind+':'+slot.id;if(seen.has(key))throw Error('invalid_skill_hotbar');seen.add(key);if(slot.kind==='advanced'&&++advanced>3&&path==='phutthaisawan')throw Error('invalid_skill_hotbar');return {kind:slot.kind,id:slot.id};});
}
export function validateMixedSkillLoadouts(value:unknown,b:HotbarBooks):MixedSkillLoadouts{
 if(!record(value)||value.version!==1||Object.keys(value).length!==2||!record(value.loadouts)||Object.keys(value.loadouts).length>12)throw Error('invalid_skill_hotbar');
 const loadouts:Record<string,HotbarSlot[]>={};
 for(const [key,slots] of Object.entries(value.loadouts)){const [path,school,...rest]=key.split(':');if(rest.length||school===undefined||!validHotbarScope(path,school))throw Error('invalid_skill_hotbar');loadouts[key]=validateHotbarSlots(slots,path).map(slot=>availableHotbarSlot(path,school,slot,b)?slot:null);}
 return {version:1,loadouts};
}
export function hotbarState(pathId:string,b:HotbarBooks,saved?:MixedSkillLoadouts){const school=hotbarSchool(pathId,b),slots=saved?.loadouts[pathId+':'+school]??defaultHotbar(pathId);return {version:1 as const,pathId,school,slots:slots.map(slot=>availableHotbarSlot(pathId,school,slot,b)?slot:null)};}
