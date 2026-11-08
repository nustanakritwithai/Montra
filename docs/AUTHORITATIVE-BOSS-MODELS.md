# Existing authoritative bosses: client models

This release renders the 14 existing `RegionalBosses` definitions and `atlas_rift_warden` through the existing ghost-rig pipeline. It reuses 11 shipped rig styles, the shared `thai-male.glb`, primitive fallbacks, and materials. This is not 15 newly authored creature assets. Names, map access, targeting IDs, position/facing, HP, damage, loot and respawn timers remain server-owned and unchanged.

`BOSS_VISUALS` in `src/client/render/035-ghost-instantiation.js` explicitly maps every supported boss ID and expected map to a rig, scale and royal seal. Other IDs continue through the existing keeper fallback. A recognized name on a wrong map or a non-boss tier does not select a boss model. Regions disabled by server configuration remain disabled; this client does not spawn enemies or open maps.

## Lifecycle and authority

- The existing server state creates and positions the model. Walk/turn interpolation and spawn/death poses reuse the ghost animator. Accepted `monster_hit` and `combat_hit` messages drive attack and hurt poses.
- The existing orange strike boundary uses `worldDefinition.maps[mapId].boss.strikeRadius`, unaffected by model scale. Windup cancellation never invents damage or an impact.
- Boss rigs skip the legacy local phase-2/shield/enrage system. No shield HP, stagger, minion damage or new phase mechanics are advertised as server state.
- A slow or failed shared body download retains an animated primitive fallback. A successful load replaces only the visual children, retaining the authoritative target root and warning mesh. Late callbacks cannot resurrect a disposed root.
- Repeated dead snapshots do not replay death; a late join to a defeated boss starts hidden. Respawn clears the prior action timeline. Leaving a map disposes model children, skeletons and owned MultiMaterial wrappers while preserving shared submaterials.
- Conservative pick/nameplate heights cover both skinned and fallback crowns and crests. They are visual proxies, not server collision or attack range.

## Deferred work and deployment scope

The separate Thao Wessuwan Titan encounter and Meteor remain unchanged and unavailable. Their VPS implementation status is not confirmed. No server source, schema, data migration, balance value, save, account or VPS process is changed by this release, so no production data backup/restore or server restart is performed. Existing browser code can be rolled back through the preceding Pages revision without changing player data.

## Verification

Run Node from `.nvmrc` for the ordinary client/build checks. Keep Babylon test dependencies isolated from the root dependency-free build:

```sh
npm install --prefix /tmp/montra-boss-test --ignore-scripts --no-audit --no-fund babylonjs@8.34.0 babylonjs-loaders@8.34.0 playwright@1.56.1
NODE_PATH=/tmp/montra-boss-test/node_modules node --test deploy/combat/authoritative-boss-model-runtime.cjs
/tmp/montra-boss-test/node_modules/.bin/playwright install chromium
NODE_PATH=/tmp/montra-boss-test/node_modules node deploy/combat/authoritative-boss-model-browser-test.cjs
```

The runtime suite executes production source against Babylon NullEngine and checks all 15 IDs, picks, server state immutability, world-space warning radius, combat events, death/respawn/map transitions, pending/failed asset loading and repeated resource cleanup. NullEngine is not screenshot evidence.

The dedicated `Verify authoritative boss models` workflow additionally loads the actual shipped GLB through the actual production loader into real WebGL. It captures all 15 identities and action poses with both successful and failed downloads at desktop and 390px touch-emulated viewports. All HTTP is restricted to the local fixture, and WebSockets are blocked. Artifacts are `artifacts/boss-models/report.json` and PNGs. Review those images and exact-head CI before publication.

Physical Android/iOS, production network gameplay, current VPS version/configuration and live-save behavior are not verified by these tests. A failed or unrun browser stage is not a visual pass.
