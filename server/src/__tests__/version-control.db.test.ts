/**
 * Unit Tests for InMemoryDatabase Version Control
 * Tests the version control methods without PostgreSQL dependency
 */

import { InMemoryDatabase } from '../db/inMemory.db';
import { IBranch, ISnapshot, ILayerSnapshot } from '../db/dac';
import { randomUUID } from 'crypto';

// Use crypto.randomUUID as it's built-in and works with CommonJS
const uuidv4 = () => randomUUID();

describe('InMemoryDatabase - Version Control', () => {
  let db: InMemoryDatabase;
  const projectId = 'test-project-123';
  const userId = 'test-user-456';

  beforeEach(() => {
    db = new InMemoryDatabase();
  });

  // ============================================
  // Branch Tests
  // ============================================

  describe('Branch Operations', () => {
    const createTestBranch = (overrides?: Partial<IBranch>): IBranch => ({
      id: uuidv4(),
      projectId,
      name: 'test-branch',
      headSnapshotId: '',
      createdBy: userId,
      createdAt: Date.now(),
      color: '#2b6cee',
      ...overrides,
    });

    test('should save a new branch', async () => {
      const branch = createTestBranch({ name: 'main' });
      
      const saved = await db.saveBranch(branch);
      
      expect(saved).toEqual(branch);
      expect(saved.id).toBe(branch.id);
      expect(saved.name).toBe('main');
    });

    test('should retrieve branches by project', async () => {
      const branch1 = createTestBranch({ name: 'main' });
      const branch2 = createTestBranch({ name: 'feature-1' });
      const branch3 = createTestBranch({ name: 'other', projectId: 'other-project' });
      
      await db.saveBranch(branch1);
      await db.saveBranch(branch2);
      await db.saveBranch(branch3);
      
      const branches = await db.getBranchesByProject(projectId);
      
      expect(branches).toHaveLength(2);
      expect(branches.map(b => b.name)).toContain('main');
      expect(branches.map(b => b.name)).toContain('feature-1');
      expect(branches.map(b => b.name)).not.toContain('other');
    });

    test('should retrieve branch by ID', async () => {
      const branch = createTestBranch({ name: 'main' });
      await db.saveBranch(branch);
      
      const found = await db.getBranchById(branch.id);
      
      expect(found).not.toBeNull();
      expect(found?.id).toBe(branch.id);
      expect(found?.name).toBe('main');
    });

    test('should return null for non-existent branch', async () => {
      const found = await db.getBranchById('non-existent-id');
      
      expect(found).toBeNull();
    });

    test('should update branch', async () => {
      const branch = createTestBranch({ name: 'main' });
      await db.saveBranch(branch);
      
      const updated = await db.updateBranch(branch.id, {
        headSnapshotId: 'snapshot-123',
        color: '#ff0000',
      });
      
      expect(updated).not.toBeNull();
      expect(updated?.headSnapshotId).toBe('snapshot-123');
      expect(updated?.color).toBe('#ff0000');
      expect(updated?.name).toBe('main'); // unchanged
    });

    test('should return null when updating non-existent branch', async () => {
      const updated = await db.updateBranch('non-existent', { name: 'new-name' });
      
      expect(updated).toBeNull();
    });

    test('should delete branch', async () => {
      const branch = createTestBranch({ name: 'to-delete' });
      await db.saveBranch(branch);
      
      await db.deleteBranch(branch.id);
      
      const found = await db.getBranchById(branch.id);
      expect(found).toBeNull();
    });

    test('should delete associated snapshots when branch is deleted', async () => {
      const branch = createTestBranch({ name: 'main' });
      await db.saveBranch(branch);
      
      const snapshot: ISnapshot = {
        id: uuidv4(),
        projectId,
        branchId: branch.id,
        name: 'snapshot-1',
        layers: [],
        thumbnail: '',
        createdBy: userId,
        createdAt: Date.now(),
      };
      await db.saveSnapshot(snapshot);
      
      await db.deleteBranch(branch.id);
      
      const foundSnapshot = await db.getSnapshotById(snapshot.id);
      expect(foundSnapshot).toBeNull();
    });
  });

  // ============================================
  // Snapshot Tests
  // ============================================

  describe('Snapshot Operations', () => {
    let mainBranch: IBranch;

    const createTestSnapshot = (overrides?: Partial<ISnapshot>): ISnapshot => ({
      id: uuidv4(),
      projectId,
      branchId: mainBranch.id,
      name: 'test-snapshot',
      description: 'Test description',
      layers: [],
      thumbnail: 'base64-thumbnail-data',
      createdBy: userId,
      createdAt: Date.now(),
      ...overrides,
    });

    const createTestLayer = (overrides?: Partial<ILayerSnapshot>): ILayerSnapshot => ({
      layerId: uuidv4(),
      name: 'Test Layer',
      type: 'Paint',
      objects: '[]',
      visible: true,
      opacity: 1.0,
      blendMode: 'normal',
      zIndex: 0,
      ...overrides,
    });

    beforeEach(async () => {
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

    test('should save a new snapshot', async () => {
      const snapshot = createTestSnapshot({ name: 'Initial Commit' });
      
      const saved = await db.saveSnapshot(snapshot);
      
      expect(saved).toEqual(snapshot);
      expect(saved.name).toBe('Initial Commit');
    });

    test('should update branch head when saving snapshot', async () => {
      const snapshot = createTestSnapshot({ name: 'New Head' });
      
      await db.saveSnapshot(snapshot);
      
      const branch = await db.getBranchById(mainBranch.id);
      expect(branch?.headSnapshotId).toBe(snapshot.id);
    });

    test('should save snapshot with layers', async () => {
      const layers: ILayerSnapshot[] = [
        createTestLayer({ name: 'Background', zIndex: 0 }),
        createTestLayer({ name: 'Foreground', zIndex: 1 }),
        createTestLayer({ name: 'Effects', zIndex: 2, opacity: 0.5 }),
      ];
      
      const snapshot = createTestSnapshot({ name: 'With Layers', layers });
      
      const saved = await db.saveSnapshot(snapshot);
      
      expect(saved.layers).toHaveLength(3);
      expect(saved.layers[0].name).toBe('Background');
      expect(saved.layers[2].opacity).toBe(0.5);
    });

    test('should retrieve snapshots by project', async () => {
      const snapshot1 = createTestSnapshot({ name: 'Snapshot 1', createdAt: 1000 });
      const snapshot2 = createTestSnapshot({ name: 'Snapshot 2', createdAt: 2000 });
      
      await db.saveSnapshot(snapshot1);
      await db.saveSnapshot(snapshot2);
      
      const snapshots = await db.getSnapshotsByProject(projectId);
      
      expect(snapshots).toHaveLength(2);
      // Should be sorted by createdAt
      expect(snapshots[0].createdAt).toBeLessThan(snapshots[1].createdAt);
    });

    test('should retrieve snapshots by branch', async () => {
      const featureBranch: IBranch = {
        id: uuidv4(),
        projectId,
        name: 'feature',
        headSnapshotId: '',
        createdBy: userId,
        createdAt: Date.now(),
        color: '#8b5cf6',
      };
      await db.saveBranch(featureBranch);
      
      const mainSnapshot = createTestSnapshot({ name: 'Main Snapshot' });
      const featureSnapshot = createTestSnapshot({
        name: 'Feature Snapshot',
        branchId: featureBranch.id,
      });
      
      await db.saveSnapshot(mainSnapshot);
      await db.saveSnapshot(featureSnapshot);
      
      const mainSnapshots = await db.getSnapshotsByBranch(mainBranch.id);
      const featureSnapshots = await db.getSnapshotsByBranch(featureBranch.id);
      
      expect(mainSnapshots).toHaveLength(1);
      expect(mainSnapshots[0].name).toBe('Main Snapshot');
      expect(featureSnapshots).toHaveLength(1);
      expect(featureSnapshots[0].name).toBe('Feature Snapshot');
    });

    test('should retrieve snapshot by ID', async () => {
      const snapshot = createTestSnapshot({ name: 'Find Me' });
      await db.saveSnapshot(snapshot);
      
      const found = await db.getSnapshotById(snapshot.id);
      
      expect(found).not.toBeNull();
      expect(found?.name).toBe('Find Me');
    });

    test('should return null for non-existent snapshot', async () => {
      const found = await db.getSnapshotById('non-existent-id');
      
      expect(found).toBeNull();
    });

    test('should delete snapshot', async () => {
      const snapshot = createTestSnapshot({ name: 'To Delete' });
      await db.saveSnapshot(snapshot);
      
      await db.deleteSnapshot(snapshot.id);
      
      const found = await db.getSnapshotById(snapshot.id);
      expect(found).toBeNull();
    });

    test('should support parent-child snapshot relationships', async () => {
      const parent = createTestSnapshot({ name: 'Parent', createdAt: 1000 });
      await db.saveSnapshot(parent);
      
      const child = createTestSnapshot({
        name: 'Child',
        parentSnapshotId: parent.id,
        createdAt: 2000,
      });
      await db.saveSnapshot(child);
      
      const foundChild = await db.getSnapshotById(child.id);
      
      expect(foundChild?.parentSnapshotId).toBe(parent.id);
    });
  });

  // ============================================
  // Version Data (Sync) Tests
  // ============================================

  describe('Version Data Operations', () => {
    test('should get all version data for project', async () => {
      const branch1: IBranch = {
        id: uuidv4(),
        projectId,
        name: 'main',
        headSnapshotId: '',
        createdBy: userId,
        createdAt: Date.now(),
        color: '#2b6cee',
      };
      const branch2: IBranch = {
        id: uuidv4(),
        projectId,
        name: 'feature',
        headSnapshotId: '',
        createdBy: userId,
        createdAt: Date.now(),
        color: '#8b5cf6',
      };
      
      await db.saveBranch(branch1);
      await db.saveBranch(branch2);
      
      const snapshot1: ISnapshot = {
        id: uuidv4(),
        projectId,
        branchId: branch1.id,
        name: 'Main Snapshot',
        layers: [],
        thumbnail: '',
        createdBy: userId,
        createdAt: Date.now(),
      };
      
      await db.saveSnapshot(snapshot1);
      
      const versionData = await db.getVersionData(projectId);
      
      expect(versionData.branches).toHaveLength(2);
      expect(versionData.snapshots).toHaveLength(1);
    });

    test('should return empty arrays for project with no data', async () => {
      const versionData = await db.getVersionData('empty-project');
      
      expect(versionData.branches).toHaveLength(0);
      expect(versionData.snapshots).toHaveLength(0);
    });

    test('should not include data from other projects', async () => {
      const otherProjectBranch: IBranch = {
        id: uuidv4(),
        projectId: 'other-project',
        name: 'main',
        headSnapshotId: '',
        createdBy: userId,
        createdAt: Date.now(),
        color: '#2b6cee',
      };
      await db.saveBranch(otherProjectBranch);
      
      const versionData = await db.getVersionData(projectId);
      
      expect(versionData.branches).toHaveLength(0);
    });
  });

  // ============================================
  // Edge Cases and Error Handling
  // ============================================

  describe('Edge Cases', () => {
    test('should handle empty layer objects string', async () => {
      const branch: IBranch = {
        id: uuidv4(),
        projectId,
        name: 'main',
        headSnapshotId: '',
        createdBy: userId,
        createdAt: Date.now(),
      };
      await db.saveBranch(branch);
      
      const snapshot: ISnapshot = {
        id: uuidv4(),
        projectId,
        branchId: branch.id,
        name: 'Empty Layers',
        layers: [
          {
            layerId: uuidv4(),
            name: 'Empty Layer',
            objects: '', // empty string
            visible: true,
            opacity: 1,
            blendMode: 'normal',
            zIndex: 0,
          },
        ],
        thumbnail: '',
        createdBy: userId,
        createdAt: Date.now(),
      };
      
      const saved = await db.saveSnapshot(snapshot);
      
      expect(saved.layers[0].objects).toBe('');
    });

    test('should handle large layer objects JSON', async () => {
      const branch: IBranch = {
        id: uuidv4(),
        projectId,
        name: 'main',
        headSnapshotId: '',
        createdBy: userId,
        createdAt: Date.now(),
      };
      await db.saveBranch(branch);
      
      // Create a large JSON string (simulating many fabric objects)
      const largeObjects = JSON.stringify(
        Array(1000).fill({ type: 'rect', x: 0, y: 0, width: 100, height: 100 })
      );
      
      const snapshot: ISnapshot = {
        id: uuidv4(),
        projectId,
        branchId: branch.id,
        name: 'Large Snapshot',
        layers: [
          {
            layerId: uuidv4(),
            name: 'Large Layer',
            objects: largeObjects,
            visible: true,
            opacity: 1,
            blendMode: 'normal',
            zIndex: 0,
          },
        ],
        thumbnail: '',
        createdBy: userId,
        createdAt: Date.now(),
      };
      
      const saved = await db.saveSnapshot(snapshot);
      const retrieved = await db.getSnapshotById(snapshot.id);
      
      expect(retrieved?.layers[0].objects).toBe(largeObjects);
    });

    test('should handle special characters in names', async () => {
      const branch: IBranch = {
        id: uuidv4(),
        projectId,
        name: 'feature/special-chars_test.v2',
        headSnapshotId: '',
        createdBy: userId,
        createdAt: Date.now(),
      };
      
      const saved = await db.saveBranch(branch);
      const retrieved = await db.getBranchById(branch.id);
      
      expect(retrieved?.name).toBe('feature/special-chars_test.v2');
    });

    test('should handle unicode in descriptions', async () => {
      const branch: IBranch = {
        id: uuidv4(),
        projectId,
        name: 'main',
        headSnapshotId: '',
        createdBy: userId,
        createdAt: Date.now(),
      };
      await db.saveBranch(branch);
      
      const snapshot: ISnapshot = {
        id: uuidv4(),
        projectId,
        branchId: branch.id,
        name: 'Unicode Test 🎨',
        description: 'Test with émojis 🖼️ and spëcial çharacters',
        layers: [],
        thumbnail: '',
        createdBy: userId,
        createdAt: Date.now(),
      };
      
      const saved = await db.saveSnapshot(snapshot);
      const retrieved = await db.getSnapshotById(snapshot.id);
      
      expect(retrieved?.name).toBe('Unicode Test 🎨');
      expect(retrieved?.description).toContain('émojis');
    });
  });
});
