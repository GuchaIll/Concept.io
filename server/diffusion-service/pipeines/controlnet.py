# -*- coding: utf-8 -*-
"""
ControlNet-Union-SDXL runner + controlnet-aux preprocessors.

control_type values (passed as torch.tensor([N]) to the pipeline):
  0 = OpenPose     1 = Depth       2 = Soft-Edge
  3 = Canny        4 = Tile        5 = Normal
  6 = Segmentation 7 = Lineart
"""
from __future__ import annotations
from enum import IntEnum
import torch
from PIL import Image

from app.services.pipeline import load_controlnet_pipeline
from app.utils.image import generate_mock_image


class ControlType(IntEnum):
    POSE        = 0
    DEPTH       = 1
    SOFT_EDGE   = 2
    CANNY       = 3
    TILE        = 4
    NORMAL      = 5
    SEGMENTATION = 6
    LINEART     = 7


def run_controlnet(
    control_image: Image.Image,
    prompt: str,
    negative_prompt: str = "",
    control_type: int = ControlType.DEPTH,
    controlnet_scale: float = 0.8,
    steps: int = 30,
    guidance_scale: float = 7.5,
    width: int = 1024,
    height: int = 1024,
    seed: int | None = None,
) -> Image.Image:
    """
    Run ControlNet-Union-SDXL.

    Args:
        control_image: Preprocessed conditioning image (depth map, pose skeleton, etc.).
        prompt: Generation prompt.
        control_type: Which ControlNet mode to use (see ControlType enum).
        controlnet_scale: Conditioning strength (0–1).
        seed: Optional reproducibility seed.

    Returns:
        Generated PIL image conditioned on the control image.
    """
    pipe = load_controlnet_pipeline()
    if pipe is None:
        return generate_mock_image(prompt, width, height)

    if control_image.size != (width, height):
        control_image = control_image.resize((width, height), Image.LANCZOS)

    generator = None
    if seed is not None:
        generator = torch.Generator(device=pipe.device).manual_seed(seed)

    # ControlNet-Union requires control_type as a 1-element tensor
    result = pipe(
        prompt=prompt,
        negative_prompt=negative_prompt,
        image=control_image,
        control_type=torch.tensor([control_type]),
        controlnet_conditioning_scale=controlnet_scale,
        num_inference_steps=steps,
        guidance_scale=guidance_scale,
        width=width,
        height=height,
        generator=generator,
    )
    return result.images[0]


# ── Preprocessors ───────────────────────────────────────────────────────────────\

def extract_depth(image: Image.Image) -> Image.Image:
    """Extract a depth map using MiDaS (via controlnet-aux MidasDetector)."""
    from controlnet_aux import MidasDetector
    detector = MidasDetector.from_pretrained("lllyasviel/Annotators")
    return detector(image, detect_resolution=min(image.size), image_resolution=max(image.size))


def extract_pose(image: Image.Image) -> Image.Image:
    """Extract an OpenPose skeleton using controlnet-aux."""
    from controlnet_aux import OpenposeDetector
    detector = OpenposeDetector.from_pretrained("lllyasviel/Annotators")
    return detector(image, detect_resolution=min(image.size), image_resolution=max(image.size))


def extract_canny(image: Image.Image, low: int = 100, high: int = 200) -> Image.Image:
    """Extract Canny edges using controlnet-aux."""
    from controlnet_aux import CannyDetector
    detector = CannyDetector()
    return detector(image, low_threshold=low, high_threshold=high)
