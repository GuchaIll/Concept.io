export interface ISnapshot {
    id: string;
    projectId: string;
    branchId: string;
    name: string;
    description?: string;
    layers: ILayerSnapshot[];
    thumbnail: string;  // Base64 preview
    createdBy: string;
    createdAt: number;
    parentSnapshotId?: string;
}

export interface IBranch {
    id: string;
    projectId: string;
    name: string;
    headSnapshotId: string;
    createdBy: string;
    createdAt: number;
    color?: string;  // For UI differentiation
}

// Client-specific types for UI state
export interface VersionTimelineState {
    branches: IBranch[];
    snapshots: ISnapshot[];
    currentBranchId: string;
    currentSnapshotId: string | null;
    selectedSnapshotId: string | null;  // For preview/comparison
    isLoading: boolean;
    error: string | null;
}

export interface SnapshotWithBranch extends ISnapshot {
    branch: IBranch;
    isHead: boolean;
    children: string[];  // IDs of child snapshots
}

export interface BranchTree {
    branch: IBranch;
    snapshots: ISnapshot[];
    headSnapshot: ISnapshot | null;
}

export interface ILayerSnapshot {
  layerId: string;
  name: string;
  type?: string;
  objects: string;  // Serialized fabric objects JSON
  visible: boolean;
  opacity: number;
  blendMode: string;
  zIndex: number;
}
