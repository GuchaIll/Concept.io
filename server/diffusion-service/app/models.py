# -*- coding: utf-8 -*-
"""
Pydantic models and enumerations for the Diffusion Service API.
"""

from enum import Enum
from typing import Optional
from pydantic import BaseModel, field_validator


# ── Enums ────────────────────────────────────────────────────────

class ModelType(str, Enum):
    SD15 = "sd15"
    SDXL = "sdxl"
    EDIT = "edit"
    FLUX = "flux"


class GenerationStatus(str, Enum):
    PENDING = "pending"
    LOADING_MODEL = "loading_model"
    GENERATING = "generating"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


# ── Generation ───────────────────────────────────────────────────

class GenerationRequest(BaseModel):
    prompt: str
    negative_prompt: Optional[str] = (
        "blurry, bad quality, distorted, ugly, deformed, "
        "low resolution, artifacts, noise, watermark, text"
    )
    width: int = 768
    height: int = 768
    steps: int = 30
    guidance_scale: float = 7.5
    model: ModelType = ModelType.SD15
    seed: Optional[int] = None

    @field_validator("width", "height")
    @classmethod
    def validate_dimensions(cls, v: int, info) -> int:
        if v <= 0:
            raise ValueError(f"{info.field_name} must be a positive integer, got {v}")
        if v > 4096:
            raise ValueError(f"{info.field_name} must be at most 4096, got {v}")
        return v

    @field_validator("steps")
    @classmethod
    def validate_steps(cls, v: int) -> int:
        if v <= 0:
            raise ValueError(f"steps must be a positive integer, got {v}")
        if v > 200:
            raise ValueError(f"steps must be at most 200, got {v}")
        return v


class GenerationResponse(BaseModel):
    job_id: str
    status: GenerationStatus
    model: ModelType
    progress: float = 0.0
    estimated_time: Optional[float] = None
    image_data: Optional[str] = None
    error: Optional[str] = None
    created_at: str
    completed_at: Optional[str] = None


class JobStatusResponse(BaseModel):
    job_id: str
    status: GenerationStatus
    progress: float
    estimated_time: Optional[float] = None
    image_data: Optional[str] = None
    error: Optional[str] = None


# ── Cutout ───────────────────────────────────────────────────────

class CutoutRequest(BaseModel):
    """Request for background removal cutout."""
    image_data: str  # Base64 encoded image (with or without data URI prefix)
    feather_radius: int = 0  # Edge feathering in pixels (0-10)
    threshold: int = 128  # Alpha threshold (0-255)
    refine_mask: bool = True  # Apply edge refinement
    output_format: str = "png"  # Output format (png for transparency)
    # Optional SAM point-prompt hint (normalized 0-1 relative to image dimensions).
    # When provided, SAM runs in point-prompt mode (more accurate for known subject centre).
    # When omitted, SAM uses automatic mask selection heuristics.
    point_x: Optional[float] = None
    point_y: Optional[float] = None


class CutoutResponse(BaseModel):
    """Response with cutout image."""
    success: bool
    image_data: Optional[str] = None  # Base64 encoded PNG with transparency
    original_size: Optional[tuple] = None
    processing_time: Optional[float] = None
    error: Optional[str] = None


# ── Interactive mask picker (Photoshop-style proposals) ──────────

class MaskProposal(BaseModel):
    """A single SAM-generated mask region rendered as a coloured overlay."""
    id: int
    overlay: str          # base64 RGBA PNG — semi-transparent coloured region
    mask: str             # base64 grayscale PNG — binary mask for round-trip
    area_ratio: float     # fraction of image area (0-1)
    stability_score: float
    composite_score: float
    background_score: float = 0.0  # 0-1 heuristic: 1 = almost certainly background
    bbox: list[float]     # [x, y, w, h] normalised 0-1
    centroid: list[float] # [cx, cy] normalised 0-1
    color: list[int]      # [R, G, B]


class MaskProposalsRequest(BaseModel):
    """Request to generate all SAM mask proposals for an image."""
    image_data: str
    max_proposals: int = 12


class MaskProposalsResponse(BaseModel):
    """All SAM mask proposals returned for user to pick from."""
    success: bool
    proposals: list[MaskProposal] = []
    image_size: Optional[tuple] = None   # (width, height) of source image
    processing_time: Optional[float] = None
    engine: str = "unavailable"
    error: Optional[str] = None


class CutoutFromMaskRequest(BaseModel):
    """Apply one or more user-selected mask PNGs to produce a cutout."""
    image_data: str
    mask_data: list[str]     # one or more base64 grayscale mask PNGs
    feather_radius: int = 0
    threshold: int = 128
    refine_mask: bool = True

class EditMode(str, Enum):
    INSTRUCTION = "instruction"   # CosXL-Edit text-instruction img2img
    INPAINT     = "inpaint"       # SDXL inpaint with mask
    CONTROLNET  = "controlnet"    # ControlNet-Union structure conditioning
    OUTPAINT    = "outpaint"      # Expand canvas with inpaint on borders


class EditRequest(BaseModel):
    """Request body for the /edit endpoint."""
    image_data: str                             # base64 source image
    prompt: str
    negative_prompt: str = (
        "blurry, bad quality, distorted, artifacts, watermark"
    )
    mode: EditMode = EditMode.INSTRUCTION
    mask_data: Optional[str] = None             # base64 mask — required for inpaint mode
    reference_image_data: Optional[str] = None  # base64 style/IP-Adapter reference
    strength: float = 0.75                      # img2img / inpaint denoising strength
    steps: int = 30
    guidance_scale: float = 7.5
    # ControlNet options
    controlnet_type: int = 1          # 0=pose 1=depth 2=soft-edge 3=canny 4=tile …
    controlnet_scale: float = 0.8
    # IP-Adapter options
    ip_adapter_scale: float = 0.6
    width: int = 1024
    height: int = 1024
    seed: Optional[int] = None
    model: ModelType = ModelType.EDIT
    # Outpaint padding (pixels per side)
    padding_top: int = 0
    padding_bottom: int = 0
    padding_left: int = 0
    padding_right: int = 0


class EditResponse(BaseModel):
    """Response from the /edit endpoint."""
    success: bool
    image_data: Optional[str] = None
    processing_time: float = 0.0
    error: Optional[str] = None

