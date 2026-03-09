import { useState } from 'react';
import type { ISnapshot, IBranch, BranchTree } from '../../types/version.interface';
import { DiffViewer } from './DiffViewer';

interface TimelineProps {
  branches: IBranch[];
  snapshots: ISnapshot[];
  currentBranchId: string;
  currentSnapshotId: string | null;
  selectedSnapshotId: string | null;
  isLoading: boolean;
  projectName?: string;
  // Actions
  onCreateSnapshot: (name: string, description?: string) => void;
  onRestoreSnapshot: (snapshotId: string) => void;
  onSelectSnapshot: (snapshotId: string | null) => void;
  onCreateBranch: (name: string, color?: string) => void;
  onSwitchBranch: (branchId: string) => void;
  onDeleteBranch: (branchId: string) => void;
  onMergeBranch: (sourceBranchId: string, targetBranchId: string) => void;
  onClose: () => void;
}

export const Timeline = ({
  branches,
  snapshots,
  currentBranchId,
  currentSnapshotId,
  selectedSnapshotId,
  isLoading,
  projectName = 'Untitled Project',
  onCreateSnapshot,
  onRestoreSnapshot: _onRestoreSnapshot,
  onSelectSnapshot,
  onCreateBranch,
  onSwitchBranch,
  onDeleteBranch: _onDeleteBranch,
  onMergeBranch,
  onClose,
}: TimelineProps) => {
  const [showCommitModal, setShowCommitModal] = useState(false);
  const [commitName, setCommitName] = useState('');
  const [commitDescription, setCommitDescription] = useState('');
  const [showDiffViewer, setShowDiffViewer] = useState(false);
  const [diffSnapshots, setDiffSnapshots] = useState<{ a: ISnapshot; b: ISnapshot } | null>(null);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [mergeSourceId, setMergeSourceId] = useState<string | null>(null);

  // Get current branch
  const currentBranch = branches.find(b => b.id === currentBranchId);

  // Get branch-organized data
  const getBranchTrees = (): BranchTree[] => {
    return branches.map(branch => {
      const branchSnapshots = snapshots
        .filter(s => s.branchId === branch.id)
        .sort((a, b) => a.createdAt - b.createdAt);
      const headSnapshot = branchSnapshots.find(s => s.id === branch.headSnapshotId) || null;
      return { branch, snapshots: branchSnapshots, headSnapshot };
    });
  };

  const branchTrees = getBranchTrees();
  const mainBranchTree = branchTrees.find(bt => bt.branch.name === 'main');
  const otherBranchTrees = branchTrees.filter(bt => bt.branch.name !== 'main');

  // Get selected snapshot for preview
  const selectedSnapshot = snapshots.find(s => s.id === selectedSnapshotId);

  const handleCommit = () => {
    if (commitName.trim()) {
      onCreateSnapshot(commitName.trim(), commitDescription.trim() || undefined);
      setCommitName('');
      setCommitDescription('');
      setShowCommitModal(false);
    }
  };

  const handleMerge = () => {
    if (mergeSourceId && currentBranchId) {
      onMergeBranch(mergeSourceId, currentBranchId);
      setShowMergeModal(false);
      setMergeSourceId(null);
    }
  };

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

  return (
    <div className="fixed inset-0 z-40 bg-background-dark text-slate-100 font-display antialiased overflow-hidden">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-background-dark/80 backdrop-blur-md border-b border-primary/10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button 
            onClick={onClose}
            className="p-2 hover:bg-primary/10 rounded-full transition-colors"
          >
            <span className="material-icons text-xl">arrow_back_ios_new</span>
          </button>
          <div>
            <h1 className="text-sm font-semibold tracking-tight uppercase opacity-60">Project: Project-X</h1>
            <p className="text-lg font-bold leading-none">{projectName}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isLoading && (
            <div className="px-3 py-1 bg-amber-500/20 text-amber-400 text-[10px] font-bold rounded-full border border-amber-500/30 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse"></span>
              SYNCING
            </div>
          )}
          <div className="px-3 py-1 bg-primary/20 text-primary text-[10px] font-bold rounded-full border border-primary/30 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse"></span>
            LIVE
          </div>
          <button className="p-2 hover:bg-primary/10 rounded-full transition-colors">
            <span className="material-icons">more_vert</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="h-screen flex flex-col pt-20 pb-24 overflow-hidden">
        {/* Branch Tabs */}
        <div className="flex items-center gap-3 px-6 py-4 overflow-x-auto no-scrollbar">
          {branches.map((branch) => {
            const isActive = branch.id === currentBranchId;
            const isMain = branch.name === 'main';
            
            return (
              <button
                key={branch.id}
                onClick={() => onSwitchBranch(branch.id)}
                className={`flex-shrink-0 px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${
                  isActive
                    ? 'bg-primary text-white shadow-lg shadow-primary/20'
                    : 'bg-slate-panel border text-white/80'
                }`}
                style={{
                  borderColor: isActive ? undefined : `${branch.color}30`,
                  color: isActive ? 'white' : branch.color,
                }}
              >
                {isMain ? 'Main Branch' : branch.name}
              </button>
            );
          })}
          <button
            onClick={() => onCreateBranch('New Branch')}
            className="flex-shrink-0 p-1.5 rounded-full bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors"
          >
            <span className="material-icons text-sm">add</span>
          </button>
        </div>

        {/* Interactive Tree Viewport */}
        <div className="flex-1 relative overflow-x-auto custom-scrollbar overflow-y-hidden">
          <div className="min-w-max h-full flex items-center px-12 relative">
            {/* Connection Line - Main */}
            <div className="absolute h-1 top-[45%] left-12 right-12 bg-primary/20 rounded-full"></div>

            {/* Main Branch Snapshots */}
            {mainBranchTree?.snapshots.map((snapshot, index) => {
              const isActive = snapshot.id === currentSnapshotId;
              
              return (
                <div key={snapshot.id} className="relative flex flex-col items-center group">
                  {/* Badge for description */}
                  {snapshot.description && (
                    <div className="absolute -top-8 bg-slate-panel border border-primary/30 px-2 py-0.5 rounded text-[8px] font-bold text-primary flex items-center gap-1 whitespace-nowrap">
                      <span className="material-icons text-[10px]">inventory_2</span>
                      {snapshot.description.slice(0, 20)}
                    </div>
                  )}
                  
                  {/* Snapshot Card */}
                  <div 
                    onClick={() => onSelectSnapshot(snapshot.id)}
                    className={`w-24 h-24 rounded-xl border-2 p-1 bg-background-dark shadow-xl cursor-pointer transition-transform ${
                      isActive 
                        ? 'border-primary scale-110 ring-4 ring-primary/10 shadow-2xl shadow-primary/20' 
                        : 'border-primary/40 hover:scale-105'
                    }`}
                  >
                    {snapshot.thumbnail ? (
                      <img 
                        src={snapshot.thumbnail} 
                        alt={snapshot.name}
                        className={`w-full h-full object-cover rounded-lg ${!isActive ? 'grayscale opacity-50' : ''}`}
                      />
                    ) : (
                      <div className={`w-full h-full rounded-lg bg-gradient-to-br from-primary/40 to-transparent ${!isActive ? 'grayscale opacity-50' : ''}`} />
                    )}
                  </div>
                  
                  {/* Metadata */}
                  <div className="mt-4 text-center">
                    <span className={`text-[10px] font-bold ${isActive ? 'text-primary' : 'text-primary/60'}`}>
                      #{snapshot.id.slice(0, 6).toUpperCase()}
                    </span>
                    <p className={`text-xs ${isActive ? 'font-bold' : 'font-semibold'}`}>{snapshot.name}</p>
                    <p className="text-[9px] opacity-40 uppercase tracking-widest mt-1">
                      {formatRelativeTime(snapshot.createdAt)}
                    </p>
                  </div>

                  {/* Branch-off indicator */}
                  {otherBranchTrees.some(bt => bt.snapshots[0]?.parentSnapshotId === snapshot.id) && (
                    <div className="absolute left-1/2 bottom-0 h-32 w-px bg-gradient-to-b from-primary to-branch-alt translate-y-12"></div>
                  )}

                  {/* Spacer */}
                  {index < mainBranchTree.snapshots.length - 1 && <div className="w-24 h-px"></div>}
                </div>
              );
            })}

            {/* Spacer before ghost node */}
            <div className="w-32 h-px"></div>

            {/* Ghost Node (Future/Draft) */}
            <div className="relative flex flex-col items-center opacity-40">
              <button
                onClick={() => setShowCommitModal(true)}
                className="w-24 h-24 rounded-xl border-2 border-dashed border-primary/40 flex items-center justify-center bg-primary/5 hover:bg-primary/10 hover:border-primary/60 transition-all cursor-pointer"
              >
                <span className="material-icons text-primary/40">add_circle_outline</span>
              </button>
              <div className="mt-4 text-center">
                <p className="text-xs italic">Awaiting Commit</p>
              </div>
            </div>

            {/* Secondary Branch Nodes (Below main line) */}
            {otherBranchTrees.map((bt) => (
              <div 
                key={bt.branch.id}
                className="absolute flex items-center gap-6"
                style={{
                  left: '240px',
                  top: '75%',
                }}
              >
                {bt.snapshots.slice(0, 1).map((snapshot) => (
                  <div key={snapshot.id} className="flex items-center gap-4">
                    <div 
                      className="w-16 h-16 rounded-xl border-2 p-1 bg-background-dark shadow-xl cursor-pointer hover:scale-105 transition-transform"
                      style={{ borderColor: `${bt.branch.color}50` }}
                      onClick={() => onSelectSnapshot(snapshot.id)}
                    >
                      {snapshot.thumbnail ? (
                        <img 
                          src={snapshot.thumbnail} 
                          alt={snapshot.name}
                          className="w-full h-full object-cover rounded-lg"
                        />
                      ) : (
                        <div className="w-full h-full rounded-lg bg-gradient-to-br from-branch-alt/40 to-transparent" />
                      )}
                    </div>
                    <div>
                      <span 
                        className="text-[10px] font-bold uppercase tracking-tighter"
                        style={{ color: bt.branch.color }}
                      >
                        Experimental Branch
                      </span>
                      <p className="text-xs font-semibold text-white/90">{snapshot.name}</p>
                      <p className="text-[9px] text-white/40">{snapshot.layers.length} layers modified</p>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Layer Stack Panel (Preview Mode) */}
        {selectedSnapshot && (
          <div className="mx-6 mb-4 p-4 bg-slate-panel rounded-xl border border-primary/20 shadow-2xl">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="material-icons text-primary text-sm">layers</span>
                <h3 className="text-xs font-bold uppercase tracking-widest">
                  State Layers: #{selectedSnapshot.id.slice(0, 6).toUpperCase()}
                </h3>
              </div>
              <span className="text-[10px] text-white/40">
                {selectedSnapshot.layers.length} Layers Preserved
              </span>
            </div>
            <div className="space-y-2">
              {selectedSnapshot.layers.map((layer, index) => (
                <div 
                  key={layer.layerId}
                  className={`flex items-center justify-between p-2 rounded-lg border ${
                    index === selectedSnapshot.layers.length - 1 
                      ? 'bg-primary/10 border-primary/30' 
                      : 'bg-background-dark/50 border-white/5'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded border border-white/10 ${
                      index === 0 ? 'bg-gradient-to-br from-primary/40 to-transparent' :
                      index === 1 ? 'bg-gradient-to-br from-branch-exp/40 to-transparent' :
                      'bg-white/5'
                    }`}></div>
                    <div>
                      <p className={`text-[10px] font-bold ${index === selectedSnapshot.layers.length - 1 ? 'text-primary' : ''}`}>
                        {layer.name}
                      </p>
                      <p className={`text-[8px] uppercase ${index === selectedSnapshot.layers.length - 1 ? 'text-primary/60' : 'text-white/40'}`}>
                        Blending: {layer.blendMode} ({Math.round(layer.opacity * 100)}%)
                      </p>
                    </div>
                  </div>
                  <span className={`material-icons text-sm ${index === selectedSnapshot.layers.length - 1 ? 'text-primary' : 'opacity-40'}`}>
                    {index === selectedSnapshot.layers.length - 1 ? 'radio_button_checked' : layer.visible ? 'visibility' : 'lock'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Bottom Actions Area */}
      <div className="fixed bottom-0 left-0 right-0 bg-background-dark/95 backdrop-blur-xl border-t border-primary/10 p-5 flex items-center gap-4">
        <button 
          onClick={() => setShowMergeModal(true)}
          disabled={branches.length < 2}
          className="flex-1 flex items-center justify-center gap-2 bg-primary py-4 rounded-xl font-bold text-sm tracking-wide shadow-xl shadow-primary/25 hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95"
        >
          <span className="material-icons text-lg">merge_type</span>
          MERGE BRANCH
        </button>
        <button 
          onClick={() => setShowCommitModal(true)}
          className="w-14 h-14 flex items-center justify-center bg-slate-panel border border-primary/20 rounded-xl text-primary hover:bg-primary/10 transition-colors"
        >
          <span className="material-icons">history</span>
        </button>
        <button 
          onClick={onClose}
          className="w-14 h-14 flex items-center justify-center bg-slate-panel border border-primary/20 rounded-xl text-primary hover:bg-primary/10 transition-colors"
        >
          <span className="material-icons">share</span>
        </button>
      </div>

      {/* Nanobana Asset Floating Tracker */}
      <div className="fixed bottom-28 right-6">
        <div className="bg-background-dark/90 border border-primary/40 rounded-full px-4 py-2 flex items-center gap-2 shadow-2xl backdrop-blur-md">
          <div className="w-2 h-2 bg-branch-exp rounded-full"></div>
          <span className="text-[10px] font-bold text-white/80">NANOBANA v2.4 Active</span>
          <span className="material-icons text-[12px] text-primary">cloud_done</span>
        </div>
      </div>

      {/* Commit Modal */}
      {showCommitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-96 p-6 rounded-2xl shadow-2xl bg-slate-panel border border-white/10">
            <h2 className="text-lg font-bold mb-4">Create Snapshot</h2>
            
            <div className="mb-4">
              <label className="block text-[10px] font-bold text-white/50 uppercase tracking-widest mb-2">
                Version Name
              </label>
              <input
                type="text"
                value={commitName}
                onChange={(e) => setCommitName(e.target.value)}
                placeholder="e.g., Lighting Pass v2"
                className="w-full px-4 py-3 bg-background-dark border border-white/10 rounded-lg text-sm focus:outline-none focus:border-primary"
                autoFocus
              />
            </div>

            <div className="mb-6">
              <label className="block text-[10px] font-bold text-white/50 uppercase tracking-widest mb-2">
                Description (optional)
              </label>
              <textarea
                value={commitDescription}
                onChange={(e) => setCommitDescription(e.target.value)}
                placeholder="What changed in this version?"
                rows={3}
                className="w-full px-4 py-3 bg-background-dark border border-white/10 rounded-lg text-sm focus:outline-none focus:border-primary resize-none"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowCommitModal(false)}
                className="flex-1 py-3 rounded-lg bg-white/5 border border-white/10 text-sm font-medium hover:bg-white/10 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCommit}
                disabled={!commitName.trim()}
                className="flex-1 py-3 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                <span className="material-icons text-sm">save</span>
                Save Snapshot
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Merge Modal */}
      {showMergeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-96 p-6 rounded-2xl shadow-2xl bg-slate-panel border border-white/10">
            <h2 className="text-lg font-bold mb-4">Merge Branch</h2>
            <p className="text-sm text-white/60 mb-4">
              Select a branch to merge into <span className="text-primary font-semibold">{currentBranch?.name}</span>
            </p>
            
            <div className="space-y-2 mb-6">
              {branches
                .filter(b => b.id !== currentBranchId)
                .map((branch) => (
                  <button
                    key={branch.id}
                    onClick={() => setMergeSourceId(branch.id)}
                    className={`w-full p-3 rounded-lg border text-left transition-all ${
                      mergeSourceId === branch.id
                        ? 'border-primary bg-primary/10'
                        : 'border-white/10 hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div 
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: branch.color }}
                      />
                      <span className="font-medium">{branch.name}</span>
                    </div>
                  </button>
                ))}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => { setShowMergeModal(false); setMergeSourceId(null); }}
                className="flex-1 py-3 rounded-lg bg-white/5 border border-white/10 text-sm font-medium hover:bg-white/10 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleMerge}
                disabled={!mergeSourceId}
                className="flex-1 py-3 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                <span className="material-icons text-sm">merge_type</span>
                Merge
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Diff Viewer */}
      {showDiffViewer && diffSnapshots && (
        <DiffViewer
          snapshotA={diffSnapshots.a}
          snapshotB={diffSnapshots.b}
          onClose={() => { setShowDiffViewer(false); setDiffSnapshots(null); }}
        />
      )}
    </div>
  );
};
