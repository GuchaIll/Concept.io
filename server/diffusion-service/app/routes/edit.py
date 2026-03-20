# -*- coding: utf-8 -*-
"""
Image editing endpoint — Phase 1 (SDXL/CosXL) and Phase 2 (FLUX).

POST /edit  — synchronous, returns the edited image immediately.
"""
from __future__ import annotations
import io
import base64
import time

from PIL import Image
from fastapi import APIRouter

from ..models import EditRequest, EditResponse, EditMode, ModelType

router = APIRouter()


# ── Helpers ──────────────────────────────────────────────────────────────────

def _b64_to_pil(data: str, mode: str = "RGB") -> Image.Image:
    """Decode a base64 data-URL or raw base64 string to a PIL image.

    When converting to RGB, transparent areas are composited onto a white
    background so they don't become black (which would confuse the inpaint
    pipeline into thinking the image content is dark).
    """
    if "," in data:
        data = data.split(",", 1)[1]
    img = Image.open(io.BytesIO(base64.b64decode(data)))
    if mode == "RGB" and img.mode in ("RGBA", "LA", "PA"):
        # Composite onto white background to avoid transparent → black
        bg = Image.new("RGB", img.size, (255, 255, 255))
        bg.paste(img, mask=img.split()[-1])  # use alpha channel as paste mask
        return bg
    return img.convert(mode)


def _pil_to_b64(img: Image.Image) -> str:
    """Encode a PIL image to a base64 PNG data-URL."""
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


# ── Endpoint ──────────────────────────────────────────────────────────────────

@router.post("/edit", response_model=EditResponse)
def edit_image(req: EditRequest) -> EditResponse:
    """
    Edit an image using the requested mode and model.

    Modes (req.mode):
      - instruction  → CosXL-Edit text-instruction img2img (default)
      - inpaint      → SDXL inpaint with a mask
      - controlnet   → ControlNet-Union-SDXL structure conditioning

    Model (req.model):
      - edit  → Phase 1 SDXL/CosXL stack (default)
      - flux  → Phase 2 FLUX.1-schnell (stub, filled in Phase 2)
    """
    t0 = time.time()
    print(f"\n{'='*60}")
    print(f"[edit] ── REQUEST RECEIVED ──  mode={req.mode.value}  model={req.model.value}")
    print(f"[edit]  prompt=\"{req.prompt[:80]}\"")
    print(f"[edit]  size={req.width}x{req.height}  strength={req.strength}  steps={req.steps}  guidance={req.guidance_scale}")
    print(f"[edit]  has_mask={req.mask_data is not None}  mask_len={len(req.mask_data) if req.mask_data else 0}")
    print(f"[edit]  image_data_len={len(req.image_data) if req.image_data else 0}  seed={req.seed}")
    try:
        if req.model == ModelType.FLUX:
            print(f"[edit]  → routing to FLUX runner")
            result = _run_flux(req)
        elif req.mode == EditMode.OUTPAINT:
            print(f"[edit]  → routing to OUTPAINT runner")
            result = _run_outpaint(req)
        elif req.mode == EditMode.INPAINT:
            print(f"[edit]  → routing to INPAINT runner")
            result = _run_inpaint(req)
        elif req.mode == EditMode.CONTROLNET:
            print(f"[edit]  → routing to CONTROLNET runner")
            result = _run_controlnet(req)
        else:
            print(f"[edit]  → routing to COSXL (instruction) runner")
            result = _run_cosxl(req)

        elapsed = time.time() - t0
        print(f"[edit]  ✓ runner completed in {elapsed:.1f}s  result_size={result.size}")

        b64 = _pil_to_b64(result)
        total = round(time.time() - t0, 3)
        print(f"[edit]  ✓ b64 encoded ({len(b64)//1024} KB)  total={total}s")
        print(f"[edit] ── RETURNING success=True ──")
        print(f"{'='*60}\n")
        return EditResponse(
            success=True,
            image_data=b64,
            processing_time=total,
        )
    except Exception as exc:
        import traceback
        traceback.print_exc()
        total = round(time.time() - t0, 3)
        print(f"[edit] ✗ FAILED after {total}s: {type(exc).__name__}: {exc}")
        print(f"{'='*60}\n")
        return EditResponse(
            success=False,
            error=f"{type(exc).__name__}: {exc}",
            processing_time=total,
        )


# ── Phase 1 runners ───────────────────────────────────────────────────────────

def _run_inpaint(req: EditRequest) -> Image.Image:
    from pipeines.inpaint import run_inpaint

    if not req.mask_data:
        raise ValueError("mask_data is required for inpaint mode")

    return run_inpaint(
        image=_b64_to_pil(req.image_data).resize((req.width, req.height), Image.LANCZOS),
        mask=_b64_to_pil(req.mask_data, mode="L"),
        prompt=req.prompt,
        negative_prompt=req.negative_prompt,
        strength=req.strength,
        steps=req.steps,
        guidance_scale=req.guidance_scale,
        seed=req.seed,
    )


