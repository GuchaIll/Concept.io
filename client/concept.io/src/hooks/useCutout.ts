/**
 * useCutout - Hook for background removal cutout operations.
 *
 * Two-phase interactive flow (Photoshop-style):
 *   1. getProposals() â€” SAM generates ALL mask regions as coloured overlays
 *   2. applyMask()    â€” user-selected mask(s) applied to produce final RGBA cutout
 *
 * Legacy single-shot: processImage() (SAM auto â†’ rembg â†’ color-dist)
 */

import { useState, useCallback } from 'react';
import type { CutoutSettings } from '../types/asset.interface';

// â”€â”€ Public types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface MaskProposal {
  id: number;
  overlay: string;               // base64 RGBA PNG â€” coloured semi-transparent region
  mask: string;                  // base64 grayscale PNG â€” sent back to /cutout/apply
  areaRatio: number;
  stabilityScore: number;
  compositeScore: number;  /** CV heuristic score 0-1: higher = more likely background */
  backgroundScore: number;  bbox: [number, number, number, number];   // [x, y, w, h] normalised 0-1
  centroid: [number, number];               // [cx, cy] normalised 0-1
  color: [number, number, number];          // [R, G, B]
}

export interface MaskProposalsResult {
  success: boolean;
  proposals: MaskProposal[];
  imageSize?: [number, number];
  processingTime?: number;
  engine?: string;
  error?: string;
}

interface CutoutResult {
  success: boolean;
  imageData?: string;
  originalSize?: [number, number];
  processingTime?: number;
  cropBox?: [number, number, number, number]; // [left, top, width, height] in px within original
  error?: string;
}

interface UseCutoutReturn {
  // Shared state
  isProcessing: boolean;
  progress: number;
  error: string | null;
  result: CutoutResult | null;

  // Phase 1 â€” generate proposals
  getProposals: (imageData: string, maxProposals?: number) => Promise<MaskProposalsResult>;

  // Phase 2 â€” apply selected mask(s)
  applyMask: (imageData: string, maskData: string[], settings?: Partial<CutoutSettings>) => Promise<CutoutResult>;

  // Legacy one-shot
  processImage: (imageData: string, settings?: Partial<CutoutSettings>) => Promise<CutoutResult>;

  cancelProcessing: () => void;
  clearResult: () => void;
  checkServiceHealth: () => Promise<{
    available: boolean;
    samAvailable?: boolean;
    rembgAvailable?: boolean;
    activeEngine?: string;
  }>;
}

const DEFAULT_SETTINGS: CutoutSettings = {
  featherRadius: 0,
  threshold: 128,
  refineMask: true,
};

export const useCutout = (): UseCutoutReturn => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CutoutResult | null>(null);
  const [abortController, setAbortController] = useState<AbortController | null>(null);

  const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';

  // â”€â”€ Phase 1: generate mask proposals â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const getProposals = useCallback(async (
    imageData: string,
    maxProposals = 12,
  ): Promise<MaskProposalsResult> => {
    console.log('=== useCutout.getProposals ===', { imageDataLength: imageData?.length, maxProposals });
    setIsProcessing(true);
    setProgress(10);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/api/cutout/proposals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageData, maxProposals }),
      });

      setProgress(90);

      if (!response.ok) throw new Error(`Proposals service error: ${response.status}`);

      const data = await response.json() as MaskProposalsResult;
      console.log('Proposals received:', {
        success: data.success,
        count: data.proposals?.length ?? 0,
        engine: data.engine,
        processingTime: data.processingTime,
      });

      setProgress(100);
      if (!data.success) setError(data.error || 'Failed to generate proposals');
      return data;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(msg);
      return { success: false, proposals: [], error: msg };
    } finally {
      setIsProcessing(false);
    }
  }, [API_BASE]);

  // â”€â”€ Phase 2: apply selected masks â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const applyMask = useCallback(async (
    imageData: string,
    maskData: string[],
    settings: Partial<CutoutSettings> = {},
  ): Promise<CutoutResult> => {
    console.log('=== useCutout.applyMask ===', { maskCount: maskData.length });
    setIsProcessing(true);
    setProgress(10);
    setError(null);
    setResult(null);

    const s = { ...DEFAULT_SETTINGS, ...settings };

    try {
      const response = await fetch(`${API_BASE}/api/cutout/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageData,
          maskData,
          featherRadius: s.featherRadius,
          threshold: s.threshold,
          refineMask: s.refineMask,
        }),
      });

      setProgress(90);
      if (!response.ok) throw new Error(`Apply-mask service error: ${response.status}`);

      const data = await response.json() as CutoutResult;
      console.log('applyMask result:', {
        success: data.success,
        hasImageData: !!data.imageData,
        processingTime: data.processingTime,
      });

      setProgress(100);
      setResult(data);
      if (!data.success) setError(data.error || 'Mask apply failed');
      return data;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(msg);
      const r: CutoutResult = { success: false, error: msg };
      setResult(r);
      return r;
    } finally {
      setIsProcessing(false);
    }
  }, [API_BASE]);

  // â”€â”€ Legacy one-shot processImage â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const processImage = useCallback(async (
    imageData: string,
    settings: Partial<CutoutSettings> = {}
  ): Promise<CutoutResult> => {
    console.log('=== useCutout.processImage ===', { imageDataLength: imageData?.length });

    const controller = new AbortController();
    setAbortController(controller);
    setIsProcessing(true);
    setProgress(0);
    setError(null);
    setResult(null);

    const s = { ...DEFAULT_SETTINGS, ...settings };

    try {
      const progressInterval = setInterval(() => {
        setProgress(prev => Math.min(prev + 10, 90));
      }, 200);

      const response = await fetch(`${API_BASE}/api/cutout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageData,
          featherRadius: s.featherRadius,
          threshold: s.threshold,
          refineMask: s.refineMask,
        }),
        signal: controller.signal,
      });

      clearInterval(progressInterval);
      if (!response.ok) throw new Error(`Cutout service error: ${response.status}`);

      const data = await response.json() as CutoutResult;
      console.log('processImage result:', {
        success: data.success,
        hasImageData: !!data.imageData,
        processingTime: data.processingTime,
      });

      setProgress(100);
      setResult(data);
      if (!data.success) setError(data.error || 'Unknown error');
      return data;
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        const r: CutoutResult = { success: false, error: 'Processing cancelled' };
        setResult(r);
        return r;
      }
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(msg);
      const r: CutoutResult = { success: false, error: msg };
      setResult(r);
      return r;
    } finally {
      setIsProcessing(false);
      setAbortController(null);
    }
  }, [API_BASE]);

  const cancelProcessing = useCallback(() => {
    abortController?.abort();
  }, [abortController]);

  const clearResult = useCallback(() => {
    setResult(null);
    setError(null);
    setProgress(0);
  }, []);

  const checkServiceHealth = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/cutout/health`);
      if (!response.ok) return { available: false };
      return await response.json();
    } catch {
      return { available: false };
    }
  }, [API_BASE]);

  return {
    isProcessing,
    progress,
    error,
    result,
    getProposals,
    applyMask,
    processImage,
    cancelProcessing,
    clearResult,
    checkServiceHealth,
  };
};

export default useCutout;
