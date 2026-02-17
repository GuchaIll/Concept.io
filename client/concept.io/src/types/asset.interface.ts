// Asset types for the Asset Vault feature

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
  
  // Transform defaults (used when placing on canvas)
  width: number;
  height: number;
  
  // Ownership & tracking
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  
  // Version control integration
  sourceLayerId?: string;      // If created from a layer
  sourceSnapshotId?: string;   // Snapshot it came from
  
  // Usage tracking
  usageCount: number;
  lastUsedAt?: number;
  
  // Collaboration
  isShared: boolean;
  sharedWith?: string[];       // User IDs
}

export interface IAssetLayer {
  layerId: string;
  assetId: string;
  
  // Transform properties
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  
  // Additional layer properties
  opacity: number;
  visible: boolean;
  locked: boolean;
}

export interface AssetVaultState {
  assets: IAsset[];
  selectedAssetId: string | null;
  selectedTags: string[];
  searchQuery: string;
  filterCategory: string | null;
  sortBy: 'name' | 'createdAt' | 'usageCount' | 'lastUsedAt';
  sortOrder: 'asc' | 'desc';
  isLoading: boolean;
  error: string | null;
}

export interface AssetTag {
  name: string;
  color: string;
  count: number;
}

// Predefined asset categories
export const ASSET_CATEGORIES = [
  'Textures',
  'Characters',
  'Props',
  'Environments',
  'Effects',
  'UI Elements',
  'References',
  'Other',
] as const;

export type AssetCategory = typeof ASSET_CATEGORIES[number];

// Predefined tag colors for visual distinction
export const TAG_COLORS = [
  '#2b6cee', // primary blue
  '#8b5cf6', // purple
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ef4444', // red
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#84cc16', // lime
];
