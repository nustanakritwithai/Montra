import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { spawnSync } from 'node:child_process';
import { inventory, verifySnapshot, gates } from './verify-offline-snapshot.mjs';
const databases = Object.fromEntries(['economy.sqlite', 'player-accounts.sqlite', 'guilds.sqlite', 'world-director.sqlite', 'hunt-event.sqlite'].map(name => [name, 'absent']));
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'montra-offline-fixture-'));
  const snapshot = path.join(root, 'snapshot'), rehearsal = path.join(root, 'rehearsals');
  fs.mkdirSync(snapshot); fs.mkdirSync(rehearsal);
  fs.writeFileSync(path.join(snapshot, 'synthetic-slot.json'), '{"slots":[null,null,null]}');
  return { root, snapshot, rehearsal };
}
function plan(f, required = {}) {
  return { version: 1, operatorAttestations: Object.fromEntries(gates.map(g => [g, true])),
    databases: { ...databases, ...required }, entries: inventory(f.snapshot) };
}
function check(f, p = plan(f)) { return verifySnapshot(f.snapshot, p, f.rehearsal); }

test('whole inventory includes hidden files, empty directories, bug reports; pristine bytes and mtimes unchanged', () => {
  const f = fixture();
  fs.mkdirSync(path.join(f.snapshot, 'bug-reports'));
  fs.mkdirSync(path.join(f.snapshot, 'empty'));
  fs.writeFileSync(path.join(f.snapshot, '.hidden'), 'synthetic');
  fs.writeFileSync(path.join(f.snapshot, 'bug-reports/reports.jsonl'), '{}\n');
  const before = inventory(f.snapshot);
  const mtime = fs.statSync(path.join(f.snapshot, '.hidden')).mtimeMs;
  assert.equal(check(f).checkedFiles, 3);
  assert.deepEqual(inventory(f.snapshot), before);
  assert.equal(fs.statSync(path.join(f.snapshot, '.hidden')).mtimeMs, mtime);
  assert.equal(fs.readdirSync(f.rehearsal).length, 1);
});
test('missing attestations, feature decisions, empty/wrong snapshot fail closed', () => {
  const f = fixture(), p = plan(f);
  for (const gate of gates) assert.throws(() => check(f, { ...p, operatorAttestations: { ...p.operatorAttestations, [gate]: false } }));
  assert.throws(() => check(f, { ...p, databases: {} }));
  assert.throws(() => check(f, { ...p, entries: [] }));
  fs.writeFileSync(path.join(f.snapshot, 'synthetic-slot.json'), '{}');
  assert.throws(() => check(f, p), /snapshot_inventory_mismatch/);
  assert.deepEqual(fs.readdirSync(f.rehearsal), []);
});
test('unexpected hidden file, missing file, duplicate names, traversal and overlapping output rejected', () => {
  const f = fixture(), p = plan(f);
  assert.throws(() => check(f, { ...p, entries: [...p.entries, p.entries[0]] }));
  assert.throws(() => check(f, { ...p, entries: [{ ...p.entries[0], path: '../escape' }] }));
  assert.throws(() => verifySnapshot(f.snapshot, p, f.snapshot), /overlapping/);
  fs.writeFileSync(path.join(f.snapshot, '.extra'), 'not in manifest');
  assert.throws(() => check(f, p), /inventory_mismatch/);
});
test('symlinks, linked ancestors and hard links rejected', () => {
  const f = fixture();
  fs.linkSync(path.join(f.snapshot, 'synthetic-slot.json'), path.join(f.snapshot, 'hard'));
  assert.throws(() => inventory(f.snapshot), /unsupported/);
  const g = fixture();
  fs.symlinkSync(g.snapshot, path.join(g.root, 'link'), 'dir');
  assert.throws(() => inventory(path.join(g.root, 'link')), /linked/);
  fs.symlinkSync(g.rehearsal, path.join(g.snapshot, 'linked'), 'dir');
  assert.throws(() => inventory(g.snapshot), /linked/);
});
test('read-only SQLite integrity checks occur on disposable copy only', () => {
  const f = fixture();
  const db = new DatabaseSync(path.join(f.snapshot, 'economy.sqlite'));
  db.exec('CREATE TABLE item(id INTEGER PRIMARY KEY); INSERT INTO item VALUES(1);'); db.close();
  const p = plan(f, { 'economy.sqlite': 'required' });
  const before = inventory(f.snapshot);
  assert.equal(check(f, p).checkedDatabases, 1);
  assert.deepEqual(inventory(f.snapshot), before);
});
test('WAL committed foreign-key violation is not silently ignored; source sidecars unchanged', () => {
  const f = fixture();
  const writerDir = path.join(f.root, 'synthetic-writer'); fs.mkdirSync(writerDir);
  const db = new DatabaseSync(path.join(writerDir, 'economy.sqlite'));
  try {
    db.exec('PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0; CREATE TABLE parent(id PRIMARY KEY); CREATE TABLE child(pid REFERENCES parent(id)); PRAGMA wal_checkpoint(TRUNCATE); PRAGMA foreign_keys=OFF; INSERT INTO child VALUES(987);');
    for (const name of fs.readdirSync(writerDir)) fs.copyFileSync(path.join(writerDir, name), path.join(f.snapshot, name));
    assert.ok(fs.statSync(path.join(f.snapshot, 'economy.sqlite-wal')).size > 0);
    const p = plan(f, { 'economy.sqlite': 'required' }), before = inventory(f.snapshot);
    assert.throws(() => check(f, p), /sqlite_foreign_keys_failed/);
    assert.deepEqual(inventory(f.snapshot), before);
    assert.equal(fs.readdirSync(f.rehearsal).length, 1);
  } finally { db.close(); }
});
test('valid WAL passes; truncated or checksum-corrupt WAL fails instead of falling back to main DB', () => {
  const f = fixture(), writer = path.join(f.root, 'writer'); fs.mkdirSync(writer);
  const db = new DatabaseSync(path.join(writer, 'economy.sqlite'));
  try {
    db.exec('PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0; CREATE TABLE value(id); INSERT INTO value VALUES(1);');
    for (const name of fs.readdirSync(writer)) fs.copyFileSync(path.join(writer, name), path.join(f.snapshot, name));
    const required = { 'economy.sqlite': 'required' };
    assert.equal(check(f, plan(f, required)).checkedDatabases, 1);
    const filename = path.join(f.snapshot, 'economy.sqlite-wal');
    const bytes = fs.readFileSync(filename); bytes[bytes.length - 1] ^= 1;
    fs.writeFileSync(filename, bytes);
    assert.throws(() => check(f, plan(f, required)), /invalid_wal_checksum/);
    fs.writeFileSync(filename, bytes.subarray(0, bytes.length - 1));
    assert.throws(() => check(f, plan(f, required)), /invalid_wal/);
  } finally { db.close(); }
});
test('corrupt DB, orphan sidecar and rollback journal fail closed', () => {
  const f = fixture(); fs.writeFileSync(path.join(f.snapshot, 'economy.sqlite'), 'bad database');
  assert.throws(() => check(f, plan(f, { 'economy.sqlite': 'required' })));
  const g = fixture(); fs.writeFileSync(path.join(g.snapshot, 'economy.sqlite-wal'), 'wal');
  assert.throws(() => check(g), /orphan_sidecar/);
  fs.writeFileSync(path.join(f.snapshot, 'economy.sqlite-journal'), 'hot');
  assert.throws(() => check(f, plan(f, { 'economy.sqlite': 'required' })), /rollback_journal_requires_review/);
});
test('CLI redacts paths, record values and raw errors', () => {
  const f = fixture(); const manifest = path.join(f.root, 'plan.json');
  fs.writeFileSync(manifest, JSON.stringify(plan(f)));
  const result = spawnSync(process.execPath, ['--no-warnings', 'scripts/verify-offline-snapshot.mjs', f.snapshot + '/PRIVATE', manifest, f.rehearsal], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.ok(!result.stderr.includes(f.root)); assert.ok(!result.stderr.includes('PRIVATE'));
});
test('characterize legacy installer gaps without running PowerShell or copying real data', () => {
  const installer = fs.readFileSync(new URL('../deploy/combat/install-windows.ps1', import.meta.url), 'utf8');
  assert.match(installer, /Get-NetTCPConnection -LocalPort 4108/);
  assert.match(installer, /\$characterData = if \(\$env:MONTRA_CHARACTER_DIR\)/);
  assert.match(installer, /Get-ChildItem -LiteralPath \$dataRoot -File -Recurse\)/); // no -Force inventory
  assert.match(installer, /Write-Warning "No character data directory was found/);
  assert.doesNotMatch(installer, /PRAGMA integrity_check|PRAGMA foreign_key_check|verify-offline-snapshot/);
  assert.match(installer, /Restoring MONTRA source files and build \(character data untouched\)/);
});

test('required empty and header-only databases fail instead of appearing healthy', () => {
  const f = fixture(), name = path.join(f.snapshot, 'economy.sqlite');
  fs.writeFileSync(name, '');
  assert.throws(() => check(f, plan(f, { 'economy.sqlite': 'required' })), /invalid_database_header/);
  const db = new DatabaseSync(name); db.exec('CREATE TABLE item(id)'); db.close();
  fs.writeFileSync(name, fs.readFileSync(name).subarray(0, 100));
  assert.throws(() => check(f, plan(f, { 'economy.sqlite': 'required' })), /invalid_database_header/);
});

// Re-sign deliberately mutated synthetic WALs. This tests semantic checks,
// not just the ability to catch any change via a stale checksum/manifest.
function resignWal(wal, bigEndian = false) {
  wal.writeUInt32BE(bigEndian ? 0x377f0683 : 0x377f0682, 0);
  const read = bigEndian ? i => wal.readUInt32BE(i) : i => wal.readUInt32LE(i);
  let a = 0, b = 0;
  function sum(start, length) {
    for (let i = start; i < start + length; i += 8) {
      a = (a + read(i) + b) >>> 0; b = (b + read(i + 4) + a) >>> 0;
    }
  }
  function write(i) { wal.writeUInt32BE(a, i); wal.writeUInt32BE(b, i + 4); }
  sum(0, 24); write(24);
  const pageSize = wal.readUInt32BE(8);
  for (let i = 32; i < wal.length; i += 24 + pageSize) {
    sum(i, 8); sum(i + 24, pageSize); write(i + 16);
  }
  return wal;
}

test('WAL endian, salt, commit boundaries, page size and main journal mode are checked', () => {
  const f = fixture(), writer = path.join(f.root, 'writer'); fs.mkdirSync(writer);
  const db = new DatabaseSync(path.join(writer, 'economy.sqlite'));
  try {
    db.exec('PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0; CREATE TABLE item(id); PRAGMA wal_checkpoint(TRUNCATE); INSERT INTO item VALUES(1);');
    for (const name of fs.readdirSync(writer)) fs.copyFileSync(path.join(writer, name), path.join(f.snapshot, name));
    const filename = path.join(f.snapshot, 'economy.sqlite-wal'), original = fs.readFileSync(filename);
    const required = { 'economy.sqlite': 'required' };
    for (const bigEndian of [true, false]) {
      fs.writeFileSync(filename, resignWal(Buffer.from(original), bigEndian));
      assert.equal(check(f, plan(f, required)).checkedDatabases, 1);
    }
    const uncommitted = Buffer.from(original);
    uncommitted.writeUInt32BE(0, uncommitted.length - (24 + uncommitted.readUInt32BE(8)) + 4);
    fs.writeFileSync(filename, resignWal(uncommitted));
    assert.throws(() => check(f, plan(f, required)), /uncommitted_wal_requires_review/);
    const salt = Buffer.from(original); salt[40] ^= 1;
    fs.writeFileSync(filename, resignWal(salt));
    assert.throws(() => check(f, plan(f, required)), /invalid_wal_frame/);
    fs.writeFileSync(filename, original.subarray(0, 31));
    assert.throws(() => check(f, plan(f, required)), /invalid_wal/);
    // Header-only WAL is valid with no frames to apply.
    fs.writeFileSync(filename, original.subarray(0, 32));
    assert.equal(check(f, plan(f, required)).checkedDatabases, 1);
    const wrongPageSize = Buffer.from(original.subarray(0, 32)); wrongPageSize.writeUInt32BE(512, 8);
    fs.writeFileSync(filename, resignWal(wrongPageSize));
    assert.throws(() => check(f, plan(f, required)), /invalid_wal/);
    fs.writeFileSync(filename, original);
    const main = path.join(f.snapshot, 'economy.sqlite'), bytes = fs.readFileSync(main);
    bytes[18] = 1; bytes[19] = 1; fs.writeFileSync(main, bytes);
    assert.throws(() => check(f, plan(f, required)), /wal_database_mode_mismatch/);
  } finally { db.close(); }
});

test('unreviewed database extensions and noncanonical sidecar case fail closed', () => {
  for (const name of ['extra.SQLITE', 'extra.sqlite3', 'extra.db', 'economy.sqlite-WAL']) {
    const f = fixture(); fs.writeFileSync(path.join(f.snapshot, name), 'synthetic');
    assert.throws(() => check(f), /unreviewed_database|orphan_sidecar/);
  }
});

test('CI covers verifier and legacy characterization changes with pinned and Node 24 synthetic runs', () => {
  const workflow = fs.readFileSync(new URL('../.github/workflows/offline-snapshot.yml', import.meta.url), 'utf8');
  assert.match(workflow, /push:/); assert.match(workflow, /pull_request:/);
  assert.equal((workflow.match(/scripts\/verify-offline-snapshot\*\.mjs/g) || []).length, 2);
  assert.equal((workflow.match(/deploy\/combat\/install-windows\.ps1/g) || []).length, 2);
  assert.match(workflow, /node-version-file: '\.nvmrc'/);
  assert.match(workflow, /node: \['pinned', '24'\]/);
  assert.match(workflow, /os: \[ubuntu-latest, windows-latest\]/);
  assert.match(workflow, /node --test scripts\/verify-offline-snapshot.test.mjs/);
  assert.doesNotMatch(workflow, /upload-artifact|secrets\.|npm install|install-windows\.ps1\s*$/m);
});
