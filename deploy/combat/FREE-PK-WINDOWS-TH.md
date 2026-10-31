# MONTRA Online Alpha V0.1.7 — Free PK (Windows VPS)

**เกม:** https://nustanakritwithai.github.io/Montra/

**รูปแบบ:** Free PK — ผู้เล่นแตะผู้เล่นคนอื่นแล้วโจมตีทันที ไม่ต้องส่งคำท้า/รับคำท้า ใช้ห้อง Colyseus `my_room` เดิม 4 ผู้เล่น/ห้อง

**Server:** `C:\Montra\online-server` (Colyseus 0.18, Schema 5), port `4108`

**Public WSS:** `https://montra.157-85-96-139.sslip.io` ผ่าน Caddy ที่ตั้งไว้เดิม

## กติกาของ Free PK รุ่นทดสอบ

- แตะตัวคนอื่น → Client ส่ง `attack: {targetId: <server sessionId>}`
- Server ตรวจว่าผู้เล่นเป้าหมายยังอยู่ในห้องเดียวกัน ไม่ใช่ตัวเอง และยังมีชีวิต
- ถ้าอยู่นอกระยะ Server ให้ตัวละครเดินตามเข้าใกล้ด้วยความเร็ว 3 หน่วย/วินาที
- ระยะ PK 2.8 หน่วย ความเสียหาย 12 HP/ครั้ง คูลดาวน์ 1 วินาที; ผู้เล่นเริ่มที่ HP 100
- Server ซิงก์ HP, ทิศทาง, Kills/Deaths (นับเฉพาะในห้อง ยังไม่ถาวร), การตาย และการเกิดใหม่หลัง 4 วินาที
- แตะพื้นเพื่อยกเลิกการไล่โจมตี ผู้เล่นอื่นเห็นผลตรงกัน
- มอนสเตอร์เดิมยังทำงาน ไม่บังคับให้ผู้เล่นเข้าสู่โหมดประลอง
- **ไม่มีเขตปลอดภัยใน Alpha นี้** และผู้เล่นอาจถูกโจมตีได้ทันทีเมื่อเข้าเกม ไม่มีระบบของตกหรือโอนเงินเมื่อ PK

## 1. ติดตั้ง Server จาก GitHub (ไม่หยุดบริการ)

เปิด PowerShell บน Windows VPS แล้วคัดลอกทั้งหมด:

```powershell
New-Item -ItemType Directory -Force "C:\Montra\deploy" | Out-Null

Invoke-WebRequest `
  "https://raw.githubusercontent.com/nustanakritwithai/Montra/main/deploy/combat/install-windows.ps1" `
  -OutFile "C:\Montra\deploy\install-free-pk.ps1" -UseBasicParsing

powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File "C:\Montra\deploy\install-free-pk.ps1"

if ($LASTEXITCODE -ne 0) {
  throw "Free PK installation failed — do not restart Node.js"
}
```

ต้องได้ **`MONTRA S1 + FREE PK BUILD PASSED.`** พร้อมที่อยู่โฟลเดอร์สำรอง `backup-before-s1-...`

ตัวติดตั้งอ่านเขียนเฉพาะโปรเจ็กต์ MONTRA โดยสำรอง TypeScript เดิม, compiled build และ test scripts ก่อนแก้ หาก Build ไม่ผ่าน จะพยายามคืนของเดิมอัตโนมัติ ตัวติดตั้งไม่หยุด Node, ไม่แก้ Caddy และไม่ยุ่งกับ CityManager

## 2. รีสตาร์ตเฉพาะ MONTRA Node.js

ตรวจเจ้าของพอร์ต:

```powershell
Get-NetTCPConnection -LocalPort 4108 -State Listen -ErrorAction SilentlyContinue |
ForEach-Object {
  Get-CimInstance Win32_Process -Filter "ProcessId = $($_.OwningProcess)" |
    Select-Object ProcessId,Name,CommandLine
}
```

