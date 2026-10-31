# MONTRA — Thai Occult MMORPG Alpha

**Playable web client:** https://nustanakritwithai.github.io/Montra/  
**Code:** GitHub Pages frontend + Windows VPS Colyseus 0.18 / Schema 5 backend.

MONTRA is a **portrait, tap-to-move, third-person 3D** prototype. Players in the same `my_room` see each other walking and attacking a possessed ghost. The server is authoritative for movement/combat; GitHub Pages only renders the world.

## Current development stages

- **Alpha 0.1.5:** playable multiplayer movement, camera orbit, tap-to-attack and synchronized monster HP.
- **S1 Server Engine / frontend 0.1.6:** fixed server ticks, authoritative facing, player HP, strict movement/combat commands, monster AI (patrol/chase/attack/return), cooldowns and respawns.
- **Free PK Alpha / frontend 0.1.7:** tap another player to attack immediately without duel consent. Server validates target, range, movement, damage, cooldown, kills/deaths and respawn. No safe zones or permanent PK rewards in this alpha.
- **Summon NPC Alpha / frontend 0.1.8:** each online player may create one server-owned guardian spirit. NPCs replicate to everyone in the room, follow their owner, defend against attackers and assist in PvE and Free PK. Server owns stats, attack range/cooldown and cleanup on owner death or disconnect.
- **S0/S2 are not complete:** Node auto-start after Windows restart, player accounts, database, saves, trading and persistent inventory are NOT implemented.

**S1 code in GitHub does not change the live Windows VPS automatically.** Use the safe installer in the linked runbook, then restart only the MONTRA Node process and execute the live smoke tests.

## S1 server source of truth

- [Windows VPS install, test and rollback (Thai)](deploy/combat/S1-WINDOWS-VPS-TH.md)
- [Colyseus room](deploy/combat/MyRoom.ts)
- [Schema](deploy/combat/MyRoomState.ts)
- [Validated rules / rate limits](deploy/combat/GameRules.ts)
- [2-player smoke test](deploy/combat/smoke-test.mjs)
- [4-player S1 integration test](deploy/combat/s1-integration.mjs)
- [Monster AI test](deploy/combat/s1-monster-ai.mjs)
- [4-player Free PK anti-cheat test](deploy/combat/free-pk-integration.mjs)
- [Free PK Windows install & rollback guide (Thai)](deploy/combat/FREE-PK-WINDOWS-TH.md)
- [Summon NPC Windows install, tests and rollback guide (Thai)](deploy/combat/SUMMON-WINDOWS-TH.md)
- [4-player guardian summons regression test](deploy/combat/summon-integration.mjs)
- [Rule tests](deploy/combat/s1-rules.test.ts)
- [Reversible Windows installer](deploy/combat/install-windows.ps1)
- [Server verification workflow](.github/workflows/verify-combat.yml)

## Publish

GitHub Pages is deployed from **GitHub Actions** via
`/.github/workflows/deploy-pages.yml`. Every successful push to `main`
publishes the static frontend automatically. Do not change Pages to
"Deploy from a branch" for this repository.

## Networking

```text
Mobile web client (HTTPS GitHub Pages)
  → WSS through montra.157-85-96-139.sslip.io
  → Caddy HTTPS reverse proxy
  → Colyseus on 127.0.0.1:4108 (Windows VPS)
```

The server must run with `NODE_ENV=production`. Never publicly expose port
4108, Colyseus Playground or Monitor. Caddy currently also serves other VPS
projects, so deployments must not overwrite its shared configuration.

## Current limits

- Four users **per room**, not four users across the whole MMO.
- One illustrative monster; AI is server-side but no navmesh, obstacle collision or true line-of-sight yet.
- The server uses fixed 20 Hz ticks. No client prediction/rewind system has been enabled.
- The user session is transient; no persistent character identity or database.
- Free PK is enabled between any living players in the same room. There is no consent flow or safe-zone protection yet.
- Guardian ownership is transient (one per connected session) and not saved to a database. Guardian NPCs cannot yet be damaged or upgraded.
- No persistent spirit ownership, trading, economy or real reward payouts.
- This is a technical Alpha, not a production-secure MMORPG.
