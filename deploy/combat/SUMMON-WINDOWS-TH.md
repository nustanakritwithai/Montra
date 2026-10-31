# MONTRA Alpha V0.1.8 — Server Summon NPC (Windows VPS)

**Game:** https://nustanakritwithai.github.io/Montra/  
**VPS:** Windows, `C:\Montra\online-server` (Colyseus 0.18 / Schema 5), port 4108  
**Public HTTPS/WSS:** `https://montra.157-85-96-139.sslip.io`

## ฟีเจอร์

- ผู้เล่นแต่ละคนสามารถ **เรียกวิญญาณผู้พิทักษ์ของตนเองได้ 1 ตัว** ผ่านปุ่ม `เรียกผี`
- Server สร้าง NPC และซิงก์ตำแหน่ง, ทิศทาง, เจ้าของ, พฤติกรรมให้ทุกคนในห้องเดียวกัน
- NPC ตามเจ้าของด้วยความเร็ว Server 3.8 หน่วย/วินาที; เคลื่อนที่และโจมตีทุก 50 ms (20 Hz)
- หากเจ้าของสู้มอนสเตอร์หรือ Free PK กับผู้เล่น NPC จะช่วยโจมตี; ถ้าเจ้าของถูกโจมตี NPC ป้องกันได้
- ระยะโจมตี NPC 1.8 หน่วย, Damage 8, Cooldown 1.5 วินาที (Server เท่านั้น)
- Server ปฏิเสธคำสั่งปลอมเจ้าของ, ตำแหน่ง, ชนิด NPC, ความเร็ว, HP และ Damage
- กด `เก็บผี` เพื่อเลิกอัญเชิญ; NPC หายเมื่อเจ้าของตายหรือออกจากห้อง
- ระบบเดิน, มอนสเตอร์, Free PK, HP, K/D, เกิดใหม่คงทำงานตามเดิม

**ข้อจำกัด Alpha:** 1 NPC ต่อ 1 session ต่อ room; ไม่มีการเซฟวิญญาณถาวร, เลือกชนิด NPC, เปลี่ยนทักษะ, อัปเกรด, ดาเมจใส่ NPC, pathfinding หลบกำแพง หรือระบบบัญชี ตอนนี้ NPC เป็นผู้พิทักษ์ต้นแบบเพียงชนิดเดียว

## 1. ติดตั้งโค้ด Server (ยังไม่รีสตาร์ต)

เปิด **PowerShell บน Windows VPS** แล้วรัน:

```powershell
New-Item -ItemType Directory -Force "C:\Montra\deploy" | Out-Null

Invoke-WebRequest `
  "https://raw.githubusercontent.com/nustanakritwithai/Montra/main/deploy/combat/install-windows.ps1" `
  -OutFile "C:\Montra\deploy\install-summon.ps1" -UseBasicParsing

powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File "C:\Montra\deploy\install-summon.ps1"

if ($LASTEXITCODE -ne 0) {
    throw "MONTRA Summon build failed: do not restart Node"
}
```

คาดหวัง:
```text
MONTRA SUMMON BUILD PASSED.
Backup: C:\Montra\online-server\backup-before-summon-...
Active Node server was NOT restarted.
```

Installer สำรอง Source, Build และ test scripts ใน MONTRA ก่อนเปลี่ยน แก้เฉพาะ `C:\Montra\online-server` เท่านั้น ไม่แก้ Caddy, Firewall, CityManager หรือบริการอื่น หาก Compile ไม่ผ่านจะพยายามคืนไฟล์เดิมอัตโนมัติ

## 2. รีสตาร์ตเฉพาะ MONTRA บน port 4108

ตรวจเจ้าของพอร์ต:

```powershell
Get-NetTCPConnection -LocalPort 4108 -State Listen -ErrorAction SilentlyContinue |
ForEach-Object {
    Get-CimInstance Win32_Process -Filter "ProcessId = $($_.OwningProcess)" |
      Select-Object ProcessId,Name,CommandLine
}
```

