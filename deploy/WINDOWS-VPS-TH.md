# MONTRA: เชื่อม GitHub Pages กับ VPS (Windows + Caddy)

**เป้าหมาย:** เว็บ `https://nustanakritwithai.github.io/Montra/` → `https://montra.157-85-96-139.sslip.io` (HTTPS/WSS) → Caddy → Colyseus 0.18 `127.0.0.1:4108`.

> [!IMPORTANT]
> **ยังไม่ได้เปลี่ยนค่าฝั่ง VPS ผ่าน GitHub**. การอัปเดต Repo จะเผยแพร่เฉพาะหน้าเว็บ ส่วน VPS ต้องตั้งค่าตามนี้เอง ห้ามเปิด port 4108, /monitor หรือ Playground สู่สาธารณะ ห้ามเขียนทับ Caddyfile ที่ CityManager ใช้งาน

## 1. ตรวจสอบแบบไม่แก้ VPS

เปิด PowerShell *บน VPS*:

```powershell
Test-NetConnection 127.0.0.1 -Port 4108
Invoke-WebRequest http://127.0.0.1:4108/hi -UseBasicParsing
Get-CimInstance Win32_Process -Filter "name = 'caddy.exe'" | Select-Object ProcessId, CommandLine
Get-Command caddy.exe -ErrorAction SilentlyContinue | Select-Object Source
```

- `4108` ต้องเป็น True และ `/hi` ควรตอบข้อความจาก Colyseus หากกำลังรัน
- ใช้ CommandLine ของ Caddy เพื่อค้นหา Caddyfile **จริง** ที่ระบบเดิมใช้อยู่ (อย่าเดาตำแหน่ง). ถ้าไม่แน่ใจ ให้หยุดก่อนและส่งผลตรวจกลับมา
- หาก VPS IP เปลี่ยนจาก `157.85.96.139` ให้เปลี่ยนชื่อโฮสต์ทั้งใน Caddyfile และค่าเริ่มต้นฝั่งเว็บ

## 2. เปลี่ยน Colyseus จาก dev เป็น production

บน PowerShell ที่กำลังรัน `npm.cmd start` ของ MONTRA **เท่านั้น** กด `Ctrl+C` เพื่อหยุดเซิร์ฟเวอร์เดิม (อย่าหยุด CityManager/Caddy). จากนั้นเปิดใหม่:

```powershell
cd C:\Montra\online-server
npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw "MONTRA TypeScript build failed; do not proceed" }
$env:NODE_ENV = "production"
$env:PORT = "4108"
node .\build\index.js
```

ปล่อย PowerShell หน้าต่างนี้ไว้ให้ Node ทำงาน (หลังทดสอบค่อยตั้ง Windows service/process manager สำหรับรันถาวร). โหมด production ช่วยปิดหน้า Playground/Monitor ที่ `app.config.ts` เปิดเฉพาะตอน development; ห้ามรัน `tsx watch` ต่อสาธารณะ.

เปิด PowerShell ใหม่ ตรวจ:

```powershell
Invoke-WebRequest http://127.0.0.1:4108/hi -UseBasicParsing
```

## 3. เพิ่ม Caddy site โดยไม่เปลี่ยน route เดิม

ไฟล์ต้นแบบอยู่ที่ [Caddyfile.montra.example](./Caddyfile.montra.example).

1. สำรอง **Caddyfile ที่ใช้งานจริง** ก่อน
2. เปิดด้วย text editor แล้วนำ **เฉพาะบล็อก site** `montra.157-85-96-139.sslip.io { ... }` ไปเพิ่มเป็น block ใหม่ด้านล่าง โดยไม่ลบ site เดิม
3. ตรวจ syntax และ reload (เปลี่ยน `C:\PATH\TO\Caddyfile` เป็น path จริง):

```powershell
$cfg = "C:\PATH\TO\Caddyfile"
Copy-Item $cfg "$cfg.backup-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
caddy validate --config $cfg --adapter caddyfile
if ($LASTEXITCODE -ne 0) { throw "Invalid Caddyfile — do not reload" }
caddy reload --config $cfg --adapter caddyfile
if ($LASTEXITCODE -ne 0) { throw "Caddy reload failed — check existing config" }
```

> ข้อควรระวัง: **สำรองก่อนแก้** (หากใช้คำสั่งตัวอย่างด้านบน ต้องสำรองก่อนวางบล็อก ไม่ใช่หลังวางบล็อก). ควรใช้ตัวช่วย [enable-caddy.ps1](./enable-caddy.ps1) ที่สำรองก่อนปรับไฟล์ ตรวจ validation และย้อนคืนหากไม่ผ่าน เพื่อหลีกเลี่ยงการทำลาย route ของระบบเดิม

การ reload Caddy อาจทำให้การเชื่อม WebSocket ของแอปอื่นหลุดชั่วคราว (ไม่ใช่การลบข้อมูล).

## 4. ทดสอบ HTTPS/WSS

```powershell
Invoke-WebRequest https://montra.157-85-96-139.sslip.io/hi -UseBasicParsing
```

หากเจอ certificate/timeout ให้ตรวจ DNS ของ hostname, IP VPS ปัจจุบัน, firewall port 80/443 และ Caddy logs ก่อนแก้ระบบเกม.

จากมือถือเปิด `https://nustanakritwithai.github.io/Montra/`:
- หน้าเกมจะลองเชื่อมต่อปลายทาง MONTRA โดยอัตโนมัติ 1 ครั้ง
- ถ้าเชื่อมสำเร็จจะแสดง `LIVE`; ผู้เล่น 2 คนเห็นกันในห้อง `my_room`
- ถ้ายังไม่พร้อมหน้าเกมยังใช้ `DEMO` ได้ และสามารถกด `ออนไลน์` → `เชื่อมต่อออนไลน์` เพื่อลองอีกครั้ง
- หาก Chrome แจ้ง CORS/WebSocket error ให้คัดลอก console + Caddy log มาตรวจ ไม่ควรเปิด HTTP port 4108 แทน HTTPS

**Alpha V0.1:** ยังไม่มีบัญชีผู้เล่น/ฐานข้อมูล ไอเทมถาวรหรือระบบแลกเปลี่ยนจริง ห้ามถือเป็นเซิร์ฟเวอร์เกมที่พร้อมให้บริการเชิงพาณิชย์.
