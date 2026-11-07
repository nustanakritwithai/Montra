"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const reference=fs.readFileSync('deploy/combat/fixtures/skill-motion-reference.js','utf8');
assert.equal(crypto.createHash('sha256').update(reference).digest('hex'),'1315f3dabc4014292661dabf3d8176cec87361faa0fb390cd77cc77b5be09923');
const load=require('./fixtures/skill-motion-loader.cjs');
function exercise(source){
 const log=[], context=vm.createContext({room:null, own:null, ownServerCharacter(){log.push('own');return context.own;}});
 vm.runInContext(source+'\n globalThis.api={swordSkillAction,muayMotion,muaySchoolOf};',context);
 const parse=vm.runInContext('JSON.parse',context);
 context.recordParse=raw=>{log.push(['parse',typeof raw==='object'&&raw!==null?'[object]':raw]);return parse(raw);};vm.runInContext('JSON.parse=recordParse',context);
 const api=context.api, result=[];
 function call(name,...args){try{const value=api[name](...args);result.push(typeof value==='function'?'function':JSON.parse(JSON.stringify(value)));}catch(e){result.push(['error',e.name,e.message]);}}
 call('swordSkillAction','twin_finale'); call('swordSkillAction','unknown'); call('swordSkillAction','unknown');
 for(const raw of ['{bad','{bad','null','{}','{"nodes":{"x":{"effect":"guard"}},"core":{"x":{"effect":"area"}}}','{"nodes":{"x":{"effect":"new"}}}']){
  context.room={state:{swordTreeCatalog:raw}};call('swordSkillAction','x');call('swordSkillAction','x');
 }
 context.room={get state(){log.push('state');return {get swordTreeCatalog(){log.push('sword');throw Error('catalog read');}};}};
 call('swordSkillAction','twin_finale');call('swordSkillAction','x');
 for(const id of ['step','punch','guard','chaiya_cover','parry','evade','counter','teep','chaiya_elbow','chaiya_knee','chaiya_finish','chaiya_return','korat_heavy','korat_swing','korat_finish','korat_pierce','korat_press','lopburi_angle','lopburi_counter','lopburi_finish','lopburi_reverse','lopburi_slipcounter','thasao_step','thasao_flurry','thasao_finish','thasao_rush','thasao_retreat'])call('muayMotion',id);
 for(const effect of ['step','strike','guard','parry','evade','counter','teep','sidestep','counter_sidestep','flurry','step_flurry','retreat_strike','grapple','unknown']){
  context.room={state:{muayBookCatalog:JSON.stringify({skills:{new:{effect}}})}};call('muayMotion','new');call('muayMotion','new');
 }
 for(const raw of ['bad','bad','null','[]',0,null]){context.room={state:{muayBookCatalog:raw}};call('muayMotion','new');}
 // Known mappings are intentionally mutable stable arrays, not clones.
 const known=api.muayMotion('punch');known.push('mutated');assert.equal(api.muayMotion('punch'),known);call('muayMotion','punch');
 assert.notEqual(api.muayMotion('unknown'),api.muayMotion('unknown'));
 context.own={muayBookData:'{"school":"korat"}'};call('muaySchoolOf',{local:true});call('muaySchoolOf',{local:true});
 const players={get(id){assert.equal(this,players);log.push(['player',id]);return {muayBookData:'{"school":"lopburi"}'};}};
 context.room={state:{players}};call('muaySchoolOf',{id:'remote'});call('muaySchoolOf',null);
 for(const raw of ['bad','bad','null','{}','{"school":""}','{"school":42}']){context.own={muayBookData:raw};call('muaySchoolOf',{local:true});}
 context.room=null;call('muaySchoolOf',{id:'missing'});context.own=undefined;call('muaySchoolOf',{local:true});
 // Non-string catalog coercion can throw during parsing; the raw identity is
 // cached before the failure, so a second lookup does not retry conversion.
 let conversions=0;
 const raw={toString(){log.push('coerce');conversions++;throw Error('bad conversion');}};
 context.room={state:{swordTreeCatalog:raw}};call('swordSkillAction','x');call('swordSkillAction','x');assert.equal(conversions,1);
 context.room={state:{swordTreeCatalog:'{}'}};call('swordSkillAction','x');
 context.room={state:{swordTreeCatalog:raw}};call('swordSkillAction','x');assert.equal(conversions,2);
 // Inherited object keys retain legacy lookup behavior.
 call('swordSkillAction','toString');call('muayMotion','toString');
 return {result,log};
}
assert.deepEqual(exercise(load()),exercise(reference));
const expected=exercise(reference);
assert.deepEqual(expected.result.slice(0,3),['finale','twin','twin']);
assert(expected.result.some(v=>Array.isArray(v)&&v[0]==='error'&&v[2]==='catalog read'));
assert(expected.log.some(v=>Array.isArray(v)&&v[0]==='parse'));
console.log('PASS skill-motion characterization: cache hits, malformed data, effect maps, mutation, errors, live reads and receiver order');
const mutations=[
 ['if (skillId === "twin_finale") return "finale";','if (skillId === "twin_finale") return "twin";'],
 ['{...catalog?.nodes,...catalog?.core}','{...catalog?.core,...catalog?.nodes}'],
 ['raw !== swordCatalogRaw','true'],
 ['return MUAY_MOTIONS[skillId];','return [...MUAY_MOTIONS[skillId]];'],
 ['grapple: "m_clinch"','grapple: "m_throw"'],
 ['p?.muayBookData || ""','""'],
 ['if (!schoolCache.has(raw))','if (schoolCache.size === 0)'],
 ['room?.state?.players?.get?.(a.id)','room?.state?.players?.get?.("wrong")'],
];
for(const [from,to] of mutations){assert(reference.includes(from),from);assert.throws(()=>assert.deepEqual(exercise(reference.replace(from,to)),expected),'Undetected mutation: '+from);}
console.log('PASS '+mutations.length+' rejected skill-motion source mutations');
