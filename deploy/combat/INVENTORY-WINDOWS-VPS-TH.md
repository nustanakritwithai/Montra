# MONTRA V0.2.6 — กระเป๋าไอเท็มถาวร + ยาเลือดเล็ก (Windows VPS)

## ระบบ
- กระเป๋า **12 ช่องต่อ 1 ตัวละคร** แยกตาม Guest save 1–3
- ยาเลือดเล็ก (item ID: `health_potion`) เริ่มต้น **3 ขวดต่อช่องเซฟ** แจกเพียงครั้งเดียว
- ใช้ยาเพิ่ม HP ได้สูงสุด 30 หน่วยและไม่เกิน HP สูงสุด ห้ามใช้เมื่อ HP เต็ม/ตาย คูลดาวน์ 1 วินาที
- มือถือส่งเพียง `use_item` พร้อม `{slot:0}` เซิร์ฟเวอร์เป็นผู้กำหนด HP, พลังยา, จำนวนและความถี่
- เซิร์ฟเวอร์หักไอเท็มและ **เขียนเซฟลงดิสก์ก่อนยืนยันผล** หากเขียนล้มเหลวจะไม่ลดจำนวนในเกมและไม่เพิ่ม HP
- มือถือกด **ไอเท็ม** → เลือกช่องยาเลือด → **ใช้ยาเลือด**; DEMO เป็นเพียงตัวอย่างที่ไม่บันทึก

## เซฟเก่าจะไม่หาย
ยังใช้ไฟล์ SHA-256 เดิมของตัวละครและ CharacterStore version 1. เมื่อเปิดเซฟเก่าครั้งแรกที่ยังไม่มีกระเป๋า ระบบเพิ่มยา 3 ขวดแล้วเขียนแบบ atomic ก่อนเข้าเล่น โดยไม่แก้ชื่อ พิกัด Y (รวมบิน), เลเวล, XP, HP, PK หรือ Guest ID เมื่อใช้ไปแล้วจะไม่กลับมาได้รับอีกหลังรีสตาร์ต และแต่ละช่องมีไอเท็มแยกกัน

หากไฟล์เซฟเสียหายหรือเขียนไม่ได้ ระบบปฏิเสธการเข้าเล่นแทนการลบเซฟหรือแจกยาใหม่

## 1. สำรองข้อมูลจริงก่อนติดตั้ง
ตรวจว่าตัวแปร `MONTRA_CHARACTER_DIR` ที่ Node/Windows Service เดิมใช้จริง ตรงกับพาธด้านล่าง:

```powershell
$ErrorActionPreference = "Stop"
$base = "C:\Montra\online-server"
$save = if ($env:MONTRA_CHARACTER_DIR) {$env:MONTRA_CHARACTER_DIR} else {"$base\data\characters"}
Write-Host "Character directory:" $save
Write-Host "Existing JSON:" ((Get-ChildItem $save -Filter *.json -File -ErrorAction SilentlyContinue | Measure-Object).Count)
if (Test-Path -LiteralPath $save) {
  $backup = "C:\Montra\character-backups\before-inventory-$(Get-Date -Format yyyyMMdd-HHmmss)"
  New-Item -ItemType Directory -Path (Split-Path $backup) -Force | Out-Null
  Copy-Item -LiteralPath $save -Destination $backup -Recurse -Force
  Write-Host "Backup:" $backup
  Write-Host "Copied JSON:" ((Get-ChildItem $backup -Filter *.json -File | Measure-Object).Count)
}
```

ตรวจจำนวนไฟล์สำรองให้ตรงก่อนทำต่อ เก็บ Guest recovery key เป็นความลับ

## 2. Stage + Build (หลัง PR merge และ CI ผ่านแล้ว)
```powershell
New-Item -ItemType Directory -Force -Path "C:\Montra\deploy" | Out-Null
Invoke-WebRequest "https://raw.githubusercontent.com/nustanakritwithai/Montra/main/deploy/combat/install-windows.ps1" -OutFile "C:\Montra\deploy\install-inventory.ps1" -UseBasicParsing
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\Montra\deploy\install-inventory.ps1"
if ($LASTEXITCODE -ne 0) {throw "MONTRA Inventory Build Failed — DO NOT restart Node"}
```

