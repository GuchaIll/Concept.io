# -*- coding: utf-8 -*-
"""
Diffusion Service Configuration
Device detection, environment setup, and constants.
"""

import os
import sys
import warnings

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

# Suppress warnings during import
warnings.filterwarnings("ignore", category=UserWarning)
warnings.filterwarnings("ignore", category=FutureWarning)

import torch

# ── Device info ──────────────────────────────────────────────────
CUDA_AVAILABLE: bool = torch.cuda.is_available()
DEVICE: str = "cuda" if CUDA_AVAILABLE else "cpu"
DTYPE = torch.float16 if CUDA_AVAILABLE else torch.float32

# ── Diffusers availability ───────────────────────────────────────
DIFFUSERS_AVAILABLE: bool = False
StableDiffusionPipeline = None
StableDiffusionXLPipeline = None
DPMSolverMultistepScheduler = None
StableDiffusionXLImg2ImgPipeline = None
# AutoPipelineForInpainting is NOT used — it triggers auto_pipeline.py which
# eagerly imports QwenImage → needs transformers>=5.x. We use
# StableDiffusionXLInpaintPipeline directly in services/pipeline.py instead.
ControlNetModel = None
StableDiffusionXLControlNetPipeline = None
EulerDiscreteScheduler = None

try:
    from diffusers import (
        StableDiffusionPipeline as SD15,
        StableDiffusionXLPipeline as SDXL,
        DPMSolverMultistepScheduler as DPMScheduler,
        StableDiffusionXLImg2ImgPipeline as SDXL_IMG2IMG,
        ControlNetModel as CNModel,
        StableDiffusionXLControlNetPipeline as SDXL_CN,
        EulerDiscreteScheduler as EulerScheduler,
    )
    StableDiffusionPipeline = SD15
    StableDiffusionXLPipeline = SDXL
    DPMSolverMultistepScheduler = DPMScheduler
    StableDiffusionXLImg2ImgPipeline = SDXL_IMG2IMG
    ControlNetModel = CNModel
    StableDiffusionXLControlNetPipeline = SDXL_CN
    EulerDiscreteScheduler = EulerScheduler
    DIFFUSERS_AVAILABLE = True

    print("=" * 50)
    print("[OK] Diffusers loaded successfully!")
    print(f"  - PyTorch version: {torch.__version__}")
    print(f"  - CUDA available: {CUDA_AVAILABLE}")
    if CUDA_AVAILABLE:
        print(f"  - GPU: {torch.cuda.get_device_name(0)}")
        print(f"  - CUDA version: {torch.version.cuda}")
        # SDPA backend diagnostics — helps debug slow SDXL inference
        flash_ok = torch.backends.cuda.flash_sdp_enabled()
        mem_eff_ok = torch.backends.cuda.mem_efficient_sdp_enabled()
        math_ok = torch.backends.cuda.math_sdp_enabled()
        print(f"  - SDPA backends: flash={flash_ok}, mem_efficient={mem_eff_ok}, math={math_ok}")
        if not flash_ok and not mem_eff_ok:
            print("  ⚠  No fast SDPA backend available! SDXL will be very slow.")
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

# ── rembg availability ───────────────────────────────────────────
REMBG_AVAILABLE: bool = False
rembg_remove = None

try:
    from rembg import remove as rembg_remove_fn
    rembg_remove = rembg_remove_fn
    REMBG_AVAILABLE = True
    print("[OK] rembg loaded successfully for background removal")
except (ImportError, SystemExit, Exception) as e:
    print(f"[WARNING] rembg not available: {type(e).__name__}: {e}")
    print("  Install with: pip install rembg[gpu]")

# ── SAM — Segment Anything Model ────────────────────────────────
# Primary cutout engine: ViT-B checkpoint (~360 MB, lazy-loaded on first request)
SAM_AVAILABLE: bool = False
_sam_imports: dict = {}  # stores {sam_model_registry, SamPredictor, SamAutomaticMaskGenerator}
_sam_instance = None    # (sam, predictor, mask_generator) — loaded on first use

# Model checkpoint path: override via SAM_MODEL_PATH env var
SAM_MODEL_PATH: str = os.environ.get(
    "SAM_MODEL_PATH",
    os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "models", "sam_vit_b.pth")),
)

try:
    from segment_anything import (
        sam_model_registry as _sam_registry,
        SamPredictor as _SamPredictor,
        SamAutomaticMaskGenerator as _SamAutoMaskGen,
    )
    _sam_imports = {
        "sam_model_registry": _sam_registry,
        "SamPredictor": _SamPredictor,
        "SamAutomaticMaskGenerator": _SamAutoMaskGen,
    }
    SAM_AVAILABLE = True
    print("[OK] segment_anything imported successfully")
    print(f"  - SAM checkpoint path: {SAM_MODEL_PATH}")
    print(f"  - Checkpoint exists: {os.path.exists(SAM_MODEL_PATH)}")
except (ImportError, SystemExit, Exception) as e:
    print(f"[WARNING] segment_anything not available: {type(e).__name__}: {e}")
    print("  Install: pip install git+https://github.com/facebookresearch/segment-anything.git")
    print("  Checkpoint: https://dl.fbaipublicfiles.com/segment_anything/sam_vit_b_01ec64.pth")
    print("  Place at: models/sam_vit_b.pth")


