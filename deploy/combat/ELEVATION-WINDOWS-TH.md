# MONTRA Alpha V0.1.9 — ความสูง ปีนกำแพง และยิงอาคมจากที่สูง

**เกม:** https://nustanakritwithai.github.io/Montra/  
**Windows VPS:** `C:\Montra\online-server` — Colyseus 0.18 / Schema 5, port `4108`  
**Public HTTPS/WSS:** `https://montra.157-85-96-139.sslip.io`

## สิ่งที่เพิ่ม

### โครงสร้างโลก 3D (Server Authoritative)
- กำแพงทดสอบ `watchwall-1` สูง 4 หน่วย ยาว 8 หน่วย ตำแหน่ง x=8,z=4
- บันไดบนฝั่งตะวันตก x=6.1,z=2.5 ขึ้นไปยัง x=8,z=2.5 ที่ระดับสูง y=4
- `state.fortification` ซิงก์ขนาดกำแพงและบันไดให้ทุกเครื่อง
- Server เป็นผู้เปลี่ยน `player.y` เท่านั้น ผู้เล่นไม่สามารถส่งค่าความสูงเพื่อวาร์ปได้
- `climb {structureId:"watchwall-1",direction:"up"|"down"}` ต้องอยู่ใกล้บันไดและอยู่ชั้นที่ถูกต้อง
- การปีนจำลองตามจังหวะ Server 20 Hz ไม่ขึ้นกับ FPS มือถือ
- ชั้นบนเดินเฉพาะพื้นที่ยอดกำแพง ห้ามแตะพื้นด้านล่างเพื่อวาร์ปลง
- เดินบนพื้นชนกำแพงและถูกบล็อก ไม่ทะลุตัวผนัง

### การต่อสู้ 3D
- `shoot {targetId:<server monsterId/player sessionId>}`: ยิงอาคมระยะไกลแบบเจาะจงเป้าหมาย
- Server คำนวณตำแหน่งปากยิงจากความสูงจริง, ระยะยิง 3D สูงสุด 15 หน่วย, Damage 10, Cooldown 1.2 วินาที
- หากแนวกระสุนตัดกล่องชนของกำแพง จะถูกปฏิเสธเป็น `shot_blocked` และไม่ลด HP
- ผู้เล่นที่ขึ้นกำแพงสามารถยิงลงด้านล่างผ่านยอดกำแพงได้เมื่อแนวกระสุนโล่ง
- Melee PvE / Free PK / การโจมตีมอนสเตอร์ตรวจระยะสามมิติด้วย เพื่อไม่ให้ตีคนที่อยู่บนกำแพงจากพื้น
- มอนสเตอร์ภาคพื้นไม่ปีนกำแพง; วิญญาณ Summon ลอยตามความสูงของเจ้าของได้
- การต่อสู้จากยิงอาคมยังใช้ระบบ HP, K/D, Monster AI, Respawn และ Summon เดิม
- ใช้การยิงอาคมทดลอง (ไม่มีระบบกระสุน/อาวุธถาวรในขั้นนี้)

### การควบคุมบนมือถือ
- **แตะบันไดหรือกำแพง** หรือกด **ปีน**: เดินไปบันไดก่อน แล้วปีนขึ้นโดย Server ตรวจสอบ
- บนยอดกำแพง กด **ลงกำแพง** เพื่อกลับไปทางบันได
- กด **ยิงอาคม** เพื่อเข้าสู่โหมดเล็ง แล้วแตะตัวผู้เล่นหรือมอนสเตอร์เพื่อยิง
- กด **ยิงอาคม** อีกครั้งเพื่อกลับสู่โหมดประชิด
- แอนิเมชันเส้นพลังยิงและกล้องยกตามความสูงเป็นงานแสดงผลของ Client เท่านั้น

**ข้อจำกัด Alpha:** ยังไม่มี Collision ของทุกบ้าน/ต้นไม้, ระบบ NavMesh, Physics Jumping, กระสุนแบบเดินทางจริง, คำนวณแรงโน้มถ่วง หรืออาวุธหลายแบบ โลก 3D รุ่นนี้มีโครงสร้างกำแพงเพียงจุดเดียวที่มีฟิสิกส์ Server ครบ

## ขั้นที่ 1 — ติดตั้งแบบมี Backup (ยังไม่หยุด Server)

บน Windows VPS เปิด PowerShell:

```powershell
New-Item -ItemType Directory -Force "C:\Montra\deploy" | Out-Null

Invoke-WebRequest `
  "https://raw.githubusercontent.com/nustanakritwithai/Montra/main/deploy/combat/install-windows.ps1" `
  -OutFile "C:\Montra\deploy\install-elevation.ps1" -UseBasicParsing

powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File "C:\Montra\deploy\install-elevation.ps1"

if ($LASTEXITCODE -ne 0) { throw "MONTRA Elevation build failed — do not restart Node" }
```

ต้องเห็น **`MONTRA ELEVATION BUILD PASSED.`** พร้อม Backup path ที่มีคำนำหน้า `backup-before-elevation-`

ตัวติดตั้งสำรองไฟล์เดิมและโฟลเดอร์ `build`, ดาวน์โหลด `HeightRules.ts`, โค้ด Room, Schema และชุดทดสอบ แล้ว Build ก่อนเปิดใช้จริง ถ้า Build ล้มเหลวจะคืนโค้ดและ compiled build ที่สำรองไว้

