// PostgreSQL Database Implementation
// Implements IDatabase interface for version control and existing features

import { Knex, knex } from 'knex';
import { IDatabase, ISnapshot, IBranch, ILayerSnapshot, IVersionData, IAsset, IAssetData, IProject } from './dac';
import { CanvasEvent } from '../common/CanvasEvent';
import { MessageEvent } from '../common/MessageEvent';

// Database row types (snake_case from PostgreSQL)
interface BranchRow {
    id: string;
    project_id: string;
    name: string;
    head_snapshot_id: string | null;
    created_by: string;
    created_at: string; // bigint comes as string
    color: string | null;
}

interface SnapshotRow {
    id: string;
    project_id: string;
    branch_id: string;
    name: string;
    description: string | null;
    thumbnail: string | null;
    created_by: string;
    created_at: string;
    parent_snapshot_id: string | null;
}

interface LayerSnapshotRow {
    id: number;
    snapshot_id: string;
    layer_id: string;
    name: string;
    type: string | null;
    objects: string;
    visible: boolean;
    opacity: string; // decimal comes as string
    blend_mode: string;
    z_index: number;
    locked: boolean;
    snapshot_type: string | null;
    reference_snapshot_id: string | null;
}

// Helper functions to convert between DB rows and interface types
function branchRowToInterface(row: BranchRow): IBranch {
    return {
        id: row.id,
        projectId: row.project_id,
        name: row.name,
        headSnapshotId: row.head_snapshot_id || '',
        createdBy: row.created_by,
        createdAt: parseInt(row.created_at),
        color: row.color || '#2b6cee',
    };
}

function snapshotRowToInterface(row: SnapshotRow, layers: ILayerSnapshot[] = []): ISnapshot {
    return {
        id: row.id,
        projectId: row.project_id,
        branchId: row.branch_id,
        name: row.name,
        description: row.description || undefined,
        thumbnail: row.thumbnail || '',
        createdBy: row.created_by,
        createdAt: parseInt(row.created_at),
        parentSnapshotId: row.parent_snapshot_id || undefined,
        layers,
    };
}

function layerRowToInterface(row: LayerSnapshotRow): ILayerSnapshot {
    return {
        layerId: row.layer_id,
        name: row.name,
        type: row.type || 'Paint',
        objects: row.objects,
        visible: row.visible,
        opacity: parseFloat(row.opacity),
        blendMode: row.blend_mode,
        zIndex: row.z_index,
        locked: row.locked ?? false,
        snapshotType: (row.snapshot_type as 'full' | 'reference') || 'full',
        referenceSnapshotId: row.reference_snapshot_id || undefined,
    };
}

export class PostgresDatabase implements IDatabase {
    private db: Knex;
    private canvasHistory: CanvasEvent[] = [];
    private messageHistory: MessageEvent[] = [];
    private teams: Map<string, string[]> = new Map();
    private teamList: string[] = [];

    constructor(connectionString?: string) {
        this.db = knex({
            client: 'pg',
            connection: connectionString || process.env.DATABASE_URL || {
                host: process.env.DB_HOST || 'localhost',
                port: parseInt(process.env.DB_PORT || '5432'),
                database: process.env.DB_NAME || 'conceptio',
                user: process.env.DB_USER || 'postgres',
                password: process.env.DB_PASSWORD || 'concept123',
            },
            pool: {
                min: 2,
                max: 10,
            },
        });
    }

    async connect(): Promise<void> {
        try {
            await this.db.raw('SELECT 1');
            console.log('PostgreSQL connected successfully');
        } catch (error) {
            console.error('PostgreSQL connection failed:', error);
            throw error;
        }
    }

    async disconnect(): Promise<void> {
        await this.db.destroy();
        console.log('PostgreSQL disconnected');
    }

    async inherits(): Promise<void> {
        console.log('PostgresDatabase inherits');
    }

    // ============================================
    // Existing methods (in-memory for now)
    // ============================================

    async saveCanvasEventToHistory(e: CanvasEvent): Promise<void> {
        this.canvasHistory.push(e);
    }

    async getAllCanvasEventsFromHistory(): Promise<CanvasEvent[]> {
        return this.canvasHistory;
    }

