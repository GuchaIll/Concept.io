/**
 * local.strategy.ts — Sync strategy that writes exported layers to a local folder.
 *
 * Folder structure:
 *   <basePath>/
 *     layers/
 *       <layer-name>.png
 *     composite.png
 *     metadata.json
 */

import fs from 'fs/promises';
import path from 'path';
import type { ExportResult } from '../export.service';
import type { ISyncTarget, ISyncLog } from '../../../../common/sync.interface';

export interface LocalSyncResult {
  success: boolean;
  filesWritten: string[];
  error?: string;
}

export async function syncToLocal(
  target: ISyncTarget,
  exportResult: ExportResult,
): Promise<LocalSyncResult> {
  const config = target.config as { folderPath: string };
  const basePath = config.folderPath;

  if (!basePath) {
    return { success: false, filesWritten: [], error: 'No folderPath configured' };
  }

  const filesWritten: string[] = [];

  try {
    // Ensure directories exist
    const layersDir = path.join(basePath, 'layers');
    await fs.mkdir(layersDir, { recursive: true });

    // Write per-layer PNGs
    for (const layer of exportResult.layers) {
      const layerFileName = sanitizeFilename(layer.name) + '.png';
      const layerPath = path.join(layersDir, layerFileName);
      await fs.writeFile(layerPath, layer.png);
      filesWritten.push(layerPath);
    }

    // Write composite
    if (exportResult.composite) {
      const compositePath = path.join(basePath, 'composite.png');
      await fs.writeFile(compositePath, exportResult.composite);
      filesWritten.push(compositePath);
    }

    // Write metadata
    const metadataPath = path.join(basePath, 'metadata.json');
    await fs.writeFile(metadataPath, JSON.stringify(exportResult.metadata, null, 2), 'utf-8');
    filesWritten.push(metadataPath);

    return { success: true, filesWritten };
  } catch (err: any) {
    return {
      success: false,
      filesWritten,
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
