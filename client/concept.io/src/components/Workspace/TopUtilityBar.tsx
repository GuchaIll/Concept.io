import { ProjectSwitcher } from './ProjectSwitcher';
import { SyncFolderBrowser } from './SyncFolderBrowser';
import { useVersionContext } from '../../contexts/VersionContext';
import { useState, useRef, useEffect } from 'react';
import type { ServiceStatus } from '../../hooks/useServiceStatus';

type SyncStatus = 'idle' | 'syncing' | 'success' | 'failed';

interface TopUtilityBarProps {
  onBack?: () => void;
  onShare?: () => void;
  onSyncSettings?: () => void;
  onExport?: (format: 'png' | 'jpeg') => void;
  /** Backend / DB health status — drives the sync dot colour */
  serviceStatus?: ServiceStatus;
  collaborators?: Array<{
    id: string;
    name: string;
    avatarUrl?: string;
  }>;
}

export const TopUtilityBar = ({
  onBack,
  onShare,
  onSyncSettings,
  onExport,
  serviceStatus = 'ok',
  collaborators = [],
}: TopUtilityBarProps) => {
  const displayedCollaborators = collaborators.slice(0, 2);
  const remainingCount = Math.max(0, collaborators.length - 2);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showFolderBrowser, setShowFolderBrowser] = useState(false);
  const [linkedFilePath, setLinkedFilePath] = useState<string | null>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const folderBrowserRef = useRef<HTMLDivElement>(null);

  // Sync status from VersionContext
  let syncStatus: SyncStatus = 'idle';
  try {
    const ctx = useVersionContext();
    syncStatus = ctx.syncStatus;
  } catch {
    // VersionContext not available — show idle
  }

  const syncLabel: Record<SyncStatus, string> = {
    idle: '',
    syncing: 'Syncing...',
    success: 'Synced',
    failed: 'Sync Failed',
  };
  const syncColor: Record<SyncStatus, string> = {
    idle: '',
    syncing: 'text-amber-400',
    success: 'text-emerald-400',
    failed: 'text-red-400',
  };
  const syncDot: Record<SyncStatus, string> = {
    idle: '',
    syncing: 'bg-amber-500 animate-pulse',
    success: 'bg-emerald-500',
    failed: 'bg-red-500',
  };

  // Close export dropdown on outside click
  useEffect(() => {
    if (!showExportMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setShowExportMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showExportMenu]);

  // Close folder browser on outside click
  useEffect(() => {
    if (!showFolderBrowser) return;
    const handleClick = (e: MouseEvent) => {
      if (folderBrowserRef.current && !folderBrowserRef.current.contains(e.target as Node)) {
        setShowFolderBrowser(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showFolderBrowser]);

  return (
    <header className="absolute top-0 left-0 right-0 h-16 flex items-center justify-between px-6 z-30 pointer-events-none">
      {/* Left Section */}
      <div className="flex items-center gap-4 pointer-events-auto">
        <button
          onClick={onBack}
          className="w-10 h-10 rounded-full glass-panel flex items-center justify-center thin-border text-white/70 hover:text-white transition-colors"
        >
          <span className="material-icons-round">arrow_back_ios_new</span>
        </button>
        
        <div className="glass-panel px-4 py-2 rounded-full thin-border flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full ${
            serviceStatus === 'ok'
              ? 'bg-emerald-500 animate-pulse'
              : serviceStatus === 'db-down'
                ? 'bg-amber-500'
                : 'bg-red-500'
          }`} />
          <span className="text-xs font-medium tracking-widest uppercase">
            {serviceStatus === 'ok' ? 'Live Sync' : serviceStatus === 'db-down' ? 'DB Offline' : 'Offline'}
          </span>
        </div>

        {/* Sync Status Indicator */}
        {syncStatus !== 'idle' && (
          <div className="glass-panel px-3 py-2 rounded-full thin-border flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${syncDot[syncStatus]}`} />
            <span className={`text-xs font-medium ${syncColor[syncStatus]}`}>
              {syncLabel[syncStatus]}
            </span>
          </div>
        )}

        {/* Project Switcher */}
        <ProjectSwitcher />
      </div>

      {/* Right Section */}
      <div className="flex items-center gap-2 pointer-events-auto">
        {/* Collaborator Avatars */}
        {collaborators.length > 0 && (
          <div className="flex -space-x-2 mr-4">
            {displayedCollaborators.map((collab) => (
              <div
                key={collab.id}
                className="w-8 h-8 rounded-full border-2 border-background-dark overflow-hidden"
              >
                {collab.avatarUrl ? (
                  <img
                    className="w-full h-full object-cover"
                    src={collab.avatarUrl}
                    alt={collab.name}
                  />
                ) : (
                  <div className="w-full h-full bg-primary flex items-center justify-center text-[10px] font-bold">
                    {collab.name.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
            ))}
            {remainingCount > 0 && (
              <div className="w-8 h-8 rounded-full border-2 border-background-dark bg-primary flex items-center justify-center text-[10px] font-bold">
                +{remainingCount}
              </div>
            )}
          </div>
        )}

        {/* Link canvas pill button — opens folder browser */}
        <div className="relative" ref={folderBrowserRef}>
          <button
            onClick={() => setShowFolderBrowser(v => !v)}
            className={`h-9 rounded-full glass-panel thin-border flex items-center gap-2 px-3 transition-colors ${
              showFolderBrowser
                ? 'text-primary ring-1 ring-primary/30'
                : 'text-white/70 hover:text-white'
            }`}
            title="Sync folder browser"
          >
            <span className="material-icons-round text-base flex-shrink-0">folder</span>
            {linkedFilePath ? (
              <>
                <span className="text-white/40 text-xs">:</span>
                <span className="text-xs font-medium max-w-[160px] truncate">{linkedFilePath}</span>
              </>
            ) : (
              <span className="text-xs text-white/40 italic">link canvas</span>
            )}
          </button>

          {showFolderBrowser && (
            <SyncFolderBrowser
              onOpenSettings={() => { setShowFolderBrowser(false); onSyncSettings?.(); }}
              onClose={() => setShowFolderBrowser(false)}
              onLinked={label => setLinkedFilePath(label)}
            />
          )}
        </div>

        <button
          onClick={onSyncSettings}
          className="w-10 h-10 rounded-full glass-panel flex items-center justify-center thin-border text-white/70 hover:text-primary transition-colors"
          title="Sync Settings"
        >
          <span className="material-icons-round">sync</span>
        </button>

        {/* Export / Download */}
        {onExport && (
          <div className="relative" ref={exportMenuRef}>
            <button
              onClick={() => setShowExportMenu(v => !v)}
              className="w-10 h-10 rounded-full glass-panel flex items-center justify-center thin-border text-white/70 hover:text-primary transition-colors"
              title="Export Image"
            >
              <span className="material-icons-round">download</span>
            </button>

            {showExportMenu && (
              <div className="absolute right-0 top-12 glass-panel thin-border rounded-xl py-1 min-w-[140px] z-50">
                <button
                  onClick={() => { onExport('png'); setShowExportMenu(false); }}
                  className="w-full px-4 py-2 text-left text-sm text-white/80 hover:text-white hover:bg-white/10 flex items-center gap-2"
                >
                  <span className="material-icons-round text-base">image</span>
                  PNG
                </button>
                <button
                  onClick={() => { onExport('jpeg'); setShowExportMenu(false); }}
                  className="w-full px-4 py-2 text-left text-sm text-white/80 hover:text-white hover:bg-white/10 flex items-center gap-2"
                >
                  <span className="material-icons-round text-base">photo</span>
                  JPEG
                </button>
              </div>
            )}
          </div>
        )}

        <button
          onClick={onShare}
          className="w-10 h-10 rounded-full glass-panel flex items-center justify-center thin-border text-white/70 hover:text-primary transition-colors"
        >
          <span className="material-icons-round">share</span>
        </button>
      </div>
    </header>
  );
};
