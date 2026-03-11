/**
 * Integration Tests for Project CRUD REST API (WS5)
 * Tests multi-session project management endpoints.
 */

import express, { Express } from 'express';
import request from 'supertest';
import { ProjectController } from '../controllers/project.controller';
import { VersionController } from '../controllers/version.controller';
import DAC, { IProject } from '../db/dac';
import { InMemoryDatabase } from '../db/inMemory.db';
import { randomUUID } from 'crypto';

process.env.NODE_ENV = 'test';

const uuidv4 = () => randomUUID();

describe('ProjectController - REST API', () => {
  let app: Express;
  let db: InMemoryDatabase;
  const userId = 'test-user-projects';

  beforeEach(() => {
    DAC.resetDb();
    db = new InMemoryDatabase();
    DAC.db = db;

    app = express();
    app.use(express.json());
    const projectController = new ProjectController();
    const versionController = new VersionController();
    app.use(projectController.path, projectController.router);
    app.use(versionController.path, versionController.router);
  });

  // ── CREATE ────────────────────────────────────────────────────
  describe('POST /api/projects', () => {
    test('should create a project with auto-created main branch', async () => {
      const res = await request(app)
        .post('/api/projects')
        .send({ name: 'Test Project', description: 'A test', userId })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Test Project');
      expect(res.body.data.description).toBe('A test');
      expect(res.body.data.createdBy).toBe(userId);
      expect(res.body.data.canvasWidth).toBe(1920);
      expect(res.body.data.canvasHeight).toBe(1080);

      // Verify main branch was auto-created
      const branches = await db.getBranchesByProject(res.body.data.id);
      expect(branches).toHaveLength(1);
      expect(branches[0].name).toBe('main');
    });

    test('should reject creation without a name', async () => {
      await request(app)
        .post('/api/projects')
        .send({ description: 'no name' })
        .expect(400);
    });

    test('should use default values when optional fields omitted', async () => {
      const res = await request(app)
        .post('/api/projects')
        .send({ name: 'Minimal' })
        .expect(201);

      expect(res.body.data.createdBy).toBe('anonymous');
      expect(res.body.data.canvasWidth).toBe(1920);
      expect(res.body.data.canvasHeight).toBe(1080);
      expect(res.body.data.settings).toEqual({});
    });

    test('should accept custom canvas dimensions', async () => {
      const res = await request(app)
        .post('/api/projects')
        .send({ name: 'Custom', userId, canvasWidth: 4096, canvasHeight: 2160 })
        .expect(201);

      expect(res.body.data.canvasWidth).toBe(4096);
      expect(res.body.data.canvasHeight).toBe(2160);
    });
  });

  // ── LIST ──────────────────────────────────────────────────────
  describe('GET /api/projects', () => {
    test('should list all projects', async () => {
      await seedProject('Project A');
      await seedProject('Project B');

      const res = await request(app)
        .get('/api/projects')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(2);
    });

    test('should filter by userId query param', async () => {
      await seedProject('Mine', userId);
      await seedProject('Theirs', 'other-user');

      const res = await request(app)
        .get('/api/projects?userId=' + userId)
        .expect(200);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].name).toBe('Mine');
    });

    test('should return empty array when no projects exist', async () => {
      const res = await request(app)
        .get('/api/projects')
        .expect(200);

      expect(res.body.data).toEqual([]);
    });
  });

  // ── GET BY ID ─────────────────────────────────────────────────
  describe('GET /api/projects/:projectId', () => {
    test('should return a project by ID', async () => {
      const project = await seedProject('Lookup Test');

      const res = await request(app)
        .get(`/api/projects/${project.id}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Lookup Test');
    });

    test('should return 404 for unknown project', async () => {
      await request(app)
        .get('/api/projects/nonexistent-id')
        .expect(404);
    });
  });

  // ── UPDATE ────────────────────────────────────────────────────
  describe('PATCH /api/projects/:projectId', () => {
    test('should update project name', async () => {
      const project = await seedProject('Old Name');

      const res = await request(app)
        .patch(`/api/projects/${project.id}`)
        .send({ name: 'New Name' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('New Name');
    });

    test('should update description only', async () => {
      const project = await seedProject('Keep Name');

      const res = await request(app)
        .patch(`/api/projects/${project.id}`)
        .send({ description: 'Updated description' })
        .expect(200);

      expect(res.body.data.name).toBe('Keep Name');
      expect(res.body.data.description).toBe('Updated description');
    });

    test('should return 404 when updating non-existent project', async () => {
      await request(app)
        .patch('/api/projects/does-not-exist')
        .send({ name: 'X' })
        .expect(404);
    });
  });

  // ── DELETE ────────────────────────────────────────────────────
  describe('DELETE /api/projects/:projectId', () => {
    test('should delete a project', async () => {
      const project = await seedProject('To Be Deleted');

      await request(app)
        .delete(`/api/projects/${project.id}`)
        .expect(200);

      // Verify it's gone
      const res = await request(app)
        .get(`/api/projects/${project.id}`)
        .expect(404);

      expect(res.body.success).toBe(false);
    });

    test('should cascade-delete branches and snapshots', async () => {
      const project = await seedProject('Cascade Test');

      // Add a branch and snapshot
      const branchId = uuidv4();
      await db.saveBranch({
        id: branchId,
        projectId: project.id,
        name: 'feature',
        headSnapshotId: '',
        createdBy: userId,
        createdAt: Date.now(),
        color: '#ff0000',
      });
      await db.saveSnapshot({
        id: uuidv4(),
        projectId: project.id,
        branchId,
        name: 'snap',
        layers: [],
        createdBy: userId,
        createdAt: Date.now(),
        parentSnapshotId: undefined,
        thumbnail: '',
      });

      await request(app)
        .delete(`/api/projects/${project.id}`)
        .expect(200);

      // Verify branches cleaned up
      const branches = await db.getBranchesByProject(project.id);
      expect(branches).toHaveLength(0);

      // Verify snapshots cleaned up
      const snapshots = await db.getSnapshotsByProject(project.id);
      expect(snapshots).toHaveLength(0);
    });

    test('should return 404 for unknown project', async () => {
      await request(app)
        .delete('/api/projects/nonexistent')
        .expect(404);
    });
  });

  // ── Cross-concern: version data isolation ─────────────────────
  describe('Project data isolation', () => {
    test('version data from different projects should not mix', async () => {
      // Use the POST endpoint so both projects get auto-created main branches
      const r1 = await request(app)
        .post('/api/projects')
        .send({ name: 'Alpha', userId })
        .expect(201);
      const p1Id = r1.body.data.id;

      const r2 = await request(app)
        .post('/api/projects')
        .send({ name: 'Beta', userId })
        .expect(201);
      const p2Id = r2.body.data.id;

      // Create an extra branch in project 1 only
      await db.saveBranch({
        id: uuidv4(),
        projectId: p1Id,
        name: 'feature-1',
        headSnapshotId: '',
        createdBy: userId,
        createdAt: Date.now(),
        color: '#aaa',
      });

      // Project 1 should have main + feature-1
      const b1 = await db.getBranchesByProject(p1Id);
      expect(b1).toHaveLength(2);

      // Project 2 should only have main
      const b2 = await db.getBranchesByProject(p2Id);
      expect(b2).toHaveLength(1);
      expect(b2[0].name).toBe('main');
    });
  });

  // ── Helper ────────────────────────────────────────────────────
  async function seedProject(name: string, creator?: string): Promise<IProject> {
    const now = Date.now();
    const project: IProject = {
      id: uuidv4(),
      name,
      createdBy: creator || userId,
      createdAt: now,
      updatedAt: now,
      canvasWidth: 1920,
      canvasHeight: 1080,
      settings: {},
    };
    return db.saveProject(project);
  }
});
