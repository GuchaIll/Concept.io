# -*- coding: utf-8 -*-
"""
Pipeline Manager — lazy-loading of Stable Diffusion pipelines.
"""

import torch
from ..config import (
    DIFFUSERS_AVAILABLE,
    DEVICE,
    DTYPE,
    SD15_MODEL_ID,
    SDXL_MODEL_ID,
    CONTROLNET_DEPTH_MODEL_ID,
    CONTROLNET_CANNY_MODEL_ID,
    CONTROLNET_POSE_MODEL_ID,
    CONTROLNET_TILE_MODEL_ID,
    CONTROLNET_SOFTEDGE_MODEL_ID,
    IP_ADAPTER_DIR,
    IP_ADAPTER_WEIGHTS,
    COSXL_EDIT_PATH,
    StableDiffusionPipeline,
    StableDiffusionXLPipeline,
    StableDiffusionXLImg2ImgPipeline,
    ControlNetModel,
    StableDiffusionXLControlNetPipeline,
    EulerDiscreteScheduler,
    DPMSolverMultistepScheduler,
    offload_sam_to_cpu,
)
# We use StableDiffusionXLInpaintPipeline directly (lazy-imported inside
# load_inpaint_pipeline()) instead of AutoPipelineForInpainting, because the
# Auto class pulls in auto_pipeline.py → QwenImage → transformers ≥ 5.x.

# Singleton pipeline instances
_sd15_pipe = None
_sdxl_pipe = None
_sdxl_refiner_pipe = None
_inpaint_pipe = None
_controlnet_pipe = None
_cosxl_pipe = None


def _offload_pipeline(pipe, label: str):
    """Move a pipeline to CPU and free its VRAM."""
    if pipe is not None:
        try:
            pipe.to("cpu")
            torch.cuda.empty_cache()
            print(f"Offloaded {label} to CPU to free VRAM")
        except Exception as e:
            print(f"Warning: failed to offload {label}: {e}")


def load_sd15_pipeline():
    """Load / return the cached SD 1.5 pipeline.

    Automatically offloads SDXL and SAM to CPU first so we don't OOM.
    """
    global _sd15_pipe, _sdxl_pipe, _sdxl_refiner_pipe
    if not DIFFUSERS_AVAILABLE:
        print("Diffusers not available, using mock mode")
        return None

    # ── Offload competing models so we don't OOM ──
    if _sdxl_pipe is not None:
        _offload_pipeline(_sdxl_pipe, "SDXL base")
        _sdxl_pipe = None
    if _sdxl_refiner_pipe is not None:
        _offload_pipeline(_sdxl_refiner_pipe, "SDXL refiner")
        _sdxl_refiner_pipe = None
    
    # SAM ViT-B uses ~400 MB VRAM — offload it
    offload_sam_to_cpu()

    if _sd15_pipe is None:
        print(f"Loading SD 1.5 pipeline ({SD15_MODEL_ID}) on {DEVICE}…")
        _sd15_pipe = StableDiffusionPipeline.from_pretrained(
            SD15_MODEL_ID,
            torch_dtype=DTYPE,
            safety_checker=None,
        ).to(DEVICE)
        _sd15_pipe.enable_attention_slicing()
        print("SD 1.5 pipeline loaded!")
    else:
        # Pipeline exists but may have been offloaded previously — ensure on GPU
        _sd15_pipe.to(DEVICE)
    return _sd15_pipe


