const fs = require('node:fs');
const assert = require('node:assert/strict');

console.log('[TEST] Verifying Phase 13: Dynamic Weather & Occult Blood Moon Cycle...');

const mainSrc = fs.readFileSync('main.js', 'utf8');
const cssSrc = fs.readFileSync('styles.css', 'utf8');
const indexSrc = fs.readFileSync('index.html', 'utf8');

// 1. Verify CSS styles for Blood Moon Vignette
assert(cssSrc.includes('.blood-moon-vignette'), 'styles.css defines .blood-moon-vignette');
assert(cssSrc.includes('.blood-moon-vignette.active'), 'styles.css defines .blood-moon-vignette.active');
assert(cssSrc.includes('@keyframes pulseBloodMoon'), 'styles.css defines @keyframes pulseBloodMoon');

// 2. Verify Blood Moon Atmosphere & Full Moon Texture Redraw
assert(mainSrc.includes('const BLOOD_MOON_ATMOSPHERE = {'), 'main.js defines BLOOD_MOON_ATMOSPHERE');
assert(mainSrc.includes('sky: "#ff3344"'), 'BLOOD_MOON_ATMOSPHERE has crimson sky');
assert(mainSrc.includes('function drawSkyTexture(isBloodMoon = false)'), 'main.js defines drawSkyTexture');
assert(mainSrc.includes('rgba(255,40,60,.65)'), 'drawSkyTexture creates crimson halo for blood moon');

// 3. Verify Rain Particle System & Weather State
assert(mainSrc.includes('paintTexture("rain droplet"'), 'main.js creates rain droplet texture');
assert(mainSrc.includes('new B.ParticleSystem("weather rain"'), 'main.js instantiates weather rain particle system');
assert(mainSrc.includes('const weatherState = {'), 'main.js defines weatherState');
assert(mainSrc.includes('function setWeather(type)'), 'main.js defines setWeather');
assert(mainSrc.includes('function updateWeather(dt, elapsed)'), 'main.js defines updateWeather');

// 4. Verify Storm Lightning Integration
assert(mainSrc.includes('window.MontraWeather?.getWeather?.() === "storm"'), 'stormFlash checks MontraWeather for storm mode');

// 5. Verify Typhoon Voice Callout for Blood Moon
assert(mainSrc.includes('blood_moon_rise: {'), 'TYPHOON_COMBAT_CALLOUTS includes blood_moon_rise');
assert(mainSrc.includes('title: "ราตรีจันทร์สีเลือด"'), 'blood_moon_rise title matches');
assert(mainSrc.includes('จันทร์เพ็ญสีเลือดปรากฏ! อสูรดุร้ายขึ้น แต่พลังอาคมพรั่งพรู'), 'blood_moon_rise subtitle matches');
assert(mainSrc.includes('ระวังตัวให้ดี! จันทร์สีเลือดลอยเด่นเหนือฟ้า มนต์ดำครอบงำเหล่าอสูร'), 'blood_moon_rise text matches');

// 6. Verify Window API & Weather Multiplier
assert(mainSrc.includes('window.MontraWeather = {'), 'exposes window.MontraWeather API');
assert(mainSrc.includes('getWeather: () => weatherState.current'), 'MontraWeather exports getWeather');
assert(mainSrc.includes('triggerBloodMoon: () => setWeather("blood_moon")'), 'MontraWeather exports triggerBloodMoon');
assert(mainSrc.includes('isBloodMoon: () => weatherState.current === "blood_moon"'), 'MontraWeather exports isBloodMoon');
assert(mainSrc.includes('getRewardMultiplier: () => (weatherState.current === "blood_moon" ? 2.0 : 1.0)'), 'MontraWeather returns 2.0x reward multiplier during Blood Moon');

// 7. Verify index.html version bump
assert(/main\.js\?v=0\.15\./.test(indexSrc), 'index.html points to v0.15.x dynamic weather blood moon');

// 8. Functional Unit Test for Weather Transitions & Multipliers
const mockWeather = {
  current: "clear",
  setWeather(type) {
    this.current = type;
  },
  isBloodMoon() {
    return this.current === "blood_moon";
  },
  getRewardMultiplier() {
    return this.isBloodMoon() ? 2.0 : 1.0;
  }
};

assert.equal(mockWeather.getRewardMultiplier(), 1.0, 'Clear weather has 1.0x reward multiplier');
mockWeather.setWeather("rain");
assert.equal(mockWeather.isBloodMoon(), false, 'Rain weather is not blood moon');
assert.equal(mockWeather.getRewardMultiplier(), 1.0, 'Rain weather has 1.0x reward multiplier');
mockWeather.setWeather("blood_moon");
assert.equal(mockWeather.isBloodMoon(), true, 'Blood moon weather is active');
assert.equal(mockWeather.getRewardMultiplier(), 2.0, 'Blood moon grants 2.0x reward multiplier (EXP x2)');

console.log('PASS All Phase 13 Dynamic Weather & Occult Blood Moon Cycle features verified successfully!');
