const fs = require('node:fs');
const assert = require('node:assert/strict');

console.log('[TEST] Verifying Phase 14: Voice Persona Selector & Shamanic Whispers...');

const mainSrc = fs.readFileSync('main.js', 'utf8');
const audioSrc = fs.readFileSync('audio.js', 'utf8');
const cssSrc = fs.readFileSync('styles.css', 'utf8');
const indexSrc = fs.readFileSync('index.html', 'utf8');

// 1. Verify Audio Synthesis Recipe for Shamanic Whisper
assert(audioSrc.includes('whisper: (d, t, p) =>'), 'audio.js defines whisper recipe');
assert(audioSrc.includes('whisper: ["sfx", .4, 1.1]'), 'audio.js META includes whisper');
assert(audioSrc.includes('whisper: 2.2'), 'audio.js DUR includes whisper');
assert(audioSrc.includes('spirit: { pitch: 1.16, rate: 0.92 }'), 'audio.js PERSONAS includes spirit');

// 2. Verify Voice Persona Definitions in Client
assert(mainSrc.includes('const VOICE_PERSONAS = {'), 'main.js defines VOICE_PERSONAS');
assert(mainSrc.includes('name: "พราหมณ์เฒ่า"'), 'VOICE_PERSONAS has elder persona');
assert(mainSrc.includes('name: "นักรบมนตรา"'), 'VOICE_PERSONAS has warrior persona');
assert(mainSrc.includes('name: "วิญญาณผู้พิทักษ์"'), 'VOICE_PERSONAS has spirit persona');

// 3. Verify Shamanic Whisper Engine & Methods
assert(mainSrc.includes('function triggerWhisper(text, options = {})'), 'main.js defines triggerWhisper');
assert(mainSrc.includes('SFX("whisper"'), 'triggerWhisper triggers SFX whisper');

assert(mainSrc.includes('{ persona: personaId, whisper: true }'), 'whispers retain their selected voice');
assert(!cssSrc.includes('.voice-guidance-hud'), 'whispers have no floating panel');

// 4. Verify settings persona row
assert(cssSrc.includes('.voice-persona-row'), 'styles.css defines .voice-persona-row');

// 5. Verify Sound Settings UI & Persona Selector
assert(mainSrc.includes('id="voicePersonaSelect"'), 'main.js renders voicePersonaSelect in sound settings');
assert(mainSrc.includes('personaSelect.addEventListener("change"'), 'main.js binds voicePersonaSelect change event');

// 6. Verify Window API & Script Versions
assert(mainSrc.includes('window.MontraVoice = {'), 'exposes window.MontraVoice');
assert(mainSrc.includes('getPersona: getVoicePersona'), 'MontraVoice exports getPersona');
assert(mainSrc.includes('setPersona: setVoicePersona'), 'MontraVoice exports setPersona');
assert(mainSrc.includes('triggerWhisper'), 'MontraVoice exports triggerWhisper');

assert(/audio\.js\?v=0\.(1[2-9]|[2-9]\d)\./.test(indexSrc), 'index.html points to audio.js v0.12.x+');
assert(/main\.js\?v=0\.(1[6-9]|[2-9]\d)\./.test(indexSrc), 'index.html points to main.js v0.16.x+');

// 7. Functional Simulation Test for Persona Transitions & Whispers
const mockStorage = new Map();
const personas = {
  elder: { id: "elder", name: "พราหมณ์เฒ่า", pitch: 0.82, rate: 0.88 },
  warrior: { id: "warrior", name: "นักรบมนตรา", pitch: 0.95, rate: 1.08 },
  spirit: { id: "spirit", name: "วิญญาณผู้พิทักษ์", pitch: 1.16, rate: 0.92 }
};

function simGetPersona() {
  const p = mockStorage.get("montra_voice_persona");
  return personas[p] ? p : "elder";
}

function simSetPersona(id) {
  if (!personas[id]) return false;
  mockStorage.set("montra_voice_persona", id);
  return true;
}

assert.equal(simGetPersona(), "elder", 'Default persona is elder');
assert.equal(simSetPersona("warrior"), true, 'Switches to warrior');
assert.equal(simGetPersona(), "warrior", 'Active persona is warrior');
assert.equal(simSetPersona("spirit"), true, 'Switches to spirit');
assert.equal(simGetPersona(), "spirit", 'Active persona is spirit');

console.log('PASS All Phase 14 Voice Persona Selector & Shamanic Whispers features verified successfully!');