def get_sam_model():
    """
    Lazy-load the SAM ViT-B model on first call; return the cached instance.
    Returns (sam, SamPredictor, SamAutomaticMaskGenerator)
    Raises RuntimeError / FileNotFoundError if unavailable.
    """
    global _sam_instance
    if _sam_instance is not None:
        return _sam_instance

    if not SAM_AVAILABLE:
        raise RuntimeError(
            "segment_anything is not installed. "
            "Run: pip install git+https://github.com/facebookresearch/segment-anything.git"
        )

    model_path = os.path.abspath(SAM_MODEL_PATH)
    if not os.path.exists(model_path):
        raise FileNotFoundError(
            f"SAM checkpoint not found at: {model_path}\n"
            "Download sam_vit_b_01ec64.pth from:\n"
            "  https://dl.fbaipublicfiles.com/segment_anything/sam_vit_b_01ec64.pth\n"
            "and place it at models/sam_vit_b.pth"
        )

    sam_model_registry = _sam_imports["sam_model_registry"]
    SamPredictor = _sam_imports["SamPredictor"]
    SamAutomaticMaskGenerator = _sam_imports["SamAutomaticMaskGenerator"]

    print(f"[SAM] Loading ViT-B from {model_path} on {DEVICE}…")
    sam = sam_model_registry["vit_b"](checkpoint=model_path)
    sam.to(DEVICE)

    predictor = SamPredictor(sam)

    # Tuned for single-subject foreground selection:
    # - higher pred_iou_thresh filters weak masks
    # - higher stability_score_thresh keeps only stable boundaries
    # - min_mask_region_area removes tiny noise masks
    mask_generator = SamAutomaticMaskGenerator(
        sam,
        points_per_side=32,
        pred_iou_thresh=0.86,
        stability_score_thresh=0.92,
        min_mask_region_area=200,
    )

    _sam_instance = (sam, predictor, mask_generator)
    print(f"[SAM] Model loaded (device={DEVICE})")
    return _sam_instance


def offload_sam_to_cpu() -> bool:
    """
    Move SAM model to CPU and free its VRAM.
    
    Called before loading SDXL to avoid memory pressure.
    Returns True if SAM was offloaded, False if it wasn't loaded.
    """
    global _sam_instance
    if _sam_instance is None:
        return False
    
    sam, _predictor, _mask_generator = _sam_instance
    try:
        sam.to("cpu")
        torch.cuda.empty_cache()
        print("[SAM] Offloaded to CPU to free VRAM for SDXL")
        return True
    except Exception as e:
        print(f"[SAM] Warning: failed to offload: {e}")
        return False


def reload_sam_to_gpu() -> bool:
    """
    Move SAM model back to GPU after SDXL is done.
    
    Called when cutout operations are needed again.
    Returns True if SAM was reloaded, False if it wasn't loaded.
    """
    global _sam_instance
    if _sam_instance is None:
        return False
    
    sam, _predictor, _mask_generator = _sam_instance
    try:
        sam.to(DEVICE)
        print(f"[SAM] Reloaded to {DEVICE}")
        return True
    except Exception as e:
        print(f"[SAM] Warning: failed to reload: {e}")
        return False


# ── Model IDs ────────────────────────────────────────────────────
SD15_MODEL_ID = "GraydientPlatformAPI/realcartoon-real17"
SDXL_MODEL_ID = "stabilityai/stable-diffusion-xl-base-1.0"

# ── Individual ControlNet model IDs ──────────────────────────────
# Individual models (300-700 MB each) instead of ControlNet-Union (~1.5 GB).
# Union requires SDXL UNet + ControlNet co-resident → ~7-8 GB VRAM (OOM on
# 8 GB cards).  Individual models bring peak VRAM to ~3.5-4 GB because the
# ControlNet portion is 2-5× smaller.  The pipeline keeps one loaded at a
# time; swapping .controlnet takes ~10-20s vs a full 5-minute cold start.
# Override any entry with an env var (e.g. CONTROLNET_DEPTH_MODEL_ID=...).
CONTROLNET_DEPTH_MODEL_ID: str = os.environ.get(
    "CONTROLNET_DEPTH_MODEL_ID",
    "diffusers/controlnet-depth-sdxl-1.0-small",   # 315 MB distilled
)
CONTROLNET_CANNY_MODEL_ID: str = os.environ.get(
    "CONTROLNET_CANNY_MODEL_ID",
    "diffusers/controlnet-canny-sdxl-1.0",          # 315 MB
)
CONTROLNET_POSE_MODEL_ID: str = os.environ.get(
    "CONTROLNET_POSE_MODEL_ID",
    "xinsir/controlnet-openpose-sdxl-1.0",          # 700 MB, weights-only (no bundled UNet)
)
CONTROLNET_TILE_MODEL_ID: str = os.environ.get(
    "CONTROLNET_TILE_MODEL_ID",
    "xinsir/controlnet-tile-sdxl-1.0",              # 700 MB
)
CONTROLNET_SOFTEDGE_MODEL_ID: str = os.environ.get(
    "CONTROLNET_SOFTEDGE_MODEL_ID",
    "SargeZT/controlnet-sd-xl-1.0-softedge-dexined",  # 700 MB
)

IP_ADAPTER_DIR = os.path.normpath(
    os.path.join(os.path.dirname(__file__), "..", "models", "ip-adapter")
)
IP_ADAPTER_WEIGHTS = "sdxl_models/ip-adapter-plus_sdxl_vit-h.bin"
COSXL_EDIT_PATH = os.path.normpath(
    os.path.join(os.path.dirname(__file__), "..", "models", "cosxl", "cosxl_edit.safetensors")
)
