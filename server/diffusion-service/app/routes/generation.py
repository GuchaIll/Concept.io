# -*- coding: utf-8 -*-
"""
Image generation endpoints.
"""

import uuid
from datetime import datetime

import torch
from fastapi import APIRouter, HTTPException, BackgroundTasks

from ..config import DIFFUSERS_AVAILABLE
from ..models import (
    GenerationRequest,
    GenerationResponse,
    GenerationStatus,
    JobStatusResponse,
    ModelType,
)
from ..services.generation import generation_jobs, generate_image_task
from ..services.pipeline import is_sd15_loaded, is_sdxl_loaded

router = APIRouter()


def _estimate_time(request: GenerationRequest) -> float:
    """Compute an ETA for a generation request."""
    is_cuda = torch.cuda.is_available()
    base_pixels = 512 * 512
    actual_pixels = max(1, request.width * request.height)
    size_multiplier = (actual_pixels / base_pixels) ** 0.5

    if request.model == ModelType.SD15:
        time_per_step = 0.6 if is_cuda else 8.0
        model_load_time = 5.0 if not is_sd15_loaded() else 0.0
    else:
        time_per_step = 2.5 if is_cuda else 40.0
        model_load_time = 15.0 if not is_sdxl_loaded() else 0.0

    return model_load_time + (request.steps * time_per_step * size_multiplier)


@router.post("/generate", response_model=GenerationResponse)
async def generate_image(request: GenerationRequest, background_tasks: BackgroundTasks):
    """Start an async generation job. Poll /job/{id} for status."""
    job_id = str(uuid.uuid4())
    created_at = datetime.utcnow().isoformat()
    estimated_time = _estimate_time(request)

    generation_jobs[job_id] = {
        "job_id": job_id,
        "status": GenerationStatus.PENDING,
        "model": request.model,
        "progress": 0.0,
        "estimated_time": estimated_time,
        "image_data": None,
        "error": None,
        "created_at": created_at,
        "completed_at": None,
        "request": request.model_dump(),
    }

    background_tasks.add_task(generate_image_task, job_id, request)

    return GenerationResponse(
        job_id=job_id,
        status=GenerationStatus.PENDING,
        model=request.model,
        progress=0.0,
        estimated_time=estimated_time,
        created_at=created_at,
    )


@router.get("/job/{job_id}", response_model=JobStatusResponse)
async def get_job_status(job_id: str):
    """Get progress / result of a generation job."""
    if job_id not in generation_jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    job = generation_jobs[job_id]
    return JobStatusResponse(
        job_id=job_id,
        status=job["status"],
        progress=job["progress"],
        estimated_time=job.get("estimated_time"),
        image_data=job.get("image_data"),
        error=job.get("error"),
    )


@router.get("/jobs")
async def list_jobs():
    """List all generation jobs (summary view)."""
    return {
        "jobs": [
            {
                "job_id": j["job_id"],
                "status": j["status"],
                "model": j["model"],
                "progress": j["progress"],
                "created_at": j["created_at"],
                "prompt": (j["request"]["prompt"][:50] + "..."
                           if len(j["request"]["prompt"]) > 50
                           else j["request"]["prompt"]),
            }
            for j in generation_jobs.values()
        ],
        "total": len(generation_jobs),
    }


@router.delete("/job/{job_id}")
async def delete_job(job_id: str):
    """Delete a completed/failed job."""
    if job_id not in generation_jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    del generation_jobs[job_id]
    return {"message": "Job deleted"}


@router.post("/generate/sync", response_model=GenerationResponse)
async def generate_image_sync(request: GenerationRequest):
    """Synchronous generation — waits for completion before responding."""
    job_id = str(uuid.uuid4())
    created_at = datetime.utcnow().isoformat()

    generation_jobs[job_id] = {
        "job_id": job_id,
        "status": GenerationStatus.PENDING,
        "model": request.model,
        "progress": 0.0,
        "estimated_time": None,
        "image_data": None,
        "error": None,
        "created_at": created_at,
        "completed_at": None,
        "request": request.model_dump(),
    }

    await generate_image_task(job_id, request)

    job = generation_jobs[job_id]
    return GenerationResponse(
        job_id=job_id,
        status=job["status"],
        model=request.model,
        progress=job["progress"],
        estimated_time=job.get("estimated_time"),
        image_data=job.get("image_data"),
        error=job.get("error"),
        created_at=created_at,
        completed_at=job.get("completed_at"),
    )
