# ขั้นตอนเผยแพร่จอมอาคมบน Windows

ใช้เมื่อ commit ที่จะติดตั้งรวมเข้า main และผ่าน CI แล้ว หน้าเว็บกับ Node server ต้องตรงรุ่น การนำเว็บขึ้นไม่ได้ติดตั้ง VPS โดยอัตโนมัติ

## ก่อนติดตั้ง

1. แจ้งผู้เล่น และจดวิธีเริ่ม MONTRA รวมทั้งค่า PORT, NODE_ENV, MONTRA_CHARACTER_DIR, MONTRA_ECONOMY_ENABLED และ MONTRA_WORLD_EXPANSION ที่ process เดิมใช้จริง อย่าแสดง token หรือรหัสลับในแชท
2. หยุดเฉพาะ MONTRA ด้วยวิธีเดิม ตรวจพอร์ต 4108 และยืนยันว่าไม่มี process ใดกำลังเขียนฐานข้อมูลเกม อย่าหยุด Node หรือบริการอื่นทั้งเครื่อง
3. สำรองและตรวจสำเนาโฟลเดอร์ข้อมูลจริงทั้งหมด รวม economy.sqlite, guilds.sqlite และไฟล์ -wal/-shm ที่มี เก็บอีกชุดนอก VPS ตัวติดตั้งจะสำรอง source, build และโฟลเดอร์ข้อมูลที่ระบุให้อีกชุด
4. หากใช้ SQLite เดิม ต้องเปิดด้วย MONTRA_ECONOMY_ENABLED=1 และตำแหน่งข้อมูลเดิม ห้ามปิดโหมดเศรษฐกิจหรือชี้ไปโฟลเดอร์ใหม่เพื่อแก้ปัญหาชั่วคราว

## ติดตั้ง

ตั้ง environment ของ PowerShell ให้ตรงกับบริการเดิม แทน <MERGE_SHA_40> ด้วย commit ที่ผ่าน CI แล้วรัน:

```powershell
$revision = '<MERGE_SHA_40>'
$installer = Join-Path $env:TEMP "montra-install-$revision.ps1"
New-Item -ItemType Directory -Path $env:TEMP -Force -ErrorAction Stop | Out-Null
Invoke-WebRequest -UseBasicParsing -ErrorAction Stop -Uri "https://raw.githubusercontent.com/nustanakritwithai/Montra/$revision/deploy/combat/install-windows.ps1" -OutFile $installer
powershell.exe -NoProfile -ExecutionPolicy Bypass -File $installer -Revision $revision
```

ต้องเห็น MONTRA OCCULT BUILD PASSED. และ source revision ที่ตรงกัน ตัวติดตั้งไม่เริ่มหรือรีสตาร์ตบริการ ให้เจ้าของเครื่องเริ่มเฉพาะ MONTRA ด้วย environment เดิม แล้วตรวจ LIVE ด้วยตัวละครทดสอบที่ได้รับอนุญาต: เลือกจอมอาคม เรียนวิชา จัดช่อง ใช้วิชา และออกเข้าเกมอีกครั้ง ไม่รัน integration tests กับเซฟหรือผู้เล่น LIVE

## กู้คืน

ตัวติดตั้งคืน source และ build ให้หาก build ล้มเหลว โดยไม่แก้ข้อมูลตัวละคร หากต้องย้อนรุ่นหลังมีผู้เล่นเริ่มใช้ตำราใหม่ ให้เก็บข้อมูลปัจจุบันก่อน รุ่นเก่าอาจไม่เก็บฟิลด์ occultBook เมื่อเขียนเซฟ ห้ามทับเซฟปัจจุบันด้วย backup เก่าหรือให้รุ่นเก่าเขียนโดยไม่วางแผนแปลงข้อมูลและความคืบหน้าหลังสำรอง แก้ไปข้างหน้าด้วยรุ่นที่รองรับข้อมูลปัจจุบันเป็นทางเลือกแรก
