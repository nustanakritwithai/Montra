const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('main.js','utf8');
const start=source.indexOf('  function strategicWarLabel('),end=source.indexOf('  function updateAtlasWarTimes(',start);
assert.ok(start>=0 && end>start);
const label=vm.runInNewContext(source.slice(start,end)+'\nstrategicWarLabel');
assert.equal(label(null,1000),'รอข้อมูล');
assert.equal(label({phase:'open',phaseEndsAt:null},1000),'พร้อมเปิดศึก');
assert.equal(label({phase:'open',phaseEndsAt:null},1000,true),'พร้อมรบ');
assert.equal(label({phase:'battle',phaseEndsAt:301000},1000),'รบ 5:00');
assert.equal(label({phase:'protected',phaseEndsAt:28801000},1000),'คุ้มครอง 8:00:00');
assert.equal(label({phase:'protected',phaseEndsAt:28801000},1000,true),'พัก 8:00:00');
assert.equal(label({phase:'protected',phaseEndsAt:1000},1000),'กำลังอัปเดต');
{
  let accessible='';const button={dataset:{baseLabel:'ด่านจันทรา'},setAttribute:(_key,value)=>{accessible=value;}};
  const icon={dataset:{warSite:'moon_pass'},closest:()=>button,textContent:''};
  const detail={dataset:{warSite:'moon_pass'},closest:()=>null,textContent:''};
  const context={drawerActive:'strategy',cityMarkets:null,$:()=>null,territoryReceivedAt:1000,performance:{now:()=>2500},
    territoryState:{serverNow:10000,warTimes:{moon_pass:{phase:'protected',phaseEndsAt:18000}}},
    ui:{drawerBody:{querySelectorAll:()=>[icon,detail]}}};
  vm.runInNewContext(source.slice(start,source.indexOf('  function openStrategicMap(',end))+'\nupdateAtlasWarTimes();',context);
  assert.equal(icon.textContent,'พัก 0:07');assert.match(detail.textContent,/^คุ้มครอง 0:07 · เปิดตีได้ .* \(เวลาเครื่อง\)$/);
  assert.equal(accessible,'ด่านจันทรา · คุ้มครอง 0:07');
}
console.log('PASS war map countdown labels');
