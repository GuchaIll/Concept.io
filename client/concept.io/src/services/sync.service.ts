/**
 * sync.service.ts — Client-side API calls for sync target management.
 */

import type {
  ISyncTarget,
  ISyncLog,
  CreateSyncTargetPayload,
  SyncFileNode,
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

// ── File Browser ───────────────────────────────────────

export async function listTargetFiles(
  projectId: string,
  targetId: string,
): Promise<SyncFileNode[]> {
  const res = await fetch(url(projectId, `/targets/${targetId}/files`));
  const json = await res.json();
  if (!json.success) throw new Error(json.error ?? 'Failed to list files');
  return json.data;
}

export async function deleteTargetFile(
  projectId: string,
  targetId: string,
  filePath: string,
): Promise<void> {
  const res = await fetch(url(projectId, `/targets/${targetId}/files`), {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filePath }),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error ?? 'Failed to delete file');
}

export async function linkTargetFile(
  projectId: string,
  targetId: string,
  snapshotId: string,
  filePath?: string,
  fileName?: string,
): Promise<ISyncLog> {
  const res = await fetch(url(projectId, `/targets/${targetId}/files/link`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ snapshotId, filePath, fileName }),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error ?? 'Failed to link file');
  return json.data;
}

export async function createTargetFolder(
  projectId: string,
  targetId: string,
  dirPath: string,
): Promise<void> {
  const res = await fetch(url(projectId, `/targets/${targetId}/files/mkdir`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dirPath }),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error ?? 'Failed to create folder');
}

export async function moveTargetFile(
  projectId: string,
  targetId: string,
  sourcePath: string,
  destPath: string,
): Promise<{ newPath: string }> {
  const res = await fetch(url(projectId, `/targets/${targetId}/files/move`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sourcePath, destPath }),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error ?? 'Failed to move file');
  return json.data;
}

export async function renameFileAcrossTargets(
  projectId: string,
  oldPath: string,
  newName: string,
): Promise<void> {
  const res = await fetch(url(projectId, '/files/rename'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ oldPath, newName }),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error ?? 'Failed to rename');
}