**ไม่เปลี่ยน Caddy, Firewall, CityManager, Port หรือบริการอื่นบน VPS**

## ขั้นที่ 2 — รีสตาร์ตเฉพาะ MONTRA Node.js

ตรวจพอร์ตและโปรเซส MONTRA:

```powershell
Get-NetTCPConnection -LocalPort 4108 -State Listen -ErrorAction SilentlyContinue |
ForEach-Object {
  Get-CimInstance Win32_Process -Filter "ProcessId = $($_.OwningProcess)" |
    Select-Object ProcessId,Name,CommandLine
}
```

ถ้าเปิด `node .\build\index.js` ในหน้าต่าง PowerShell ให้กด `Ctrl+C` ที่หน้าต่างนั้นก่อน หากระบบรันภายใต้ Windows Service ให้รีสตาร์ตเฉพาะ Service ที่ดูแล MONTRA

หลังโปรแกรมเก่าหยุดและพอร์ต 4108 ว่างแล้ว:

```powershell
cd C:\Montra\online-server
$env:NODE_ENV="production"
$env:PORT="4108"
node .\build\index.js
```

ปล่อยหน้าต่าง MONTRA นี้ทำงานอยู่

## ขั้นที่ 3 — ทดสอบด้วย Client 4 คน (PowerShell อีกหน้าต่าง)

```powershell
cd C:\Montra\online-server

Invoke-WebRequest "http://127.0.0.1:4108/hi" -UseBasicParsing

$tests=@(
  "montra-combat-smoke-test.mjs",
  "montra-s1-integration.mjs",
  "montra-free-pk-integration.mjs",
  "montra-summon-integration.mjs",
  "montra-elevation-integration.mjs"
)

foreach($test in $tests) {
  Write-Host "TESTING $test" -ForegroundColor Cyan
  node ".\$test"
  if($LASTEXITCODE -ne 0){ throw "FAILED: $test" }
}
Write-Host "ALL MONTRA ELEVATION TESTS PASSED" -ForegroundColor Green
```

ชุด `elevation-integration.mjs` ทดสอบ:
- ผู้เล่น 4 คนเห็นกำแพงและตำแหน่งความสูงจาก Server ตรงกัน
- ปฏิเสธคำสั่งปลอม y และปีนจากระยะไกล
- เดินวนปลายกำแพงจากพื้นได้และยิงทะลุผนังไม่ได้
- เดินเข้าบันได ปีนขึ้น y=4 และเดินบนยอดกำแพงได้
- ป้องกันการตีประชิดข้ามชั้น แต่ยิงอาคมจากข้างบนไปยังเป้าหมายจริงได้
- ยิงมอนสเตอร์จากกำแพง และมีวิญญาณ Summon ที่ปรับความสูงตามเจ้าของ
- ปีนลงกลับระดับพื้นโดย Server ควบคุม

## ขั้นที่ 4 — ทดลองจากมือถือ

เปิด https://nustanakritwithai.github.io/Montra/ สองเครื่องให้แสดง `LIVE` แล้วแตะบันไดที่กำแพงทดสอบด้านขวาของหมู่บ้าน หรือกด `ปีน` เพื่อให้ตัวละครเดินไปบันได จากนั้นปีนขึ้นยอด เมื่อถึงด้านบนกด `ยิงอาคม` แล้วแตะผู้เล่นหรือผีเพื่อยิง ขณะอยู่บนกำแพง กล้องจะยกตามตัวละคร

หากมีข้อผิดพลาดให้ส่งผลจาก Test และ Log จาก MONTRA Node เท่านั้น อย่าเปลี่ยน Caddy หรือ Port

## Rollback (เฉพาะ MONTRA)

หยุด MONTRA Node ก่อน แล้วใช้ Backup path จากตัวติดตั้งล่าสุด ตรวจ `build` ก่อนลบอะไร:

```powershell
$base = "C:\Montra\online-server"
$backup = Get-ChildItem "$base\backup-before-elevation-*" -Directory |
  Sort-Object LastWriteTime -Descending | Select-Object -First 1
if(!$backup){throw "MONTRA Elevation backup not found"}

Copy-Item "$($backup.FullName)\src\rooms\MyRoom.ts" "$base\src\rooms\MyRoom.ts" -Force
Copy-Item "$($backup.FullName)\src\rooms\schema\MyRoomState.ts" "$base\src\rooms\schema\MyRoomState.ts" -Force

foreach($file in @("GameRules.ts","HeightRules.ts")){
  $old=Join-Path $backup.FullName "src\rooms\$file"
  $dest=Join-Path $base "src\rooms\$file"
  if(Test-Path $old){Copy-Item $old $dest -Force}
  else{Remove-Item $dest -Force -ErrorAction SilentlyContinue}
}
$oldBuild=Join-Path $backup.FullName "build"
if(!(Test-Path $oldBuild)){throw "Backed-up build not found. Stop."}
Remove-Item (Join-Path $base "build") -Recurse -Force
Copy-Item $oldBuild (Join-Path $base "build") -Recurse
```

เปิด MONTRA Node รุ่นก่อนกลับด้วยพอร์ตเดิม 4108 เมื่อย้อนกลับแล้ว Client ใหม่ยังเชื่อมต่อได้ แต่ฟีเจอร์ปีนและยิงจะถูกปิดจนกว่าจะติดตั้ง Server รุ่นใหม่อีกครั้ง