def _run_outpaint(req: EditRequest) -> Image.Image:
    """
    Expand the canvas by padding_top/bottom/left/right pixels, then inpaint
    the new border regions.  The original image is placed in the centre of
    the expanded canvas; a mask marks the new border areas as white (repaint)
    and the original region as black (keep).
    """
    from pipeines.inpaint import run_inpaint

    src = _b64_to_pil(req.image_data)
    orig_w, orig_h = src.size

    pad_t = max(req.padding_top, 0)
    pad_b = max(req.padding_bottom, 0)
    pad_l = max(req.padding_left, 0)
    pad_r = max(req.padding_right, 0)

    if pad_t + pad_b + pad_l + pad_r == 0:
        raise ValueError("At least one padding value must be > 0 for outpaint mode")

    new_w = orig_w + pad_l + pad_r
    new_h = orig_h + pad_t + pad_b

    # Ensure dimensions are multiples of 8
    new_w = (new_w + 7) // 8 * 8
    new_h = (new_h + 7) // 8 * 8

    # Build expanded canvas — fill border with blurred/mirrored content for
    # better inpaint seams, falling back to neutral gray.
    expanded = Image.new("RGB", (new_w, new_h), (128, 128, 128))
    expanded.paste(src, (pad_l, pad_t))

    # Build mask: white (255) = regions to inpaint, black (0) = keep
    mask = Image.new("L", (new_w, new_h), 255)
    # Slight inward overlap (4 px) so the inpaint blends into the original
    overlap = 4
    keep_l = pad_l + overlap
    keep_t = pad_t + overlap
    keep_r = pad_l + orig_w - overlap
    keep_b = pad_t + orig_h - overlap
    from PIL import ImageDraw
    draw = ImageDraw.Draw(mask)
    draw.rectangle([keep_l, keep_t, keep_r, keep_b], fill=0)

    return run_inpaint(
        image=expanded,
        mask=mask,
        prompt=req.prompt,
        negative_prompt=req.negative_prompt,
        strength=1.0,  # full strength on border — we want new content
        steps=req.steps,
        guidance_scale=req.guidance_scale,
        seed=req.seed,
    )


def _run_controlnet(req: EditRequest) -> Image.Image:
    from pipeines.controlnet import (
        run_controlnet, extract_depth, extract_pose, extract_canny,
        ControlType,
    )

    src = _b64_to_pil(req.image_data)

    # Auto-extract the conditioning map appropriate for the requested type.
    # Tile and soft-edge use the source image directly (no preprocessing).
    ct = req.controlnet_type
    if ct == ControlType.DEPTH:
        control_img = extract_depth(src)
    elif ct == ControlType.POSE:
        control_img = extract_pose(src)
    elif ct == ControlType.CANNY:
        control_img = extract_canny(src)
    else:
        control_img = src  # tile, soft-edge: pass source image directly

    return run_controlnet(
        control_image=control_img,
        prompt=req.prompt,
        negative_prompt=req.negative_prompt,
        control_type=ct,
        controlnet_scale=req.controlnet_scale,
        steps=req.steps,
        guidance_scale=req.guidance_scale,
        width=req.width,
        height=req.height,
        seed=req.seed,
    )


def _run_cosxl(req: EditRequest) -> Image.Image:
    """CosXL-Edit instruction-following edit, with optional IP-Adapter style ref."""
    import torch
    from ..services.pipeline import load_cosxl_pipeline, attach_ip_adapter

    pipe = load_cosxl_pipeline()
    if pipe is None:
        raise RuntimeError(
            "CosXL pipeline unavailable (diffusers not installed or weights missing)"
        )

    ip_image = None
    if req.reference_image_data:
        attach_ip_adapter(pipe)
        pipe.set_ip_adapter_scale(req.ip_adapter_scale)
        ip_image = _b64_to_pil(req.reference_image_data)
    elif getattr(pipe, "_ip_adapter_loaded", False):
        pipe.set_ip_adapter_scale(0.0)   # disable without unloading weights

    image = _b64_to_pil(req.image_data).resize((req.width, req.height), Image.LANCZOS)

    generator = None
    if req.seed is not None:
        generator = torch.Generator(device=pipe.device).manual_seed(req.seed)

    kwargs: dict = dict(
        prompt=req.prompt,
        negative_prompt=req.negative_prompt,
        image=image,
        strength=req.strength,
        num_inference_steps=req.steps,
        guidance_scale=req.guidance_scale,
        generator=generator,
    )
    if ip_image is not None:
        kwargs["ip_adapter_image"] = ip_image

    return pipe(**kwargs).images[0]


# ── Phase 2 runner (stub — filled in Phase 2) ────────────────────────────────

def _run_flux(req: EditRequest) -> Image.Image:
    """Phase 2: FLUX.1-schnell editing. See app/services/flux_pipeline.py."""
    from ..services.flux_pipeline import FluxEditAdapter  # noqa: F401
    return FluxEditAdapter().edit(req)
