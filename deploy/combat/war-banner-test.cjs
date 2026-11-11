const assert = require('node:assert/strict');
const html = require('node:fs').readFileSync(require('node:path').join(__dirname, '../../index.html'), 'utf8');
assert.match(html, /<button[^>]*id="bannerButton"[^>]*disabled[^>]*title="[^"]*เร็ว ๆ นี้/);
const h = require('./cosmetic-preview-harness.cjs')();
for (const mode of ['demo', 'live']) {
  h.ctx.mode = mode;
  for (let n = 0; n < 3; n++) {
    assert.equal(h.ctx.window.MontraBanner.plantBanner(), null);
    h.advance(60000); h.ctx.window.MontraBanner.updateBanners(1, n);
    const buff = h.ctx.window.MontraBanner.getBannerDefenseBuff(h.ctx.hero);
    assert.equal(buff.active, false); assert.equal(buff.defBonus, 0); assert.equal(buff.resilience, 0);
    assert.equal(h.ctx.window.MontraBanner.isBannerActive(), false);
    assert.equal(h.fields.get('warBannerBuffBadge').hidden, true);
    assert.equal(h.fields.get('warBannerBuffBadge').textContent, '');
  }
}
assert.equal(h.messages.length, 0);
assert(h.effects.every(e => e[0] === 'toast' && e[1].includes('เร็ว ๆ นี้')));
assert.equal(h.ctx.hero.hp, 100); assert.equal(h.ctx.hero.defense, 4);
console.log('PASS old servers and DEMO have no banner effects');
h.ctx.activeMapId='ritual_village';
h.ctx.resetCombatFeatures({warBanner:true});
h.ctx.applyWarBannerState({canPlant:true,buffed:false,banner:null});
assert.equal(h.fields.get('bannerButton').disabled,false);
assert.equal(h.ctx.window.MontraBanner.plantBanner(),true);
assert.deepEqual(h.messages.map(msg=>msg[0]),['plant_war_banner']);
assert.equal(h.fields.get('warBannerBuffBadge').hidden,true);
h.ctx.applyWarBannerState({canPlant:true,buffed:true,banner:{
  id:'banner',mapId:'ritual_village',x:0,y:0,z:0,radius:12,remainingMs:1000,
}});
assert.equal(h.fields.get('warBannerBuffBadge').hidden,false);
assert.equal(h.ctx.window.MontraBanner.getBannerDefenseBuff().defBonus,.1);
h.advance(1100);h.ctx.window.MontraBanner.updateBanners();
assert.equal(h.fields.get('warBannerBuffBadge').hidden,true);
h.close(); console.log('PASS the server confirms banner eligibility and buff before the HUD shows them');
