# MONTRA — 3D Mobile Web MMORPG Prototype

**Alpha V0.1: หมู่บ้านอาคม** — vertical mobile-first, tap-to-move browser prototype.

- **GitHub Pages client:** `https://nustanakritwithai.github.io/Montra/`
- **Current mode:** local demo with a simple 3D village, walking, minimap, simulated spirit/possession visuals.
- **Optional online mode:** Colyseus 0.18 `my_room` server with `players` schema and `move: {x,z}` message.

## Publish

This is a static site. Under **Settings → Pages**, set **Deploy from a branch → main → /(root)**. No build process is required. The first Pages deployment may take a few minutes. `index.html` is the entry point.

## Important: VPS connectivity

GitHub Pages is HTTPS. The browser cannot connect to a public plain-HTTP Colyseus server from an HTTPS page. MONTRA needs a public HTTPS origin that reverse-proxies to the existing loopback server (`127.0.0.1:4108`) with **WebSocket upgrade (WSS)**. Enter the HTTPS origin using the in-game **ออนไลน์** panel. Do **not** expose the `4108` development port or `/playground` and `/monitor` publicly; run a production process and restrict those routes before enabling online players.

No VPS configuration, accounts, database, or existing CityManager files are modified by this repo.

## Current limits

- Test village is decorative; no obstacle-aware pathfinding or collision.
- DEMO controls are **local-only**, not saved or multiplayer.
- Server movement is limited to `[-20,20]` on x/z and supported by the existing Colyseus room.
- Combat, spirit summons and inventory are not connected to the server yet. No real trades or player data persistence.
- Third-party Babylon and Colyseus browser libraries are loaded from pinned/official CDNs, so internet access is needed.

## Development

Open `index.html` via any HTTP static web server (not `file://`). For local VPS testing, enter `http://127.0.0.1:4108` in the online panel from a browser running **on that VPS**. For GitHub Pages use an `https://` server origin only.

## Files

- `index.html` — mobile HUD, sheets and CDN scripts
- `styles.css` — portrait-first UI
- `main.js` — Babylon scene, demo movement, Colyseus client adapter
- `.nojekyll` — serve static assets directly