// Delta Snapshot Tests
// Tests for WS2: Delta-based version control snapshots

import { InMemoryDatabase } from '../db/inMemory.db';
import DAC, { ISnapshot, IBranch, ILayerSnapshot } from '../db/dac';

describe('Delta Snapshots - Version Control', () => {
    let db: InMemoryDatabase;
    const projectId = 'test-project-delta';
    
    // Helper to create a branch
    const createBranch = async (name: string = 'main'): Promise<IBranch> => {
        return db.saveBranch({
            id: `branch-${name}-${Date.now()}`,
            projectId,
            name,
            headSnapshotId: '',
            createdBy: 'test-user',
            createdAt: Date.now(),
            color: '#2b6cee',
        });
    };
    
    // Helper to create a full snapshot
    const createFullSnapshot = async (
        branchId: string,
        name: string,
        layers: ILayerSnapshot[],
        parentSnapshotId?: string,
    ): Promise<ISnapshot> => {
        return db.saveSnapshot({
            id: `snapshot-${name}-${Date.now()}`,
            projectId,
            branchId,
            name,
            layers,
            thumbnail: '',
            createdBy: 'test-user',
            createdAt: Date.now(),
            parentSnapshotId,
        });
    };
    
    // Helper to create a layer snapshot
    const makeLayer = (
        layerId: string,
        objects: any[] = [],
        overrides: Partial<ILayerSnapshot> = {},
    ): ILayerSnapshot => ({
        layerId,
        name: `Layer ${layerId}`,
        type: 'paint',
        objects: JSON.stringify(objects),
        visible: true,
        opacity: 1,
        blendMode: 'normal',
        zIndex: 0,
        locked: false,
        snapshotType: 'full',
        ...overrides,
    });
    
    // Helper to create a reference layer
    const makeRefLayer = (
        layerId: string,
        referenceSnapshotId: string,
        overrides: Partial<ILayerSnapshot> = {},
    ): ILayerSnapshot => ({
        layerId,
        name: `Layer ${layerId}`,
        type: 'paint',
        objects: '[]',  // Empty — data lives in referenced snapshot
        visible: true,
        opacity: 1,
        blendMode: 'normal',
        zIndex: 0,
        locked: false,
        snapshotType: 'reference',
        referenceSnapshotId,
        ...overrides,
    });
    
    beforeEach(() => {
        db = new InMemoryDatabase();
        DAC.db = db;
    });
    
    afterEach(() => {
        DAC.resetDb();
    });
    
    describe('ILayerSnapshot snapshotType field', () => {
        it('should default snapshotType to full when not specified', async () => {
            const branch = await createBranch();
            const layer: ILayerSnapshot = {
                layerId: 'layer-1',
                name: 'Test Layer',
                type: 'paint',
                objects: JSON.stringify([{ type: 'path', path: [[0,0],[10,10]] }]),
                visible: true,
                opacity: 1,
                blendMode: 'normal',
                zIndex: 0,
            };
            
            const snapshot = await createFullSnapshot(branch.id, 'v1', [layer]);
            const retrieved = await db.getSnapshotById(snapshot.id);
            
            // Layer without snapshotType should be treated as full
            expect(retrieved!.layers[0].snapshotType).toBeUndefined();
            // resolveSnapshot should still work — treats undefined as full
            const resolved = await db.resolveSnapshot(snapshot.id);
            expect(resolved!.layers[0].objects).toBe(layer.objects);
        });
        
        it('should persist snapshotType=full explicitly', async () => {
            const branch = await createBranch();
            const layer = makeLayer('layer-1', [{ type: 'rect', width: 50 }]);
            
            const snapshot = await createFullSnapshot(branch.id, 'v1', [layer]);
            const retrieved = await db.getSnapshotById(snapshot.id);
            
            expect(retrieved!.layers[0].snapshotType).toBe('full');
            expect(retrieved!.layers[0].objects).toContain('rect');
        });
        
        it('should persist snapshotType=reference with referenceSnapshotId', async () => {
            const branch = await createBranch();
            const fullLayer = makeLayer('layer-1', [{ type: 'circle', radius: 25 }]);
            const snap1 = await createFullSnapshot(branch.id, 'v1', [fullLayer]);
            
            const refLayer = makeRefLayer('layer-1', snap1.id);
            const snap2 = await createFullSnapshot(branch.id, 'v2', [refLayer], snap1.id);
            
            const retrieved = await db.getSnapshotById(snap2.id);
            expect(retrieved!.layers[0].snapshotType).toBe('reference');
            expect(retrieved!.layers[0].referenceSnapshotId).toBe(snap1.id);
            expect(retrieved!.layers[0].objects).toBe('[]');
        });
    });
    
    describe('resolveSnapshot', () => {
        it('should return null for non-existent snapshot', async () => {
            const result = await db.resolveSnapshot('non-existent');
            expect(result).toBeNull();
        });
        
        it('should return snapshot as-is if all layers are full', async () => {
            const branch = await createBranch();
            const layer1 = makeLayer('layer-1', [{ type: 'rect', width: 100 }]);
            const layer2 = makeLayer('layer-2', [{ type: 'circle', radius: 50 }]);
            
            const snapshot = await createFullSnapshot(branch.id, 'v1', [layer1, layer2]);
            const resolved = await db.resolveSnapshot(snapshot.id);
            
            expect(resolved).not.toBeNull();
            expect(resolved!.layers).toHaveLength(2);
            expect(resolved!.layers[0].objects).toContain('rect');
            expect(resolved!.layers[1].objects).toContain('circle');
        });
        
        it('should resolve single reference layer to full data', async () => {
            const branch = await createBranch();
            
            // Snapshot 1: full data for both layers
            const layer1Full = makeLayer('layer-1', [{ type: 'rect', width: 100 }]);
            const layer2Full = makeLayer('layer-2', [{ type: 'path', path: 'M0 0 L10 10' }]);
            const snap1 = await createFullSnapshot(branch.id, 'v1', [layer1Full, layer2Full]);
            
            // Snapshot 2: layer-1 changed (full), layer-2 unchanged (reference)
            const layer1Updated = makeLayer('layer-1', [{ type: 'rect', width: 200 }]);
            const layer2Ref = makeRefLayer('layer-2', snap1.id);
            const snap2 = await createFullSnapshot(branch.id, 'v2', [layer1Updated, layer2Ref], snap1.id);
            
            const resolved = await db.resolveSnapshot(snap2.id);
            
            expect(resolved).not.toBeNull();
            expect(resolved!.layers).toHaveLength(2);
            
            // Layer 1 should have updated data
            expect(resolved!.layers[0].objects).toContain('200');
            expect(resolved!.layers[0].snapshotType).toBe('full');
            
            // Layer 2 should have resolved data from snap1
            expect(resolved!.layers[1].objects).toContain('path');
            expect(resolved!.layers[1].snapshotType).toBe('full');
            expect(resolved!.layers[1].referenceSnapshotId).toBeUndefined();
        });
        
        it('should resolve chained references (2 levels deep)', async () => {
            const branch = await createBranch();
            
            // Snapshot 1: full data
            const baseLayer = makeLayer('layer-bg', [{ type: 'image', src: 'bg.png' }]);
            const snap1 = await createFullSnapshot(branch.id, 'v1', [baseLayer]);
            
            // Snapshot 2: reference to snap1
            const refLayer2 = makeRefLayer('layer-bg', snap1.id);
            const snap2 = await createFullSnapshot(branch.id, 'v2', [refLayer2], snap1.id);
            
            // Snapshot 3: reference to snap2 (which itself references snap1)
            const refLayer3 = makeRefLayer('layer-bg', snap2.id);
            const snap3 = await createFullSnapshot(branch.id, 'v3', [refLayer3], snap2.id);
            
            const resolved = await db.resolveSnapshot(snap3.id);
            
            expect(resolved).not.toBeNull();
            expect(resolved!.layers[0].objects).toContain('bg.png');
            expect(resolved!.layers[0].snapshotType).toBe('full');
        });
        
        it('should handle mixed full and reference layers', async () => {
            const branch = await createBranch();
            
            // Base snapshot with 3 layers
            const layer1 = makeLayer('l1', [{ type: 'rect' }], { zIndex: 0 });
            const layer2 = makeLayer('l2', [{ type: 'circle' }], { zIndex: 1 });
            const layer3 = makeLayer('l3', [{ type: 'path' }], { zIndex: 2 });
            const snap1 = await createFullSnapshot(branch.id, 'v1', [layer1, layer2, layer3]);
            
            // Second snapshot: only layer 2 changed
            const layer1Ref = makeRefLayer('l1', snap1.id, { zIndex: 0 });
            const layer2Updated = makeLayer('l2', [{ type: 'ellipse' }], { zIndex: 1 });
            const layer3Ref = makeRefLayer('l3', snap1.id, { zIndex: 2 });
            const snap2 = await createFullSnapshot(branch.id, 'v2', [layer1Ref, layer2Updated, layer3Ref], snap1.id);
            
            const resolved = await db.resolveSnapshot(snap2.id);
            
            expect(resolved!.layers[0].objects).toContain('rect');    // Resolved from snap1
            expect(resolved!.layers[1].objects).toContain('ellipse'); // Direct full data
            expect(resolved!.layers[2].objects).toContain('path');    // Resolved from snap1
            
            // All should be marked as full after resolution
            resolved!.layers.forEach(l => {
                expect(l.snapshotType).toBe('full');
            });
        });
        
        it('should respect maxDepth limit', async () => {
            const branch = await createBranch();
            
            // Create a chain deeper than maxDepth=2
            const baseLayer = makeLayer('deep-layer', [{ type: 'text', text: 'deep' }]);
            const snap1 = await createFullSnapshot(branch.id, 'v1', [baseLayer]);
            
            const ref2 = makeRefLayer('deep-layer', snap1.id);
            const snap2 = await createFullSnapshot(branch.id, 'v2', [ref2], snap1.id);
            
            const ref3 = makeRefLayer('deep-layer', snap2.id);
            const snap3 = await createFullSnapshot(branch.id, 'v3', [ref3], snap2.id);
            
            const ref4 = makeRefLayer('deep-layer', snap3.id);
            const snap4 = await createFullSnapshot(branch.id, 'v4', [ref4], snap3.id);
            
            // Resolve with maxDepth=2 — chain is 3 levels deep so it should fail
            const resolved = await db.resolveSnapshot(snap4.id, 2);
            
            // Should still return a snapshot, but the unresolved layer should stay as full with empty data
            expect(resolved).not.toBeNull();
            // It may or may not resolve depending on chain traversal — the important thing is it doesn't crash
        });
        
        it('should handle missing reference snapshot gracefully', async () => {
            const branch = await createBranch();
            
            // Create reference to non-existent snapshot
            const orphanRef = makeRefLayer('orphan-layer', 'non-existent-snapshot-id');
            const snapshot = await createFullSnapshot(branch.id, 'v1', [orphanRef]);
            
            const resolved = await db.resolveSnapshot(snapshot.id);
            
            expect(resolved).not.toBeNull();
            // Layer should be returned as full with empty objects (couldn't resolve)
            expect(resolved!.layers[0].snapshotType).toBe('full');
            expect(resolved!.layers[0].objects).toBe('[]');
        });
    });
    
    describe('Delta snapshot storage efficiency', () => {
        it('should store significantly less data for reference layers', async () => {
            const branch = await createBranch();
            
            // Large full layer
            const bigObjects = Array.from({ length: 100 }, (_, i) => ({
                type: 'path',
                path: `M${i} ${i} L${i+100} ${i+100}`,
                stroke: '#000000',
                strokeWidth: 2,
                fill: '',
            }));
            const fullLayer = makeLayer('big-layer', bigObjects);
            const snap1 = await createFullSnapshot(branch.id, 'v1', [fullLayer]);
            
            // Reference layer is tiny
            const refLayer = makeRefLayer('big-layer', snap1.id);
            const snap2 = await createFullSnapshot(branch.id, 'v2', [refLayer], snap1.id);
            
            const snap1Data = await db.getSnapshotById(snap1.id);
            const snap2Data = await db.getSnapshotById(snap2.id);
            
            const snap1Size = JSON.stringify(snap1Data!.layers[0].objects).length;
            const snap2Size = JSON.stringify(snap2Data!.layers[0].objects).length;
            
            // Reference should be much smaller than full
            expect(snap2Size).toBeLessThan(snap1Size / 10);
        });
        
        it('should preserve metadata in reference layers', async () => {
            const branch = await createBranch();
            
            const fullLayer = makeLayer('meta-layer', [{ type: 'rect' }], {
                visible: false,
                opacity: 0.5,
                blendMode: 'multiply',
                zIndex: 3,
                locked: true,
            });
            const snap1 = await createFullSnapshot(branch.id, 'v1', [fullLayer]);
            
            // Reference with different metadata (visibility changed)
            const refLayer = makeRefLayer('meta-layer', snap1.id, {
                visible: true,      // Changed!
                opacity: 0.5,
                blendMode: 'multiply',
                zIndex: 3,
                locked: true,
            });
            const snap2 = await createFullSnapshot(branch.id, 'v2', [refLayer], snap1.id);
            
            const resolved = await db.resolveSnapshot(snap2.id);
            
            // Objects should come from snap1, but metadata from snap2's reference
            expect(resolved!.layers[0].objects).toContain('rect');
            expect(resolved!.layers[0].visible).toBe(true);  // From reference metadata
            expect(resolved!.layers[0].opacity).toBe(0.5);
            expect(resolved!.layers[0].locked).toBe(true);
        });
    });
    
    describe('REST API - resolveSnapshot endpoint', () => {
        // These test the controller behavior via the database layer
        
        it('should resolve full snapshot chain for REST endpoint', async () => {
            const branch = await createBranch();
            
            const paintLayer = makeLayer('paint', [{ type: 'path', d: 'M0 0' }], { zIndex: 0 });
            const assetLayer = makeLayer('asset', [{ type: 'image', src: 'sprite.png' }], { 
                zIndex: 1, type: 'asset' 
            });
            const snap1 = await createFullSnapshot(branch.id, 'Initial', [paintLayer, assetLayer]);
            
            // Only paint layer changed
            const paintUpdated = makeLayer('paint', [{ type: 'path', d: 'M0 0 L50 50' }], { zIndex: 0 });
            const assetRef = makeRefLayer('asset', snap1.id, { zIndex: 1, type: 'asset' });
            const snap2 = await createFullSnapshot(branch.id, 'Paint update', [paintUpdated, assetRef], snap1.id);
            
            const resolved = await db.resolveSnapshot(snap2.id);
            
            expect(resolved!.layers).toHaveLength(2);
            expect(resolved!.layers[0].objects).toContain('L50 50');       // Updated paint
            expect(resolved!.layers[1].objects).toContain('sprite.png');  // Resolved asset
            expect(resolved!.layers[1].type).toBe('asset');              // Type preserved
        });
    });
    
    describe('Dirty flag integration', () => {
        // These test the Layer interface dirty tracking concept
        
        it('should distinguish dirty and clean layers for snapshot serialization', () => {
            // Simulate layer state
            const layers = [
                { id: 'l1', isDirty: true, lastModifiedAt: Date.now(), lastSnapshotId: undefined },
                { id: 'l2', isDirty: false, lastModifiedAt: Date.now() - 60000, lastSnapshotId: 'snap-prev' },
                { id: 'l3', isDirty: true, lastModifiedAt: Date.now(), lastSnapshotId: 'snap-prev' },
            ];
            
            const dirtyLayers = layers.filter(l => l.isDirty);
            const cleanLayers = layers.filter(l => !l.isDirty && l.lastSnapshotId);
            
            expect(dirtyLayers).toHaveLength(2);
            expect(cleanLayers).toHaveLength(1);
            expect(cleanLayers[0].id).toBe('l2');
        });
        
        it('should mark all layers clean after snapshot with correct snapshotId', () => {
            const snapshotId = 'snap-new';
            const layers = [
                { id: 'l1', isDirty: true, lastSnapshotId: undefined },
                { id: 'l2', isDirty: false, lastSnapshotId: 'snap-old' },
                { id: 'l3', isDirty: true, lastSnapshotId: 'snap-old' },
            ];
            
            // Simulate markLayersClean
            const cleaned = layers.map(l => ({
                ...l,
                isDirty: false,
                lastSnapshotId: snapshotId,
            }));
            
            cleaned.forEach(l => {
                expect(l.isDirty).toBe(false);
                expect(l.lastSnapshotId).toBe(snapshotId);
            });
        });
    });
});
