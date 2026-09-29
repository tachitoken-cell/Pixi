import { existsSync, readFileSync, mkdirSync, writeFileSync, renameSync, openSync, fsyncSync, closeSync } from 'node:fs';
import { dirname } from 'node:path';
import { getDungeon } from './dungeon.ts';
import { realmIdValid } from './hosting-realms.ts';
import { CHARACTER_CLASSES } from './shared.ts';
import { MAX_LEVEL } from './progression.ts';

const integer = value => Number.isSafeInteger(value) && value >= 0;
const idValid = value => typeof value === 'string' && /^[\w-]{1,128}$/.test(value);
const boardValid = (dungeonId, partySize) => typeof dungeonId === 'string' && !!getDungeon(dungeonId) && Number.isInteger(partySize) && partySize >= 1 && partySize <= 4;
const compare = (a, b) => a.durationMs - b.durationMs || a.completedAt - b.completedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const invalid = () => Error('Invalid dungeon record.');

function publicRecord(row) {
  if (!row || !idValid(row.id) || !boardValid(row.dungeonId, row.partySize) || !realmIdValid(row.realmId)
    || !integer(row.durationMs) || row.durationMs === 0 || !integer(row.completedAt) || row.completedAt < row.durationMs
    || !integer(row.kills) || row.kills < 1 || row.kills > 2147483647 || !integer(row.wipes) || row.wipes > 2147483647
    || !Array.isArray(row.members) || row.members.length !== row.partySize
    || row.members.some(member => !member || !idValid(member.id) || typeof member.name !== 'string' || !member.name.trim()
      || member.name.length > 100 || /[\u0000-\u001f\u007f]/.test(member.name) || !CHARACTER_CLASSES.includes(member.className)
      || !integer(member.level) || member.level < 1 || member.level > MAX_LEVEL)
    || new Set(row.members.map(member => member.id)).size !== row.partySize) throw invalid();
  // Never serialize a runtime player/session or account key into public records.
  return { id: row.id, dungeonId: row.dungeonId, partySize: row.partySize, durationMs: row.durationMs,
    kills: row.kills, wipes: row.wipes, completedAt: row.completedAt, realmId: row.realmId,
    members: row.members.map(({ id, name, className, level }) => ({ id, name, className, level })) };
}

export async function initializeDungeonRecords(query) {
  await query(`CREATE TABLE IF NOT EXISTS mossvale_dungeon_records (
    id text PRIMARY KEY, dungeon_id text NOT NULL, party_size smallint NOT NULL CHECK (party_size BETWEEN 1 AND 4),
    duration_ms bigint NOT NULL CHECK (duration_ms > 0), completed_at bigint NOT NULL CHECK (completed_at >= duration_ms),
    kills integer NOT NULL CHECK (kills > 0), wipes integer NOT NULL CHECK (wipes >= 0),
    realm_id text NOT NULL CHECK (realm_id IN ('eu','us','asia')), members jsonb NOT NULL
      CHECK (jsonb_typeof(members) = 'array' AND jsonb_array_length(members) = party_size))`);
  await query('CREATE INDEX IF NOT EXISTS mossvale_dungeon_records_board ON mossvale_dungeon_records(dungeon_id,party_size,duration_ms,completed_at,id COLLATE "C")');
}

export function postgresDungeonRecords({ query, enqueue, requireStarted }) {
  return {
    record(row) {
      const saved = publicRecord(row);
      return enqueue(async () => {
        requireStarted();
        const result = await query(`INSERT INTO mossvale_dungeon_records(id,dungeon_id,party_size,duration_ms,completed_at,kills,wipes,realm_id,members)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb) ON CONFLICT (id) DO NOTHING RETURNING id`,
        [saved.id, saved.dungeonId, saved.partySize, saved.durationMs, saved.completedAt, saved.kills, saved.wipes, saved.realmId, JSON.stringify(saved.members)]);
        return result.rows.length > 0;
      });
    },
    list(dungeonId, partySize) {
      if (!boardValid(dungeonId, partySize)) throw invalid();
      return enqueue(async () => {
        requireStarted();
        const { rows } = await query(`SELECT id, dungeon_id AS "dungeonId", party_size AS "partySize", duration_ms AS "durationMs",
          completed_at AS "completedAt", kills, wipes, realm_id AS "realmId", members FROM mossvale_dungeon_records
          WHERE dungeon_id=$1 AND party_size=$2 ORDER BY duration_ms,completed_at,id COLLATE "C" LIMIT 20`, [dungeonId, partySize]);
        return rows.map(row => publicRecord({ ...row, durationMs: Number(row.durationMs), completedAt: Number(row.completedAt) }));
      });
    },
  };
}

export function fileDungeonRecords(path) {
  if (!existsSync(path) && existsSync(path + '.tmp')) throw Error('Incomplete dungeon record save found; refusing to overwrite it.');
  // ponytail: local development rewrites the history; public realms use indexed PostgreSQL.
  const read = () => {
    const rows = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : [];
    if (!Array.isArray(rows) || new Set(rows.map(row => row?.id)).size !== rows.length) throw invalid();
    return rows.map(publicRecord);
  };
  read();
  return {
    record(row) {
      const saved = publicRecord(row), rows = read();
      if (rows.some(row => row.id === saved.id)) return false;
      rows.push(saved);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path + '.tmp', JSON.stringify(rows), { mode: 0o600 });
      const fd = openSync(path + '.tmp', 'r'); try { fsyncSync(fd); } finally { closeSync(fd); }
      renameSync(path + '.tmp', path);
      const directory = openSync(dirname(path), 'r'); try { fsyncSync(directory); } finally { closeSync(directory); }
      return true;
    },
    list(dungeonId, partySize) {
      if (!boardValid(dungeonId, partySize)) throw invalid();
      return read().filter(row => row.dungeonId === dungeonId && row.partySize === partySize).sort(compare).slice(0, 20);
    },
  };
}
