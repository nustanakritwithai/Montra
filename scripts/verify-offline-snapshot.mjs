// Offline evidence only. Never point this tool at a live data directory.
import * as fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const fail = (code) => { throw new Error(code); };
export const gates = ['serviceEffectivePathVerified', 'allWritersStopped', 'wholeDirectoryCopyVerified',
  'featureInventoryVerified', 'privateStorageVerified', 'reparseAndAlternateStreamsAudited'];
const knownDatabases = ['economy.sqlite', 'player-accounts.sqlite', 'guilds.sqlite',
  'world-director.sqlite', 'hunt-event.sqlite'];
const safeRelative = (name) => typeof name === 'string' && name.length > 0 &&
  !name.includes('\\') && !name.includes(':') && !name.includes('\0') &&
  name.split('/').every(part => part !== '' && part !== '.' && part !== '..');

// Reject links in every ancestor, not just descendants. Windows-specific reparse
// types and ADS require an independent operator audit (Node has no complete API).
function plainPath(target) {
  const absolute = path.resolve(target);
  let cursor = absolute;
  for (;;) {
    const stat = fs.lstatSync(cursor);
    if (stat.isSymbolicLink()) fail('linked_path');
    if (cursor === path.dirname(cursor)) break;
    cursor = path.dirname(cursor);
  }
  if (fs.realpathSync(absolute) !== absolute) fail('noncanonical_path');
  return absolute;
}

export function inventory(directory) {
  const root = plainPath(directory);
  const rootStat = fs.lstatSync(root);
  if (!rootStat.isDirectory() || root === path.parse(root).root) fail('invalid_root');
  const entries = [];
  function walk(dir, prefix = '') {
    for (const name of fs.readdirSync(dir).sort()) {
      const relative = prefix + name;
      if (!safeRelative(relative)) fail('invalid_entry_name');
      const full = path.join(dir, name);
      const stat = fs.lstatSync(full);
      if (stat.isSymbolicLink() || stat.dev !== rootStat.dev) fail('linked_or_mounted_entry');
      if (stat.isDirectory()) {
        entries.push({ path: relative, type: 'directory' });
        walk(full, relative + '/');
      } else if (stat.isFile() && stat.nlink === 1) {
        const fd = fs.openSync(full, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
        try {
          const before = fs.fstatSync(fd);
          if (before.ino !== stat.ino || before.dev !== stat.dev) fail('changed_entry');
          const hash = createHash('sha256');
          const buffer = Buffer.alloc(1024 * 1024);
          let count;
          while ((count = fs.readSync(fd, buffer)) !== 0) hash.update(buffer.subarray(0, count));
          const after = fs.fstatSync(fd);
          if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) fail('changed_entry');
          entries.push({ path: relative, type: 'file', size: after.size, sha256: hash.digest('hex') });
        } finally { fs.closeSync(fd); }
      } else fail('unsupported_entry');
    }
  }
  walk(root);
  return entries.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}

function validatePlan(plan) {
  if (plan?.version !== 1 || gates.some(gate => plan.operatorAttestations?.[gate] !== true)) fail('operator_gates_missing');
  if (!Array.isArray(plan.entries) || !plan.entries.some(e => e.type === 'file' && e.size > 0)) fail('empty_inventory');
  const seen = new Set();
  for (const entry of plan.entries) {
    if (!safeRelative(entry.path) || seen.has(entry.path.toLowerCase())) fail('invalid_inventory');
    seen.add(entry.path.toLowerCase());
    if (entry.type !== 'directory' && (entry.type !== 'file' || !Number.isSafeInteger(entry.size) || entry.size < 0 || !/^[a-f0-9]{64}$/.test(entry.sha256))) fail('invalid_inventory');
  }
  if (!plan.databases || knownDatabases.some(name => !['required', 'absent'].includes(plan.databases[name]))) fail('database_decisions_missing');
  for (const name of knownDatabases) {
    const entry = plan.entries.find(e => e.path === name && e.type === 'file');
    if ((plan.databases[name] === 'required') !== Boolean(entry)) fail('database_inventory_mismatch');
  }
  for (const entry of plan.entries.filter(e => e.type === 'file')) {
    if (/\.(sqlite3?|db)$/i.test(entry.path) && !knownDatabases.includes(entry.path)) fail('unreviewed_database');
    if (/-(wal|shm|journal)$/i.test(entry.path)) {
      const main = entry.path.replace(/-(wal|shm|journal)$/i, '');
      if (!/-(wal|shm|journal)$/.test(entry.path) || !knownDatabases.includes(main) || plan.databases[main] !== 'required') fail('orphan_sidecar');
      // Hot rollback journals need a separately reviewed recovery procedure.
      if (entry.path.endsWith('-journal') && entry.size > 0) fail('rollback_journal_requires_review');
    }
  }
  return plan.entries.map(e => e.type === 'directory' ? { path: e.path, type: e.type } :
    { path: e.path, type: e.type, size: e.size, sha256: e.sha256 }).sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}
