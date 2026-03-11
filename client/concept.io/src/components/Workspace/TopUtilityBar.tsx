import { ProjectSwitcher } from './ProjectSwitcher';
import { useVersionContext } from '../../contexts/VersionContext';

type SyncStatus = 'idle' | 'syncing' | 'success' | 'failed';

interface TopUtilityBarProps {
  onBack?: () => void;
  onShare?: () => void;
  onSyncSettings?: () => void;
  isLive?: boolean;
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
  isLive = true,
  collaborators = [],
}: TopUtilityBarProps) => {
  const displayedCollaborators = collaborators.slice(0, 2);
  const remainingCount = Math.max(0, collaborators.length - 2);

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
          <div className={`w-2 h-2 rounded-full ${isLive ? 'bg-emerald-500 animate-pulse' : 'bg-gray-500'}`} />
          <span className="text-xs font-medium tracking-widest uppercase">
            {isLive ? 'Live Sync' : 'Offline'}
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

        <button
          onClick={onSyncSettings}
          className="w-10 h-10 rounded-full glass-panel flex items-center justify-center thin-border text-white/70 hover:text-primary transition-colors"
          title="Sync Settings"
        >
          <span className="material-icons-round">sync</span>
        </button>

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
