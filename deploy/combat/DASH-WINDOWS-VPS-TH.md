# MONTRA V0.2.3 — ติดตั้ง Dash บน Windows VPS (ปลอดภัยต่อเซฟ)

## สิ่งที่เพิ่ม

ผู้เล่นปัดเร็ว ๆ บนพื้นที่แถบเมนูล่าง (Skill Bar หรือแถบ แผนที่/ออนไลน์/วิธีเล่น) เพื่อพุ่งตามทิศทางที่ปัดโดยอิงมุมกล้องขณะนั้น **ไม่มีปุ่ม Dash ใหม่** การแตะสั้น ๆ ยังคงใช้สกิลเดิมได้

เซิร์ฟเวอร์ Colyseus เป็นผู้ตัดสินการพุ่งทั้งหมด: ใช้การเคลื่อนที่ 20Hz, ความเร็ว 13.5 หน่วย/วินาที, ระยะรวมไม่เกิน 4.5 หน่วย, คูลดาวน์ 1.8 วินาที และตรวจการชนกำแพงทุก ๆ 0.1 หน่วย ผู้เล่นบนกำแพงจะไม่สามารถพุ่งออกนอกทางเดินบนยอดได้ ไม่สามารถพุ่งขณะปีนหรือตาย ไม่สามารถใช้คำสั่ง Client เพื่อกำหนดความเร็ว ระยะ หรือค่า Y ใหม่ได้

เมื่อต้องการพุ่งระหว่างเดิน/ไล่โจมตี เซิร์ฟเวอร์ยกเลิกคำสั่งเดิมแล้วเริ่มพุ่งหนึ่งครั้ง ผู้เล่นคนอื่นเห็นตำแหน่งเดียวกันผ่าน Schema เมื่อ VPS ยังเป็นเวอร์ชันเก่า หน้าเว็บจะแจ้งชัดเจนว่า VPS ไม่รองรับ Dash แทนการส่งคำสั่งแล้วเงียบ

โหมด DEMO มีการพุ่งจำลองในเครื่อง แต่จะไม่บันทึกข้อมูลหรือแก้กฎของเซิร์ฟเวอร์

## 1. สำรองข้อมูลก่อนติดตั้ง

**อย่ารีเซ็ต/ลบเซฟตัวละครหรือสั่ง kill node.exe ทั้งหมด** เพราะ VPS มีหลายเกมทำงานพร้อมกัน

ตรวจสอบพาธ MONTRA จริงบน PowerShell:

```powershell
$base = "C:\Montra\online-server"
$save = if ($env:MONTRA_CHARACTER_DIR) { $env:MONTRA_CHARACTER_DIR } else { "$base\data\characters" }
Write-Host "MONTRA source exists:" (Test-Path "$base\src\rooms\MyRoom.ts")
Write-Host "Save directory:" $save
```

ถ้า `MONTRA_CHARACTER_DIR` ถูกตั้งในหน้าต่าง Node เดิมหรือ Windows Service ให้ตรวจพาธเดียวกันกับที่เซิร์ฟเวอร์ใช้จริงก่อนทำ Backup

```powershell
if (Test-Path $save) {
  $backup = "C:\Montra\character-backups\before-dash-$(Get-Date -Format yyyyMMdd-HHmmss)"
  New-Item -ItemType Directory -Force -Path (Split-Path $backup) | Out-Null
  Copy-Item -LiteralPath $save -Destination $backup -Recurse -Force
  Write-Host "Save backup:" $backup
}
```

**ตรวจว่าการสำรองสำเร็จ** ก่อนติดตั้ง และเก็บสำรองไว้ในพื้นที่ส่วนตัวที่ไม่ได้เปิดผ่านเว็บ

## 2. Stage + Build จาก main (หลัง CI PASS และ PR Merge แล้ว)

```powershell
New-Item -ItemType Directory -Path "C:\Montra\deploy" -Force | Out-Null
Invoke-WebRequest "https://raw.githubusercontent.com/nustanakritwithai/Montra/main/deploy/combat/install-windows.ps1" -OutFile "C:\Montra\deploy\install-dash.ps1" -UseBasicParsing
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\Montra\deploy\install-dash.ps1"
if ($LASTEXITCODE -ne 0) { throw "MONTRA Dash build failed — DO NOT restart Node" }
```

