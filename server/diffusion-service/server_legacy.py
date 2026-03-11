# -*- coding: utf-8 -*-
"""
Diffusion Service API
A FastAPI server that handles image generation requests using Stable Diffusion models.
Supports both quick preview (SD 1.5) and high-quality (SDXL) generation.
"""

import os
import io
import base64
import uuid
import time
import asyncio
from enum import Enum
from typing import Optional
from datetime import datetime

# Fix Windows console encoding issues
os.environ["PYTHONIOENCODING"] = "utf-8"

# Completely disable Triton and xformers for Windows compatibility
os.environ["XFORMERS_DISABLED"] = "1"
os.environ["XFORMERS_FORCE_DISABLE_TRITON"] = "1"
os.environ["DIFFUSERS_NO_XFORMERS"] = "1"
os.environ["TRITON_DISABLED"] = "1"
os.environ["XFORMERS_ENABLE_TRITON"] = "0"
os.environ["ATTN_BACKEND"] = "sdpa"  # Use PyTorch native scaled dot product attention
os.environ["PYTORCH_ENABLE_MPS_FALLBACK"] = "1"

import sys
import warnings

# Suppress warnings during import
warnings.filterwarnings("ignore", category=UserWarning)
warnings.filterwarnings("ignore", category=FutureWarning)

import torch
from PIL import Image
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, field_validator

# Import diffusers with comprehensive fallback strategies
DIFFUSERS_AVAILABLE = False
StableDiffusionPipeline = None
StableDiffusionXLPipeline = None
DPMSolverMultistepScheduler = None

# def setup_mock_modules():
#     """Setup mock modules for xformers to prevent import errors"""
#     class MockModule:
#         def __getattr__(self, name):
#             return MockModule()
#         def __call__(self, *args, **kwargs):
#             return MockModule()
#     
#     # Mock xformers and its submodules
#     mock_modules = [
#         'xformers',
#         'xformers.ops',
#         'xformers.ops.fmha',
#         'xformers.ops.fmha.flash3',
#         'xformers.flash_attn_3',
#         'triton',
#         'triton.language',
#     ]
#     for mod_name in mock_modules:
#         if mod_name not in sys.modules:
#             sys.modules[mod_name] = MockModule()
# 
# # Setup mocks before importing diffusers
# setup_mock_modules()

try:
    # Try importing diffusers
    from diffusers import (
        StableDiffusionPipeline as SD15,
        StableDiffusionXLPipeline as SDXL,
        DPMSolverMultistepScheduler as DPMScheduler
    )
    StableDiffusionPipeline = SD15
    StableDiffusionXLPipeline = SDXL
    DPMSolverMultistepScheduler = DPMScheduler
    DIFFUSERS_AVAILABLE = True
    
    print("=" * 50)
    print("[OK] Diffusers loaded successfully!")
    print(f"  - PyTorch version: {torch.__version__}")
    print(f"  - CUDA available: {torch.cuda.is_available()}")
    if torch.cuda.is_available():
        print(f"  - GPU: {torch.cuda.get_device_name(0)}")
        print(f"  - CUDA version: {torch.version.cuda}")
    else:
        print("  - Running on CPU (will be slower)")
    print("=" * 50)
    
except ImportError as e:
    print("=" * 50)
    print(f"[WARNING] Could not import diffusers: {e}")
    print("  Running in mock mode - will generate placeholder images")
    print("=" * 50)
except Exception as e:
    print("=" * 50)
    print(f"[WARNING] Unexpected error importing diffusers: {type(e).__name__}: {e}")
    print("  Running in mock mode - will generate placeholder images")
    print("=" * 50)

app = FastAPI(title="Concept.io Diffusion Service", version="1.0.0")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup_event():
    """Log startup information"""
    print("=" * 50)
    print("Diffusion service starting...")
    print(f"  DIFFUSERS_AVAILABLE: {DIFFUSERS_AVAILABLE}")
    print(f"  CUDA available: {torch.cuda.is_available()}")
    print("=" * 50)

