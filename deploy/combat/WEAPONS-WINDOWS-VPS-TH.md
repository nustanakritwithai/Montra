# MONTRA V0.2.7 — ติดตั้งชุดอาวุธถาวร (Windows VPS)

ระบบเพิ่มอาวุธ 3 ชิ้น: **มีดหมอ** (โจมตีประชิด +4), **กระบี่อาคม** (ประชิด +8) และ **คทาวิญญาณ** (ยิงอาคม +6) ให้สวมใส่ได้ทีละ 1 ชิ้นผ่านกระเป๋า 12 ช่อง อาวุธแสดงเป็นโมเดล 3D ในมือที่ผู้เล่นอื่นเห็นได้ และโบนัสโจมตีคำนวณบนเซิร์ฟเวอร์ ไม่รับค่าดาเมจจาก Client

## รักษาเซฟ Guest 1–3 และยาเลือดเดิม

- เซฟทั้ง 3 ช่องใช้ไฟล์ SHA-256 เดิม ไม่มีการเปลี่ยนตัวตนหรือรีเซ็ตตัวละคร
- เซฟ V0.2.6 จะได้รับ **เฉพาะชุดอาวุธ 3 ชิ้นครั้งเดียว** ไม่มีการเพิ่มยาเลือดกลับเป็น 3 ขวด: ถ้ามียา 2 ขวดก็ยังเหลือ 2; หากใช้หมดก็ยังหมด
- เซฟเก่ากว่า V0.2.6 ที่ยังไม่มีกระเป๋า ได้ยาเลือดเริ่มต้น 3 ขวดและชุดอาวุธเพียงครั้งเดียว
- เปลี่ยนอาวุธแล้วจะบันทึกบน VPS ก่อนเปิดใช้โบนัส และบันทึกต่างกันตามช่องเซฟ 1–3
- ไม่อนุญาตให้ใช้อาวุธเป็นยา หรือให้มือถือส่งดาเมจ/จำนวนอาวุธเอง
- **ห้ามย้อนกลับไปใช้ Build 0.2.6 โดยตรงกับเซฟที่มีอาวุธ** เพราะตัวอ่านเซฟรุ่นเก่าอาจไม่รองรับฟิลด์ใหม่

## 1. ตรวจโฟลเดอร์เซฟจริงและสำรองก่อนติดตั้ง

ตรวจว่า Windows Service หรือ Node ของ MONTRA ใช้ `MONTRA_CHARACTER_DIR` อยู่หรือไม่ ถ้ามีต้องใช้พาธเดียวกันกับที่เซิร์ฟเวอร์จริงใช้

```powershell
$ErrorActionPreference = "Stop"
$base = "C:\Montra\online-server"
$save = if ($env:MONTRA_CHARACTER_DIR) { $env:MONTRA_CHARACTER_DIR } else { "$base\data\characters" }
Write-Host "Character directory:" $save
$before = (Get-ChildItem -LiteralPath $save -Filter *.json -File -ErrorAction SilentlyContinue | Measure-Object).Count
if (Test-Path -LiteralPath $save) {
  $backup = "C:\Montra\character-backups\before-weapons-$(Get-Date -Format yyyyMMdd-HHmmss)"
  New-Item -ItemType Directory -Path (Split-Path $backup) -Force | Out-Null
  Copy-Item -LiteralPath $save -Destination $backup -Recurse -Force
  $after = (Get-ChildItem -LiteralPath $backup -Filter *.json -File | Measure-Object).Count
  if ($before -ne $after) { throw "Character backup count mismatch" }
  Write-Host "Backup OK:" $backup
}
```

## 2. ดาวน์โหลดตัวติดตั้งล่าสุดจาก main หลัง CI ผ่าน

```powershell
New-Item -ItemType Directory -Force -Path "C:\Montra\deploy" | Out-Null
Invoke-WebRequest "https://raw.githubusercontent.com/nustanakritwithai/Montra/main/deploy/combat/install-windows.ps1" -OutFile "C:\Montra\deploy\install-weapons.ps1" -UseBasicParsing
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\Montra\deploy\install-weapons.ps1"
if ($LASTEXITCODE -ne 0) { throw "MONTRA Weapon Build Failed: DO NOT restart Node" }
```

ต้องได้ **MONTRA WEAPON BUILD PASSED.** พร้อมพาธ Backup ใหม่ ระบบจะสำรองโค้ด/Build และเซฟจากพาธที่ตรวจพบก่อน Build หาก Compile ล้มเหลว จะคืนซอร์ส/Build เดิมโดยไม่แก้ข้อมูลเซฟ ตัวติดตั้งจะไม่รีสตาร์ต Node, Caddy, CityManager หรือบริการอื่น

## 3. รีสตาร์ตเฉพาะ MONTRA

อย่าใช้ `taskkill /IM node.exe /F` เพราะ VPS มีหลายเกม ตรวจโปรเซสที่ฟังพอร์ต 4108 ก่อน:

```powershell
Get-NetTCPConnection -LocalPort 4108 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Get-CimInstance Win32_Process -Filter "ProcessId = $($_.OwningProcess)" | Select-Object ProcessId,Name,CommandLine }
```

หยุดเฉพาะ MONTRA Node เดิมผ่าน Ctrl+C ในหน้าต่างเดิม หรือ Service ของ MONTRA จากนั้นเปิดใหม่ด้วย `MONTRA_CHARACTER_DIR` เดิม:

```powershell
cd C:\Montra\online-server
$env:NODE_ENV = "production"
$env:PORT = "4108"
node .\build\index.js
```

## 4. ตรวจบนมือถือ

เปิด https://nustanakritwithai.github.io/Montra/ โหลดหน้าใหม่เป็น V0.2.7

1. DEMO: เปิดกระเป๋า ลองสวมมีดหมอ กระบี่อาคม คทาวิญญาณ และถอด (ไม่บันทึก)
2. LIVE: เข้าเซฟเดิมที่เคยใช้ยาแล้ว ตรวจว่ายาไม่ถูกเติมใหม่ และมีอาวุธ 3 ชิ้น
3. สวมกระบี่อาคม: โจมตีประชิดแรงขึ้นตามสูตรบนเซิร์ฟเวอร์
4. สวมคทาวิญญาณ: ยิงอาคมแรงขึ้น 6 หน่วย
5. สวม/ถอด แล้วออกเกมเข้าใหม่และสลับช่องเซฟ ตรวจว่าอาวุธที่ถือและจำนวนยาอยู่ถูกตัวละคร
6. ตรวจระบบบิน พุ่ง ปีน เรียกผี และการใช้ยาเดิม

**อย่ารัน** `montra-weapon-integration.mjs` หรือ `montra-s2-character-integration.mjs` บน LIVE เพราะไฟล์ทดสอบสร้างห้องและสั่งโจมตีอัตโนมัติ ใช้ได้เฉพาะเซิร์ฟเวอร์ทดสอบที่แยกออกมาพร้อม `MONTRA_CHARACTER_DIR` ชั่วคราว

## 5. Rollback

หลังเปิด V0.2.7 และมีการสวมอาวุธแล้ว อย่าเปิดเซฟใหม่ด้วย Build ก่อน 0.2.7 โดยตรง หากต้องย้อนกลับ ให้หยุดเฉพาะ MONTRA และสำรองโฟลเดอร์เซฟปัจจุบันอีกชุดก่อนวางแผนการย้อนซอฟต์แวร์ ห้ามนำ Backup เก่ามาเขียนทับไฟล์ตัวละครโดยไม่ตรวจข้อมูลปัจจุบัน