ถ้าเปิด `node .\build\index.js` ใน PowerShell ให้กด Ctrl+C ที่หน้าต่างนั้นก่อน ถ้าเป็น Windows Service ให้หยุดและเริ่มด้วยตัวจัดการ Service เดิม **อย่าเปิดสองโปรเซสทับกันและอย่าหยุด CityManager/Caddy**

เปิด MONTRA ใหม่หลังพอร์ตว่างแล้ว:

```powershell
cd C:\Montra\online-server
$env:NODE_ENV = "production"
$env:PORT = "4108"
node .\build\index.js
```

## 3. ทดสอบใน PowerShell อีกหน้าต่าง

```powershell
cd C:\Montra\online-server

Invoke-WebRequest "http://127.0.0.1:4108/hi" -UseBasicParsing

node .\montra-combat-smoke-test.mjs
if ($LASTEXITCODE -ne 0) { throw "PvE regression failed" }

node .\montra-s1-integration.mjs
if ($LASTEXITCODE -ne 0) { throw "S1 regression failed" }

node .\montra-free-pk-integration.mjs
if ($LASTEXITCODE -ne 0) { throw "Free PK regression failed" }

node .\montra-summon-integration.mjs
if ($LASTEXITCODE -ne 0) { throw "Summon regression failed" }

Write-Host "ALL MONTRA SUMMON TESTS PASSED" -ForegroundColor Green
```

ต้องเห็น `PASS: MONTRA Summon 4-player integration complete` และผลทดสอบอื่น ๆ ผ่านทั้งหมด

การทดสอบสร้างห้องชั่วคราว ไม่เข้าไปรบกวนห้องจริง แต่การรีสตาร์ต Node จะตัดการเชื่อมต่อผู้เล่นที่กำลังเล่นอยู่

## 4. ทดลองมือถือสองเครื่อง

เปิดเกมลิงก์เดิมให้ขึ้น `LIVE`, เครื่องหนึ่งกด `เรียกผี` ต้องเห็นวิญญาณใหม่ที่ผู้เล่นทั้งสองมองเห็นตรงกัน แล้วเดินให้วิญญาณตาม ทดสอบให้ช่วยตีผีหรือผู้เล่นที่กำลัง PK และกด `เก็บผี` ต้องหายจากทั้งสองเครื่อง

## 5. Rollback (หยุด MONTRA Node ก่อน)

ใช้ Backup path ที่ installer แสดง ถ้าต้องย้อนกลับไฟล์และ Build บน VPS:

```powershell
$base = "C:\Montra\online-server"
$backup = Get-ChildItem "$base\backup-before-summon-*" -Directory |
  Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (!$backup) { throw "No summon backup found" }

Copy-Item "$($backup.FullName)\src\rooms\MyRoom.ts" "$base\src\rooms\MyRoom.ts" -Force
Copy-Item "$($backup.FullName)\src\rooms\schema\MyRoomState.ts" "$base\src\rooms\schema\MyRoomState.ts" -Force

$rulesBackup = "$($backup.FullName)\src\rooms\GameRules.ts"
if (Test-Path $rulesBackup) {
  Copy-Item $rulesBackup "$base\src\rooms\GameRules.ts" -Force
} else {
  Remove-Item "$base\src\rooms\GameRules.ts" -Force -ErrorAction SilentlyContinue
}
if (!(Test-Path "$($backup.FullName)\build")) {
  throw "Backup compiled build not found. Do not delete build."
}
Remove-Item "$base\build" -Recurse -Force
Copy-Item "$($backup.FullName)\build" "$base\build" -Recurse
```

จากนั้นเปิด MONTRA Node กลับด้วยพอร์ต 4108 ตามข้อ 2 ปิดเฉพาะ MONTRA เท่านั้น
