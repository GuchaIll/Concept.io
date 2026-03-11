// Asset types for server-side - shared interface
export interface IAsset {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  
  // Image data - stored as base64 or URL
  imageData: string;
  thumbnailData: string;
  
  // Metadata
  tags: string[];
  category?: string;
  
  // Transform defaults
  width: number;
  height: number;
  
  // Ownership & tracking
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  
  // Version control integration
  sourceLayerId?: string;
  sourceSnapshotId?: string;
  
  // Usage tracking
  usageCount: number;
  lastUsedAt?: number;
  
  // Collaboration
  isShared: boolean;
  sharedWith?: string[];
}

export interface IAssetData {
  assets: IAsset[];
}
