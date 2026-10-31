# MONTRA — Monster RRT Navigation (Server Only)

Repo: https://github.com/nustanakritwithai/Montra  
RRT prototype: https://github.com/nustanakritwithai/RRT-Game-Lab/blob/main/multi_target_core.js  
Game: https://nustanakritwithai.github.io/Montra/

## ขอบเขตงาน: เปลี่ยนแค่การนำทางของมอนสเตอร์

ใช้ RRT จากต้นแบบ **RRT-Game-Lab** มาปรับแกนพิกัดเป็น X/Z ของ MONTRA Server เพื่อให้ผีเดินอ้อมกำแพงทดสอบ ไม่เดินชนผนังจนค้าง

- เปลี่ยนเฉพาะ `moveMonster()` และเพิ่ม `MonsterRRTNavigator` ที่จัดการเส้นทาง Waypoint
- เมื่อ `patrol`, `chase` หรือ `return` มอนสเตอร์ขอเส้นทางผ่าน RRT เหมือนกัน แต่ถ้าไม่มีสิ่งกีดขวางจะเดินตรงแบบเดิม
- RRT ทำงานบน Server เท่านั้น ไม่สร้างต้นไม้ RRT ในมือถือ ไม่ให้ผู้เล่นกำหนดตำแหน่งมอนสเตอร์
- ปล่อยให้วางแผนช้าหน่อย: จำกัด `1400 iterations` ต่อรอบ, `1300 ms` ระหว่างการวางแผนใหม่ และวางแผนใหม่เมื่อเป้าหมายขยับเกิน 1 หน่วย
- แม้ RRT วางแผนห่างกัน การเดินจริงยังถูกจำกัดด้วย Server Tick 20 Hz และความเร็วเดิน `RULES.monsterChaseSpeed` เดิม
- ตรวจการชนตลอดแนวเส้นทางด้วย Solid Wall + Monster Radius; หากหาเส้นทางไม่ได้ให้หยุดและลองใหม่ ไม่ใช้ทางลัดเดินทะลุกำแพง
- ไม่เปลี่ยนคำสั่ง Client, Colyseus Schema, กฎการโจมตี, HP, Free PK, Summon, ระบบปีน/ความสูง, คูลดาวน์, Aggro, Leash หรือความเร็วของมอนสเตอร์
- มอนสเตอร์ภาคพื้นยังไม่สามารถปีนกำแพงได้; RRT รุ่นนี้เป็นการเดินอ้อมกำแพงบนพื้น X/Z เท่านั้น

**ข้อจำกัด:** ยังใช้สิ่งกีดขวาง Server ที่มีจริงเพียง `watchwall-1`; บ้าน ต้นไม้ และของตกแต่งยังไม่ได้เป็น Collider ทั้งหมด และความฉลาดในการเลือกเป้าหมายยังคงแบบเดิม

## โค้ด

- `deploy/combat/MonsterRRT.ts` — pure RRT path planning + smoothing + waypoint cache
- `deploy/combat/MyRoom.ts` — เปลี่ยนเฉพาะ `moveMonster()` ให้เดินตาม waypoint, ล้างแผนเมื่อมอนสเตอร์ตาย/เกิดใหม่
- `deploy/combat/monster-rrt.test.ts` — ทดสอบเส้นทางตรง/อ้อมกำแพง/จุดหมายผิดพลาด/การตรวจชน และการเดินตามเส้นด้วยความเร็วเดิม
- `deploy/combat/monster-rrt-integration.mjs` — Colyseus จริง ทดสอบล่อมอนสเตอร์ให้ไล่ผ่านปลายกำแพง
- `.github/workflows/verify-combat.yml` — ตรวจ TypeScript และรันทดสอบ RRT + Regression PvE/PvP/Summon/Elevation

## ติดตั้ง Windows VPS (ไม่กระทบบริการอื่น)

คัดลอกลง Windows VPS PowerShell:

