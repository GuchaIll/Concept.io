// these are TS types required by socket.io

import { IChatMessage } from './chatMessage.interface';

// Version Timeline Types
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

// Version Event Types
export type VersionEventType = 
  | 'snapshot:create' 
  | 'snapshot:restore' 
  | 'snapshot:delete'
  | 'branch:create' 
  | 'branch:merge'
  | 'branch:switch'
  | 'branch:delete';

export interface VersionEvent {
  type: VersionEventType;
  payload: ISnapshot | IBranch | { snapshotId: string } | { branchId: string };
  userId: string;
  roomId: string;
  timestamp: number;
}

export interface ServerToClientEvents {
  newChatMessage: (chatMessage: IChatMessage) => void;
  // Version Timeline Events
  'version:snapshot:created': (snapshot: ISnapshot) => void;
  'version:snapshot:restored': (data: { snapshotId: string; userId: string }) => void;
  'version:snapshot:deleted': (data: { snapshotId: string }) => void;
  'version:branch:created': (branch: IBranch) => void;
  'version:branch:merged': (data: { sourceBranchId: string; targetBranchId: string; newSnapshotId: string }) => void;
  'version:branch:switched': (data: { branchId: string; userId: string }) => void;
  'version:sync': (data: { branches: IBranch[]; snapshots: ISnapshot[]; currentBranchId: string }) => void;
}

export interface ClientToServerEvents {
  ping: () => void;
  // Version Timeline Events
  'version:snapshot:create': (data: { name: string; description?: string; layers: ILayerSnapshot[]; thumbnail: string }) => void;
  'version:snapshot:restore': (data: { snapshotId: string }) => void;
  'version:snapshot:delete': (data: { snapshotId: string }) => void;
  'version:branch:create': (data: { name: string; fromSnapshotId?: string; color?: string }) => void;
  'version:branch:merge': (data: { sourceBranchId: string; targetBranchId: string }) => void;
  'version:branch:switch': (data: { branchId: string }) => void;
  'version:branch:delete': (data: { branchId: string }) => void;
  'version:sync:request': () => void;
}
