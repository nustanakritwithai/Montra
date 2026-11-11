const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('main.js','utf8');
const configStart=source.indexOf('  const serviceNpcUi={'),configEnd=source.indexOf('  const serviceNpcLooks=',configStart);
const fnStart=source.indexOf('  function openServiceNpc(npc){'),fnEnd=source.indexOf('  function syncQuestRanger()',fnStart);
assert.ok(configStart>=0 && configEnd>configStart && fnStart>=0 && fnEnd>fnStart,'NPC UI code exists');
const serviceNpcUi=vm.runInNewContext(`(()=>{${source.slice(configStart,configEnd)};return serviceNpcUi;})()`);
const calls=[],elements={},children=[];
const element=()=>({textContent:'',className:'',onclick:null,type:''});
const context={serviceNpcUi,room:null,citySiteNames:{moon_pass:'ด่านจันทร์'},document:{createElement:()=>element()},ui:{drawerBody:{append:e=>children.push(e)}},
  $:id=>elements[id],openDrawer:()=>{elements.serviceNpcSpeech=element();elements.serviceNpcAction=element();children.length=0;},
  ownServerCharacter:()=>({pathId:context.path}),activeMapId:'moon_pass',territoryState:{local:{site:'moon_pass'}},toast:message=>calls.push(message)};
for(const name of ['openBag','openSmith','openEconomy','openCityMarket','openGuild','openParty','openMap','openStrategicMap','openHelp','openWarPanel','openMuayBook','openSwordTree','openBladeBook','openSentinelBook','openOccultBook','openRebirth','openNpcGuide'])context[name]=()=>calls.push(name);
const open=vm.runInNewContext(`(${source.slice(fnStart,fnEnd)})`,context);
for(const [role,expected] of Object.entries({smith:'openSmith',market:'openEconomy',guild:'openGuild',party:'openParty',travel:'openMap',strategy:'openStrategicMap',guide:'openHelp'})){
  calls.length=0;open({role,name:'ผู้ให้บริการ'});assert.ok(elements.serviceNpcSpeech.textContent);assert.ok(elements.serviceNpcAction.textContent);
  elements.serviceNpcAction.onclick();assert.equal(calls[0],expected,`${role} opens its service`);
  if(role==='strategy'){const war=children.find(e=>e.textContent==='สงครามและการปกครองด่าน');assert.ok(war);war.onclick();assert.equal(calls.at(-1),'openWarPanel');}
  if(role==='guide'||role==='strategy'){const ask=children.find(e=>e.textContent==='สอบถามผู้ช่วยภาษาไทย');assert.ok(ask);ask.onclick();assert.equal(calls.at(-1),'openNpcGuide');}
}
for(const [path,expected] of Object.entries({muay_boran:'openMuayBook',phutthaisawan:'openSwordTree',blade:'openBladeBook',sentinel:'openSentinelBook',seer:'openOccultBook',mender:'openOccultBook'})){
  context.path=path;calls.length=0;open({role:'mentor',name:'ครูวิชา'});elements.serviceNpcAction.onclick();assert.equal(calls[0],expected,`${path} opens its class book`);
  const rebirth=children.find(e=>e.textContent==='เกิดใหม่และความชำนาญ');assert.ok(rebirth);rebirth.onclick();assert.equal(calls.at(-1),'openRebirth');
}
// City-market availability is authoritative; legacy/no-session UI keeps its normal market.
const cityMarketButton=()=>children.find(e=>e.textContent==='ตลาดประจำเมือง');
for(const room of [null,{state:{}},{state:{cityMarketSupported:false}}]){
  context.room=room;open({role:'market',name:'พ่อค้า'});assert.equal(cityMarketButton(),undefined,'unsupported room does not expose city market');
}
context.room={state:{cityMarketSupported:true}};calls.length=0;open({role:'market',name:'พ่อค้า'});
assert.ok(cityMarketButton(),'supported city market action exists');cityMarketButton().onclick();assert.equal(calls.at(-1),'openCityMarket');
context.activeMapId='unknown_city';open({role:'market',name:'พ่อค้า'});assert.equal(cityMarketButton(),undefined,'unknown city does not expose city market');
console.log('PASS: NPC dialogue buttons open the matching system and all six class books; city market respects room and city capabilities');
