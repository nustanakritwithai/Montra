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

// Existence of a skill name anywhere in CSS does not guarantee each UI surface
// receives artwork. Compare the concrete image for all 24 current core skills.
const coreSkills = [
  'phuttha_core', 'sritra_core', 'atamat_core', 'chumphon_core',
  'chaiya', 'korat', 'lopburi', 'thasao',
  'seer_pot', 'seer_binding', 'seer_poison', 'seer_buffalo',
  'blade_vanish', 'blade_heavy', 'blade_withdraw', 'blade_fury',
  'mender_core_heal', 'mender_core_circle', 'mender_core_ward', 'mender_core_cleanse',
  'shock', 'bulwark', 'riposte', 'protect'
];
const rules = [...styles.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]+)\}/g)];
const images = new Set();
for (const id of coreSkills) {
  const artwork = ['skill-book-icon', 'glyph', 'skill-modal-glyph', 'kg-glyph'].map(surface => {
    const selector = `.${surface}[data-skill-glyph="${id}"]`;
    const rule = rules.find(([, selectors, body]) => selectors.split(',').some(s => s.trim() === selector) && /background-image:/.test(body));
    assert(rule, `${selector} needs its own artwork mapping`);
    const image = rule[2].match(/background-image:\s*url\("(data:image\/svg\+xml,[^"]+)"\)/)?.[1];
    assert(image, `${selector} needs embedded SVG artwork`);
    assert.match(decodeURIComponent(image.split(',').slice(1).join(',')), /^<svg\s/);
    return image;
  });
  assert(artwork.every(image => image === artwork[0]), `${id} must use the same artwork on all four surfaces`);
  images.add(artwork[0]);
}
assert.equal(images.size, coreSkills.length, 'current core skills retain distinct artwork');
const index = fs.readFileSync('index.html', 'utf8');
const orb = index.match(/<div class="skill-modal-orb"[\s\S]*?<\/div>/)?.[0] || '';
const naming = index.match(/<div class="skill-modal-naming"[\s\S]*?<\/div>/)?.[0] || '';
assert(!orb.includes('id="skillModalBadge"'), 'status must not overlap the artwork orb');
assert(naming.includes('id="skillModalBadge"'), 'status remains visible beside the skill name');
console.log('PASS: 24 distinct core artworks match across all 96 surface mappings; status is outside the artwork');
