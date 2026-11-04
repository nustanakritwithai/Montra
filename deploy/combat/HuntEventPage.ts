/** A read-only page. All values are assigned with textContent. */
export const HUNT_EVENT_PAGE=`<!doctype html>
<html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>เหตุการณ์ล่า · มนตรา</title><style>
:root{color-scheme:dark;font-family:system-ui,sans-serif;background:#111812;color:#f0e7c8}body{max-width:640px;margin:auto;padding:24px}main{background:#1c2920;border:1px solid #536f52;border-radius:16px;padding:24px}h1{font-size:1.5rem;margin:0 0 8px}p{line-height:1.6}small{color:#b8c8ae}progress{width:100%;height:1.2rem;accent-color:#dbbb68}.status{font-size:1.2rem;color:#f0d07c}#error{color:#ffb5a8}a{color:#c7dfb5}</style></head>
<body><main><h1>เหตุการณ์ล่าในมนตรา</h1><small>อัปเดตทุก 5 วินาที · เวลาและเป้าหมายตามเซิร์ฟเวอร์</small>
<p id="status" class="status" role="status">กำลังโหลด…</p><p id="story"></p><p id="details"></p><progress id="progress" value="0" max="1" hidden></progress><p id="time"></p><small id="source"></small><p id="error" role="alert"></p></main>
<script>
let state=null,received=0;const $=id=>document.getElementById(id);
function render(){if(!state)return;const now=state.serverNow+(Date.now()-received),e=state.event;$('progress').hidden=!e;
if(!e){$('status').textContent=state.state==='storage_unavailable'?'ระบบบันทึกไม่พร้อม':state.state==='disabled'?'ระบบเหตุการณ์ปิดอยู่':state.planning?'กำลังเลือกเหตุการณ์':'ยังไม่มีเหตุการณ์';$('story').textContent='';$('details').textContent='';$('source').textContent='';$('time').textContent=state.state==='disabled'?'':state.nextAt>now?'รอบถัดไปอีกประมาณ '+Math.ceil((state.nextAt-now)/60000)+' นาที':'รอผู้เล่นในพื้นที่ล่า';return;}
const complete=e.kills>=e.goal,rate=(e.kind==='strong_hunt'?20:e.kind==='normal_hunt'?15:10)+(complete?5:0),target=e.kind==='strong_hunt'?'มอนสเตอร์แข็งแกร่งและชั้นยอด':e.kind==='normal_hunt'?'มอนสเตอร์ทั่วไป':'มอนสเตอร์';
$('status').textContent='กำลังเกิดเหตุการณ์ที่ '+e.mapName;$('story').textContent=e.story;$('details').textContent='เป้าหมายร่วม '+e.kills+'/'+e.goal+' · EXP '+target+' +'+rate+'% ยกเว้นบอส';$('progress').max=e.goal;$('progress').value=e.kills;
const seconds=Math.max(0,Math.ceil((e.endsAt-now)/1000));$('time').textContent='เหลือ '+Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0')+(complete?' · เป้าหมายสำเร็จแล้ว':' · ครบเป้าหมายเพิ่มอีก 5%');$('source').textContent=e.source==='typhoon'?'ผู้เลือกเหตุการณ์: Typhoon':'ผู้เลือกเหตุการณ์: ระบบสำรอง';}
async function refresh(){try{const r=await fetch('/api/hunt-event',{cache:'no-store'});if(!r.ok)throw Error();state=await r.json();received=Date.now();$('error').textContent=state.state==='storage_unavailable'?'บันทึกความคืบหน้าไม่ได้ โปรดแจ้งผู้ดูแล':'';render();}catch{$('error').textContent='เชื่อมต่อเซิร์ฟเวอร์ไม่ได้';}}
refresh();setInterval(refresh,5000);setInterval(render,1000);
</script></body></html>`;
