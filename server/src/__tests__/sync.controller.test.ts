/**
 * Integration Tests for Sync Controller REST API
 *
 * Uses InMemoryDatabase + mocked sync service so tests run fast
 * without real file I/O or Git calls.
 *
 * Run:  cd server && npx jest --testPathPattern=sync.controller --verbose
 */

import express, { Express } from 'express';
import request from 'supertest';
import { SyncController } from '../controllers/sync.controller';
import { ProjectController } from '../controllers/project.controller';
import { VersionController } from '../controllers/version.controller';
import DAC, { ISnapshot, IBranch } from '../db/dac';
import { InMemoryDatabase } from '../db/inMemory.db';
import { randomUUID } from 'crypto';
import type { ISyncTarget, ISyncLog } from '../../../common/sync.interface';

// ── Mock sync service so we never hit real export / fs / git ──

jest.mock('../services/sync.service', () => ({
  syncSnapshot: jest.fn(),
  syncAllEnabled: jest.fn(),
}));

import { syncSnapshot, syncAllEnabled } from '../services/sync.service';
const mockSyncSnapshot = syncSnapshot as jest.MockedFunction<typeof syncSnapshot>;
const mockSyncAllEnabled = syncAllEnabled as jest.MockedFunction<typeof syncAllEnabled>;

process.env.NODE_ENV = 'test';

const uuidv4 = () => randomUUID();

// ── Test Suite ─────────────────────────────────────────────

