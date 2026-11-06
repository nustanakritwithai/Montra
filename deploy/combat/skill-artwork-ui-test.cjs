const assert = require('node:assert/strict');
const fs = require('node:fs');
const css = fs.readFileSync('styles.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const groups = [
  ['phuttha_core', 'sritra_core', 'atamat_core', 'chumphon_core'],
  ['chaiya', 'korat', 'lopburi', 'thasao'],
  ['seer_pot', 'seer_binding', 'seer_poison', 'seer_buffalo'],
  ['mender_core_heal', 'mender_core_circle', 'mender_core_ward', 'mender_core_cleanse'],
  ['blade_vanish', 'blade_heavy', 'blade_withdraw', 'blade_fury'],
  ['shock', 'bulwark', 'riposte', 'protect'],
];
const rules = [...css.matchAll(/([^{}]+)\{([^{}]+)\}/g)];
for (const id of groups.flat()) {
  for (const surface of ['skill-book-icon', 'glyph', 'skill-modal-glyph', 'kg-glyph']) {
    const selector = `.${surface}[data-skill-glyph="${id}"]`;
    assert.ok(rules.some(([, selectors, body]) => selectors.split(',').some(s => s.trim() === selector) && /background-image:\s*url\("data:image\/svg\+xml,/.test(body)), `${selector} needs embedded artwork`);
  }
}
const preview = fs.readFileSync('skill-artwork-preview.html', 'utf8');
assert.equal((preview.match(/data-skill-glyph=/g) || []).length, 96, 'preview must cover all 96 core skill/surface pairs');
for (const id of groups.flat()) assert.equal((preview.match(new RegExp(`data-skill-glyph="${id}"`, 'g')) || []).length, 4, `${id} preview has all four surfaces`);
console.log('PASS: all 24 core skill artworks cover book, hotbar, modal and graph');
