// deploy/combat/thai-speech-ui-test.cjs
// Headless test for Montra Thai Dual-Engine Speech Synthesis (Web Speech API + HTML5 Audio fallback)
// CRITICAL: Headless Node test only. NO BROWSER / EDGE / CDP.

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

console.log('--- Starting Dual-Engine Thai Speech Headless Test Suite ---');

const audioPath = path.join(__dirname, '..', '..', 'audio.js');
const mainPath = path.join(__dirname, '..', '..', 'main.js');

const audioCode = fs.readFileSync(audioPath, 'utf8');
const mainCode = fs.readFileSync(mainPath, 'utf8');

// 1. Verify audio.js structure and exports
console.log('1. Checking audio.js Dual-Engine TTS Engine...');

// Mock browser window and Web Speech API + Audio
const spokenUtterances = [];
const audioElements = [];
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

class MockAudio {
  constructor(src) {
    this.src = src;
    this.volume = 1;
    this.playbackRate = 1;
    this.paused = true;
    this.ended = false;
    this.onended = null;
    this.onerror = null;
    audioElements.push(this);
  }
  play() {
    this.paused = false;
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
}

let mockVoices = [
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
  resume: () => {},
  get speaking() {
    return isSpeakingFlag;
  },
  onvoiceschanged: null
};

const mockWindow = {
  speechSynthesis: mockSpeechSynthesis,
  SpeechSynthesisUtterance: MockSpeechSynthesisUtterance,
  Audio: MockAudio,
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
  Audio: MockAudio,
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

// Test voice detection when Thai voice is available
const thaiVoice = MontraAudio.getThaiVoice();
assert(thaiVoice, 'getThaiVoice should locate Thai voice');
assert.strictEqual(thaiVoice.lang, 'th-TH');

// Test speak function with Web Speech API
const res = MontraAudio.speak('สวัสดีนักรบมนตรา', { persona: 'elder' });
assert.strictEqual(res, true, 'MontraAudio.speak should return true');

// Test Dual-Engine Fallback when NO Thai voice is installed on OS (e.g. only English voices like on this Windows machine)
mockVoices = [
  { name: 'Microsoft David Desktop - English (United States)', lang: 'en-US' },
  { name: 'Microsoft Zira Desktop - English (United States)', lang: 'en-US' }
];
// Reset cached voice
mockWindow.speechSynthesis.onvoiceschanged();
assert.strictEqual(MontraAudio.getThaiVoice(), null, 'Should return null when only English voices exist');

// Speak when only English voices installed -> Must automatically stream Thai audio via MockAudio
const audioRes = MontraAudio.speak('ดาบสังหาร!', { persona: 'warrior' });
assert.strictEqual(audioRes, true, 'Should successfully fall back to audio stream');
assert(audioElements.length >= 1, 'Audio element must be created for fallback');
const lastAudio = audioElements[audioElements.length - 1];
assert(lastAudio.src.includes('translate_tts'), 'Audio source must point to Thai speech stream');
assert(lastAudio.src.includes('tl=th'), 'Audio stream must request tl=th');
assert.strictEqual(lastAudio.paused, false, 'Audio stream play() must be invoked');

// Test stopSpeech stops audio stream
MontraAudio.stopSpeech();
assert.strictEqual(lastAudio.paused, true, 'stopSpeech must pause active audio stream');

console.log('✓ audio.js Dual-Engine Thai Speech (Web Speech + Audio Fallback) passed all tests!');

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

// Check test voice button in sound settings
assert(mainCode.includes('testVoiceBtn'), 'main.js must have testVoiceBtn');
assert(mainCode.includes('🔊 ทดสอบเสียงพูดภาษาไทย (กดเพื่อฟัง)'), 'main.js must have test voice label');

// Check skill voice shouts
assert(mainCode.includes('SKILL_VOICE_SHOUTS'), 'main.js must define SKILL_VOICE_SHOUTS');
assert(mainCode.includes('blade_heavy: "ดาบสังหาร!"'), 'main.js must include Blade shout');

// Check skill book icons
assert(mainCode.includes('class="skill-book-icon"'), 'main.js must render skill-book-icon in skill books');

console.log('✓ main.js Thai speech triggers, book icons, and UI controls passed all tests!');

console.log('--- ALL DUAL-ENGINE THAI SPEECH AND SKILL ART TESTS PASSED! ---');
process.exit(0);