    async removeCanvasEventFromHistory(e: CanvasEvent): Promise<void> {
        const index = this.canvasHistory.findIndex(event => event === e);
        if (index > -1) {
            this.canvasHistory.splice(index, 1);
        }
    }

    async saveMessageToChatHistory(e: MessageEvent): Promise<void> {
        this.messageHistory.push(e);
    }

    async getAllMessagesFromChatHistory(): Promise<MessageEvent[]> {
        return this.messageHistory;
    }

    async AddMemberToTeam(teamID: string, userID: string): Promise<void> {
        const members = this.teams.get(teamID) || [];
        if (!members.includes(userID)) {
            members.push(userID);
            this.teams.set(teamID, members);
        }
    }

    async RemoveMemberFromTeam(teamID: string, userID: string): Promise<void> {
        const members = this.teams.get(teamID) || [];
        const index = members.indexOf(userID);
        if (index > -1) {
            members.splice(index, 1);
            this.teams.set(teamID, members);
        }
    }

    async saveTeamToTeamList(teamID: string): Promise<void> {
        if (!this.teamList.includes(teamID)) {
            this.teamList.push(teamID);
        }
    }

    async getAllTeamsFromTeamList(): Promise<string[]> {
        return this.teamList;
    }

    // ============================================
    // Version Control - Branches
    // ============================================

    async saveBranch(branch: IBranch): Promise<IBranch> {
        const [row] = await this.db<BranchRow>('branches')
            .insert({
                id: branch.id,
                project_id: branch.projectId,
                name: branch.name,
                head_snapshot_id: branch.headSnapshotId || null,
                created_by: branch.createdBy,
                created_at: String(branch.createdAt),
                color: branch.color || '#2b6cee',
            })
            .returning('*');

        return branchRowToInterface(row);
    }

    async getBranchesByProject(projectId: string): Promise<IBranch[]> {
        const rows = await this.db<BranchRow>('branches')
            .where({ project_id: projectId })
            .orderBy('created_at', 'asc');

        return rows.map(branchRowToInterface);
    }

    async getBranchById(branchId: string): Promise<IBranch | null> {
        const row = await this.db<BranchRow>('branches')
            .where({ id: branchId })
            .first();

        return row ? branchRowToInterface(row) : null;
    }

    async updateBranch(branchId: string, updates: Partial<IBranch>): Promise<IBranch | null> {
        const updateData: Partial<BranchRow> = {};
        
        if (updates.name !== undefined) updateData.name = updates.name;
        if (updates.headSnapshotId !== undefined) updateData.head_snapshot_id = updates.headSnapshotId || null;
        if (updates.color !== undefined) updateData.color = updates.color;

        const [row] = await this.db<BranchRow>('branches')
            .where({ id: branchId })
            .update(updateData)
            .returning('*');

        return row ? branchRowToInterface(row) : null;
    }

    async deleteBranch(branchId: string): Promise<void> {
        await this.db('branches').where({ id: branchId }).delete();
    }

    // ============================================
    // Version Control - Snapshots
    // ============================================

    async saveSnapshot(snapshot: ISnapshot): Promise<ISnapshot> {
        // Use transaction to ensure atomic insert of snapshot and layers
        return this.db.transaction(async (trx) => {
            // Insert snapshot
            const [snapshotRow] = await trx<SnapshotRow>('snapshots')
                .insert({
                    id: snapshot.id,
                    project_id: snapshot.projectId,
                    branch_id: snapshot.branchId,
                    name: snapshot.name,
                    description: snapshot.description || null,
                    thumbnail: snapshot.thumbnail || null,
                    created_by: snapshot.createdBy,
                    created_at: String(snapshot.createdAt),
                    parent_snapshot_id: snapshot.parentSnapshotId || null,
                })
                .returning('*');

            // Insert layer snapshots
            if (snapshot.layers && snapshot.layers.length > 0) {
                await trx('layer_snapshots').insert(
                    snapshot.layers.map((layer) => ({
                        snapshot_id: snapshot.id,
                        layer_id: layer.layerId,
                        name: layer.name,
                        type: layer.type || 'Paint',
                        objects: layer.objects,
                        visible: layer.visible,
                        opacity: layer.opacity,
                        blend_mode: layer.blendMode,
                        z_index: layer.zIndex,
                        locked: layer.locked ?? false,
                        snapshot_type: layer.snapshotType || 'full',
                        reference_snapshot_id: layer.referenceSnapshotId || null,
                    }))
                );
            }

            // Update branch head
            await trx('branches')
                .where({ id: snapshot.branchId })
                .update({ head_snapshot_id: snapshot.id });

            return snapshotRowToInterface(snapshotRow, snapshot.layers);
        });
    }