```powershell
New-Item -ItemType Directory "C:\Montra\deploy" -Force | Out-Null

Invoke-WebRequest `
  "https://raw.githubusercontent.com/nustanakritwithai/Montra/main/deploy/combat/install-windows.ps1" `
  -OutFile "C:\Montra\deploy\install-monster-rrt.ps1" -UseBasicParsing

powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File "C:\Montra\deploy\install-monster-rrt.ps1"

if ($LASTEXITCODE -ne 0) {
    throw "MONTRA Monster RRT Build failed. Do not restart Node."
}
```

ต้องเห็น `MONTRA MONSTER RRT BUILD PASSED.` และ `Backup: C:\Montra\online-server\backup-before-rrt-...`

Installer สำรองไฟล์ Source และ Build ก่อน จากนั้นดาวน์โหลดเฉพาะไฟล์ MONTRA จาก GitHub และคอมไพล์ หาก Build ล้มเหลวจะคืนไฟล์เดิม **ไม่รีสตาร์ต Node, ไม่แตะ Caddy, CityManager หรือ Windows Firewall**

### รีสตาร์ตเฉพาะ MONTRA

ใช้ `Ctrl+C` ในหน้าต่างที่รัน MONTRA Node เดิม หรือใช้ Service Manager หากตั้ง MONTRA เป็น Windows Service; อย่าหยุด Node ของ CityManager เมื่อพอร์ต 4108 ว่างแล้ว:

```powershell
cd C:\Montra\online-server
$env:NODE_ENV="production"
$env:PORT="4108"
node .\build\index.js
```

### ทดสอบ (PowerShell อีกหน้าต่าง)

```powershell
cd C:\Montra\online-server
node .\montra-monster-rrt-integration.mjs
if($LASTEXITCODE -ne 0){throw "Monster RRT test failed"}

node .\montra-s1-monster-ai.mjs
if($LASTEXITCODE -ne 0){throw "Existing monster combat regression failed"}

Write-Host "MONTRA MONSTER RRT TESTS PASSED" -ForegroundColor Green
```

การทดสอบสร้างห้อง Colyseus ชั่วคราว ไม่เข้าไปแก้ข้อมูลของผู้เล่น แต่การรีสตาร์ต Node จะทำให้คนที่ออนไลน์อยู่หลุด

## ย้อนกลับ (ถ้าจำเป็น)

ก่อนย้อนกลับ ให้หยุด **เฉพาะ MONTRA Node** และตรวจตำแหน่งโฟลเดอร์ Backup จาก Installer; สามารถใช้ตัวอย่าง:

```powershell
$base="C:\Montra\online-server"
$backup=Get-ChildItem "$base\backup-before-rrt-*" -Directory |
  Sort-Object LastWriteTime -Descending | Select-Object -First 1
if(!$backup){throw "Cannot locate MONTRA RRT backup"}

$original="$($backup.FullName)\src\rooms\MyRoom.ts"
if(!(Test-Path $original)){throw "Room backup missing"}
Copy-Item $original "$base\src\rooms\MyRoom.ts" -Force

$originalRRT="$($backup.FullName)\src\rooms\MonsterRRT.ts"
if(Test-Path $originalRRT) {
  Copy-Item $originalRRT "$base\src\rooms\MonsterRRT.ts" -Force
} else {
  Remove-Item "$base\src\rooms\MonsterRRT.ts" -Force -ErrorAction SilentlyContinue
}

$oldBuild="$($backup.FullName)\build"
if(!(Test-Path $oldBuild)){throw "Build backup missing — stop"}
Remove-Item "$base\build" -Recurse -Force
Copy-Item $oldBuild "$base\build" -Recurse
```

จากนั้นเปิด MONTRA Node รุ่นเดิมด้วย port 4108 ตามขั้นตอนข้างต้น

> ไม่ต้องแก้ GitHub Pages หรือหน้าเกม: เว็บเดิมจะเห็นการเดินอ้อมกำแพงของมอนสเตอร์ทันทีที่ VPS ใช้ Build ใหม่
