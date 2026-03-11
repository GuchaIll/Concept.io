import { useState, useCallback, useMemo, useEffect } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  MarkerType,
  Handle,
  Position,
} from '@xyflow/react';
import type { Node, Edge, Connection, NodeProps } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { ISnapshot, IBranch } from '../../types/version.interface';

// Helper function for relative time
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

// Custom Snapshot Node
const SnapshotNode = ({ data, selected }: NodeProps) => {
  const { snapshot, branch, isActive, isHead, onClick, onRestore } = data;
  
  return (
    <div className="relative group">
      <Handle type="target" position={Position.Left} className="!bg-primary !w-2 !h-2" />
      
      {/* Badge */}
      {snapshot.description && (
        <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-[#1a2130] border border-primary/30 px-2 py-0.5 rounded text-[8px] font-bold text-primary flex items-center gap-1 whitespace-nowrap z-10">
          <span className="material-icons text-[10px]">inventory_2</span>
          {snapshot.description.slice(0, 12)}...
        </div>
      )}
      
      {/* Card */}
      <div 
        onClick={() => onClick?.(snapshot.id)}
        className={`w-20 h-20 rounded-xl border-2 p-0.5 bg-[#101622] shadow-xl cursor-pointer transition-all duration-200 ${
          isActive 
            ? 'border-[#2b6cee] scale-110 ring-4 ring-[#2b6cee]/20 shadow-[#2b6cee]/30' 
            : selected 
              ? 'border-[#2b6cee]/60 scale-105'
              : 'border-[#2b6cee]/30 hover:scale-105 hover:border-[#2b6cee]/50'
        }`}
      >
        {snapshot.thumbnail ? (
          <img src={snapshot.thumbnail} alt={snapshot.name} className={`w-full h-full object-cover rounded-lg ${!isActive ? 'opacity-60' : ''}`} />
        ) : (
          <div className={`w-full h-full rounded-lg flex items-center justify-center ${!isActive ? 'opacity-60' : ''}`}
            style={{ background: `linear-gradient(135deg, ${branch?.color || '#2b6cee'}40 0%, transparent 100%)` }}>
            <span className="material-icons text-white/30 text-xl">image</span>
          </div>
        )}
        
        {isHead && (
          <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center z-10"
            style={{ backgroundColor: branch?.color || '#2b6cee' }}>
            <span className="material-icons text-white text-[8px]">star</span>
          </div>
        )}
      </div>
      
      {/* Metadata */}
      <div className="mt-2 text-center w-20">
        <span className={`text-[9px] font-bold block ${isActive ? 'text-[#2b6cee]' : 'text-[#2b6cee]/60'}`}>
          #{snapshot.id.slice(0, 5)}
        </span>
        <p className={`text-[10px] truncate ${isActive ? 'font-bold text-white' : 'text-white/70'}`}>{snapshot.name}</p>
        <p className="text-[8px] text-white/40 uppercase">{formatRelativeTime(snapshot.createdAt)}</p>
      </div>
      
      {/* Hover Actions */}
      <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 z-20">
        <button onClick={(e) => { e.stopPropagation(); onRestore?.(snapshot.id); }}
          className="p-1 bg-[#2b6cee] rounded text-white hover:bg-[#2b6cee]/80" title="Restore">
          <span className="material-icons text-[10px]">restore</span>
        </button>
      </div>
      
      <Handle type="source" position={Position.Right} className="!bg-primary !w-2 !h-2" />
      <Handle type="source" position={Position.Bottom} id="branch" className="!bg-[#8b5cf6] !w-2 !h-2" />
    </div>
  );
};

// Ghost Node for new commits
const GhostNode = ({ data }: NodeProps) => (
  <div className="group">
    <Handle type="target" position={Position.Left} className="!bg-primary/40 !w-2 !h-2" />
    <div onClick={data.onClick}
      className="w-20 h-20 rounded-xl border-2 border-dashed border-[#2b6cee]/40 flex items-center justify-center bg-[#2b6cee]/5 hover:bg-[#2b6cee]/10 hover:border-[#2b6cee]/60 cursor-pointer transition-all">
      <span className="material-icons text-[#2b6cee]/40 text-2xl group-hover:text-[#2b6cee]/60">add_circle_outline</span>
    </div>
    <p className="text-[10px] text-white/40 italic mt-2 text-center w-20">New Commit</p>
  </div>
);

// Branch Node (smaller)
const BranchNode = ({ data }: NodeProps) => {
  const { snapshot, branch, onClick } = data;
  return (
    <div className="flex items-center gap-2 group">
      <Handle type="target" position={Position.Top} className="!w-2 !h-2" style={{ background: branch?.color }} />
      <div onClick={() => onClick?.(snapshot.id)}
        className="w-14 h-14 rounded-lg border-2 p-0.5 bg-[#101622] shadow-lg cursor-pointer hover:scale-105 transition-transform"
        style={{ borderColor: `${branch?.color}60` }}>
        {snapshot.thumbnail ? (
          <img src={snapshot.thumbnail} alt={snapshot.name} className="w-full h-full object-cover rounded-md" />
        ) : (
          <div className="w-full h-full rounded-md" style={{ background: `linear-gradient(135deg, ${branch?.color}40 0%, transparent 100%)` }} />
        )}
      </div>
      <div className="max-w-[100px]">
        <span className="text-[9px] font-bold uppercase block" style={{ color: branch?.color }}>{branch?.name}</span>
        <p className="text-[10px] text-white/80 truncate">{snapshot.name}</p>
        <p className="text-[8px] text-white/40">{snapshot.layers.length} layers</p>
      </div>
      <Handle type="source" position={Position.Right} className="!w-2 !h-2" style={{ background: branch?.color }} />
    </div>
  );
};

const nodeTypes = { snapshot: SnapshotNode, ghost: GhostNode, branch: BranchNode };

interface TimelineFlowProps {
  branches: IBranch[];
  snapshots: ISnapshot[];
  currentBranchId: string;
  currentSnapshotId: string | null;
  selectedSnapshotId: string | null;
  isLoading: boolean;
  projectName?: string;
  onCreateSnapshot: (name: string, description?: string) => void;
  onRestoreSnapshot: (snapshotId: string) => void;
  onSelectSnapshot: (snapshotId: string | null) => void;
  onCreateBranch: (name: string, color?: string) => void;
  onSwitchBranch: (branchId: string) => void;
  onDeleteBranch: (branchId: string) => void;
  onMergeBranch: (sourceBranchId: string, targetBranchId: string) => void;
  onClose: () => void;
}

export const TimelineFlow = ({
  branches, snapshots, currentBranchId, currentSnapshotId, selectedSnapshotId,
  isLoading, projectName = 'Untitled Project',
  onCreateSnapshot, onRestoreSnapshot, onSelectSnapshot, onCreateBranch,
  onSwitchBranch, onDeleteBranch, onMergeBranch, onClose,
}: TimelineFlowProps) => {
  const [showCommitModal, setShowCommitModal] = useState(false);
  const [commitName, setCommitName] = useState('');
  const [commitDescription, setCommitDescription] = useState('');
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [mergeSourceId, setMergeSourceId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  const currentBranch = branches.find(b => b.id === currentBranchId);
  const selectedSnapshot = snapshots.find(s => s.id === selectedSnapshotId);

  // Build nodes and edges
  const { initialNodes, initialEdges } = useMemo(() => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    
    const mainBranch = branches.find(b => b.name === 'main');
    const mainSnapshots = snapshots.filter(s => s.branchId === mainBranch?.id).sort((a, b) => a.createdAt - b.createdAt);
    
    // Main branch nodes
    mainSnapshots.forEach((snapshot, index) => {
      nodes.push({
        id: snapshot.id,
        type: 'snapshot',
        position: { x: 150 + index * 150, y: 150 },
        data: {
          snapshot, branch: mainBranch,
          isActive: snapshot.id === currentSnapshotId,
          isHead: snapshot.id === mainBranch?.headSnapshotId,
          onClick: onSelectSnapshot, onRestore: onRestoreSnapshot,
        },
      });
      
      if (index > 0) {
        edges.push({
          id: `e-${mainSnapshots[index - 1].id}-${snapshot.id}`,
          source: mainSnapshots[index - 1].id,
          target: snapshot.id,
          type: 'smoothstep',
          style: { stroke: '#2b6cee', strokeWidth: 3 },
          markerEnd: { type: MarkerType.ArrowClosed, color: '#2b6cee', width: 15, height: 15 },
        });
      }
    });
    
    // Ghost node
    const ghostX = mainSnapshots.length > 0 ? 150 + mainSnapshots.length * 150 : 150;
    nodes.push({
      id: 'ghost',
      type: 'ghost',
      position: { x: ghostX, y: 150 },
      data: { onClick: () => setShowCommitModal(true) },
      draggable: false,
    });
    
    if (mainSnapshots.length > 0) {
      edges.push({
        id: `e-${mainSnapshots[mainSnapshots.length - 1].id}-ghost`,
        source: mainSnapshots[mainSnapshots.length - 1].id,
        target: 'ghost',
        type: 'smoothstep',
        style: { stroke: '#2b6cee40', strokeWidth: 2, strokeDasharray: '5,5' },
      });
    }
    
    // Other branches
    const otherBranches = branches.filter(b => b.name !== 'main');
    otherBranches.forEach((branch, bi) => {
      const branchSnapshots = snapshots.filter(s => s.branchId === branch.id).sort((a, b) => a.createdAt - b.createdAt);
      
      branchSnapshots.forEach((snapshot, si) => {
        const parentSnapshot = mainSnapshots.find(s => s.id === snapshot.parentSnapshotId);
        const parentIndex = parentSnapshot ? mainSnapshots.indexOf(parentSnapshot) : 1;
        
        nodes.push({
          id: snapshot.id,
          type: 'branch',
          position: { x: 150 + (parentIndex + si) * 150, y: 320 + bi * 80 },
          data: { snapshot, branch, onClick: onSelectSnapshot },
        });
        
        if (si === 0 && parentSnapshot) {
          edges.push({
            id: `e-${parentSnapshot.id}-${snapshot.id}`,
            source: parentSnapshot.id,
            sourceHandle: 'branch',
            target: snapshot.id,
            type: 'smoothstep',
            style: { stroke: branch.color || '#8b5cf6', strokeWidth: 2 },
            markerEnd: { type: MarkerType.ArrowClosed, color: branch.color || '#8b5cf6', width: 12, height: 12 },
          });
        } else if (si > 0) {
          edges.push({
            id: `e-${branchSnapshots[si - 1].id}-${snapshot.id}`,
            source: branchSnapshots[si - 1].id,
            target: snapshot.id,
            type: 'smoothstep',
            style: { stroke: branch.color || '#8b5cf6', strokeWidth: 2 },
            markerEnd: { type: MarkerType.ArrowClosed, color: branch.color || '#8b5cf6', width: 12, height: 12 },
          });
        }
      });
    });
    
    return { initialNodes: nodes, initialEdges: edges };
  }, [branches, snapshots, currentSnapshotId, onSelectSnapshot, onRestoreSnapshot]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Update nodes when data changes
  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  const onConnect = useCallback((params: Connection) => setEdges((eds) => addEdge({ ...params, type: 'smoothstep' }, eds)), [setEdges]);
  
  const onPaneContextMenu = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY });
  }, []);

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

  return (
    <div className="fixed inset-0 z-40 bg-[#101622] text-white font-display overflow-hidden">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-[#101622]/90 backdrop-blur-md border-b border-[#2b6cee]/10 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="p-2 hover:bg-[#2b6cee]/10 rounded-full transition-colors">
            <span className="material-icons text-xl">arrow_back_ios_new</span>
          </button>
          <div>
            <h1 className="text-xs font-semibold uppercase opacity-50">Version Timeline</h1>
            <p className="text-base font-bold">{projectName}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isLoading && (
            <div className="px-3 py-1 bg-amber-500/20 text-amber-400 text-[10px] font-bold rounded-full border border-amber-500/30 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse"></span>SYNCING
            </div>
          )}
          <div className="px-3 py-1 bg-[#2b6cee]/20 text-[#2b6cee] text-[10px] font-bold rounded-full border border-[#2b6cee]/30 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 bg-[#2b6cee] rounded-full animate-pulse"></span>LIVE
          </div>
        </div>
      </header>

      {/* Branch Tabs */}
      <div className="fixed top-[60px] left-0 right-0 z-40 flex items-center gap-2 px-6 py-2 bg-[#101622]/80 border-b border-white/5 overflow-x-auto no-scrollbar">
        {branches.map((branch) => (
          <button key={branch.id} onClick={() => onSwitchBranch(branch.id)}
            className={`flex-shrink-0 px-3 py-1 rounded-full text-[11px] font-semibold transition-all ${
              branch.id === currentBranchId ? 'bg-[#2b6cee] text-white shadow-lg' : 'bg-[#1a2130] border'
            }`}
            style={{ borderColor: branch.id === currentBranchId ? undefined : `${branch.color}30`, color: branch.id === currentBranchId ? 'white' : branch.color }}>
            {branch.name === 'main' ? 'Main Branch' : branch.name}
          </button>
        ))}
        <button onClick={() => onCreateBranch('New Branch')} className="flex-shrink-0 p-1 rounded-full bg-[#2b6cee]/10 text-[#2b6cee] border border-[#2b6cee]/20">
          <span className="material-icons text-sm">add</span>
        </button>
      </div>

      {/* React Flow */}
      <div className="pt-[100px] pb-[200px] h-full" onClick={() => setContextMenu(null)}>
        <ReactFlow
          nodes={nodes} edges={edges}
          onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect}
          onPaneContextMenu={onPaneContextMenu}
          nodeTypes={nodeTypes}
          fitView fitViewOptions={{ padding: 0.4 }}
          minZoom={0.4} maxZoom={1.5}
          proOptions={{ hideAttribution: true }}
          style={{ background: '#0a0c14' }}
        >
          <Background color="#2b6cee15" gap={25} />
          <Controls className="!bg-[#1a2130] !border-[#2b6cee]/20 !rounded-lg !shadow-xl" showInteractive={false} />
        </ReactFlow>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div className="fixed z-50 bg-[#1a2130] border border-white/10 rounded-lg shadow-2xl py-1 min-w-[160px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}>
          <button className="w-full px-3 py-2 text-left text-xs hover:bg-[#2b6cee]/20 flex items-center gap-2"
            onClick={() => { setShowCommitModal(true); setContextMenu(null); }}>
            <span className="material-icons text-sm text-[#2b6cee]">add_circle</span>New Snapshot
          </button>
          <button className="w-full px-3 py-2 text-left text-xs hover:bg-[#2b6cee]/20 flex items-center gap-2"
            onClick={() => { onCreateBranch('New Branch'); setContextMenu(null); }}>
            <span className="material-icons text-sm text-[#8b5cf6]">call_split</span>Create Branch
          </button>
        </div>
      )}

      {/* Layer Panel */}
      {selectedSnapshot && (
        <div className="fixed bottom-[90px] left-4 right-4 z-30 p-3 bg-[#1a2130]/95 backdrop-blur rounded-xl border border-[#2b6cee]/20 shadow-2xl max-h-[180px] overflow-y-auto">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="material-icons text-[#2b6cee] text-sm">layers</span>
              <h3 className="text-[10px] font-bold uppercase tracking-wider">Layers: #{selectedSnapshot.id.slice(0, 5)}</h3>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[9px] text-white/40">{selectedSnapshot.layers.length} Preserved</span>
              <button onClick={() => onSelectSnapshot(null)} className="p-0.5 hover:bg-white/10 rounded">
                <span className="material-icons text-xs text-white/40">close</span>
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5">
            {selectedSnapshot.layers.map((layer, i) => (
              <div key={layer.layerId} className={`flex items-center gap-2 p-1.5 rounded border ${
                i === selectedSnapshot.layers.length - 1 ? 'bg-[#2b6cee]/10 border-[#2b6cee]/30' : 'bg-[#101622]/50 border-white/5'
              }`}>
                <div className={`w-5 h-5 rounded border border-white/10 ${
                  i % 3 === 0 ? 'bg-[#2b6cee]/40' : i % 3 === 1 ? 'bg-[#10b981]/40' : 'bg-white/10'
                }`}></div>
                <div className="flex-1 min-w-0">
                  <p className={`text-[9px] font-bold truncate ${i === selectedSnapshot.layers.length - 1 ? 'text-[#2b6cee]' : ''}`}>{layer.name}</p>
                  <p className="text-[7px] text-white/40 uppercase">{layer.blendMode} ({Math.round(layer.opacity * 100)}%)</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bottom Actions */}
      <div className="fixed bottom-0 left-0 right-0 bg-[#101622]/95 backdrop-blur border-t border-[#2b6cee]/10 p-4 flex items-center gap-3 z-40">
        {/* Back to Canvas Button */}
        <button onClick={onClose}
          className="w-12 h-12 flex items-center justify-center bg-[#1a2130] border border-white/20 rounded-xl text-white hover:bg-white/10">
          <span className="material-icons">arrow_back</span>
        </button>
        
        {/* Restore Button - only enabled when snapshot is selected */}
        <button 
          onClick={() => selectedSnapshotId && onRestoreSnapshot(selectedSnapshotId)} 
          disabled={!selectedSnapshotId}
          className="flex-1 flex items-center justify-center gap-2 bg-[#10b981] py-3 rounded-xl font-bold text-sm shadow-xl shadow-[#10b981]/25 hover:bg-[#10b981]/90 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
          <span className="material-icons">restore</span>
          {selectedSnapshotId ? 'RESTORE SNAPSHOT' : 'SELECT A SNAPSHOT'}
        </button>
        
        {/* Merge Button */}
        <button onClick={() => setShowMergeModal(true)} disabled={branches.length < 2}
          className="w-12 h-12 flex items-center justify-center bg-[#1a2130] border border-[#2b6cee]/20 rounded-xl text-[#2b6cee] hover:bg-[#2b6cee]/10 disabled:opacity-50">
          <span className="material-icons">merge_type</span>
        </button>
        
        {/* Save Snapshot Button */}
        <button onClick={() => setShowCommitModal(true)} className="w-12 h-12 flex items-center justify-center bg-[#1a2130] border border-[#2b6cee]/20 rounded-xl text-[#2b6cee] hover:bg-[#2b6cee]/10">
          <span className="material-icons">save</span>
        </button>
      </div>

      {/* Commit Modal */}
      {showCommitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-80 p-5 rounded-2xl bg-[#1a2130] border border-white/10 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold">Create Snapshot</h2>
              <button onClick={() => setShowCommitModal(false)} className="p-1 rounded hover:bg-white/10">
                <span className="material-icons text-white/50 text-lg">close</span>
              </button>
            </div>
            <div className="mb-3">
              <label className="block text-[9px] font-bold text-white/50 uppercase mb-1">Version Name</label>
              <input type="text" value={commitName} onChange={(e) => setCommitName(e.target.value)}
                placeholder="e.g., Lighting Pass v2"
                className="w-full px-3 py-2 bg-[#101622] border border-white/10 rounded-lg text-sm focus:outline-none focus:border-[#2b6cee]" autoFocus />
            </div>
            <div className="mb-4">
              <label className="block text-[9px] font-bold text-white/50 uppercase mb-1">Description</label>
              <textarea value={commitDescription} onChange={(e) => setCommitDescription(e.target.value)}
                placeholder="What changed?" rows={2}
                className="w-full px-3 py-2 bg-[#101622] border border-white/10 rounded-lg text-sm focus:outline-none focus:border-[#2b6cee] resize-none" />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowCommitModal(false)} className="flex-1 py-2 rounded-lg bg-white/5 border border-white/10 text-sm hover:bg-white/10">Cancel</button>
              <button onClick={handleCommit} disabled={!commitName.trim()}
                className="flex-1 py-2 rounded-lg bg-[#2b6cee] text-white text-sm font-bold hover:bg-[#2b6cee]/90 disabled:opacity-50 flex items-center justify-center gap-1">
                <span className="material-icons text-sm">save</span>Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Merge Modal */}
      {showMergeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-80 p-5 rounded-2xl bg-[#1a2130] border border-white/10 shadow-2xl">
            <h2 className="text-base font-bold mb-3">Merge Branch</h2>
            <p className="text-xs text-white/60 mb-3">
              Merge into <span className="text-[#2b6cee] font-semibold">{currentBranch?.name}</span>
            </p>
            <div className="space-y-1.5 mb-4">
              {branches.filter(b => b.id !== currentBranchId).map((branch) => (
                <button key={branch.id} onClick={() => setMergeSourceId(branch.id)}
                  className={`w-full p-2 rounded-lg border text-left transition-all ${
                    mergeSourceId === branch.id ? 'border-[#2b6cee] bg-[#2b6cee]/10' : 'border-white/10 hover:border-white/20'
                  }`}>
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: branch.color }}></div>
                    <span className="text-sm">{branch.name}</span>
                  </div>
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setShowMergeModal(false); setMergeSourceId(null); }}
                className="flex-1 py-2 rounded-lg bg-white/5 border border-white/10 text-sm hover:bg-white/10">Cancel</button>
              <button onClick={handleMerge} disabled={!mergeSourceId}
                className="flex-1 py-2 rounded-lg bg-[#2b6cee] text-white text-sm font-bold hover:bg-[#2b6cee]/90 disabled:opacity-50 flex items-center justify-center gap-1">
                <span className="material-icons text-sm">merge_type</span>Merge
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TimelineFlow;
