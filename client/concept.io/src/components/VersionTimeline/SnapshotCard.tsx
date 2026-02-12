import type { ISnapshot, IBranch } from '../../types/version.interface';

interface SnapshotCardProps {
  snapshot: ISnapshot;
  branch: IBranch;
  isActive: boolean;
  isHead: boolean;
  isSelected: boolean;
  onClick: () => void;
  onRestore: () => void;
  onSelect: () => void;
}

// Format relative time
const formatRelativeTime = (timestamp: number): string => {
  const now = Date.now();
  const diff = now - timestamp;
  
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
};

// Format snapshot ID for display
const formatSnapshotId = (id: string): string => {
  return `#${id.slice(0, 6).toUpperCase()}`;
};

export const SnapshotCard = ({
  snapshot,
  branch,
  isActive,
  isHead,
  isSelected,
  onClick,
  onRestore,
  onSelect,
}: SnapshotCardProps) => {
  return (
    <div className="relative flex flex-col items-center group">
      {/* Asset/External ID Badge */}
      {snapshot.description && (
        <div className="absolute -top-8 bg-slate-panel border border-primary/30 px-2 py-0.5 rounded text-[8px] font-bold text-primary flex items-center gap-1 whitespace-nowrap">
          <span className="material-icons text-[10px]">inventory_2</span>
          {snapshot.description.slice(0, 20)}
        </div>
      )}
      
      {/* Thumbnail Card */}
      <div
        onClick={onClick}
        className={`
          w-24 h-24 rounded-xl border-2 p-1 bg-background-dark shadow-xl cursor-pointer
          transition-all duration-200
          ${isActive 
            ? 'border-primary scale-110 ring-4 ring-primary/10 shadow-2xl shadow-primary/20' 
            : isSelected
              ? 'border-primary/60 scale-105'
              : 'border-primary/40 hover:scale-105'
          }
        `}
        style={{ borderColor: isActive ? branch.color : undefined }}
      >
        {snapshot.thumbnail ? (
          <img
            src={snapshot.thumbnail}
            alt={snapshot.name}
            className={`w-full h-full object-cover rounded-lg ${!isActive && !isSelected ? 'opacity-80' : ''}`}
          />
        ) : (
          <div className="w-full h-full rounded-lg bg-gradient-to-br from-primary/20 to-transparent flex items-center justify-center">
            <span className="material-icons text-primary/40">image</span>
          </div>
        )}
        
        {/* Head indicator */}
        {isHead && (
          <div 
            className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center"
            style={{ backgroundColor: branch.color }}
          >
            <span className="material-icons text-white text-[10px]">star</span>
          </div>
        )}
      </div>
      
      {/* Metadata */}
      <div className="mt-4 text-center">
        <span 
          className={`text-[10px] font-bold ${isActive ? 'text-primary' : 'text-primary/60'}`}
        >
          {formatSnapshotId(snapshot.id)}
        </span>
        <p className={`text-xs ${isActive ? 'font-bold' : 'font-semibold'}`}>
          {snapshot.name}
        </p>
        <p className="text-[9px] opacity-40 uppercase tracking-widest mt-1">
          {formatRelativeTime(snapshot.createdAt)}
        </p>
      </div>
      
      {/* Action buttons on hover */}
      <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
        <button
          onClick={(e) => { e.stopPropagation(); onRestore(); }}
          className="p-1 bg-primary rounded text-white text-[10px] hover:bg-primary/80"
          title="Restore this version"
        >
          <span className="material-icons text-xs">restore</span>
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onSelect(); }}
          className="p-1 bg-slate-panel border border-primary/30 rounded text-primary text-[10px] hover:bg-primary/20"
          title="Preview"
        >
          <span className="material-icons text-xs">visibility</span>
        </button>
      </div>
    </div>
  );
};
