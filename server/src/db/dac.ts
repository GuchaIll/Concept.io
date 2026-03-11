//Direct Access Object
//This is the access point to the database
//used to decouple database from the rest of the application
//accessed by models which are used by controllers

import {CanvasEvent} from "../common/CanvasEvent";
import {MessageEvent} from "../common/MessageEvent";

// Version Control Types
export interface ISnapshot {
    id: string;
    projectId: string;
    branchId: string;
    name: string;
    description?: string;
    layers: ILayerSnapshot[];
    thumbnail: string;
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
    color?: string;
}

export interface ILayerSnapshot {
    layerId: string;
    name: string;
    type?: string;
    objects: string;
    visible: boolean;
    opacity: number;
    blendMode: string;
    zIndex: number;
    locked?: boolean;
    
    // Delta snapshot support
    snapshotType?: 'full' | 'reference';  // 'full' = contains all data, 'reference' = pointer to another snapshot
    referenceSnapshotId?: string;          // When snapshotType='reference', points to snapshot with full data
}

export interface IVersionData {
    branches: IBranch[];
    snapshots: ISnapshot[];
}

// Project Types
export interface IProject {
    id: string;
    name: string;
    description?: string;
    thumbnailUrl?: string;
    createdBy: string;
    createdAt: number;
    updatedAt: number;
    canvasWidth: number;
    canvasHeight: number;
    settings: Record<string, any>;
}

// Asset Types
export interface IAsset {
    id: string;
    projectId: string;
    name: string;
    description?: string;
    imageData: string;
    thumbnailData: string;
    tags: string[];
    category?: string;
    width: number;
    height: number;
    createdBy: string;
    createdAt: number;
    updatedAt: number;
    sourceLayerId?: string;
    sourceSnapshotId?: string;
    usageCount: number;
    lastUsedAt?: number;
    isShared: boolean;
    sharedWith?: string[];
}

export interface IAssetData {
    assets: IAsset[];
}

export interface IDatabase {
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    inherits(): Promise<void>;
    
    //For undo and redo behaviours send in request from the client side
    saveCanvasEventToHistory(e : CanvasEvent) : Promise<void>;
    getAllCanvasEventsFromHistory(): Promise<CanvasEvent[]>;
    removeCanvasEventFromHistory(e : CanvasEvent) : Promise<void>; //If the user presses undo/redo, get ID of the input actins
    
    saveMessageToChatHistory(e : MessageEvent) : Promise<void>;
    getAllMessagesFromChatHistory(): Promise<MessageEvent[]>;
    
    AddMemberToTeam(teamID : string, userID : string) : Promise<void>;
    RemoveMemberFromTeam(teamID : string, userID : string) : Promise<void>;
    
    saveTeamToTeamList(teamID : string) : Promise<void>;
    getAllTeamsFromTeamList(): Promise<string[]>;
    
    // Version Control - Branches
    saveBranch(branch: IBranch): Promise<IBranch>;
    getBranchesByProject(projectId: string): Promise<IBranch[]>;
    getBranchById(branchId: string): Promise<IBranch | null>;
    updateBranch(branchId: string, updates: Partial<IBranch>): Promise<IBranch | null>;
    deleteBranch(branchId: string): Promise<void>;
    
    // Version Control - Snapshots
    saveSnapshot(snapshot: ISnapshot): Promise<ISnapshot>;
    getSnapshotsByProject(projectId: string): Promise<ISnapshot[]>;
    getSnapshotsByBranch(branchId: string): Promise<ISnapshot[]>;
    getSnapshotById(snapshotId: string): Promise<ISnapshot | null>;
    deleteSnapshot(snapshotId: string): Promise<void>;
    
    // Version Control - Sync
    getVersionData(projectId: string): Promise<IVersionData>;
    
    // Delta snapshot resolution — walks the snapshot chain to resolve reference layers
    resolveSnapshot(snapshotId: string, maxDepth?: number): Promise<ISnapshot | null>;
    
    // Project Management
    saveProject(project: IProject): Promise<IProject>;
    getProjectsByUser(userId: string): Promise<IProject[]>;
    getAllProjects(): Promise<IProject[]>;
    getProjectById(projectId: string): Promise<IProject | null>;
    updateProject(projectId: string, updates: Partial<IProject>): Promise<IProject | null>;
    deleteProject(projectId: string): Promise<void>;
    
    // Asset Vault
    saveAsset(asset: IAsset): Promise<IAsset>;
    getAssetsByProject(projectId: string): Promise<IAsset[]>;
    getAssetById(assetId: string): Promise<IAsset | null>;
    getAssetsByTags(projectId: string, tags: string[]): Promise<IAsset[]>;
    updateAsset(assetId: string, updates: Partial<IAsset>): Promise<IAsset | null>;
    deleteAsset(assetId: string): Promise<void>;
    incrementAssetUsage(assetId: string): Promise<void>;
    getAssetData(projectId: string): Promise<IAssetData>;
}

class DAC {
    static _db : IDatabase;

    static get db(): IDatabase {
        return DAC._db;
    }

    static set db(db: IDatabase) {
        if (DAC._db && process.env.NODE_ENV !== 'test') {
            throw new Error("Database already set");
        }
        DAC._db = db;
    }

    // For testing purposes only
    static resetDb(): void {
        DAC._db = undefined as any;
    }
}

export default DAC;