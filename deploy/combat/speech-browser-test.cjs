/** Hosted CI only: real HTMLAudioElement, synthetic WAV, no production/TTS traffic.
 * Tests shipped audio.js and the exact shipped button helper, not the entire game.
 * Mobile emulation is Chromium, not physical Android/iOS or native Thai speech.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../..');
const main = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
const start = main.indexOf('  function bindSpeechButton(');
const end = main.indexOf('  function openHelp()', start);
assert(start >= 0 && end > start, 'shipped speech helper exists');
const helper = main.slice(start, end);
// Valid PCM tone. Playback events must come from the media engine, never dispatchEvent.
function wav(seconds = 2) {
  const rate = 16000, samples = rate * seconds, b = Buffer.alloc(44 + samples * 2);
  b.write('RIFF'); b.writeUInt32LE(b.length - 8, 4); b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36);
  b.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) b.writeInt16LE(Math.round(500 * Math.sin(i * 2 * Math.PI * 440 / rate)), 44 + i * 2);
  return b;
}
const fixture = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Speech regression fixture</title>
<style>body{font:16px sans-serif;max-width:34rem;margin:1rem}button{min-height:48px;max-width:100%;white-space:normal}.note{overflow-wrap:anywhere}</style>
<h1>Speech regression fixture</h1><button id="listen">Listen</button><button id="rebind">Rebind</button><button id="close">Close</button>
<script src="/audio.js"></script><script>${helper}
window.bindAgain=()=>bindSpeechButton(document.querySelector('#listen'),'สวัสดี','guide','Listen');
bindAgain();document.querySelector('#rebind').onclick=bindAgain;
document.querySelector('#close').onclick=()=>MontraAudio.stopSpeech();</script>`;
(async () => {
  const out = path.join(root, 'speech-browser-evidence'); fs.mkdirSync(out, { recursive: true });
  const report = { cases: [], errors: [], blockedOrigins: [], limits: 'Synthetic media fixture; no full game, physical device, native Thai voice, or Google service verification.' };
  const server = http.createServer((req, res) => {
    if (req.url === '/audio.js') { res.setHeader('Content-Type', 'text/javascript'); return res.end(fs.readFileSync(path.join(root, 'audio.js'))); }
    res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(fixture);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    for (const mobile of [false, true]) {
      const name = mobile ? 'mobile-chromium' : 'desktop-chromium';
      const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 720 }, isMobile: mobile, hasTouch: mobile, serviceWorkers: 'block' });
      let mode = 'tone', requests = 0, release;
      await context.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.origin === origin) return route.continue();
        if (url.origin === 'https://translate.google.com' && url.pathname === '/translate_tts') {
          requests++;
          assert.equal(url.searchParams.get('q'), 'สวัสดี', 'only synthetic test text reaches the interceptor');
          if (mode === 'pending') await new Promise(resolve => { release = resolve; });
          if (mode === 'network') return route.abort('failed');
          return route.fulfill({ status: 200, contentType: 'audio/wav', body: wav(), headers: { 'cache-control': 'no-store' } });
        }
        report.blockedOrigins.push(url.origin); return route.abort();
      });
      await context.addInitScript(() => {
        // Force the existing fallback; never use an installed/remote OS speech service.
        Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { getVoices: () => [], cancel() {}, resume() {} } });
        window.__mediaEvents = [];
        const RealAudio = window.Audio;
        window.Audio = function (url) {
          const audio = new RealAudio(url);
          for (const type of ['playing', 'ended', 'pause']) audio.addEventListener(type, () => window.__mediaEvents.push(type));
          return audio; // Still a genuine, detached HTMLAudioElement.
        };
      });
      const page = await context.newPage();
      page.on('pageerror', error => report.errors.push(`${name}: ${error.message}`));
      const button = page.locator('#listen'), status = page.locator('[role="status"]');
      const tap = async selector => mobile ? page.locator(selector).tap() : page.locator(selector).click();
      const label = text => page.waitForFunction(text => document.querySelector('#listen').textContent === text, text);
      await page.goto(origin); assert.equal(requests, 0, 'binding never auto-plays');
      assert.match(await status.textContent(), /Google/);
      // Hold the actual media request to inspect pending state and cancel before start.
      mode = 'pending'; await tap('#listen'); await label('ยกเลิกการเตรียมเสียง');
      await page.waitForFunction(() => MontraAudio.isSpeaking());
      // Wait until interception has created its release latch, bounded rather than an arbitrary sleep.
      for (let i = 0; !release && i < 100; i++) await new Promise(resolve => setTimeout(resolve, 25));
      assert(release, 'media request reached synthetic interceptor');
      await tap('#listen'); await label('Listen');
      assert.equal(await page.evaluate(() => MontraAudio.isSpeaking()), false);
      release(); mode = 'tone';
      // Real playing/end events, with no fake media callbacks.
      await tap('#listen'); await label('⏹ หยุดเสียงพูด');
      assert.equal(await status.textContent(), 'กำลังเล่นเสียง');
      await label('Listen');
      const events = await page.evaluate(() => window.__mediaEvents);
      assert(events.includes('playing') && events.includes('ended'), 'browser decoded and completed synthetic WAV');
      // Rebinding is idempotent and stops in-progress playback.
      await tap('#listen'); await label('⏹ หยุดเสียงพูด'); await tap('#rebind'); await label('Listen');
      assert.equal(await status.count(), 1); assert.equal(await page.evaluate(() => MontraAudio.isSpeaking()), false);
      await tap('#listen'); await label('⏹ หยุดเสียงพูด'); await tap('#close'); await label('Listen');
      assert.equal(await page.evaluate(() => MontraAudio.isSpeaking()), false);
      // Muting blocks transmission before constructing audio.
      await page.evaluate(() => MontraAudio.set('muted', true)); const beforeMute = requests;
      await tap('#listen'); await label('Listen'); assert.match(await status.textContent(), /เปิดเสียง/); assert.equal(requests, beforeMute);
      await page.evaluate(() => MontraAudio.set('muted', false));
      // Deterministic NotAllowedError injection tests UI handling, not actual OS policy.
      await page.evaluate(() => { window.__realPlay = HTMLMediaElement.prototype.play; HTMLMediaElement.prototype.play = function () { return Promise.reject(new DOMException('Test rejection', 'NotAllowedError')); }; });
      await tap('#listen'); await label('Listen'); assert.match(await status.textContent(), /เบราว์เซอร์/);
      await page.evaluate(() => { HTMLMediaElement.prototype.play = window.__realPlay; });
      mode = 'network'; await tap('#listen'); await label('Listen'); assert.match(await status.textContent(), /เล่นเสียงไม่ได้/);
      await page.screenshot({ path: path.join(out, `${name}-failure.png`), fullPage: true });
      mode = 'tone'; await tap('#listen'); await label('⏹ หยุดเสียงพูด');
      await page.screenshot({ path: path.join(out, `${name}-playing.png`), fullPage: true });
      await label('Listen');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'fixture does not overflow mobile viewport');
      report.cases.push({ name, requests, pendingCancel: true, realPlayingAndEnded: true, rebindAndStop: true, mute: true, injectedRejection: true, networkFailureAndRetry: true });
      await context.close();
    }
    assert.deepEqual(report.errors, []); assert.deepEqual(report.blockedOrigins, []);
    report.passed = true; console.log(JSON.stringify(report, null, 2));
  } catch (error) { report.failure = error.stack; throw error; }
  finally {
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
