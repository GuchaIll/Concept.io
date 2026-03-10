# -*- coding: utf-8 -*-
"""
SDXL inpainting runner.
Accepts a PIL source image and a grayscale PIL mask (white = area to regenerate).
"""
from __future__ import annotations
import torch
from PIL import Image

from app.services.pipeline import load_inpaint_pipeline
from app.utils.image import generate_mock_image


def run_inpaint(
    image: Image.Image,
    mask: Image.Image,
    prompt: str,
    negative_prompt: str = "",
    strength: float = 0.99,
    steps: int = 20,
    guidance_scale: float = 7.5,
    seed: int | None = None,
) -> Image.Image:
    """
    Run SDXL inpainting.

    Args:
        image: Source PIL image (RGB).
        mask:  Grayscale PIL mask — white pixels are regenerated.
        prompt: What to generate in the masked area.
        strength: How strongly to repaint (0 = keep original, 1 = fully repaint).
        seed: Optional reproducibility seed.

    Returns:
        PIL image with the masked area repainted.
    """
    import time as _time
    t0 = _time.time()
    print(f"[inpaint] ── run_inpaint called ──")
    print(f"[inpaint]  image={image.size} mode={image.mode}  mask={mask.size} mode={mask.mode}")
    print(f"[inpaint]  prompt=\"{prompt[:80]}\"  strength={strength}  steps={steps}  guidance={guidance_scale}  seed={seed}")

    print(f"[inpaint]  loading pipeline…")
    pipe = load_inpaint_pipeline()
    t_load = _time.time() - t0
    print(f"[inpaint]  pipeline loaded in {t_load:.1f}s  (pipe is None: {pipe is None})")
    if pipe is None:
        print(f"[inpaint]  ⚠ pipeline is None — returning mock image")
        return generate_mock_image(prompt, image.width, image.height)

    # Cap resolution to 768x768 max — SDXL quality is acceptable there
    # and compute scales quadratically (768² is 1.78× faster than 1024²).
    MAX_DIM = 768
    w, h = image.size
    if w > MAX_DIM or h > MAX_DIM:
        scale = MAX_DIM / max(w, h)
        w, h = int(w * scale), int(h * scale)
        # Round to nearest 8 (diffusion latent alignment)
        w, h = (w // 8) * 8, (h // 8) * 8
        image = image.resize((w, h), Image.LANCZOS)
        print(f"[inpaint]  resized to {w}x{h} (capped at {MAX_DIM})")

    # Ensure mask is L-mode and both inputs are the same size
    mask = mask.convert("L")
    if mask.size != image.size:
        mask = mask.resize(image.size, Image.LANCZOS)

    generator = None
    if seed is not None:
        generator = torch.Generator(device=pipe.device).manual_seed(seed)

    print(f"[inpaint]  starting diffusion ({steps} steps)…")
    t_diff = _time.time()
    result = pipe(
        prompt=prompt,
        negative_prompt=negative_prompt,
        image=image,
        mask_image=mask,
        strength=strength,
        num_inference_steps=steps,
        guidance_scale=guidance_scale,
        generator=generator,
    )
    t_done = _time.time()
    print(f"[inpaint]  diffusion finished in {t_done - t_diff:.1f}s")
    print(f"[inpaint]  result images count={len(result.images)}  size={result.images[0].size}")
    print(f"[inpaint] ── total run_inpaint: {t_done - t0:.1f}s ──")
    return result.images[0]
