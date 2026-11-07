'use strict';
const vm = require('node:vm');
const copy = value => JSON.parse(JSON.stringify(value));
function fixture(parts, options = {}) {
  const trace = [], listeners = [], timers = new Map(), handlers = new Map(), nodes = new Map();
  let serial = 0, timerSerial = 0, observer = null, failAt = 0, operation = 0;
  function step(...entry) {
    trace.push(entry);
    if (failAt && ++operation === failAt) { failAt = 0; throw Error('interrupted'); }
    observer?.(entry);
  }
  const document = {activeElement:null, createElement(tag){step('create', tag);return node(tag);},addEventListener(type, fn, capture){listen('document', type, fn, capture);}};
  function listen(id, type, fn, capture){step('listen', id, type, !!capture);listeners.push({id,type,fn,capture});}
  function node(tag, givenId) {
    const id = givenId || `${tag}-${++serial}`, classes = new Set(), attrs = {}, children = [], data = {value:'',textContent:'',hidden:false,scrollTop:0,scrollHeight:100,clientHeight:100};
    const n = {tagName:tag.toUpperCase(), id:givenId || '', dataset:{}, attrs, children, inert:false,
      classList:{add(...xs){step('classAdd',id,...xs);xs.forEach(x=>classes.add(x));},remove(...xs){step('classRemove',id,...xs);xs.forEach(x=>classes.delete(x));},contains(x){return classes.has(x);},toggle(x,force){step('classToggle',id,x,force);if(force===undefined)force=!classes.has(x);if(force)classes.add(x);else classes.delete(x);return force;}},
      style:{setProperty(k,v){step('style',id,k,v);this[k]=v;}},
      setAttribute(k,v){step('attr',id,k,String(v));attrs[k]=String(v);},
      append(...xs){step('append',id,...xs.map(x=>x?._id));for(const x of xs){if(x.parentElement)x.remove();children.push(x);x.parentElement=n;}},
      prepend(...xs){step('prepend',id,...xs.map(x=>x?._id));for(const x of xs.reverse()){if(x.parentElement)x.remove();children.unshift(x);x.parentElement=n;}},
      replaceChildren(...xs){step('replace',id,...xs.map(x=>x?._id));for(const x of children)x.parentElement=null;children.length=0;n.append(...xs);if(tag==='select')data.value=children[0]?.value||'';},
      remove(){step('remove',id);if(n.parentElement){const a=n.parentElement.children;a.splice(a.indexOf(n),1);n.parentElement=null;}},
      contains(x){return x===n||children.some(c=>c.contains(x));},
      focus(arg){step('focus',id,arg?.preventScroll);if(n.inert)return;const changed=document.activeElement!==n;document.activeElement=n;if(changed)dispatch(id,'focus',{});},
      blur(){step('blur',id);if(document.activeElement===n)document.activeElement=null;},
      getBoundingClientRect(){step('rect',id);return {bottom:844};},
      addEventListener(type,fn,capture){listen(id,type,fn,capture);},
      querySelector(selector){step('query',id,selector);return n.queries?.[selector]||null;},
      querySelectorAll(selector){step('queryAll',id,selector);return selector==='[data-cb-tab]'?n.tabs||[]:[];},
      closest(){return null;},_id:id,classes,
    };
    for(const key of Object.keys(data))Object.defineProperty(n,key,{get(){return data[key];},set(v){if(key==='value'&&tag==='select'&&!children.some(c=>c.value===v))v='';step('set',id,key,v);data[key]=v;}});
    Object.defineProperties(n,{childElementCount:{get:()=>children.length},firstElementChild:{get:()=>children[0]},innerHTML:{set(v){step('html',id,v);if(v.includes('cb-tabs')){
      n.tabs=['all','map','world','party','private','bug'].map(channel=>{const b=node('button',`tab-${channel}`);b.dataset.cbTab=channel;b.queries={b:node('b',`badge-${channel}`)};return b;});
      n.queries={};for(const [selector,type] of [['.cb-log','div'],['.cb-form','form'],['.cb-input','input'],['.cb-target','select'],['.cb-open','button']])n.queries[selector]=node(type,selector.slice(1));
      n.append(...n.tabs,...Object.values(n.queries));
    }}}});
    nodes.set(id,n);return n;
  }
  for(const id of ['game','harvestButton','fishButton','chatUnread','menuChatUnread','chatButton','drawer'])node('div',id);
  nodes.get('drawer').hidden=true;
  const viewport={offsetTop:0,height:500,addEventListener(type,fn){listen('viewport',type,fn);}};
  const wide={matches:true,addEventListener(type,fn){listen('wide',type,fn);}};
  const players=new Map([['self',{characterName:'Me'}],['other',{characterName:'<Other>'}]]);
  let sendHook=null, drawerHook=null;
  const joined={state:{chatAvailable:true,extendedChatAvailable:true,players},onMessage(type,fn){step('onMessage',type);handlers.set(type,fn);},send(type,value){step('send',type,copy(value));sendHook?.(type,value);}};
  const env={document,window:{visualViewport:viewport,innerHeight:844},$:id=>{step('lookup',id);return options.noGame&&id==='game'?null:nodes.get(id);},ui:{drawer:nodes.get('drawer')},room:joined,joined,mode:'live',localId:'self',activeMapId:'map-a',
    Option:function(text,value){const n=node('option');n.textContent=text;n.value=value;return n;},
    matchMedia(query){step('matchMedia',query);return wide;},addEventListener(type,fn){listen('window',type,fn);},
    setTimeout(fn,ms){const id=++timerSerial;step('setTimeout',id,ms);timers.set(id,{fn,ms});return id;},clearTimeout(id){step('clearTimeout',id);timers.delete(id);},
    toast:text=>step('toast',text),updateFieldAlerts:()=>step('alerts'),
    closeDrawer(){step('closeDrawer');nodes.get('drawer').hidden=true;nodes.get('cb-input').inert=false;drawerHook?.();},
  };
  const context=vm.createContext(env);
  const evaluate=code=>vm.runInContext(code,context);
  if(options.initialize!==false){evaluate(parts.state004+parts.view042+parts.controls046);evaluate(parts.message044+parts.report044);}
  function dispatch(id,type,event={}){for(const l of listeners.slice())if(l.id===id&&l.type===type)l.fn(event);}
  const event=(fields={})=>({...fields,preventDefault(){step('prevent');this.defaultPrevented=true;},stopPropagation(){step('stop');}});
  const state=()=>copy(evaluate('({chatHistory,chatUnread,chatDraft,chatTargetId,chatChannel,chatPending,chatTimer,chatFeed,chatBoxTab,chatBoxUnread})'));
  const call=(name,...args)=>{env.__args=args;return evaluate(`${name}(...__args)`);};
  const receive=(message)=>handlers.get('chat_message')(message);
  const message=(overrides={})=>({channel:'map',name:'Other',text:'hello',senderId:'other',mapId:'map-a',...overrides});
  return {env,context,evaluate,trace,nodes,listeners,timers,handlers,viewport,wide,event,dispatch,state,call,receive,message,
    input(value){nodes.get('cb-input').value=value;dispatch('cb-input','input');},
    tab(channel){nodes.get(`tab-${channel}`).onclick();},
    submit(){nodes.get('cb-form').onsubmit(event());},
    tick(ms){for(const [id,t] of [...timers])if(t.ms===ms){timers.delete(id);step('fire',id,ms);t.fn();}},
    sendHook(fn){sendHook=fn;},drawerHook(fn){drawerHook=fn;},observe(fn){observer=fn;},interrupt(at){operation=0;failAt=at;},
    act(fn){try{fn();}catch(e){if(e.message!=='interrupted')throw e;trace.push(['interrupted']);}},
    log(){return nodes.get('cb-log').children.map(row=>({className:row.className,text:row.children.map(c=>c.textContent)}));},
    snapshot(){return {log:this.log(),input:nodes.get('cb-input')?.value,target:nodes.get('cb-target')?.value,active:document.activeElement?._id,classes:[...(nodes.get('cb-input')?.parentElement?.classes||[])],tabs:['all','map','world','party','private','bug'].map(id=>({id,selected:nodes.get('tab-'+id)?.attrs['aria-selected'],badge:nodes.get('badge-'+id)?.textContent,hidden:nodes.get('badge-'+id)?.hidden})),unread:nodes.get('chatUnread').textContent,menuUnread:nodes.get('menuChatUnread').textContent,timers:[...timers].map(([id,t])=>[id,t.ms])};},
  };
}
// This scenario uses only DOM/events/network callbacks and shell public functions,
// so an extracted owner can be compared without exposing its private state.
function scenario(f) {
  const actions=[
    ()=>{f.nodes.get('drawer').hidden=false;f.call('openChat');},
    ()=>f.input('map draft'),()=>f.tab('private'),()=>f.input('private draft'),
    ()=>{f.nodes.get('cb-target').value='other';f.nodes.get('cb-target').onchange();},
    ()=>f.submit(),()=>f.receive(f.message({channel:'private',senderId:'self',targetId:'other',targetName:'<Peer>',text:'private draft'})),
    ()=>f.call('closeChatComposer'),()=>f.receive(f.message({channel:'world',name:'<b>N</b>',text:'<i>T</i>'})),
    ()=>f.tab('all'),()=>{f.nodes.get('cb-log').scrollHeight=400;f.nodes.get('cb-log').scrollTop=270;f.receive(f.message());},
    ()=>f.call('clearChatHistory',false),()=>f.tab('bug'),()=>f.input('report'),()=>f.submit(),
    ()=>f.handlers.get('chat_report_result')({ok:false}),()=>f.submit(),()=>f.handlers.get('chat_report_result')({ok:true}),
    ()=>f.tab('map'),()=>f.input('timeout'),()=>f.submit(),()=>f.tick(5000),
    ()=>f.dispatch('cb-input','keydown',f.event({key:'Escape'})),()=>f.dispatch('window','keydown',f.event({key:'Enter',target:{tagName:'DIV'}})),
    ()=>f.dispatch('document','pointerdown',{target:f.nodes.get('game')}),()=>f.call('clearChatHistory',true),()=>f.tick(8000),
  ];
  for(const action of actions)f.act(action);
  return {trace:f.trace,snapshot:f.snapshot()};
}
module.exports={fixture,copy,scenario};
