# ติดตั้งอาชีพนักมวยบน Windows VPS

เอกสารนี้ใช้กับ commit ที่รวมเข้า `main` และผ่าน GitHub Actions แล้วเท่านั้น เว็บ GitHub Pages และเซิร์ฟเวอร์ Node เป็นคนละส่วน การอัปเดตเว็บไม่ได้อัปเดตเซิร์ฟเวอร์

## ก่อนติดตั้ง

1. เจ้าของ VPS แจ้งผู้เล่นและหยุดเฉพาะ MONTRA ตามวิธีที่ใช้อยู่ ตรวจให้แน่ใจว่าไม่มีธุรกรรมหรือ process อื่นใช้ฐานข้อมูล MONTRA อย่าหยุด Node หรือบริการเกมอื่นทั้งเครื่อง ตัวติดตั้งไม่หยุดหรือเริ่มบริการให้
2. ยืนยัน `MONTRA_CHARACTER_DIR` และค่า `MONTRA_ECONOMY_ENABLED` ที่บริการ MONTRA ใช้จริง ตั้งค่าใน PowerShell สำหรับติดตั้งให้ตรงกัน หากไม่มี `MONTRA_CHARACTER_DIR` โค้ดใช้ `C:\Montra\online-server\data\characters` ตรวจว่าตำแหน่งนี้เป็นข้อมูลจริงก่อนดำเนินการ
3. สำรองโฟลเดอร์ข้อมูลทั้งชุด รวมไฟล์ `economy.sqlite`, `guilds.sqlite` และไฟล์ `-wal`/`-shm` ที่มีอยู่ หลังหยุดผู้ใช้ฐานข้อมูลทั้งหมด ตรวจสำเนาและเก็บอีกชุดนอก VPS ตัวติดตั้งยังสำรอง source, build และโฟลเดอร์ข้อมูลที่ระบุให้อีกชุดก่อนแก้ไฟล์
4. ตรวจพื้นที่ว่างสำหรับ source, build และสำเนาข้อมูลทั้งหมด ห้ามใช้พอร์ตจริงหรือข้อมูลจริงรัน integration tests

## ติดตั้ง source จาก commit ที่ตรวจแล้ว

แทน `<COMMIT_SHA_40>` ด้วย SHA 40 ตัวของ merge commit ที่ผ่านการตรวจ และเปิด PowerShell ในฐานะผู้ดูแล:

```powershell
$revision = '<COMMIT_SHA_40>'
$installer = Join-Path $env:TEMP "montra-install-$revision.ps1"
Invoke-WebRequest -UseBasicParsing -Uri "https://raw.githubusercontent.com/nustanakritwithai/Montra/$revision/deploy/combat/install-windows.ps1" -OutFile $installer
powershell.exe -NoProfile -ExecutionPolicy Bypass -File $installer -Revision $revision
```

ต้องเห็น `MONTRA MUAY BUILD PASSED.`, SHA ที่ตรงกัน และตำแหน่ง backup ตัวติดตั้งดาวน์โหลดทุกไฟล์จาก SHA เดียว ตรวจข้อมูลก่อนแก้ source สำรองก่อน build และคืน source/build หาก build ล้มเหลว โดยไม่เปลี่ยนข้อมูลตัวละคร ตัวติดตั้งจะไม่เริ่มหรือรีสตาร์ต MONTRA, Caddy หรือเกมอื่น

จากนั้นเจ้าของ VPS เริ่มเฉพาะบริการ MONTRA ด้วยการตั้งค่าเดิม และตรวจว่าสามารถเข้า LIVE ได้ด้วยเซฟทดสอบที่ได้รับอนุญาต ตรวจการเลือกนักมวย ตำรามวย และระบบเดิม รวมถึงสถานะสงครามพื้นที่ โดยหลีกเลี่ยงการทดสอบที่เปลี่ยนข้อมูลผู้เล่นจริง

## กู้คืน

เก็บสำเนาข้อมูลปัจจุบันก่อนกู้คืน source/build และตรวจความเข้ากันได้ก่อนเปิดให้เขียนอีกครั้ง เซิร์ฟเวอร์รุ่นเก่าอาจไม่รู้จัก `muay_boran`, `muay_wraps`, ตำรามวย หรือ `mastery` ห้ามนำ build เก่ามาเขียนเซฟรุ่นใหม่หรือทับข้อมูลปัจจุบันด้วย backup เก่าโดยไม่วางแผนแปลง/กู้คืน เพราะอาจสูญเสียความคืบหน้าหลังสำรองข้อมูล การแก้ไปข้างหน้าด้วย build ที่อ่านรูปแบบเซฟปัจจุบันได้เป็นทางเลือกแรก
