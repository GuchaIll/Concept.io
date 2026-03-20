// an InMemory version of the database that you can use in early-stage development
import { IDatabase, ISnapshot, IBranch, ILayerSnapshot, IVersionData, IAsset, IAssetData, IProject } from './dac';
import {CanvasEvent} from "../common/CanvasEvent";
import {MessageEvent} from "../common/MessageEvent";
import type { ISyncTarget, ISyncLog } from '../../../common/sync.interface';

export class InMemoryDatabase implements IDatabase {
    
    private history: CanvasEvent[] = [];
    private chatHistory: MessageEvent[] = [];
    private teamList: string[] = [];
    
    // Version control storage
    private branches: Map<string, IBranch> = new Map();
    private snapshots: Map<string, ISnapshot> = new Map();
    
    // Asset storage
    private assets: Map<string, IAsset> = new Map();
    
    // Project storage
    private projects: Map<string, IProject> = new Map();
    
    // Sync target storage
    private syncTargets: Map<string, ISyncTarget> = new Map();
    private syncLogs: Map<string, ISyncLog> = new Map();
    
    async connect() : Promise<void> {
        console.log("InMemoryDatabase connected");
    }

    async disconnect() : Promise<void> {
        console.log("InMemoryDatabase disconnected");
    }

    async inherits() : Promise<void> {
        console.log("InMemoryDatabase inherits");
    }
    
    async saveCanvasEventToHistory(e : CanvasEvent) : Promise<void> {
        console.log("InMemoryDatabase saveCanvasEventToHistory");
        this.history.push(e);
    }
    
    async getAllCanvasEventsFromHistory() : Promise<CanvasEvent[]> {
        console.log("InMemoryDatabase getAllCanvasEventsFromHistory");
        return this.history;
    }
    
    async removeCanvasEventFromHistory(e : CanvasEvent) : Promise<void> {
        console.log("InMemoryDatabase removeCanvasEventFromHistory");
        const index = this.history.indexOf(e);
        if (index > -1) {
            this.history.splice(index, 1);
        }
    }

    async saveMessageToChatHistory(e : MessageEvent) : Promise<void> {
        console.log("InMemoryDatabase saveMessageToChatHistory");
    }
    async getAllMessagesFromChatHistory(): Promise<MessageEvent[]> {
        console.log("InMemoryDatabase getAllMessagesFromChatHistory");
        return [];
    }

    async AddMemberToTeam(teamID : string, userID : string) : Promise<void> {
        console.log("InMemoryDatabase AddMemberToTeam");
    }
    async RemoveMemberFromTeam(teamID : string, userID : string) : Promise<void> {
        console.log("InMemoryDatabase RemoveMemberFromTeam");
    }

    async saveTeamToTeamList(teamID : string) : Promise<void> {
        console.log("InMemoryDatabase saveTeamToTeamList");
    }
    async getAllTeamsFromTeamList(): Promise<string[]> {
        console.log("InMemoryDatabase getAllTeamsFromTeamList");
        return [];
    }
    
    // ============================================
    // Version Control - Branches
    // ============================================
    
    async saveBranch(branch: IBranch): Promise<IBranch> {
        this.branches.set(branch.id, branch);
        return branch;
    }
    
    async getBranchesByProject(projectId: string): Promise<IBranch[]> {
        return Array.from(this.branches.values()).filter(b => b.projectId === projectId);
    }
    
    async getBranchById(branchId: string): Promise<IBranch | null> {
        return this.branches.get(branchId) || null;
    }
    
    async updateBranch(branchId: string, updates: Partial<IBranch>): Promise<IBranch | null> {
        const branch = this.branches.get(branchId);
        if (!branch) return null;
        const updated = { ...branch, ...updates };
        this.branches.set(branchId, updated);
        return updated;
    }
    
    async deleteBranch(branchId: string): Promise<void> {
        // Delete associated snapshots first
        const snapshotsToDelete = Array.from(this.snapshots.values()).filter(s => s.branchId === branchId);
        for (const snapshot of snapshotsToDelete) {
            this.snapshots.delete(snapshot.id);
        }
        this.branches.delete(branchId);
    }
    
    // ============================================
    // Version Control - Snapshots
    // ============================================
    
    async saveSnapshot(snapshot: ISnapshot): Promise<ISnapshot> {
        this.snapshots.set(snapshot.id, snapshot);
        // Update branch head
        const branch = this.branches.get(snapshot.branchId);
        if (branch) {
            branch.headSnapshotId = snapshot.id;
            this.branches.set(branch.id, branch);
        }
        return snapshot;
    }
    