    async getSnapshotsByProject(projectId: string): Promise<ISnapshot[]> {
        const snapshotRows = await this.db<SnapshotRow>('snapshots')
            .where({ project_id: projectId })
            .orderBy('created_at', 'asc');

        // Fetch layers for all snapshots
        const snapshotIds = snapshotRows.map((s) => s.id);
        const layerRows = snapshotIds.length > 0
            ? await this.db<LayerSnapshotRow>('layer_snapshots')
                .whereIn('snapshot_id', snapshotIds)
                .orderBy('z_index', 'asc')
            : [];

        // Group layers by snapshot
        const layersBySnapshot = new Map<string, ILayerSnapshot[]>();
        for (const row of layerRows) {
            const layers = layersBySnapshot.get(row.snapshot_id) || [];
            layers.push(layerRowToInterface(row));
            layersBySnapshot.set(row.snapshot_id, layers);
        }

        return snapshotRows.map((row) =>
            snapshotRowToInterface(row, layersBySnapshot.get(row.id) || [])
        );
    }

    async getSnapshotsByBranch(branchId: string): Promise<ISnapshot[]> {
        const snapshotRows = await this.db<SnapshotRow>('snapshots')
            .where({ branch_id: branchId })
            .orderBy('created_at', 'asc');

        const snapshotIds = snapshotRows.map((s) => s.id);
        const layerRows = snapshotIds.length > 0
            ? await this.db<LayerSnapshotRow>('layer_snapshots')
                .whereIn('snapshot_id', snapshotIds)
                .orderBy('z_index', 'asc')
            : [];

        const layersBySnapshot = new Map<string, ILayerSnapshot[]>();
        for (const row of layerRows) {
            const layers = layersBySnapshot.get(row.snapshot_id) || [];
            layers.push(layerRowToInterface(row));
            layersBySnapshot.set(row.snapshot_id, layers);
        }

        return snapshotRows.map((row) =>
            snapshotRowToInterface(row, layersBySnapshot.get(row.id) || [])
        );
    }

    async getSnapshotById(snapshotId: string): Promise<ISnapshot | null> {
        const snapshotRow = await this.db<SnapshotRow>('snapshots')
            .where({ id: snapshotId })
            .first();

        if (!snapshotRow) return null;

        const layerRows = await this.db<LayerSnapshotRow>('layer_snapshots')
            .where({ snapshot_id: snapshotId })
            .orderBy('z_index', 'asc');

        const layers = layerRows.map(layerRowToInterface);
        return snapshotRowToInterface(snapshotRow, layers);
    }

    async deleteSnapshot(snapshotId: string): Promise<void> {
        // Layers are cascade deleted via foreign key
        await this.db('snapshots').where({ id: snapshotId }).delete();
    }

    // ============================================
    // Version Control - Sync
    // ============================================

    async getVersionData(projectId: string): Promise<IVersionData> {
        const [branches, snapshots] = await Promise.all([
            this.getBranchesByProject(projectId),
            this.getSnapshotsByProject(projectId),
        ]);

        return { branches, snapshots };
    }

    // ============================================
    // Delta Snapshot Resolution
    // ============================================

