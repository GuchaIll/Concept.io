//mongo db implementation of database used for production
// Note: Version control methods are stubbed - use PostgresDatabase for full support

import { IDatabase, ISnapshot, IBranch, IVersionData, IAsset, IAssetData, IProject, ILayerSnapshot } from './dac';
import {CanvasEvent} from "../common/CanvasEvent";
import {MessageEvent} from "../common/MessageEvent";

export class MongoDBDatabase implements IDatabase {

    private history: CanvasEvent[] = [];
    private branches: Map<string, IBranch> = new Map();
    private snapshots: Map<string, ISnapshot> = new Map();
    private assets: Map<string, IAsset> = new Map();
    private projects: Map<string, IProject> = new Map();
    
    async connect() : Promise<void> {
        console.log("MongoDBDatabase connected");
    }

    async disconnect() : Promise<void> {
        console.log("MongoDBDatabase disconnected");
    }

    async inherits() : Promise<void> {
        console.log("MongoDBDatabase inherits");
    }

    async saveCanvasEventToHistory(e : CanvasEvent) : Promise<void> {
        this.history.push(e);
    }

    async getAllCanvasEventsFromHistory() : Promise<CanvasEvent[]> {
        return this.history;
    }
    
    async removeCanvasEventFromHistory(e : CanvasEvent) : Promise<void> {
        const index = this.history.indexOf(e);
        if (index > -1) this.history.splice(index, 1);
    }
    
    async saveMessageToChatHistory(e : MessageEvent) : Promise<void> {}
    async getAllMessagesFromChatHistory(): Promise<MessageEvent[]> { return []; }
    async AddMemberToTeam(teamID : string, userID : string) : Promise<void> {}
    async RemoveMemberFromTeam(teamID : string, userID : string) : Promise<void> {}
    async saveTeamToTeamList(teamID : string) : Promise<void> {}
    async getAllTeamsFromTeamList(): Promise<string[]> { return []; }
    
    // Version Control (in-memory stubs)
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
        this.branches.delete(branchId);
    }
    async saveSnapshot(snapshot: ISnapshot): Promise<ISnapshot> {
        this.snapshots.set(snapshot.id, snapshot);
        return snapshot;
    }
    async getSnapshotsByProject(projectId: string): Promise<ISnapshot[]> {
        return Array.from(this.snapshots.values()).filter(s => s.projectId === projectId);
    }
    async getSnapshotsByBranch(branchId: string): Promise<ISnapshot[]> {
        return Array.from(this.snapshots.values()).filter(s => s.branchId === branchId);
    }
    async getSnapshotById(snapshotId: string): Promise<ISnapshot | null> {
        return this.snapshots.get(snapshotId) || null;
    }
    async deleteSnapshot(snapshotId: string): Promise<void> {
        this.snapshots.delete(snapshotId);
    }
    async getVersionData(projectId: string): Promise<IVersionData> {
        return {
            branches: await this.getBranchesByProject(projectId),
            snapshots: await this.getSnapshotsByProject(projectId),
        };
    }
    
    // Asset Vault (in-memory stubs)
    async saveAsset(asset: IAsset): Promise<IAsset> {
        this.assets.set(asset.id, asset);
        return asset;
    }
    async getAssetsByProject(projectId: string): Promise<IAsset[]> {
        return Array.from(this.assets.values()).filter(a => a.projectId === projectId);
    }
    async getAssetById(assetId: string): Promise<IAsset | null> {
        return this.assets.get(assetId) || null;
    }
    async getAssetsByTags(projectId: string, tags: string[]): Promise<IAsset[]> {
        return Array.from(this.assets.values()).filter(a => 
            a.projectId === projectId && tags.some(tag => a.tags.includes(tag))
        );
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
            asset.usageCount = (asset.usageCount || 0) + 1;
            asset.lastUsedAt = Date.now();
            this.assets.set(assetId, asset);
        }
    }
    async getAssetData(projectId: string): Promise<IAssetData> {
        return {
            assets: await this.getAssetsByProject(projectId),
        };
    }

    // Delta snapshot resolution (stub)
    async resolveSnapshot(snapshotId: string, _maxDepth?: number): Promise<ISnapshot | null> {
        return this.snapshots.get(snapshotId) || null;
    }

    // Project Management (in-memory stubs)
    async saveProject(project: IProject): Promise<IProject> {
        this.projects.set(project.id, project);
        return project;
    }
    async getProjectsByUser(userId: string): Promise<IProject[]> {
        return Array.from(this.projects.values()).filter(p => p.createdBy === userId);
    }
    async getAllProjects(): Promise<IProject[]> {
        return Array.from(this.projects.values());
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
        // Cascade: delete branches and their snapshots
        const branches = await this.getBranchesByProject(projectId);
        for (const branch of branches) {
            const snaps = await this.getSnapshotsByBranch(branch.id);
            for (const snap of snaps) this.snapshots.delete(snap.id);
            this.branches.delete(branch.id);
        }
    }
}