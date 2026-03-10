/**
 * useEdit — Hook for AI-powered image editing via the /api/edit endpoint.
 *
 * Three modes:
 *   instruction  → CosXL-Edit text-instruction img2img (default, model='edit')
 *   inpaint      → SDXL inpaint with a mask
 *   controlnet   → ControlNet-Union-SDXL structure conditioning
 *
 * Phase 2:
 *   Pass model='flux' to route to FLUX.1-schnell once Phase 2 weights are downloaded.
 */

import { useState, useCallback } from 'react';

// ── Public types ──────────────────────────────────────────────────────────────

export type EditMode  = 'instruction' | 'inpaint' | 'controlnet' | 'outpaint';
export type EditModel = 'edit' | 'flux';

export interface EditOptions {
  mode?: EditMode;
  model?: EditModel;
  /** base64 mask PNG (white = repaint). Required when mode='inpaint'. */
  maskData?: string;
  /** base64 reference image for IP-Adapter style transfer. */
  referenceImageData?: string;
  /** Denoising strength 0–1. Lower = preserve more of the original. Default 0.75. */
  strength?: number;
  steps?: number;
  guidanceScale?: number;
  /** ControlNet mode: 0=pose 1=depth 2=soft-edge 3=canny 4=tile … Default 1 (depth). */
  controlnetType?: number;
  controlnetScale?: number;
  /** IP-Adapter influence 0–1. 0.4–0.7 recommended. Default 0.6. */
  ipAdapterScale?: number;
  width?: number;
  height?: number;
  seed?: number;
  negativePrompt?: string;
  /** Outpaint padding in pixels per side. Only used when mode='outpaint'. */
  padding?: { top: number; bottom: number; left: number; right: number };
}

export interface EditResult {
  success: boolean;
  /** base64 PNG data-URL of the edited image. */
  imageData?: string;
  processingTime: number;
  error?: string;
}

interface UseEditReturn {
  isProcessing: boolean;
  error: string | null;
  result: EditResult | null;

  /**
   * Edit an image.
   * @param imageData  base64 data-URL of the source image.
   * @param prompt     Text instruction or generation prompt.
   * @param options    EditOptions controlling mode, model, mask, strength, etc.
   */
  editImage: (imageData: string, prompt: string, options?: EditOptions) => Promise<EditResult>;
  clearResult: () => void;
  cancelProcessing: () => void;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export const useEdit = (): UseEditReturn => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [result, setResult]             = useState<EditResult | null>(null);
  const [abort, setAbort]               = useState<AbortController | null>(null);

  const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';

  const editImage = useCallback(async (
    imageData: string,
    prompt: string,
    options: EditOptions = {},
  ): Promise<EditResult> => {
    if (!imageData) throw new Error('imageData is required');
    if (!prompt)    throw new Error('prompt is required');

    if (options.mode === 'inpaint' && !options.maskData) {
      const err = 'maskData is required for inpaint mode';
      setError(err);
      return { success: false, error: err, processingTime: 0 };
    }

    // Cancel any in-flight request
    abort?.abort();
    const ac = new AbortController();
    setAbort(ac);

    setIsProcessing(true);
    setError(null);

    try {
      const body: Record<string, unknown> = {
        imageData,
        prompt,
        mode:             options.mode            ?? 'instruction',
        model:            options.model           ?? 'edit',
        strength:         options.strength        ?? 0.75,
        steps:            options.steps           ?? 20,
        guidanceScale:    options.guidanceScale   ?? 7.5,
        controlnetType:   options.controlnetType  ?? 1,
        controlnetScale:  options.controlnetScale ?? 0.8,
        ipAdapterScale:   options.ipAdapterScale  ?? 0.6,
        width:            options.width           ?? 1024,
        height:           options.height          ?? 1024,
      };

      if (options.negativePrompt)      body.negativePrompt      = options.negativePrompt;
      if (options.maskData)            body.maskData            = options.maskData;
      if (options.referenceImageData)  body.referenceImageData  = options.referenceImageData;
      if (options.seed != null)        body.seed                = options.seed;
      if (options.padding)             body.padding             = options.padding;

      const response = await fetch(`${API_BASE}/api/edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: ac.signal,
      });

      if (!response.ok) {
        throw new Error(`Edit service error: ${response.status}`);
      }

      const data = await response.json() as EditResult;

      if (!data.success) {
        setError(data.error ?? 'Edit failed');
      }
      setResult(data);
      return data;
    } catch (err) {
      if ((err as { name?: string }).name === 'AbortError') {
        const r: EditResult = { success: false, error: 'Cancelled', processingTime: 0 };
        setResult(r);
        return r;
      }
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(msg);
      const r: EditResult = { success: false, error: msg, processingTime: 0 };
      setResult(r);
      return r;
    } finally {
      setIsProcessing(false);
    }
  }, [API_BASE, abort]);

  const clearResult    = useCallback(() => { setResult(null); setError(null); }, []);
  const cancelProcessing = useCallback(() => { abort?.abort(); setIsProcessing(false); }, [abort]);

  return { isProcessing, error, result, editImage, clearResult, cancelProcessing };
};
