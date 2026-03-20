/**
 * ExportService — renders snapshot layers to PNG buffers.
 *
 * Takes an ISnapshot (with ILayerSnapshot[]) and produces:
 *   - Per-layer transparent PNGs
 *   - A merged composite PNG (alpha-composited, white background)
 *   - Metadata JSON
 *
 * Uses `sharp` for compositing (no Canvas/browser dependency).
 */

import sharp from 'sharp';
import DAC, { ISnapshot, ILayerSnapshot } from '../db/dac';

export interface ExportedLayer {
  layerId: string;
  name: string;
  type: string;
  png: Buffer;
  width: number;
  height: number;
}

export interface ExportResult {
  snapshotId: string;
  snapshotName: string;
  branchName: string;
  projectName: string;
  layers: ExportedLayer[];
  composite: Buffer;
  compositeWidth: number;
  compositeHeight: number;
  metadata: ExportMetadata;
}

export interface ExportMetadata {
  snapshotId: string;
  snapshotName: string;
  branchId: string;
  branchName: string;
  projectId: string;
  projectName: string;
  createdBy: string;
  createdAt: number;
  exportedAt: number;
  layerCount: number;
  layers: Array<{
    layerId: string;
    name: string;
    type: string;
    visible: boolean;
    opacity: number;
    zIndex: number;
  }>;
}

// Default canvas dimensions if project doesn't specify
const DEFAULT_WIDTH = 1920;
const DEFAULT_HEIGHT = 1080;

/**
 * Parse a data URL or raw base64 string into a Buffer.
 */
function base64ToBuffer(data: string): Buffer {
  // Strip data URL prefix if present
  const base64 = data.includes(',') ? data.split(',')[1] : data;
  return Buffer.from(base64, 'base64');
}

/**
 * Render a single fabric.js layer's serialized objects to a PNG buffer.
 *
 * Since we don't have a headless Canvas environment on the server,
 * we extract embedded image data from the fabric.js JSON objects.
 * For paint strokes (path objects), we generate a placeholder approach —
 * but the primary use case is rasterized layers that contain `image` objects
 * with `src` as data URLs.
 *
 * Falls back to a transparent PNG if layer cannot be rendered.
 */
