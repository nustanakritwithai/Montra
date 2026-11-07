/** Real local server + SDK + production chat UI bindings; not the full game. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const vm = require('node:vm');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { root, read, hash, program, html, fingerprints } = require('./fixtures/chat-live-fixture.cjs');
const { startServer, sleep } = require('./fixtures/chat-live-server.cjs');
const sdkFile = path.join(root,'combat-verify/node_modules/@colyseus/sdk/dist/colyseus.js');
const sdk = fs.readFileSync(sdkFile,'utf8');
assert.equal(JSON.parse(fs.readFileSync(path.join(root,'combat-verify/node_modules/@colyseus/sdk/package.json'))).version,'0.18.1');
new vm.Script(sdk);
if(process.argv.includes('--check-fixtures')){
  console.log('PASS live chat fixture/source boundaries and locked local SDK syntax; no server or browser launched');
  console.log(JSON.stringify({fingerprints,sdk:hash(sdk)},null,2));
  process.exit(0);
}
const out=path.resolve(process.env.CHAT_LIVE_EVIDENCE || path.join(root,'chat-live-browser-evidence'));
const report={fingerprints,sdk:hash(sdk),cases:[],errors:[],blockedRequests:[],
  limits:'Isolated chat/drawer DOM and production chat send/receive/report/rejection bindings. Real Colyseus server and SDK, fake guests and disposable stores. Fixture owns initial create/join and map selection. No Babylon, full connection/reconnect bootstrap, cross-map routing, real login, physical keyboard/mobile device or non-Chromium coverage.'};
async function run(){
  fs.mkdirSync(out,{recursive:true});
  let server,web,browser;
  try{
    server=await startServer();
    if(process.argv.includes('--sdk-preflight')){
      const child=spawn(process.execPath,['private-chat-integration.mjs'],{cwd:server.cwd,env:server.env,stdio:'inherit'});
      const [code]=await once(child,'exit');assert.equal(code,0,'Existing private/party/bug SDK integration');
      report.cases.push({name:'existing-sdk-preflight',passed:true});
      console.log('PASS real-server SDK preflight; browser was NOT launched');return;
    }
    web=http.createServer((req,res)=>{
      const url=new URL(req.url,'http://127.0.0.1');
      res.setHeader('Content-Security-Policy',`default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' ${server.endpoint} ${server.endpoint.replace('http:','ws:')}; img-src 'self' data:; font-src 'self'`);
      const routes={
        '/':['text/html; charset=utf-8',html.replace('</body>','<script src="/sdk.js"></script><script src="/fixture.js"></script></body>')],
        '/sdk.js':['text/javascript',sdk],'/fixture.js':['text/javascript',program],
        '/styles.css':['text/css',read('styles.css')],'/config':['application/json',JSON.stringify({endpoint:server.endpoint})],
      };
      const entry=routes[url.pathname];if(!entry){res.writeHead(404);return res.end();}
      res.setHeader('Content-Type',entry[0]);res.end(entry[1]);
    });
    await new Promise((resolve,reject)=>{web.once('error',reject);web.listen(0,'127.0.0.1',resolve);});
    const origin=`http://127.0.0.1:${web.address().port}`;
    const {chromium}=require('playwright');
    browser=await chromium.launch({headless:true});report.browser=browser.version();
    for(const viewport of [{width:1280,height:720},{width:390,height:844}]){
      const contexts=[],pages=[];
      try{
        for(let i=0;i<3;i++){
          const context=await browser.newContext({viewport,isMobile:viewport.width<500,hasTouch:viewport.width<500,serviceWorkers:'block'});contexts.push(context);
          await context.route('**/*',route=>{
            const url=new URL(route.request().url());
            if((url.origin===origin && ['/','/sdk.js','/fixture.js','/styles.css','/config'].includes(url.pathname)) ||
               (url.origin===server.endpoint && url.pathname.startsWith('/matchmake/')))return route.continue();
            report.blockedRequests.push(url.origin+url.pathname);return route.abort();
          });
          // Keep native WebSocket: Playwright 1.56 routing changes synchronous
          // constructor validation required by the SDK's browser fallback.
          // Exact local-only CSP connect-src remains the pre-request socket guard.
          const page=await context.newPage();pages.push(page);
          page.on('pageerror',error=>report.errors.push(error.message));
          page.on('console',message=>{if(message.type()==='error')report.errors.push(message.text());});
          page.on('websocket',socket=>{
            const url=new URL(socket.url()); // Never record session query parameters.
            if(url.origin!==server.endpoint.replace('http:','ws:'))report.errors.push('Unexpected socket '+url.origin);
            socket.on('socketerror',()=>report.errors.push('Local game socket error'));
          });
          const room=i?await pages[0].evaluate(()=>liveChat.roomId):null;
          await page.goto(origin+(room?'/?room='+encodeURIComponent(room):'/'));
          await page.waitForFunction(()=>window.liveChat || window.fixtureError);
          assert.equal(await page.evaluate(()=>window.fixtureError),undefined);
        }
        const [a,b,c]=pages;
        for(const page of pages)await page.waitForFunction(()=>liveChat.count()===3);
        const ids=await Promise.all(pages.map(page=>page.evaluate(()=>liveChat.id)));
        const events=(page,type,text)=>page.evaluate(({type,text})=>liveChat.events.filter(e=>e.type===type && (text===undefined || e.data.text===text)),{type,text});
        const received=(page,text)=>page.waitForFunction(text=>liveChat.events.some(e=>e.type==='chat_message' && e.data.text===text),text);
        const tab=(page,channel)=>page.locator(`[data-cb-tab="${channel}"]`).click();
        const send=async(channel,text,target)=>{
          await sleep(2200); // Canonical server bucket refills one token per two seconds.
          await tab(a,channel);
          if(target)await a.locator('.cb-target').selectOption(target);
          await a.locator('.cb-input').fill(text);
          await a.locator('.cb-input').press('Enter');
        };
        const cleared=()=>a.waitForFunction(()=>document.querySelector('.cb-input').value==='');
        const literal='<img src=x onerror="window.chatInjected=true"> & สวัสดี';
        await send('map',literal);await Promise.all(pages.map(page=>received(page,literal)));await cleared();
        for(const page of pages){
          assert.equal(await page.locator('.cb-log img,.cb-log script').count(),0);
          assert.equal(await page.evaluate(()=>window.chatInjected),undefined);
          assert((await page.locator('.cb-log').innerText()).includes(literal));
        }
        // Same-turn duplicate real DOM submits, before any network echo can arrive.
        await sleep(2200);await a.locator('.cb-input').fill('one pending send');
        await a.evaluate(()=>{const form=document.querySelector('.cb-form');form.requestSubmit();form.requestSubmit();});
        await Promise.all(pages.map(page=>received(page,'one pending send')));await cleared();await sleep(300);
        for(const page of pages)assert.equal((await events(page,'chat_message','one pending send')).length,1);
        await send('world','world acknowledgement');await Promise.all(pages.map(page=>received(page,'world acknowledgement')));await cleared();
        await send('private','private to B',ids[1]);await received(b,'private to B');await cleared();await sleep(350);
        assert.equal((await events(c,'chat_message','private to B')).length,0);
        const ownPrivate=(await events(a,'chat_message','private to B'))[0].data;
        assert.equal(ownPrivate.channel,'private');assert.equal(ownPrivate.senderId,ids[0]);assert.equal(ownPrivate.targetId,ids[1]);
        await send('private','private to C',ids[2]);await received(c,'private to C');await cleared();await sleep(350);
        assert.equal((await events(b,'chat_message','private to C')).length,0);
        const ownPrivateC=(await events(a,'chat_message','private to C'))[0].data;
        assert.equal(ownPrivateC.channel,'private');assert.equal(ownPrivateC.senderId,ids[0]);assert.equal(ownPrivateC.targetId,ids[2]);
        // Party setup uses actual server commands; message submission remains the UI.
        await a.evaluate(id=>liveChat.invite(id),ids[1]);
        await b.waitForFunction(()=>liveChat.events.some(e=>e.type==='party_invitation'));
        await b.evaluate(()=>liveChat.accept(liveChat.events.find(e=>e.type==='party_invitation').data.inviteId));
        await a.waitForFunction(()=>liveChat.events.some(e=>e.type==='party_state' && e.data.members?.length===2));
        await send('party','party to B');await received(b,'party to B');await cleared();await sleep(350);
        assert.equal((await events(c,'chat_message','party to B')).length,0);
        await send('bug','isolated browser bug report');await cleared();await sleep(350);
        assert((await events(a,'chat_report_result')).some(e=>e.data.ok===true));
        const reports=fs.readFileSync(path.join(server.env.MONTRA_CHARACTER_DIR,'bug-reports/reports.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
        assert(reports.some(entry=>entry.text==='isolated browser bug report'));
        for(const page of [b,c])assert.equal((await events(page,'chat_message','isolated browser bug report')).length,0);
        // A real invalid payload is admitted by the UI but rejected by ChatRules.
        // The EXACT production rejection handler must reset pending, retain draft,
        // and permit the next valid send without waiting for the five-second timer.
        await send('map','invalid\u0001control');
        const rejectionStarted=Date.now();
        await a.waitForFunction(()=>liveChat.events.some(e=>e.type==='command_rejected' && e.data.reason==='invalid_chat'));
        assert.equal(await a.locator('.cb-input').inputValue(),'invalid\u0001control');
        assert((await a.evaluate(()=>liveChat.toasts)).includes('ข้อความไม่ถูกต้องหรือยาวเกิน 200 ตัวอักษร'));
        await a.locator('.cb-input').fill('recovered after rejection');await a.locator('.cb-input').press('Enter');
        await received(b,'recovered after rejection');await cleared();
        assert(Date.now()-rejectionStarted<4500,'Retry succeeds before the five-second pending timeout');
        assert(!(await a.evaluate(()=>liveChat.toasts)).includes('ยังไม่ได้รับการยืนยันข้อความ'));
        for(let i=0;i<4;i++){
          await a.locator('.cb-input').press('Escape');assert.equal(await a.locator('#chatBox').evaluate(el=>el.classList.contains('composing')),false);
          await a.locator('.cb-open').click();assert.equal(await a.locator('.cb-input').evaluate(el=>el===document.activeElement),true);
        }
        assert.equal(await a.locator('#chatBox').count(),1);
        await send('map','after repeated close and open');await received(b,'after repeated close and open');await cleared();
        for(const page of pages){assert.equal((await events(page,'chat_message','invalid\u0001control')).length,0);}
        await a.screenshot({path:path.join(out,`chat-live-${viewport.width}.png`)});
        report.cases.push({viewport,passed:true,checks:['literal text','real acknowledgement and pending suppression','world','private target change and isolation','party isolation','bug report persistence','real rejection and immediate retry','repeated composer lifecycle']});
      }finally{
        for(const page of pages)await page.evaluate(()=>window.liveChat?.leave()).catch(()=>{});
        for(const context of contexts)await context.close();
      }
    }
    assert.deepEqual(report.errors,[]);
    console.log(`PASS live local multiplayer chat: ${report.cases.length} Chromium viewport cases`);
  }catch(error){report.failure=error.stack;console.error(JSON.stringify({errors:report.errors,blockedRequests:report.blockedRequests}));throw error;}
  finally{
    await browser?.close();if(web?.listening)await new Promise(resolve=>web.close(resolve));
    if(server){fs.writeFileSync(path.join(out,'server.log'),server.log());await server.stop();}
    fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
  }
}
run().catch(error=>{console.error(error);process.exitCode=1;});