// SQLite can ignore an invalid WAL and still report a healthy main database.
// Validate every copied WAL frame first; reject torn/uncommitted corrupt tails
// rather than silently treating the main database as the complete backup.
function validateWal(filename, databasePageSize, walMode) {
  const wal = fs.readFileSync(filename);
  if (wal.length === 0) return;
  if (!walMode) fail('wal_database_mode_mismatch');
  if (wal.length < 32) fail('invalid_wal');
  const magic = wal.readUInt32BE(0), pageSize = wal.readUInt32BE(8);
  if (![0x377f0682, 0x377f0683].includes(magic) || wal.readUInt32BE(4) !== 3007000 ||
      pageSize !== databasePageSize || pageSize < 512 || pageSize > 65536 || (pageSize & (pageSize - 1)) !== 0 ||
      (wal.length - 32) % (24 + pageSize) !== 0) fail('invalid_wal');
  const read = magic === 0x377f0682 ? offset => wal.readUInt32LE(offset) : offset => wal.readUInt32BE(offset);
  let a = 0, b = 0;
  function sum(start, length) {
    for (let i = start; i < start + length; i += 8) {
      a = (a + read(i) + b) >>> 0;
      b = (b + read(i + 4) + a) >>> 0;
    }
  }
  function matches(offset) {
    if (a !== wal.readUInt32BE(offset) || b !== wal.readUInt32BE(offset + 4)) fail('invalid_wal_checksum');
  }
  sum(0, 24); matches(24);
  for (let offset = 32; offset < wal.length; offset += 24 + pageSize) {
    if (wal.readUInt32BE(offset) === 0 || wal.readUInt32BE(offset) > 0xfffffffe ||
        wal.readUInt32BE(offset + 4) > 0xfffffffe || !wal.subarray(offset + 8, offset + 16).equals(wal.subarray(16, 24))) fail('invalid_wal_frame');
    sum(offset, 8); sum(offset + 24, pageSize); matches(offset + 16);
  }
  // A coherent offline snapshot must not depend on SQLite discarding an
  // uncommitted tail. Preserve it and require a separate recovery review.
  if (wal.length > 32 && wal.readUInt32BE(wal.length - (24 + pageSize) + 4) === 0) fail('uncommitted_wal_requires_review');
}
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function verifySnapshot(snapshot, plan, rehearsalParent) {
  const expected = validatePlan(plan);
  const source = plainPath(snapshot);
  const parent = plainPath(rehearsalParent);
  const relative = path.relative(source, parent);
  if (!fs.statSync(parent).isDirectory() || relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))) fail('overlapping_rehearsal');
  const before = inventory(source);
  if (!equal(before, expected)) fail('snapshot_inventory_mismatch');
  // Fresh unique directory; never overwrite a supplied restore destination.
  const disposable = fs.mkdtempSync(path.join(parent, 'montra-offline-rehearsal-'));
  try {
    for (const entry of before.filter(e => e.type === 'directory').sort((a, b) => a.path.length - b.path.length)) fs.mkdirSync(path.join(disposable, entry.path));
    for (const entry of before.filter(e => e.type === 'file')) fs.copyFileSync(path.join(source, entry.path), path.join(disposable, entry.path), fs.constants.COPYFILE_EXCL);
    if (!equal(inventory(disposable), before) || !equal(inventory(source), before)) fail('copy_verification_failed');
    let checkedDatabases = 0;
    for (const name of knownDatabases.filter(name => plan.databases[name] === 'required')) {
      // NOT immutable=1: that could ignore WAL. Normal read-only SQLite reads the
      // copied WAL and may update copied SHM; pristine files are never opened by SQLite.
      const wal = path.join(disposable, name + '-wal');
      const filename = path.join(disposable, name);
      const header = Buffer.alloc(100);
      const fd = fs.openSync(filename, fs.constants.O_RDONLY);
      let size;
      try {
        size = fs.fstatSync(fd).size;
        if (fs.readSync(fd, header, 0, 100, 0) !== 100 ||
            !header.subarray(0, 16).equals(Buffer.from('SQLite format 3\0'))) fail('invalid_database_header');
      } finally { fs.closeSync(fd); }
      const rawPageSize = header.readUInt16BE(16), pageSize = rawPageSize === 1 ? 65536 : rawPageSize;
      if (pageSize < 512 || pageSize > 65536 || (pageSize & (pageSize - 1)) !== 0 ||
          size % pageSize !== 0 || ![1, 2].includes(header[18]) || ![1, 2].includes(header[19])) fail('invalid_database_header');
      if (fs.existsSync(wal)) validateWal(wal, pageSize, header[18] === 2 && header[19] === 2);
      const db = new DatabaseSync(path.join(disposable, name), { readOnly: true });
      try {
        db.exec('PRAGMA query_only = ON; PRAGMA trusted_schema = OFF;');
        const integrity = db.prepare('PRAGMA integrity_check').all();
        if (integrity.length !== 1 || Object.values(integrity[0])[0] !== 'ok') fail('sqlite_integrity_failed');
        if (db.prepare('PRAGMA foreign_key_check').all().length !== 0) fail('sqlite_foreign_keys_failed');
        checkedDatabases++;
      } finally { db.close(); }
    }
    return { status: 'offline_checks_passed', checkedFiles: before.filter(e => e.type === 'file').length,
      checkedDatabases, operatorFacts: 'attested_not_independently_verified', applicationRestore: 'not_tested' };
  } finally {
    // Retain disposable files even on failure. Never remove sidecars or source data.
    if (!equal(inventory(source), before)) fail('pristine_snapshot_changed');
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 5) fail('usage');
    const plan = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
    console.log(JSON.stringify(verifySnapshot(process.argv[2], plan, process.argv[4])));
  } catch {
    // SQLite errors can contain record values or filenames. Do not echo them.
    console.error('Offline verification FAILED. No deployment approval. Review private evidence and operator gates; retained disposable copy may contain private data.');
    process.exitCode = 1;
  }
}
