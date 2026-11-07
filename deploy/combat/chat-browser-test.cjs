/** Isolated real-DOM chat differential. Exact shipped chat/drawer sections,
 * local HTML/CSS, synthetic room messages and controlled timers. No game/CDN.
 * Mobile Chromium emulation is not a physical device or full-game proof.
 */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..'),read=file=>fs.readFileSync(path.join(root,file),'utf8');
function between(source,first,last){const start=source.indexOf(first),end=source.indexOf(last,start);assert(start>=0&&end>start,'Exact source section: '+first);return source.slice(start,end);}
const frozen=read('deploy/combat/fixtures/chat-controller-reference.json');
assert.equal(crypto.createHash('sha256').update(frozen).digest('hex'),'4a8d3d4d6e10329d507486279ca714f28ded0ff530b25895abfafa1226e8d6bb');
const original=JSON.parse(frozen),s004=read('src/client/render/004-scene-camera-lights.js'),s042=read('src/client/ui/042-vitals-chat-and-status.js'),s044=read('src/client/network/044-state-sync-and-connection.js'),s046=read('src/client/ui/046-drawers-and-chat.js');
const candidate={
 state004:read('src/client-modules/chat-controller.js')+'\n'+between(s004,'  const chatController =','  const scene ='),
 view042:between(s042,'  // ---- One chat box','  // ---- Layout moves:'),
 controls046:between(s046,'  function finishChatPending(){return','  drawerController.installBackdrop();'),
 message044:between(s044,'      joined.onMessage("chat_message"','      const onTerritoryState='),
 report044:between(s044,'      joined.onMessage("chat_report_result"','      const onGuildState='),
};
const drawer=read('src/client-modules/drawer-controller.js')+'\n'+between(s046,'  const drawerController =','  const journalOrigins=');
const setup=`
const $=id=>document.getElementById(id),ui={drawer:$('drawer'),shade:$('shade'),drawerBody:$('drawerBody'),drawerTitle:$('drawerTitle')};
let drawerActive=null,fieldTrainingTip=null,mode='live',localId='self',activeMapId='map-a';
const calls=[],handlers=new Map(),timers=new Map();let timerId=0;
const setTimeout=(fn,ms)=>{const id=++timerId;timers.set(id,{fn,ms});return id;};
const clearTimeout=id=>timers.delete(id);
function toast(text){calls.push(['toast',text]);}
function updateFieldAlerts(){calls.push(['alerts']);}
function SFX(name){calls.push(['sound',name]);}
function ownServerCharacter(){return {level:1};}
function cancelForgeAnimation(){} function closeForgePicker(){}
function closeItemDetailModal(){$('itemDetailModal').hidden=true;}
function closeEquipPopup(){$('equipPopup').hidden=true;}
function handleForgePickerKey(){return false;} function handleItemDetailKey(){return false;}
window.MontraAudio={stopSpeech(){}};
const joined={state:{chatAvailable:true,extendedChatAvailable:true,players:new Map([['self',{characterName:'Me'}],['other',{characterName:'<Peer>'}]])},onMessage(type,handler){handlers.set(type,handler);},send(type,command){calls.push(['send',type,{...command}]);}};
let room=joined;
$('accountEntry').hidden=true;$('loading').hidden=true;
`;
const expose=`
window.testChat={
 open:openChat,close:closeChatComposer,reset:clearChatHistory,
 drawer(){openDrawer('bag','Bag','<button id="fixtureDrawerButton">Drawer item</button>');},closeDrawer,
 receive(message){handlers.get('chat_message')({channel:'map',name:'Other',text:'hello',senderId:'other',mapId:'map-a',...message});},
 report(result){handlers.get('chat_report_result')(result);},
 tick(ms){for(const [id,t] of [...timers])if(t.ms===ms){timers.delete(id);t.fn();}},
 state(){const box=$('chatBox'),input=box.querySelector('.cb-input'),target=box.querySelector('.cb-target');return {
 composing:box.classList.contains('composing'),fresh:box.classList.contains('fresh'),wide:box.classList.contains('wide'),tab:box.dataset.tab,
 focus:document.activeElement.className||document.activeElement.id||document.activeElement.tagName,
 input:input.value,target:target.value,targetHidden:target.hidden,placeholder:input.placeholder,
 toggle:box.querySelector('.cb-open').getAttribute('aria-expanded'),drawerHidden:ui.drawer.hidden,inert:box.inert,
 unread:$('chatUnread').textContent,tabs:[...box.querySelectorAll('[data-cb-tab]')].map(b=>[b.dataset.cbTab,b.getAttribute('aria-selected'),b.querySelector('b').hidden,b.querySelector('b').textContent]),
 lines:[...box.querySelectorAll('.cb-line')].map(el=>[el.className,[...el.children].map(c=>c.textContent)]),
 timers:[...timers.values()].map(t=>t.ms),calls:[...calls]};}
};
`;
function program(parts){return setup+'\n'+parts.state004+'\n'+parts.view042+'\n'+drawer+'\ndocument.addEventListener("keydown",drawerController.handleKey);\n'+parts.controls046+'\ndrawerController.installBackdrop();\n'+parts.message044+parts.report044+'\n'+expose;}
const programs={original:program(original),candidate:program(candidate)};
for(const code of Object.values(programs))new vm.Script(code);
const html=read('index.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
assert(!/<script\b/i.test(html),'No shipped runtime scripts remain');
if(process.argv.includes('--check-fixtures')){console.log('PASS chat browser fixture syntax, source boundaries and frozen reference hash; browser not launched');process.exit(0);}
const {chromium}=require('playwright');
const out=path.resolve(process.env.CHAT_BROWSER_EVIDENCE||path.join(root,'chat-browser-evidence'));
const report={fixtureHashes:Object.fromEntries(Object.entries(programs).map(([name,code])=>[name,crypto.createHash('sha256').update(code).digest('hex')])),cases:[],errors:[],blockedRequests:[],limits:'Exact chat and drawer sections with real DOM/CSS, synthetic room callbacks and controlled timers. No Babylon/game sockets, physical device, multiplayer or non-Chromium verification.'};
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost');if(url.pathname==='/'){const version=url.searchParams.get('version');assert(['original','candidate'].includes(version));res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(html.replace('</body>',`<script>${programs[version]}</script></body>`));}if(url.pathname==='/styles.css'){res.setHeader('Content-Type','text/css');return res.end(read('styles.css'));}res.writeHead(404);res.end();});
 let browser;
 try{
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const origin=`http://127.0.0.1:${server.address().port}`;
  browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})});report.browser=browser.version();
  for(const viewport of [{width:1280,height:720},{width:320,height:640},{width:390,height:844}]){
   const traces={};
   for(const version of ['original','candidate']){
    const mobile=viewport.width<500,context=await browser.newContext({viewport,isMobile:mobile,hasTouch:mobile,reducedMotion:'reduce',serviceWorkers:'block'});
    await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin===origin&&['/','/styles.css'].includes(url.pathname))return route.continue();report.blockedRequests.push(url.origin+url.pathname);return route.abort();});
    await context.routeWebSocket('**/*',socket=>{report.errors.push('Unexpected WebSocket: '+socket.url());socket.close();});
    const page=await context.newPage();page.on('pageerror',error=>report.errors.push(error.message));const states=[];traces[version]=states;
    const capture=async label=>{const state=await page.evaluate(()=>testChat.state());states.push({label,...state});return state;};
    const tab=channel=>page.locator(`[data-cb-tab="${channel}"]`).click();
    const input=page.locator('.cb-input');
    try{
     await page.goto(origin+'/?version='+version,{waitUntil:'load'});await capture('initialized');
     await page.locator('.cb-open').click();assert.equal(await input.evaluate(el=>el===document.activeElement),true);assert.equal((await capture('composing')).composing,true);
     await input.fill('map draft');await tab('private');await input.fill('secret draft');await page.locator('.cb-target').selectOption('other');await tab('map');assert.equal(await input.inputValue(),'map draft');await tab('private');assert.equal(await input.inputValue(),'secret draft');await capture('tab-drafts');
     await input.press('Enter');const sent=(await capture('private-send')).calls.filter(c=>c[0]==='send').at(-1);assert.deepEqual(sent,['send','chat',{text:'secret draft',channel:'private',targetId:'other'}]);
     await page.evaluate(()=>testChat.receive({channel:'private',senderId:'self',targetId:'other',targetName:'<Peer>',text:'secret draft'}));assert.equal(await input.inputValue(),'');await capture('own-ack');
     await input.press('Escape');assert.equal((await capture('escape')).composing,false);
     await page.evaluate(()=>testChat.receive({channel:'world',name:'<img src=x onerror=alert(1)>',text:'<script>window.bad=true</script>'}));await tab('all');assert.equal(await page.locator('.cb-log img,.cb-log script').count(),0);assert.equal(await page.evaluate(()=>window.bad===true),false);await capture('literal-text');
     // Open a real drawer while composing. Native inert blocks chat focus.
     await input.focus();await page.evaluate(()=>testChat.drawer());assert.equal(await page.locator('#chatBox').evaluate(el=>el.inert),true);await input.evaluate(el=>el.focus());assert.equal(await input.evaluate(el=>el===document.activeElement),false);await capture('drawer-inert');await page.evaluate(()=>testChat.close());
     // Opening chat closes the drawer, restoring the original input. Its native
     // focus handler re-enters openChat before the outer invocation returns.
     await page.evaluate(()=>testChat.open());assert.equal(await input.evaluate(el=>el===document.activeElement),true);const restored=await capture('drawer-focus-reentry');assert.equal(restored.inert,false);assert.equal(restored.drawerHidden,true);assert.equal(restored.composing,true);
     await page.locator('#world').dispatchEvent('pointerdown',{bubbles:true});assert.equal((await capture('outside-dismiss')).composing,false);
     await page.evaluate(()=>{document.getElementById('drawerMenuBack').addEventListener('focus',()=>testChat.open(),{once:true});testChat.drawer();});assert.equal((await capture('drawer-focus-interruption')).drawerHidden,true);assert.equal(await input.evaluate(el=>el===document.activeElement),true);
     await tab('bug');await input.fill('report');await input.press('Enter');await page.evaluate(()=>testChat.report({ok:true}));assert.equal(await input.inputValue(),'');await capture('bug-ack');
     await tab('map');await input.fill('pending');await input.press('Enter');await page.evaluate(()=>testChat.tick(5000));assert((await capture('timeout')).calls.some(c=>c[0]==='toast'&&c[1]==='ยังไม่ได้รับการยืนยันข้อความ'));
     await page.evaluate(()=>testChat.reset(false));assert.equal((await capture('map-reset-filter')).lines.length,0);await tab('all');const partial=await capture('map-reset');assert(partial.lines.every(line=>!line[0].includes('ch-map')));assert(partial.lines.length>0);
     await tab('private');await input.fill('old identity draft');await page.locator('.cb-target').selectOption('other');await page.evaluate(()=>testChat.reset(true));const reset=await capture('identity-reset');assert.equal(reset.lines.length,0);assert.equal(reset.input,'');assert.equal(reset.target,'');assert.equal(reset.tab,'all');assert.equal(reset.composing,false);
     await page.evaluate(()=>testChat.tick(8000));assert.equal((await capture('fade')).fresh,false);
     if(!mobile){await page.locator('#world').focus();await page.keyboard.press('Enter');assert.equal(await input.evaluate(el=>el===document.activeElement),true);await capture('desktop-enter');}
     await page.evaluate(()=>testChat.open());await page.screenshot({path:path.join(out,`${version}-${viewport.width}.png`)});
    }finally{await context.close();}
   }
   assert.deepEqual(traces.candidate,traces.original,'Original/extracted real-DOM observations: '+viewport.width);report.cases.push({viewport,passed:true,traces});
  }
  assert.deepEqual(report.errors,[]);console.log(`PASS chat browser differential: ${report.cases.length} viewports, original and candidate`);
 }catch(error){report.failure=error.stack;throw error;}
 finally{fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser?.close();if(server.listening)await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