ต้องเห็น **MONTRA INVENTORY BUILD PASSED.** และพาธ backup-before-3slots-... ที่ installer พิมพ์ไว้ Installer สร้าง backup source/build/character data และไม่ปิด Caddy, CityManager หรือ Node ใด ๆ เอง

## 3. รีสตาร์ตเฉพาะ MONTRA บนพอร์ต 4108
ห้ามใช้ `taskkill /IM node.exe /F` เพราะ VPS มีเกมอื่นอยู่ ตรวจโปรเซสก่อน:

```powershell
Get-NetTCPConnection -LocalPort 4108 -State Listen -ErrorAction SilentlyContinue |
ForEach-Object {
  Get-CimInstance Win32_Process -Filter "ProcessId = $($_.OwningProcess)" |
  Select-Object ProcessId, Name, CommandLine
}
```

หยุด Node MONTRA เดิมในหน้าต่างเดิมด้วย Ctrl+C หรือ Service Manager ของ MONTRA และเปิดใหม่ด้วยพาธเซฟเดิม:

```powershell
cd C:\Montra\online-server
$env:NODE_ENV = "production"
$env:PORT = "4108"
# ถ้าใช้ MONTRA_CHARACTER_DIR ให้ใช้พาธเดิมทุกครั้ง
node .\build\index.js
```

ตรวจ HTTP `http://127.0.0.1:4108/hi` และ `https://montra.157-85-96-139.sslip.io/hi` ควรได้ 200 แต่ต้องทดสอบเข้า LIVE เพื่อยืนยันการใช้งานไอเท็มด้วย

## 4. ทดสอบ
เปิด https://nustanakritwithai.github.io/Montra/ โหลดใหม่เป็น V0.2.6
1. DEMO: กดไอเท็ม เห็น 12 ช่องและยาเลือด 3 ขวด (ไม่บันทึก)
2. LIVE ด้วยเซฟเก่าช่อง 1: จำนวนยาเริ่ม 3 (ครั้งเดียว), สถานะกระเป๋า "บันทึกถาวรบน VPS"
3. HP เต็ม: ไม่ควรเสียยา
4. รับความเสียหายจากการต่อสู้ → ใช้ยา เพิ่ม HP สูงสุด 30 และหัก 1 ขวด
5. ออก–เข้าเกมใหม่ / รีสตาร์ต Node: จำนวนยาที่หักไปยังเท่าเดิม ไม่ได้รับ 3 ขวดซ้ำ
6. ช่อง 2 และ 3: ยาและไอเท็มแยกกัน; ทดสอบปีนกำแพง บิน พุ่ง และเรียกผีเดิม

**อย่ารัน Integration Test บน VPS จริง** เพราะสคริปต์จะสร้างห้อง ต่อสู้ และบังคับการเคลื่อนที่ CI ใช้ Node และโฟลเดอร์ TEMP แยกจากผู้เล่นแล้ว

## 5. Rollback — สำคัญ
เซิร์ฟเวอร์ก่อน V0.2.6 **ไม่รู้จักฟิลด์ไอเท็มในเซฟ** และเมื่อรันแล้ว autosave อาจเขียนทับข้อมูลยา ทำให้จำนวนยาหายหรือได้ยาเริ่มต้นซ้ำเมื่อติดตั้งรุ่นใหม่อีกครั้ง! ห้ามใช้ Build เก่ากับเซฟที่เริ่มใช้ไอเท็มโดยไม่มีแผนรักษาข้อมูล

หากต้องย้อนกลับ ให้หยุดเฉพาะ MONTRA แล้วสำรอง `data\characters` หรือ `MONTRA_CHARACTER_DIR` จริง ณ เวลานั้นใหม่อีกชุดก่อนแก้โค้ด อย่าลบหรือเขียนทับเซฟผู้เล่นจาก backup เก่าโดยตรง

**ข้อจำกัด:** ปัจจุบันมีไอเท็มชนิดเดียว ไม่มีร้านค้า การดรอป ซื้อขาย อุปกรณ์สวมใส่ หรือระบบฐานข้อมูลหลาย VPS
