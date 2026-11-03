const fs=require("node:fs"),vm=require("node:vm"),assert=require("node:assert/strict");
const source=fs.readFileSync("main.js","utf8");
for(const spec of [
  {name:"Sentinel",next:"syncBladeUI",branch:"control",id:"bash"},
  {name:"Blade",next:"syncOccultUI",branch:"edge",id:"hidden_edge"},
]){
  const start=source.indexOf("  function render"+spec.name+"Book("),end=source.indexOf("  function "+spec.next+"(",start);
  assert.ok(start>=0 && end>start,"book renderer must exist");
  const container={innerHTML:"",contains:()=>false,querySelectorAll:()=>[]},reset={};
  const book={learned:[spec.id],slots:[spec.id,null,null,null],practice:{},ranks:{[spec.id]:1}};
  const data={book,lessons:{[spec.id]:{name:"ทดสอบ",description:"ทดสอบ",branch:spec.branch,effect:"strike",level:1,requires:[],practice:{},power:1,stamina:10,cooldownMs:1000}},practiceLabels:{},points:13,rankLevels:[25,45,65,85,95],rankable:[spec.id]};
  const context={document:{activeElement:null},ownServerCharacter:()=>({level:25}),$:id=>id.endsWith("BookBody")?container:reset,room:{send(){}},window:{confirm:()=>false}};
  context[spec.name.toLowerCase()+"BookState"]=data;context[spec.name.toLowerCase()+"BookRenderKey"]="";
  vm.runInNewContext(source.slice(start,end)+"\nrender"+spec.name+"Book();",context);
  assert.match(container.innerHTML,/แต้มว่าง 11/);
  assert.match(container.innerHTML,/ขั้น 2\/6/);
  assert.match(container.innerHTML,/ขั้นถัดไป Lv\.45/);
  assert.match(container.innerHTML,new RegExp("data-"+spec.name.toLowerCase()+"-upgrade"));
}
{
  const start=source.indexOf("  function renderOccultBook("),end=source.indexOf("  let selectedMuaySkill",start);
  const container={innerHTML:"",contains:()=>false,querySelectorAll:()=>[]},dummy={};
  const lesson={name:"ทดสอบ",description:"ทดสอบ",path:"mender",effect:"pve_rice",level:25,requires:[],training:0,range:12,stamina:18,cooldownMs:6000};
  const data={path:"mender",points:13,book:{learned:{seer:[],mender:["mender_pve_rice"]},loadouts:{mender:["mender_pve_rice",null,null,null]},training:{mender:8},ranks:{mender_pve_rice:1},mastery:{mender:{}}},lessons:{mender_pve_rice:lesson},masteryLabels:{mender:{}},rankLevels:[25,45,65,85,95],rankable:["mender_pve_rice"]};
  const context={document:{activeElement:null},ownServerCharacter:()=>({level:25,pathId:"mender"}),$:id=>id==="occultBookBody"?container:dummy,occultBookState:data,occultBookRenderKey:"",window:{confirm:()=>false},room:{send(){}},closeDrawer(){},toggleFlight(){}};
  vm.runInNewContext(source.slice(start,end)+"\nrenderOccultBook();",context);
  assert.match(container.innerHTML,/แต้มว่าง 11/);assert.match(container.innerHTML,/data-occult-upgrade/);
}
{
  const start=source.indexOf("  function renderMuayBook("),end=source.indexOf("  function swordData(",start);
  const container={innerHTML:"",contains:()=>false,querySelectorAll:()=>[]},dummy={};
  const school={name:"ไชยา",level:1,strikes:0,blocks:0,description:""};
  const data={me:{level:25,muayBookData:"v"},book:{school:"chaiya",learned:["chaiya_elbow"],slots:["chaiya_elbow",null,null,null],training:{strikes:5,blocks:0},ranks:{chaiya_elbow:1},mastery:{chaiya:{technique:0,sequences:0}}},catalog:{schools:{chaiya:school},skills:{chaiya_elbow:{name:"ศอก",range:2,stamina:16,cooldownMs:5500}},lessons:{chaiya_elbow:{school:"chaiya",level:1,requires:[],training:{strikes:5,blocks:0},description:"ศอก"}},rankLevels:[25,45,65,85,95],rankable:["chaiya_elbow"]}};
  const context={document:{activeElement:null},muayBookData:()=>data,$:id=>id==="muayBookBody"?container:dummy,muayBookRenderKey:"",muayBookViewedSchool:"chaiya",muayMoveLabels:{},window:{confirm:()=>false},room:{send(){}}};
  vm.runInNewContext(source.slice(start,end)+"\nrenderMuayBook();",context);
  assert.match(container.innerHTML,/แต้มว่าง 11/);assert.match(container.innerHTML,/data-muay-upgrade/);
}
{
  const start=source.indexOf("  function renderSwordTree("),end=source.indexOf("  function ancestryHint(",start);
  const container={innerHTML:"",contains:()=>false,querySelectorAll:()=>[]},dummy={};
  const data={me:{level:25,alive:true,swordTreeData:"v"},tree:{school:"phutthaisawan",learned:["footwork"],ranks:{footwork:1},cooldowns:{},training:{strikes:0,blocks:0,finishes:0},loadouts:{phutthaisawan:["footwork",null,null]}},catalog:{schools:{phutthaisawan:{name:"ดาบ"}},nodes:{footwork:{name:"ก้าว",description:"ก้าว",school:"common",level:1,requires:[],effect:"step",power:1,range:2,stamina:15,cooldownMs:6000}},rankLevels:[25,45,65,85,95],rankable:["footwork"]}};
  const context={document:{activeElement:null},swordData:()=>data,$:id=>id==="swordTreeBody"?container:dummy,swordTreeViewedSchool:"phutthaisawan",swordTreeRenderKey:"",performance:{now:()=>0},swordComboUntil:0,swordCombo:0,window:{confirm:()=>false},room:{send(){}}};
  vm.runInNewContext(source.slice(start,end)+"\nrenderSwordTree();",context);
  assert.match(container.innerHTML,/แต้มวิชาคงเหลือ 11/);assert.match(container.innerHTML,/data-sword-upgrade/);
}
console.log("MONTRA skill rank book render passed");
