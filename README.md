# MONTRA — Thai Occult MMORPG Alpha

**Playable web client:** https://nustanakritwithai.github.io/Montra/  
**Code:** GitHub Pages frontend + Windows VPS Colyseus 0.18 / Schema 5 backend.

MONTRA is a **portrait, tap-to-move, third-person 3D** prototype. Players in the same `my_room` see each other walking and attacking a possessed ghost. The server is authoritative for movement/combat; GitHub Pages only renders the world.

## Current development stages

- **Alpha 0.1.5:** playable multiplayer movement, camera orbit, tap-to-attack and synchronized monster HP.
- **S1 Server Engine / frontend 0.1.6:** fixed server ticks, authoritative facing, player HP, strict movement/combat commands, monster AI (patrol/chase/attack/return), cooldowns and respawns.
- **Free PK Alpha / frontend 0.1.7:** tap another player to attack immediately without duel consent. Server validates target, range, movement, damage, cooldown, kills/deaths and respawn. No safe zones or permanent PK rewards in this alpha.
- **Summon NPC Alpha / frontend 0.1.8:** each online player may create one server-owned guardian spirit. NPCs replicate to everyone in the room, follow their owner, defend against attackers and assist in PvE and Free PK. Server owns stats, attack range/cooldown and cleanup on owner death or disconnect.
- **Elevation Alpha / frontend 0.1.9:** server-owned vertical positioning (Y), one climbable 4-unit-high wall with a ladder, solid ground collision, an elevated walkable crest, magic projectiles with a 3D range and wall line-of-sight checks, and floating summons following owner altitude.
- **Monster navigation RRT patch (server only):** adapt the RRT path planner from [RRT-Game-Lab/multi_target_core.js](https://github.com/nustanakritwithai/RRT-Game-Lab/blob/main/multi_target_core.js) to MONTRA X/Z; monsters follow obstacle-safe waypoints for patrol/chase/return instead of getting stuck walking into the watchwall. Slow bounded replanning is intentional, and no combat or frontend rules change.
- **S2 Guest Character Persistence / frontend 0.2.0 (staged in GitHub):** browser-generated 256-bit guest token, hashed server-side filename, file-backed atomic snapshots, 15-second autosave and disconnect saves; character name, ID, level, XP, HP, safe position, PK kills/deaths survive Node restart. Mobile profile supports renaming plus export/import of a secret recovery key. Legacy non-token clients still play transiently.
- **Alpha 0.2.1 — three saves per Guest ID (requires latest VPS code):** each 256-bit guest token owns 3 independent character slots. Slot 1 uses the **original S2 filename** and preserves existing progress without migration; slots 2–3 are new domain-separated SHA-256 filenames. The mobile character selector appears before LIVE and can be reopened through the profile. The server rejects concurrent logins into different slots of the same Guest ID. A legacy S2 server is safely refused for slots 2–3 rather than silently joining slot 1. No existing saves are deleted.
- **Alpha 0.2.2 — wider camera/pinch:** camera radius expanded for mobile views; two-finger pinch zoom preserves tap-to-move.
- **Alpha 0.2.3 — server-authoritative Dash:** quick directional swipe anywhere on the bottom existing skill/nav menu triggers dash with no new button. Camera-relative direction only; Colyseus validates a unit vector, moves at 13.5 units/s for up to 4.5 units, 1.8s cooldown, swept wall/map/platform collision at 20Hz, forbids dash during climbing/death, and syncs all players. Old servers are detected by `dashAvailable`; browser DEMO simulates dash locally, LIVE requires installing the updated VPS build.
- **Alpha 0.2.4 — high overhead camera/raised swipe zone:** farther bird's-eye mobile view and expanded invisible swipe-dash region above the existing bottom skills.
- **Alpha 0.2.5 — server-owned 6m flight:** button toggles a 6m airborne layer from ground or the existing walkable 4m watchwall; tap to move horizontally while flying and descend safely to 4m wall crest or 0m ground. Landing into the solid wall is rejected. Vertical speed is limited to 4m/s at 20Hz, and flight cannot stack with dash/climb. Preserves the original 3 Guest character files and v1 save format; saved Y=6 resumes as flight after Node restart. DEMO works in browser; LIVE requires the updated Windows VPS build.
- **Alpha 0.2.6 — permanent 12-slot inventory + small health potions:** each Guest character save owns 12 server-owned item slots. Grant three `health_potion` items to existing/new characters **exactly once**, restored independently for slots 1–3. The potion heals up to 30 real HP with a 1s cooldown; the server validates item selection and persists the decremented count **before** acknowledging use. Legacy save JSON is upgraded atomically in place with no ID migration. Mobile bag supports tap-to-select and use; offline DEMO inventory is never persisted.
- **Alpha 0.2.7 — persistent 3-weapon loadout:** each Guest character receives a ritual dagger (+4 melee), arcane sword (+8 melee) and spirit staff (+6 magic ranged) exactly once. Only one weapon can be equipped; Colyseus calculates combat damage and replicates the visible held low-poly model. Equipping/unequipping saves atomically before activation. Legacy V0.2.6 inventories retain EXACT remaining health potion counts (including zero) and acquire weapons without regranting potions. The equipped weapon persists across Node restart and all 3 character slots remain separate.
- **Alpha 0.2.9 — room chat:** mobile chat offers a current-map channel and a room-wide channel. Messages are transient, limited to 200 Unicode code points, validated and rate-limited by the server. Room-wide chat spans maps in the same room only; it does not reach other Colyseus rooms.
- **Alpha 0.3.0 — status and EXP prototype:** the finishing player's persistent character gains EXP from the possessed ghost and stats increase automatically with level. Level 1 needs 150 EXP; the next threshold is `50 * currentLevel² + 100`, up to level 100. A level 1 ghost grants 100 EXP at equal level, reduced by 5% per player level above it; from level 21 it grants zero. Higher-level monsters and quests are not yet implemented. HP, ATK, DEF, magic ATK/DEF, stamina, regeneration and server-owned damage use the Hybrid rules in `Progression.ts`. Existing HP and inventory are preserved. Values and PvP balance require playtesting. PvP grants no EXP.
- **Economy server prototype:** optional single-process SQLite-backed test gold, market escrow and mutually confirmed direct trades. Enable explicitly with `MONTRA_ECONOMY_ENABLED=1`; the current browser has no economy UI. Migrated SQLite data becomes authoritative and cannot safely be rolled back to JSON-only builds. Read the economy operations and backup guide before activation.
- **Still not complete:** password-backed accounts, shops, trading, monster loot, armor/equipment beyond one weapon, upgrades, multi-node shared storage and Windows auto-start. Changes in GitHub do NOT update the live VPS until safely installed.

**Code pushed to GitHub does not change the live Windows VPS automatically.** To enable LIVE weapons, back up the current Guest 1–3 saves and stage/build the V0.2.7 source using the safe installer. Restart ONLY MONTRA Node after a successful build. Do not run integration tests on live players. Never roll back to a pre-weapons build on upgraded save data without a data-preservation plan: V0.2.6 validation does not understand weapon items.

## S1 server source of truth

- [V0.2.9 chat Windows staging and rollback (Thai)](deploy/combat/CHAT-WINDOWS-TH.md)
- [V0.3.0 status and EXP Windows staging and rollback (Thai)](deploy/combat/STATUS-EXP-WINDOWS-TH.md)
- [Economy server protocol, activation and backup (Thai)](deploy/combat/ECONOMY-SERVER-TH.md)

- [V0.2.8 world map Windows staging and rollback (Thai)](deploy/combat/WORLD-MAPS-WINDOWS-TH.md)
- V0.2.8 uses one Colyseus room with map-aware simulation and client rendering. Zone data remains replicated to the room; this is not a privacy boundary or distributed World Server.

- [Alpha 0.2.7 permanent weapons Windows VPS deployment + rollback (Thai)](deploy/combat/WEAPONS-WINDOWS-VPS-TH.md)
- [Isolated real weapon equip + PvP/ranged combat integration](deploy/combat/weapon-integration.mjs)
- [Alpha 0.2.6 Inventory / health potion Windows VPS install + data preservation (Thai)](deploy/combat/INVENTORY-WINDOWS-VPS-TH.md)
- [Validated server-owned 12-slot item/potion rules](deploy/combat/ItemRules.ts)
- [Health potion input/cooldown and anti-cheat unit tests](deploy/combat/item-rules.test.ts)
- [Alpha 0.2.5 flight / watchwall Windows VPS deployment and rollback (Thai)](deploy/combat/FLIGHT-WINDOWS-VPS-TH.md)
- [Isolated real Colyseus 6m flight integration test](deploy/combat/flight-integration.mjs)
- [Alpha 0.2.3 Dash Windows VPS stage/build/test/rollback (Thai)](deploy/combat/DASH-WINDOWS-VPS-TH.md)
- [Dash collision and direction validation](deploy/combat/DashRules.ts)
- [Dash rules anti-cheat tests](deploy/combat/dash-rules.test.ts)
- [Dash real-room integration test](deploy/combat/dash-integration.mjs)
- [0.2.1 Three-save-slot Windows VPS installation + backups (Thai)](deploy/combat/THREE-SLOTS-WINDOWS-TH.md)
- [S2 Guest Character safe Windows deployment / backup / rollback (Thai)](deploy/combat/S2-CHARACTERS-WINDOWS-TH.md)
- [S1 Windows VPS install, test and rollback (Thai)](deploy/combat/S1-WINDOWS-VPS-TH.md)
- [S2 file-backed durable CharacterStore](deploy/combat/CharacterStore.ts)
- [S2 unit tests for credential validation and atomic snapshots](deploy/combat/character-store.test.ts)
- [S2 isolated Node-restart integration test](deploy/combat/character-persistence-integration.mjs)
- [Colyseus room](deploy/combat/MyRoom.ts)
- [Schema](deploy/combat/MyRoomState.ts)
- [Validated rules / rate limits](deploy/combat/GameRules.ts)
- [2-player smoke test](deploy/combat/smoke-test.mjs)
- [4-player S1 integration test](deploy/combat/s1-integration.mjs)
- [Monster AI test](deploy/combat/s1-monster-ai.mjs)
- [Monster RRT path planner](deploy/combat/MonsterRRT.ts)
- [Monster RRT unit tests](deploy/combat/monster-rrt.test.ts)
- [Live Monster RRT wall detour test](deploy/combat/monster-rrt-integration.mjs)
- [Monster RRT Windows VPS install/rollback](deploy/combat/MONSTER-RRT-WINDOWS-TH.md)
- [4-player Free PK anti-cheat test](deploy/combat/free-pk-integration.mjs)
- [Free PK Windows install & rollback guide (Thai)](deploy/combat/FREE-PK-WINDOWS-TH.md)
- [Summon NPC Windows install, tests and rollback guide (Thai)](deploy/combat/SUMMON-WINDOWS-TH.md)
- [Elevation + wall shooting Windows deployment guide (Thai)](deploy/combat/ELEVATION-WINDOWS-TH.md)
- [Authoritative 3D watchwall, ladder and line-of-sight rules](deploy/combat/HeightRules.ts)
- [Four-player elevation and cover integration test](deploy/combat/elevation-integration.mjs)
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
- One illustrative monster with RRT wall-avoidance, one physically solid fortification, and basic server ray-vs-wall line of sight. Dash/walking uses the **server's real watchwall/platform/map boundaries**, not decorative house/tree meshes. Flight is a fixed 6m high air layer, not unlimited ascent. General-purpose navmesh, universal house collisions, ballistic physics and jumping are not yet available.
- The server uses fixed 20 Hz ticks. No client prediction/rewind system has been enabled.
- Alpha 0.2.1 supports **three character saves per recovery token** on a single Windows VPS. Slot 1 keeps the original S2 file. No username/password account, automated lost-token recovery, remote backup or relational database. Clearing browser data without exporting the token loses access to all 3 slots.
- Free PK is enabled between any living players in the same room. There is no consent flow or safe-zone protection yet.
- Guardian ownership is transient (one per connected session) and not saved to a database. Guardian NPCs cannot yet be damaged or upgraded.
- Guardian summon remains transient; character identity/name/stats/location and one health potion stack in a 12-slot inventory are saved per character. No item drops, trading, equipment, economy or real reward payouts.
- This is a technical Alpha, not a production-secure MMORPG.
