//mongo db implementation of database used for production
// Note: Version control methods are stubbed - use PostgresDatabase for full support

import { IDatabase, ISnapshot, IBranch, IVersionData } from './dac';
import {CanvasEvent} from "../common/CanvasEvent";
import {MessageEvent} from "../common/MessageEvent";

export class MongoDBDatabase implements IDatabase {

    private history: CanvasEvent[] = [];
    private branches: Map<string, IBranch> = new Map();
    private snapshots: Map<string, ISnapshot> = new Map();
    
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
}