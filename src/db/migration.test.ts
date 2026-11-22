import { describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import { FormLabDB, SCHEMA_VERSION } from './db';
import { migrateBackup, validateBackup, BACKUP_FORMAT } from './backup';
import { defaultPreferences } from '../domain/shared/preferences';

function v1Prefs(): Record<string, unknown> {
  const p = defaultPreferences('2026-01-01T00:00:00.000Z') as unknown as Record<string, unknown>;
  delete p.recoveryDefaultHours;
  delete p.recoveryOverrides;
  return p;
}

describe('schema migrations', () => {
  it('upgrades a version-1 database to the current version without losing data', async () => {
    const name = 'formlab-migration-test';
    await Dexie.delete(name);
    // Create a v1 database exactly as the first release did.
    const old = new Dexie(name);
    old.version(1).stores({ preferences: 'id', foodLog: 'id, date, createdAt, [date+meal]', meta: 'key' });
    await old.open();
    await old.table('preferences').put(v1Prefs());
    await old.table('foodLog').put({ id: 'log_1', date: '2026-01-01', meal: 'lunch', createdAt: 'x' });
    old.close();

    const db = new FormLabDB(name);
    await db.open();
    expect(db.verno).toBe(SCHEMA_VERSION);
    const prefs = await db.preferences.get('prefs');
    expect(prefs?.recoveryDefaultHours).toBe(48);
    expect(prefs?.recoveryOverrides).toEqual({});
    expect(await db.foodLog.get('log_1')).toBeDefined();
    db.close();
    await Dexie.delete(name);
  });

  it('migrates version-1 backups and validates them against the current schema', () => {
    const backup = { format: BACKUP_FORMAT, schemaVersion: 1, exportedAt: 'x', app: { name: 'FormLab', version: '0.1.0' }, tables: { preferences: [v1Prefs()] } } as const;
    const migrated = migrateBackup(JSON.parse(JSON.stringify(backup)));
    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION);
    expect((migrated.tables.preferences![0] as Record<string, unknown>).recoveryDefaultHours).toBe(48);
    expect(validateBackup(JSON.parse(JSON.stringify(backup))).report.ok).toBe(true);
  });

  it('rejects backups from a newer schema', () => {
    const r = validateBackup({ format: BACKUP_FORMAT, schemaVersion: SCHEMA_VERSION + 1, exportedAt: 'x', app: { name: 'FormLab', version: '9' }, tables: {} });
    expect(r.report.ok).toBe(false);
    expect(r.report.errors[0]).toMatch(/newer version/);
  });
});
