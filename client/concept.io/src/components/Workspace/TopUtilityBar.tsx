interface TopUtilityBarProps {
  onBack?: () => void;
  onShare?: () => void;
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
  isLive = true,
  collaborators = [],
}: TopUtilityBarProps) => {
  const displayedCollaborators = collaborators.slice(0, 2);
  const remainingCount = Math.max(0, collaborators.length - 2);

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
          onClick={onShare}
          className="w-10 h-10 rounded-full glass-panel flex items-center justify-center thin-border text-white/70 hover:text-primary transition-colors"
        >
          <span className="material-icons-round">share</span>
        </button>
      </div>
    </header>
  );
};
