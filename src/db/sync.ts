/**
 * Future sync abstraction — intentionally NOT implemented with any cloud service.
 *
 * FormLab is local-first: IndexedDB is the source of truth. If multi-device sync is ever wanted,
 * implement `SyncAdapter` (e.g. a self-hosted CouchDB, a WebDAV folder, or file-based sync through
 * a user's own cloud drive) and register it. Every mutable record has an `id` and an `updatedAt`
 * timestamp, which supports a simple last-writer-wins merge per record; immutable records
 * (recipe versions, food-log snapshots) can be merged by id without conflicts.
 */
import type { Backup } from './backup';

export interface SyncChange {
  table: string;
  id: string;
  updatedAt: string;
  deleted: boolean;
  data: unknown;
}

export interface SyncAdapter {
  readonly id: string;
  readonly name: string;
  /** push local changes since a checkpoint; returns the remote checkpoint */
  push(changes: SyncChange[]): Promise<string>;
  /** pull remote changes since a checkpoint */
  pull(sinceCheckpoint: string | null): Promise<{ changes: SyncChange[]; checkpoint: string }>;
}

/** The only adapter shipped: does nothing. Exists so app code can depend on the interface. */
export const noSync: SyncAdapter = {
  id: 'none',
  name: 'Local only (no sync)',
  async push() {
    return 'local';
  },
  async pull() {
    return { changes: [], checkpoint: 'local' };
  }
};

/** Whole-snapshot "sync" via a backup file is already supported through export/restore. */
export type ManualSnapshot = Backup;
