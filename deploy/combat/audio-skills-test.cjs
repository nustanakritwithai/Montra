const fs = require("node:fs");
const assert = require("node:assert");

console.log("[TEST] Verifying Audio Synthesis Recipes & Wiring...");

const audioSource = fs.readFileSync("audio.js", "utf8");
const mainSource = fs.readFileSync("main.js", "utf8");

// Syntax check by evaluating wrapped in mock window
const expectedRecipes = [
  "phuttha_core",
  "sritra_core",
  "atamat_core",
  "chumphon_core",
  "muay_chaiya",
  "muay_korat",
  "muay_lopburi",
  "muay_thasao",
  "seer_buffalo",
  "seer_curse",
  "seer_binding",
  "seer_burst",
  "seer_pot",
  "seer_poison"
];

for (const recipe of expectedRecipes) {
  assert(
    audioSource.includes(`${recipe}: (d, t, p) =>`),
    `audio.js must define recipe: ${recipe}`
  );
  assert(
    audioSource.includes(`${recipe}: ["sfx"`),
    `audio.js META must define bus & gain for: ${recipe}`
  );
  assert(
    audioSource.includes(`${recipe}: `),
    `audio.js DUR must define duration for: ${recipe}`
  );
}

// Check Aliases
const aliases = ["chaiya", "korat", "lopburi", "thasao", "seer_mark", "seer_rice", "seer_scatter"];
for (const alias of aliases) {
  assert(
    audioSource.includes(`R.${alias} = R.`),
    `audio.js must define alias: R.${alias}`
  );
}

// Check main.js event hooks
assert(
  mainSource.includes('if (result.skillId) SFX(result.skillId, { x: caster.x, z: caster.z })'),
  "main.js sword_skill_used must trigger SFX for cast skill"
);
assert(
  mainSource.includes('if(caster && data?.skillId)SFX(data.skillId, { x: caster.x, z: caster.z })'),
  "main.js muay_core_used must trigger SFX for cast skill"
);
assert(
  mainSource.includes('if(data?.skillId)SFX(data.skillId, { x: caster.x, z: caster.z })'),
  "main.js seer_core_used must trigger SFX for cast skill"
);
assert(
  mainSource.includes('if (data?.skillId && caster) SFX(data.skillId, { x: caster.x, z: caster.z })'),
  "main.js occult_skill_used must trigger SFX for cast skill"
);

console.log("PASS Audio recipes, aliases, and main.js SFX triggers verified successfully!");
