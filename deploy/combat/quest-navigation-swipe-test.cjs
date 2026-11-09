/** Manual dash intent must stop quest movement before capability/rejection checks. */
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { fixtureScript } = require('./quest-navigation-test.cjs');
function swipeFixtureScript() {
  const root = path.resolve(__dirname, '../..');
  const source = fs.readFileSync(path.join(root, 'src/client/input/045-pointer-touch-and-dash.js'), 'utf8');
  const start = source.indexOf('  function dashDirectionFromSwipe('), end = source.indexOf('  let drawerActive', start);
  assert(start >= 0 && end > start, 'production swipe fixture boundaries');
  const network = fs.readFileSync(path.join(root, 'src/client/network/044-state-sync-and-connection.js'), 'utf8');
  const rejection = network.split('\n').find(line => line.includes('if(questNavigation && (questNavigation.warp ||'));
  assert(rejection, 'production command rejection guard');
  return `const camera={alpha:0};room.state.dashAvailable=true;
    ${source.slice(start, end)}
    fixture.swipe=requestSwipeDash;
    fixture.dashAvailable=value=>{room.state.dashAvailable=value;};
    fixture.reject=info=>{${rejection}};
    fixture.failDash=()=>{room.send=(type,data)=>{if(type==='dash')throw new Error('fixture dash send failure');wire.push({type,data});};};
  `;
}
function swipeFixture() {
  let now = 1000;
  const handlers = { controls: {}, window: {} };
  const element = { setAttribute(){}, classList:{contains:()=>false} };
  const context = vm.createContext({ console:{...console,error(){}}, performance:{now:()=>now},
    document:{hidden:false,getElementById:id=>id==='quest'?element:null,querySelector:()=>({addEventListener:(name,fn)=>{handlers.controls[name]=fn;}})},
    window:{addEventListener:(name,fn)=>{handlers.window[name]=fn;}}
  });
  vm.runInContext(fixtureScript()+swipeFixtureScript(), context);
  const f = context.fixture;
  f.event = (target,type,data={}) => handlers[target][type]({pointerType:'touch',button:0,isPrimary:true,pointerId:1,clientX:100,clientY:150,...data});
  f.elapsed = milliseconds => { now += milliseconds; };
  f.gesture = (dx=0,dy=-100,elapsed=100) => { f.event('controls','pointerdown');f.elapsed(elapsed);f.event('window','pointerup',{clientX:100+dx,clientY:150+dy}); };
  return f;
}
function run() {
  const plain = x => JSON.parse(JSON.stringify(x));
  for (const reason of [null,'dash_cooldown','insufficient_stamina','dismount_required','climbing','not_alive']) {
    const f=swipeFixture();f.start();f.gesture();
    assert(!f.active(), 'valid swipe cancels before server response: '+reason);
    assert.deepEqual(plain(f.wire),[
      {type:'move',data:{x:4,z:0}}, {type:'move',data:{x:0,z:0}}, {type:'dash',data:{dx:-1,dz:0}}
    ], 'stop precedes dash');
    if(reason)f.reject({reason});
    const count=f.wire.length;f.change({x:4,z:0,combatState:'idle'});f.tick(1500);f.tick(2000);
    assert.equal(f.wire.length,count,'brief or rejected dash never resumes pursuit');
  }
  for(const failure of ['unavailable','send failure']) {
    const f=swipeFixture();f.start();if(failure==='unavailable')f.dashAvailable(false);else f.failDash();
    f.gesture();assert(!f.active(),failure+' stops navigation');
    assert.deepEqual(plain(f.wire.at(-1)),{type:'move',data:{x:0,z:0}},failure+' stops outstanding waypoint');
    assert.equal(f.wire.length,2);assert(f.notices.length);
  }
  for(const [name,gesture] of [
    ['short',f=>f.gesture(0,-49)],['slow',f=>f.gesture(0,-100,851)],
    ['zero vector',f=>f.swipe(0,0)],['nonfinite vector',f=>f.swipe(NaN,100)],
    ['right mouse',f=>{f.event('controls','pointerdown',{pointerType:'mouse',button:2});f.event('window','pointerup',{clientY:50});}],
    ['cancelled',f=>{f.event('controls','pointerdown');f.event('window','pointercancel');f.event('window','pointerup',{clientY:50});}],
    ['other pointer',f=>{f.event('controls','pointerdown');f.event('window','pointerup',{pointerId:2,clientY:50});}],
    ['second finger',f=>{f.event('controls','pointerdown');f.event('window','pointerdown',{pointerId:2,isPrimary:false});f.event('window','pointerup',{clientY:50});}],
    ['nonprimary start',f=>{f.event('controls','pointerdown',{isPrimary:false});f.event('window','pointerup',{clientY:50});}]
  ]) {
    const f=swipeFixture();f.start();gesture(f);assert(f.active(),name+' is not manual dash intent');assert.equal(f.wire.length,1,name+' emits neither stop nor dash');
  }
  const boundary=swipeFixture();boundary.start();boundary.gesture(50,0,850);assert(!boundary.active(),'valid exact gesture thresholds');
  let suppressed=false;boundary.event('controls','click',{preventDefault(){suppressed=true;},stopImmediatePropagation(){}});assert(suppressed,'dash suppresses accidental skill click');
  const idle=swipeFixture();idle.gesture();assert.equal(idle.wire.length,1,'manual dash without navigation emits no extra stop');assert.equal(idle.wire[0].type,'dash');
  const planning=swipeFixture();planning.world({fixture:{id:'fixture',bounds:{minX:-200,maxX:200,minZ:-200,maxZ:200},walls:[{x:20,z:-60,width:5,length:120}],obstacles:[],portals:[]}});
  planning.guide({title:'Long route',to:{x:100,z:0}});planning.start();assert(planning.state()?.planner);planning.gesture();assert(!planning.active());
  const count=planning.wire.length;for(let i=0;i<100;i++)planning.tick(2000+i*16);assert.equal(planning.wire.length,count,'swipe cannot leave a delayed planner running');
  console.log('PASS quest swipe takeover: stop-before-dash, rejected/unsupported/failed/brief dash, invalid gestures, threshold boundaries, click suppression and pending planner cancellation');
}
if(require.main===module)run();
module.exports={swipeFixtureScript,swipeFixture};
