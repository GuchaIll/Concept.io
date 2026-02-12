import type { SelectionAction } from '../../hooks/Selection';

interface SelectionSmartTagProps {
  hasObjectsSelected: boolean;
  activeAction: SelectionAction;
  onActionChange: (action: SelectionAction) => void;
  position: { x: number; y: number };
  onApply: () => void;
  onCancel: () => void;
}

// Actions when objects are selected
const objectActions: { id: SelectionAction; icon: string; label: string }[] = [
  { id: 'transform', icon: 'open_with', label: 'Transform' },
  { id: 'liquify', icon: 'waves', label: 'Liquify' },
  { id: 'effects', icon: 'auto_awesome', label: 'Effects' },
];

// Actions when no objects are selected (empty region)
const regionActions: { id: SelectionAction; icon: string; label: string }[] = [
  { id: 'generate', icon: 'auto_fix_high', label: 'Generate' },
  { id: 'append', icon: 'add_photo_alternate', label: 'Add Asset' },
];

export const SelectionSmartTag = ({
  hasObjectsSelected,
  activeAction,
  onActionChange,
  position,
  onApply,
  onCancel,
}: SelectionSmartTagProps) => {
  const actions = hasObjectsSelected ? objectActions : regionActions;

  return (
    <div 
      className="absolute z-50 flex flex-col items-center gap-2"
      style={{ 
        left: position.x,
        top: position.y,
        transform: 'translate(-50%, 8px)'
      }}
    >
      {/* Action Selector */}
      <div 
        className="flex items-center gap-1 p-1 rounded-xl shadow-2xl"
        style={{ 
          background: 'rgba(10, 12, 16, 0.95)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.1)'
        }}
      >
        {actions.map((action) => (
          <button
            key={action.id}
            onClick={() => onActionChange(action.id)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all ${
              activeAction === action.id
                ? 'bg-primary text-white'
                : 'text-white/60 hover:text-white hover:bg-white/10'
            }`}
            title={action.label}
          >
            <span className="material-icons-round text-lg">{action.icon}</span>
            <span className="text-xs font-medium">{action.label}</span>
          </button>
        ))}
        
        {/* Divider */}
        <div className="w-px h-6 bg-white/10 mx-1" />
        
        {/* Apply Button */}
        <button
          onClick={onApply}
          className="flex items-center gap-1 px-3 py-2 rounded-lg bg-primary/20 text-primary hover:bg-primary hover:text-white transition-all"
          title="Apply"
        >
          <span className="material-icons-round text-lg">check</span>
        </button>
        
        {/* Cancel Button */}
        <button
          onClick={onCancel}
          className="flex items-center gap-1 px-2 py-2 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-all"
          title="Cancel (Esc)"
        >
          <span className="material-icons-round text-lg">close</span>
        </button>
      </div>
      
      {/* Hint Text */}
      <div className="text-[10px] text-white/40 bg-black/40 px-2 py-1 rounded">
        {hasObjectsSelected 
          ? 'Objects selected • Choose action' 
          : 'Empty region • Generate or add asset'}
      </div>
    </div>
  );
};
