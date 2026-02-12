/**
 * Integration Tests for Version Control REST API
 */

import express, { Express } from 'express';
import request from 'supertest';
import { VersionController } from '../controllers/version.controller';
import DAC, { IBranch, ISnapshot } from '../db/dac';
import { InMemoryDatabase } from '../db/inMemory.db';
import { randomUUID } from 'crypto';

// Set test environment
process.env.NODE_ENV = 'test';

const uuidv4 = () => randomUUID();

describe('VersionController - REST API', () => {
  let app: Express;
  let db: InMemoryDatabase;
  const projectId = 'test-project-api';
  const userId = 'test-user-api';

  beforeEach(() => {
    // Reset database for each test
    DAC.resetDb();
    db = new InMemoryDatabase();
    DAC.db = db;

    // Set up Express app with VersionController
    app = express();
    app.use(express.json());
    const versionController = new VersionController();
    app.use(versionController.path, versionController.router);
  });

  describe('GET /api/projects/:projectId/version', () => {
    test('should return version data with auto-created main branch', async () => {
      const response = await request(app)
        .get(`/api/projects/${projectId}/version`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.branches).toHaveLength(1);
      expect(response.body.data.branches[0].name).toBe('main');
      expect(response.body.data.snapshots).toHaveLength(0);
    });

    test('should return existing branches and snapshots', async () => {
      const branch: IBranch = {
        id: uuidv4(),
        projectId,
        name: 'main',
        headSnapshotId: '',
        createdBy: userId,
        createdAt: Date.now(),
        color: '#2b6cee',
      };
      await db.saveBranch(branch);

      const snapshot: ISnapshot = {
        id: uuidv4(),
        projectId,
        branchId: branch.id,
        name: 'Test Snapshot',
        layers: [],
        thumbnail: '',
        createdBy: userId,
        createdAt: Date.now(),
      };
      await db.saveSnapshot(snapshot);

      const response = await request(app)
        .get(`/api/projects/${projectId}/version`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.branches).toHaveLength(1);
      expect(response.body.data.snapshots).toHaveLength(1);
    });
  });

  describe('GET /api/projects/:projectId/branches', () => {
    test('should return empty array when no branches', async () => {
      const response = await request(app)
        .get(`/api/projects/${projectId}/branches`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(0);
    });

    test('should return all branches for project', async () => {
      const branch1: IBranch = {
        id: uuidv4(),
        projectId,
        name: 'main',
        headSnapshotId: '',
        createdBy: userId,
        createdAt: Date.now(),
      };
      const branch2: IBranch = {
        id: uuidv4(),
        projectId,
        name: 'feature',
        headSnapshotId: '',
        createdBy: userId,
        createdAt: Date.now(),
      };
      await db.saveBranch(branch1);
      await db.saveBranch(branch2);

      const response = await request(app)
        .get(`/api/projects/${projectId}/branches`)
        .expect(200);

      expect(response.body.data).toHaveLength(2);
    });
  });

  describe('GET /api/projects/:projectId/snapshots', () => {
    test('should return empty array when no snapshots', async () => {
      const response = await request(app)
        .get(`/api/projects/${projectId}/snapshots`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(0);
    });
  });

  describe('GET /api/projects/:projectId/snapshots/:snapshotId', () => {
    test('should return 404 for non-existent snapshot', async () => {
      const response = await request(app)
        .get(`/api/projects/${projectId}/snapshots/non-existent`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Snapshot not found');
    });

    test('should return snapshot by ID', async () => {
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
        name: 'Find Me',
        layers: [
          {
            layerId: uuidv4(),
            name: 'Layer 1',
            objects: '[]',
            visible: true,
            opacity: 1,
            blendMode: 'normal',
            zIndex: 0,
          },
        ],
        thumbnail: 'base64data',
        createdBy: userId,
        createdAt: Date.now(),
      };
      await db.saveSnapshot(snapshot);

      const response = await request(app)
        .get(`/api/projects/${projectId}/snapshots/${snapshot.id}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe('Find Me');
      expect(response.body.data.layers).toHaveLength(1);
    });
  });

  describe('POST /api/projects/:projectId/branches', () => {
    test('should create new branch', async () => {
      const response = await request(app)
        .post(`/api/projects/${projectId}/branches`)
        .send({ name: 'feature-branch', userId })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe('feature-branch');
      expect(response.body.data.projectId).toBe(projectId);
    });

    test('should return 400 when name is missing', async () => {
      const response = await request(app)
        .post(`/api/projects/${projectId}/branches`)
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Branch name is required');
    });

    test('should create branch from existing snapshot', async () => {
      const mainBranch: IBranch = {
        id: uuidv4(),
        projectId,
        name: 'main',
        headSnapshotId: '',
        createdBy: userId,
        createdAt: Date.now(),
      };
      await db.saveBranch(mainBranch);

      const snapshot: ISnapshot = {
        id: uuidv4(),
        projectId,
        branchId: mainBranch.id,
        name: 'Base',
        layers: [],
        thumbnail: '',
        createdBy: userId,
        createdAt: Date.now(),
      };
      await db.saveSnapshot(snapshot);

      const response = await request(app)
        .post(`/api/projects/${projectId}/branches`)
        .send({ name: 'from-snapshot', fromSnapshotId: snapshot.id })
        .expect(201);

      expect(response.body.data.headSnapshotId).toBe(snapshot.id);
    });

    test('should use custom color when provided', async () => {
      const response = await request(app)
        .post(`/api/projects/${projectId}/branches`)
        .send({ name: 'colored', color: '#ff0000' })
        .expect(201);

      expect(response.body.data.color).toBe('#ff0000');
    });
  });

  describe('POST /api/projects/:projectId/snapshots', () => {
    let branch: IBranch;

    beforeEach(async () => {
      branch = {
        id: uuidv4(),
        projectId,
        name: 'main',
        headSnapshotId: '',
        createdBy: userId,
        createdAt: Date.now(),
      };
      await db.saveBranch(branch);
    });

    test('should create new snapshot', async () => {
      const response = await request(app)
        .post(`/api/projects/${projectId}/snapshots`)
        .send({
          name: 'New Snapshot',
          branchId: branch.id,
          description: 'Test',
          userId,
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe('New Snapshot');
      expect(response.body.data.branchId).toBe(branch.id);
    });

    test('should return 400 when name missing', async () => {
      const response = await request(app)
        .post(`/api/projects/${projectId}/snapshots`)
        .send({ branchId: branch.id })
        .expect(400);

      expect(response.body.error).toBe('Snapshot name and branchId are required');
    });

    test('should return 400 when branchId missing', async () => {
      const response = await request(app)
        .post(`/api/projects/${projectId}/snapshots`)
        .send({ name: 'Test' })
        .expect(400);

      expect(response.body.error).toBe('Snapshot name and branchId are required');
    });

    test('should create snapshot with layers', async () => {
      const layers = [
        {
          layerId: uuidv4(),
          name: 'Background',
          objects: '[]',
          visible: true,
          opacity: 1,
          blendMode: 'normal',
          zIndex: 0,
        },
      ];

      const response = await request(app)
        .post(`/api/projects/${projectId}/snapshots`)
        .send({
          name: 'With Layers',
          branchId: branch.id,
          layers,
        })
        .expect(201);

      expect(response.body.data.layers).toHaveLength(1);
    });

    test('should set parent from branch head', async () => {
      const firstSnapshot: ISnapshot = {
        id: uuidv4(),
        projectId,
        branchId: branch.id,
        name: 'First',
        layers: [],
        thumbnail: '',
        createdBy: userId,
        createdAt: Date.now(),
      };
      await db.saveSnapshot(firstSnapshot);

      const response = await request(app)
        .post(`/api/projects/${projectId}/snapshots`)
        .send({ name: 'Second', branchId: branch.id })
        .expect(201);

      expect(response.body.data.parentSnapshotId).toBe(firstSnapshot.id);
    });
  });
});
