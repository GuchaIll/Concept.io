# -*- coding: utf-8 -*-
"""
ControlNet-SDXL runner + controlnet-aux preprocessors.

Uses individual ControlNet models (300-700 MB each) instead of ControlNet-Union
(~1.5 GB).  The pipeline keeps one ControlNet model active and swaps it when
the requested control_type changes.  See pipeline.load_controlnet_pipeline().

control_type values (match the model map in pipeline.py):
  0 = OpenPose     1 = Depth       2 = Soft-Edge
  3 = Canny        4 = Tile
"""
from __future__ import annotations
from enum import IntEnum
import torch
from PIL import Image

from app.services.pipeline import load_controlnet_pipeline
from app.utils.image import generate_mock_image


class ControlType(IntEnum):
    POSE      = 0
    DEPTH     = 1
    SOFT_EDGE = 2
    CANNY     = 3
    TILE      = 4


# ── Preprocessor singletons ──────────────────────────────────────────────────
# Instantiated on first use and reused for all subsequent calls.
# Each detector loads ~200-500 MB of weights; re-loading on every request
# was the primary contributor to per-request latency after cold start.

_midas_detector = None
_pose_detector = None
_canny_detector = None


def _get_midas() -> object:
    global _midas_detector
    if _midas_detector is None:
        from controlnet_aux import MidasDetector
        print("[controlnet_aux] Loading MiDaS detector…")
        _midas_detector = MidasDetector.from_pretrained("lllyasviel/Annotators")
        print("[controlnet_aux] MiDaS loaded and cached.")
    return _midas_detector


def _get_pose() -> object:
    global _pose_detector
    if _pose_detector is None:
        from controlnet_aux import OpenposeDetector
        print("[controlnet_aux] Loading OpenPose detector…")
        _pose_detector = OpenposeDetector.from_pretrained("lllyasviel/Annotators")
        print("[controlnet_aux] OpenPose loaded and cached.")
    return _pose_detector


def _get_canny() -> object:
    global _canny_detector
    if _canny_detector is None:
        from controlnet_aux import CannyDetector
        print("[controlnet_aux] Initialising Canny detector…")
        _canny_detector = CannyDetector()
    return _canny_detector


# ── Runner ───────────────────────────────────────────────────────────────────

def run_controlnet(
    control_image: Image.Image,
    prompt: str,
    negative_prompt: str = "",
    control_type: int = ControlType.DEPTH,
    controlnet_scale: float = 0.8,
    steps: int = 30,
    guidance_scale: float = 5.0,
    width: int = 1024,
    height: int = 1024,
    seed: int | None = None,
) -> Image.Image:
    """
    Run individual ControlNet-SDXL inference.

    Calls load_controlnet_pipeline(control_type) which either returns the
    cached pipeline (same type as last call) or swaps .controlnet to the
    requested type before returning.

    Args:
        control_image: Preprocessed conditioning image (depth map, skeleton…).
        control_type:  Which ControlNet mode (ControlType enum).
        controlnet_scale: Conditioning strength (0-1).  0.7-0.8 is typical.
        seed: Optional seed for reproducibility.
    """
    # load_controlnet_pipeline handles the model swap if control_type changed
    pipe = load_controlnet_pipeline(control_type)
    if pipe is None:
        return generate_mock_image(prompt, width, height)

    if control_image.size != (width, height):
        control_image = control_image.resize((width, height), Image.LANCZOS)

    generator = None
    if seed is not None:
        generator = torch.Generator(device="cuda").manual_seed(seed)

    size = (width, height)
    result = pipe(
        prompt=prompt,
        negative_prompt=negative_prompt,
        image=control_image,
        controlnet_conditioning_scale=controlnet_scale,
        num_inference_steps=steps,
        guidance_scale=guidance_scale,
        width=width,
        height=height,
        generator=generator,
        original_size=size,
        target_size=size,
    )
    return result.images[0]


# ── Preprocessors ────────────────────────────────────────────────────────────

def extract_depth(image: Image.Image) -> Image.Image:
    """Extract a MiDaS depth map. Detector is cached after first load."""
    detector = _get_midas()
    return detector(image, detect_resolution=min(image.size), image_resolution=max(image.size))


def extract_pose(image: Image.Image) -> Image.Image:
    """Extract an OpenPose skeleton. Detector is cached after first load."""
    detector = _get_pose()
    return detector(image, detect_resolution=min(image.size), image_resolution=max(image.size))


def extract_canny(image: Image.Image, low: int = 100, high: int = 200) -> Image.Image:
    """Extract Canny edges. Detector is cached after first load."""
    detector = _get_canny()
    return detector(image, low_threshold=low, high_threshold=high)
