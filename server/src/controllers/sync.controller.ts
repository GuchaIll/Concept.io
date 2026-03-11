/**
 * SyncController — REST API for managing sync targets and triggering syncs.
 *
 * Routes (all under /api/projects/:projectId/sync):
 *   GET    /targets                   — list sync targets for project
 *   GET    /targets/:targetId         — get one target
 *   POST   /targets                   — create sync target
 *   PATCH  /targets/:targetId         — update sync target
 *   DELETE /targets/:targetId         — delete sync target
 *   POST   /targets/:targetId/sync    — manually trigger sync for one target
 *   POST   /sync-all                  — trigger sync to all enabled targets
 *   GET    /targets/:targetId/logs    — get sync logs for a target
 */

import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import Controller from './controller';
import DAC from '../db/dac';
import { encrypt } from '../services/crypto.service';
import { syncSnapshot, syncAllEnabled } from '../services/sync.service';
import type { ISyncTarget, GitSyncConfig, CreateSyncTargetPayload } from '../../../common/sync.interface';

const uuidv4 = () => randomUUID();

export class SyncController extends Controller {
  constructor() {
    super('/api/projects');

    this.listTargets = this.listTargets.bind(this);
    this.getTarget = this.getTarget.bind(this);
    this.createTarget = this.createTarget.bind(this);
    this.updateTarget = this.updateTarget.bind(this);
    this.deleteTarget = this.deleteTarget.bind(this);
    this.triggerSync = this.triggerSync.bind(this);
    this.triggerSyncAll = this.triggerSyncAll.bind(this);
    this.getLogs = this.getLogs.bind(this);
  }

  public initializeRoutes() {
    this.router.get('/:projectId/sync/targets', this.listTargets);
    this.router.get('/:projectId/sync/targets/:targetId', this.getTarget);
    this.router.post('/:projectId/sync/targets', this.createTarget);
    this.router.patch('/:projectId/sync/targets/:targetId', this.updateTarget);
    this.router.delete('/:projectId/sync/targets/:targetId', this.deleteTarget);
    this.router.post('/:projectId/sync/targets/:targetId/sync', this.triggerSync);
    this.router.post('/:projectId/sync/sync-all', this.triggerSyncAll);
    this.router.get('/:projectId/sync/targets/:targetId/logs', this.getLogs);
  }

  // ── List all sync targets for a project ──────────────

  private async listTargets(req: Request, res: Response) {
    try {
      const { projectId } = req.params;
      const targets = await DAC.db.getSyncTargetsByProject(projectId);
      // Strip encrypted tokens from response
      const sanitized = targets.map(stripSecrets);
      res.json({ success: true, data: sanitized });
    } catch (error: any) {
      console.error('Error listing sync targets:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // ── Get single target ────────────────────────────────

  private async getTarget(req: Request, res: Response) {
    try {
      const { targetId } = req.params;
      const target = await DAC.db.getSyncTargetById(targetId);
      if (!target) {
        res.status(404).json({ success: false, error: 'Sync target not found' });
        return;
      }
      res.json({ success: true, data: stripSecrets(target) });
    } catch (error: any) {
      console.error('Error getting sync target:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // ── Create sync target ───────────────────────────────

  private async createTarget(req: Request, res: Response) {
    try {
      const { projectId } = req.params;
      const body = req.body as CreateSyncTargetPayload & { userId?: string };

      if (!body.type || !body.name || !body.config) {
        res.status(400).json({ success: false, error: 'type, name, and config are required' });
        return;
      }

      // Encrypt token for git targets
      let config = { ...body.config };
      if (body.type === 'git' && body.token) {
        (config as GitSyncConfig).encryptedToken = encrypt(body.token);
      }

      const now = Date.now();
      const target: ISyncTarget = {
        id: uuidv4(),
        projectId,
        type: body.type,
        name: body.name,
        config,
        enabled: true,
        createdBy: body.userId ?? 'unknown',
        createdAt: now,
        updatedAt: now,
      };

      const saved = await DAC.db.saveSyncTarget(target);
      res.status(201).json({ success: true, data: stripSecrets(saved) });
    } catch (error: any) {
      console.error('Error creating sync target:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // ── Update sync target ───────────────────────────────

  private async updateTarget(req: Request, res: Response) {
    try {
      const { targetId } = req.params;
      const updates = req.body as Partial<ISyncTarget> & { token?: string };

      // Re-encrypt if a new token is provided
      if (updates.token && updates.config) {
        (updates.config as GitSyncConfig).encryptedToken = encrypt(updates.token);
        delete updates.token;
      }

      const updated = await DAC.db.updateSyncTarget(targetId, {
        ...updates,
        updatedAt: Date.now(),
      });

      if (!updated) {
        res.status(404).json({ success: false, error: 'Sync target not found' });
        return;
      }

      res.json({ success: true, data: stripSecrets(updated) });
    } catch (error: any) {
      console.error('Error updating sync target:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // ── Delete sync target ───────────────────────────────

  private async deleteTarget(req: Request, res: Response) {
    try {
      const { targetId } = req.params;
      await DAC.db.deleteSyncTarget(targetId);
      res.json({ success: true });
    } catch (error: any) {
      console.error('Error deleting sync target:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // ── Manually trigger sync for one target ─────────────

  private async triggerSync(req: Request, res: Response) {
    try {
      const { targetId } = req.params;
      const { snapshotId } = req.body as { snapshotId: string };

      if (!snapshotId) {
        res.status(400).json({ success: false, error: 'snapshotId is required' });
        return;
      }

      const log = await syncSnapshot(snapshotId, targetId);
      res.json({ success: true, data: log });
    } catch (error: any) {
      console.error('Error triggering sync:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // ── Trigger sync to all enabled targets ──────────────

  private async triggerSyncAll(req: Request, res: Response) {
    try {
      const { snapshotId } = req.body as { snapshotId: string };

      if (!snapshotId) {
        res.status(400).json({ success: false, error: 'snapshotId is required' });
        return;
      }

      const logs = await syncAllEnabled(snapshotId);
      res.json({ success: true, data: logs });
    } catch (error: any) {
      console.error('Error triggering sync-all:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // ── Get sync logs for a target ───────────────────────

  private async getLogs(req: Request, res: Response) {
    try {
      const { targetId } = req.params;
      const limit = parseInt(req.query.limit as string) || 50;
      const logs = await DAC.db.getSyncLogsByTarget(targetId, limit);
      res.json({ success: true, data: logs });
    } catch (error: any) {
      console.error('Error getting sync logs:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
}

// ── Helpers ──────────────────────────────────────────────

function stripSecrets(target: ISyncTarget): ISyncTarget {
  const cleaned = { ...target, config: { ...target.config } };
  if (target.type === 'git' && 'encryptedToken' in cleaned.config) {
    (cleaned.config as any).encryptedToken = '***';
  }
  return cleaned;
}