def load_sdxl_pipeline():
    """Load / return the cached SDXL pipeline.

    Automatically offloads SD 1.5 and SAM to CPU first so we don't OOM.

    VAE: uses madebyollin/sdxl-vae-fp16-fix instead of the default SDXL VAE.
    The default VAE has known fp16 overflow errors that produce color streaks
    (cyan/magenta) in fine-detail areas like hair and fabric.  The fixed VAE
    is a drop-in replacement with no inference overhead.
    """
    global _sdxl_pipe, _sd15_pipe
    if not DIFFUSERS_AVAILABLE:
        print("Diffusers not available, using mock mode")
        return None

    # ── Offload competing models so we don't OOM ──
    if _sd15_pipe is not None:
        _offload_pipeline(_sd15_pipe, "SD 1.5")
        _sd15_pipe = None
    
    # SAM ViT-B uses ~400 MB VRAM — offload it to leave room for SDXL
    offload_sam_to_cpu()

    if _sdxl_pipe is None:
        from diffusers import AutoencoderKL
        print(f"Loading SDXL pipeline ({SDXL_MODEL_ID}) on {DEVICE}…")
        vae = AutoencoderKL.from_pretrained(
            "madebyollin/sdxl-vae-fp16-fix",
            torch_dtype=DTYPE,
        )
        _sdxl_pipe = StableDiffusionXLPipeline.from_pretrained(
            SDXL_MODEL_ID,
            vae=vae,
            torch_dtype=DTYPE,
        )
        _sdxl_pipe.scheduler = DPMSolverMultistepScheduler.from_config(
            _sdxl_pipe.scheduler.config,
            use_karras_sigmas=True,
        )
        _sdxl_pipe.vae.enable_slicing()
        # Note: do NOT call enable_attention_slicing() here.
        # It replaces the default AttnProcessor2_0 (PyTorch SDPA, which uses
        # fused flash / mem-efficient CUDA kernels) with SlicedAttnProcessor.
        # SlicedAttnProcessor is 10-15× slower on the large attention matrices
        # SDXL produces at ≥ 1024 px.  On an RTX 4070 (8 GB), full SDPA fits
        # comfortably alongside the ~6.8 GB fp16 weights.
        # Also: do NOT enable_tiling() — tiling causes visible seam artefacts
        # at normal generation resolutions (< 2048 px).
        _sdxl_pipe.to(DEVICE)
        print("SDXL pipeline loaded (GPU-resident, fp16-fix VAE, Karras sigmas)!")
    else:
        # Pipeline exists but may have been offloaded previously — ensure on GPU
        _sdxl_pipe.to(DEVICE)
    return _sdxl_pipe


def is_sd15_loaded() -> bool:
    return _sd15_pipe is not None


def is_sdxl_loaded() -> bool:
    return _sdxl_pipe is not None


def load_sdxl_refiner_pipeline():
    """Load / return the cached SDXL Refiner pipeline.

    The refiner was trained on the last 200 noise steps specifically to clean
    up the high-frequency detail (faces, hair, fabric texture) that the base
    SDXL model leaves noisy.  Use with denoising_start=0.8 on the base and
    denoising_end=0.8 on the refiner for the standard two-stage setup.

    The refiner shares the text_encoder_2 / tokenizer_2 from the already-loaded
    base pipeline to avoid duplicating weights.  All sub-models stay
    GPU-resident.  Requires the base pipeline to be loaded first.
    """
    global _sdxl_refiner_pipe
    if not DIFFUSERS_AVAILABLE:
        return None
    if _sdxl_refiner_pipe is None:
        from diffusers import StableDiffusionXLImg2ImgPipeline, AutoencoderKL
        base = load_sdxl_pipeline()
        if base is None:
            return None
        print("Loading SDXL Refiner pipeline on GPU…")
        vae = AutoencoderKL.from_pretrained(
            "madebyollin/sdxl-vae-fp16-fix",
            torch_dtype=DTYPE,
        )
        _sdxl_refiner_pipe = StableDiffusionXLImg2ImgPipeline.from_pretrained(
            "stabilityai/stable-diffusion-xl-refiner-1.0",
            vae=vae,
            text_encoder_2=base.text_encoder_2,
            tokenizer_2=base.tokenizer_2,
            torch_dtype=DTYPE,
        )
        _sdxl_refiner_pipe.scheduler = DPMSolverMultistepScheduler.from_config(
            _sdxl_refiner_pipe.scheduler.config,
            use_karras_sigmas=True,
        )
        _sdxl_refiner_pipe.vae.enable_slicing()
        _sdxl_refiner_pipe.to(DEVICE)
        print("SDXL Refiner loaded (GPU-resident, shared text-encoder-2, fp16-fix VAE)!")
    return _sdxl_refiner_pipe


