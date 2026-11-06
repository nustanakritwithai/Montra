const fs = require("node:fs");
const assert = require("node:assert");

console.log("[TEST] Verifying Skill SVG Art & Selectors...");

const styles = fs.readFileSync("styles.css", "utf8");
const main = fs.readFileSync("main.js", "utf8");

const expectedSkills = [
  "phuttha_core",
  "sritra_core",
  "atamat_core",
  "chumphon_core",
  "class_sword",
  "muay_chaiya",
  "muay_korat",
  "muay_lopburi",
  "muay_thasao",
  "seer_mark",
  "seer_rice",
  "seer_buffalo",
  "seer_curse",
  "seer_binding",
  "seer_burst",
  "seer_pot",
  "seer_poison"
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

console.log("PASS All 17 skills + aliases verified in styles.css and main.js!");
