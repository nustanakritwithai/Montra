const assert = require('node:assert/strict');
const h = require('./cosmetic-preview-harness.cjs')();
const pet = h.ctx.window.MontraPet;
for (const mode of ['demo', 'live']) {
  h.ctx.mode = mode;
  const status = pet.summonPet(), mesh = status.mesh;
  assert.equal(pet.summonPet().mesh, mesh, 'repeated summons do not duplicate mesh');
  assert.equal(status.cosmeticOnly, true);
  for (let n = 0; n < 20; n++) { h.advance(7000); pet.updatePet(1/60, n); }
  assert(Number.isFinite(mesh.root.position.x));
  assert.notEqual(mesh.root.position.x, h.ctx.hero.x, 'cosmetic follows hero at an offset');
  if (mesh.root.getChildMeshes) assert(mesh.root.getChildMeshes().every(m => !m.isPickable));
  assert.equal(h.ctx.hero.hp, 100); assert.equal(h.ctx.demoMonsterHp, 100);
  assert.equal(h.fields.get('petButton').attrs['aria-pressed'], 'true');
  assert.equal(pet.togglePet(), true); assert.equal(pet.isPetActive(), false);
  assert.equal(h.fields.get('petButton').attrs['aria-pressed'], 'false');
  assert(mesh.root.isDisposed ? mesh.root.isDisposed() : mesh.root.disposed);
}
pet.summonPet(); h.ctx.mode = 'demo'; pet.updatePet(1/60, 1);
assert.equal(pet.isPetActive(), false, 'mode transition dismisses cosmetic');
pet.summonPet(); h.ctx.hero = { ...h.ctx.hero }; pet.updatePet(1/60, 1);
assert.equal(pet.isPetActive(), false, 'avatar replacement dismisses cosmetic');
pet.summonPet(); h.ctx.hero = null; pet.updatePet(1/60, 1);
assert.equal(pet.isPetActive(), false); assert.equal(pet.summonPet(), null);
assert.equal(h.messages.length, 0);
assert(!h.effects.some(e => e[0] === 'voice' || JSON.stringify(e).includes('+8') || JSON.stringify(e).includes('สมบัติ')));
assert(h.effects.some(e => JSON.stringify(e).includes('ของตกแต่งเท่านั้น')));
h.close(); console.log('PASS production cosmetic pet animation/toggle/cleanup; no combat or treasure claims');