@app.get("/")
async def root():
    """Root endpoint for basic connectivity test"""
    return {"service": "diffusion", "status": "running", "diffusers": DIFFUSERS_AVAILABLE}

# Global pipeline instances (loaded lazily)
sd15_pipe = None
sdxl_pipe = None

# Generation status tracking
generation_jobs = {}


class ModelType(str, Enum):
    SD15 = "sd15"
    SDXL = "sdxl"


class GenerationStatus(str, Enum):
    PENDING = "pending"
    LOADING_MODEL = "loading_model"
    GENERATING = "generating"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class GenerationRequest(BaseModel):
    prompt: str
    negative_prompt: Optional[str] = "blurry, bad quality, distorted, ugly, deformed, low resolution, artifacts, noise, watermark, text"
    width: int = 768
    height: int = 768
    steps: int = 30
    guidance_scale: float = 7.5
    model: ModelType = ModelType.SD15
    seed: Optional[int] = None
    
    @field_validator('width', 'height')
    @classmethod
    def validate_dimensions(cls, v: int, info) -> int:
        if v <= 0:
            raise ValueError(f'{info.field_name} must be a positive integer, got {v}')
        if v > 4096:
            raise ValueError(f'{info.field_name} must be at most 4096, got {v}')
        return v
    
    @field_validator('steps')
    @classmethod
    def validate_steps(cls, v: int) -> int:
        if v <= 0:
            raise ValueError(f'steps must be a positive integer, got {v}')
        if v > 200:
            raise ValueError(f'steps must be at most 200, got {v}')
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


def load_sd15_pipeline():
    """Load Stable Diffusion 1.5 pipeline (fast generation)"""
    global sd15_pipe
    if not DIFFUSERS_AVAILABLE:
        print("Diffusers not available, using mock mode")
        return None
    if sd15_pipe is None:
        print("Loading SD 1.5 pipeline...")
        device = "cuda" if torch.cuda.is_available() else "cpu"
        dtype = torch.float16 if torch.cuda.is_available() else torch.float32
        
        # Use the model that works in test_stablediff.py
        model_id = "GraydientPlatformAPI/realcartoon-real17"
        print(f"  Loading model: {model_id}")
        print(f"  Device: {device}, dtype: {dtype}")
        
        sd15_pipe = StableDiffusionPipeline.from_pretrained(
            model_id,
            torch_dtype=dtype,
            safety_checker=None
        ).to(device)
        sd15_pipe.enable_attention_slicing()
        print(f"SD 1.5 pipeline loaded on {device}!")
    return sd15_pipe


def load_sdxl_pipeline():
    """Load Stable Diffusion XL pipeline (high quality)"""
    global sdxl_pipe
    if not DIFFUSERS_AVAILABLE:
        print("Diffusers not available, using mock mode")
        return None
    if sdxl_pipe is None:
        print("Loading SDXL pipeline...")
        device = "cuda" if torch.cuda.is_available() else "cpu"
        dtype = torch.float16 if torch.cuda.is_available() else torch.float32
        sdxl_pipe = StableDiffusionXLPipeline.from_pretrained(
            "stabilityai/stable-diffusion-xl-base-1.0",
            torch_dtype=dtype
        ).to(device)
        sdxl_pipe.scheduler = DPMSolverMultistepScheduler.from_config(
            sdxl_pipe.scheduler.config
        )
        sdxl_pipe.enable_vae_slicing()
        sdxl_pipe.enable_vae_tiling()
        print(f"SDXL pipeline loaded on {device}!")
    return sdxl_pipe