async function renderLayerToPng(
  layer: ILayerSnapshot,
  width: number,
  height: number,
): Promise<Buffer> {
  try {
    // Prefer client-supplied rasterData — accurate JPEG capture of all object
    // types (paths, text, rects) at display resolution; just convert to PNG.
    if (layer.rasterData && layer.rasterData.length > 100) {
      return sharp(base64ToBuffer(layer.rasterData)).png().toBuffer();
    }

    const objects = JSON.parse(layer.objects || '[]');

    if (!objects.length) {
      // Empty layer → transparent PNG
      return sharp({
        create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
      }).png().toBuffer();
    }

    // Collect image composites from the fabric.js objects
    const composites: sharp.OverlayOptions[] = [];

    for (const obj of objects) {
      if (obj.type === 'image' && obj.src) {
        try {
          const imgBuffer = base64ToBuffer(obj.src);
          const img = sharp(imgBuffer);
          const meta = await img.metadata();

          // Calculate position and size from fabric.js properties
          const left = Math.round(obj.left || 0);
          const top = Math.round(obj.top || 0);
          const objWidth = Math.round((meta.width || 100) * (obj.scaleX || 1));
          const objHeight = Math.round((meta.height || 100) * (obj.scaleY || 1));

          const resized = await img.resize(
            Math.max(1, objWidth),
            Math.max(1, objHeight),
            { fit: 'fill' },
          ).png().toBuffer();

          composites.push({
            input: resized,
            left: Math.max(0, left),
            top: Math.max(0, top),
          });
        } catch {
          // Skip objects that can't be rendered
        }
      }
      // For path/rect/circle (paint strokes), we currently skip them.
      // Full rasterization would require node-canvas or a headless browser.
      // The exported PNGs will contain image-based layers accurately.
    }

    if (composites.length === 0) {
      // No renderable objects — transparent PNG
      return sharp({
        create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
      }).png().toBuffer();
    }

    // Composite all objects onto a transparent canvas
    return sharp({
      create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .composite(composites)
      .png()
      .toBuffer();
  } catch (error) {
    console.error(`[ExportService] Failed to render layer ${layer.name}:`, error);
    // Return transparent PNG on error
    return sharp({
      create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    }).png().toBuffer();
  }
}

/**
 * Export a snapshot to PNG buffers.
 */
export async function exportSnapshot(snapshotId: string): Promise<ExportResult> {
  const snapshot = await DAC.db.resolveSnapshot(snapshotId);
  if (!snapshot) {
    throw new Error(`Snapshot not found: ${snapshotId}`);
  }

  // Resolve branch and project names
  const branch = await DAC.db.getBranchById(snapshot.branchId);
  const project = await DAC.db.getProjectById(snapshot.projectId);

  const branchName = branch?.name || 'unknown';
  const projectName = project?.name || 'unknown';
  const width = project?.canvasWidth || DEFAULT_WIDTH;
  const height = project?.canvasHeight || DEFAULT_HEIGHT;
  let compositeWidth = width;
  let compositeHeight = height;

  // Sort layers by zIndex ascending for correct compositing order
  const sortedLayers = [...snapshot.layers].sort((a, b) => a.zIndex - b.zIndex);

  // Render each layer
  const exportedLayers: ExportedLayer[] = [];
  const visibleLayerBuffers: Array<{ buffer: Buffer; opacity: number }> = [];

  for (const layer of sortedLayers) {
    const png = await renderLayerToPng(layer, width, height);
    exportedLayers.push({
      layerId: layer.layerId,
      name: layer.name,
      type: layer.type || 'Paint',
      png,
      width,
      height,
    });

    if (layer.visible) {
      visibleLayerBuffers.push({ buffer: png, opacity: layer.opacity });
    }
  }

  // Create composite — all visible layers on white background
  let compositeBuffer: Buffer;
  if (visibleLayerBuffers.length > 0) {
    const composites: sharp.OverlayOptions[] = visibleLayerBuffers.map(({ buffer, opacity }) => ({
      input: buffer,
      // Apply layer opacity via sharp's blend
      ...(opacity < 1 ? {} : {}), // sharp doesn't support per-composite opacity directly
    }));

    compositeBuffer = await sharp({
      create: { width, height, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
    })
      .composite(composites)
      .png()
      .toBuffer();
  } else {
    // No visible layers — just white
    compositeBuffer = await sharp({
      create: { width, height, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
    }).png().toBuffer();
  }

  // If snapshot has a thumbnail, use that as composite since it's a
  // faithful canvas capture (includes paint strokes, etc.)
  if (snapshot.thumbnail && snapshot.thumbnail.length > 100) {
    try {
      const thumbBuffer = base64ToBuffer(snapshot.thumbnail);
      const meta = await sharp(thumbBuffer).metadata();
      compositeBuffer = await sharp(thumbBuffer).png().toBuffer();
      // Use the thumbnail's natural dimensions so we don't upscale/distort
      if (meta.width && meta.height) {
        compositeWidth = meta.width;
        compositeHeight = meta.height;
      }
    } catch {
      // Keep the composited version
    }
  }

  const metadata: ExportMetadata = {
    snapshotId: snapshot.id,
    snapshotName: snapshot.name,
    branchId: snapshot.branchId,
    branchName,
    projectId: snapshot.projectId,
    projectName,
    createdBy: snapshot.createdBy,
    createdAt: snapshot.createdAt,
    exportedAt: Date.now(),
    layerCount: sortedLayers.length,
    layers: sortedLayers.map(l => ({
      layerId: l.layerId,
      name: l.name,
      type: l.type || 'Paint',
      visible: l.visible,
      opacity: l.opacity,
      zIndex: l.zIndex,
    })),
  };

  return {
    snapshotId: snapshot.id,
    snapshotName: snapshot.name,
    branchName,
    projectName,
    layers: exportedLayers,
    composite: compositeBuffer,
    compositeWidth,
    compositeHeight,
    metadata,
  };
}
