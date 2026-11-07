# Offline save verification and deployment gates

This is **not a deployment procedure or permission to deploy**. The existing Windows installer remains unchanged. The tool does not stop writers, discover service configuration, create a production backup, recover a hot journal, restore production data, delete anything, or change permissions. No real saves were accessed to develop it. Windows/service/application restore verification remains outstanding.

## Why the existing installer is insufficient

At the frozen baseline (`f471d65`), `deploy/combat/install-windows.ps1`:

- checks only for a listener on 4108, which does not establish writer quiescence;
- picks the invoking shell's `MONTRA_CHARACTER_DIR`, or `base/data/characters`, without proving the running service's environment and resolved path;
- warns rather than fails if the default data directory is missing, and can accept an empty directory;
- uses a hash enumeration without `Get-ChildItem -Force`, so the verification does not comprehensively inventory hidden files;
- does not establish an expected feature-aware database inventory, perform SQLite integrity/foreign-key checks, or rehearse an application restore;
- rolls back sources/build on failure, not player data. This must not be mistaken for a coordinated data rollback.

These facts are characterized by the test fixture without executing PowerShell. The standard compiled `build/rooms` module's `../../data/characters` resolves correctly to the base's `data/characters`. Do not “fix” that path based on source-layout assumptions.

## Required operator evidence, before a coherent backup

These are **operator facts, not facts independently established by this tool**. Do not set an attestation true until its evidence is recorded privately.

1. Verify the actual service identity, executable, working directory, compiled module path, service-effective environment and flags, and the canonical authoritative save directory. Inspect all routes/jobs/processes that can write there, including accounts, guilds, hunt events, bug reports and director state. Do not infer it from the invoking shell. Record deployed commit and Node/runtime versions. Do not print environment secrets.
2. Arrange and verify a maintenance window with *all* writers stopped, including background jobs, restart supervisors, scheduled tasks and other processes. A missing 4108 listener is insufficient. Keep writers stopped throughout the entire copy and source/destination inventory comparison. No live-copy/retry shortcut.
3. Audit the full directory and all ancestor paths for Windows reparse points/junctions, hard links, mount boundaries and alternate data streams. The Node tool rejects links exposed by `lstat`, hard links and cross-device descendants, but cannot independently prove the absence of all Windows-specific reparse types or ADS. Unsupported entries need separate review, not skipping.
4. Use existing restricted local storage accessible only to authorized operators for the entire backup, manifest and disposable copies. `player-accounts.sqlite` contains credential hashes; JSON filenames and reports can also be private. Never commit/upload snapshots or manifests, include them in Pages artifacts, or transmit them to telemetry. The tool does not grant permissions or change ACLs. Ensure enough private disk capacity; it retains every disposable copy, even on failure.
5. Make a coherent **whole-directory** copy, including hidden files, empty directories, bug reports, all SQLite databases and every WAL/SHM/journal sidecar. Produce a SHA-256 inventory from the stopped authoritative directory and independently compare the complete copied tree against it. Never remove sidecars to get a passing check. Retain the pristine snapshot unchanged; it is never the staging service's data directory.
6. Explicitly resolve each database as `required` or `absent` using actual feature flags, service version and historical data. Expected candidates are `economy.sqlite`, `player-accounts.sqlite`, `guilds.sqlite`, `world-director.sqlite`, and `hunt-event.sqlite`. Disabled features can still have historical databases that must be preserved. Review any unexpected database rather than excluding it. Include existing three-slot JSON and `bug-reports` contents, even where no database is expected. Do not invent an all-databases-required default, or approve an empty/wrong directory as a fresh installation.

Record the exact operator evidence separately from the tool report. Booleans assert that review happened; they do not prove it happened.

## Private manifest contract

The module exports `inventory(directory)` for a separately reviewed, offline inventory step. It only reads files and returns sorted entries; do not run it on live data. Its paths/hashes are **private evidence**, not console output for sharing. The verification CLI does not generate its own reference from the snapshot it is checking: that would merely certify a potentially wrong/incomplete copy against itself.

A JSON plan has:

- `version: 1`
- `operatorAttestations`: all of `serviceEffectivePathVerified`, `allWritersStopped`, `wholeDirectoryCopyVerified`, `featureInventoryVerified`, `privateStorageVerified`, `reparseAndAlternateStreamsAudited` set to `true` only after the corresponding review above.
- `databases`: each of the five exact names above mapped to `required` or `absent`.
- `entries`: exact complete inventory of the authoritative stopped tree. Directories have `{ "path": "bug-reports", "type": "directory" }`; files have `{ "path": "example.json", "type": "file", "size": 123, "sha256": "<64 lowercase hex characters>" }`. Paths are relative, slash-separated and case-unambiguous. Include sidecars and hidden files. No record contents go in the plan.

Invalid/duplicate/traversal entries, empty inventories, mismatching hashes/sizes, missing/extra files or directories, unexpected databases, orphan sidecars and nonempty rollback journals fail closed. A hot rollback journal requires a separate recovery plan; this tool does not silently recover it or omit it.