def image_to_base64(image: Image.Image, format_type: str = "PNG") -> str:
    """Convert PIL Image to base64 string"""
    buffered = io.BytesIO()
    
    try:
        # Always work with a copy to avoid modifying original
        img_copy = image.copy()
        
        # Get the actual format string
        fmt = format_type.upper()
        if fmt == "JPG":
            fmt = "JPEG"
        
        # Ensure image is in a compatible mode for the target format
        if fmt == "PNG":
            # PNG supports RGB, RGBA, L, LA, P modes
            if img_copy.mode not in ('RGB', 'RGBA', 'L', 'LA', 'P'):
                img_copy = img_copy.convert("RGB")
        elif fmt == "JPEG":
            # JPEG only supports RGB and L modes (no alpha)
            if img_copy.mode not in ('RGB', 'L'):
                img_copy = img_copy.convert("RGB")
        else:
            # For other formats, convert to RGB as safest option
            if img_copy.mode not in ('RGB', 'RGBA'):
                img_copy = img_copy.convert("RGB")
            fmt = "PNG"  # Default to PNG
        
        # Save with explicit format
        img_copy.save(buffered, format=fmt)
        
        result = base64.b64encode(buffered.getvalue()).decode()
        return result
    except Exception as e:
        print(f"Error in image_to_base64: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()
        # Try one more time with basic RGB PNG
        try:
            buffered2 = io.BytesIO()
            rgb_image = image.convert("RGB")
            rgb_image.save(buffered2, format="PNG")
            return base64.b64encode(buffered2.getvalue()).decode()
        except Exception as e2:
            print(f"Fallback also failed: {e2}")
            raise RuntimeError(f"Failed to convert image to base64: {e}")


def progress_callback(job_id: str, step: int, total_steps: int):
    """Update job progress"""
    if job_id in generation_jobs:
        generation_jobs[job_id]["progress"] = (step / total_steps) * 100
        generation_jobs[job_id]["status"] = GenerationStatus.GENERATING


def generate_mock_image(prompt: str, width: int, height: int) -> Image.Image:
    """Generate a placeholder image when diffusers is not available"""
    import random
    
    # Create a gradient image with noise
    img = Image.new('RGB', (width, height))
    pixels = img.load()
    
    # Random gradient colors based on prompt hash
    seed = hash(prompt) % 10000
    random.seed(seed)
    
    r1, g1, b1 = random.randint(30, 100), random.randint(30, 100), random.randint(80, 150)
    r2, g2, b2 = random.randint(80, 150), random.randint(30, 100), random.randint(80, 150)
    
    for y in range(height):
        for x in range(width):
            # Gradient
            t = x / width
            r = int(r1 * (1 - t) + r2 * t)
            g = int(g1 * (1 - t) + g2 * t)
            b = int(b1 * (1 - t) + b2 * t)
            
            # Add some noise
            noise = random.randint(-20, 20)
            r = max(0, min(255, r + noise))
            g = max(0, min(255, g + noise))
            b = max(0, min(255, b + noise))
            
            pixels[x, y] = (r, g, b)
    
    # Add text overlay
    try:
        from PIL import ImageDraw, ImageFont
        draw = ImageDraw.Draw(img)
        
        # Try to use a nice font, fall back to default
        try:
            font = ImageFont.truetype("arial.ttf", min(width, height) // 15)
            small_font = ImageFont.truetype("arial.ttf", min(width, height) // 25)
        except:
            font = ImageFont.load_default()
            small_font = font
        
        # Draw "AI Generated" text
        text1 = "AI Generated (Mock)"
        bbox1 = draw.textbbox((0, 0), text1, font=font)
        text_width1 = bbox1[2] - bbox1[0]
        draw.text(((width - text_width1) // 2, height // 3), text1, fill=(255, 255, 255), font=font)
        
        # Draw prompt (truncated)
        display_prompt = prompt[:50] + "..." if len(prompt) > 50 else prompt
        bbox2 = draw.textbbox((0, 0), display_prompt, font=small_font)
        text_width2 = bbox2[2] - bbox2[0]
        draw.text(((width - text_width2) // 2, height // 2), display_prompt, fill=(200, 200, 200), font=small_font)
        
        # Draw "Install diffusers for real generation"
        text3 = "Install diffusers for real generation"
        bbox3 = draw.textbbox((0, 0), text3, font=small_font)
        text_width3 = bbox3[2] - bbox3[0]
        draw.text(((width - text_width3) // 2, height * 2 // 3), text3, fill=(150, 150, 150), font=small_font)
    except Exception as e:
        print(f"Could not add text overlay: {e}")
    
    return img


async def generate_image_task(job_id: str, request: GenerationRequest):
    """Background task for image generation"""
    try:
        generation_jobs[job_id]["status"] = GenerationStatus.LOADING_MODEL
        
        # Check if diffusers is available
        if not DIFFUSERS_AVAILABLE:
            # Use mock generation
            generation_jobs[job_id]["status"] = GenerationStatus.GENERATING
            generation_jobs[job_id]["estimated_time"] = 2.0
            
            # Simulate some progress
            for i in range(5):
                await asyncio.sleep(0.3)
                generation_jobs[job_id]["progress"] = (i + 1) * 20
            
            # Generate mock image
            image = generate_mock_image(request.prompt, request.width, request.height)
            image_data = image_to_base64(image)
            
            generation_jobs[job_id]["status"] = GenerationStatus.COMPLETED
            generation_jobs[job_id]["progress"] = 100.0
            generation_jobs[job_id]["image_data"] = f"data:image/png;base64,{image_data}"
            generation_jobs[job_id]["completed_at"] = datetime.utcnow().isoformat()
            print(f"Job {job_id} completed (mock mode)")
            return
        
        # Select pipeline based on model
        if request.model == ModelType.SD15:
            print(f"Using SD 1.5 model for job {job_id}")
            print(f"  - Dimensions: {request.width}x{request.height}")
            print(f"  - Steps: {request.steps}")
            print(f"  - Guidance: {request.guidance_scale}")
            pipe = load_sd15_pipeline()
            estimated_time = 5.0  # ~5 seconds for SD 1.5
        else:
            print(f"Using SDXL model for job {job_id}")
            print(f"  - Dimensions: {request.width}x{request.height}")
            print(f"  - Steps: {request.steps}")
            print(f"  - Guidance: {request.guidance_scale}")
            pipe = load_sdxl_pipeline()
            estimated_time = 15.0  # ~15 seconds for SDXL
        
        if pipe is None:
            raise Exception("Pipeline failed to load")
        
        generation_jobs[job_id]["estimated_time"] = estimated_time
        generation_jobs[job_id]["status"] = GenerationStatus.GENERATING
        
        # Set seed if provided
        generator = None
        device = "cuda" if torch.cuda.is_available() else "cpu"
        if request.seed is not None:
            generator = torch.Generator(device).manual_seed(request.seed)
        
        # Generate image with progress callback
        def callback_fn(pipe, step_index, timestep, callback_kwargs):
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
        
        image = result.images[0]
        
        # Convert to base64
        image_data = image_to_base64(image)
        
        generation_jobs[job_id]["status"] = GenerationStatus.COMPLETED
        generation_jobs[job_id]["progress"] = 100.0
        generation_jobs[job_id]["image_data"] = f"data:image/png;base64,{image_data}"
        generation_jobs[job_id]["completed_at"] = datetime.utcnow().isoformat()
        generation_jobs[job_id]["actual_time"] = time.time() - start_time
        
        print(f"Job {job_id} completed in {time.time() - start_time:.2f}s")
        
    except Exception as e:
        import traceback
        error_msg = str(e)
        print(f"Job {job_id} failed: {error_msg}")
        print(f"Error type: {type(e).__name__}")
        traceback.print_exc()
        generation_jobs[job_id]["status"] = GenerationStatus.FAILED
        generation_jobs[job_id]["error"] = f"{type(e).__name__}: {error_msg}"


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    cuda_available = torch.cuda.is_available()
    return {
        "status": "healthy",
        "diffusers_available": DIFFUSERS_AVAILABLE,
        "cuda_available": cuda_available,
        "device": torch.cuda.get_device_name(0) if cuda_available else "cpu",
        "sd15_loaded": sd15_pipe is not None,
        "sdxl_loaded": sdxl_pipe is not None,
        "mode": "real" if DIFFUSERS_AVAILABLE else "mock",
    }


@app.post("/generate", response_model=GenerationResponse)
async def generate_image(request: GenerationRequest, background_tasks: BackgroundTasks):
    """
    Start an image generation job.
    Returns immediately with a job ID that can be polled for status.
    """
    job_id = str(uuid.uuid4())
    created_at = datetime.utcnow().isoformat()
    
    # Estimate time based on model, steps, and image size
    # Real-world benchmarks on typical GPU (RTX 3060/4060):
    # - SD 1.5: ~0.5-0.8s per step at 512x512
    # - SDXL: ~2-3s per step at 1024x1024
    # CPU is roughly 10-20x slower
    is_cuda = torch.cuda.is_available()
    
    # Calculate size multiplier (larger images take longer)
    base_pixels = 512 * 512
    actual_pixels = max(1, request.width * request.height)  # Ensure positive value
    size_multiplier = (actual_pixels / base_pixels) ** 0.5  # Square root scaling
    
    if request.model == ModelType.SD15:
        # SD 1.5: ~0.6s per step on GPU, ~8s per step on CPU
        time_per_step = 0.6 if is_cuda else 8.0
        model_load_time = 5.0 if sd15_pipe is None else 0.0
    else:  # SDXL
        # SDXL: ~2.5s per step on GPU, ~40s per step on CPU
        time_per_step = 2.5 if is_cuda else 40.0
        model_load_time = 15.0 if sdxl_pipe is None else 0.0
    
    estimated_time = model_load_time + (request.steps * time_per_step * size_multiplier)
    
    # Initialize job
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
    
    # Start background task
    background_tasks.add_task(generate_image_task, job_id, request)
    
    return GenerationResponse(
        job_id=job_id,
        status=GenerationStatus.PENDING,
        model=request.model,
        progress=0.0,
        estimated_time=estimated_time,
        created_at=created_at,
    )


@app.get("/job/{job_id}", response_model=JobStatusResponse)
async def get_job_status(job_id: str):
    """Get the status of a generation job"""
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


@app.get("/jobs")
async def list_jobs():
    """List all generation jobs"""
    return {
        "jobs": [
            {
                "job_id": job["job_id"],
                "status": job["status"],
                "model": job["model"],
                "progress": job["progress"],
                "created_at": job["created_at"],
                "prompt": job["request"]["prompt"][:50] + "..." if len(job["request"]["prompt"]) > 50 else job["request"]["prompt"],
            }
            for job in generation_jobs.values()
        ],
        "total": len(generation_jobs),
    }


@app.delete("/job/{job_id}")
async def delete_job(job_id: str):
    """Delete a completed job"""
    if job_id not in generation_jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    
    del generation_jobs[job_id]
    return {"message": "Job deleted"}


@app.post("/generate/sync", response_model=GenerationResponse)
async def generate_image_sync(request: GenerationRequest):
    """
    Synchronous image generation (waits for completion).
    Use for smaller jobs or when immediate response is needed.
    """
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
    
    # Run generation
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


# =============================================================================
# CUTOUT SERVICE - Background Removal for Foreground Assets
# =============================================================================

# Try to import rembg for background removal
REMBG_AVAILABLE = False
rembg_remove = None

try:
    from rembg import remove as rembg_remove_fn
    rembg_remove = rembg_remove_fn
    REMBG_AVAILABLE = True
    print("[OK] rembg loaded successfully for background removal")
except ImportError as e:
    print(f"[WARNING] rembg not available: {e}")
    print("  Install with: pip install rembg[gpu]")


class CutoutRequest(BaseModel):
    """Request for background removal cutout"""
    image_data: str  # Base64 encoded image (with or without data URI prefix)
    feather_radius: int = 0  # Edge feathering in pixels (0-10)
    threshold: int = 128  # Alpha threshold (0-255)
    refine_mask: bool = True  # Apply edge refinement
    output_format: str = "png"  # Output format (png for transparency)


class CutoutResponse(BaseModel):
    """Response with cutout image"""
    success: bool
    image_data: Optional[str] = None  # Base64 encoded PNG with transparency
    original_size: Optional[tuple] = None
    processing_time: Optional[float] = None
    error: Optional[str] = None


def decode_base64_image(image_data: str) -> Image.Image:
    """Decode base64 image data to PIL Image"""
    # Remove data URI prefix if present
    if "," in image_data:
        image_data = image_data.split(",", 1)[1]
    
    image_bytes = base64.b64decode(image_data)
    return Image.open(io.BytesIO(image_bytes))


def apply_feathering(image: Image.Image, radius: int) -> Image.Image:
    """Apply feathering (gaussian blur) to alpha channel edges"""
    if radius <= 0 or image.mode != "RGBA":
        return image
    
    from PIL import ImageFilter
    
    # Extract alpha channel
    r, g, b, a = image.split()
    
    # Apply gaussian blur to alpha for feathered edges
    a_blurred = a.filter(ImageFilter.GaussianBlur(radius=radius))
    
    # Recombine
    return Image.merge("RGBA", (r, g, b, a_blurred))


def apply_threshold(image: Image.Image, threshold: int) -> Image.Image:
    """Apply threshold to alpha channel to clean up edges"""
    if image.mode != "RGBA":
        return image
    
    r, g, b, a = image.split()
    
    # Apply threshold to alpha
    a = a.point(lambda x: 255 if x > threshold else 0)
    
    return Image.merge("RGBA", (r, g, b, a))


def refine_mask_edges(image: Image.Image) -> Image.Image:
    """Refine mask edges using morphological operations"""
    if image.mode != "RGBA":
        return image
    
    try:
        import numpy as np
        from PIL import ImageFilter
        
        r, g, b, a = image.split()
        
        # Convert alpha to numpy array
        alpha_np = np.array(a)
        
        # Apply slight erosion then dilation to clean edges
        # Using PIL filters as a simpler alternative
        a = a.filter(ImageFilter.MinFilter(3))
        a = a.filter(ImageFilter.MaxFilter(3))
        
        return Image.merge("RGBA", (r, g, b, a))
    except ImportError:
        # If numpy not available, skip refinement
        return image


@app.post("/cutout", response_model=CutoutResponse)
async def remove_background(request: CutoutRequest):
    """
    Remove background from an image to create a foreground asset.
    Uses rembg (U²-Net) for automatic salient object detection.
    """
    start_time = time.time()
    
    try:
        # Decode input image
        input_image = decode_base64_image(request.image_data)
        original_size = input_image.size
        
        # Convert to RGB if necessary (rembg expects RGB input)
        if input_image.mode != "RGB":
            input_image = input_image.convert("RGB")
        
        if not REMBG_AVAILABLE:
            # Fallback: try to create a basic background removal using color detection
            print("Using fallback cutout (rembg not available)")
            
            try:
                import numpy as np
                
                # Convert to numpy array
                img_array = np.array(input_image).astype(np.float32)
                height, width = img_array.shape[:2]
                
                # Try to detect background using corner sampling
                # Sample corners to estimate background color
                sample_size = min(20, width // 10, height // 10)
                corners = [
                    img_array[0:sample_size, 0:sample_size],  # Top-left
                    img_array[0:sample_size, -sample_size:],  # Top-right
                    img_array[-sample_size:, 0:sample_size],  # Bottom-left
                    img_array[-sample_size:, -sample_size:]   # Bottom-right
                ]
                
                # Also sample edges (excluding corners)
                edge_top = img_array[0:sample_size, sample_size:-sample_size]
                edge_bottom = img_array[-sample_size:, sample_size:-sample_size]
                edge_left = img_array[sample_size:-sample_size, 0:sample_size]
                edge_right = img_array[sample_size:-sample_size, -sample_size:]
                
                # Calculate average background color from all edge samples
                all_edge_samples = []
                for c in corners:
                    all_edge_samples.append(c.reshape(-1, 3))
                if edge_top.size > 0:
                    all_edge_samples.append(edge_top.reshape(-1, 3))
                if edge_bottom.size > 0:
                    all_edge_samples.append(edge_bottom.reshape(-1, 3))
                if edge_left.size > 0:
                    all_edge_samples.append(edge_left.reshape(-1, 3))
                if edge_right.size > 0:
                    all_edge_samples.append(edge_right.reshape(-1, 3))
                
                bg_colors = np.concatenate(all_edge_samples)
                bg_mean = np.mean(bg_colors, axis=0)
                bg_std = np.std(bg_colors, axis=0)
                
                # Check if background is likely green screen
                is_greenscreen = bg_mean[1] > bg_mean[0] * 1.3 and bg_mean[1] > bg_mean[2] * 1.3
                is_bluescreen = bg_mean[2] > bg_mean[0] * 1.3 and bg_mean[2] > bg_mean[1] * 1.3
                
                # Create mask based on color distance from background
                color_diff = np.abs(img_array - bg_mean)
                
                if is_greenscreen:
                    # For green screen, weight green channel more heavily
                    weights = np.array([1.0, 2.0, 1.0])
                    color_diff = color_diff * weights
                    threshold = 60
                elif is_bluescreen:
                    # For blue screen, weight blue channel more heavily
                    weights = np.array([1.0, 1.0, 2.0])
                    color_diff = color_diff * weights
                    threshold = 60
                else:
                    threshold = max(40, np.mean(bg_std) * 4)
                
                distance = np.sqrt(np.sum(color_diff ** 2, axis=2))
                
                # Create alpha mask (foreground = 255, background = 0)
                alpha = np.where(distance > threshold, 255, 0).astype(np.uint8)
                
                # Apply morphological operations to clean up the mask
                from PIL import ImageFilter
                alpha_img = Image.fromarray(alpha, mode='L')
                
                # Clean up the mask
                # First, dilate to fill small holes
                alpha_img = alpha_img.filter(ImageFilter.MaxFilter(5))
                # Then erode to restore size  
                alpha_img = alpha_img.filter(ImageFilter.MinFilter(3))
                # Another round to smooth
                alpha_img = alpha_img.filter(ImageFilter.MaxFilter(3))
                alpha_img = alpha_img.filter(ImageFilter.MinFilter(3))
                
                # Slight blur for smoother edges
                alpha_img = alpha_img.filter(ImageFilter.GaussianBlur(radius=1.5))
                
                # Create RGBA result
                result = input_image.convert("RGBA")
                result.putalpha(alpha_img)
                
                print(f"  Background detection: mean={bg_mean.astype(int)}, greenscreen={is_greenscreen}, bluescreen={is_bluescreen}")
                
            except Exception as fallback_error:
                print(f"Advanced fallback failed: {fallback_error}, using simple RGBA conversion")
                import traceback
                traceback.print_exc()
                # Ultimate fallback: just convert to RGBA with full opacity
                result = input_image.convert("RGBA")
        else:
            # Use rembg for proper background removal
            print(f"Processing cutout with rembg...")
            
            # Convert to bytes for rembg
            input_buffer = io.BytesIO()
            input_image.save(input_buffer, format="PNG")
            input_bytes = input_buffer.getvalue()
            
            # Remove background
            output_bytes = rembg_remove(input_bytes)
            result = Image.open(io.BytesIO(output_bytes))
        
        # Apply post-processing based on settings
        if request.refine_mask:
            result = refine_mask_edges(result)
        
        if request.threshold != 128:
            result = apply_threshold(result, request.threshold)
        
        if request.feather_radius > 0:
            result = apply_feathering(result, request.feather_radius)
        
        # Encode result to base64
        output_buffer = io.BytesIO()
        result.save(output_buffer, format="PNG")
        output_base64 = base64.b64encode(output_buffer.getvalue()).decode()
        
        processing_time = time.time() - start_time
        print(f"Cutout completed in {processing_time:.2f}s")
        
        return CutoutResponse(
            success=True,
            image_data=f"data:image/png;base64,{output_base64}",
            original_size=original_size,
            processing_time=processing_time,
        )
        
    except Exception as e:
        print(f"Cutout error: {str(e)}")
        return CutoutResponse(
            success=False,
            error=str(e),
        )


@app.get("/cutout/health")
async def cutout_health():
    """Check cutout service availability"""
    return {
        "available": True,
        "rembg_available": REMBG_AVAILABLE,
        "fallback_mode": not REMBG_AVAILABLE,
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
