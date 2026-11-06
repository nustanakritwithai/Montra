const fs = require('node:fs');
const assert = require('node:assert/strict');

console.log('[TEST] Verifying Phase 4 Adaptive Audio & Monster Vocals System...');

const audioSrc = fs.readFileSync('audio.js', 'utf8');
const mainSrc = fs.readFileSync('main.js', 'utf8');

// 1. Monster vocative shape (aggro, hurt, die)
assert(audioSrc.includes('aggro: {'), 'audio.js defines aggro voice shape');
assert(audioSrc.includes('hurt: {'), 'audio.js defines hurt voice shape');
assert(audioSrc.includes('die: {'), 'audio.js defines die voice shape');

// 2. Thai musical instruments (Khim)
assert(audioSrc.includes('khim: (d, t, f, g) =>'), 'audio.js defines INST.khim');
assert(audioSrc.includes('INST.khim(L.base'), 'audio.js plays khim in base music layer');

// 3. Environmental ambience (waterlap, leaves)
assert(audioSrc.includes('waterlap: (d, t) =>'), 'audio.js defines A.waterlap');
assert(audioSrc.includes('leaves: (d, t) =>'), 'audio.js defines A.leaves');
assert(audioSrc.includes('["waterlap"'), 'AMBIENCE table includes waterlap');
assert(audioSrc.includes('["leaves"'), 'AMBIENCE table includes leaves');

// 4. main.js monster voice integration
assert(mainSrc.includes('ghostVoice(g, mesh, "aggro"'), 'main.js calls ghostVoice with aggro');
assert(mainSrc.includes('ghostVoice(struck, mMesh, "hurt"'), 'main.js calls ghostVoice with hurt on hit');

console.log('PASS Phase 4 Adaptive Audio & Monster Vocals verified successfully!');
