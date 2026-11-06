const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const audioCode=fs.readFileSync('audio.js','utf8'),main=fs.readFileSync('main.js','utf8');
function engine({native=false,settings={},reject=false,throws=false}={}) {
  const utterances=[],media=[],timers=new Map();let seq=0;
  const synth={getVoices:()=>native?[{lang:'th-TH',name:'Thai'}]:[],cancel(){},resume(){},speak(u){if(throws)throw Error('engine');utterances.push(u)}};
  const window={addEventListener(){},speechSynthesis:synth};
  class Audio { constructor(url){this.url=url;this.paused=true;media.push(this)}play(){this.paused=false;return reject?Promise.reject({name:'NotAllowedError'}):Promise.resolve()}pause(){this.paused=true} }
  vm.runInNewContext(audioCode,{window,Audio,SpeechSynthesisUtterance:class{},localStorage:{getItem:()=>JSON.stringify(settings),setItem(){}},document:{addEventListener(){}},setInterval(){},setTimeout(f){timers.set(++seq,f);return seq},clearTimeout(id){timers.delete(id)}});
  return {api:window.MontraAudio,utterances,media,timers};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
(async()=>{
  let e=engine({native:true}),events=[];
  assert.equal(e.api.speak('ทดสอบ',{onStart:()=>events.push('start'),onEnd:()=>events.push('end')}),true);
  assert.equal(e.utterances.length,1,'native speak stays synchronous inside gesture');assert.deepEqual(events,[]);
  e.utterances[0].onstart();e.utterances[0].onstart();assert.deepEqual(events,['start']);
  e.utterances[0].onend();assert.deepEqual(events,['start','end']);assert.equal(e.api.isSpeaking(),false);
  for(const native of [false,true]){
    e=engine({native});events=[];e.api.speak('one',{onStart:()=>events.push('old start'),onError:()=>events.push('old error'),onEnd:()=>events.push('old end')});
    const old=native?e.utterances[0]:e.media[0];e.api.stopSpeech();assert.equal(e.api.isSpeaking(),false);
    e.api.speak('two',{onStart:()=>events.push('new start')});
    (native?old.onstart:old.onplaying)();old.onerror({error:'cancelled'});old.onend?.();old.onended?.();
    assert.deepEqual(events,['old end']);assert.equal(e.api.isSpeaking(),true);
  }
  e=engine({reject:true});events=[];e.api.speak('test',{onError:x=>events.push(x.error)});await tick();assert.deepEqual(events,['not-allowed']);assert.equal(e.api.isSpeaking(),false);assert.equal(e.media[0].paused,true);
  e.media[0].onerror();assert.equal(events.length,1,'media error and rejected promise cannot double-report');
  e=engine({native:true});events=[];e.api.speak('test',{onError:x=>events.push(x.error)});e.utterances[0].onerror({error:'synthesis-failed'});assert.deepEqual(events,['synthesis-failed']);assert.equal(e.media.length,0,'native error must not newly disclose text to Google');
  e=engine({native:true,throws:true});events=[];assert.equal(e.api.speak('test',{onError:x=>events.push(x.error)}),false);assert.deepEqual(events,['synthesis-failed']);assert.equal(e.media.length,0);
  for(const settings of [{muted:true},{voice:0},{master:0}]){e=engine({settings});events=[];assert.equal(e.api.speak('test',{onError:x=>events.push(x.error)}),false);assert.deepEqual(events,['muted']);assert.equal(e.media.length,0)}
  e=engine();events=[];e.api.speak('test',{onStart:()=>events.push('start'),onEnd:()=>events.push('end')});e.media[0].onplaying();e.media[0].onended();assert.deepEqual(events,['start','end']);assert.equal(e.api.isSpeaking(),false);
  e=engine();events=[];e.api.speak('test',{onError:x=>events.push(x.error)});[...e.timers.values()][0]();assert.deepEqual(events,['start-timeout']);assert.equal(e.media[0].paused,true);
  const start=main.indexOf('  function bindSpeechButton('),end=main.indexOf('  function openHelp()',start);
  const status={setAttribute(){},textContent:''},button={textContent:'',after(s){assert.equal(s,status)}};let options,active=false;
  const api={speak(t,o){options=o;active=true},isSpeaking:()=>active,stopSpeech(){active=false;options.onEnd()}};
  const bind=vm.runInNewContext(`(${main.slice(start,end).trim()})`,{document:{createElement:()=>status},window:{MontraAudio:api}});
  bind(button,'text','guide','Listen');assert.match(status.textContent,/Google/);assert.equal(options,undefined,'bind must not auto-play');
  button.onclick();assert.equal(button.textContent,'ยกเลิกการเตรียมเสียง');options.onStart();assert.equal(button.textContent,'⏹ หยุดเสียงพูด');button.onclick();assert.equal(button.textContent,'Listen');
  button.onclick();options.onError({error:'not-allowed'});assert.equal(button.textContent,'Listen');assert.match(status.textContent,/เบราว์เซอร์/);
  const npc=main.slice(main.indexOf('  function openServiceNpc('),main.indexOf('    const action=',main.indexOf('  function openServiceNpc(')));
  const guide=main.slice(main.indexOf('joined.onMessage("npc_guide_result"'),main.indexOf('joined.onMessage("forest_defense_state"'));
  assert.ok(!npc.includes('.speak(')&&!npc.includes('?.speak?.(')&&!guide.includes('.speak(')&&!guide.includes('?.speak?.('),'NPC responses must wait for explicit tap');
  console.log('PASS: speech start/error/cancel/replay/timeout/mute, no native-error disclosure, truthful tap-to-play UI');
})().catch(e=>{console.error(e);process.exitCode=1});