    async resolveSnapshot(snapshotId: string, maxDepth: number = 10): Promise<ISnapshot | null> {
        const snapshot = await this.getSnapshotById(snapshotId);
        if (!snapshot) return null;

        const hasReferences = snapshot.layers.some(l => l.snapshotType === 'reference');
        if (!hasReferences) return snapshot;

        const resolvedLayers: ILayerSnapshot[] = [];
        for (const layer of snapshot.layers) {
            if (layer.snapshotType === 'reference' && layer.referenceSnapshotId) {
                const resolvedLayer = await this.resolveLayerReference(
                    layer.layerId,
                    layer.referenceSnapshotId,
                    maxDepth
                );
                if (resolvedLayer) {
                    resolvedLayers.push({
                        ...layer,
                        objects: resolvedLayer.objects,
                        snapshotType: 'full',
                        referenceSnapshotId: undefined,
                    });
                } else {
                    console.warn(`Could not resolve reference for layer ${layer.layerId} in snapshot ${snapshotId}`);
                    resolvedLayers.push({ ...layer, snapshotType: 'full' });
                }
            } else {
                resolvedLayers.push(layer);
            }
        }

        return { ...snapshot, layers: resolvedLayers };
    }

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
                    currentSnapshotId = layer.referenceSnapshotId;
                    depth++;
                    continue;
                }
                return layer;
            }

            currentSnapshotId = snap.parentSnapshotId;
            depth++;
        }

        return null;
    }

    // ============================================
    // Project Management
    // ============================================
    
    async saveProject(project: IProject): Promise<IProject> {
        await this.db('projects').insert({
            id: project.id,
            name: project.name,
            description: project.description || null,
            thumbnail_url: project.thumbnailUrl || null,
            created_by: project.createdBy,
            created_at: String(project.createdAt),
            updated_at: String(project.updatedAt),
            canvas_width: project.canvasWidth,
            canvas_height: project.canvasHeight,
            settings: JSON.stringify(project.settings || {}),
        });
        return project;
    }
    
    async getProjectsByUser(userId: string): Promise<IProject[]> {
        const rows = await this.db('projects')
            .where({ created_by: userId })
            .orderBy('updated_at', 'desc');
        return rows.map(this.projectRowToInterface);
    }
    
    async getAllProjects(): Promise<IProject[]> {
        const rows = await this.db('projects').orderBy('updated_at', 'desc');
        return rows.map(this.projectRowToInterface);
    }
    
    async getProjectById(projectId: string): Promise<IProject | null> {
        const row = await this.db('projects').where({ id: projectId }).first();
        return row ? this.projectRowToInterface(row) : null;
    }
    
    async updateProject(projectId: string, updates: Partial<IProject>): Promise<IProject | null> {
        const updateData: any = { updated_at: String(Date.now()) };
        if (updates.name !== undefined) updateData.name = updates.name;
        if (updates.description !== undefined) updateData.description = updates.description;
        if (updates.thumbnailUrl !== undefined) updateData.thumbnail_url = updates.thumbnailUrl;
        if (updates.canvasWidth !== undefined) updateData.canvas_width = updates.canvasWidth;
        if (updates.canvasHeight !== undefined) updateData.canvas_height = updates.canvasHeight;
        if (updates.settings !== undefined) updateData.settings = JSON.stringify(updates.settings);
        
        const [row] = await this.db('projects')
            .where({ id: projectId })
            .update(updateData)
            .returning('*');
        return row ? this.projectRowToInterface(row) : null;
    }
    
    async deleteProject(projectId: string): Promise<void> {
        await this.db.transaction(async (trx) => {
            // Delete layer snapshots via snapshots
            const snapshotIds = await trx('snapshots').where({ project_id: projectId }).select('id');
            if (snapshotIds.length > 0) {
                await trx('layer_snapshots').whereIn('snapshot_id', snapshotIds.map(s => s.id)).del();
            }
            await trx('snapshots').where({ project_id: projectId }).del();
            await trx('branches').where({ project_id: projectId }).del();
            await trx('assets').where({ project_id: projectId }).del();
            await trx('projects').where({ id: projectId }).del();
        });
    }
    
    private projectRowToInterface(row: any): IProject {
        return {
            id: row.id,
            name: row.name,
            description: row.description || undefined,
            thumbnailUrl: row.thumbnail_url || undefined,
            createdBy: row.created_by,
            createdAt: parseInt(row.created_at),
            updatedAt: parseInt(row.updated_at),
            canvasWidth: row.canvas_width || 1920,
            canvasHeight: row.canvas_height || 1080,
            settings: typeof row.settings === 'string' ? JSON.parse(row.settings) : (row.settings || {}),
        };
    }

    // ============================================
    // Asset Vault (in-memory stubs - implement with DB later)
    // ============================================

    private assets: Map<string, IAsset> = new Map();

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
}
