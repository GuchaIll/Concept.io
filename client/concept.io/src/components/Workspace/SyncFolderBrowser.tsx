/**
 * SyncFolderBrowser — dropdown panel showing the local sync target's folder tree.
 *
 * Shown from the sync button in TopUtilityBar.
 *
 * Features:
 *   • Lists all sync targets; selects local targets automatically
 *   • Renders the folder tree fetched from GET /targets/:id/files
 *   • + button: syncs the current snapshot to the target (creates structured folder)
 *   • Per-node actions:
 *       Link   — re-sync current canvas to overwrite this snapshot folder
 *       Open   — restore the linked snapshot onto the canvas
 *       Delete — delete the file/folder with a confirmation modal
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { ISyncTarget, SyncFileNode } from '../../../../../common/sync.interface';
import {
  listSyncTargets,
  listTargetFiles,
  deleteTargetFile,
  linkTargetFile,
  createTargetFolder,
  renameFileAcrossTargets,
  moveTargetFile,
} from '../../services/sync.service';
import { useSession } from '../../contexts/SessionContext';
import { useVersionContext } from '../../contexts/VersionContext';

// ── Types ─────────────────────────────────────────────────────────────────────

interface SyncFolderBrowserProps {
  onOpenSettings: () => void;
  onClose: () => void;
  /** Called with a short label whenever a sync/link action succeeds */
  onLinked?: (label: string) => void;
}

interface DeletePending {
  node: SyncFileNode;
  targetId: string;
}

interface NewItem {
  type: 'folder' | 'file';
  name: string;
  /** Parent folder path — empty string means root */
  parentPath: string;
}

interface ContextMenu {
  x: number;
  y: number;
  node: SyncFileNode | null;  // null = root folder
}

interface DragState {
  dragging: SyncFileNode | null;
  dragOver: string | null;  // path of folder being hovered
}

// ── Component ─────────────────────────────────────────────────────────────────