## Offline verification command

Use the project's supported Node with `node:sqlite` (pinned `.nvmrc`; no added packages). Only after the gates above, on the machine holding the private copied snapshot:

```sh
node scripts/verify-offline-snapshot.mjs <pristine-copied-snapshot> <private-plan.json> <existing-private-rehearsal-parent>
```

Never pass the live directory. The rehearsal parent must be outside the pristine snapshot. The tool creates a new unique `montra-offline-rehearsal-*` child; it will never overwrite an existing restore destination. It checks the exact snapshot inventory against the reference, copies every entry, and checks both copies before SQLite opens anything. All SQLite opens use `readOnly: true` plus `query_only` and `trusted_schema = OFF`, on the **new disposable copy only**. Empty, short or malformed required database headers are rejected before SQLite can interpret them as fresh empty databases. Copied WAL headers, main-database page-size/journal-mode agreement, frame boundaries, salts and rolling checksums are checked first, because SQLite can ignore invalid WAL data and still pass main-database integrity. Torn/corrupt tails and fully checksummed uncommitted final frames fail closed and require separate recovery review. Empty or valid header-only WALs are accepted as having no frames. SHM is a derived WAL index that SQLite can rebuild: its bytes are preserved and hash-checked, but this tool does not validate its internal structure or treat it as authoritative transaction evidence. Normal SQLite WAL semantics are used, not `immutable=1`, which can ignore WAL contents. SQLite may change copied SHM state. No source database is opened by SQLite, no sidecars are removed, and no checkpoint is requested. It runs `integrity_check` and `foreign_key_check` for each expected database, then rechecks pristine bytes even after failure.

Output is a redacted count/status summary. Failure emits no raw paths, SQLite errors or record values. Inspect retained private evidence locally. A failed run is not approval to retry against production. A passing result explicitly says operator facts were only attested and application restore was **not tested**. Integrity and FK checks are structural, not verification of game rules, expected save totals, account login, or cross-store consistency.

## Still required before deployment

- Verify the tool on Windows and the pinned production Node version, actual service configuration and private filesystem. Preserve storage/security settings. Provisioning/access failure is a blocker, never permission to bypass access controls.
- In a separately isolated disposable environment, rehearse startup with the intended compiled version using another disposable snapshot copy and the verified feature flags. Bind isolated ports; disable all external effects. Verify three-slot loads, accounts, economy, guilds, world/director, hunt and reports as applicable, including read/write/restart durability and expected counts using private local checks. Do not run generic integration suites against the production snapshot or a live service. This verifier performs only the SQLite portion, not that application rehearsal.
- Review the exact candidate, pass required CI and staging tests, and retain the prior code/build/runtime/configuration with the pristine snapshot. Record a coordinated rollback decision and maintenance procedure. Code rollback is not data rollback. New saves after cutover must not be overwritten by an older snapshot; rollback involving production data needs separately scoped review/authorization and a preservation plan.
- Verify the deployed revision and health after an authorized cutover. No destructive restore implementation or actual production backup is included here.

## Local synthetic evidence

```sh
node --test scripts/verify-offline-snapshot.test.mjs
```

Fixtures use only temporary synthetic data, including a committed FK violation present only in WAL to prove WAL is read rather than silently ignored. Tests check pristine hashes and representative mtimes, hidden files, empty directories, missing operator gates, inventory mismatch, links, malformed/corrupt databases and output redaction. Temporary fixtures and rehearsal copies are retained; no cleanup/deletion is performed by this tool. Concurrent adversarial filesystem mutation is not supported: enforce private, quiescent offline inputs throughout. Hash equality alone does not prove service identity, transaction coherence, metadata/ACL preservation or application recoverability.

## Independent adversarial review

The original implementation accepted a zero-byte required database because SQLite treats it as an empty database. Regression coverage now rejects this and short main files, tests both WAL checksum byte orders, re-signed uncommitted tails, salt mismatches, partial/header-only WALs, mismatched page sizes and non-WAL main files with WAL data. Unexpected `.sqlite`, `.sqlite3` and `.db` filenames (case-insensitive) and noncanonical sidecar case are rejected. Arbitrarily renamed database content is not discovered; the feature-aware operator inventory remains necessary. The verifier does not assert application table names or migration versions: a structurally valid but wrong schema still requires the application restore rehearsal above.

A narrow push/PR workflow runs only synthetic fixtures on Ubuntu and Windows with the pinned runtime and Node 24. Adding this matrix is not evidence that remote CI, Windows service validation or production backup readiness passed. No installer execution, secret access, real snapshot artifact upload, or deployment occurs in this workflow. Concurrent filesystem attackers, forged/stale manifests and dishonest attestations are outside this tool’s trust boundary. Use independently recorded, current operator evidence and private, quiescent storage; never infer freshness or provenance from hashes alone.
