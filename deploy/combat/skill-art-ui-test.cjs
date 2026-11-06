const fs = require("node:fs");
const assert = require("node:assert");

console.log("[TEST] Verifying Skill SVG Art & Selectors for all 26+ Skills and Books...");

const styles = fs.readFileSync("styles.css", "utf8");
const main = fs.readFileSync("main.js", "utf8");

const expectedSkills = [
  // Sword
  "phuttha_core",
  "sritra_core",
  "atamat_core",
  "chumphon_core",
  "class_sword",
  // Muay
  "muay_chaiya",
  "muay_korat",
  "muay_lopburi",
  "muay_thasao",
  // Seer
  "seer_mark",
  "seer_rice",
  "seer_buffalo",
  "seer_curse",
  "seer_binding",
  "seer_burst",
  "seer_pot",
  "seer_poison",
  // Blade (คมดาบ)
  "blade_vanish",
  "blade_heavy",
  "blade_withdraw",
  "blade_fury",
  // Mender (พระ)
  "mender_core_heal",
  "mender_core_circle",
  "mender_core_ward",
  "mender_core_cleanse",
  // Sentinel (ผู้พิทักษ์)
  "shock",
  "bulwark",
  "riposte",
  "protect"
];

for (const skill of expectedSkills) {
  assert(
    styles.includes(`data-skill-glyph="${skill}"`) || styles.includes(`data-skill-id="${skill}"`),
    `styles.css should contain styling rule for ${skill}`
  );
}

// Aliases
assert(styles.includes('data-skill-id="chaiya"'), "styles.css should support chaiya alias");
assert(styles.includes('data-skill-id="korat"'), "styles.css should support korat alias");
assert(styles.includes('data-skill-id="lopburi"'), "styles.css should support lopburi alias");
assert(styles.includes('data-skill-id="thasao"'), "styles.css should support thasao alias");
assert(styles.includes('data-skill-glyph="seer_scatter"'), "styles.css should support seer_scatter alias");

// Hotbar glyph assignment
assert(
  main.includes("glyph.dataset.skillGlyph=id"),
  "main.js arrangeFieldSlots should assign data-skill-glyph to hotbar glyphs"
);

// Skill book icon class in styles.css and main.js
assert(styles.includes(".skill-book-icon"), "styles.css must style .skill-book-icon");
assert(main.includes('class="skill-book-icon"'), "main.js must render .skill-book-icon in skill books");

// Knowledge graph glyph assignment
assert(
  main.includes('data-skill-glyph="\' + id + \'"'),
  "main.js KG should set data-skill-glyph on node glyphs"
);

// Skill modal glyph assignment
assert(
  main.includes('$("skillModalGlyph").setAttribute("data-skill-glyph", skillId)'),
  "main.js renderSkillModalContent should set data-skill-glyph on modal glyph"
);

console.log("PASS All 26 skills + aliases + book icons verified in styles.css and main.js!");
