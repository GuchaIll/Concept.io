import { useState } from 'react';
import type { IBranch } from '../../types/version.interface';

interface BranchSelectorProps {
  branches: IBranch[];
  currentBranchId: string;
  onBranchSelect: (branchId: string) => void;
  onBranchCreate: (name: string, color?: string) => void;
  onBranchDelete?: (branchId: string) => void;
}

const BRANCH_COLORS = [
  { name: 'Blue', value: '#2b6cee' },
  { name: 'Purple', value: '#8b5cf6' },
  { name: 'Emerald', value: '#10b981' },
  { name: 'Amber', value: '#f59e0b' },
  { name: 'Red', value: '#ef4444' },
  { name: 'Pink', value: '#ec4899' },
];

export const BranchSelector = ({
  branches,
  currentBranchId,
  onBranchSelect,
  onBranchCreate,
  onBranchDelete,
}: BranchSelectorProps) => {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [selectedColor, setSelectedColor] = useState(BRANCH_COLORS[1].value);

  const handleCreateBranch = () => {
    if (newBranchName.trim()) {
      onBranchCreate(newBranchName.trim(), selectedColor);
      setNewBranchName('');
      setShowCreateModal(false);
    }
  };

  return (
    <>
      {/* Branch Tabs */}
      <div className="flex items-center gap-3 px-6 py-4 overflow-x-auto no-scrollbar">
        {branches.map((branch) => {
          const isActive = branch.id === currentBranchId;
          const isMain = branch.name === 'main';
          
          return (
            <button
              key={branch.id}
              onClick={() => onBranchSelect(branch.id)}
              className={`
                flex-shrink-0 px-4 py-1.5 rounded-full text-xs font-semibold
                transition-all duration-200 flex items-center gap-2
                ${isActive
                  ? 'bg-primary text-white shadow-lg shadow-primary/20'
                  : 'bg-slate-panel border text-white/80 hover:bg-slate-panel/80'
                }
              `}
              style={{
                borderColor: isActive ? undefined : `${branch.color}30`,
                color: isActive ? 'white' : branch.color,
              }}
            >
              {isMain && (
                <span className="material-icons text-xs">home</span>
              )}
              {branch.name}
              {!isMain && !isActive && onBranchDelete && (
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    onBranchDelete(branch.id);
                  }}
                  className="material-icons text-xs opacity-50 hover:opacity-100 cursor-pointer"
                >
                  close
                </span>
              )}
            </button>
          );
        })}
        
        {/* Add Branch Button */}
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex-shrink-0 p-1.5 rounded-full bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors"
        >
          <span className="material-icons text-sm">add</span>
        </button>
      </div>

      {/* Create Branch Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div 
            className="w-96 p-6 rounded-2xl shadow-2xl"
            style={{ 
              background: 'rgba(26, 33, 48, 0.98)',
              border: '1px solid rgba(255,255,255,0.1)'
            }}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold">Create New Branch</h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-1 rounded-full hover:bg-white/10"
              >
                <span className="material-icons text-white/50">close</span>
              </button>
            </div>

            {/* Branch Name Input */}
            <div className="mb-4">
              <label className="block text-[10px] font-bold text-white/50 uppercase tracking-widest mb-2">
                Branch Name
              </label>
              <input
                type="text"
                value={newBranchName}
                onChange={(e) => setNewBranchName(e.target.value)}
                placeholder="e.g., dark-lighting, alt-composition"
                className="w-full px-4 py-3 bg-background-dark border border-white/10 rounded-lg text-sm focus:outline-none focus:border-primary"
                autoFocus
              />
            </div>

            {/* Color Selector */}
            <div className="mb-6">
              <label className="block text-[10px] font-bold text-white/50 uppercase tracking-widest mb-2">
                Branch Color
              </label>
              <div className="flex gap-2">
                {BRANCH_COLORS.map((color) => (
                  <button
                    key={color.value}
                    onClick={() => setSelectedColor(color.value)}
                    className={`w-8 h-8 rounded-full transition-transform ${
                      selectedColor === color.value ? 'ring-2 ring-white ring-offset-2 ring-offset-slate-panel scale-110' : ''
                    }`}
                    style={{ backgroundColor: color.value }}
                    title={color.name}
                  />
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={() => setShowCreateModal(false)}
                className="flex-1 py-3 rounded-lg bg-white/5 border border-white/10 text-sm font-medium hover:bg-white/10 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateBranch}
                disabled={!newBranchName.trim()}
                className="flex-1 py-3 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                <span className="material-icons text-sm">call_split</span>
                Create Branch
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