    async getSnapshotsByProject(projectId: string): Promise<ISnapshot[]> {
        return Array.from(this.snapshots.values())
            .filter(s => s.projectId === projectId)
            .sort((a, b) => a.createdAt - b.createdAt);
    }
    
    async getSnapshotsByBranch(branchId: string): Promise<ISnapshot[]> {
        return Array.from(this.snapshots.values())
            .filter(s => s.branchId === branchId)
            .sort((a, b) => a.createdAt - b.createdAt);
    }
    
    async getSnapshotById(snapshotId: string): Promise<ISnapshot | null> {
        return this.snapshots.get(snapshotId) || null;
    }
    
    async deleteSnapshot(snapshotId: string): Promise<void> {
        this.snapshots.delete(snapshotId);
    }
    
    // ============================================
    // Version Control - Sync
    // ============================================
    
    async getVersionData(projectId: string): Promise<IVersionData> {
        const branches = await this.getBranchesByProject(projectId);
        const snapshots = await this.getSnapshotsByProject(projectId);
        return { branches, snapshots };
    }
    
    // ============================================
    // Delta Snapshot Resolution
    // ============================================
    
    async resolveSnapshot(snapshotId: string, maxDepth: number = 10): Promise<ISnapshot | null> {
        const snapshot = await this.getSnapshotById(snapshotId);
        if (!snapshot) return null;
        
        // Check if any layers are references that need resolution
        const hasReferences = snapshot.layers.some(l => l.snapshotType === 'reference');
        if (!hasReferences) return snapshot; // Already fully resolved
        
        // Resolve each reference layer by walking the snapshot chain
        const resolvedLayers: ILayerSnapshot[] = [];
        for (const layer of snapshot.layers) {
            if (layer.snapshotType === 'reference' && layer.referenceSnapshotId) {
                const resolvedLayer = await this.resolveLayerReference(
                    layer.layerId,
                    layer.referenceSnapshotId,
                    maxDepth
                );
                if (resolvedLayer) {
                    // Keep current metadata but use resolved objects and rasterData
                    resolvedLayers.push({
                        ...layer,
                        objects: resolvedLayer.objects,
                        rasterData: resolvedLayer.rasterData,
                        snapshotType: 'full',
                        referenceSnapshotId: undefined,
                    });
                } else {
                    // Could not resolve — keep as-is with empty objects
                    console.warn(`Could not resolve reference for layer ${layer.layerId} in snapshot ${snapshotId}`);
                    resolvedLayers.push({ ...layer, snapshotType: 'full' });
                }
            } else {
                resolvedLayers.push(layer);
            }
        }
        
        return { ...snapshot, layers: resolvedLayers };
    }
    
    // Walk the snapshot chain to find full data for a referenced layer
    private async resolveLayerReference(
        layerId: string,
        referenceSnapshotId: string,
        maxDepth: number
    ): Promise<ILayerSnapshot | null> {
        let currentSnapshotId: string | undefined = referenceSnapshotId;
        let depth = 0;
        
        while (currentSnapshotId && depth < maxDepth) {
            const snap = await this.getSnapshotById(currentSnapshotId);
            if (!snap) return null;
            
            const layer = snap.layers.find(l => l.layerId === layerId);
            if (layer) {
                if (layer.snapshotType === 'reference' && layer.referenceSnapshotId) {
                    // Follow the chain
                    currentSnapshotId = layer.referenceSnapshotId;
                    depth++;
                    continue;
                }
                // Found full data
                return layer;
            }
            
            // Layer not found in this snapshot — try parent
            currentSnapshotId = snap.parentSnapshotId;
            depth++;
        }
        
        return null;
    }
    
    // ============================================
    // Project Management
    // ============================================
    
    async saveProject(project: IProject): Promise<IProject> {
        this.projects.set(project.id, project);
        return project;
    }
    
    async getProjectsByUser(userId: string): Promise<IProject[]> {
        return Array.from(this.projects.values())
            .filter(p => p.createdBy === userId)
            .sort((a, b) => b.updatedAt - a.updatedAt);
    }
    
    async getAllProjects(): Promise<IProject[]> {
        return Array.from(this.projects.values())
            .sort((a, b) => b.updatedAt - a.updatedAt);
    }
    
    async getProjectById(projectId: string): Promise<IProject | null> {
        return this.projects.get(projectId) || null;
    }
    