export const SyncFolderBrowser = ({
  onOpenSettings,
  onClose,
  onLinked,
}: SyncFolderBrowserProps) => {
  const { projectId } = useSession();
  const { currentSnapshotId, restoreSnapshot, getCurrentBranch, getCurrentSnapshot } = useVersionContext();
  const [targets, setTargets] = useState<ISyncTarget[]>([]);
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [fileTree, setFileTree] = useState<SyncFileNode[]>([]);
  const [isLoadingTargets, setIsLoadingTargets] = useState(true);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [deletePending, setDeletePending] = useState<DeletePending | null>(null);
  const [newItem, setNewItem] = useState<NewItem | null>(null);
  const [showNewMenu, setShowNewMenu] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const [dragState, setDragState] = useState<DragState>({ dragging: null, dragOver: null });
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Load targets
  useEffect(() => {
    setIsLoadingTargets(true);
    listSyncTargets(projectId)
      .then(ts => {
        setTargets(ts);
        // Auto-select the first local target
        const firstLocal = ts.find(t => t.type === 'local');
        if (firstLocal) setSelectedTargetId(firstLocal.id);
      })
      .catch(err => setError(err.message))
      .finally(() => setIsLoadingTargets(false));
  }, [projectId]);

  // Load file tree when target changes
  const loadFiles = useCallback(() => {
    if (!selectedTargetId) return;
    setIsLoadingFiles(true);
    setError(null);
    listTargetFiles(projectId, selectedTargetId)
      .then(tree => setFileTree(tree))
      .catch(err => setError(err.message))
      .finally(() => setIsLoadingFiles(false));
  }, [projectId, selectedTargetId]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  // Actions

  const handleSync = useCallback(async () => {
    if (!currentSnapshotId || !selectedTargetId) return;
    setIsSyncing(true);
    setError(null);
    try {
      await linkTargetFile(projectId, selectedTargetId, currentSnapshotId);
      setSuccessMsg('Synced');
      setTimeout(() => setSuccessMsg(null), 3000);
      loadFiles();
      // Build a short label from branch + snapshot name
      const branch = getCurrentBranch();
      const snapshot = getCurrentSnapshot();
      const label = [branch?.name, snapshot?.name].filter(Boolean).join('/');
      if (label) onLinked?.(label);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSyncing(false);
    }
  }, [currentSnapshotId, selectedTargetId, projectId, loadFiles, getCurrentBranch, getCurrentSnapshot, onLinked]);

  const handleLink = useCallback(async (node: SyncFileNode) => {
    if (!currentSnapshotId || !selectedTargetId) return;
    setError(null);
    try {
      await linkTargetFile(projectId, selectedTargetId, currentSnapshotId, node.path);
      setSuccessMsg(`Linked to ${node.name}`);
      setTimeout(() => setSuccessMsg(null), 3000);
      loadFiles();
      onLinked?.(node.path);
    } catch (err: any) {
      setError(err.message);
    }
  }, [currentSnapshotId, selectedTargetId, projectId, loadFiles, onLinked]);

  const handleOpen = useCallback((node: SyncFileNode) => {
    if (!node.linkedSnapshotId) return;
    restoreSnapshot(node.linkedSnapshotId);
    onClose();
  }, [restoreSnapshot, onClose]);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deletePending) return;
    setError(null);
    try {
      await deleteTargetFile(projectId, deletePending.targetId, deletePending.node.path);
      setDeletePending(null);
      loadFiles();
    } catch (err: any) {
      setError(err.message);
      setDeletePending(null);
    }
  }, [deletePending, projectId, loadFiles]);

  const handleCreate = useCallback(async () => {
    if (!newItem || !selectedTargetId || !newItem.name.trim()) return;
    setIsCreating(true);
    setError(null);
    try {
      // Build full path including parent
      const fullPath = newItem.parentPath
        ? `${newItem.parentPath}/${newItem.name.trim()}`
        : newItem.name.trim();

      if (newItem.type === 'folder') {
        await createTargetFolder(projectId, selectedTargetId, fullPath);
      } else {
        if (!currentSnapshotId) {
          setError('Save your canvas first (Ctrl+S) before creating a linked file.');
          setIsCreating(false);
          return;
        }
        // For files, pass the parent as filePath and the name separately
        await linkTargetFile(
          projectId,
          selectedTargetId,
          currentSnapshotId,
          newItem.parentPath || undefined,
          newItem.name.trim(),
        );
        onLinked?.(fullPath);
      }
      setSuccessMsg(`Created "${newItem.name.trim()}"`);
      setTimeout(() => setSuccessMsg(null), 3000);
      setNewItem(null);
      loadFiles();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsCreating(false);
    }
  }, [newItem, selectedTargetId, projectId, currentSnapshotId, loadFiles, onLinked]);

  // ── Drag & Drop handlers ──────────────────────────────────────────────────

  const handleDragStart = useCallback((node: SyncFileNode) => {
    setDragState({ dragging: node, dragOver: null });
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, folderPath: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (dragState.dragging && dragState.dragging.path !== folderPath) {
      setDragState(prev => ({ ...prev, dragOver: folderPath }));
    }
  }, [dragState.dragging]);

  const handleDragLeave = useCallback(() => {
    setDragState(prev => ({ ...prev, dragOver: null }));
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent, destPath: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!dragState.dragging || !selectedTargetId) return;

    const sourcePath = dragState.dragging.path;
    setDragState({ dragging: null, dragOver: null });

    // Don't move to self or into a child of self
    if (sourcePath === destPath || destPath.startsWith(sourcePath + '/')) {
      return;
    }

    setError(null);
    try {
      await moveTargetFile(projectId, selectedTargetId, sourcePath, destPath);
      loadFiles();
      setSuccessMsg(`Moved to ${destPath || 'root'}`);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setError(err.message);
    }
  }, [dragState.dragging, selectedTargetId, projectId, loadFiles]);

  const handleDragEnd = useCallback(() => {
    setDragState({ dragging: null, dragOver: null });
  }, []);

  // ── Context Menu handlers ─────────────────────────────────────────────────

  const handleContextMenu = useCallback((e: React.MouseEvent, node: SyncFileNode | null) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, node });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const handleContextAddFolder = useCallback(() => {
    if (!contextMenu) return;
    const parentPath = contextMenu.node?.type === 'folder' ? contextMenu.node.path : '';
    setNewItem({ type: 'folder', name: '', parentPath });
    closeContextMenu();
  }, [contextMenu, closeContextMenu]);

  const handleContextAddFile = useCallback(() => {
    if (!contextMenu) return;
    const parentPath = contextMenu.node?.type === 'folder' ? contextMenu.node.path : '';
    setNewItem({ type: 'file', name: '', parentPath });
    closeContextMenu();
  }, [contextMenu, closeContextMenu]);

  const handleRename = useCallback(async (node: SyncFileNode, newName: string) => {
    if (!newName.trim() || newName.trim() === node.name) return;
    setError(null);
    try {
      await renameFileAcrossTargets(projectId, node.path, newName.trim());
      loadFiles();
    } catch (err: any) {
      setError(err.message);
    }
  }, [projectId, loadFiles]);

  const selectedTarget = targets.find(t => t.id === selectedTargetId);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      ref={containerRef}
      className="absolute right-0 top-12 w-80 rounded-xl z-50 overflow-hidden shadow-2xl ring-1 ring-white/10 flex flex-col"
      style={{ background: '#12151a', maxHeight: '70vh' }}
      onClick={() => { closeContextMenu(); setShowNewMenu(false); }}
      onContextMenu={e => handleContextMenu(e, null)}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="material-icons-round text-base text-primary">folder_sync</span>
          <span className="text-sm font-semibold text-white">Sync Folder</span>
        </div>
        <div className="flex items-center gap-1">
          {/* Settings link */}
          <button
            type="button"
            onClick={onOpenSettings}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors"
            title="Sync Settings"
          >
            <span className="material-icons-round text-sm">settings</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors"
          >
            <span className="material-icons-round text-sm">close</span>
          </button>
        </div>
      </div>

      {/* Target selector (if multiple local targets) */}
      {targets.filter(t => t.type === 'local').length > 1 && (
        <div className="px-3 pt-2 flex-shrink-0">
          <select
            value={selectedTargetId ?? ''}
            onChange={e => setSelectedTargetId(e.target.value)}
            className="w-full px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-white/80 focus:outline-none focus:ring-1 focus:ring-primary/50"
          >
            {targets.filter(t => t.type === 'local').map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 flex-shrink-0 border-b border-white/5">
        {selectedTarget && (
          <p className="flex-1 text-[10px] text-white/30 truncate font-mono">
            {(selectedTarget.config as any).folderPath}
          </p>
        )}
        {/* + button with dropdown */}
        <div className="relative flex-shrink-0">
          <button
            type="button"
            onClick={() => { setShowNewMenu(v => !v); setNewItem(null); }}
            className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-colors"
            title="New folder or file"
          >
            <span className="material-icons-round text-sm">add</span>
          </button>
          {showNewMenu && (
            <div className="absolute right-0 top-8 w-32 rounded-xl z-10 overflow-hidden shadow-xl ring-1 ring-white/10" style={{ background: '#1c2030' }}>
              <button
                type="button"
                onClick={e => { e.stopPropagation(); setNewItem({ type: 'folder', name: '', parentPath: '' }); setShowNewMenu(false); }}
                className="w-full px-3 py-2 text-left text-xs text-white/70 hover:text-white hover:bg-white/10 flex items-center gap-2"
              >
                <span className="material-icons-round text-sm text-amber-400">create_new_folder</span>
                Add Folder
              </button>
              <button
                type="button"
                onClick={e => { e.stopPropagation(); setNewItem({ type: 'file', name: '', parentPath: '' }); setShowNewMenu(false); }}
                className="w-full px-3 py-2 text-left text-xs text-white/70 hover:text-white hover:bg-white/10 flex items-center gap-2"
              >
                <span className="material-icons-round text-sm text-primary">add_photo_alternate</span>
                Add File
              </button>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={handleSync}
          disabled={!currentSnapshotId || !selectedTargetId || isSyncing}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/20 hover:bg-primary/30 disabled:opacity-40 disabled:cursor-not-allowed text-primary text-xs font-semibold transition-colors flex-shrink-0"
          title="Sync current canvas to this target"
        >
          <span className={`material-icons-round text-sm ${isSyncing ? 'animate-spin' : ''}`}>
            {isSyncing ? 'refresh' : 'sync'}
          </span>
          {isSyncing ? 'Syncing…' : 'Sync Now'}
        </button>
        <button
          type="button"
          onClick={loadFiles}
          disabled={isLoadingFiles}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors flex-shrink-0"
          title="Refresh"
        >
          <span className={`material-icons-round text-sm ${isLoadingFiles ? 'animate-spin' : ''}`}>refresh</span>
        </button>
      </div>

      {/* New item inline form */}
      {newItem && (
        <div className="px-3 py-2 border-b border-white/5 flex items-center gap-2 flex-shrink-0 bg-white/[0.02]">
          <span className={`material-icons-round text-sm flex-shrink-0 ${newItem.type === 'folder' ? 'text-amber-400' : 'text-primary'}`}>
            {newItem.type === 'folder' ? 'folder' : 'image'}
          </span>
          <input
            autoFocus
            type="text"
            placeholder={newItem.type === 'folder' ? 'Folder name' : 'File name'}
            value={newItem.name}
            onChange={e => setNewItem({ ...newItem, name: e.target.value })}
            onKeyDown={e => {
              if (e.key === 'Enter') handleCreate();
              if (e.key === 'Escape') setNewItem(null);
            }}
            className="flex-1 min-w-0 bg-transparent text-xs text-white/80 placeholder-white/20 outline-none border-b border-white/20 focus:border-primary/60 pb-0.5"
          />
          <button
            type="button"
            onClick={handleCreate}
            disabled={isCreating || !newItem.name.trim()}
            className="text-primary text-xs font-semibold disabled:opacity-40 flex-shrink-0 hover:text-primary/80"
          >
            {isCreating ? '…' : 'Create'}
          </button>
          <button
            type="button"
            onClick={() => setNewItem(null)}
            className="text-white/30 hover:text-white/60 flex-shrink-0"
          >
            <span className="material-icons-round text-sm">close</span>
          </button>
        </div>
      )}

      {/* Status messages */}
      {successMsg && (
        <div className="px-4 py-1.5 bg-emerald-500/10 border-b border-emerald-500/20 flex items-center gap-2 flex-shrink-0">
          <span className="material-icons-round text-xs text-emerald-400">check_circle</span>
          <span className="text-xs text-emerald-400">{successMsg}</span>
        </div>
      )}
      {error && (
        <div className="px-4 py-1.5 bg-red-500/10 border-b border-red-500/20 flex items-center gap-2 flex-shrink-0">
          <span className="material-icons-round text-xs text-red-400">error</span>
          <span className="text-xs text-red-400 truncate">{error}</span>
        </div>
      )}

      {/* File tree */}
      <div
        className="flex-1 overflow-y-auto py-1"
        onDragOver={e => handleDragOver(e, '')}
        onDragLeave={handleDragLeave}
        onDrop={e => handleDrop(e, '')}
      >
        {isLoadingTargets || isLoadingFiles ? (
          <div className="flex items-center justify-center py-8 gap-2 text-white/30">
            <span className="material-icons-round text-base animate-spin">refresh</span>
            <span className="text-xs">Loading…</span>
          </div>
        ) : !selectedTargetId ? (
          <div className="flex flex-col items-center justify-center py-8 gap-2 text-white/30">
            <span className="material-icons-round text-2xl">folder_off</span>
            <p className="text-xs text-center px-4">
              No local sync target configured.<br />
              Add one in <button type="button" className="text-primary underline" onClick={onOpenSettings}>Sync Settings</button>.
            </p>
          </div>
        ) : fileTree.length === 0 ? (
          <div
            className={`flex flex-col items-center justify-center py-8 gap-2 text-white/30 ${dragState.dragOver === '' ? 'bg-primary/10 ring-1 ring-primary/30' : ''}`}
          >
            <span className="material-icons-round text-2xl">folder_open</span>
            <p className="text-xs">Folder is empty. Click <strong className="text-white/50">Sync Now</strong> to export.</p>
          </div>
        ) : (
          <FileTreeList
            nodes={fileTree}
            depth={0}
            onLink={handleLink}
            onOpen={handleOpen}
            onDelete={node => setDeletePending({ node, targetId: selectedTargetId! })}
            onRename={handleRename}
            onContextMenu={handleContextMenu}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onDragEnd={handleDragEnd}
            dragState={dragState}
          />
        )}
      </div>

      {/* Delete confirmation modal */}
      {deletePending && (
        <div className="absolute inset-0 z-10 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="w-full rounded-xl p-4 space-y-3" style={{ background: '#1c2030' }}>
            <div className="flex items-start gap-3">
              <span className="material-icons-round text-red-400 text-xl mt-0.5">warning</span>
              <div>
                <p className="text-sm font-semibold text-white">Delete "{deletePending.node.name}"?</p>
                <p className="text-xs text-white/40 mt-1">
                  This will permanently remove the {deletePending.node.type === 'folder' ? 'folder and all its contents' : 'file'} from disk.
                </p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setDeletePending(null)}
                className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white text-xs transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                className="px-3 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 text-xs font-semibold transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 rounded-xl overflow-hidden shadow-xl ring-1 ring-white/10"
          style={{ left: contextMenu.x, top: contextMenu.y, background: '#1c2030' }}
          onClick={e => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={handleContextAddFolder}
            className="w-full px-3 py-2 text-left text-xs text-white/70 hover:text-white hover:bg-white/10 flex items-center gap-2"
          >
            <span className="material-icons-round text-sm text-amber-400">create_new_folder</span>
            New Folder
          </button>
          <button
            type="button"
            onClick={handleContextAddFile}
            className="w-full px-3 py-2 text-left text-xs text-white/70 hover:text-white hover:bg-white/10 flex items-center gap-2"
          >
            <span className="material-icons-round text-sm text-primary">add_photo_alternate</span>
            New File
          </button>
          {contextMenu.node && (
            <>
              <div className="border-t border-white/5 my-1" />
              <button
                type="button"
                onClick={() => { setDeletePending({ node: contextMenu.node!, targetId: selectedTargetId! }); closeContextMenu(); }}
                className="w-full px-3 py-2 text-left text-xs text-red-400 hover:text-red-300 hover:bg-white/10 flex items-center gap-2"
              >
                <span className="material-icons-round text-sm">delete</span>
                Delete
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

// ── FileTreeList ──────────────────────────────────────────────────────────────

interface FileTreeListProps {
  nodes: SyncFileNode[];
  depth: number;
  onLink: (node: SyncFileNode) => void;
  onOpen: (node: SyncFileNode) => void;
  onDelete: (node: SyncFileNode) => void;
  onRename: (node: SyncFileNode, newName: string) => void;
  onContextMenu: (e: React.MouseEvent, node: SyncFileNode | null) => void;
  onDragStart: (node: SyncFileNode) => void;
  onDragOver: (e: React.DragEvent, folderPath: string) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent, destPath: string) => void;
  onDragEnd: () => void;
  dragState: DragState;
}

const FileTreeList = ({
  nodes,
  depth,
  onLink,
  onOpen,
  onDelete,
  onRename,
  onContextMenu,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  dragState,
}: FileTreeListProps) => (
  <>
    {nodes.map(node => (
      <FileTreeRow
        key={node.path}
        node={node}
        depth={depth}
        onLink={onLink}
        onOpen={onOpen}
        onDelete={onDelete}
        onRename={onRename}
        onContextMenu={onContextMenu}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onDragEnd={onDragEnd}
        dragState={dragState}
      />
    ))}
  </>
);

// ── FileTreeRow ───────────────────────────────────────────────────────────────

interface FileTreeRowProps {
  node: SyncFileNode;
  depth: number;
  onLink: (node: SyncFileNode) => void;
  onOpen: (node: SyncFileNode) => void;
  onDelete: (node: SyncFileNode) => void;
  onRename: (node: SyncFileNode, newName: string) => void;
  onContextMenu: (e: React.MouseEvent, node: SyncFileNode | null) => void;
  onDragStart: (node: SyncFileNode) => void;
  onDragOver: (e: React.DragEvent, folderPath: string) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent, destPath: string) => void;
  onDragEnd: () => void;
  dragState: DragState;
}

const FileTreeRow = ({
  node,
  depth,
  onLink,
  onOpen,
  onDelete,
  onRename,
  onContextMenu,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  dragState,
}: FileTreeRowProps) => {
  const [expanded, setExpanded] = useState(depth === 0);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(node.name);
  const isSnapshotFolder = node.type === 'folder' && !!node.linkedSnapshotId;
  const hasChildren = node.type === 'folder' && (node.children?.length ?? 0) > 0;
  const isDragging = dragState.dragging?.path === node.path;
  const isDropTarget = node.type === 'folder' && dragState.dragOver === node.path;
  const indent = depth * 12;

  const icon = node.type === 'folder'
    ? (isSnapshotFolder ? 'photo_library' : (expanded ? 'folder_open' : 'folder'))
    : getFileIcon(node.name);

  const iconColor = node.type === 'folder'
    ? (isSnapshotFolder ? 'text-primary' : 'text-amber-400')
    : 'text-white/40';

  const commitRename = () => {
    setIsEditing(false);
    onRename(node, editName);
  };

  return (
    <>
      <div
        className={`group flex items-center gap-1.5 px-3 py-1 hover:bg-white/5 transition-colors cursor-grab
          ${isDragging ? 'opacity-50' : ''}
          ${isDropTarget ? 'bg-primary/10 ring-1 ring-primary/30' : ''}`}
        style={{ paddingLeft: `${12 + indent}px` }}
        draggable={!isEditing}
        onDragStart={e => { e.stopPropagation(); onDragStart(node); }}
        onDragOver={e => node.type === 'folder' ? onDragOver(e, node.path) : undefined}
        onDragLeave={onDragLeave}
        onDrop={e => node.type === 'folder' ? onDrop(e, node.path) : undefined}
        onDragEnd={onDragEnd}
        onContextMenu={e => onContextMenu(e, node)}
      >
        {/* Expand toggle (folders only) */}
        {node.type === 'folder' ? (
          <button
            type="button"
            onClick={() => setExpanded(v => !v)}
            className="w-4 h-4 flex items-center justify-center text-white/30 hover:text-white/60 flex-shrink-0"
          >
            <span className="material-icons-round text-xs">
              {hasChildren ? (expanded ? 'expand_more' : 'chevron_right') : 'remove'}
            </span>
          </button>
        ) : (
          <span className="w-4 flex-shrink-0" />
        )}

        {/* Icon */}
        <span className={`material-icons-round text-sm flex-shrink-0 ${iconColor}`}>{icon}</span>

        {/* Name — inline editable on double-click */}
        {isEditing ? (
          <input
            autoFocus
            type="text"
            value={editName}
            onChange={e => setEditName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
              if (e.key === 'Escape') { setIsEditing(false); setEditName(node.name); }
            }}
            onClick={e => e.stopPropagation()}
            className="flex-1 min-w-0 bg-white/5 text-xs text-white/90 px-1 rounded outline-none ring-1 ring-primary/50"
          />
        ) : (
          <span
            className="flex-1 text-xs text-white/70 truncate min-w-0 cursor-text"
            onDoubleClick={() => { setEditName(node.name); setIsEditing(true); }}
            title="Double-click to rename"
          >
            {node.name}
          </span>
        )}

        {/* Mod time */}
        {!isEditing && node.modifiedAt && (
          <span className="text-[9px] text-white/20 flex-shrink-0 hidden group-hover:block">
            {formatDate(node.modifiedAt)}
          </span>
        )}

        {/* Action buttons — visible on hover */}
        {!isEditing && (
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
            {/* Link: sync current canvas to this location */}
            <ActionBtn
              icon="link"
              title="Link current canvas to this folder"
              color="text-primary"
              onClick={() => onLink(node)}
            />
            {/* Open: restore the linked snapshot (snapshot folders only) */}
            {isSnapshotFolder && (
              <ActionBtn
                icon="open_in_new"
                title="Open this version on canvas"
                color="text-emerald-400"
                onClick={() => onOpen(node)}
              />
            )}
            {/* Delete */}
            <ActionBtn
              icon="delete"
              title="Delete"
              color="text-red-400"
              onClick={() => onDelete(node)}
            />
          </div>
        )}
      </div>

      {/* Children */}
      {node.type === 'folder' && expanded && node.children && node.children.length > 0 && (
        <FileTreeList
          nodes={node.children}
          depth={depth + 1}
          onLink={onLink}
          onOpen={onOpen}
          onDelete={onDelete}
          onRename={onRename}
          onContextMenu={onContextMenu}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onDragEnd={onDragEnd}
          dragState={dragState}
        />
      )}
    </>
  );
};

// ── ActionBtn ─────────────────────────────────────────────────────────────────

const ActionBtn = ({
  icon,
  title,
  color,
  onClick,
}: {
  icon: string;
  title: string;
  color: string;
  onClick: () => void;
}) => (
  <button
    type="button"
    title={title}
    onClick={e => { e.stopPropagation(); onClick(); }}
    className={`w-6 h-6 flex items-center justify-center rounded-md hover:bg-white/10 transition-colors ${color}`}
  >
    <span className="material-icons-round text-sm">{icon}</span>
  </button>
);

// ── Helpers ───────────────────────────────────────────────────────────────────

function getFileIcon(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (ext === 'png' || ext === 'jpg' || ext === 'jpeg' || ext === 'webp') return 'image';
  if (ext === 'json') return 'data_object';
  return 'description';
}

function formatDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}
