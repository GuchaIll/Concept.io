/**
 * sync.service.ts — Client-side API calls for sync target management.
 */

import type {
  ISyncTarget,
  ISyncLog,
  CreateSyncTargetPayload,
  SyncTargetType,
} from '../../../../common/sync.interface';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';

function url(projectId: string, path: string) {
  return `${API_BASE}/api/projects/${projectId}/sync${path}`;
}

// ── Sync Targets CRUD ──────────────────────────────────

export async function listSyncTargets(projectId: string): Promise<ISyncTarget[]> {
  const res = await fetch(url(projectId, '/targets'));
  const json = await res.json();
  if (!json.success) throw new Error(json.error ?? 'Failed to list sync targets');
  return json.data;
}

export async function getSyncTarget(projectId: string, targetId: string): Promise<ISyncTarget> {
  const res = await fetch(url(projectId, `/targets/${targetId}`));
  const json = await res.json();
  if (!json.success) throw new Error(json.error ?? 'Sync target not found');
  return json.data;
}

export async function createSyncTarget(
  payload: CreateSyncTargetPayload & { token?: string; userId: string },
): Promise<ISyncTarget> {
  const res = await fetch(url(payload.projectId, '/targets'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error ?? 'Failed to create sync target');
  return json.data;
}

export async function updateSyncTarget(
  projectId: string,
  targetId: string,
  updates: Partial<ISyncTarget> & { token?: string },
): Promise<ISyncTarget> {
  const res = await fetch(url(projectId, `/targets/${targetId}`), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error ?? 'Failed to update sync target');
  return json.data;
}

export async function deleteSyncTarget(projectId: string, targetId: string): Promise<void> {
  const res = await fetch(url(projectId, `/targets/${targetId}`), {
    method: 'DELETE',
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error ?? 'Failed to delete sync target');
}

// ── Manual Sync Triggers ───────────────────────────────

export async function triggerSync(
  projectId: string,
  targetId: string,
  snapshotId: string,
): Promise<ISyncLog> {
  const res = await fetch(url(projectId, `/targets/${targetId}/sync`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ snapshotId }),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error ?? 'Sync failed');
  return json.data;
}

export async function triggerSyncAll(
  projectId: string,
  snapshotId: string,
): Promise<ISyncLog[]> {
  const res = await fetch(url(projectId, '/sync-all'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ snapshotId }),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error ?? 'Sync-all failed');
  return json.data;
}

// ── Sync Logs ──────────────────────────────────────────

export async function getSyncLogs(
  projectId: string,
  targetId: string,
  limit = 50,
): Promise<ISyncLog[]> {
  const res = await fetch(url(projectId, `/targets/${targetId}/logs?limit=${limit}`));
  const json = await res.json();
  if (!json.success) throw new Error(json.error ?? 'Failed to fetch sync logs');
  return json.data;
}
