/** Exercise production renderer with authoritative state and deterministic projection. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'../..'),source=fs.readFileSync(path.join(root,'main.js'),'utf8'),css=fs.readFileSync(path.join(root,'styles.css'),'utf8');
const start=source.indexOf('  const monsterLabelLayer ='),end=source.indexOf('  // ---- Skill VFX:',start);assert(start>0&&end>start);
class Vector3{constructor(x=0,y=0,z=0){this.set(x,y,z);}set(x,y,z){Object.assign(this,{x,y,z});}static ProjectToRef(p,m,t,v,out){out.set(200+p.x*10,300-p.y*10,Vector3.depth??.5);}}
const element=()=>({children:[],style:{},_text:'',get textContent(){return this.children.length?this.children.map(e=>e.textContent).join(''):this._text;},set textContent(value){this._text=value;},append(el){this.children.push(el);},setAttribute(){}}),game=element();
const mesh=(x=0,z=0)=>({position:{x,y:1,z},scaling:{y:1},isEnabled:()=>true,isDisposed:()=>false,metadata:{ghost:{tall:2,design:{scale:1}}}});
const states=new Map(),meshes=new Map();
const c={document:{createElement:element,getElementById:()=>game},B:{Vector3,Matrix:{IdentityReadOnly:{}}},getLocalAvatar:()=>({x:0,z:0}),mode:'live',activeMapId:'forest',room:{state:{monsters:states}},forestMonsters:meshes,monsterName:s=>s.displayName,MONSTER_ID:'possessed-1',selectedForestTarget:null,engine:{getRenderingCanvas:()=>({getBoundingClientRect:()=>({width:400,height:600})}),getRenderWidth:()=>400,getRenderHeight:()=>600},camera:{viewport:{toGlobal:()=>({})}},scene:{getTransformMatrix:()=>({})},villageGhost:mesh(),demoMonsterHp:100};
c.fieldPointVisible=point=>Math.hypot(point.x,point.z)<30;
vm.createContext(c);vm.runInContext(source.slice(start,end),c);
const labels=()=>game.children[0].children.filter(e=>!e.hidden);
const add=(id,x,name='ผีกระสือ',level=12,mapId='forest')=>{states.set(id,{displayName:name,level,mapId,alive:true});meshes.set(id,mesh(x));};
add('one',0);c.updateMonsterLabels();assert.equal(labels()[0].textContent,'ผีกระสือ · Lv 12');assert.equal(labels()[0].style.top,'276.5px');
states.get('one').level=15;c.updateMonsterLabels();assert.equal(labels()[0].textContent,'ผีกระสือ · Lv 15');
states.get('one').alive=false;c.updateMonsterLabels();assert.equal(labels().length,0);states.get('one').alive=true;
meshes.get('one').metadata.ghost.deathAt=1;c.updateMonsterLabels();assert.equal(labels().length,0);meshes.get('one').metadata.ghost.deathAt=0;
add('overlap',1,'ผีปอบ',8);c.selectedForestTarget='overlap';c.updateMonsterLabels();assert.equal(labels().length,1);assert.equal(labels()[0].textContent,'ผีปอบ · Lv 8');
c.activeMapId='other';c.updateMonsterLabels();assert.equal(labels().length,0);c.activeMapId='forest';
states.clear();meshes.clear();add('invalid',0);states.get('invalid').level=undefined;c.updateMonsterLabels();assert.equal(labels().length,0);
states.clear();meshes.clear();add('far',30);c.updateMonsterLabels();assert.equal(labels().length,0);
states.clear();meshes.clear();add('safe',0,'<img src=x onerror=alert(1)>',4);c.updateMonsterLabels();assert.equal(labels()[0].textContent,'<img src=x onerror=alert(1)> · Lv 4');assert.equal(labels()[0].children[1].textContent,' · Lv 4');
assert.match(css,/monster-label > span:last-child[^}]*flex-shrink: 0/);assert.match(css,/monster-label-name[^}]*text-overflow: ellipsis/);
states.clear();meshes.clear();add('left',-13);add('right',13);c.updateMonsterLabels();assert.equal(labels().length,0,'edge labels hidden rather than clipped');
states.clear();meshes.clear();add('first',-7,'long name',2);add('second',7,'other long name',3);c.updateMonsterLabels();assert.equal(labels().length,1,'150px labels cannot overlap');
Vector3.depth=-1;c.updateMonsterLabels();assert.equal(labels().length,0);Vector3.depth=2;c.updateMonsterLabels();assert.equal(labels().length,0);Vector3.depth=.5;
c.mode='demo';c.activeMapId='ritual_village';c.updateMonsterLabels();assert.equal(labels()[0].textContent,'ผีเข้าสิง · ตัวทดสอบ · Lv 1');c.demoMonsterHp=0;c.updateMonsterLabels();assert.equal(labels().length,0);
assert.match(css,/\.monster-label-layer[^}]*pointer-events: none/);assert.match(css,/\.monster-label\[hidden\] \{ display: none/);assert.match(source,/used >= 24/);assert.match(source,/updateTargetRing\(now\); updateMonsterLabels\(\)/);
console.log('PASS monster nameplates: authoritative levels, death, maps, overlap, edges, safe text, DEMO, noninteractive styles');
