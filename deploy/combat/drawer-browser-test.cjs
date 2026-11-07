/** Offline real-DOM differential regression. Uses shipped HTML/CSS and exact drawer
 * sections, with synthetic game-policy callbacks. No game server, saves or CDN.
 * Chromium mobile emulation is not a physical iOS/Android or full-game test.
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const reference = read('deploy/combat/fixtures/drawer-controller-reference.js');
assert.equal(crypto.createHash('sha256').update(reference).digest('hex'), '6a02aacaad97c499e3ebca7bdf147796703857840c93ce18fea43f662bd4c9e3');
function between(source, first, last) {
  const start = source.indexOf(first), end = source.indexOf(last, start);
  assert(start >= 0 && end > start, 'exact drawer section exists: ' + first);
  return source.slice(start, end);
}
const original = between(reference, '  function gateFieldInput(', '  const journalOrigins=') +
  between(reference, '  document.addEventListener("keydown",event=>{\n    if (ui.drawer.hidden', '  function updateChatBadge()') +
  reference.slice(reference.indexOf('  $("drawerClose").addEventListener'));
const main = read('main.js');
function productionBinding(binding) {
  const lines = main.split('\n').filter(line => line.trim() === binding);
  assert.equal(lines.length, 1, 'exactly one production drawer binding: ' + binding);
  return lines[0];
}
const candidate = read('src/client-modules/drawer-controller.js') + '\n' +
  between(main, '  const drawerController =', '  const journalOrigins=') + '\n' +
  productionBinding('document.addEventListener("keydown",drawerController.handleKey);') + '\n' +
  productionBinding('drawerController.installBackdrop();');
const setup = `
const $=id=>document.getElementById(id);
const ui={drawer:$('drawer'),shade:$('shade'),drawerBody:$('drawerBody'),drawerTitle:$('drawerTitle')};
let drawerActive=null,drawerOpener=null,fieldTrainingTip=true;
const calls=[];let priority='';
window.MontraAudio={stopSpeech(){calls.push('speech');}};
function SFX(name){calls.push(name);}
function ownServerCharacter(){return {level:1};}
function cancelForgeAnimation(){calls.push('cancelForge');}
function closeForgePicker(){calls.push('closePicker');}
function closeItemDetailModal(){ $('itemDetailModal').hidden=true; }
function closeEquipPopup(){ $('equipPopup').hidden=true; }
function handleForgePickerKey(e){if(priority==='forge'){e.preventDefault();return true;}return false;}
function handleItemDetailKey(e){if(priority==='item'){e.preventDefault();return true;}return false;}
$('accountEntry').hidden=true;$('loading').hidden=true;
`;
const expose = `
const body='<button id="testFirst">First</button><input id="testInput"><button disabled>Disabled</button><button hidden>Hidden</button><button id="testLast">Last</button>';
window.testDrawer={open(name='bag'){openDrawer(name,name,body);},close:closeDrawer,setPriority(value){priority=value;},state(){return {active:drawerActive,hidden:ui.drawer.hidden,shade:ui.shade.hidden,itemHidden:$('itemDetailModal').hidden,equipHidden:$('equipPopup').hidden,focus:document.activeElement.id||document.activeElement.dataset.journalTab||document.activeElement.tagName,inert:[...$('game').children].map(el=>[el.id||el.tagName,el.inert]),calls:[...calls]};}};
$('fieldMenuButton').onclick=()=>testDrawer.open('fieldMenu');
$('characterProfile').onclick=()=>testDrawer.open();
`;
// Compile both complete injected programs even when no browser can be launched.
for (const code of [original,candidate]) new (require('node:vm').Script)(setup+'\n'+code+'\n'+expose);
if (process.argv.includes('--check-fixtures')) { console.log('PASS original/candidate browser fixture syntax and frozen reference hash');process.exit(0); }
const { chromium } = require('playwright');
const html = read('index.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
const out = path.resolve(process.env.DRAWER_BROWSER_EVIDENCE || path.join(root, 'drawer-browser-evidence'));
const report = { cases: [], errors: [], blockedOrigins: [], limits: 'Exact drawer sections in shipped DOM/CSS with synthetic game-policy callbacks; no full-game integration, actual nested-modal implementations, physical device or non-Chromium verification.' };
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/') {
      const code = url.searchParams.get('version') === 'original' ? original : candidate;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.end(html.replace('</body>', `<script>${setup}\n${code}\n${expose}</script></body>`));
    }
    // Deliberately do not serve any game runtime or account/network client.
    if (url.pathname === '/styles.css') { res.setHeader('Content-Type', 'text/css'); return res.end(read('styles.css')); }
    res.writeHead(404);res.end();
  });
  let browser;
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const origin = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
    report.browser = browser.version();
    for (const viewport of [{width:1280,height:720},{width:320,height:640},{width:390,height:844}]) {
      const traces = {};
      for (const version of ['original', 'candidate']) {
        const mobile = viewport.width < 500;
        const context = await browser.newContext({viewport,isMobile:mobile,hasTouch:mobile,reducedMotion:'reduce',serviceWorkers:'block'});
        await context.route('**/*', route => {
          const url = new URL(route.request().url());
          if (url.origin === origin) return route.continue();
          report.blockedOrigins.push(url.origin);return route.abort();
        });
        const page = await context.newPage();
        page.on('pageerror', error => report.errors.push(error.message));
        const states = []; traces[version] = states;
        const capture = async label => { const state = await page.evaluate(()=>testDrawer.state());states.push({label,...state});return state; };
        const open = async () => { await page.locator('#characterProfile').focus();await page.evaluate(()=>testDrawer.open()); };
        const shown = async () => assert.equal(await page.locator('#drawer').isVisible(),true);
        const closed = async () => assert.equal(await page.locator('#drawer').isVisible(),false);
        const hitPoint = async id => page.evaluate(id => {
          for(let y=5;y<innerHeight;y+=10)for(let x=5;x<innerWidth;x+=10)if(document.elementFromPoint(x,y)?.id===id)return {x,y};
          throw Error('No hit-test point for '+id);
        },id);
        try {
          await page.goto(origin+'/?version='+version,{waitUntil:'load'});
          await page.locator('#fieldMenuButton').focus();await page.keyboard.press('Enter');await shown();
          assert.equal(await page.evaluate(()=>document.activeElement.dataset.journalTab),'character');
          assert.equal(await page.locator('#world').evaluate(el=>el.inert),true);
          await page.locator('#world').evaluate(el=>el.focus());
          assert.notEqual(await page.evaluate(()=>document.activeElement.id),'world','native inert blocks background focus');
          await capture('menu/inert');
          await page.keyboard.press('Escape');await closed();
          assert.equal(await page.evaluate(()=>document.activeElement.id),'fieldMenuButton');
          await open();assert.equal(await page.evaluate(()=>document.activeElement.id),'drawerMenuBack');
          await page.locator('#testLast').focus();await page.keyboard.press('Tab');
          assert.equal(await page.evaluate(()=>document.activeElement.id),'drawerMenuBack');
          await page.keyboard.press('Shift+Tab');assert.equal(await page.evaluate(()=>document.activeElement.id),'testLast');
          await capture('tab-wrap');
          await page.evaluate(()=>{testDrawer.open('help');testDrawer.open('bag');});
          await page.locator('#drawerClose').click();await closed();
          assert.equal(await page.evaluate(()=>document.activeElement.id),'characterProfile');
          await page.evaluate(()=>testDrawer.close());await capture('repeated-close');
          for (let i=0;i<3;i++) { await open();await page.keyboard.press('Escape');await closed(); }
          await capture('three-open-close-cycles');
          await open();
          for(const priority of ['forge','item']) {
            await page.evaluate(value=>testDrawer.setPriority(value),priority);await page.keyboard.press('Escape');await shown();await capture('priority-'+priority);
          }
          await page.evaluate(()=>{testDrawer.setPriority('');document.getElementById('itemDetailModal').hidden=false;document.getElementById('equipPopup').hidden=false;});
          await page.keyboard.press('Escape');await shown();
          assert.equal(await page.locator('#itemDetailModal').evaluate(el=>el.hidden),true);
          assert.equal(await page.locator('#equipPopup').evaluate(el=>el.hidden),false);
          await page.keyboard.press('Escape');await shown();assert.equal(await page.locator('#equipPopup').evaluate(el=>el.hidden),true);
          await capture('modal-dismiss-order');
          await page.evaluate(()=>document.getElementById('accountEntry').hidden=false);
          await page.keyboard.press('Escape');await shown();
          await page.evaluate(()=>document.getElementById('accountEntry').hidden=true);
          await page.keyboard.press('Escape');await closed();
          // Removed and hidden openers must fall back to the persistent field button.
          for(const mode of ['hidden','removed']) {
            await page.evaluate(mode=>{const b=document.createElement('button');b.id='temporaryOpener';document.getElementById('game').append(b);b.focus();testDrawer.open();if(mode==='hidden')b.hidden=true;else b.remove();},mode);
            await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>document.activeElement.id),'fieldMenuButton');
            await page.evaluate(()=>document.getElementById('temporaryOpener')?.remove());await capture('fallback-'+mode);
          }
          // Interrupt via a synchronous real focus event, then recover without stale gating.
          await page.evaluate(()=>{document.getElementById('drawerMenuBack').addEventListener('focus',()=>testDrawer.close(),{once:true});testDrawer.open();});
          await closed();await open();await page.keyboard.press('Escape');await closed();await capture('focus-interruption-recovered');
          await open();
          await page.locator('#shade').dispatchEvent('click');await shown();
          await page.locator('#shade').dispatchEvent('pointerdown');await page.locator('#shade').dispatchEvent('pointercancel');await page.locator('#shade').dispatchEvent('click');await shown();
          await capture('retarget-and-cancel-guard');
          const shade = await hitPoint('shade');
          if(mobile)await page.touchscreen.tap(shade.x,shade.y);else await page.mouse.click(shade.x,shade.y);
          await closed();await capture('native-backdrop-dismiss');
          if(mobile) {
            await page.evaluate(()=>document.getElementById('world').addEventListener('pointerup',()=>testDrawer.open(),{once:true}));
            const canvas = await hitPoint('world');await page.touchscreen.tap(canvas.x,canvas.y);await shown();
            await capture('native-touch-open-survives-click');await page.keyboard.press('Escape');await closed();
          }
          await open();await page.screenshot({path:path.join(out,`${version}-${viewport.width}.png`)});
          await page.keyboard.press('Escape');await closed();
          const final = await capture('final');assert(final.inert.every(([,inert])=>!inert),'all field children ungated');
        } finally { await context.close(); }
      }
      assert.deepEqual(traces.candidate,traces.original,'original and extracted browser observations match');
      report.cases.push({viewport,passed:true,traces});
    }
    assert.deepEqual(report.errors,[],'no browser runtime errors');
    console.log(`PASS drawer browser differential: ${report.cases.length} viewports, original and candidate`);
  } catch(error) { report.failure=error.stack;throw error; }
  finally { fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser?.close();if(server.listening)await new Promise(resolve=>server.close(resolve)); }
})().catch(error=>{console.error(error);process.exitCode=1;});
