# -*- coding: utf-8 -*-
"""
Cutout (background removal) endpoints.

Three-route design:
  POST /cutout/proposals — SAM mask-proposal engine (all objects, user picks)
  POST /cutout/apply     — apply user-selected mask(s) to produce final RGBA cutout
  POST /cutout           — legacy one-shot auto-cutout (SAM → rembg → color-dist)
  GET  /cutout/health    — service availability / active engine
"""

import io
import os
import base64
import time

from fastapi import APIRouter

from ..config import REMBG_AVAILABLE, SAM_AVAILABLE, SAM_MODEL_PATH
from ..models import (
    CutoutRequest,
    CutoutResponse,
    MaskProposalsRequest,
    MaskProposalsResponse,
    CutoutFromMaskRequest,
)
from ..services.cutout import process_cutout, generate_mask_proposals, apply_mask_to_image

router = APIRouter()


# ── 1. Mask proposals — SAM generates ALL regions, user picks ────

@router.post("/cutout/proposals", response_model=MaskProposalsResponse)
async def get_mask_proposals(request: MaskProposalsRequest):
    """
    Run SAM on the image and return all segmented regions as coloured overlays.

    The client renders these overlays interactively so the user can hover and
    click to select the exact object(s) they want to cut out.  This is the same
    approach used by Photoshop's Object Select / Select Subject tools.
    """
    start_time = time.time()
    print(f"[/cutout/proposals] image_data length={len(request.image_data)}, "
          f"max_proposals={request.max_proposals}")

    try:
        proposals, image_size, engine = generate_mask_proposals(
            request.image_data,
            max_proposals=request.max_proposals,
        )
        processing_time = time.time() - start_time
        print(f"[/cutout/proposals] Returned {len(proposals)} proposals "
              f"via engine='{engine}' in {processing_time:.2f}s")

        return MaskProposalsResponse(
            success=True,
            proposals=proposals,
            image_size=image_size,
            processing_time=processing_time,
            engine=engine,
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"[/cutout/proposals] Error: {e}")
        return MaskProposalsResponse(success=False, error=str(e))


# ── 2. Apply selected mask(s) → final RGBA cutout ────────────────

@router.post("/cutout/apply", response_model=CutoutResponse)
async def apply_selected_masks(request: CutoutFromMaskRequest):
    """
    Merge the user-selected mask PNGs and apply them to the source image,
    returning an RGBA PNG with the background removed.

    mask_data is a list so the user can shift-click multiple proposals.
    """
    start_time = time.time()
    print(f"[/cutout/apply] {len(request.mask_data)} mask(s), "
          f"feather={request.feather_radius}, threshold={request.threshold}, "
          f"refine={request.refine_mask}")

    try:
        result, original_size, crop_box = apply_mask_to_image(
            image_data=request.image_data,
            mask_data_list=request.mask_data,
            feather_radius=request.feather_radius,
            threshold=request.threshold,
            refine=request.refine_mask,
        )

        output_buffer = io.BytesIO()
        result.save(output_buffer, format="PNG")
        output_base64 = base64.b64encode(output_buffer.getvalue()).decode()

        processing_time = time.time() - start_time
        print(f"[/cutout/apply] Done in {processing_time:.2f}s, crop_box={crop_box}")

        return CutoutResponse(
            success=True,
            image_data=f"data:image/png;base64,{output_base64}",
            original_size=original_size,
            processing_time=processing_time,
            crop_box=crop_box,
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"[/cutout/apply] Error: {e}")
        return CutoutResponse(success=False, error=str(e))


# ── 3. Legacy one-shot auto-cutout ────────────────────────────────

@router.post("/cutout", response_model=CutoutResponse)
async def remove_background(request: CutoutRequest):
    """
    One-shot background removal: SAM (auto) → rembg → color-distance fallback.

    Use /cutout/proposals + /cutout/apply for interactive mask picking instead.
    """
    start_time = time.time()

    active = "sam" if SAM_AVAILABLE and os.path.exists(SAM_MODEL_PATH) else (
        "rembg" if REMBG_AVAILABLE else "color_distance"
    )
    print(f"[/cutout] Starting auto-cutout via engine='{active}', "
          f"image_data length={len(request.image_data)}, "
          f"point=({request.point_x}, {request.point_y})")

    try:
        result, original_size = process_cutout(
            image_data=request.image_data,
            feather_radius=request.feather_radius,
            threshold=request.threshold,
            refine=request.refine_mask,
            point_x=request.point_x,
            point_y=request.point_y,
        )

        output_buffer = io.BytesIO()
        result.save(output_buffer, format="PNG")
        output_base64 = base64.b64encode(output_buffer.getvalue()).decode()

        processing_time = time.time() - start_time
        print(f"[/cutout] Completed via engine='{active}' in {processing_time:.2f}s")

        return CutoutResponse(
            success=True,
            image_data=f"data:image/png;base64,{output_base64}",
            original_size=original_size,
            processing_time=processing_time,
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"[/cutout] Error: {e}")
        return CutoutResponse(success=False, error=str(e))


# ── Health ────────────────────────────────────────────────────────

@router.get("/cutout/health")
async def cutout_health():
    """Check cutout service availability and report active engine."""
    sam_checkpoint_exists = os.path.exists(SAM_MODEL_PATH)
    if SAM_AVAILABLE and sam_checkpoint_exists:
        active_engine = "sam"
    elif REMBG_AVAILABLE:
        active_engine = "rembg"
    else:
        active_engine = "color_distance"

    return {
        "available": True,
        "sam_available": SAM_AVAILABLE,
        "sam_checkpoint_exists": sam_checkpoint_exists,
        "rembg_available": REMBG_AVAILABLE,
        "active_engine": active_engine,
    }
