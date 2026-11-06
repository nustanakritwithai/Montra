const fs = require('node:fs');
const assert = require('node:assert/strict');

console.log('[TEST] Verifying Phase 2 Hit Impact & Combat Feedback System...');

const mainSrc = fs.readFileSync('main.js', 'utf8');
const cssSrc = fs.readFileSync('styles.css', 'utf8');

// 1. Verify Camera Shake System
assert(mainSrc.includes('function shakeCamera(intensity = 0.35, durationMs = 280)'), 'shakeCamera definition exists');
assert(mainSrc.includes('function applyCameraShake(dt)'), 'applyCameraShake definition exists');
assert(mainSrc.includes('applyCameraShake(dt);'), 'applyCameraShake called in render loop');

// 2. Verify FX Shapes (slash, cross)
assert(mainSrc.includes('slash(c, s, col)'), 'slash VFX shape exists in FX_SHAPES');
assert(mainSrc.includes('cross(c, s, col)'), 'cross VFX shape exists in FX_SHAPES');

// 3. Verify hitBurst critical and heavy support
assert(mainSrc.includes('function hitBurst(x, z, tone = "gold", heavy = false, y = 0, isCrit = false)'), 'hitBurst signature with isCrit');
assert(mainSrc.includes('spawnFx("cross"'), 'hitBurst spawns cross shape on crit');
assert(mainSrc.includes('spawnFx("slash"'), 'hitBurst spawns slash shape on heavy');

// 4. Verify METAL_KINDS and CSS for Critical hits
assert(mainSrc.includes('"crit"'), 'crit included in METAL_KINDS');
assert(cssSrc.includes('.ftxt.crit'), '.ftxt.crit exists in styles.css');
assert(cssSrc.includes('.ftxt.metal.crit'), '.ftxt.metal.crit exists in styles.css');
assert(cssSrc.includes('@keyframes ftCritPop'), '@keyframes ftCritPop exists in styles.css');

// 5. Verify Monster Death Dissolve VFX
assert(mainSrc.includes('case "ghost_die":'), 'ghost_die case exists in eventFx');
assert(mainSrc.includes('sparks("gold"'), 'ghost_die includes golden soul sparks');
assert(mainSrc.includes('sparks("violet"'), 'ghost_die includes violet soul sparks');

// 6. Verify Combat Hit & Skill Shake Wiring
assert(mainSrc.includes('isCrit ? "crit" :'), 'combat_hit floats crit damage style');
assert(mainSrc.includes('shakeCamera(0.42, 320)'), 'monster defeat triggers camera shake');
assert(mainSrc.includes('shakeCamera(0.62, 380)'), 'blade_heavy / shock triggers camera shake');

console.log('PASS All Phase 2 Hit Impact & Combat Feedback features verified successfully!');
