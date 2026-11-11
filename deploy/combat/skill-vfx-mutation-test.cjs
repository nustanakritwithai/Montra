// Negative controls: each audited defect must make the executable suite fail.
// Mutants live only in a disposable copy, never the source checkout.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'montra-vfx-mutants-'));
const net='src/client/network/044-state-sync-and-connection.js',spell='src/client/combat/040-spell-visuals.js',fx='src/client/render/009-effects-and-target-hud.js';
const replace=(s,a,b)=>{assert(s.includes(a),'mutation anchor '+a);return s.replace(a,b);};
const mutants=[
 ['missing binding helper',spell,s=>replace(s,'showTalisman(skillVfxTargetMesh(targetId || tgt.id));','missingBindingHelper();')],
 ['observer target instead of server target',net,s=>replace(s,'const target=skillVfxTarget(data.targetId);','const target=monsterForSpell(spellTargetId || caster.targetId);')],
 ['missing Mender dispatch',net,s=>replace(s,'        triggerSkillVfx(data.skillId, caster, target, data.targetId);\n        if(target)eventFx','        if(target)eventFx')],
 ['schema facing ignored',spell,s=>replace(s,'Number.isFinite(caster.heading) ? caster.heading : (caster.facing || 0)','caster.heading || 0')],
 ['local schema identity ignored',spell,s=>replace(s,' || caster === ownServerCharacter()','')],
 ['combat map guard missing',net,s=>replace(s,'        if (!struckState || (struckState.mapId || "ritual_village") !== activeMapId) return;','')],
 ['buffalo map guard missing',net,s=>replace(s,'        if(!caster || (caster.mapId || "ritual_village")!==activeMapId || !skillVfxTarget(data?.targetId))return;','')],
 ['effect owner map ignored',fx,s=>replace(s,'f.mapId !== activeMapId || ','')],
 ['effect owner room ignored',fx,s=>replace(s,'f.room !== room || ','')],
 ['remote follow map ignored',fx,s=>replace(s,' || (typeof f.follow?.mapId === "string" && (f.follow.mapId || "ritual_village") !== activeMapId)','')],
 ['telegraph priority missing',fx,s=>s.replaceAll('critical: true','critical: false')],
 ['explicit pool teardown omitted',spell,s=>replace(s,'    clearWorldFx();','')],
];
try {
 fs.cpSync(path.join(root,'src/client'),path.join(temp,'src/client'),{recursive:true});
 fs.mkdirSync(path.join(temp,'deploy/combat'),{recursive:true});
 for(const file of ['skill-vfx-test.cjs','SkillCatalog.ts','MuayRules.ts','BladeRules.ts','SentinelRules.ts','OccultRules.ts'])fs.copyFileSync(path.join(__dirname,file),path.join(temp,'deploy/combat',file));
 const run=()=>spawnSync(process.execPath,['--test','--test-reporter=tap','deploy/combat/skill-vfx-test.cjs'],{cwd:temp,encoding:'utf8',timeout:15000});
 const baseline=run();assert.equal(baseline.status,0,baseline.stdout+baseline.stderr);
 for(const [name,file,mutate] of mutants) {
  const target=path.join(temp,file),original=fs.readFileSync(target,'utf8'),changed=mutate(original);assert.notEqual(original,changed,name);
  fs.writeFileSync(target,changed);const result=run();fs.writeFileSync(target,original);
  assert.equal(result.signal,null,name+' must fail assertions, not time out');assert.notEqual(result.status,0,name+' escaped detection');assert.match(result.stdout,/not ok/);console.log('REJECTED VFX mutant:',name);
 }
 assert.equal(run().status,0,'restored exact source passes again');
 console.log(`PASS ${mutants.length} VFX negative controls; runtime checkout untouched`);
} finally {fs.rmSync(temp,{recursive:true,force:true});}
