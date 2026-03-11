// Sync target configuration — shared between client and server

export type SyncTargetType = 'git' | 'local';
export type SyncStatus = 'idle' | 'syncing' | 'success' | 'failed';
export type GitProvider = 'github' | 'gitlab';

export interface GitSyncConfig {
  repoUrl: string;      // e.g. https://github.com/user/repo
  branch: string;       // e.g. main
  path: string;         // subfolder in repo, e.g. "art/concepts"
  provider: GitProvider;
  // Token is stored encrypted server-side; client sends plaintext on create
  encryptedToken?: string;
}

export interface LocalSyncConfig {
  folderPath: string;   // absolute path on server host, e.g. "C:/GameProject/Assets/Art"
}

export type SyncConfig = GitSyncConfig | LocalSyncConfig;

export interface ISyncTarget {
  id: string;
  projectId: string;
  type: SyncTargetType;
  name: string;
  config: SyncConfig;
  enabled: boolean;
  lastSyncedAt?: number;
  lastSyncSnapshotId?: string;
  lastSyncStatus?: SyncStatus;
  lastSyncError?: string;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

export interface ISyncLog {
  id: string;
  syncTargetId: string;
  snapshotId: string;
  status: 'success' | 'failed' | 'skipped';
  message?: string;
  details?: Record<string, any>;
  startedAt: number;
  completedAt?: number;
  durationMs?: number;
}

// Client ↔ Server payloads
export interface CreateSyncTargetPayload {
  projectId: string;
  type: SyncTargetType;
  name: string;
  config: SyncConfig;
  token?: string; // plaintext token, encrypted server-side before storage
}

export interface SyncStatusEvent {
  syncTargetId: string;
  snapshotId: string;
  status: SyncStatus;
  message?: string;
}