def load_inpaint_pipeline():
    """
    Load SDXL inpaint pipeline *independently*, GPU-resident.

    We intentionally do NOT use ``from_pipe(base)`` here because sharing
    sub-models between pipeline types causes hook conflicts.  Loading a
    separate copy doubles the CPU-RAM footprint (~13 GB for both) but
    gives each pipeline its own clean model graph.

    The standard SDXL base checkpoint works as a 4-channel-UNet inpaint
    pipeline (i.e. img2img-with-mask mode controlled via ``strength``).
    """
    global _inpaint_pipe
    if not DIFFUSERS_AVAILABLE:
        print("Diffusers not available, using mock mode")
        return None
    if _inpaint_pipe is None:
        # Offload SAM to free VRAM for the inpaint pipeline
        offload_sam_to_cpu()
        
        from diffusers import AutoencoderKL, StableDiffusionXLInpaintPipeline
        print(f"Loading SDXL inpaint pipeline ({SDXL_MODEL_ID}) on {DEVICE}…")
        vae = AutoencoderKL.from_pretrained(
            "madebyollin/sdxl-vae-fp16-fix",
            torch_dtype=DTYPE,
        )
        _inpaint_pipe = StableDiffusionXLInpaintPipeline.from_pretrained(
            SDXL_MODEL_ID,
            vae=vae,
            torch_dtype=DTYPE,
        )
        _inpaint_pipe.scheduler = DPMSolverMultistepScheduler.from_config(
            _inpaint_pipe.scheduler.config, use_karras_sigmas=True
        )
        _inpaint_pipe.vae.enable_slicing()
        _inpaint_pipe.to(DEVICE)
        print("SDXL inpaint pipeline loaded (GPU-resident, fp16-fix VAE, DPM++ Karras)!")
    return _inpaint_pipe


# Maps control type int → (model_id, human_label)
_CONTROLNET_MODEL_MAP: dict[int, tuple[str, str]] = {
    0: (CONTROLNET_POSE_MODEL_ID,     "OpenPose"),
    1: (CONTROLNET_DEPTH_MODEL_ID,    "Depth"),
    2: (CONTROLNET_SOFTEDGE_MODEL_ID, "Soft-Edge"),
    3: (CONTROLNET_CANNY_MODEL_ID,    "Canny"),
    4: (CONTROLNET_TILE_MODEL_ID,     "Tile"),
}

# LRU cache: keeps the last 2 ControlNet model objects in CPU RAM so
# switching between frequently-used types (e.g. depth → canny) is a
# device move rather than a full disk load.  Max 2 because each object
# is 300-700 MB and we don't want to crowd out SDXL's CPU RAM budget.
_cn_lru: list[tuple[int, "ControlNetModel"]] = []  # [(control_type, model), …]
_CN_LRU_MAX = 2

# The single ControlNet pipeline instance.  Its .controlnet attribute is
# swapped per request — the UNet, VAE, and text encoders stay resident.
_controlnet_pipe = None


def _get_controlnet_model(control_type: int) -> "ControlNetModel":
    """
    Return a ControlNet model for the given control_type, using the LRU cache.
    Loads from HuggingFace / local cache on first use of each type.
    Subsequent uses of the same type return the cached CPU-resident object.
    """
    global _cn_lru
    # Cache hit: move to MRU position
    for i, (ct, model) in enumerate(_cn_lru):
        if ct == control_type:
            _cn_lru.append(_cn_lru.pop(i))
            print(f"[controlnet] LRU hit for type {control_type}")
            return model

    # Cache miss: load from HF / disk
    model_id, label = _CONTROLNET_MODEL_MAP.get(
        control_type,
        (CONTROLNET_DEPTH_MODEL_ID, "Depth (fallback)"),
    )
    print(f"[controlnet] Loading {label} ControlNet ({model_id})…")
    model = ControlNetModel.from_pretrained(model_id, torch_dtype=DTYPE)

    # Evict LRU entry if at capacity
    if len(_cn_lru) >= _CN_LRU_MAX:
        evicted_ct, evicted_model = _cn_lru.pop(0)
        del evicted_model
        print(f"[controlnet] Evicted type {evicted_ct} from LRU cache")

    _cn_lru.append((control_type, model))
    print(f"[controlnet] {label} ControlNet loaded and cached")
    return model


