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
import fs from 'fs/promises';
import path from 'path';
import Controller from './controller';
import DAC from '../db/dac';
import { encrypt } from '../services/crypto.service';
import { syncSnapshot, syncAllEnabled } from '../services/sync.service';
import type { ISyncTarget, GitSyncConfig, CreateSyncTargetPayload, SyncFileNode, LocalSyncConfig } from '../../../common/sync.interface';

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
    this.getFiles = this.getFiles.bind(this);
    this.deleteFile = this.deleteFile.bind(this);
    this.linkFile = this.linkFile.bind(this);
    this.mkdirFile = this.mkdirFile.bind(this);
    this.renameAcrossTargets = this.renameAcrossTargets.bind(this);
    this.moveFile = this.moveFile.bind(this);
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
    // File browser endpoints (local targets only)
    this.router.get('/:projectId/sync/targets/:targetId/files', this.getFiles);
    this.router.delete('/:projectId/sync/targets/:targetId/files', this.deleteFile);
    this.router.post('/:projectId/sync/targets/:targetId/files/link', this.linkFile);
    this.router.post('/:projectId/sync/targets/:targetId/files/mkdir', this.mkdirFile);
    this.router.post('/:projectId/sync/targets/:targetId/files/move', this.moveFile);
    this.router.post('/:projectId/sync/files/rename', this.renameAcrossTargets);
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
      if (log.status === 'failed') {
        res.status(500).json({ success: false, error: log.message ?? 'Sync failed' });
        return;
      }
      res.json({ success: true, data: log });
    } catch (error: any) {
      console.error('Error triggering sync:', error);
      const status = mapSyncErrorStatus(error);
      res.status(status).json({ success: false, error: error.message });
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
      const allFailed = logs.length > 0 && logs.every(l => l.status === 'failed');
      if (allFailed) {
        res.status(500).json({ success: false, error: logs[0]?.message ?? 'All syncs failed', data: logs });
        return;
      }
      res.json({ success: true, data: logs });
    } catch (error: any) {
      console.error('Error triggering sync-all:', error);
      const status = mapSyncErrorStatus(error);
      res.status(status).json({ success: false, error: error.message });
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

  // ── List files in a local sync target folder ──────────

  private async getFiles(req: Request, res: Response) {
    try {
      const { targetId } = req.params;
      const target = await DAC.db.getSyncTargetById(targetId);
      if (!target) {
        res.status(404).json({ success: false, error: 'Sync target not found' });
        return;
      }
      if (target.type !== 'local') {
        res.status(400).json({ success: false, error: 'File browser only available for local targets' });
        return;
      }
      const { folderPath } = target.config as LocalSyncConfig;
      if (!folderPath) {
        res.status(400).json({ success: false, error: 'No folderPath configured' });
        return;
      }

      const tree = await buildFileTree(folderPath, folderPath);
      res.json({ success: true, data: tree });
    } catch (error: any) {
      console.error('Error listing files:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // ── Delete a file or folder within the sync target ────

  private async deleteFile(req: Request, res: Response) {
    try {
      const { targetId } = req.params;
      const { filePath } = req.body as { filePath: string };

      if (!filePath) {
        res.status(400).json({ success: false, error: 'filePath is required' });
        return;
      }

      const target = await DAC.db.getSyncTargetById(targetId);
      if (!target) {
        res.status(404).json({ success: false, error: 'Sync target not found' });
        return;
      }
      if (target.type !== 'local') {
        res.status(400).json({ success: false, error: 'File deletion only available for local targets' });
        return;
      }

      const { folderPath } = target.config as LocalSyncConfig;
      const absPath = path.join(folderPath, filePath);

      // Security: ensure the resolved path stays within the base folder
      if (!isWithinBase(absPath, folderPath)) {
        res.status(400).json({ success: false, error: 'Path escapes the sync target folder' });
        return;
      }

      await fs.rm(absPath, { recursive: true, force: true });
      res.json({ success: true });
    } catch (error: any) {
      console.error('Error deleting file:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // ── Link current canvas snapshot to a folder path ─────

  private async linkFile(req: Request, res: Response) {
    try {
      const { targetId } = req.params;
      const { snapshotId, filePath, fileName } = req.body as {
        snapshotId: string;
        filePath?: string;  // Target path (directory or full file path)
        fileName?: string;  // Custom file name (without extension)
      };

      if (!snapshotId) {
        res.status(400).json({ success: false, error: 'snapshotId is required' });
        return;
      }

      // Sync with optional custom path/name
      const log = await syncSnapshot(snapshotId, targetId, undefined, {
        targetPath: filePath,
        fileName,
      });
      if (log.status === 'failed') {
        res.status(500).json({ success: false, error: log.message ?? 'Sync failed' });
        return;
      }
      res.json({ success: true, data: log });
    } catch (error: any) {
      console.error('Error linking file:', error);
      const status = mapSyncErrorStatus(error);
      res.status(status).json({ success: false, error: error.message });
    }
  }

  // ── Create a new directory inside a local sync target ──

  private async mkdirFile(req: Request, res: Response) {
    try {
      const { targetId } = req.params;
      const { dirPath } = req.body as { dirPath: string };

      if (!dirPath) {
        res.status(400).json({ success: false, error: 'dirPath is required' });
        return;
      }

      const target = await DAC.db.getSyncTargetById(targetId);
      if (!target) {
        res.status(404).json({ success: false, error: 'Sync target not found' });
        return;
      }
      if (target.type !== 'local') {
        res.status(400).json({ success: false, error: 'mkdir only available for local targets' });
        return;
      }

      const { folderPath } = target.config as LocalSyncConfig;
      const absPath = path.join(folderPath, dirPath);

      if (!isWithinBase(absPath, folderPath)) {
        res.status(400).json({ success: false, error: 'Path escapes the sync target folder' });
        return;
      }

      await fs.mkdir(absPath, { recursive: true });
      res.json({ success: true });
    } catch (error: any) {
      console.error('Error creating directory:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // ── Rename a file/folder across all local targets for the project ──

  private async renameAcrossTargets(req: Request, res: Response) {
    try {
      const { projectId } = req.params;
      const { oldPath, newName } = req.body as { oldPath: string; newName: string };

      if (!oldPath || !newName) {
        res.status(400).json({ success: false, error: 'oldPath and newName are required' });
        return;
      }

      const targets = await DAC.db.getSyncTargetsByProject(projectId);
      const localTargets = targets.filter(t => t.type === 'local');

      const results: { targetId: string; renamed: boolean }[] = [];

      for (const target of localTargets) {
        const { folderPath } = target.config as LocalSyncConfig;
        const absOld = path.join(folderPath, oldPath);

        if (!isWithinBase(absOld, folderPath)) continue;

        try {
          await fs.access(absOld);
          const newBase = path.join(path.dirname(absOld), newName);
          if (!isWithinBase(newBase, folderPath)) continue;
          await fs.rename(absOld, newBase);
          results.push({ targetId: target.id, renamed: true });
        } catch {
          results.push({ targetId: target.id, renamed: false });
        }
      }

      res.json({ success: true, data: results });
    } catch (error: any) {
      console.error('Error renaming across targets:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // ── Move a file or folder within a local sync target ──

  private async moveFile(req: Request, res: Response) {
    try {
      const { targetId } = req.params;
      const { sourcePath, destPath } = req.body as { sourcePath: string; destPath: string };

      if (!sourcePath || !destPath) {
        res.status(400).json({ success: false, error: 'sourcePath and destPath are required' });
        return;
      }

      const target = await DAC.db.getSyncTargetById(targetId);
      if (!target) {
        res.status(404).json({ success: false, error: 'Sync target not found' });
        return;
      }
      if (target.type !== 'local') {
        res.status(400).json({ success: false, error: 'Move only available for local targets' });
        return;
      }

      const { folderPath } = target.config as LocalSyncConfig;
      const absSrc = path.join(folderPath, sourcePath);
      const absDest = path.join(folderPath, destPath);

      // Security: ensure both paths stay within the base folder
      if (!isWithinBase(absSrc, folderPath) || !isWithinBase(absDest, folderPath)) {
        res.status(400).json({ success: false, error: 'Path escapes the sync target folder' });
        return;
      }

      // Check if dest is a directory — if so, move source into it
      let finalDest = absDest;
      try {
        const destStat = await fs.stat(absDest);
        if (destStat.isDirectory()) {
          finalDest = path.join(absDest, path.basename(absSrc));
        }
      } catch {
        // Dest doesn't exist, use as-is (could be a rename operation)
      }

      // Ensure parent directory of finalDest exists
      await fs.mkdir(path.dirname(finalDest), { recursive: true });

      await fs.rename(absSrc, finalDest);

      const newRelPath = path.relative(folderPath, finalDest).replace(/\\/g, '/');
      res.json({ success: true, data: { newPath: newRelPath } });
    } catch (error: any) {
      console.error('Error moving file:', error);
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

/**
 * Map known sync-service error messages to proper HTTP status codes.
 */
function mapSyncErrorStatus(error: any): number {
  const msg: string = error?.message ?? '';
  if (msg.includes('not found'))  return 404;
  if (msg.includes('is disabled')) return 409;
  return 500;
}

/**
 * Build a recursive file-tree for the given directory.
 * `basePath` is used to compute relative paths for each node.
 */
async function buildFileTree(dirPath: string, basePath: string): Promise<SyncFileNode[]> {
  let entries;
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }

  const nodes: SyncFileNode[] = [];

  for (const entry of entries) {
    const absEntryPath = path.join(dirPath, entry.name);
    const relEntryPath = path.relative(basePath, absEntryPath).replace(/\\/g, '/');

    if (entry.isDirectory()) {
      const children = await buildFileTree(absEntryPath, basePath);

      // Check for a metadata.json inside this directory to get the linked snapshot ID
      let linkedSnapshotId: string | undefined;
      try {
        const metaRaw = await fs.readFile(path.join(absEntryPath, 'metadata.json'), 'utf-8');
        const meta = JSON.parse(metaRaw);
        linkedSnapshotId = meta.snapshotId;
      } catch {
        // No metadata.json — not a snapshot folder
      }

      let modifiedAt: number | undefined;
      try {
        const stat = await fs.stat(absEntryPath);
        modifiedAt = stat.mtimeMs;
      } catch {}

      nodes.push({
        name: entry.name,
        path: relEntryPath,
        type: 'folder',
        modifiedAt,
        linkedSnapshotId,
        children,
      });
    } else if (entry.isFile()) {
      let modifiedAt: number | undefined;
      try {
        const stat = await fs.stat(absEntryPath);
        modifiedAt = stat.mtimeMs;
      } catch {}

      nodes.push({
        name: entry.name,
        path: relEntryPath,
        type: 'file',
        modifiedAt,
      });
    }
  }

  // Sort: folders first, then files; alphabetically within each group
  nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return nodes;
}

/**
 * Returns true if `absPath` is strictly within `basePath` (no path traversal).
 */
function isWithinBase(absPath: string, basePath: string): boolean {
  const resolved = path.resolve(absPath);
  const resolvedBase = path.resolve(basePath);
  return resolved.startsWith(resolvedBase + path.sep) || resolved === resolvedBase;
}
