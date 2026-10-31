# MONTRA S1 — Server Game Engine (Windows VPS)

**Game:** https://nustanakritwithai.github.io/Montra/  
**VPS:** Colyseus 0.18 / Schema 5, `C:\Montra\online-server`, internal port `4108`  
**Caddy:** `https://montra.157-85-96-139.sslip.io` → `127.0.0.1:4108`

## What S1 adds

- Server-authoritative **20 Hz fixed-step** movement and facing (not dependent on client FPS).
- Move requests are destinations, not teleportation, speed, or facing instructions.
- Input validation: exact payload shapes, finite in-bounds coordinates, per-session token-bucket throttles.
- Attack requests accept **only** `{ targetId: "possessed-1" }`; the client cannot set damage/HP/cooldown.
- Attack order automatically approaches a moving monster, with server attack-distance and cooldown checks.
- AI monster: patrol → aggro/chase → attack player → return/leash → death/respawn.
- Server-owned player HP, knockdown/respawn, monster HP, AI state and facing.
- Same existing room ID `my_room`, max 4 concurrent players per room.
- Optional frontend adapter reads authoritative facing/HP, falling back when connected to old server versions.

**Limitations:** S1 is **not** a persistent MMO platform. No user accounts, inventory DB, navmesh/collision, anti-DDoS, world sharding, or reconnect identity. The AI uses planar distance, not real line of sight.

## 1. Stage S1 on Windows VPS (does not restart Node/Caddy)

Copy the entire block into a Windows VPS PowerShell:

```powershell
New-Item -ItemType Directory -Path "C:\Montra\deploy" -Force | Out-Null
Invoke-WebRequest "https://raw.githubusercontent.com/nustanakritwithai/Montra/main/deploy/combat/install-windows.ps1" `
  -OutFile "C:\Montra\deploy\install-s1.ps1" -UseBasicParsing

powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File "C:\Montra\deploy\install-s1.ps1"

if ($LASTEXITCODE -ne 0) { throw "MONTRA S1 installer failed. Do not restart Node." }
```

Installer backs up old TypeScript files and compiled build, downloads new S1 sources, builds with existing npm dependencies, and **rolls back files on Build errors**. It never touches Caddy/CityManager.

Required output: `MONTRA S1 BUILD PASSED.` and a `backup-before-s1-YYYYMMDD-HHMMSS` folder.

## 2. Restart ONLY the MONTRA process

Check existing owner:

```powershell
Get-NetTCPConnection -LocalPort 4108 -State Listen -ErrorAction SilentlyContinue |
  ForEach-Object {
    Get-CimInstance Win32_Process -Filter "ProcessId = $($_.OwningProcess)" |
      Select-Object ProcessId, Name, CommandLine
  }
```

If launched manually in a separate PowerShell, stop that MONTRA window with `Ctrl+C`; if a Windows Service supervises it, restart **that service**, not a duplicate process. Do not kill Caddy or a CityManager process.

Once port 4108 is free, start MONTRA in the previously used window:

```powershell
cd C:\Montra\online-server
$env:NODE_ENV = "production"
$env:PORT = "4108"
node .\build\index.js
```

Keep this window running. **S0 Windows auto-start has not yet been built**, so a VPS reboot may still need a manual service start.

## 3. Tests in a SECOND PowerShell window

```powershell
cd C:\Montra\online-server

Invoke-WebRequest "http://127.0.0.1:4108/hi" -UseBasicParsing
Invoke-WebRequest "https://montra.157-85-96-139.sslip.io/hi" -UseBasicParsing

node .\montra-combat-smoke-test.mjs
if ($LASTEXITCODE -ne 0) { throw "MONTRA 2-user smoke test failed" }

node .\montra-s1-integration.mjs
if ($LASTEXITCODE -ne 0) { throw "MONTRA 4-user S1 test failed" }

node .\montra-s1-monster-ai.mjs
if ($LASTEXITCODE -ne 0) { throw "MONTRA monster AI test failed" }
```

Expected test output includes:
- `PASS: two users in room` and `shared monster HP 100 -> 80`
- `PASS: forged movement speed, NaN, damage and HP payloads rejected`
- `PASS: four player positions, max speed and facing synchronized`
- `PASS: attacks obey range and broadcast shared HP to four users`
- `PASS: synchronized monster respawn via server time`
- `PASS: excessive commands rate-limited without invalid state`
- `PASS: monster AI aggros and chases players using server state`
- `PASS: monster damages player exactly 8HP, cooldown enforced`

The tests create **independent temporary rooms** and do not affect existing game players.

## 4. Manual browser check

Open the GitHub Pages link on 2 mobile devices and verify:
- Both show `LIVE` and can move independently.
- Other player's face direction matches server data, including while attacking.
- Tapping the possessed monster auto-approaches then reduces shared HP.
- Ghost follows players, can damage player HP, and respawns.
- Tapping ground cancels auto-attacks.

## 5. Emergency rollback (MONTRA only)

Use the backup directory printed by the installer. **Stop only the MONTRA Node process first**, then restore its files and build:

```powershell
$base = "C:\Montra\online-server"
$backup = Get-ChildItem "$base\backup-before-s1-*" -Directory |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

if (!$backup) { throw "No S1 backup found; stop before any manual deletion" }

Copy-Item "$($backup.FullName)\src\rooms\MyRoom.ts" "$base\src\rooms\MyRoom.ts" -Force
Copy-Item "$($backup.FullName)\src\rooms\schema\MyRoomState.ts" "$base\src\rooms\schema\MyRoomState.ts" -Force

$oldRules = "$($backup.FullName)\src\rooms\GameRules.ts"
if (Test-Path $oldRules) {
  Copy-Item $oldRules "$base\src\rooms\GameRules.ts" -Force
} else {
  Remove-Item "$base\src\rooms\GameRules.ts" -Force -ErrorAction SilentlyContinue
}

if (!(Test-Path "$($backup.FullName)\build")) {
  throw "Compiled build backup not found — stop and investigate"
}
Remove-Item "$base\build" -Force -Recurse
Copy-Item "$($backup.FullName)\build" "$base\build" -Recurse
```

Then start only the existing MONTRA process again. No Caddy or CityManager changes are required. If a deployment fails, save the error log rather than changing firewall ports.

## Source-of-truth files

- `deploy/combat/MyRoom.ts` — authoritative room logic, fixed-step loop, AI and combat
- `deploy/combat/MyRoomState.ts` — Colyseus network schema
- `deploy/combat/GameRules.ts` — rule constants, command validation and rate limiting
- `deploy/combat/smoke-test.mjs` — 2 users, basic attack synchronization
- `deploy/combat/s1-integration.mjs` — 4 users, anti-cheat, facing, autoattack, respawn
- `deploy/combat/s1-monster-ai.mjs` — monster aggro, pursuit, player damage
- `deploy/combat/s1-rules.test.ts` — isolated rule validation
- `deploy/combat/install-windows.ps1` — staged installation and rollback
- `.github/workflows/verify-combat.yml` — CI typecheck and integration tests
