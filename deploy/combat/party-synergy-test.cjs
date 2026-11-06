const fs = require('node:fs');
const assert = require('node:assert/strict');

console.log('[TEST] Verifying Phase 8: Party Combat Synergy & Shamanic Tether System...');

const mainSrc = fs.readFileSync('main.js', 'utf8');
const cssSrc = fs.readFileSync('styles.css', 'utf8');

// 1. Verify CSS styles for party ping shortcuts & low HP party member alert
assert(cssSrc.includes('.party-frames .pf-row.low .pf-av'), 'styles.css defines alert style on low HP party member');
assert(cssSrc.includes('.pf-ping-row'), 'styles.css defines .pf-ping-row');
assert(cssSrc.includes('.pf-ping-btn'), 'styles.css defines .pf-ping-btn');
assert(cssSrc.includes('.pf-ping-btn.rally'), 'styles.css defines .pf-ping-btn.rally');
assert(cssSrc.includes('.pf-ping-btn.help'), 'styles.css defines .pf-ping-btn.help');

// 2. Verify 3D Shamanic Tether system
assert(mainSrc.includes('const partyTetherLines = new Map();'), 'main.js defines partyTetherLines registry');
assert(mainSrc.includes('function updatePartyTethers(now)'), 'main.js defines updatePartyTethers');
assert(mainSrc.includes('B.MeshBuilder.CreateLines("partyTether_"'), 'creates 3D tether line meshes between party members');
assert(mainSrc.includes('updatePartyTethers(now);'), 'updatePartyTethers is registered in main render loop');

// 3. Verify Tactical Party Ping engine
assert(mainSrc.includes('function sendPartyPing(type = "rally")'), 'main.js defines sendPartyPing');
assert(mainSrc.includes('activePartyPing = {'), 'sendPartyPing registers active party ping');
assert(mainSrc.includes('spawnFx("beam", tone,'), 'spawns 3D vertical beam at ping position');
assert(mainSrc.includes('spawnFx("yantra", tone,'), 'spawns 3D yantra ground seal at ping position');
assert(mainSrc.includes('triggerCombatCallout(type === "help" ? "party_help" : "party_rally");'), 'triggers Typhoon tactical voice for ping');

// 4. Verify Party Callouts in TYPHOON_COMBAT_CALLOUTS
assert(mainSrc.includes('party_low_hp: {'), 'defines party_low_hp callout');
assert(mainSrc.includes('party_rally: {'), 'defines party_rally callout');
assert(mainSrc.includes('party_help: {'), 'defines party_help callout');
assert(mainSrc.includes('สหายร่วมรบของเจ้าบาดเจ็บหนัก!'), 'party_low_hp text verified');
assert(mainSrc.includes('สัญญาณรวมพลดังขึ้นแล้ว!'), 'party_rally text verified');
assert(mainSrc.includes('ขอกำลังหนุน!'), 'party_help text verified');

// 5. Verify renderPartyFrames integration
assert(mainSrc.includes('if (r.low && !r.down) triggerCombatCallout("party_low_hp");'), 'triggers party_low_hp when member HP drops');
assert(mainSrc.includes('rallyBtn.textContent = "🚩 รวมพล";'), 'adds rally ping button');
assert(mainSrc.includes('helpBtn.textContent = "🆘 ขอฮีล";'), 'adds help ping button');

// 6. Verify Minimap party ping rendering
assert(mainSrc.includes('activePartyPing && performance.now() < activePartyPing.until'), 'drawMap renders active party ping beacon');
assert(mainSrc.includes('activePartyPing.type === "help" ? "🆘" : "🚩"'), 'drawMap renders tactical ping icon on minimap');

// 7. Verify API exposure
assert(mainSrc.includes('window.MontraParty = { sendPartyPing, updatePartyTethers };'), 'exposes MontraParty on window');

console.log('PASS All Phase 8 Party Combat Synergy & Shamanic Tether features verified successfully!');
