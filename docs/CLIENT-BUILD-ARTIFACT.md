# Client build artifact and rollback

Root `main.js` is generated and ignored, not a checked-in source. The browser
still loads the same filename, classic script, IIFE and bytes. This change does
not alter gameplay, network messages, saves, server schema or deployment paths.

## Clean checkout and local work

Use Node 22 or newer (`.nvmrc` selects the CI version). No dependencies are needed
for client preparation, static packaging or the non-browser client fixtures.

```sh
npm run prepare:client
npm run check:client
npm run test:client
npm run test:build
npm run build
```

`npm run build` and `node scripts/build-site.mjs` can also start without root
`main.js`. `prepare:client` creates it only when absent. If it already exists,
preparation and packaging verify exact source agreement and reject stale output.
`check:client` is strictly read-only and rejects missing output too. After editing
fragments, review the source diff and run `npm run build:client` explicitly.
Commit the source fragments and related tests, never force-add `main.js`.
Before serving the repository root or invoking an individual legacy/browser test,
prepare the client. The aggregate client runner, contract/boundary CLIs, combat
preparation script and browser workflows do this themselves. Boundary and
contract checks additionally require the locked combat verification dependencies.

The manifest controls order. Assembly concatenates raw buffers without separators,
transforms or minification and checks syntax without executing game code. Source,
manifest and output symlinks are rejected. Missing, duplicate, unlisted or reordered
fragments fail. Existing generated output is never silently repaired by preparation.

## Evidence and release checks

`src/client/extraction-baseline.json` records the original source commit, fragment
hashes, sizes, and statement boundaries. The original 1,372,310-byte bundle has
SHA-256 `a6ef7e6c12120dd8d2f0fd641765d152871c6dbcb6df7a110801f1ef9cb5ebbf`.
The build tests retain those exact source and full-bundle assertions. They also
exercise a missing bundle, stale output, unsafe paths, symlinks, syntax errors,
CLI preparation and byte-for-byte static payload parity. Do not refresh baseline
fingerprints merely to make an unexpected difference pass.

Pages publishes `_site/`, not the repository root. Its `build-manifest.json`
records the revision, output sizes and SHA-256 hashes. Build from a clean committed
checkout and verify CI for that exact SHA. Source organization changes in later
phases require their own explicitly reviewed evidence; this artifact change alone
preserves all runtime bytes. It does not replace browser/staging or server checks.

## Rollback

For a deployment rollback, redeploy the last verified commit using that commit's
workflow and retain its build manifest as evidence. Older revisions that track
`main.js` use their original build; revisions using this artifact generate it from
their own fragments. Never combine fragments and generated output from different
revisions or force-add an old bundle to the current sources.

For a local checkout switch, an ignored `main.js` may remain from the newer
revision. If preparation reports stale output, first confirm no intended source
changes are being lost, then explicitly regenerate with `npm run build:client`
for the checked-out revision. Re-run client/build checks and compare the release
manifest before deploying. Server data and save rollback remain separate: this
change neither migrates nor deletes player data.
