/**
 * SyncService — orchestrates export → strategy dispatch → logging.
 *
 * Entry points:
 *   syncSnapshot(snapshotId, targetId?)  — sync one snapshot to one or all targets
 *   syncAllEnabled(snapshotId)           — auto-sync to every enabled target for the project
 */

import { v4 as uuid } from 'uuid';
import DAC from '../db/dac';
import type { ISnapshot } from '../db/dac';
import type { ISyncTarget, ISyncLog, SyncStatusEvent } from '../../../common/sync.interface';
import { exportSnapshot, ExportResult } from './export.service';
import { syncToLocal, LocalSyncOptions } from './sync-strategies/local.strategy';
import { syncToGit } from './sync-strategies/git.strategy';

export type SyncEventEmitter = (event: SyncStatusEvent) => void;

/** Options for sync operations */
export interface SyncOptions {
  /** For local targets: custom target path (relative to base folder) */
  targetPath?: string;
  /** For local targets: custom file name (without extension) */
  fileName?: string;
}

/**
 * Sync a snapshot to a specific target.
 * Returns the sync log entry.
 */
export async function syncSnapshot(
  snapshotId: string,
  targetId: string,
  emit?: SyncEventEmitter,
  options?: SyncOptions,
): Promise<ISyncLog> {
  const db = DAC.db;

  const target = await db.getSyncTargetById(targetId);
  if (!target) throw new Error(`Sync target ${targetId} not found`);
  if (!target.enabled) throw new Error(`Sync target ${targetId} is disabled`);

  const snapshot = await db.getSnapshotById(snapshotId);
  if (!snapshot) throw new Error(`Snapshot ${snapshotId} not found`);

  return runSync(snapshot, target, emit, options);
}

/**
 * Auto-sync: export snapshot and push to every enabled target for the project.
 * Returns all sync log entries.
 */
export async function syncAllEnabled(
  snapshotId: string,
  emit?: SyncEventEmitter,
): Promise<ISyncLog[]> {
  const db = DAC.db;

  const snapshot = await db.getSnapshotById(snapshotId);
  if (!snapshot) throw new Error(`Snapshot ${snapshotId} not found`);

  const targets = await db.getEnabledSyncTargets(snapshot.projectId);
  if (targets.length === 0) return [];

  // Export once, sync to many
  let exportResult: ExportResult | null = null;
  try {
    exportResult = await exportSnapshot(snapshotId);
  } catch (err: any) {
    // Export failed — log a failure for every target
    const logs: ISyncLog[] = [];
    for (const target of targets) {
      const log = buildLog(target.id, snapshotId, 'failed', `Export failed: ${err.message}`);
      await db.saveSyncLog(log);
      logs.push(log);
      emitStatus(emit, target.id, snapshotId, 'failed', log.message);
    }
    return logs;
  }

  // Dispatch to each target in parallel
  const results = await Promise.allSettled(
    targets.map((t) => dispatchToTarget(t, exportResult!, snapshotId, emit)),
  );

  return results.map((r) => (r.status === 'fulfilled' ? r.value : buildLog('unknown', snapshotId, 'failed', String((r as any).reason))));
}

// ── Internal ───────────────────────────────────────────────

async function runSync(
  snapshot: ISnapshot,
  target: ISyncTarget,
  emit?: SyncEventEmitter,
  options?: SyncOptions,
): Promise<ISyncLog> {
  const db = DAC.db;

  emitStatus(emit, target.id, snapshot.id, 'syncing');

  // Mark target as syncing
  await db.updateSyncTarget(target.id, { lastSyncStatus: 'syncing' });

  let exportResult: ExportResult;
  try {
    exportResult = await exportSnapshot(snapshot.id);
  } catch (err: any) {
    const log = buildLog(target.id, snapshot.id, 'failed', `Export failed: ${err.message}`);
    await db.saveSyncLog(log);
    await db.updateSyncTarget(target.id, {
      lastSyncStatus: 'failed',
      lastSyncError: err.message,
    });
    emitStatus(emit, target.id, snapshot.id, 'failed', log.message);
    return log;
  }

  return dispatchToTarget(target, exportResult, snapshot.id, emit, options);
}

async function dispatchToTarget(
  target: ISyncTarget,
  exportResult: ExportResult,
  snapshotId: string,
  emit?: SyncEventEmitter,
  options?: SyncOptions,
): Promise<ISyncLog> {
  const db = DAC.db;
  const startedAt = Date.now();

  emitStatus(emit, target.id, snapshotId, 'syncing');

  try {
    let result: { success: boolean; error?: string; filesCommitted?: string[]; filesWritten?: string[]; filePath?: string; commitSha?: string };

    if (target.type === 'local') {
      const localOpts: LocalSyncOptions = {
        targetPath: options?.targetPath,
        fileName: options?.fileName,
      };
      result = await syncToLocal(target, exportResult, localOpts);
    } else if (target.type === 'git') {
      result = await syncToGit(target, exportResult);
    } else {
      throw new Error(`Unknown sync target type: ${target.type}`);
    }

    const completedAt = Date.now();
    const durationMs = completedAt - startedAt;
    const files = result.filesCommitted ?? result.filesWritten ?? [];

    if (result.success) {
      const log = buildLog(target.id, snapshotId, 'success', `Synced ${files.length} file(s)`, {
        files,
        commitSha: (result as any).commitSha,
        durationMs,
      });
      log.completedAt = completedAt;
      log.durationMs = durationMs;

      await db.saveSyncLog(log);
      await db.updateSyncTarget(target.id, {
        lastSyncStatus: 'success',
        lastSyncError: undefined,
        lastSyncedAt: completedAt,
        lastSyncSnapshotId: snapshotId,
      });

      emitStatus(emit, target.id, snapshotId, 'success', log.message);
      return log;
    } else {
      const log = buildLog(target.id, snapshotId, 'failed', result.error ?? 'Unknown error', {
        files,
        durationMs,
      });
      log.completedAt = completedAt;
      log.durationMs = durationMs;

      await db.saveSyncLog(log);
      await db.updateSyncTarget(target.id, {
        lastSyncStatus: 'failed',
        lastSyncError: result.error,
      });

      emitStatus(emit, target.id, snapshotId, 'failed', result.error);
      return log;
    }
  } catch (err: any) {
    const completedAt = Date.now();
    const log = buildLog(target.id, snapshotId, 'failed', err.message ?? String(err));
    log.completedAt = completedAt;
    log.durationMs = completedAt - startedAt;

    await db.saveSyncLog(log);
    await db.updateSyncTarget(target.id, {
      lastSyncStatus: 'failed',
      lastSyncError: err.message,
    });

    emitStatus(emit, target.id, snapshotId, 'failed', err.message);
    return log;
  }
}

// ── Utilities ──────────────────────────────────────────────

function buildLog(
  syncTargetId: string,
  snapshotId: string,
  status: 'success' | 'failed' | 'skipped',
  message?: string,
  details?: Record<string, any>,
): ISyncLog {
  return {
    id: uuid(),
    syncTargetId,
    snapshotId,
    status,
    message,
    details,
    startedAt: Date.now(),
  };
}

function emitStatus(
  emit: SyncEventEmitter | undefined,
  syncTargetId: string,
  snapshotId: string,
  status: 'idle' | 'syncing' | 'success' | 'failed',
  message?: string,
) {
  if (emit) {
    emit({ syncTargetId, snapshotId, status, message });
  }
}
