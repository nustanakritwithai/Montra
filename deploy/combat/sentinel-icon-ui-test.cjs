const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('main.js','utf8'),start=source.indexOf('  const SENTINEL_SKILL_ICONS='),end=source.indexOf('  // Stamina cost on a skill button',start);
assert.ok(start>=0&&end>start,'guardian icon renderer exists');
function element(tag){return {tag,className:'',dataset:{},attrs:{},listeners:{},children:[],classList:{add(){}},
  addEventListener(type,handler){(this.listeners[type]??=[]).push(handler)},
  setAttribute(k,v){this.attrs[k]=v},append(x){this.children.push(x)},replaceChildren(...nodes){this.children=nodes},
  querySelector(){return null},textContent:'',innerHTML:'',title:''};}
const context={document:{createElement:element},SG_GLYPH:{stun:'✸',guard:'⛨',counter:'↺',intercept:'⛨'}};
const render=vm.runInNewContext(`(()=>{${source.slice(start,end)};return arrangeFieldSlots})()`,context);
const ids=['shock','bulwark','riposte','protect'],effects=['stun','guard','counter','intercept'];
const skills=Object.fromEntries(ids.map((id,i)=>[id,{name:'ท่า '+id,effect:effects[i]}]));
const buttons=ids.map((id,i)=>{const b=element('button');b.firstChild={textContent:i===0?'ท่า shock 5 วิ':'ท่า '+id};b.onclick=()=>id;return b});
render({id:'sentinelHotbar',querySelectorAll:()=>buttons},ids,skills,()=>{});
const icons=buttons.map(button=>button.children[0].innerHTML);
assert.ok(icons.every(icon=>icon.includes('<svg')&&icon.includes('viewBox="0 0 48 48"')));
assert.equal(new Set(icons).size,4,'all four skill icons must differ');
buttons.forEach((button,i)=>{assert.equal(button.dataset.skillId,ids[i]);assert.match(button.attrs['aria-label'],new RegExp(ids[i]));assert.equal(button.onclick(),ids[i]);assert.equal((button.listeners.click || []).length,0,'hotbar preserves gameplay click and waits for authoritative acceptance before speech');});
assert.equal(buttons[0].children[0].children[0].textContent,'5','cooldown remains visible over the icon');
const other=element('button');other.firstChild={textContent:'ท่า guard'};
render({id:'swordHotbar',querySelectorAll:()=>[other]},['guard'],{guard:{name:'ท่า guard',effect:'guard'}},()=>{});
assert.equal(other.children[0].textContent,'⛨','other classes keep their existing icons');
console.log('PASS: four distinct guardian icons retain skill labels, cooldowns and actions');