    async updateProject(projectId: string, updates: Partial<IProject>): Promise<IProject | null> {
        const project = this.projects.get(projectId);
        if (!project) return null;
        const updated = { ...project, ...updates, updatedAt: Date.now() };
        this.projects.set(projectId, updated);
        return updated;
    }
    
    async deleteProject(projectId: string): Promise<void> {
        this.projects.delete(projectId);
        // Also delete associated branches and snapshots
        const branchesToDelete = Array.from(this.branches.values()).filter(b => b.projectId === projectId);
        for (const branch of branchesToDelete) {
            await this.deleteBranch(branch.id);
        }
        // Delete associated assets
        const assetsToDelete = Array.from(this.assets.values()).filter(a => a.projectId === projectId);
        for (const asset of assetsToDelete) {
            this.assets.delete(asset.id);
        }
    }
    
    // ============================================
    // Asset Vault
    // ============================================
    
    async saveAsset(asset: IAsset): Promise<IAsset> {
        this.assets.set(asset.id, asset);
        return asset;
    }
    
    async getAssetsByProject(projectId: string): Promise<IAsset[]> {
        return Array.from(this.assets.values())
            .filter(a => a.projectId === projectId)
            .sort((a, b) => b.createdAt - a.createdAt);
    }
    
    async getAssetById(assetId: string): Promise<IAsset | null> {
        return this.assets.get(assetId) || null;
    }
    
    async getAssetsByTags(projectId: string, tags: string[]): Promise<IAsset[]> {
        return Array.from(this.assets.values())
            .filter(a => a.projectId === projectId && tags.some(tag => a.tags.includes(tag)))
            .sort((a, b) => b.createdAt - a.createdAt);
    }
    
    async updateAsset(assetId: string, updates: Partial<IAsset>): Promise<IAsset | null> {
        const asset = this.assets.get(assetId);
        if (!asset) return null;
        const updated = { ...asset, ...updates, updatedAt: Date.now() };
        this.assets.set(assetId, updated);
        return updated;
    }
    
    async deleteAsset(assetId: string): Promise<void> {
        this.assets.delete(assetId);
    }
    
    async incrementAssetUsage(assetId: string): Promise<void> {
        const asset = this.assets.get(assetId);
        if (asset) {
            asset.usageCount++;
            asset.lastUsedAt = Date.now();
            this.assets.set(assetId, asset);
        }
    }
    
    async getAssetData(projectId: string): Promise<IAssetData> {
        const assets = await this.getAssetsByProject(projectId);
        return { assets };
    }
    
    // ============================================
    // Sync Targets
    // ============================================
    
    async saveSyncTarget(target: ISyncTarget): Promise<ISyncTarget> {
        this.syncTargets.set(target.id, target);
        return target;
    }
    
    async getSyncTargetsByProject(projectId: string): Promise<ISyncTarget[]> {
        return Array.from(this.syncTargets.values())
            .filter(t => t.projectId === projectId)
            .sort((a, b) => b.createdAt - a.createdAt);
    }
    
    async getSyncTargetById(targetId: string): Promise<ISyncTarget | null> {
        return this.syncTargets.get(targetId) || null;
    }
    
    async updateSyncTarget(targetId: string, updates: Partial<ISyncTarget>): Promise<ISyncTarget | null> {
        const target = this.syncTargets.get(targetId);
        if (!target) return null;
        const updated = { ...target, ...updates, updatedAt: Date.now() };
        this.syncTargets.set(targetId, updated);
        return updated;
    }
    
    async deleteSyncTarget(targetId: string): Promise<void> {
        this.syncTargets.delete(targetId);
        // Delete associated logs
        for (const [logId, log] of this.syncLogs) {
            if (log.syncTargetId === targetId) this.syncLogs.delete(logId);
        }
    }
    
    async getEnabledSyncTargets(projectId: string): Promise<ISyncTarget[]> {
        return Array.from(this.syncTargets.values())
            .filter(t => t.projectId === projectId && t.enabled);
    }
    
    // ============================================
    // Sync Log
    // ============================================
    
    async saveSyncLog(log: ISyncLog): Promise<ISyncLog> {
        this.syncLogs.set(log.id, log);
        return log;
    }
    
    async getSyncLogsByTarget(targetId: string, limit: number = 20): Promise<ISyncLog[]> {
        return Array.from(this.syncLogs.values())
            .filter(l => l.syncTargetId === targetId)
            .sort((a, b) => b.startedAt - a.startedAt)
            .slice(0, limit);
    }
}