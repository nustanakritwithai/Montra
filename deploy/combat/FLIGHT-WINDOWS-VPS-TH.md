# MONTRA V0.2.5 — บินสูง 6 เมตร และเดินบนกำแพง (Windows VPS)

## วิธีเล่น
- บนพื้น Y=0 และยอดกำแพง Y=4: เดินและใช้ระบบปีนเดิมได้
- กด **บิน** เพื่อขึ้นอากาศ Y=6 จากพื้นหรือกำแพง ค่อย ๆ ขึ้นด้วยความเร็ว 4 หน่วยต่อวินาที (ไม่วาร์ป)
- ที่ระดับ Y=6 แตะบนฉากเพื่อบินในแนวราบได้ด้วยความเร็ว 4 หน่วยต่อวินาที ข้ามกำแพงได้
- กด **ลง**: ถ้าอยู่เหนือยอดกำแพงที่เดินได้ให้ลง Y=4 มิฉะนั้นลงสู่พื้น Y=0
- ถ้าอยู่เหนือเนื้อกำแพงที่ลงจอดไม่ได้ จะมีข้อความเตือนให้บินไปยังตำแหน่งปลอดภัยก่อน
- ระหว่างบินขึ้นหรือลง ห้ามออกคำสั่งเคลื่อนที่/พุ่ง/ปีนและโจมตี
- ในโหมด LIVE เซิร์ฟเวอร์ตัดสินความสูงและการเคลื่อนที่ทั้งหมดใน tick 20Hz ผู้เล่นอื่นเห็นตำแหน่งเดียวกัน

## ระบบเซฟ 3 ช่องเดิม
ไม่มีการย้ายไฟล์ Guest และไม่มีการเปลี่ยน CharacterStore JSON v1. เมื่อออกเกมขณะบินจะบันทึก y=6 ในเซฟช่องเดิมและเข้าเกมใหม่จะยังคงบินอยู่ หากกำลังขึ้นหรือลงตอนบันทึก เซิร์ฟเวอร์เก็บที่ระดับบิน 6 เพื่อไม่ให้เกิดเซฟความสูงครึ่งทาง
เมื่อลงพื้น/กำแพงแล้วเซฟจะเป็น 0 หรือ 4 ตามจริง

## สำรองก่อนติดตั้งบน Windows VPS
**ตรวจ MONTRA_CHARACTER_DIR จริงก่อน** ถ้าตั้ง environment ไว้ในหน้าต่าง Node/Service ให้ใช้ค่าเดียวกันเสมอ

```powershell
$ErrorActionPreference = "Stop"
$base = "C:\Montra\online-server"
$save = if ($env:MONTRA_CHARACTER_DIR) {$env:MONTRA_CHARACTER_DIR} else {"$base\data\characters"}
Write-Host "Character data:" $save
if (Test-Path -LiteralPath $save) {
  $backup = "C:\Montra\character-backups\before-flight-$(Get-Date -Format yyyyMMdd-HHmmss)"
  New-Item -ItemType Directory -Force -Path (Split-Path $backup) | Out-Null
  Copy-Item -LiteralPath $save -Destination $backup -Recurse -Force
  Write-Host "Backup:" $backup
}
```

ตรวจจำนวนไฟล์สำรองให้ตรงกับต้นฉบับก่อนทำงาน และเก็บรหัสกู้คืนเป็นความลับ

## Stage / Build (หลัง PR merge และ CI ผ่าน)

```powershell
New-Item -ItemType Directory -Force -Path "C:\Montra\deploy" | Out-Null
Invoke-WebRequest "https://raw.githubusercontent.com/nustanakritwithai/Montra/main/deploy/combat/install-windows.ps1" -OutFile "C:\Montra\deploy\install-flight.ps1" -UseBasicParsing
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\Montra\deploy\install-flight.ps1"
if ($LASTEXITCODE -ne 0) {throw "MONTRA Flight Build Failed; DO NOT restart Node"}
```

ต้องแสดง **MONTRA FLIGHT BUILD PASSED.** และพาธ backup ของซอร์สกับ build. Installer ไม่รีสตาร์ตโปรเซสใด ๆ, ไม่เปลี่ยน Caddy/CityManager/พอร์ต/Firewall และไม่ลบเซฟ

## รีสตาร์ตเฉพาะ MONTRA
ตรวจ process พอร์ต 4108 ก่อน ห้ามสั่ง `taskkill /IM node.exe /F` เพราะ VPS มีหลายเกมอยู่
หยุดเฉพาะ Node MONTRA เดิมด้วย Ctrl+C จากหน้าต่างเดิม หรือรีสตาร์ต Windows Service ของ MONTRA โดยเฉพาะ จากนั้นเปิดใหม่เมื่อ Build ผ่าน:

```powershell
cd C:\Montra\online-server
$env:NODE_ENV = "production"
$env:PORT = "4108"
# ใช้ MONTRA_CHARACTER_DIR เดิมถ้าเคยตั้งไว้
node .\build\index.js
```

ตรวจ `http://127.0.0.1:4108/hi` และ `https://montra.157-85-96-139.sslip.io/hi` ได้ StatusCode 200 แต่ HTTP 200 ไม่ยืนยัน Flight ต้องเข้า LIVE กดบินจริง

## ทดสอบบนมือถือ
เปิด https://nustanakritwithai.github.io/Montra/ แล้วโหลดใหม่ให้ได้ JS V0.2.5
1. DEMO: กดบินจน Y=6 แตะเดินในอากาศ แล้วลงยอดกำแพง Y=4 หรือพื้น Y=0
2. LIVE: ดูว่าเข้าเซฟเดิมแล้วกดบินสำเร็จ และอีกเครื่องเห็นความสูงเดียวกัน
3. จากยอดกำแพงเดินไปตามกำแพงได้แต่ห้ามเดินออกนอกขอบก่อนกดบิน
4. บินเหนือตำแหน่งลงไม่ได้ กดลงแล้วต้องได้รับข้อความเตือน ไม่ทะลุหิน
5. ลองออกและเข้าใหม่ตอน Y=6 ต้องโหลดตำแหน่งและระดับเดิม
6. ตรวจปีน พุ่ง ยิงอาคม และเซฟอีก 2 ช่องว่ายังทำงาน

**อย่ารัน flight-integration.mjs บน LIVE** เพราะสร้างห้องและสั่งตัวละครเดิน/บินอัตโนมัติ ใช้เฉพาะเครื่องทดสอบที่แยกจากผู้เล่นจริง

## Rollback
หยุดเฉพาะ MONTRA แล้วคืน source/build จาก backup ที่ Installer พิมพ์ไว้ **ห้ามคืนทับหรือลบ data/characters หรือ MONTRA_CHARACTER_DIR** ระหว่าง rollback. ถ้าจะถอยกลับรุ่นที่ไม่รู้จัก Y=6 ควรให้ผู้เล่นลงจอดก่อนเพื่อป้องกันการใช้ spawn ตำแหน่งใหม่ชั่วคราวหลังโหลดเซฟ
ข้อจำกัด: สิ่งตกแต่ง เช่น ต้นไม้ บ้าน และหลังคายังไม่ใช่ collision บนเซิร์ฟเวอร์ ระบบบินเป็นระดับความสูงเดียว ไม่ใช่บินขึ้นได้ไม่จำกัด และยังไม่มีระบบพลังงานบิน
