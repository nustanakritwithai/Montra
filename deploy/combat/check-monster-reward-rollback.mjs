import { lstatSync, readdirSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

export function inspectMonsterRewardRollback(directory) {
  if (!directory || !isAbsolute(directory)) throw new Error('Provide the absolute character data directory.');

  const entries = readdirSync(directory, { withFileTypes: true });
  const jsonPending = entries.filter(entry => /\.json\.reward-pending$/i.test(entry.name)).length;
  const sqliteFile = entries.find(entry => entry.name.toLowerCase() === 'economy.sqlite');
  const hasJsonSave = entries.some(entry => entry.isFile() && /^[0-9a-f]{64}\.json$/i.test(entry.name));

  if (!sqliteFile) {
    if (entries.some(entry => /^economy\.sqlite[-.]/i.test(entry.name))) {
      throw new Error('SQLite sidecar exists without the main database.');
    }
    if (!hasJsonSave && jsonPending === 0) throw new Error('No recognized MONTRA character store in the directory.');
    return { jsonPending, sqlitePending: 0 };
  }

  const sqlitePath = join(directory, sqliteFile.name);
  if (!lstatSync(sqlitePath).isFile()) throw new Error('The SQLite database must be a regular file.');
  const db = new DatabaseSync(sqlitePath, { readOnly: true });
  try {
    const tables = db.prepare("SELECT name FROM sqlite_schema WHERE type = 'table'").all();
    const names = new Set(tables.map(table => table.name));
    if (!names.has('accounts') || !names.has('characters')) throw new Error('Unrecognized MONTRA SQLite schema.');
    const sqlitePending = names.has('pending_monster_rewards')
      ? db.prepare('SELECT COUNT(*) AS count FROM pending_monster_rewards').get().count
      : 0;
    return { jsonPending, sqlitePending };
  } finally {
    db.close();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 3) throw new Error('Usage: node check-monster-reward-rollback.mjs <absolute-character-directory>');
    const { jsonPending, sqlitePending } = inspectMonsterRewardRollback(process.argv[2]);
    const blocked = jsonPending + sqlitePending > 0;
    console.log(`${blocked ? 'BLOCKED' : 'CLEAR'} pending monster rewards (JSON=${jsonPending}, SQLite=${sqlitePending})`);
    if (blocked) process.exitCode = 1;
  } catch (error) {
    console.error('UNKNOWN pending monster rewards. ' + error.message);
    process.exitCode = 2;
  }
}
