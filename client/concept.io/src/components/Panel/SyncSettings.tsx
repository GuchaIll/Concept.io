/**
 * SyncSettings — Project-level panel for managing sync targets.
 *
 * Allows CRUD of git and local sync targets, shows last sync status,
 * and provides a manual "Sync Now" button.
 */

import { useState, useEffect, useCallback } from 'react';
import { useSession } from '../../contexts/SessionContext';
import {
  listSyncTargets,
  createSyncTarget,
  updateSyncTarget,
  deleteSyncTarget,
  triggerSync,
} from '../../services/sync.service';
import type { ISyncTarget, SyncTargetType, GitSyncConfig, LocalSyncConfig } from '../../../../common/sync.interface';

interface SyncSettingsProps {
  /** The snapshot to sync when the user clicks "Sync Now". */
  currentSnapshotId?: string;
  /** Close the panel */
  onClose?: () => void;
}

export const SyncSettings = ({ currentSnapshotId, onClose }: SyncSettingsProps) => {
  const { projectId, userId } = useSession();
  const [targets, setTargets] = useState<ISyncTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [syncing, setSyncing] = useState<Record<string, boolean>>({});

  // ── Load targets ────────────────────────────────────

  const refresh = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const data = await listSyncTargets(projectId);
      setTargets(data);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // ── Handlers ────────────────────────────────────────

  const handleDelete = async (targetId: string) => {
    if (!projectId) return;
    if (!confirm('Delete this sync target?')) return;
    try {
      await deleteSyncTarget(projectId, targetId);
      setTargets((prev) => prev.filter((t) => t.id !== targetId));
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleToggle = async (target: ISyncTarget) => {
    if (!projectId) return;
    try {
      const updated = await updateSyncTarget(projectId, target.id, { enabled: !target.enabled });
      setTargets((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleSyncNow = async (targetId: string) => {
    if (!projectId || !currentSnapshotId) return;
    setSyncing((s) => ({ ...s, [targetId]: true }));
    try {
      await triggerSync(projectId, targetId, currentSnapshotId);
      await refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSyncing((s) => ({ ...s, [targetId]: false }));
    }
  };

  // ── Render ──────────────────────────────────────────

  return (
    <div className="w-full max-w-lg mx-auto p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <span className="material-icons-round text-primary">sync</span>
          Sync Settings
        </h2>
        <div className="flex gap-2">
          <button
            onClick={() => setShowForm(true)}
            className="px-3 py-1 rounded-lg bg-primary/20 text-primary text-sm hover:bg-primary/30 transition-colors"
          >
            + Add Target
          </button>
          {onClose && (
            <button onClick={onClose} className="text-white/50 hover:text-white transition-colors">
              <span className="material-icons-round">close</span>
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="px-3 py-2 rounded-lg bg-red-500/20 text-red-300 text-sm">{error}</div>
      )}

      {/* Add Target Form */}
      {showForm && (
        <AddTargetForm
          projectId={projectId}
          userId={userId}
          onCreated={(t) => {
            setTargets((prev) => [...prev, t]);
            setShowForm(false);
          }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {/* Targets List */}
      {loading ? (
        <div className="text-white/50 text-sm text-center py-8">Loading sync targets...</div>
      ) : targets.length === 0 ? (
        <div className="text-white/40 text-sm text-center py-8">
          No sync targets configured. Add a git repo or local folder to auto-publish snapshots.
        </div>
      ) : (
        <div className="space-y-2">
          {targets.map((target) => (
            <TargetCard
              key={target.id}
              target={target}
              isSyncing={syncing[target.id] ?? false}
              hasSnapshot={!!currentSnapshotId}
              onToggle={() => handleToggle(target)}
              onDelete={() => handleDelete(target.id)}
              onSyncNow={() => handleSyncNow(target.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ── Target Card ─────────────────────────────────────────

interface TargetCardProps {
  target: ISyncTarget;
  isSyncing: boolean;
  hasSnapshot: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onSyncNow: () => void;
}

const TargetCard = ({ target, isSyncing, hasSnapshot, onToggle, onDelete, onSyncNow }: TargetCardProps) => {
  const statusColor = {
    success: 'bg-emerald-500',
    failed: 'bg-red-500',
    syncing: 'bg-amber-500 animate-pulse',
    idle: 'bg-gray-500',
  }[target.lastSyncStatus ?? 'idle'];

  const icon = target.type === 'git' ? 'code' : 'folder';
  const subtitle =
    target.type === 'git'
      ? (target.config as GitSyncConfig).repoUrl
      : (target.config as LocalSyncConfig).folderPath;

  return (
    <div className="glass-panel rounded-xl p-3 thin-border space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <span className="material-icons-round text-white/60">{icon}</span>
          <div className="min-w-0">
            <div className="text-sm font-medium text-white truncate">{target.name}</div>
            <div className="text-xs text-white/40 truncate">{subtitle}</div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <div className={`w-2 h-2 rounded-full ${statusColor}`} />

          {/* Toggle */}
          <button
            onClick={onToggle}
            className={`w-9 h-5 rounded-full transition-colors relative ${
              target.enabled ? 'bg-primary' : 'bg-white/20'
            }`}
          >
            <div
              className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                target.enabled ? 'left-4' : 'left-0.5'
              }`}
            />
          </button>

          {/* Sync Now */}
          <button
            onClick={onSyncNow}
            disabled={isSyncing || !target.enabled || !hasSnapshot}
            className="p-1 rounded-lg text-white/50 hover:text-primary hover:bg-primary/10 disabled:opacity-30 transition-colors"
            title="Sync now"
          >
            <span className={`material-icons-round text-base ${isSyncing ? 'animate-spin' : ''}`}>
              sync
            </span>
          </button>

          {/* Delete */}
          <button
            onClick={onDelete}
            className="p-1 rounded-lg text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-colors"
            title="Delete target"
          >
            <span className="material-icons-round text-base">delete_outline</span>
          </button>
        </div>
      </div>

      {/* Last sync info */}
      {target.lastSyncedAt && (
        <div className="text-xs text-white/30">
          Last synced: {new Date(target.lastSyncedAt).toLocaleString()}
          {target.lastSyncError && (
            <span className="text-red-400 ml-2">— {target.lastSyncError}</span>
          )}
        </div>
      )}
    </div>
  );
};

// ── Add Target Form ─────────────────────────────────────

interface AddTargetFormProps {
  projectId: string;
  userId: string;
  onCreated: (target: ISyncTarget) => void;
  onCancel: () => void;
}

const AddTargetForm = ({ projectId, userId, onCreated, onCancel }: AddTargetFormProps) => {
  const [type, setType] = useState<SyncTargetType>('local');
  const [name, setName] = useState('');
  const [folderPath, setFolderPath] = useState('');
  const [repoUrl, setRepoUrl] = useState('');
  const [branch, setBranch] = useState('main');
  const [repoPath, setRepoPath] = useState('art/concepts');
  const [provider, setProvider] = useState<'github' | 'gitlab'>('github');
  const [token, setToken] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!name.trim()) {
      setFormError('Name is required');
      return;
    }

    setSubmitting(true);
    setFormError(null);

    try {
      const config =
        type === 'local'
          ? { folderPath }
          : { repoUrl, branch, path: repoPath, provider };

      const created = await createSyncTarget({
        projectId,
        type,
        name,
        config,
        token: type === 'git' ? token : undefined,
        userId,
      });
      onCreated(created);
    } catch (e: any) {
      setFormError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="glass-panel rounded-xl p-4 thin-border space-y-3">
      <div className="text-sm font-medium text-white">New Sync Target</div>

      {/* Type selector */}
      <div className="flex gap-2">
        {(['local', 'git'] as SyncTargetType[]).map((t) => (
          <button
            key={t}
            onClick={() => setType(t)}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
              type === t ? 'bg-primary text-white' : 'bg-white/10 text-white/60 hover:bg-white/20'
            }`}
          >
            {t === 'local' ? 'Local Folder' : 'Git Repository'}
          </button>
        ))}
      </div>

      {/* Name */}
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Target name (e.g. Game Art Folder)"
        className="w-full px-3 py-2 rounded-lg bg-white/5 text-white text-sm border border-white/10 focus:border-primary/50 outline-none"
      />

      {type === 'local' ? (
        <input
          type="text"
          value={folderPath}
          onChange={(e) => setFolderPath(e.target.value)}
          placeholder="Absolute folder path (e.g. C:\GameProject\Assets\Art)"
          className="w-full px-3 py-2 rounded-lg bg-white/5 text-white text-sm border border-white/10 focus:border-primary/50 outline-none"
        />
      ) : (
        <>
          {/* Provider */}
          <div className="flex gap-2">
            {(['github', 'gitlab'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setProvider(p)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                  provider === p ? 'bg-primary/30 text-primary' : 'bg-white/10 text-white/60 hover:bg-white/20'
                }`}
              >
                {p === 'github' ? 'GitHub' : 'GitLab'}
              </button>
            ))}
          </div>

          <input
            type="text"
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            placeholder="Repository URL (e.g. https://github.com/user/repo)"
            className="w-full px-3 py-2 rounded-lg bg-white/5 text-white text-sm border border-white/10 focus:border-primary/50 outline-none"
          />

          <div className="flex gap-2">
            <input
              type="text"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              placeholder="Branch"
              className="w-1/3 px-3 py-2 rounded-lg bg-white/5 text-white text-sm border border-white/10 focus:border-primary/50 outline-none"
            />
            <input
              type="text"
              value={repoPath}
              onChange={(e) => setRepoPath(e.target.value)}
              placeholder="Path in repo"
              className="w-2/3 px-3 py-2 rounded-lg bg-white/5 text-white text-sm border border-white/10 focus:border-primary/50 outline-none"
            />
          </div>

          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Personal access token"
            className="w-full px-3 py-2 rounded-lg bg-white/5 text-white text-sm border border-white/10 focus:border-primary/50 outline-none"
          />
        </>
      )}

      {formError && <div className="text-xs text-red-400">{formError}</div>}

      <div className="flex gap-2 justify-end">
        <button
          onClick={onCancel}
          className="px-3 py-1.5 rounded-lg text-sm text-white/60 hover:text-white transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="px-4 py-1.5 rounded-lg text-sm bg-primary text-white hover:bg-primary/80 disabled:opacity-50 transition-colors"
        >
          {submitting ? 'Creating...' : 'Create Target'}
        </button>
      </div>
    </div>
  );
};
