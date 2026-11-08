const assert = require('node:assert/strict');
const html = require('node:fs').readFileSync(require('node:path').join(__dirname, '../../index.html'), 'utf8');
assert.match(html, /<button[^>]*id="bossEncounterButton"[^>]*disabled[^>]*title="[^"]*เร็ว ๆ นี้/);
const h = require('./cosmetic-preview-harness.cjs')();
const boss = h.ctx.window.MontraBoss;
for (const [name, implementation] of Object.entries(h.oldBoss)) assert.equal(boss[name], implementation, `preserve existing combat boss API: ${name}`);
for (const mode of ['demo', 'live']) {
  h.ctx.mode = mode;
  for (let n = 0; n < 3; n++) {
    assert.equal(boss.spawnBoss(1, 2), null); assert.equal(boss.toggleBoss(), null);
    assert.equal(boss.triggerWindup(), false); assert.equal(boss.triggerSlam(), false);
    h.advance(20000); boss.updateBoss(1, n);
    assert.equal(boss.isBossActive(), false); assert.equal(boss.getTitanStatus().mesh, null);
    assert.equal(boss.getTitanStatus().available, false); assert.equal(boss.getTitanStatus().hp, null);
  }
}
assert.equal(h.ctx.hero.hp, 100); assert.equal(h.ctx.demoMonsterHp, 100);
assert.equal(h.messages.length, 0); assert(h.effects.every(e => e[0] === 'toast' && e[1].includes('เร็ว ๆ นี้')));
h.close(); console.log('PASS production Titan calls fail closed with no damage/attack feedback');
