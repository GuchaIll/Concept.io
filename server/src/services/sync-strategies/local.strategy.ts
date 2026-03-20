/**
 * local.strategy.ts — Sync strategy that writes snapshot composite to a local folder.
 *
 * The sync folder mirrors the user's intended repository structure:
 *   <basePath>/
 *     <user-created-folders>/
 *       <snapshot-name>.png
 *
 * Only the composite PNG is saved — metadata and layer snapshots remain in PostgreSQL
 * for version control. The remote origin only tracks the most recent composites.
 *
 * The optional `targetPath` parameter allows linking to a specific file path or overwriting
 * an existing file.
 */

import fs from 'fs/promises';
import path from 'path';
import type { ExportResult } from '../export.service';
import type { ISyncTarget } from '../../../../common/sync.interface';

export interface LocalSyncResult {
  success: boolean;
  filesWritten: string[];
  filePath: string;
  error?: string;
}

export interface LocalSyncOptions {
  /** Custom file path (relative to basePath) — if provided, save composite here */
  targetPath?: string;
  /** Custom file name (without extension) — defaults to snapshotName */
  fileName?: string;
}

export async function syncToLocal(
  target: ISyncTarget,
  exportResult: ExportResult,
  options?: LocalSyncOptions,
): Promise<LocalSyncResult> {
  const config = target.config as { folderPath: string };
  const basePath = config.folderPath;

  if (!basePath) {
    return { success: false, filesWritten: [], filePath: '', error: 'No folderPath configured' };
  }

  const filesWritten: string[] = [];

  // Determine file name: custom fileName > snapshotName
  const fileName = sanitizeFilename(options?.fileName || exportResult.snapshotName) + '.png';

  // Determine target directory and full path
  let targetDir = basePath;
  let fullFilePath: string;

  if (options?.targetPath) {
    // targetPath can be a directory (save as fileName inside) or a full file path
    const targetAbs = path.join(basePath, options.targetPath);
    
    // Check if targetPath ends with .png — treat as full file path
    if (options.targetPath.toLowerCase().endsWith('.png')) {
      fullFilePath = targetAbs;
      targetDir = path.dirname(fullFilePath);
    } else {
      // Treat as directory — save fileName inside
      targetDir = targetAbs;
      fullFilePath = path.join(targetDir, fileName);
    }
  } else {
    // Default: save directly in basePath with snapshotName
    fullFilePath = path.join(basePath, fileName);
  }

  try {
    // Ensure target directory exists
    await fs.mkdir(targetDir, { recursive: true });

    // Write composite PNG only
    if (exportResult.composite) {
      await fs.writeFile(fullFilePath, exportResult.composite);
      filesWritten.push(fullFilePath);
    }

    // Compute relative path for the response
    const relativePath = path.relative(basePath, fullFilePath).replace(/\\/g, '/');

    return { success: true, filesWritten, filePath: relativePath };
  } catch (err: any) {
    return {
      success: false,
      filesWritten,
      filePath: '',
      error: err.message ?? String(err),
    };
  }
}

// ── Helpers ────────────────────────────────────────────────

function sanitizeFilename(name: string): string {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/\s+/g, '-')
    .toLowerCase()
    .slice(0, 128);
}
