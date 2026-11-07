'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('src/client-modules/skill-motion.js','utf8');
const context=vm.createContext({});
for(const name of ['room','document','window','performance','B'])Object.defineProperty(context,name,{get(){assert.fail('Eager dependency '+name);}});
vm.runInContext(source,context);
const factory=context.MontraSkillMotion;
assert(Object.isFrozen(factory));assert.deepEqual(Object.keys(factory),['create']);
const events=[];let room={state:{swordTreeCatalog:'{"nodes":{"x":{"effect":"guard"}}}',muayBookCatalog:'{"skills":{"x":{"effect":"grapple"}}}'}};
const dependencies={getRoom(){events.push('room');return room;},ownServerCharacter(){events.push('own');return {muayBookData:'{"school":"korat"}'};}};
const first=factory.create(dependencies),second=factory.create(dependencies);
assert.equal(events.length,0);assert(Object.isFrozen(first));assert.deepEqual(Object.keys(first),['swordSkillAction','muayMotion','muaySchoolOf']);
for(const key of Object.keys(first)){assert.equal(first[key].length,1);assert.equal(first[key].name,key);assert.notEqual(first[key],second[key]);}
first.muayMotion('punch').push('private mutation');assert.equal(second.muayMotion('punch').length,2);
assert.equal(first.swordSkillAction('x'),'guard');assert.equal(first.muayMotion('x')[0],'m_clinch');assert.equal(first.muaySchoolOf({local:true}),'korat');
assert.deepEqual(events,['room','room','own']);
room=null;assert.equal(first.swordSkillAction('x'),'twin');assert.equal(first.muayMotion('x')[0],'m_cross');assert.equal(first.muaySchoolOf({id:'missing'}),'chaiya');
// Exceptions before parsing stay outside the JSON recovery path, and can recover.
let fail=true;const api=factory.create({getRoom(){if(fail)throw Error('room unavailable');return room;},ownServerCharacter:dependencies.ownServerCharacter});
assert.equal(api.swordSkillAction('twin_finale'),'finale');assert.equal(api.muayMotion('punch')[0],'m_jab');assert.throws(()=>api.swordSkillAction('x'),/room unavailable/);fail=false;assert.equal(api.swordSkillAction('x'),'twin');
// No new global dependencies or exposed cache/map state.
assert.doesNotMatch(source,/\b(?:document|window|performance|avatars|send|WebSocket)\b/);
const shell=fs.readFileSync('src/client/combat/024-action-and-skill-motion.js','utf8');
assert.doesNotMatch(shell,/\b(?:swordCatalogRaw|swordCatalogNodes|muayCatalogRaw|muayCatalogSkills|schoolCache|MUAY_MOTIONS|SWORD_EFFECT_ACTIONS)\b/);
assert(shell.indexOf('  function playAction(')<shell.indexOf('  const skillMotion ='));
assert(shell.indexOf('  const skillMotion =')<shell.indexOf('  function playMuaySkill('));
assert.match(shell,/const \[motion, move\] = muayMotion\(skillId\);\n    playAction\(a, motion, \{ move, reverse: skillId === "lopburi_reverse", finisher: \/_finish\$\/.test\(skillId\) \}\);/);
const html=fs.readFileSync('index.html','utf8'),tag=html.split('\n').find(line=>line.includes('./src/client-modules/skill-motion.js?'));
assert(tag.includes(' defer '));assert(tag.includes('MontraEntry?.worldUnavailable'));assert(html.indexOf(tag)<html.indexOf('<script src="./main.js?'));
console.log('PASS skill-motion factory isolation, lazy dependencies, narrow API, recovery and actual animation/browser wiring');
