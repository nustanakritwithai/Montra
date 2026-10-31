# MONTRA S2 — ตัวละครถาวรแบบ Guest (Windows VPS)

**สถานะ:** โค้ดใน GitHub ยังไม่เปลี่ยนโปรเซส Windows VPS จนกว่าจะติดตั้งและรีสตาร์ตเฉพาะ MONTRA

## ความสามารถและข้อจำกัด

ผู้เล่นได้รับรหัสลับสุ่ม 256 บิตใน `localStorage` (แยกตามเซิร์ฟเวอร์) เซิร์ฟเวอร์ใช้ SHA-256 ของรหัสเป็นชื่อไฟล์ส่วนตัว **ไม่ส่งรหัสลับใน Schema และไม่บันทึกรหัสลับลงดิสก์** ข้อมูลที่บันทึกคือชื่อ, ระดับ, XP, HP, จุดยืนปลอดภัย และสถิติชนะ/แพ้ PK ระดับ/XP ยังไม่มีระบบสะสมจริง

บันทึกทุก 15 วินาที เมื่อเปลี่ยนชื่อ ชนะ PK ถูก KO เกิดใหม่ และออกเกม ตำแหน่งที่ผิดกฎภูมิประเทศใหม่จะถูกรีเซ็ตเป็นจุดเกิดที่ปลอดภัย หากตายหรือ HP หมดจะเกิดใหม่ด้วย HP เต็ม

แตะชื่อมุมบนเพื่อเปิดแผงตัวละคร เปลี่ยนชื่อ คัดลอกรหัสกู้คืน หรือกรอกรหัสกู้คืนจากอีกอุปกรณ์ ผู้เล่นเดิมที่ไม่มี token ยังเล่นแบบชั่วคราวได้ **รหัสกู้คืนเทียบเท่ารหัสผ่าน ห้ามเผยแพร่หรือแชร์** หากล้างข้อมูลเบราว์เซอร์และไม่มีรหัสนี้จะกู้ตัวละครเดิมไม่ได้

ยังไม่มีบัญชีอีเมล/รหัสผ่าน ฐานข้อมูล SQL เงิน ไอเทม หรือวิญญาณถาวร และใช้ Node instance เดียว ไม่ใช่ storage แบบ multi-node

## 1. ตรวจ GitHub Actions

`Verify MONTRA Combat Server` บน `main` ต้องผ่านทั้ง TypeScript, PvE, PK, Summon, RRT, Height และชุดทดสอบ S2 ที่รีสตาร์ต Node ภายใต้โฟลเดอร์ชั่วคราว

**ห้ามรัน** สคริปต์ทดสอบ `character-persistence-integration.mjs` กับฐานข้อมูลผู้เล่นจริง

## 2. สำรองไฟล์บน Windows VPS

เปิด PowerShell บน VPS ตรวจว่า `C:\Montra\online-server` คือโปรเจกต์ MONTRA โดยเฉพาะ

ตำแหน่งเซฟเริ่มต้นเมื่อ Node ทำงานในโฟลเดอร์นี้คือ `C:\Montra\online-server\data\characters` ถ้าตั้ง `MONTRA_CHARACTER_DIR` ไว้ จะใช้ตำแหน่งนั้นแทน

หากมีตัวละครอยู่แล้ว ให้สำรองโฟลเดอร์ข้อมูลแยกไว้ในพื้นที่ส่วนตัวก่อนติดตั้ง Installer จะสำรองข้อมูลอีกชุดไปที่ `backup-before-s2-...` โดยไม่ลบข้อมูลเดิม

## 3. ติดตั้งแบบ Stage + Build (ยังไม่รีสตาร์ต)

รันใน PowerShell ของ Windows VPS:

```powershell
New-Item -ItemType Directory -Path "C:\Montra\deploy" -Force | Out-Null
Invoke-WebRequest "https://raw.githubusercontent.com/nustanakritwithai/Montra/main/deploy/combat/install-windows.ps1" -OutFile "C:\Montra\deploy\install-s2.ps1" -UseBasicParsing
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\Montra\deploy\install-s2.ps1"
if ($LASTEXITCODE -ne 0) { throw "S2 build failed: do not restart MONTRA Node" }
```

ต้องเห็น `MONTRA S2 BUILD PASSED.` และพาธ Backup ใหม่ Installer จะลง source + build ของ MONTRA เท่านั้น ไม่แตะ Caddy, CityManager, firewall, port หรือ Node process อื่น

## 4. เริ่มเซิร์ฟเวอร์ใหม่เฉพาะ MONTRA

หยุด **เฉพาะ** MONTRA Node ที่พอร์ต 4108 ด้วยวิธีเดิม (หน้าต่าง Terminal หรือ Service Manager) อย่าเริ่ม Node ซ้อนอีกตัว

```powershell
cd C:\Montra\online-server
$env:NODE_ENV = "production"
$env:PORT = "4108"
# หากรันจาก path อื่น ต้องกำหนด MONTRA_CHARACTER_DIR เป็น absolute path เดิมอย่างคงที่
node .\build\index.js
```

ทดสอบ `http://127.0.0.1:4108/hi` ภายใน VPS และ HTTPS/WSS ผ่าน Caddy เดิม **ห้ามเปิด 4108 สู่สาธารณะ**

## 5. ทดสอบจริง

1. เข้า GitHub Pages มือถือเดียวกัน ตรวจ LIVE และหน้าโปรไฟล์ขึ้น `เก็บบน VPS`
2. เปลี่ยนชื่อ เดินไปจุดปลอดภัย รออย่างน้อย 15 วินาที ออกจากเกม
3. เปิดเกมอีกครั้ง ชื่อ ตำแหน่ง รหัสตัวละคร และสถิติ PK ต้องตรงเดิม
4. คัดลอกรหัสกู้คืนเก็บเป็นความลับ; ลองกรอกบนอุปกรณ์อื่นหลังออกจากอุปกรณ์เก่า
5. ทดสอบ PvE, PK, Summon, RRT, ปีนกำแพง และ UI แนวตั้งเหมือนเดิม
6. ตรวจ Node log ว่าไม่มีข้อความ `MONTRA S2 save failed`

กรณี `character_already_online` ต้องออกจาก session เก่า หรือรอให้การเชื่อมต่อเก่าปิดก่อน ห้ามใช้ตัวละครเดียวกันพร้อมกัน

## 6. การสำรองข้อมูลและ Rollback

เก็บโฟลเดอร์ `data\characters` หรือ `MONTRA_CHARACTER_DIR` ในพื้นที่ส่วนตัวที่ไม่ใช่ web root และไม่ commit ไฟล์เซฟหรือรหัสกู้คืนขึ้น GitHub การเขียนไฟล์ใหม่ใช้ temporary file + rename จึงไม่เขียนทับครึ่งไฟล์ หากอ่าน JSON เสีย ระบบจะปฏิเสธเข้าห้อง ไม่สร้างตัวละครใหม่ทับไฟล์นั้น

หากจำเป็นต้องย้อนรุ่น ให้หยุดเฉพาะ MONTRA Node คืน source และ build จาก `backup-before-s2-...` ที่ installer บันทึกไว้ แล้วเปิด Node เดิม **ห้ามลบหรือ rollback โฟลเดอร์ตัวละคร** เพราะแม้ S1 รุ่นเก่าไม่อ่านเซฟ แต่เซฟยังอยู่สำหรับ S2 ในอนาคต

**หมายเหตุ:** Stage/CI ที่ผ่านไม่ยืนยันว่าติดตั้ง Windows VPS จริงแล้ว ต้องตรวจ LIVE หลังติดตั้งแยกอีกครั้ง
