# -*- coding: utf-8 -*-
"""
Health and root endpoints.
"""

import torch
from fastapi import APIRouter

from ..config import DIFFUSERS_AVAILABLE, REMBG_AVAILABLE
from ..services.pipeline import is_sd15_loaded, is_sdxl_loaded

router = APIRouter()


@router.get("/")
async def root():
    """Root connectivity test."""
    return {
        "service": "diffusion",
        "status": "running",
        "diffusers": DIFFUSERS_AVAILABLE,
    }


@router.get("/health")
async def health_check():
    """Detailed health check."""
    cuda_available = torch.cuda.is_available()
    return {
        "status": "healthy",
        "diffusers_available": DIFFUSERS_AVAILABLE,
        "cuda_available": cuda_available,
        "device": torch.cuda.get_device_name(0) if cuda_available else "cpu",
        "sd15_loaded": is_sd15_loaded(),
        "sdxl_loaded": is_sdxl_loaded(),
        "mode": "real" if DIFFUSERS_AVAILABLE else "mock",
        "rembg_available": REMBG_AVAILABLE,
    }
