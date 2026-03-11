/**
 * Unit Tests for Layer Constraints in Version Control
 * Tests locked field persistence, asset layer snapshots, and constraint logic
 */

import { InMemoryDatabase } from '../db/inMemory.db';
import { IBranch, ISnapshot, ILayerSnapshot } from '../db/dac';
import { randomUUID } from 'crypto';

const uuidv4 = () => randomUUID();

describe('Layer Constraints - Snapshot Integration', () => {
  let db: InMemoryDatabase;
  let mainBranch: IBranch;
  const projectId = 'test-project-constraints';
  const userId = 'test-user-constraints';

  const createTestLayer = (overrides?: Partial<ILayerSnapshot>): ILayerSnapshot => ({
    layerId: uuidv4(),
    name: 'Test Layer',
    type: 'paint',
    objects: '[]',
    visible: true,
    opacity: 1.0,
    blendMode: 'normal',
    zIndex: 0,
    locked: false,
    ...overrides,
  });

  beforeEach(async () => {
    db = new InMemoryDatabase();
    mainBranch = {
      id: uuidv4(),
      projectId,
      name: 'main',
      headSnapshotId: '',
      createdBy: userId,
      createdAt: Date.now(),
      color: '#2b6cee',
    };
    await db.saveBranch(mainBranch);
  });

  // ============================
  // Locked field persistence
  // ============================

  describe('Locked Field in Snapshots', () => {
    test('should persist locked=true in layer snapshot', async () => {
      const lockedLayer = createTestLayer({
        name: 'Locked Asset Layer',
        type: 'asset',
        locked: true,
      });

      const snapshot: ISnapshot = {
        id: uuidv4(),
        projectId,
        branchId: mainBranch.id,
        name: 'Locked Layer Snapshot',
        layers: [lockedLayer],
        thumbnail: '',
        createdBy: userId,
        createdAt: Date.now(),
      };

      const saved = await db.saveSnapshot(snapshot);
      const retrieved = await db.getSnapshotById(saved.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved!.layers[0].locked).toBe(true);
      expect(retrieved!.layers[0].type).toBe('asset');
    });

    test('should persist locked=false in layer snapshot', async () => {
      const unlockedLayer = createTestLayer({
        name: 'Unlocked Paint Layer',
        type: 'paint',
        locked: false,
      });

      const snapshot: ISnapshot = {
        id: uuidv4(),
        projectId,
        branchId: mainBranch.id,
        name: 'Unlocked Layer Snapshot',
        layers: [unlockedLayer],
        thumbnail: '',
        createdBy: userId,
        createdAt: Date.now(),
      };

      const saved = await db.saveSnapshot(snapshot);
      const retrieved = await db.getSnapshotById(saved.id);

      expect(retrieved!.layers[0].locked).toBe(false);
    });

    test('should default locked to false when undefined', async () => {
      const layerNoLocked: ILayerSnapshot = {
        layerId: uuidv4(),
        name: 'No Lock Field',
        type: 'paint',
        objects: '[]',
        visible: true,
        opacity: 1.0,
        blendMode: 'normal',
        zIndex: 0,
        // locked intentionally omitted
      };

      const snapshot: ISnapshot = {
        id: uuidv4(),
        projectId,
        branchId: mainBranch.id,
        name: 'Default Lock Snapshot',
        layers: [layerNoLocked],
        thumbnail: '',
        createdBy: userId,
        createdAt: Date.now(),
      };

      const saved = await db.saveSnapshot(snapshot);
      const retrieved = await db.getSnapshotById(saved.id);

      // Should be undefined or false (both are falsy)
      expect(retrieved!.layers[0].locked).toBeFalsy();
    });

    test('should preserve mixed locked states across multiple layers', async () => {
      const layers: ILayerSnapshot[] = [
        createTestLayer({ name: 'Paint (unlocked)', type: 'paint', locked: false, zIndex: 2 }),
        createTestLayer({ name: 'Asset (locked)', type: 'asset', locked: true, zIndex: 1 }),
        createTestLayer({ name: 'BG Plate (locked)', type: 'backgroundPlate', locked: true, zIndex: 0 }),
      ];

      const snapshot: ISnapshot = {
        id: uuidv4(),
        projectId,
        branchId: mainBranch.id,
        name: 'Mixed Lock States',
        layers,
        thumbnail: '',
        createdBy: userId,
        createdAt: Date.now(),
      };

      const saved = await db.saveSnapshot(snapshot);
      const retrieved = await db.getSnapshotById(saved.id);

      expect(retrieved!.layers).toHaveLength(3);
      
      const paintLayer = retrieved!.layers.find(l => l.type === 'paint');
      const assetLayer = retrieved!.layers.find(l => l.type === 'asset');
      const bgLayer = retrieved!.layers.find(l => l.type === 'backgroundPlate');

      expect(paintLayer!.locked).toBe(false);
      expect(assetLayer!.locked).toBe(true);
      expect(bgLayer!.locked).toBe(true);
    });
  });

  // ============================
  // Layer type constraints  
  // ============================

  describe('Layer Type Preservation', () => {
    test('should preserve all layer types in snapshots', async () => {
      const layerTypes = ['paint', 'asset', 'backgroundPlate', 'lightingOverlay', 'diffusionRegion'];
      const layers = layerTypes.map((type, i) => createTestLayer({
        name: `${type} layer`,
        type,
        zIndex: layerTypes.length - 1 - i,
      }));

      const snapshot: ISnapshot = {
        id: uuidv4(),
        projectId,
        branchId: mainBranch.id,
        name: 'All Layer Types',
        layers,
        thumbnail: '',
        createdBy: userId,
        createdAt: Date.now(),
      };

      const saved = await db.saveSnapshot(snapshot);
      const retrieved = await db.getSnapshotById(saved.id);

      expect(retrieved!.layers).toHaveLength(5);
      
      const retrievedTypes = retrieved!.layers.map(l => l.type).sort();
      const expectedTypes = [...layerTypes].sort();
      expect(retrievedTypes).toEqual(expectedTypes);
    });

    test('should preserve blend modes for all layer types', async () => {
      const blendModes = ['normal', 'multiply', 'screen', 'overlay', 'soft-light'];
      const layers = blendModes.map((mode, i) => createTestLayer({
        name: `${mode} blend`,
        blendMode: mode,
        zIndex: i,
      }));

      const snapshot: ISnapshot = {
        id: uuidv4(),
        projectId,
        branchId: mainBranch.id,
        name: 'Blend Modes',
        layers,
        thumbnail: '',
        createdBy: userId,
        createdAt: Date.now(),
      };

      const saved = await db.saveSnapshot(snapshot);
      const retrieved = await db.getSnapshotById(saved.id);

      retrieved!.layers.forEach((layer, i) => {
        expect(layer.blendMode).toBe(blendModes[i]);
      });
    });
  });

  // ============================
  // Asset Layer Snapshot Tests (WS3)
  // ============================

  describe('Asset Layer Snapshots', () => {
    test('should save snapshot with asset layer containing assetId reference', async () => {
      const assetLayerObjects = JSON.stringify([{
        type: 'image',
        src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==',
        left: 100,
        top: 50,
        scaleX: 1,
        scaleY: 1,
        layerId: 'asset-layer-1',
        id: uuidv4(),
      }]);

      const assetLayer = createTestLayer({
        layerId: 'asset-layer-1',
        name: 'Character Sprite',
        type: 'asset',
        objects: assetLayerObjects,
        locked: false,
        zIndex: 1,
      });

      const snapshot: ISnapshot = {
        id: uuidv4(),
        projectId,
        branchId: mainBranch.id,
        name: 'With Asset Layer',
        layers: [
          createTestLayer({ name: 'Paint', type: 'paint', zIndex: 2 }),
          assetLayer,
          createTestLayer({ name: 'Background', type: 'backgroundPlate', zIndex: 0 }),
        ],
        thumbnail: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==',
        createdBy: userId,
        createdAt: Date.now(),
      };

      const saved = await db.saveSnapshot(snapshot);
      const retrieved = await db.getSnapshotById(saved.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved!.layers).toHaveLength(3);

      const retrievedAssetLayer = retrieved!.layers.find(l => l.type === 'asset');
      expect(retrievedAssetLayer).toBeDefined();
      expect(retrievedAssetLayer!.name).toBe('Character Sprite');
      expect(retrievedAssetLayer!.layerId).toBe('asset-layer-1');

      // Verify object data survived serialization
      const objects = JSON.parse(retrievedAssetLayer!.objects);
      expect(objects).toHaveLength(1);
      expect(objects[0].type).toBe('image');
      expect(objects[0].layerId).toBe('asset-layer-1');
    });

    test('should save snapshot with large base64 asset image data', async () => {
      // Simulate a sizeable base64 image (4KB)
      const largeBase64 = 'A'.repeat(4096);
      const assetObjects = JSON.stringify([{
        type: 'image',
        src: `data:image/png;base64,${largeBase64}`,
        left: 0,
        top: 0,
        scaleX: 0.5,
        scaleY: 0.5,
        layerId: 'big-asset',
        id: uuidv4(),
      }]);

      const snapshot: ISnapshot = {
        id: uuidv4(),
        projectId,
        branchId: mainBranch.id,
        name: 'Large Asset',
        layers: [createTestLayer({
          layerId: 'big-asset',
          name: 'Large Image Asset',
          type: 'asset',
          objects: assetObjects,
        })],
        thumbnail: '',
        createdBy: userId,
        createdAt: Date.now(),
      };

      const saved = await db.saveSnapshot(snapshot);
      const retrieved = await db.getSnapshotById(saved.id);

      const objects = JSON.parse(retrieved!.layers[0].objects);
      expect(objects[0].src).toContain(largeBase64);
    });

    test('should preserve empty asset layer (metadata only, no objects)', async () => {
      const emptyAssetLayer = createTestLayer({
        name: 'Empty Asset Slot',
        type: 'asset',
        objects: '[]',
        zIndex: 1,
      });

      const snapshot: ISnapshot = {
        id: uuidv4(),
        projectId,
        branchId: mainBranch.id,
        name: 'Empty Asset Snapshot',
        layers: [emptyAssetLayer],
        thumbnail: '',
        createdBy: userId,
        createdAt: Date.now(),
      };

      const saved = await db.saveSnapshot(snapshot);
      const retrieved = await db.getSnapshotById(saved.id);

      expect(retrieved!.layers[0].type).toBe('asset');
      expect(retrieved!.layers[0].objects).toBe('[]');
    });

    test('should handle mixed paint and asset objects across layers', async () => {
      const paintObjects = JSON.stringify([
        { type: 'path', path: 'M 0 0 L 100 100', stroke: '#ff0000', layerId: 'paint-1', id: uuidv4() },
        { type: 'path', path: 'M 50 50 L 150 150', stroke: '#00ff00', layerId: 'paint-1', id: uuidv4() },
      ]);

      const assetObjects = JSON.stringify([
        { type: 'image', src: 'data:image/png;base64,ABC', left: 200, top: 100, layerId: 'asset-1', id: uuidv4() },
      ]);

      const snapshot: ISnapshot = {
        id: uuidv4(),
        projectId,
        branchId: mainBranch.id,
        name: 'Mixed Content',
        layers: [
          createTestLayer({ layerId: 'paint-1', name: 'Sketch', type: 'paint', objects: paintObjects, zIndex: 2 }),
          createTestLayer({ layerId: 'asset-1', name: 'Reference', type: 'asset', objects: assetObjects, zIndex: 1 }),
          createTestLayer({ name: 'BG', type: 'backgroundPlate', objects: '[]', zIndex: 0 }),
        ],
        thumbnail: 'data:image/jpeg;base64,thumb',
        createdBy: userId,
        createdAt: Date.now(),
      };

      const saved = await db.saveSnapshot(snapshot);
      const retrieved = await db.getSnapshotById(saved.id);

      expect(retrieved!.layers).toHaveLength(3);

      const paint = retrieved!.layers.find(l => l.type === 'paint');
      const asset = retrieved!.layers.find(l => l.type === 'asset');
      const bg = retrieved!.layers.find(l => l.type === 'backgroundPlate');

      expect(JSON.parse(paint!.objects)).toHaveLength(2);
      expect(JSON.parse(asset!.objects)).toHaveLength(1);
      expect(JSON.parse(bg!.objects)).toHaveLength(0);
    });

    test('should preserve asset layer opacity and visibility in version control', async () => {
      const snapshot: ISnapshot = {
        id: uuidv4(),
        projectId,
        branchId: mainBranch.id,
        name: 'Opacity Test',
        layers: [
          createTestLayer({ name: 'Full Opacity', type: 'asset', opacity: 1.0, visible: true, zIndex: 2 }),
          createTestLayer({ name: 'Half Opacity', type: 'asset', opacity: 0.5, visible: true, zIndex: 1 }),
          createTestLayer({ name: 'Hidden Asset', type: 'asset', opacity: 0.75, visible: false, zIndex: 0 }),
        ],
        thumbnail: '',
        createdBy: userId,
        createdAt: Date.now(),
      };

      const saved = await db.saveSnapshot(snapshot);
      const retrieved = await db.getSnapshotById(saved.id);

      const fullOpacity = retrieved!.layers.find(l => l.name === 'Full Opacity');
      const halfOpacity = retrieved!.layers.find(l => l.name === 'Half Opacity');
      const hidden = retrieved!.layers.find(l => l.name === 'Hidden Asset');

      expect(fullOpacity!.opacity).toBe(1.0);
      expect(halfOpacity!.opacity).toBe(0.5);
      expect(hidden!.opacity).toBe(0.75);
      expect(hidden!.visible).toBe(false);
    });
  });

  // ============================
  // Round-trip Tests (WS3)
  // ============================

  describe('Round-trip Serialization', () => {
    test('should round-trip a complex multi-layer snapshot', async () => {
      const originalLayers: ILayerSnapshot[] = [
        {
          layerId: 'paint-main',
          name: 'Main Sketch',
          type: 'paint',
          objects: JSON.stringify([
            { type: 'path', path: 'M 0 0 Q 50 50 100 0', stroke: '#333', strokeWidth: 3, layerId: 'paint-main', id: 'obj-1' },
          ]),
          visible: true,
          opacity: 1.0,
          blendMode: 'normal',
          zIndex: 3,
          locked: false,
        },
        {
          layerId: 'asset-char',
          name: 'Character',
          type: 'asset',
          objects: JSON.stringify([
            { type: 'image', src: 'data:image/png;base64,CHARDATA', left: 100, top: 200, scaleX: 2, scaleY: 2, layerId: 'asset-char', id: 'obj-2' },
          ]),
          visible: true,
          opacity: 0.9,
          blendMode: 'multiply',
          zIndex: 2,
          locked: true,
        },
        {
          layerId: 'bg-plate',
          name: 'Environment BG',
          type: 'backgroundPlate',
          objects: JSON.stringify([
            { type: 'image', src: 'data:image/jpeg;base64,BGPLATE', left: 0, top: 0, layerId: 'bg-plate', id: 'obj-3' },
          ]),
          visible: true,
          opacity: 1.0,
          blendMode: 'normal',
          zIndex: 1,
          locked: true,
        },
        {
          layerId: 'lighting',
          name: 'Rim Light',
          type: 'lightingOverlay',
          objects: '[]',
          visible: true,
          opacity: 0.6,
          blendMode: 'screen',
          zIndex: 0,
          locked: false,
        },
      ];

      const original: ISnapshot = {
        id: uuidv4(),
        projectId,
        branchId: mainBranch.id,
        name: 'Production Frame',
        description: 'Final comp with character and BG',
        layers: originalLayers,
        thumbnail: 'data:image/jpeg;base64,THUMBDATA',
        createdBy: userId,
        createdAt: Date.now(),
      };

      // Save → Retrieve → Compare
      await db.saveSnapshot(original);
      const retrieved = await db.getSnapshotById(original.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe(original.id);
      expect(retrieved!.name).toBe(original.name);
      expect(retrieved!.description).toBe(original.description);
      expect(retrieved!.thumbnail).toBe(original.thumbnail);
      expect(retrieved!.layers).toHaveLength(4);

      // Verify each layer round-trips correctly
      for (const origLayer of originalLayers) {
        const rtLayer = retrieved!.layers.find(l => l.layerId === origLayer.layerId);
        expect(rtLayer).toBeDefined();
        expect(rtLayer!.name).toBe(origLayer.name);
        expect(rtLayer!.type).toBe(origLayer.type);
        expect(rtLayer!.visible).toBe(origLayer.visible);
        expect(rtLayer!.opacity).toBe(origLayer.opacity);
        expect(rtLayer!.blendMode).toBe(origLayer.blendMode);
        expect(rtLayer!.zIndex).toBe(origLayer.zIndex);
        expect(rtLayer!.locked).toBe(origLayer.locked);
        expect(rtLayer!.objects).toBe(origLayer.objects);
      }
    });

    test('should round-trip snapshot across branch operations', async () => {
      // Create snapshot on main
      const layers: ILayerSnapshot[] = [
        createTestLayer({ name: 'Sketch', type: 'paint', objects: '[{"type":"path"}]', zIndex: 1 }),
        createTestLayer({ name: 'Ref Image', type: 'asset', objects: '[{"type":"image","src":"data:abc"}]', zIndex: 0, locked: true }),
      ];

      const snapshot: ISnapshot = {
        id: uuidv4(),
        projectId,
        branchId: mainBranch.id,
        name: 'Base Version',
        layers,
        thumbnail: '',
        createdBy: userId,
        createdAt: Date.now(),
      };
      await db.saveSnapshot(snapshot);

      // Create a feature branch from this snapshot
      const featureBranch: IBranch = {
        id: uuidv4(),
        projectId,
        name: 'color-pass',
        headSnapshotId: snapshot.id,
        createdBy: userId,
        createdAt: Date.now(),
        color: '#8b5cf6',
      };
      await db.saveBranch(featureBranch);

      // Retrieve from different access paths
      const fromProject = await db.getSnapshotsByProject(projectId);
      const fromBranch = await db.getSnapshotsByBranch(mainBranch.id);
      const byId = await db.getSnapshotById(snapshot.id);

      expect(fromProject).toHaveLength(1);
      expect(fromBranch).toHaveLength(1);
      expect(byId).not.toBeNull();

      // All should have identical layer data
      expect(fromProject[0].layers).toEqual(byId!.layers);
      expect(fromBranch[0].layers).toEqual(byId!.layers);

      // Verify asset layer is intact
      const assetLayer = byId!.layers.find(l => l.type === 'asset');
      expect(assetLayer).toBeDefined();
      expect(assetLayer!.locked).toBe(true);
      expect(JSON.parse(assetLayer!.objects)[0].src).toBe('data:abc');
    });
  });
});
