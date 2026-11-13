# Montra ghost pot pilot

The room uses PocketMonster's existing CAP_v1.0 calculator and the original MonsterLifeServer C# owned-monster runtime. The worker runs as a child process over stdin/stdout and links the C# files and catalogs from a separate checkout. The character save stores the collection, its three assigned slots and each ghost's capture source. Ordinary ghosts through level 60 use the existing common capture formula.

On summon or switch, Montra resolves the saved monster ID and map against its encounter catalog. Grove encounters use Pocket Monster's `MON_004` profile and guard encounters use `MON_007`. The remaining encounters and saves with missing or unmatched sources use the existing `MON_001` profile. The C# worker reads the supported moves from the original learnsets. Deploy the room and worker together. These changes use the existing save format.

## Test locally

Use MonsterLifeServer revision `349de5fe4586d52300942feee775fc28ff4449ee`, a PocketMonster checkout containing `balance-capture.mjs`, .NET 10 and the Montra Node toolchain. Build the worker from the repository root.

```powershell
dotnet build deploy/combat/legacy-ghost-worker/LegacyGhostWorker.csproj "-p:MonsterLifeSource=C:/src/MonsterLifeServer" --artifacts-path C:/src/montra-test-artifacts
$env:MONTRA_GHOST_WORKER = 'C:/src/montra-test-artifacts/bin/LegacyGhostWorker/debug/LegacyGhostWorker.dll'
$env:MONTRA_POCKET_CAPTURE_SOURCE = 'C:/src/PocketMonster'
```

Prepare `combat-verify` using `npm run prepare:combat`. Install its dependencies with `npm ci` in that directory, then run `node --import tsx ghost-pot-integration.mjs`. The integration test listens on loopback and creates a fresh temporary database. It checks capture, recall, reconnect and replication to a second player.

To enable the menu in a separate staging server, set the two paths above and `MONTRA_ECONOMY_ENABLED=1`. Pick a living nearby ghost, open the field menu and select **จับผีใส่หม้อ**. The same menu entry then summons or recalls the captured ghost. For rollback, remove the worker variable on this build and restart the staging server. This build continues preserving any pot already stored in character saves.
