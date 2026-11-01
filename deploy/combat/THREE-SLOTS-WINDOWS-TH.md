# MONTRA Alpha 0.2.1 — 1 Guest ID มี 3 ช่องเซฟ (Windows VPS)

## กฎการเก็บเซฟ

- ใช้ Guest recovery key เดิม 1 รหัสต่อ 3 ตัวละคร
- ช่อง 1 **ใช้ไฟล์ JSON เดิมของ MONTRA S2 โดยไม่มีการย้าย/เปลี่ยนชื่อไฟล์** จึงรักษาตัวละครเก่าทั้งชื่อ ตำแหน่ง HP และสถิติ PK
- ช่อง 2 และ 3 มีไฟล์ JSON แยกคนละรหัส ไม่มีการเขียนทับช่อง 1
- แต่ละช่องมีชื่อ เลเวล XP HP ตำแหน่งและ PK แยกกัน ระบบยังไม่มีระบบรับ XP ใหม่ ไอเทมและเงิน
- Guest ID เดียวเข้าออนไลน์ได้ **ครั้งละหนึ่งตัวละคร** ไม่ให้สองเบราว์เซอร์หรือสองช่องใช้บัญชีเดียวกันพร้อมกัน
- เข้าหน้าเกมจะเห็นเมนูสามช่องเซฟบนมือถือ เลือกช่องแล้วกดเข้า LIVE เปลี่ยนช่องผ่านหน้าโปรไฟล์ด้านบนซ้ายได้
- รายชื่อเซฟที่แสดงก่อนเข้าอาจเป็นข้อมูลล่าสุดจากที่เก็บในเบราว์เซอร์ เมื่อเชื่อมต่อจะอัปเดตจาก VPS
- ถ้ายังเปิด Node S2 รุ่นเก่าบน VPS และผู้เล่นเลือกช่อง 2–3 Client จะ **ปฏิเสธการเข้าเล่น** แทนที่จะเผลอเขียนทับเซฟ 1

## ก่อน Deploy: สำรองข้อมูลจริง (สำคัญ)

**ห้ามล้างข้อมูลผู้เล่น/ลบ data/characters และอย่ารัน integration test บน VPS จริง**

เปิด PowerShell บน VPS และตรวจพาธ:
```powershell
$base = "C:\Montra\online-server"
$save = if ($env:MONTRA_CHARACTER_DIR) {$env:MONTRA_CHARACTER_DIR} else {Join-Path $base "data\characters"}
Write-Host "Character data directory: $save"
Write-Host "Existing JSON count:"
(Get-ChildItem $save -Filter *.json -File -ErrorAction SilentlyContinue | Measure-Object).Count
```

สำรองก่อนติดตั้ง (ถ้ามีข้อมูล):
```powershell
$backup = "C:\Montra\manual-character-backups\before-three-slots-" + (Get-Date -Format "yyyyMMdd-HHmmss")
if (Test-Path $save) {
    New-Item -ItemType Directory -Path (Split-Path $backup) -Force | Out-Null
    Copy-Item -LiteralPath $save -Destination $backup -Recurse -Force
    Write-Host "Character backups: $backup"
}
```

ตรวจว่า Snapshot สำรองมีไฟล์ครบ (ถ้ามีไฟล์ก่อนหน้า) และเก็บไว้ในพื้นที่ส่วนตัว **อย่าเผยแพร่รหัสกู้คืนหรือไฟล์เซฟ**

## ติดตั้งจาก main (หลัง CI ผ่านและ PR รวมแล้วเท่านั้น)

คำสั่งติดตั้งทำ stage/build แต่ **ไม่รีสตาร์ต Node/Caddy/CityManager เอง**:

```powershell
New-Item -ItemType Directory -Path "C:\Montra\deploy" -Force | Out-Null
Invoke-WebRequest "https://raw.githubusercontent.com/nustanakritwithai/Montra/main/deploy/combat/install-windows.ps1" -OutFile "C:\Montra\deploy\install-three-slots.ps1" -UseBasicParsing
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\Montra\deploy\install-three-slots.ps1"
if ($LASTEXITCODE -ne 0) { throw "MONTRA 3-SLOTS build failed; do not restart Node" }
```

ต้องเห็น **MONTRA 3-SLOTS BUILD PASSED.** พร้อมที่เก็บ backup-before-3slots-... ก่อนดำเนินการ

หาก MONTRA Node อยู่บนพอร์ต 4108 ให้หยุดเฉพาะโปรเซส MONTRA ด้วยวิธีที่ใช้งานอยู่เดิม แล้วเริ่มใหม่จากตำแหน่งเดิม:

```powershell
cd C:\Montra\online-server
$env:NODE_ENV = "production"
$env:PORT = "4108"
node .\build\index.js
```

ถ้าใช้ Windows Service อยู่ ให้รีสตาร์ต Service เดิมโดยเฉพาะ อย่าเปิด Node ซ้อนหรือหยุดบริการเกมอื่น ตรวจ HTTP /hi และ HTTPS/WSS ตามที่ใช้งาน

## ทดสอบแบบรักษาเซฟเดิม

1. เปิด https://nustanakritwithai.github.io/Montra/ (ไฟล์ JS รุ่น 0.2.1)
2. เลือก **เซฟ 1**: ชื่อตัวละครและตำแหน่งเดิมยังอยู่
3. เลือกหน้าโปรไฟล์ → เปลี่ยนเป็น **เซฟ 2**: เริ่มตัวละครใหม่ ไม่มีค่าสถานะจากเซฟ 1
4. เปลี่ยนชื่อ เดินไปจุดหนึ่ง รออย่างน้อย 15 วินาทีแล้วออก
5. เปิดอีกครั้งเลือกเซฟ 2: ชื่อและตำแหน่งเดิมกลับมา
6. ลองเซฟ 3 เป็นตัวละครใหม่ต่างหาก แล้วกลับเซฟ 1: ต้องไม่เปลี่ยนข้อมูลเซฟ 1
7. ตรวจ server log ไม่มี "save failed" และตรวจว่าไม่มีโปรเซส MONTRA ซ้อน

**หากช่อง 2–3 แสดงว่าต้องอัปเดต VPS** อย่าพยายามแก้เซฟ 1 หรือเปลี่ยน Guest key: ต้องติดตั้ง server code ใหม่ก่อน

## Rollback

หยุดเฉพาะ MONTRA Node แล้วคืน source/build จากโฟลเดอร์ backup-before-3slots-... ที่ installer พิมพ์ไว้ รักษา data/characters **ทุกไฟล์** ไว้ตามเดิม รุ่น S2 จะอ่านเซฟ 1 ตามพาธเดิมได้ ส่วนเซฟ 2–3 จะยังคงอยู่โดย S2 ไม่อ่าน/แก้ไข หากจะกลับมาใช้ V0.2.1 ในอนาคตไฟล์เซฟยังพร้อม

ข้อจำกัด: File-based persistence อยู่บนเครื่อง Node เดียว ไม่ใช่ระบบบัญชี password/email หรือฐานข้อมูล MMO หลาย VPS
