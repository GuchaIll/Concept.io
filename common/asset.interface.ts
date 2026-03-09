// Asset types for server-side - shared interface

// Asset type determines how the asset is processed and rendered
export enum AssetType {
  Background = 'background',  // Full image, no cutout processing
  Foreground = 'foreground',  // Requires background removal for layering
}

// Cutout processing status
export enum CutoutStatus {
  None = 'none',              // No cutout processing (background type)
  Pending = 'pending',        // Cutout requested but not processed
  Processing = 'processing',  // Currently being processed
  Completed = 'completed',    // Cutout completed successfully
  Failed = 'failed',          // Cutout processing failed
}

export interface IAsset {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  
  // Image data - stored as base64 or URL
  imageData: string;          // Original image (or cutout result for foreground)
  thumbnailData: string;
  originalImageData?: string; // Original before cutout (for foreground assets)
  
  // Asset type and cutout processing
  assetType: AssetType;
  cutoutStatus: CutoutStatus;
  cutoutSettings?: {
    featherRadius: number;    // Edge softness (0-10px)
    threshold: number;        // Alpha threshold (0-255)
    refineMask: boolean;      // Apply edge refinement
  };
  
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
