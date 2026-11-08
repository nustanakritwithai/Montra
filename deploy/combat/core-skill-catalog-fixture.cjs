// Read only the pure catalog literals/progression functions from current server
// sources. No room, account, network or player state is created by this fixture.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, 'deploy/combat', file+'.ts'), 'utf8');
const definitions = [
 ['phutthaisawan','SkillCatalog','SWORD_CORE','swordCoreProgress'],
 ['muay_boran','MuayRules','MUAY_CORE','muayCoreProgress'],
 ['blade','BladeRules','BLADE_CORE','bladeCoreProgress'],
 ['sentinel','SentinelRules','SENTINEL_CORE','sentinelCoreProgress'],
 ['seer','OccultRules','SEER_CORE','seerCoreProgress'],
 ['mender','OccultRules','MENDER_CORE','menderCoreProgress']
];
function literal(source, name) {
 const match=source.match(new RegExp('export const '+name+'\\s*=\\s*([\\s\\S]*?) as const;'));assert(match,name);
 return vm.runInNewContext('('+match[1]+')');
}
const levels=literal(read('MuayRules'),'MUAY_CORE_LEVELS'),points=literal(read('MuayRules'),'MUAY_CORE_POINT_LEVELS');
const catalogs={};
for(const [classId,file,constant,progressName] of definitions){
 const source=read(file),core=literal(source,constant);
 const start=source.indexOf('export function '+progressName+'(');assert(start>=0);
 const next=source.indexOf('\nexport ',start+1);assert(next>start);
 const fn=source.slice(start,next).replace('export function','function').replace(/rank\s*:\s*number/,'rank');
 const progress=vm.runInNewContext(fn+'\n'+progressName);
 catalogs[classId]={core,coreLevels:levels,corePointLevels:points,coreManaPerRank:1,coreProgress:Object.fromEntries(Array.from({length:9},(_,i)=>[i,progress(i)]))};
 assert.equal(Object.keys(core).length,4,classId);
}
module.exports=JSON.parse(JSON.stringify(catalogs));