describe('SyncController — REST API', () => {
  let app: Express;
  let db: InMemoryDatabase;

  // Reusable IDs
  const projectId = uuidv4();
  const userId = 'test-user-sync';
  let branchId: string;
  let snapshotId: string;

  // Helpers ──────────────────────────────────────────────────

  async function seedProject(): Promise<void> {
    await db.saveProject({
      id: projectId,
      name: 'Sync Test Project',
      description: '',
      createdBy: userId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      canvasWidth: 1920,
      canvasHeight: 1080,
      settings: {},
    });
  }

  async function seedBranchAndSnapshot(): Promise<void> {
    branchId = uuidv4();
    snapshotId = uuidv4();

    await db.saveBranch({
      id: branchId,
      projectId,
      name: 'main',
      headSnapshotId: '',
      createdBy: userId,
      createdAt: Date.now(),
      color: '#2b6cee',
    });

    await db.saveSnapshot({
      id: snapshotId,
      projectId,
      branchId,
      name: 'v1',
      layers: [
        {
          layerId: 'layer-1',
          name: 'Background',
          type: 'full',
          objects: '[]',
          visible: true,
          opacity: 1,
          blendMode: 'normal',
          zIndex: 0,
        },
      ],
      thumbnail: '',
      createdBy: userId,
      createdAt: Date.now(),
    });
  }

  async function createTarget(
    overrides: Partial<{ type: string; name: string; config: any; enabled: boolean }> = {},
  ) {
    const res = await request(app)
      .post(`/api/projects/${projectId}/sync/targets`)
      .send({
        type: 'local',
        name: 'Test Export',
        config: { folderPath: 'C:/tmp/sync-test' },
        userId,
        ...overrides,
      })
      .expect(201);
    return res.body.data as ISyncTarget;
  }

  function buildMockLog(
    targetId: string,
    snapId: string,
    status: 'success' | 'failed' = 'success',
  ): ISyncLog {
    return {
      id: uuidv4(),
      syncTargetId: targetId,
      snapshotId: snapId,
      status,
      message: status === 'success' ? 'Synced 3 file(s)' : 'Something went wrong',
      details: status === 'success' ? { files: ['a.png', 'b.png', 'metadata.json'], durationMs: 5 } : undefined,
      startedAt: Date.now(),
      completedAt: Date.now(),
      durationMs: 5,
    };
  }

  // Setup ────────────────────────────────────────────────────

  beforeEach(async () => {
    DAC.resetDb();
    db = new InMemoryDatabase();
    DAC.db = db;

    app = express();
    app.use(express.json());

    const syncCtrl = new SyncController();
    const projectCtrl = new ProjectController();
    const versionCtrl = new VersionController();

    app.use(syncCtrl.path, syncCtrl.router);
    app.use(projectCtrl.path, projectCtrl.router);
    app.use(versionCtrl.path, versionCtrl.router);

    await seedProject();
    await seedBranchAndSnapshot();

    jest.clearAllMocks();
  });

  // ═══════════════════════════════════════════════════════════
  //  C1  —  POST /targets  (Create)
  // ═══════════════════════════════════════════════════════════

  describe('POST /api/projects/:projectId/sync/targets', () => {
    test('should create a local sync target with defaults', async () => {
      const res = await request(app)
        .post(`/api/projects/${projectId}/sync/targets`)
        .send({
          type: 'local',
          name: 'My Local Folder',
          config: { folderPath: '/exports/art' },
          userId,
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      const t = res.body.data;
      expect(t.id).toBeDefined();
      expect(t.projectId).toBe(projectId);
      expect(t.type).toBe('local');
      expect(t.name).toBe('My Local Folder');
      expect(t.config.folderPath).toBe('/exports/art');
      expect(t.enabled).toBe(true);
      expect(t.createdBy).toBe(userId);
      expect(t.createdAt).toBeDefined();
      expect(t.updatedAt).toBeDefined();
    });

    test('should create a git sync target and mask the token', async () => {
      const res = await request(app)
        .post(`/api/projects/${projectId}/sync/targets`)
        .send({
          type: 'git',
          name: 'GitHub Art Repo',
          config: {
            repoUrl: 'https://github.com/user/repo',
            branch: 'main',
            path: 'art/concepts',
            provider: 'github',
          },
          token: 'ghp_secret123',
          userId,
        })
        .expect(201);

      const t = res.body.data;
      expect(t.type).toBe('git');
      // Token must be masked in response
      expect(t.config.encryptedToken).toBe('***');
    });

    test('should reject missing required fields', async () => {
      const res = await request(app)
        .post(`/api/projects/${projectId}/sync/targets`)
        .send({ type: 'local' })
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/type, name, and config are required/);
    });

    test('should reject completely empty body', async () => {
      await request(app)
        .post(`/api/projects/${projectId}/sync/targets`)
        .send({})
        .expect(400);
    });
  });

  // ═══════════════════════════════════════════════════════════
  //  C2  —  GET /targets  (List)
  // ═══════════════════════════════════════════════════════════

  describe('GET /api/projects/:projectId/sync/targets', () => {
    test('should return empty array when no targets', async () => {
      const res = await request(app)
        .get(`/api/projects/${projectId}/sync/targets`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual([]);
    });

    test('should list all targets for the project', async () => {
      await createTarget({ name: 'Target A' });
      await createTarget({ name: 'Target B' });

      const res = await request(app)
        .get(`/api/projects/${projectId}/sync/targets`)
        .expect(200);

      expect(res.body.data).toHaveLength(2);
      const names = res.body.data.map((t: any) => t.name);
      expect(names).toContain('Target A');
      expect(names).toContain('Target B');
    });

    test('should not leak targets from other projects', async () => {
      await createTarget({ name: 'Mine' });

      // Insert a target for a different project directly
      await db.saveSyncTarget({
        id: uuidv4(),
        projectId: uuidv4(), // different project
        type: 'local',
        name: 'Not Mine',
        config: { folderPath: '/other' },
        enabled: true,
        createdBy: 'other-user',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      const res = await request(app)
        .get(`/api/projects/${projectId}/sync/targets`)
        .expect(200);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].name).toBe('Mine');
    });
  });

  // ═══════════════════════════════════════════════════════════
  //  C2b  —  GET /targets/:targetId  (Get Single)
  // ═══════════════════════════════════════════════════════════

  describe('GET /api/projects/:projectId/sync/targets/:targetId', () => {
    test('should return a single target by ID', async () => {
      const target = await createTarget({ name: 'Solo' });

      const res = await request(app)
        .get(`/api/projects/${projectId}/sync/targets/${target.id}`)
        .expect(200);

      expect(res.body.data.id).toBe(target.id);
      expect(res.body.data.name).toBe('Solo');
    });

    test('should return 404 for non-existent target', async () => {
      const res = await request(app)
        .get(`/api/projects/${projectId}/sync/targets/${uuidv4()}`)
        .expect(404);

      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/not found/i);
    });
  });

  // ═══════════════════════════════════════════════════════════
  //  C3  —  PATCH /targets/:targetId  (Toggle / Update)
  // ═══════════════════════════════════════════════════════════

  describe('PATCH /api/projects/:projectId/sync/targets/:targetId', () => {
    test('should disable a target (enabled → false)', async () => {
      const target = await createTarget();

      const res = await request(app)
        .patch(`/api/projects/${projectId}/sync/targets/${target.id}`)
        .send({ enabled: false })
        .expect(200);

      expect(res.body.data.enabled).toBe(false);
      expect(res.body.data.updatedAt).toBeGreaterThanOrEqual(target.updatedAt);
    });

    test('should re-enable a target', async () => {
      const target = await createTarget();
      // Disable first
      await request(app)
        .patch(`/api/projects/${projectId}/sync/targets/${target.id}`)
        .send({ enabled: false });

      // Re-enable
      const res = await request(app)
        .patch(`/api/projects/${projectId}/sync/targets/${target.id}`)
        .send({ enabled: true })
        .expect(200);

      expect(res.body.data.enabled).toBe(true);
    });

    test('should update name and config', async () => {
      const target = await createTarget();

      const res = await request(app)
        .patch(`/api/projects/${projectId}/sync/targets/${target.id}`)
        .send({ name: 'Renamed', config: { folderPath: '/new/path' } })
        .expect(200);

      expect(res.body.data.name).toBe('Renamed');
      expect(res.body.data.config.folderPath).toBe('/new/path');
    });

    test('should re-encrypt token when updated on git target', async () => {
      const target = await createTarget({
        type: 'git',
        name: 'Git Target',
        config: {
          repoUrl: 'https://github.com/u/r',
          branch: 'main',
          path: 'art',
          provider: 'github',
        },
      });

      const res = await request(app)
        .patch(`/api/projects/${projectId}/sync/targets/${target.id}`)
        .send({
          token: 'ghp_newtoken456',
          config: {
            repoUrl: 'https://github.com/u/r',
            branch: 'main',
            path: 'art',
            provider: 'github',
          },
        })
        .expect(200);

      // Token must be masked in response
      expect(res.body.data.config.encryptedToken).toBe('***');

      // But the DB should have a real encrypted value
      const raw = await db.getSyncTargetById(target.id);
      expect((raw!.config as any).encryptedToken).not.toBe('***');
      expect((raw!.config as any).encryptedToken).toContain(':'); // AES-GCM format iv:ct:tag
    });

    test('should return 404 for non-existent target', async () => {
      const res = await request(app)
        .patch(`/api/projects/${projectId}/sync/targets/${uuidv4()}`)
        .send({ name: 'Ghost' })
        .expect(404);

      expect(res.body.success).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════
  //  C4  —  POST /targets/:targetId/sync  (Manual Trigger)
  // ═══════════════════════════════════════════════════════════

  describe('POST /api/projects/:projectId/sync/targets/:targetId/sync', () => {
    test('should trigger sync and return log entry', async () => {
      const target = await createTarget();
      const mockLog = buildMockLog(target.id, snapshotId);
      mockSyncSnapshot.mockResolvedValueOnce(mockLog);

      const res = await request(app)
        .post(`/api/projects/${projectId}/sync/targets/${target.id}/sync`)
        .send({ snapshotId })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('success');
      expect(res.body.data.syncTargetId).toBe(target.id);
      expect(res.body.data.snapshotId).toBe(snapshotId);
      expect(mockSyncSnapshot).toHaveBeenCalledWith(snapshotId, target.id);
    });

    test('should return 400 when snapshotId is missing', async () => {
      const target = await createTarget();

      const res = await request(app)
        .post(`/api/projects/${projectId}/sync/targets/${target.id}/sync`)
        .send({})
        .expect(400);

      expect(res.body.error).toMatch(/snapshotId is required/);
    });

    test('should return 404 when snapshot does not exist', async () => {
      const target = await createTarget();
      mockSyncSnapshot.mockRejectedValueOnce(new Error('Snapshot fake-id not found'));

      const res = await request(app)
        .post(`/api/projects/${projectId}/sync/targets/${target.id}/sync`)
        .send({ snapshotId: 'fake-id' })
        .expect(404);

      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/not found/);
    });

    test('should return 404 when target does not exist', async () => {
      mockSyncSnapshot.mockRejectedValueOnce(
        new Error(`Sync target ${uuidv4()} not found`),
      );

      const res = await request(app)
        .post(`/api/projects/${projectId}/sync/targets/${uuidv4()}/sync`)
        .send({ snapshotId })
        .expect(404);

      expect(res.body.success).toBe(false);
    });

    test('should return 409 when target is disabled', async () => {
      const target = await createTarget();
      // Disable it
      await request(app)
        .patch(`/api/projects/${projectId}/sync/targets/${target.id}`)
        .send({ enabled: false });

      mockSyncSnapshot.mockRejectedValueOnce(
        new Error(`Sync target ${target.id} is disabled`),
      );

      const res = await request(app)
        .post(`/api/projects/${projectId}/sync/targets/${target.id}/sync`)
        .send({ snapshotId })
        .expect(409);

      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/is disabled/);
    });
  });

  // ═══════════════════════════════════════════════════════════
  //  C4b  —  POST /sync-all  (Sync all enabled)
  // ═══════════════════════════════════════════════════════════

  describe('POST /api/projects/:projectId/sync/sync-all', () => {
    test('should sync all enabled targets and return logs', async () => {
      const target1 = await createTarget({ name: 'A' });
      const target2 = await createTarget({ name: 'B' });

      mockSyncAllEnabled.mockResolvedValueOnce([
        buildMockLog(target1.id, snapshotId),
        buildMockLog(target2.id, snapshotId),
      ]);

      const res = await request(app)
        .post(`/api/projects/${projectId}/sync/sync-all`)
        .send({ snapshotId })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(2);
      expect(mockSyncAllEnabled).toHaveBeenCalledWith(snapshotId);
    });

    test('should return 400 when snapshotId is missing', async () => {
      const res = await request(app)
        .post(`/api/projects/${projectId}/sync/sync-all`)
        .send({})
        .expect(400);

      expect(res.body.error).toMatch(/snapshotId is required/);
    });

    test('should return 404 when snapshot does not exist', async () => {
      mockSyncAllEnabled.mockRejectedValueOnce(
        new Error('Snapshot missing-id not found'),
      );

      const res = await request(app)
        .post(`/api/projects/${projectId}/sync/sync-all`)
        .send({ snapshotId: 'missing-id' })
        .expect(404);

      expect(res.body.success).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════
  //  C5  —  GET /targets/:targetId/logs
  // ═══════════════════════════════════════════════════════════

  describe('GET /api/projects/:projectId/sync/targets/:targetId/logs', () => {
    test('should return empty array when no logs', async () => {
      const target = await createTarget();

      const res = await request(app)
        .get(`/api/projects/${projectId}/sync/targets/${target.id}/logs`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual([]);
    });

    test('should return logs sorted newest-first', async () => {
      const target = await createTarget();

      // Seed logs directly via DB
      const log1: ISyncLog = {
        id: uuidv4(),
        syncTargetId: target.id,
        snapshotId,
        status: 'success',
        message: 'First sync',
        startedAt: Date.now() - 5000,
        completedAt: Date.now() - 4990,
        durationMs: 10,
      };
      const log2: ISyncLog = {
        id: uuidv4(),
        syncTargetId: target.id,
        snapshotId,
        status: 'failed',
        message: 'Second sync failed',
        startedAt: Date.now(),
        completedAt: Date.now(),
        durationMs: 2,
      };

      await db.saveSyncLog(log1);
      await db.saveSyncLog(log2);

      const res = await request(app)
        .get(`/api/projects/${projectId}/sync/targets/${target.id}/logs`)
        .expect(200);

      expect(res.body.data).toHaveLength(2);
      // Newest first
      expect(res.body.data[0].message).toBe('Second sync failed');
      expect(res.body.data[1].message).toBe('First sync');
    });

    test('should respect the ?limit query parameter', async () => {
      const target = await createTarget();

      // Seed 5 logs
      for (let i = 0; i < 5; i++) {
        await db.saveSyncLog({
          id: uuidv4(),
          syncTargetId: target.id,
          snapshotId,
          status: 'success',
          message: `Sync #${i}`,
          startedAt: Date.now() + i,
        });
      }

      const res = await request(app)
        .get(`/api/projects/${projectId}/sync/targets/${target.id}/logs?limit=2`)
        .expect(200);

      expect(res.body.data).toHaveLength(2);
    });
  });

  // ═══════════════════════════════════════════════════════════
  //  C6  —  DELETE /targets/:targetId
  // ═══════════════════════════════════════════════════════════

  describe('DELETE /api/projects/:projectId/sync/targets/:targetId', () => {
    test('should delete a target and confirm it is gone', async () => {
      const target = await createTarget();

      await request(app)
        .delete(`/api/projects/${projectId}/sync/targets/${target.id}`)
        .expect(200);

      // Verify gone
      const res = await request(app)
        .get(`/api/projects/${projectId}/sync/targets/${target.id}`)
        .expect(404);

      expect(res.body.success).toBe(false);
    });

    test('should also remove associated sync logs', async () => {
      const target = await createTarget();

      // Seed a log
      await db.saveSyncLog({
        id: uuidv4(),
        syncTargetId: target.id,
        snapshotId,
        status: 'success',
        message: 'some log',
        startedAt: Date.now(),
      });

      // Delete target
      await request(app)
        .delete(`/api/projects/${projectId}/sync/targets/${target.id}`)
        .expect(200);

      // Logs should be gone too
      const logs = await db.getSyncLogsByTarget(target.id);
      expect(logs).toHaveLength(0);
    });

    test('should succeed silently for non-existent target (idempotent)', async () => {
      // DELETE of a non-existent ID should not throw
      await request(app)
        .delete(`/api/projects/${projectId}/sync/targets/${uuidv4()}`)
        .expect(200);
    });
  });

  // ═══════════════════════════════════════════════════════════
  //  C7  —  Persistence  (In-Memory DB round-trip)
  // ═══════════════════════════════════════════════════════════

  describe('Data Persistence (round-trip)', () => {
    test('created target is retrievable by GET', async () => {
      const target = await createTarget({ name: 'Persist Me' });

      const res = await request(app)
        .get(`/api/projects/${projectId}/sync/targets/${target.id}`)
        .expect(200);

      expect(res.body.data.name).toBe('Persist Me');
    });

    test('updates are persisted across requests', async () => {
      const target = await createTarget();

      await request(app)
        .patch(`/api/projects/${projectId}/sync/targets/${target.id}`)
        .send({ name: 'Updated Name' })
        .expect(200);

      const res = await request(app)
        .get(`/api/projects/${projectId}/sync/targets/${target.id}`)
        .expect(200);

      expect(res.body.data.name).toBe('Updated Name');
    });

    test('multiple targets coexist', async () => {
      await createTarget({ name: 'One' });
      await createTarget({ name: 'Two' });
      await createTarget({ name: 'Three' });

      const res = await request(app)
        .get(`/api/projects/${projectId}/sync/targets`)
        .expect(200);

      expect(res.body.data).toHaveLength(3);
    });
  });

  // ═══════════════════════════════════════════════════════════
  //  G  —  Error / Edge Cases
  // ═══════════════════════════════════════════════════════════

  describe('Error & Edge Cases', () => {
    test('sync-all returns empty array when no enabled targets', async () => {
      mockSyncAllEnabled.mockResolvedValueOnce([]);

      const res = await request(app)
        .post(`/api/projects/${projectId}/sync/sync-all`)
        .send({ snapshotId })
        .expect(200);

      expect(res.body.data).toEqual([]);
    });

    test('GET logs for non-existent target returns empty array', async () => {
      const res = await request(app)
        .get(`/api/projects/${projectId}/sync/targets/${uuidv4()}/logs`)
        .expect(200);

      // Logs endpoint returns empty, not 404 (target-agnostic query)
      expect(res.body.data).toEqual([]);
    });

    test('create target with unknown type is allowed (validated downstream)', async () => {
      // Controller only checks type/name/config presence, not values
      const res = await request(app)
        .post(`/api/projects/${projectId}/sync/targets`)
        .send({
          type: 'ftp',
          name: 'FTP Backup',
          config: { host: 'ftp.example.com' },
          userId,
        })
        .expect(201);

      expect(res.body.data.type).toBe('ftp');
    });

    test('PATCH with empty body still updates updatedAt', async () => {
      const target = await createTarget();

      // Small delay so updatedAt differs
      await new Promise((r) => setTimeout(r, 10));

      const res = await request(app)
        .patch(`/api/projects/${projectId}/sync/targets/${target.id}`)
        .send({})
        .expect(200);

      expect(res.body.data.updatedAt).toBeGreaterThanOrEqual(target.updatedAt);
    });

    test('sync failure is returned as log with status failed', async () => {
      const target = await createTarget();
      const failLog = buildMockLog(target.id, snapshotId, 'failed');
      mockSyncSnapshot.mockResolvedValueOnce(failLog);

      const res = await request(app)
        .post(`/api/projects/${projectId}/sync/targets/${target.id}/sync`)
        .send({ snapshotId })
        .expect(200);

      // 200 because the sync service handled the error and returned a log
      expect(res.body.data.status).toBe('failed');
    });
  });
});