Installer จะสำรองไฟล์ MyRoom/กฎ/Schema/Build และตัวละครที่มีอยู่ ก่อน Download และ Build หาก Build ล้มเหลว จะคืนซอร์สและ Build รุ่นก่อน โดยไม่ลบไฟล์เซฟ ไม่ปิด Node/Caddy/CityManager และไม่แก้ไฟร์วอลล์

ต้องเห็น **MONTRA DASH BUILD PASSED.** และพาธ Backup ใหม่ จึงค่อยรีสตาร์ตเฉพาะ MONTRA

## 3. รีสตาร์ตเฉพาะ MONTRA Node

ปล่อยเกมอื่นทำงานต่อ ห้าม `taskkill /IM node.exe /F`

ตรวจโปรเซส:

```powershell
Get-NetTCPConnection -LocalPort 4108 -State Listen -ErrorAction SilentlyContinue |
  ForEach-Object {
    Get-CimInstance Win32_Process -Filter "ProcessId = $($_.OwningProcess)" |
      Select-Object ProcessId, Name, CommandLine
  }
```

หยุดเฉพาะหน้าต่าง Node MONTRA เดิมด้วย Ctrl+C หรือรีสตาร์ต Windows Service ของ MONTRA ถ้าติดตั้งเป็น Service ห้ามเปิด Node ซ้อนกัน

กรณีใช้ Terminal เดิม:

```powershell
cd C:\Montra\online-server
$env:NODE_ENV = "production"
$env:PORT = "4108"
# หากใช้งาน MONTRA_CHARACTER_DIR ให้ใช้พาธเดิมทุกครั้ง ห้ามสร้างที่ใหม่
node .\build\index.js
```

เปิดอีกหน้าต่างทดสอบ `http://127.0.0.1:4108/hi` และ `https://montra.157-85-96-139.sslip.io/hi` ต้องได้ HTTP 200 อย่าเปิดพอร์ต 4108 สู่สาธารณะ

## 4. ทดสอบในมือถือ

เปิด https://nustanakritwithai.github.io/Montra/ และโหลดหน้าเว็บใหม่เพื่อรับ main.js 0.2.3

- ใน DEMO ปัดสั้นและเร็วจากบริเวณแถบเมนูด้านล่าง: ตัวละครพุ่งตามทิศที่ปัด
- ใน LIVE เลือกช่องเซฟเดิม แล้วปัดเมนูล่าง: เซิร์ฟเวอร์รับคำสั่งและตำแหน่งเปลี่ยนจริง
- ปัดเข้ากำแพง: ต้องหยุดก่อนทะลุผนัง
- ปัดซ้ำทันที: แจ้งคูลดาวน์
- แตะสกิล/แผนที่/ออนไลน์สั้น ๆ: ทำงานเหมือนเดิม ไม่ถูกแปลงเป็น Dash
- พุ่งขณะอยู่บนกำแพง: ไม่ตกจากยอดหรือทะลุกำแพง
- ทดสอบผู้เล่นสองเครื่อง: ทุกเครื่องเห็นตำแหน่งพุ่งเดียวกัน
- เข้าใหม่: เซฟ 1–3 และสถิติเดิมอยู่ครบ

**อย่ารัน** `montra-dash-integration.mjs` กับเซิร์ฟเวอร์ที่ผู้เล่นใช้งานจริง ไฟล์นี้สร้างห้องทดสอบและสั่งเดินพุ่งโดยตรง ต้องรันแยกบน Local Test Server เท่านั้น

## 5. Rollback

หยุดเฉพาะ Node MONTRA และคืน source/build จากโฟลเดอร์ `backup-before-3slots-...` ที่ Installer แสดงไว้ ตรวจเวอร์ชันไฟล์ตามวันที่ อย่าคืนหรือเขียนทับโฟลเดอร์ `data\characters` ระหว่างย้อนกลับ เพราะไฟล์เซฟต้องเก็บต่อไป รุ่นเก่าอาจยังไม่รองรับ Dash แต่เซฟยังไม่หาย

**ข้อจำกัด:** ระบบการชน Dash ใช้ collision ที่เซิร์ฟเวอร์รู้จริง ได้แก่ watchwall ปัจจุบันและขอบแผนที่ สิ่งตกแต่งที่ยังไม่ได้เป็น Collider จะไม่ขวาง Dash
