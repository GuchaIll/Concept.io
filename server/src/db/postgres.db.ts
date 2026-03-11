// PostgreSQL Database Implementation
// Implements IDatabase interface for version control and existing features

import { Knex, knex } from 'knex';
import { IDatabase, ISnapshot, IBranch, ILayerSnapshot, IVersionData, IAsset, IAssetData, IProject } from './dac';
import { CanvasEvent } from '../common/CanvasEvent';
import { MessageEvent } from '../common/MessageEvent';
import type { ISyncTarget, ISyncLog, SyncConfig } from '../../../common/sync.interface';

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
        // Use transaction to ensure atomic upsert of snapshot and layers
        return this.db.transaction(async (trx) => {
            // Upsert snapshot — INSERT … ON CONFLICT(id) DO UPDATE
            const upsertResult = await trx.raw(
                `INSERT INTO snapshots (id, project_id, branch_id, name, description, thumbnail, created_by, created_at, parent_snapshot_id)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON CONFLICT (id) DO UPDATE SET
                   name             = EXCLUDED.name,
                   description      = EXCLUDED.description,
                   thumbnail        = EXCLUDED.thumbnail,
                   created_at       = EXCLUDED.created_at,
                   parent_snapshot_id = EXCLUDED.parent_snapshot_id
                 RETURNING *`,
                [
                    snapshot.id,
                    snapshot.projectId,
                    snapshot.branchId,
                    snapshot.name,
                    snapshot.description || null,
                    snapshot.thumbnail || null,
                    snapshot.createdBy,
                    String(snapshot.createdAt),
                    snapshot.parentSnapshotId || null,
                ]
            );
            const snapshotRow: SnapshotRow = upsertResult.rows[0];

            // Remove old layer snapshots before re-inserting
            await trx('layer_snapshots').where({ snapshot_id: snapshot.id }).delete();

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
    // Asset Vault (PostgreSQL)
    // ============================================

    private assetRowToInterface(row: any): IAsset {
        return {
            id: row.id,
            projectId: row.project_id,
            name: row.name,
            description: row.description || undefined,
            imageData: row.image_data,
            thumbnailData: row.thumbnail_data || '',
            tags: row.tags || [],
            category: row.category || undefined,
            width: row.width,
            height: row.height,
            createdBy: row.created_by,
            createdAt: parseInt(row.created_at),
            updatedAt: parseInt(row.updated_at),
            sourceLayerId: row.source_layer_id || undefined,
            sourceSnapshotId: row.source_snapshot_id || undefined,
            usageCount: row.usage_count || 0,
            lastUsedAt: row.last_used_at ? parseInt(row.last_used_at) : undefined,
            isShared: row.is_shared ?? false,
            sharedWith: row.shared_with || [],
        };
    }

    async saveAsset(asset: IAsset): Promise<IAsset> {
        await this.db('assets').insert({
            id: asset.id,
            project_id: asset.projectId,
            name: asset.name,
            description: asset.description || null,
            image_data: asset.imageData,
            thumbnail_data: asset.thumbnailData || null,
            tags: asset.tags || [],
            category: asset.category || null,
            width: asset.width,
            height: asset.height,
            created_by: asset.createdBy,
            created_at: String(asset.createdAt),
            updated_at: String(asset.updatedAt),
            source_layer_id: asset.sourceLayerId || null,
            source_snapshot_id: asset.sourceSnapshotId || null,
            usage_count: asset.usageCount || 0,
            last_used_at: asset.lastUsedAt ? String(asset.lastUsedAt) : null,
            is_shared: asset.isShared ?? false,
            shared_with: asset.sharedWith || [],
        });
        return asset;
    }

    async getAssetsByProject(projectId: string): Promise<IAsset[]> {
        const rows = await this.db('assets')
            .where({ project_id: projectId })
            .orderBy('created_at', 'desc');
        return rows.map((r: any) => this.assetRowToInterface(r));
    }

    async getAssetById(assetId: string): Promise<IAsset | null> {
        const row = await this.db('assets').where({ id: assetId }).first();
        return row ? this.assetRowToInterface(row) : null;
    }

    async getAssetsByTags(projectId: string, tags: string[]): Promise<IAsset[]> {
        const rows = await this.db('assets')
            .where({ project_id: projectId })
            .whereRaw('tags && ?', [tags])  // PostgreSQL array overlap operator
            .orderBy('created_at', 'desc');
        return rows.map((r: any) => this.assetRowToInterface(r));
    }

    async updateAsset(assetId: string, updates: Partial<IAsset>): Promise<IAsset | null> {
        const updateData: any = { updated_at: String(Date.now()) };
        if (updates.name !== undefined) updateData.name = updates.name;
        if (updates.description !== undefined) updateData.description = updates.description;
        if (updates.imageData !== undefined) updateData.image_data = updates.imageData;
        if (updates.thumbnailData !== undefined) updateData.thumbnail_data = updates.thumbnailData;
        if (updates.tags !== undefined) updateData.tags = updates.tags;
        if (updates.category !== undefined) updateData.category = updates.category;
        if (updates.width !== undefined) updateData.width = updates.width;
        if (updates.height !== undefined) updateData.height = updates.height;
        if (updates.isShared !== undefined) updateData.is_shared = updates.isShared;
        if (updates.sharedWith !== undefined) updateData.shared_with = updates.sharedWith;

        const [row] = await this.db('assets')
            .where({ id: assetId })
            .update(updateData)
            .returning('*');
        return row ? this.assetRowToInterface(row) : null;
    }

    async deleteAsset(assetId: string): Promise<void> {
        await this.db('assets').where({ id: assetId }).delete();
    }

    async incrementAssetUsage(assetId: string): Promise<void> {
        await this.db('assets')
            .where({ id: assetId })
            .update({
                usage_count: this.db.raw('usage_count + 1'),
                last_used_at: String(Date.now()),
            });
    }

    async getAssetData(projectId: string): Promise<IAssetData> {
        return {
            assets: await this.getAssetsByProject(projectId),
        };
    }

    // ============================================
    // Sync Targets
    // ============================================

    private syncTargetRowToInterface(row: any): ISyncTarget {
        return {
            id: row.id,
            projectId: row.project_id,
            type: row.type,
            name: row.name,
            config: typeof row.config === 'string' ? JSON.parse(row.config) : row.config,
            enabled: row.enabled ?? true,
            lastSyncedAt: row.last_synced_at ? parseInt(row.last_synced_at) : undefined,
            lastSyncSnapshotId: row.last_sync_snapshot_id || undefined,
            lastSyncStatus: row.last_sync_status || undefined,
            lastSyncError: row.last_sync_error || undefined,
            createdBy: row.created_by,
            createdAt: parseInt(row.created_at),
            updatedAt: parseInt(row.updated_at),
        };
    }

    async saveSyncTarget(target: ISyncTarget): Promise<ISyncTarget> {
        await this.db('sync_targets').insert({
            id: target.id,
            project_id: target.projectId,
            type: target.type,
            name: target.name,
            config: JSON.stringify(target.config),
            enabled: target.enabled ?? true,
            last_synced_at: target.lastSyncedAt ? String(target.lastSyncedAt) : null,
            last_sync_snapshot_id: target.lastSyncSnapshotId || null,
            last_sync_status: target.lastSyncStatus || null,
            last_sync_error: target.lastSyncError || null,
            created_by: target.createdBy,
            created_at: String(target.createdAt),
            updated_at: String(target.updatedAt),
        });
        return target;
    }

    async getSyncTargetsByProject(projectId: string): Promise<ISyncTarget[]> {
        const rows = await this.db('sync_targets')
            .where({ project_id: projectId })
            .orderBy('created_at', 'desc');
        return rows.map((r: any) => this.syncTargetRowToInterface(r));
    }

    async getSyncTargetById(targetId: string): Promise<ISyncTarget | null> {
        const row = await this.db('sync_targets').where({ id: targetId }).first();
        return row ? this.syncTargetRowToInterface(row) : null;
    }

    async updateSyncTarget(targetId: string, updates: Partial<ISyncTarget>): Promise<ISyncTarget | null> {
        const updateData: any = { updated_at: String(Date.now()) };
        if (updates.name !== undefined) updateData.name = updates.name;
        if (updates.config !== undefined) updateData.config = JSON.stringify(updates.config);
        if (updates.enabled !== undefined) updateData.enabled = updates.enabled;
        if (updates.lastSyncedAt !== undefined) updateData.last_synced_at = String(updates.lastSyncedAt);
        if (updates.lastSyncSnapshotId !== undefined) updateData.last_sync_snapshot_id = updates.lastSyncSnapshotId;
        if (updates.lastSyncStatus !== undefined) updateData.last_sync_status = updates.lastSyncStatus;
        if (updates.lastSyncError !== undefined) updateData.last_sync_error = updates.lastSyncError;

        const [row] = await this.db('sync_targets')
            .where({ id: targetId })
            .update(updateData)
            .returning('*');
        return row ? this.syncTargetRowToInterface(row) : null;
    }

    async deleteSyncTarget(targetId: string): Promise<void> {
        await this.db('sync_targets').where({ id: targetId }).delete();
    }

    async getEnabledSyncTargets(projectId: string): Promise<ISyncTarget[]> {
        const rows = await this.db('sync_targets')
            .where({ project_id: projectId, enabled: true });
        return rows.map((r: any) => this.syncTargetRowToInterface(r));
    }

    // ============================================
    // Sync Log
    // ============================================

    async saveSyncLog(log: ISyncLog): Promise<ISyncLog> {
        await this.db('sync_log').insert({
            id: log.id,
            sync_target_id: log.syncTargetId,
            snapshot_id: log.snapshotId,
            status: log.status,
            message: log.message || null,
            details: log.details ? JSON.stringify(log.details) : null,
            started_at: String(log.startedAt),
            completed_at: log.completedAt ? String(log.completedAt) : null,
            duration_ms: log.durationMs || null,
        });
        return log;
    }

    async getSyncLogsByTarget(targetId: string, limit: number = 20): Promise<ISyncLog[]> {
        const rows = await this.db('sync_log')
            .where({ sync_target_id: targetId })
            .orderBy('started_at', 'desc')
            .limit(limit);
        return rows.map((row: any) => ({
            id: row.id,
            syncTargetId: row.sync_target_id,
            snapshotId: row.snapshot_id,
            status: row.status,
            message: row.message || undefined,
            details: typeof row.details === 'string' ? JSON.parse(row.details) : (row.details || undefined),
            startedAt: parseInt(row.started_at),
            completedAt: row.completed_at ? parseInt(row.completed_at) : undefined,
            durationMs: row.duration_ms || undefined,
        }));
    }
}
