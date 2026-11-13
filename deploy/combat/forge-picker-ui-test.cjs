const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../../main.js'),'utf8');
const slice=(start,end)=>{const a=source.indexOf(start),b=source.indexOf(end,a);assert(a>=0&&b>a,`missing source boundary: ${start}`);return source.slice(a,b);};
const plain=value=>JSON.parse(JSON.stringify(value));
let groups=0;
function test(name,body){try{body();groups++;console.log('PASS '+name);}catch(error){error.message=name+': '+error.message;throw error;}}

// The fixture runs production picker, item renderers, drawer navigation and key handling.
// It models native disabled clicks, select values, dialog state, descendants and focus;
// native browser top-layer rendering remains a separate browser-QA responsibility.
function dom(){
  const elements=new Map(),document={activeElement:null};
  function node(tag='div'){
    let text='',value='';const classes=new Set();
    const el={tagName:tag.toUpperCase(),parentNode:null,children:[],dataset:{},attributes:{},hidden:false,disabled:false,open:false,showCount:0,closeCount:0,
      classList:{contains:k=>classes.has(k),toggle(k,on){if(on===undefined)on=!classes.has(k);if(on)classes.add(k);else classes.delete(k);return on;}},
      setAttribute(k,v){v=String(v);this.attributes[k]=v;if(k==='class')this.className=v;if(k==='id'){this.id=v;elements.set(v,this);}if(k==='value')value=v;if(k==='hidden')this.hidden=true;if(k==='disabled')this.disabled=true;if(k.startsWith('data-'))this.dataset[k.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=v;},
      getAttribute(k){return this.attributes[k];},
      append(...children){for(const child of children){if(child.parentNode)child.parentNode.children=child.parentNode.children.filter(c=>c!==child);child.parentNode=this;this.children.push(child);if(this.tagName==='SELECT'&&this.children.length===1)value=String(child.value);}},
      replaceChildren(...children){for(const child of this.children){if(child.contains(document.activeElement))document.activeElement=document.body;child.parentNode=null;}this.children=[];text='';value='';this.append(...children);},
      contains(other){return this===other||this.children.some(child=>child.contains(other));},
      querySelectorAll(selector){const all=this.children.flatMap(child=>[child,...child.querySelectorAll('*')]);if(selector==='*')return all;return all.filter(child=>selector.split(',').some(part=>{part=part.trim();if(part==='button:not(:disabled)')return child.tagName==='BUTTON'&&!child.disabled;if(part==='[tabindex="0"]')return child.getAttribute('tabindex')==='0';if(part==='[aria-pressed="true"]'||part==='[data-journal-tab][aria-pressed=true]')return child.getAttribute('aria-pressed')==='true';if(part==='button')return child.tagName==='BUTTON';if(part.startsWith('#'))return child.id===part.slice(1);assert.fail('unmodeled selector '+part);}));},
      querySelector(selector){return this.querySelectorAll(selector)[0]||null;},
      getClientRects(){for(let current=this;current;current=current.parentNode)if(current.hidden||(current.tagName==='DIALOG'&&!current.open))return [];return this.isConnected?[{}]:[];},
      getBoundingClientRect(){return {left:10,right:310,top:20,bottom:420};},
      focus(){if(this.isConnected&&!this.disabled&&this.getClientRects().length)document.activeElement=this;},
      click(){if(!this.disabled)this.onclick?.({target:this,clientX:30,clientY:40});},
      showModal(){assert.equal(this.tagName,'DIALOG');assert(this.isConnected);assert.equal(this.open,false);this.open=true;this.showCount++;},
      close(){assert.equal(this.tagName,'DIALOG');this.open=false;this.closeCount++;this.onclose?.();},scrollIntoView(){this.scrolled=true;},
    };
    Object.defineProperties(el,{
      className:{get(){return [...classes].join(' ');},set(next){classes.clear();for(const c of String(next).split(/\s+/).filter(Boolean))classes.add(c);}},
      textContent:{get(){return text+this.children.map(child=>child.textContent).join('');},set(next){this.replaceChildren();text=String(next);}},
      value:{get(){return value;},set(next){next=String(next);value=this.tagName==='SELECT'&&!this.children.some(c=>c.value===next)?'':next;}},
      options:{get(){return this.children;}},isConnected:{get(){return this===document.body||!!this.parentNode?.isConnected;}},
      innerHTML:{configurable:true,set(){assert.fail('picker/item content must use textContent, not innerHTML');}},
    });return el;
  }
  document.createElement=node;document.body=node('body');document.activeElement=document.body;
  const mount=(id,tag='div',parent=document.body)=>{const el=node(tag);el.setAttribute('id',id);parent.append(el);return el;};
  const game=mount('game'),drawer=mount('drawer','aside',game),shade=mount('shade','div',game),body=mount('drawerBody','div',drawer),title=mount('drawerTitle','h2',drawer);
  const menu=mount('fieldMenu','div',drawer);const menuTab=node('button');menuTab.setAttribute('aria-pressed','true');menu.append(menuTab);
  mount('drawerMenuBack','button',drawer);mount('fieldMenuButton','button',game);mount('worldInput','button',game);drawer.hidden=true;shade.hidden=true;
  // Only the trusted, static drawer template may use innerHTML. Dynamic catalog text is inert.
  Object.defineProperty(body,'innerHTML',{set(html){
    for(const child of this.querySelectorAll('*'))if(child.id)elements.delete(child.id);
    this.replaceChildren();const stack=[this];
    for(const token of html.matchAll(/<\/?[a-z][^>]*>|[^<]+/gi)){
      const part=token[0];if(part.startsWith('</')){stack.pop();continue;}if(!part.startsWith('<'))continue;
      const match=part.match(/^<([a-z][a-z0-9]*)\b([^>]*)>/i);if(!match)continue;
      const child=node(match[1]);for(const attr of match[2].matchAll(/([\w-]+)(?:="([^"]*)")?/g))child.setAttribute(attr[1],attr[2]??'');
      stack.at(-1).append(child);if(!['input','img','br','hr','meta','link'].includes(match[1]))stack.push(child);
    }
  },configurable:true});
  return {document,node,elements,$:id=>elements.get(id)||null,ui:{drawer,shade,drawerBody:body,drawerTitle:title}};
}
const forged=(instanceId,rank=5)=>({instanceId,revision:2,rank,misses:0,affix:{stat:'melee',tier:2},rerollMisses:1});
function fixture(){
  const d=dom(),wire=[],prompts=[],routes=[],player={alive:true,level:25,persistent:true};
  const profile={primary:'melee',pool:['melee','guard'],enhanceMax:10,affixMax:6,affixTierCap:2,materialTier:2};
  const def=(name,kind,extra={})=>({name,kind,level:1,path:'blade',stats:{},forge:profile,...extra});
  const items={weapon:def('ดาบคู่','mainHand',{level:25}),ring:def('แหวน','ring',{copyLimit:2}),ear:def('ตุ้มหู','earring',{copyLimit:2}),leftGlove:def('ถุงมือซ้าย','leftHand'),rightGlove:def('ถุงมือขวา','rightHand'),
    max:def('ดาบเต็มขั้น','mainHand'),high:def('ดาบเลเวลสูง','mainHand',{level:99}),bound:def('ดาบผูกตัวละคร','mainHand'),affixed:def('ดาบมีออปชัน','mainHand'),
    potion:{name:'ยาเลือด',kind:'consumable'},material:{name:'แร่',kind:'material'},catalyst:{name:'ตรา',kind:'catalyst'},card:{name:'การ์ด',kind:'card'},tool:{name:'เบ็ด',kind:'tool'},plainChest:{name:'เสื้อไม่มีงานช่าง',kind:'chest'},ref_seal_2:{name:'ตราอาคม',kind:'catalyst'}};
  const slots=[{itemId:'weapon',quantity:1,forge:forged('equipped')},{itemId:'legacy',quantity:1},{itemId:'ring',quantity:1,socket:'card',bound:true,forge:forged('bag-ring')},
    {itemId:'max',quantity:1,forge:forged('maxed',10)},{itemId:'high',quantity:1,forge:forged('too-high')},
    ...['potion','material','catalyst','card','tool','plainChest','unknown'].map(itemId=>({itemId,quantity:1})),null,
    {itemId:'bound',quantity:1,bound:true,forge:forged('bound',0)},{itemId:'affixed',quantity:1,forge:forged('affixed',1)}];
  const equipment={leftRing:'ring',rightRing:'ring',leftEar:'ear',rightEar:'ear',leftHand:'leftGlove',rightHand:'rightGlove',chest:'plainChest'};
  const inventory={slots,equippedWeaponSlot:0,equipment,equipmentForges:Object.fromEntries(Object.keys(equipment).filter(k=>k!=='chest').map(k=>[k,forged(k)])),equipmentSockets:{leftRing:'card'},forgeCopies:{weapon:20,ring:20,ear:20,leftGlove:20,rightGlove:20,max:20,high:20,bound:20,affixed:20,legacy:20}};
  const config={chances:Array(10).fill(100),rerollCost:60,rareAfter:4,claimCopies:true,enhanceSteps:Array.from({length:10},(_,rank)=>({copies:1+Math.floor(rank/3),gold:12*(rank+1),chance:rank>4?78:100,downgradeChance:rank>4?20:0,breakChance:rank>4?2:0,breakOnFailure:rank>4}))};
  const ctx={...d,clearTimeout(){},cancelAnimationFrame(){},refreshArtisanWallet(){},Option:function(text,value){const option=d.node("option");option.textContent=text;option.value=String(value);return option;},drawerActive:null,drawerOpener:null,fieldTrainingTip:null,SFX(){},closeEquipPopup(){},closeItemDetailModal(){},handleItemDetailKey:()=>false,mode:'live',inventoryState:inventory,personalItems:items,WEAPON_META:{legacy:{name:'กริชเก่า',symbol:'†'}},POTION_ITEM_ID:'potion',SHRINE_SHARD:'shrine_shard',
    bodyLabels:{leftRing:'แหวนซ้าย',rightRing:'แหวนขวา',leftEar:'ตุ้มหูซ้าย',rightEar:'ตุ้มหูขวา',leftHand:'มือซ้าย',rightHand:'มือขวา',chest:'อก'},forgeNames:{melee:'โจมตีประชิด',guard:'ป้องกัน',ranged:'โจมตีเวท'},statLine:()=>'',
    currentBagSlots:()=>ctx.inventoryState?.slots,currentEquippedWeaponSlot:()=>ctx.inventoryState?.equippedWeaponSlot,ownServerCharacter:()=>player,
    economyReady:()=>ctx.mode==='live'&&ctx.room?.state?.economyAvailable===true,economyPending:false,itemUsePending:false,economyGold:10000,selectedBagSlot:0,inspectingGear:null,benchTrail:[],
    itemHuntCount:(id,stock=false)=>id==='ref_seal_2'?5:(ctx.inventoryState?.slots||[]).filter(p=>p?.itemId===id).length+Object.values(ctx.inventoryState?.equipment||{}).filter(v=>v===id).length+(stock?(ctx.inventoryState?.forgeCopies?.[id]||0):0),
    bindItemHuntButton:(button,id)=>{button.hidden=!id;},economyRequestId:()=>`request_${wire.length}`,window:{confirm:message=>{prompts.push(message);return true;}},
    economySend:(command,payload,durable)=>{wire.push({command,payload:plain(payload),durable});if(durable)ctx.economyPending=true;},renderBag:()=>{if(ctx.drawerActive==='forge')ctx.renderForgePage();},
    openBag:()=>{ctx.openDrawer('bag','กระเป๋า','<div id="cardSocketPanel"></div>');routes.push('bag');},openItemDetailModal(){},selectBenchRecipe:(...args)=>routes.push(args),
  };
  ctx.room={state:{economyAvailable:true,forgeCatalog:JSON.stringify(config)}};
  vm.createContext(ctx);const run=code=>vm.runInContext(code,ctx);
  run(slice('  const gearSymbols=','  let inspectingGear=')+slice('  function bagMeta(','  function pieceStat(')+slice('  function gearStamp(','  function accessoryStamp(')+slice('  function forgeLabel(','  function salvageSelectedGear(')+slice('  function forgeGearLevel(','  function openBag()')+slice('  function gateFieldInput(','  const journalOrigins='));
  const refresh=()=>ctx.renderForgePage(),open=(action='enhance',target=0)=>ctx.openForgePage(action,target),popup=()=>d.$('forgeTargetButton').click(),key=()=>d.$('forgeTargetButton').dataset.target;
  const buttons=()=>d.$('forgePickerGrid').children,button=target=>buttons().find(b=>b.dataset.forgeTarget===target),pick=target=>{popup();assert(button(target),`missing choice ${target}`);button(target).click();};
  const snapshot=()=>JSON.stringify({inventory:ctx.inventoryState,gold:ctx.economyGold}),mutations=()=>wire.filter(e=>e.durable);
  return {...d,ctx,run,wire,prompts,routes,player,inventory,items,slots,config,refresh,open,popup,key,buttons,button,pick,snapshot,mutations};
}

test('slot opens one native dialog with accessible equipment-only grid; main hand appears once',()=>{
  const f=fixture();f.open();assert.equal(f.$('forgeGear'),null);assert.equal(f.$('forgeTargetButton').tagName,'BUTTON');
  assert.equal(f.$('forgeTargetButton').getAttribute('aria-haspopup'),'dialog');assert.equal(f.$('forgeTargetButton').getAttribute('aria-controls'),'forgePicker');
  assert.equal(f.$('forgePicker').tagName,'DIALOG');assert.equal(f.$('forgePicker').getAttribute('aria-labelledby'),'forgePickerTitle');
  f.popup();const expected=['bag:0','bag:1','bag:2','bag:3','bag:4','bag:13','bag:14','worn:leftRing','worn:rightRing','worn:leftEar','worn:rightEar','worn:leftHand','worn:rightHand'];
  assert.deepEqual(f.buttons().map(b=>b.dataset.forgeTarget),expected);
  assert.deepEqual(Array.from(f.ctx.forgeTargetChoices(),c=>c.key),expected);
  assert.equal(f.buttons().filter(b=>/อาวุธหลัก/.test(b.getAttribute('aria-label'))).length,1);
  assert.equal(f.$('forgeTargetButton').getAttribute('aria-expanded'),'true');assert.equal(f.document.activeElement,f.button('bag:0'));
  f.popup();assert.equal(f.$('forgePicker').showCount,1,'repeated open must not reopen the modal');
  for(const button of f.buttons()){assert.equal(button.tagName,'BUTTON');assert.equal(button.type,'button');assert.equal(button.children[0].tagName,'DIV');assert.equal(button.children[0].getAttribute('aria-hidden'),'true');assert.equal(button.querySelectorAll('button').length,0);assert(button.getAttribute('aria-label'));}
});

test('actual picker click updates slot, preview and selected side without mutation or inventory changes',()=>{
  const f=fixture();f.open();const before=f.snapshot(),wire=f.wire.length;
  f.$('forgeDonor').replaceChildren(new f.ctx.Option('donor','1|legacy'));f.$('forgeDonor').value='1|legacy';
  f.pick('worn:rightRing');assert.equal(f.key(),'worn:rightRing');assert.equal(f.$('forgePicker').open,false);assert.equal(f.$('forgeTargetButton').getAttribute('aria-expanded'),'false');
  assert.equal(f.document.activeElement,f.$('forgeTargetButton'));assert.equal(f.$('forgeDonor').value,'');assert.match(f.$('forgeTargetLocation').textContent,/แหวนขวา/);
  assert.match(f.$('forgeItemSymbol').children[0].getAttribute('aria-label'),/แหวน \+5/);assert.equal(f.snapshot(),before);assert.equal(f.wire.length,wire);assert.equal(f.prompts.length,0);assert.equal(f.mutations().length,0);
  f.popup();assert.equal(f.button('worn:rightRing').getAttribute('aria-pressed'),'true');assert.equal(f.button('worn:leftRing').getAttribute('aria-pressed'),'false');assert(f.button('worn:rightRing').children[0].classList.contains('bag-selected'));
});

test('both rings, ears and hands select exact side and send its current identity only on submit',()=>{
  for(const target of ['leftRing','rightRing','leftEar','rightEar','leftHand','rightHand']){
    const f=fixture();f.open('reroll');f.pick('worn:'+target);assert.equal(f.mutations().length,0);f.$('forgeReroll').click();
    assert.deepEqual(f.mutations(),[{command:'forge_weapon',payload:{slot:target,stamp:target+'.2',action:'reroll',requestId:'request_1'},durable:true}]);
  }
});

test('max rank, low player level, socketed, bound and affixed gear remain selectable while action guards apply',()=>{
  for(const [target,blocked] of [['bag:3',true],['bag:4',true],['bag:2',true],['bag:13',false],['bag:14',false]]){
    const f=fixture();f.open();f.popup();assert.equal(f.button(target).disabled,false);f.button(target).click();assert.equal(f.key(),target);assert.equal(f.$('forgeEnhance').disabled,blocked);assert.equal(f.mutations().length,0);
  }
  const f=fixture();f.player.level=1;f.open();f.pick('bag:0');assert.equal(f.key(),'bag:0');assert.equal(f.$('forgeEnhance').disabled,true);assert.match(f.$('forgeActionStatus').textContent,/Lv\.25/);
  f.open('reroll');f.pick('bag:3');assert.equal(f.$('forgeReroll').disabled,false,'maximum enhance rank must still support reroll');
});

test('stale clicks reject missing, moved, replaced, revised, incompatible and newly-instanced items',()=>{
  const cases={missing:f=>{f.slots[2]=null;},moved:f=>{f.slots[12]=f.slots[2];f.slots[2]=null;},replacement:f=>{f.slots[2]={...f.slots[2],forge:forged('replacement')};},revision:f=>{f.slots[2].forge.revision++;},model:f=>{f.slots[2]={itemId:'bound',quantity:1,forge:forged('bag-ring')};},incompatible:f=>{delete f.items.ring.forge;},lostInstance:f=>{delete f.slots[2].forge;}};
  for(const [name,change] of Object.entries(cases)){
    const f=fixture();f.open();f.popup();const stale=f.button('bag:2');change(f);const before=f.snapshot();stale.onclick();
    assert.equal(f.key(),'bag:0',name);assert.equal(f.$('forgePicker').open,true,name);assert.match(f.$('forgePickerStatus').textContent,/เปลี่ยนไปแล้ว/,name);assert.equal(f.snapshot(),before,name);assert.equal(f.mutations().length,0,name);
    if(f.button('bag:2')){assert.notEqual(f.button('bag:2'),stale,name);f.button('bag:2').click();assert.equal(f.key(),'bag:2',name);}
  }
  const f=fixture();f.open();f.popup();const legacy=f.button('bag:1');f.slots[1].forge=forged('first-forge');legacy.onclick();assert.equal(f.key(),'bag:0');assert.match(f.$('forgePickerStatus').textContent,/เปลี่ยนไปแล้ว/);f.button('bag:1').click();assert.equal(f.key(),'bag:1');
});

test('live refresh updates grid in place, preserves row focus and restores close focus when its row disappears',()=>{
  const f=fixture();f.open();f.popup();const popup=f.$('forgePicker'),target=f.$('forgeTargetButton'),grid=f.$('forgePickerGrid');
  const initial=f.button('bag:2');initial.focus();f.refresh();assert.equal(f.button('bag:2'),initial,'identical state must not replace controls');
  f.slots[2].forge.revision++;f.slots[2].forge.rank=6;f.refresh();assert.equal(f.$('forgePicker'),popup);assert.equal(f.$('forgeTargetButton'),target);assert.equal(f.$('forgePickerGrid'),grid);assert.equal(popup.open,true);
  assert.notEqual(f.button('bag:2'),initial);assert.equal(f.document.activeElement,f.button('bag:2'));assert.match(f.button('bag:2').textContent,/\+6/);
  const stale=initial;stale.onclick();assert.equal(f.key(),'bag:0','detached previous-revision handler cannot choose the live replacement');
  f.slots[2]=null;f.refresh();assert.equal(f.button('bag:2'),undefined);assert.equal(f.document.activeElement,f.$('forgePickerClose'));
  f.slots[12]={itemId:'bound',quantity:1,forge:forged('added')};f.refresh();assert(f.button('bag:12'));assert.equal(f.document.activeElement,f.$('forgePickerClose'));
  f.slots[0].forge.revision++;f.refresh();assert.equal(f.key(),'bag:0');f.slots[0].forge=forged('new-owner');f.refresh();assert.equal(f.key(),'');assert.equal(f.$('forgePanel').hidden,true);assert.equal(f.$('forgePicker').open,true);
});

test('legacy target adopts its first forge identity, follows revisions and rejects later replacements',()=>{
  const f=fixture();f.open();f.pick('bag:1');f.slots[1].forge=forged('new-legacy');f.refresh();assert.equal(f.key(),'bag:1');
  f.popup();f.slots[1].forge.revision++;f.refresh();assert.equal(f.key(),'bag:1');assert.equal(f.button('bag:1').getAttribute('aria-pressed'),'true');
  f.slots[1].forge=forged('other-legacy');f.refresh();assert.equal(f.key(),'');assert.equal(f.$('forgePanel').hidden,true);assert.equal(f.mutations().length,0);
});

test('pending equipment/economy requests block opening, disable live choices and reject saved handlers',()=>{
  for(const pending of ['economyPending','itemUsePending']){
    const f=fixture();f.open();f.ctx[pending]=true;f.refresh();assert.equal(f.$('forgeTargetButton').disabled,true);f.popup();f.ctx.openForgePicker();assert.equal(f.$('forgePicker').open,false);
    f.ctx[pending]=false;f.refresh();f.popup();const stale=f.button('bag:2');stale.focus();f.ctx[pending]=true;f.refresh();assert(f.buttons().every(b=>b.disabled));assert.equal(f.document.activeElement,f.$('forgePickerClose'));const before=f.snapshot();
    stale.onclick();f.button('bag:2').click();assert.equal(f.key(),'bag:0');assert.equal(f.mutations().length,0);assert.equal(f.snapshot(),before);assert.match(f.$('forgePickerStatus').textContent,/รอรายการ/);
    f.ctx[pending]=false;f.refresh();assert(f.buttons().every(b=>!b.disabled));f.button('bag:2').click();assert.equal(f.key(),'bag:2');
  }
});

test('close, Escape, native cancel and outside backdrop restore slot focus without submitting',()=>{
  const f=fixture();f.open();
  for(const close of [()=>f.$('forgePickerClose').click(),()=>{const e={key:'Escape',preventDefault(){this.prevented=true;}};assert.equal(f.ctx.handleForgePickerKey(e),true);assert.equal(e.prevented,true);},()=>{const e={preventDefault(){this.prevented=true;}};f.$('forgePicker').oncancel(e);assert.equal(e.prevented,true);},()=>{const popup=f.$('forgePicker');popup.onclick({target:popup,clientX:0,clientY:0});}]){
    f.popup();const before=f.snapshot();close();assert.equal(f.$('forgePicker').open,false);assert.equal(f.$('forgeTargetButton').getAttribute('aria-expanded'),'false');assert.equal(f.document.activeElement,f.$('forgeTargetButton'));assert.equal(f.snapshot(),before);assert.equal(f.mutations().length,0);
  }
  f.popup();const popup=f.$('forgePicker');popup.onclick({target:popup,clientX:20,clientY:30});assert.equal(popup.open,true,'dialog whitespace is not the backdrop');popup.onclick({target:f.button('bag:2'),clientX:0,clientY:0});assert.equal(popup.open,true,'child clicks must not dismiss');
  f.ctx.closeForgePicker(false);const after=f.document.activeElement;f.ctx.closeForgePicker();assert.equal(f.document.activeElement,after,'already closed dialog is a no-op');assert.equal(f.ctx.handleForgePickerKey({key:'Escape'}),false);
});

test('Tab and Shift+Tab wrap visible enabled controls and leave ordinary keys to the drawer',()=>{
  const f=fixture();f.open();f.popup();const first=f.$('forgePickerClose'),last=f.buttons().at(-1);
  const tab=(shiftKey=false)=>{const event={key:'Tab',shiftKey,preventDefault(){this.prevented=true;}};assert.equal(f.ctx.handleForgePickerKey(event),true);return event;};
  last.focus();assert.equal(tab().prevented,true);assert.equal(f.document.activeElement,first);first.focus();assert.equal(tab(true).prevented,true);assert.equal(f.document.activeElement,last);
  f.$('forgeTargetButton').focus();assert.equal(tab().prevented,true);assert.equal(f.document.activeElement,first);f.$('forgeTargetButton').focus();assert.equal(tab(true).prevented,true);assert.equal(f.document.activeElement,last);
  f.button('bag:2').focus();assert.equal(tab().prevented,undefined,'native Tab handles internal controls');assert.equal(f.ctx.handleForgePickerKey({key:'ArrowDown'}),false);
  f.ctx.economyPending=true;f.refresh();first.focus();assert.equal(tab().prevented,true);assert.equal(f.document.activeElement,first);assert.equal(tab(true).prevented,true);assert.equal(f.document.activeElement,first);
});

test('real drawer navigation and close destroy the open picker without restoring focus to removed controls',()=>{
  for(const route of ['forgeHome','forgeBag','forgeTabReroll']){
    const f=fixture();f.open();f.popup();const popup=f.$('forgePicker'),target=f.$('forgeTargetButton'),stale=f.button('bag:2');f.$(route).click();
    assert.equal(popup.open,false,route);assert.equal(popup.closeCount,1,route);assert.equal(target.isConnected,route==='forgeTabReroll',route);assert.notEqual(f.document.activeElement,target,route);const before=f.snapshot();stale.onclick();assert.equal(f.mutations().length,0,route);assert.equal(f.snapshot(),before,route);
    assert.equal(f.ctx.drawerActive,route==='forgeHome'?'smith':route==='forgeBag'?'bag':'forge',route);
  }
  const f=fixture();f.$('fieldMenuButton').focus();f.open();f.popup();const popup=f.$('forgePicker');f.ctx.closeDrawer();assert.equal(popup.open,false);assert.equal(f.ctx.drawerActive,null);assert.equal(f.ui.drawer.hidden,true);assert.equal(f.document.activeElement,f.$('fieldMenuButton'));assert.equal(f.$('worldInput').inert,false);
});

test('room changes, disconnect and unavailable economy close popup and invalidate old target',()=>{
  for(const change of [f=>{f.ctx.room={state:{economyAvailable:true,forgeCatalog:JSON.stringify(f.config)}};},f=>{f.ctx.room=null;},f=>{f.ctx.mode='demo';},f=>{f.ctx.room.state.economyAvailable=false;}]){
    const f=fixture();f.open();f.popup();const stale=f.button('bag:2');change(f);f.refresh();assert.equal(f.$('forgePicker').open,false);assert.equal(f.key(),'');assert.equal(f.$('forgePanel').hidden,true);stale.onclick();assert.equal(f.key(),'');assert.equal(f.mutations().length,0);
  }
  const f=fixture();f.open();f.popup();f.ctx.clearSyncPoll=()=>{};f.ctx.resetGhostPotUi=()=>{};f.ctx.showDemo=()=>{assert.equal(f.$('forgePicker').open,false,'stopOnline closes before resetting connection state');f.ctx.mode='demo';};
  f.run(slice('  function stopOnline(reason) {','  let connectionPending ='));f.ctx.stopOnline('offline');assert.equal(f.$('forgePicker').open,false);assert.equal(f.ctx.mode,'demo');
  assert.match(source,/function showDemo\(\) \{\s*cancelForgeAnimation\(false,true\);finishEconomyPending\(true\);closeForgePicker\(false\)/);
});

test('empty and unsupported inventories can show helpful grid status but cannot mutate',()=>{
  const f=fixture();f.inventory.slots=Array(12).fill(null);f.inventory.equipment={};f.open();assert.equal(f.key(),'');assert.equal(f.$('forgeTargetButton').disabled,false);f.popup();assert.equal(f.buttons().length,0);assert.match(f.$('forgePickerStatus').textContent,/ยังไม่มีอุปกรณ์/);assert.equal(f.document.activeElement,f.$('forgePickerClose'));assert.equal(f.$('forgePanel').hidden,true);f.$('forgeEnhance').onclick();assert.equal(f.mutations().length,0);
  const g=fixture();g.ctx.room.state.forgeCatalog='';g.open();g.pick('bag:2');assert.equal(g.key(),'bag:2');assert.equal(g.$('forgePanel').hidden,true);g.$('forgeEnhance').onclick();assert.equal(g.mutations().length,0);assert.match(g.$('forgePageStatus').textContent,/ยังไม่ส่ง/);
});

test('catalog names remain inert text and selected thumbnail uses shared inventory visuals',()=>{
  const f=fixture(),unsafe='<img src=x onerror="throw 1"> & <script>throw 2</script>';f.items.ring.name=unsafe;f.open();f.popup();const button=f.button('bag:2');
  assert.equal(button.children[1].textContent,unsafe+' +5');assert.equal(button.children[1].children.length,0);assert(button.getAttribute('aria-label').includes(unsafe));assert(button.children[0].classList.contains('bag-slot'));assert(button.children[0].classList.contains('item-slot'));button.click();assert.equal(f.$('forgeItemName').textContent,unsafe);assert.equal(f.$('forgeItemName').children.length,0);
});

test('actual drawer key listener closes only the popup on first Escape, then the drawer',()=>{
  const f=fixture(),account=f.node('div');account.hidden=true;f.elements.set('accountEntry',account);f.document.body.append(account);
  let listener;f.document.addEventListener=(type,handler)=>{assert.equal(type,'keydown');listener=handler;};
  f.run(slice('  document.addEventListener("keydown",event=>{\n    if (ui.drawer.hidden','  function updateChatBadge('));
  f.open();f.popup();const first={key:'Escape',preventDefault(){this.prevented=true;}};listener(first);
  assert.equal(first.prevented,true);assert.equal(f.$('forgePicker').open,false);assert.equal(f.ctx.drawerActive,'forge');assert.equal(f.ui.drawer.hidden,false);assert.equal(f.document.activeElement,f.$('forgeTargetButton'));
  const second={key:'Escape',preventDefault(){this.prevented=true;}};listener(second);assert.equal(second.prevented,true);assert.equal(f.ctx.drawerActive,null);assert.equal(f.ui.drawer.hidden,true);assert.equal(f.mutations().length,0);
});
console.log(`PASS forge item picker: ${groups} focused regression groups`);