def load_controlnet_pipeline(control_type: int = 1):
    """
    Build (once) or return the cached ControlNet pipeline, ensuring the
    correct ControlNet model is loaded for the requested control_type.

    ARCHITECTURE — why individual models + attribute swap instead of Union:
    ControlNet-Union SDXL is ~1.5 GB.  Combined with the SDXL UNet (~2.6 GB)
    and activation tensors, it exceeds 8 GB VRAM.  Individual ControlNet
    models (300-700 MB each) keep peak VRAM at ~3.5-4 GB because the UNet
    and ControlNet are the only large tensors co-resident during inference.

    Instead of rebuilding the full pipeline when the control type changes,
    we swap pipe.controlnet in-place.  The UNet, VAE, and text encoders stay
    loaded; only the ControlNet weights (300-700 MB) are exchanged.  An LRU
    cache of 2 ControlNet objects in CPU RAM means switching between the two
    most-recently-used types is a device move (~2s) rather than a disk load
    (~20s).

    OFFLOAD STRATEGY: All sub-models are GPU-resident via .to(DEVICE).
    Individual ControlNets are small enough that UNet + ControlNet fits
    within 8 GB comfortably.  Peak VRAM ≈ UNet (2.6 GB) + ControlNet
    (0.3-0.7 GB) + activations (~0.5 GB) ≈ 3.4-3.8 GB.
    """
    global _controlnet_pipe
    if not DIFFUSERS_AVAILABLE:
        return None

    cn_model = _get_controlnet_model(control_type)

    if _controlnet_pipe is None:
        # Offload SAM to free VRAM for the ControlNet pipeline
        offload_sam_to_cpu()
        
        from diffusers import AutoencoderKL
        print(f"[controlnet] Building StableDiffusionXLControlNetPipeline…")
        vae = AutoencoderKL.from_pretrained(
            "madebyollin/sdxl-vae-fp16-fix",
            torch_dtype=DTYPE,
        )
        _controlnet_pipe = StableDiffusionXLControlNetPipeline.from_pretrained(
            SDXL_MODEL_ID,
            controlnet=cn_model,
            vae=vae,
            torch_dtype=DTYPE,
        )
        _controlnet_pipe.scheduler = DPMSolverMultistepScheduler.from_config(
            _controlnet_pipe.scheduler.config,
            use_karras_sigmas=True,
        )
        _controlnet_pipe.vae.enable_slicing()
        _controlnet_pipe.to(DEVICE)
        print("[controlnet] Pipeline built (GPU-resident, fp16-fix VAE, Karras).")
    else:
        # Pipeline already exists — just swap the ControlNet model.
        # Move the outgoing model back to CPU before swapping so its VRAM
        # is released before the new model is moved to the device.
        current_device = next(iter(_controlnet_pipe.controlnet.parameters())).device
        if current_device.type != "cpu":
            _controlnet_pipe.controlnet.to("cpu")
        _controlnet_pipe.controlnet = cn_model.to(DEVICE)
        print(f"[controlnet] Swapped ControlNet to type {control_type}.")

    return _controlnet_pipe


def load_cosxl_pipeline():
    """
    CosXL-Edit: builds SDXL img2img pipeline, deep-copies the UNet, then
    overwrites weights from cosxl_edit.safetensors.
    Uses the EDM noise schedule (EulerDiscreteScheduler with specific sigma
    bounds) required by the CosXL training config.
    """
    global _cosxl_pipe
    if not DIFFUSERS_AVAILABLE:
        print("Diffusers not available, using mock mode")
        return None
    if _cosxl_pipe is None:
        import copy
        from safetensors.torch import load_file

        print(f"Loading CosXL-Edit pipeline on {DEVICE}…")
        base = load_sdxl_pipeline()
        if base is None:
            return None

        cosxl = StableDiffusionXLImg2ImgPipeline(
            vae=base.vae,
            text_encoder=base.text_encoder,
            text_encoder_2=base.text_encoder_2,
            tokenizer=base.tokenizer,
            tokenizer_2=base.tokenizer_2,
            unet=copy.deepcopy(base.unet),
            scheduler=copy.deepcopy(base.scheduler),
        )

        # Load CosXL-Edit UNet weights (strict=False ignores unexpected keys)
        state_dict = load_file(COSXL_EDIT_PATH)
        cosxl.unet.load_state_dict(state_dict, strict=False)

        # EDM scheduler — required by CosXL training config
        cosxl.scheduler = EulerDiscreteScheduler.from_config(
            cosxl.scheduler.config,
            sigma_min=0.002,
            sigma_max=120.0,
            timestep_spacing="leading",
            interpolation_type="linear",
        )
        cosxl.vae.enable_slicing()
        cosxl.to(DEVICE)
        _cosxl_pipe = cosxl
        print("CosXL-Edit pipeline loaded (GPU-resident)!")
    return _cosxl_pipe


def attach_ip_adapter(pipe):
    """
    Attach IP-Adapter-Plus-XL to any SDXL-derived pipeline in-place.
    Idempotent — safe to call on every request.
    ip_adapter_scale can be overridden after calling this via
    pipe.set_ip_adapter_scale(value).
    """
    if getattr(pipe, "_ip_adapter_loaded", False):
        return pipe
    pipe.load_ip_adapter(
        IP_ADAPTER_DIR,
        subfolder="sdxl_models",
        weight_name=IP_ADAPTER_WEIGHTS,
    )
    pipe.set_ip_adapter_scale(0.6)
    pipe._ip_adapter_loaded = True
    return pipe