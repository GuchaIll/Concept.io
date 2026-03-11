# -*- coding: utf-8 -*-
"""
Generation service — background task logic, job tracking, and progress.
"""

import time
import asyncio
from datetime import datetime
from typing import Dict, Any

import torch

from ..config import DIFFUSERS_AVAILABLE, DEVICE
from ..models import GenerationRequest, GenerationStatus, ModelType
from ..utils.image import image_to_base64, generate_mock_image
from .pipeline import load_sd15_pipeline, load_sdxl_pipeline

# In-memory job store (dict of job_id -> job dict)
generation_jobs: Dict[str, Dict[str, Any]] = {}


def progress_callback(job_id: str, step: int, total_steps: int) -> None:
    """Update a job's progress percentage."""
    if job_id in generation_jobs:
        generation_jobs[job_id]["progress"] = (step / total_steps) * 100
        generation_jobs[job_id]["status"] = GenerationStatus.GENERATING


async def generate_image_task(job_id: str, request: GenerationRequest) -> None:
    """Background task that performs actual image generation."""
    try:
        generation_jobs[job_id]["status"] = GenerationStatus.LOADING_MODEL

        # ── Mock mode ────────────────────────────────────────────
        if not DIFFUSERS_AVAILABLE:
            generation_jobs[job_id]["status"] = GenerationStatus.GENERATING
            generation_jobs[job_id]["estimated_time"] = 2.0

            for i in range(5):
                await asyncio.sleep(0.3)
                generation_jobs[job_id]["progress"] = (i + 1) * 20

            image = generate_mock_image(request.prompt, request.width, request.height)
            image_data = image_to_base64(image)

            generation_jobs[job_id].update({
                "status": GenerationStatus.COMPLETED,
                "progress": 100.0,
                "image_data": f"data:image/png;base64,{image_data}",
                "completed_at": datetime.utcnow().isoformat(),
            })
            print(f"Job {job_id} completed (mock mode)")
            return

        # ── Real pipeline ────────────────────────────────────────
        if request.model == ModelType.SD15:
            print(f"Using SD 1.5 for job {job_id} "
                  f"({request.width}x{request.height}, {request.steps} steps)")
            pipe = load_sd15_pipeline()
            estimated = 5.0
        else:
            print(f"Using SDXL for job {job_id} "
                  f"({request.width}x{request.height}, {request.steps} steps)")
            pipe = load_sdxl_pipeline()
            estimated = 15.0

        if pipe is None:
            raise RuntimeError("Pipeline failed to load")

        generation_jobs[job_id]["estimated_time"] = estimated
        generation_jobs[job_id]["status"] = GenerationStatus.GENERATING

        generator = None
        if request.seed is not None:
            generator = torch.Generator(DEVICE).manual_seed(request.seed)

        def callback_fn(_pipe, step_index, _timestep, callback_kwargs):
            progress_callback(job_id, step_index + 1, request.steps)
            return callback_kwargs

        start_time = time.time()

        result = pipe(
            prompt=request.prompt,
            negative_prompt=request.negative_prompt,
            width=request.width,
            height=request.height,
            num_inference_steps=request.steps,
            guidance_scale=request.guidance_scale,
            generator=generator,
            callback_on_step_end=callback_fn,
        )

        image_data = image_to_base64(result.images[0])
        elapsed = time.time() - start_time

        generation_jobs[job_id].update({
            "status": GenerationStatus.COMPLETED,
            "progress": 100.0,
            "image_data": f"data:image/png;base64,{image_data}",
            "completed_at": datetime.utcnow().isoformat(),
            "actual_time": elapsed,
        })
        print(f"Job {job_id} completed in {elapsed:.2f}s")

    except Exception as e:
        import traceback
        error_msg = str(e)
        print(f"Job {job_id} failed: {error_msg}")
        traceback.print_exc()
        generation_jobs[job_id]["status"] = GenerationStatus.FAILED
        generation_jobs[job_id]["error"] = f"{type(e).__name__}: {error_msg}"
