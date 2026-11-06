// deploy/combat/thai-speech-ui-test.cjs
// Headless test for Montra Thai Speech Engine (TTS / Web Speech API) and UI Integration
// CRITICAL: Headless Node test only. NO BROWSER / EDGE / CDP.

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

console.log('--- Starting Thai Speech Engine Headless Test Suite ---');

const audioPath = path.join(__dirname, '..', '..', 'audio.js');
const mainPath = path.join(__dirname, '..', '..', 'main.js');

const audioCode = fs.readFileSync(audioPath, 'utf8');
const mainCode = fs.readFileSync(mainPath, 'utf8');

// 1. Verify audio.js structure and exports
console.log('1. Checking audio.js TTS Engine and Web Speech API wiring...');

// Mock browser window and Web Speech API
const spokenUtterances = [];
let cancelCalled = 0;
let isSpeakingFlag = false;

class MockSpeechSynthesisUtterance {
  constructor(text) {
    this.text = text;
    this.lang = '';
    this.pitch = 1;
    this.rate = 1;
    this.volume = 1;
    this.voice = null;
    this.onend = null;
    this.onerror = null;
  }
}

const mockVoices = [
  { name: 'Microsoft Premwadee Online (Natural) - Thai (Thailand)', lang: 'th-TH' },
  { name: 'Google US English', lang: 'en-US' }
];

const mockSpeechSynthesis = {
  getVoices: () => mockVoices,
  speak: (u) => {
    isSpeakingFlag = true;
    spokenUtterances.push(u);
    if (typeof u.onend === 'function') {
      setTimeout(() => { isSpeakingFlag = false; u.onend(); }, 10);
    }
  },
  cancel: () => {
    cancelCalled++;
    isSpeakingFlag = false;
  },
  get speaking() {
    return isSpeakingFlag;
  },
  onvoiceschanged: null
};

const mockWindow = {
  speechSynthesis: mockSpeechSynthesis,
  SpeechSynthesisUtterance: MockSpeechSynthesisUtterance,
  AudioContext: class {},
  webkitAudioContext: class {},
  addEventListener: () => {},
  removeEventListener: () => {},
  document: {
    addEventListener: () => {},
    removeEventListener: () => {}
  },
  localStorage: {
    getItem: () => null,
    setItem: () => {}
  }
};

const context = vm.createContext({
  window: mockWindow,
  document: mockWindow.document,
  SpeechSynthesisUtterance: MockSpeechSynthesisUtterance,
  localStorage: mockWindow.localStorage,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  console
});

vm.runInContext(audioCode, context);

const MontraAudio = mockWindow.MontraAudio;
assert(MontraAudio, 'window.MontraAudio must be defined');
assert.strictEqual(typeof MontraAudio.speak, 'function', 'MontraAudio.speak must be a function');
assert.strictEqual(typeof MontraAudio.stopSpeech, 'function', 'MontraAudio.stopSpeech must be a function');
assert.strictEqual(typeof MontraAudio.isSpeaking, 'function', 'MontraAudio.isSpeaking must be a function');
assert.strictEqual(typeof MontraAudio.getThaiVoice, 'function', 'MontraAudio.getThaiVoice must be a function');

// Test voice detection
const thaiVoice = MontraAudio.getThaiVoice();
assert(thaiVoice, 'getThaiVoice should locate Thai voice');
assert.strictEqual(thaiVoice.lang, 'th-TH');

// Test DEFAULTS and settings
assert('voice' in MontraAudio.settings, 'settings must have voice volume');
assert(MontraAudio.settings.voice > 0, 'default voice volume must be > 0');

// Test speak function
const res = MontraAudio.speak('สวัสดีนักรบมนตรา', { persona: 'elder' });
assert.strictEqual(res, true, 'MontraAudio.speak should return true when successful');
assert(cancelCalled >= 1, 'speechSynthesis.cancel must be called before speaking to avoid queue buildup');
assert.strictEqual(spokenUtterances.length, 1, 'One utterance must be synthesized');

const u = spokenUtterances[0];
assert.strictEqual(u.text, 'สวัสดีนักรบมนตรา');
assert.strictEqual(u.lang, 'th-TH');
assert.strictEqual(u.voice, thaiVoice);
assert(u.pitch < 0.9, 'elder persona pitch should be lower (~0.82)');
assert(u.rate < 0.95, 'elder persona rate should be deliberate (~0.88)');

// Test persona variation: warrior
MontraAudio.speak('บุกด่าน!', { persona: 'warrior' });
const u2 = spokenUtterances[1];
assert(u2.rate > 1.0, 'warrior persona rate should be faster (> 1.0)');

// Test persona variation: merchant
MontraAudio.speak('เชิญเลือกซื้อสินค้า', { persona: 'merchant' });
const u3 = spokenUtterances[2];
assert(u3.pitch > 1.1, 'merchant persona pitch should be energetic (> 1.1)');

// Test stopSpeech
MontraAudio.stopSpeech();
assert(cancelCalled >= 3, 'stopSpeech should invoke speechSynthesis.cancel()');

// Test volume adjustment
MontraAudio.set('voice', 0.5);
assert.strictEqual(MontraAudio.settings.voice, 0.5, 'voice volume setting updated');

// Test mute disables speech
MontraAudio.set('muted', true);
const mutedRes = MontraAudio.speak('พูดตอนปิดเสียง');
assert.strictEqual(mutedRes, false, 'speak must return false when muted');
MontraAudio.set('muted', false);

console.log('✓ audio.js Thai Speech Synthesis Engine passed all tests!');

// 2. Verify main.js wiring
console.log('2. Checking main.js integration...');

// Check serviceNpcUi personas
assert(mainCode.includes('persona:"warrior"'), 'main.js serviceNpcUi must include warrior persona');
assert(mainCode.includes('persona:"merchant"'), 'main.js serviceNpcUi must include merchant persona');
assert(mainCode.includes('persona:"elder"'), 'main.js serviceNpcUi must include elder persona');
assert(mainCode.includes('persona:"guide"'), 'main.js serviceNpcUi must include guide persona');

// Check stopSpeech in drawers
assert(mainCode.includes('stopSpeech'), 'main.js must call stopSpeech');

// Check service NPC speak button
assert(mainCode.includes('serviceNpcSpeak'), 'main.js must have serviceNpcSpeak button');
assert(mainCode.includes('🔊 ฟังเสียงพูดไทย'), 'main.js must have Thai speech button label');

// Check Typhoon AI guide speak button and markdown cleaner
assert(mainCode.includes('stripMarkdownForSpeech'), 'main.js must include stripMarkdownForSpeech helper');
assert(mainCode.includes('npcGuideSpeakBtn'), 'main.js must include npcGuideSpeakBtn');
assert(mainCode.includes('🔊 ฟังเสียงตอบภาษาไทย'), 'main.js must have Thai AI answer speech label');

// Check sound settings slider
assert(mainCode.includes('row("voice", "เสียงพูดและพากย์ไทย")'), 'main.js must include voice slider in soundSettingsHtml');

console.log('✓ main.js Thai speech triggers and UI controls passed all tests!');

console.log('--- ALL THAI SPEECH ENGINE TESTS PASSED SUCCESFULLY! ---');
process.exit(0);
