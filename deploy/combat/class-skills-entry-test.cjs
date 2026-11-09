/** Source-level regressions supplement (never replace) real Chromium coverage. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {catalogs,books,points}=require('./class-skills-advanced-fixture.cjs');
const root=path.resolve(__dirname,'../..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
function slice(source,start,end){const a=source.indexOf(start),b=source.indexOf(end,a);assert(a>=0&&b>a,start);return source.slice(a,b);}
const classes=Object.keys(catalogs),kindFor={phutthaisawan:'sword',muay_boran:'muay',blade:'blade',sentinel:'sentinel',seer:'occult',mender:'occult'};
const journey=read('src/client/ui/041-character-hud-and-journey.js');
const nodes=new Map();
function element(id){
 if(!nodes.has(id))nodes.set(id,{hidden:true,innerHTML:'',textContent:'',style:{},dataset:{},clientWidth:350,scrollLeft:0,scrollTop:0,
  querySelector:selector=>selector==='.sg-wrap'?null:element(id+selector),querySelectorAll:()=>[],
  addEventListener(type,handler){this[type]=handler;},setAttribute(){},focus(){},contains:()=>false});
 return nodes.get(id);
}
const wire=[],ctx={mode:'live',localId:'fixture',room:{state:{},send:(command,payload)=>wire.push({command,payload})},
 me:null,ownServerCharacter:()=>ctx.me,$:element,document:{getElementById:element,activeElement:null},window:{confirm:()=>true},
 localStorage:{getItem:()=>null},gearGuides:null,drawerActive:null,bladeBookState:null,sentinelBookState:null,occultBookState:null,
 bladeBookRenderKey:'',sentinelBookRenderKey:'',occultBookRenderKey:'',bladeRequestAt:-10000,sentinelRequestAt:-10000,occultRequestAt:-10000,
 journeyOwner:'',journeyNotes:{},catalogKey:'',buildCatalog:null,performance:{now:()=>10000},toast(){},SFX(){},
 openDrawer(kind,title,html){ctx.drawerActive=kind;element('drawerBody').innerHTML=html;},closeDrawer(){ctx.drawerActive=null;},
 economyReady(){throw Error('No economy dependency allowed');}};
vm.createContext(ctx);
vm.runInContext(read('src/client/ui/048-class-books-and-hotbars.js')+read('src/client/ui/049-skill-graph-and-details.js')+
 slice(journey,'  function journeyNotesForPlayer(','  function refreshFieldPractice(')+
 slice(journey,'  function openFieldTraining(','  function tryFieldTechnique('),ctx);
function snapshot(pathId,level){
 ctx.me={pathId,level,alive:true,characterId:'fixture-'+pathId};
 ctx.room.state.swordTreeCatalog=JSON.stringify(catalogs.phutthaisawan);ctx.room.state.muayBookCatalog=JSON.stringify(catalogs.muay_boran);
 ctx.me.swordTreeData=JSON.stringify(books.phutthaisawan);ctx.me.muayBookData=JSON.stringify(books.muay_boran);
 for(const [id,key] of [['blade','bladeBookState'],['sentinel','sentinelBookState'],[pathId==='mender'?'mender':'seer','occultBookState']])ctx[key]={...structuredClone(catalogs[id]),path:id,book:structuredClone(books[id]),points:points[id][level]};
 ctx.syncClassSkillBookContext();wire.length=0;
 vm.runInContext('skillGraphKey="";for(const key of Object.keys(skillGraphSel))delete skillGraphSel[key];',ctx);
}
let checked=0;
for(const className of classes)for(const level of [1,10,25,26]){
 snapshot(className,level);
 ctx.openClassBookDrawer('fixtureCore','Core','<div></div>');
 assert.match(element('drawerBody').innerHTML,/id="classAdvancedBook"/);
 element('classAdvancedBook').onclick();assert.equal(ctx.drawerActive,'fieldSkills');
 const html=element('fieldSkillGraph').innerHTML,model=ctx.skillGraphModel(kindFor[className]);
 assert.equal(model.points,points[className][level]);
 const ownIds=Object.keys(catalogs[className].nodes||catalogs[className].lessons).filter(id=>!catalogs[className].lessons?.[id].path||catalogs[className].lessons[id].path===className);
 assert.deepEqual(JSON.parse(JSON.stringify(model.nodes.map(n=>n.id))).sort(),ownIds.sort());
 assert.equal((html.match(/data-sg-core=/g)||[]).length,4);
 assert.equal((html.match(/data-sg-node=/g)||[]).length,model.nodes.length);
 assert.equal((html.match(/data-sg-prereq=/g)||[]).length,model.nodes.reduce((sum,n)=>sum+n.requires.filter(id=>ownIds.includes(id)).length,0));
 assert.equal((html.match(/data-sg-group-edge=/g)||[]).length,model.nodes.filter(n=>!n.requires.some(id=>ownIds.includes(id))).length);
 assert.match(html,/ไม่ใช่เงื่อนไขปลดล็อก/);assert(!/NaN|undefined/.test(html));
 assert.equal(model.nodes.some(n=>n.checks.some(c=>!c.ok)),true,'later lessons remain locked');
 const core=ctx.coreSkillGraphData();assert.equal(core.available,catalogs[className].corePointLevels.filter(lv=>level>=lv).length);
 const blocked=model.nodes.find(n=>n.level>level);
 vm.runInContext('skillGraphSel['+JSON.stringify(kindFor[className])+']='+JSON.stringify(blocked.id)+';skillGraphKey="";',ctx);
 ctx.renderSkillGraph(kindFor[className],element('fieldSkillGraph'));
 assert.match(element('fieldSkillGraph').innerHTML,new RegExp('data-sg-learn="'+blocked.id+'" disabled'));
 // Navigation never spends points or sends any learning/equipment command.
 assert(wire.every(send=>send.command.endsWith('_book_get')));
 checked++;
}
for(const className of classes){
 snapshot(className,1);ctx.openFieldDeepTraining();
 const kind=kindFor[className],model=ctx.skillGraphModel(kind),ready=model.nodes.find(n=>n.checks.every(c=>c.ok));assert(ready);
 vm.runInContext('skillGraphSel['+JSON.stringify(kind)+']='+JSON.stringify(ready.id)+';skillGraphKey="";',ctx);
 ctx.renderSkillGraph(kind,element('fieldSkillGraph'));
 const stale=element('fieldSkillGraph[data-sg-learn]').click;
 snapshot(classes[(classes.indexOf(className)+1)%classes.length],1);
 assert.equal(ctx.drawerActive,null);stale({currentTarget:{dataset:{sgLearn:ready.id}}});assert.equal(wire.length,0,'stale learning event ignored');
 checked++;
}
const {fixture}=require('./class-skills-entry-browser-test.cjs');new vm.Script(fixture().script);
console.log('PASS combined skill tree source: '+checked+' class/level and stale-event cases; full browser fixture compiles');