ถ้า MONTRA รันใน PowerShell ให้กด `Ctrl+C` ที่หน้าต่างเดิม หากมีตัวจัดการ Windows Service ให้รีสตาร์ตเฉพาะบริการ MONTRA แทน อย่าปิด Caddy/CityManager

เมื่อ MONTRA ตัวเก่าหยุดและพอร์ต 4108 ว่าง เปิดใหม่:

```powershell
cd C:\Montra\online-server
$env:NODE_ENV = "production"
$env:PORT = "4108"
node .\build\index.js
```

ปล่อยหน้าต่าง Node ทำงานไว้

## 3. ทดสอบด้วยผู้เล่นจำลอง 4 คน

เปิด PowerShell อีกหน้าต่าง:

```powershell
cd C:\Montra\online-server

Invoke-WebRequest "https://montra.157-85-96-139.sslip.io/hi" -UseBasicParsing

node .\montra-combat-smoke-test.mjs
if ($LASTEXITCODE -ne 0) { throw "PvE smoke test failed" }

node .\montra-s1-integration.mjs
if ($LASTEXITCODE -ne 0) { throw "S1 regression failed" }

node .\montra-free-pk-integration.mjs
if ($LASTEXITCODE -ne 0) { throw "FREE PK regression failed" }
```

ผลทดสอบ Free PK ที่ต้องเห็นอย่างน้อย:

- `PASS: self-attack, unknown player and forged HP/damage rejected`
- `PASS: two PK fights start immediately; four clients see shared HP 100 -> 88`
- `PASS: independent PK attack is cancelled by manual movement`
- `PASS: single PK kill, winner credit and loser death synchronized`
- `PASS: defeated player respawns with restored HP`
- `PASS: far-away PK requires a speed-limited approach before damage`
- `PASS: opponent disconnect cleans up PK target and movement`
- `PASS: MONTRA Free PK 4-player integration complete`

การทดสอบสร้างห้องชั่วคราวแยกจากห้องของผู้เล่นจริง แต่การรีสตาร์ต MONTRA จะทำให้ผู้ที่ออนไลน์อยู่หลุดได้

## 4. ทดสอบบนมือถือสองเครื่อง

เข้า https://nustanakritwithai.github.io/Montra/ ให้ทั้งคู่ขึ้น `LIVE` จากนั้นแตะตัวผู้เล่นอีกคนเพื่อโจมตี (ไม่มีคำท้า) ต้องเห็นค่า HP ลดตรงกันทั้งสองจอ เลือกพื้นเพื่อหยุดโจมตี หรือโจมตีต่อจนอีกฝ่ายหมด HP และเกิดใหม่

หากหน้าเกมขึ้นข้อความว่า `Server ยังไม่มีระบบ Free PK` แสดงว่าฝั่ง VPS ยังไม่โหลด Build ใหม่

## ย้อนกลับเมื่อมีปัญหา

ตรวจโฟลเดอร์สำรองจากตัวติดตั้ง เช่น `C:\Montra\online-server\backup-before-s1-YYYYMMDD-HHMMSS`

หยุด **เฉพาะ MONTRA Node.js** ก่อน แล้วทำตามขั้นตอน Rollback ใน [S1-WINDOWS-VPS-TH.md](./S1-WINDOWS-VPS-TH.md) หรือแจ้งผล Error ก่อนแก้ไขไฟล์เอง ห้ามลบโฟลเดอร์ Caddy/CityManager

**ข้อจำกัด:** เป็น Alpha แบบ guest/session ชั่วคราว ไม่มีบัญชีผู้เล่น, ฐานข้อมูลถาวร, เขตปลอดภัย, ป้องกันการแกล้งครบทุกกรณี, ประวัติ PK ถาวร, หรือระบบป้องกัน DDoS จึงยังไม่ควรเปิดให้ผู้เล่นจำนวนมากเข้าใช้
