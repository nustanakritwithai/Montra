/** Pure server catalog and empty-book fixtures. No room/account/backend is loaded. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { stripTypeScriptTypes } = require('node:module');
const coreCatalogs = require('./core-skill-catalog-fixture.cjs');
const read = file => stripTypeScriptTypes(fs.readFileSync(path.join(__dirname, file + '.ts'), 'utf8'));
function constants(file, names, prelude = '') {
  const source = read(file);
  const declarations = names.map(name => {
    const match = source.match(new RegExp('(?:export )?const ' + name + '\\s*=\\s*([\\s\\S]*?);'));
    assert(match, file + '.' + name);
    return 'const ' + name + ' = ' + match[1] + ';';
  });
  return vm.runInNewContext(prelude + declarations.join('\n') + '\n({' + names.join(',') + '})', {}, { timeout: 1000 });
}
function newBook(file, name, dependencies = {}) {
  const source = read(file), start = source.indexOf('export function ' + name + '(');
  assert(start >= 0, name);
  const open = source.indexOf('{', start);
  let depth = 1, end = open + 1;
  // Empty book constructors contain only literal data and calls to pure helpers.
  for (; depth && end < source.length; end++) {
    if (source[end] === '{') depth++;
    if (source[end] === '}') depth--;
  }
  return vm.runInNewContext(source.slice(start, end).replace('export ', '') + '\n' + name + '()', dependencies, { timeout: 1000 });
}
const ranks = constants('Progression', ['SKILL_RANK_LEVELS', 'SKILL_RANK_PRACTICE']);
const rankData = { rankLevels: ranks.SKILL_RANK_LEVELS, rankPractice: ranks.SKILL_RANK_PRACTICE };
const sword = constants('SkillCatalog', ['SWORD_NODES', 'SWORD_SCHOOLS', 'SWORD_RANKABLE_SKILLS']);
const muaySource = read('MuayRules');
const foundation = muaySource.match(/const foundation\s*=\s*[\s\S]*?;/)[0];
const muay = constants('MuayRules', ['MUAY_DEFAULT_SLOTS', 'MUAY_SKILLS', 'MUAY_BASE_SKILLS', 'MUAY_LESSONS', 'MUAY_SCHOOLS', 'MUAY_COMBOS', 'MUAY_MASTERY_LABELS', 'MUAY_MASTERY_REQUIREMENTS', 'isMuayFoundation', 'MUAY_RANKABLE_SKILLS'], foundation);
const blade = constants('BladeRules', ['BLADE_LESSONS', 'BLADE_PRACTICE_LABELS', 'BLADE_RANKABLE_SKILLS']);
const sentinel = constants('SentinelRules', ['SENTINEL_LESSONS', 'SENTINEL_PRACTICE_LABELS', 'SENTINEL_RANKABLE_SKILLS']);
const occult = constants('OccultRules', ['OCCULT_LESSONS', 'OCCULT_MASTERY_LABELS', 'OCCULT_MASTERY_REQUIREMENTS', 'OCCULT_RANKABLE_SKILLS']);
const emptySwordLoadouts = () => newBook('SkillCatalog', 'emptySwordLoadouts');
const newMuayLoadouts = () => newBook('MuayRules', 'newMuayLoadouts', { MUAY_DEFAULT_SLOTS: muay.MUAY_DEFAULT_SLOTS });
const newMuayMastery = () => newBook('MuayRules', 'newMuayMastery');
const books = {
  phutthaisawan: newBook('SkillCatalog', 'newSwordTree', { emptySwordLoadouts }),
  muay_boran: newBook('MuayRules', 'newMuayBook', { MUAY_DEFAULT_SLOTS: muay.MUAY_DEFAULT_SLOTS, newMuayLoadouts, newMuayMastery }),
  blade: newBook('BladeRules', 'newBladeBook'), sentinel: newBook('SentinelRules', 'newSentinelBook'),
  seer: newBook('OccultRules', 'newOccultBook'), mender: newBook('OccultRules', 'newOccultBook')
};
const catalogs = {
  phutthaisawan: { ...coreCatalogs.phutthaisawan, ...rankData, nodes: sword.SWORD_NODES, schools: sword.SWORD_SCHOOLS, rankable: sword.SWORD_RANKABLE_SKILLS },
  muay_boran: { ...coreCatalogs.muay_boran, ...rankData, skills: muay.MUAY_SKILLS, lessons: muay.MUAY_LESSONS, base: muay.MUAY_BASE_SKILLS, schools: muay.MUAY_SCHOOLS, combos: muay.MUAY_COMBOS, masteryLabels: muay.MUAY_MASTERY_LABELS, masteryRequirements: muay.MUAY_MASTERY_REQUIREMENTS, rankable: muay.MUAY_RANKABLE_SKILLS },
  blade: { ...coreCatalogs.blade, ...rankData, lessons: blade.BLADE_LESSONS, practiceLabels: blade.BLADE_PRACTICE_LABELS, rankable: blade.BLADE_RANKABLE_SKILLS },
  sentinel: { ...coreCatalogs.sentinel, ...rankData, lessons: sentinel.SENTINEL_LESSONS, practiceLabels: sentinel.SENTINEL_PRACTICE_LABELS, rankable: sentinel.SENTINEL_RANKABLE_SKILLS }
};
for (const path of ['seer', 'mender']) catalogs[path] = { ...coreCatalogs[path], ...rankData, lessons: occult.OCCULT_LESSONS, masteryLabels: occult.OCCULT_MASTERY_LABELS, masteryRequirements: occult.OCCULT_MASTERY_REQUIREMENTS, rankable: occult.OCCULT_RANKABLE_SKILLS };
const points = {};
for (const [path, file, fn] of [['phutthaisawan','SkillCatalog','swordPoints'], ['muay_boran','MuayRules','muayPoints'], ['blade','BladeRules','bladePoints'], ['sentinel','SentinelRules','sentinelPoints'], ['seer','OccultRules','occultPoints'], ['mender','OccultRules','occultPoints']]) {
  const source = read(file);
  const match = source.match(new RegExp('export function ' + fn + '\\([^)]*\\)\\s*\\{[^}]+\\}')) || source.match(new RegExp('export const ' + fn + '\\s*=\\s*[^;]+;'));
  assert(match, fn);
  points[path] = vm.runInNewContext(match[0].replace('export ', '') + '\nObject.fromEntries([1,10,25,26].map(level=>[level,' + fn + '(level)]))');
}
const result = JSON.parse(JSON.stringify({ catalogs, books, points }));
for (const path of Object.keys(result.catalogs)) {
  const catalog = result.catalogs[path];
  assert.equal(Object.keys(catalog.core).length, 4);
  assert(Object.keys(catalog.nodes || catalog.lessons).length > 4, path + ' full advanced catalog');
  assert.equal(result.points[path][1], 1, path + ' initial point remains server-owned');
}
module.exports = result;
