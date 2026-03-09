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
    CONTROLNET_UNION_PATH,
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
)
# We use StableDiffusionXLInpaintPipeline directly (lazy-imported inside
# load_inpaint_pipeline()) instead of AutoPipelineForInpainting, because the
# Auto class pulls in auto_pipeline.py → QwenImage → transformers ≥ 5.x.

# Singleton pipeline instances
_sd15_pipe = None
_sdxl_pipe = None
_inpaint_pipe = None
_controlnet_pipe = None
_cosxl_pipe = None


def load_sd15_pipeline():
    """Load / return the cached SD 1.5 pipeline."""
    global _sd15_pipe
    if not DIFFUSERS_AVAILABLE:
        print("Diffusers not available, using mock mode")
        return None
    if _sd15_pipe is None:
        print(f"Loading SD 1.5 pipeline ({SD15_MODEL_ID}) on {DEVICE}…")
        _sd15_pipe = StableDiffusionPipeline.from_pretrained(
            SD15_MODEL_ID,
            torch_dtype=DTYPE,
            safety_checker=None,
        ).to(DEVICE)
        _sd15_pipe.enable_attention_slicing()
        print("SD 1.5 pipeline loaded!")
    return _sd15_pipe


def load_sdxl_pipeline():
    """Load / return the cached SDXL pipeline.

    Uses enable_model_cpu_offload() instead of .to(DEVICE) so that only one
    sub-model (text-encoder / UNet / VAE) lives on the GPU at a time.  This
    keeps peak VRAM around 4-5 GB instead of ~7 GB, which is critical on 8 GB
    cards like the RTX 4070 Laptop where loading everything onto the GPU
    leaves zero room for inference activation tensors.
    """
    global _sdxl_pipe
    if not DIFFUSERS_AVAILABLE:
        print("Diffusers not available, using mock mode")
        return None
    if _sdxl_pipe is None:
        print(f"Loading SDXL pipeline ({SDXL_MODEL_ID}) with CPU-offload…")
        _sdxl_pipe = StableDiffusionXLPipeline.from_pretrained(
            SDXL_MODEL_ID,
            torch_dtype=DTYPE,
        )
        _sdxl_pipe.scheduler = DPMSolverMultistepScheduler.from_config(
            _sdxl_pipe.scheduler.config
        )
        _sdxl_pipe.vae.enable_slicing()
        _sdxl_pipe.vae.enable_tiling()
        _sdxl_pipe.enable_model_cpu_offload()
        print("SDXL pipeline loaded (CPU-offload mode)!")
    return _sdxl_pipe


def is_sd15_loaded() -> bool:
    return _sd15_pipe is not None


def is_sdxl_loaded() -> bool:
    return _sdxl_pipe is not None


def load_inpaint_pipeline():
    """
    Load SDXL inpaint pipeline *independently* with CPU-offload.

    We intentionally do NOT use ``from_pipe(base)`` here because the base
    pipeline's accelerate hooks (from enable_model_cpu_offload) conflict with
    the hooks that would be installed on the inpaint pipeline.  Loading a
    separate copy doubles the CPU-RAM footprint (~13 GB for both) but keeps
    peak VRAM at ~4-5 GB and avoids hooks interfering with each other.

    The standard SDXL base checkpoint works as a 4-channel-UNet inpaint
    pipeline (i.e. img2img-with-mask mode controlled via ``strength``).
    """
    global _inpaint_pipe
    if not DIFFUSERS_AVAILABLE:
        print("Diffusers not available, using mock mode")
        return None
    if _inpaint_pipe is None:
        print(f"Loading SDXL inpaint pipeline ({SDXL_MODEL_ID}) with CPU-offload…")
        from diffusers import StableDiffusionXLInpaintPipeline
        _inpaint_pipe = StableDiffusionXLInpaintPipeline.from_pretrained(
            SDXL_MODEL_ID,
            torch_dtype=DTYPE,
        )
        _inpaint_pipe.scheduler = DPMSolverMultistepScheduler.from_config(
            _inpaint_pipe.scheduler.config, use_karras_sigmas=True
        )
        _inpaint_pipe.vae.enable_slicing()
        _inpaint_pipe.vae.enable_tiling()
        _inpaint_pipe.enable_model_cpu_offload()
        print("SDXL inpaint pipeline loaded (CPU-offload, DPM++ Karras)!")
    return _inpaint_pipe


def load_controlnet_pipeline():
    """
    ControlNet-Union-SDXL pipeline.
    Loads the ControlNet model from the local models/ directory, then builds
    a StableDiffusionXLControlNetPipeline that shares the VAE and text encoders
    from the already-loaded SDXL base.

    At inference time pass control_type=torch.tensor([N]) where N is:
      0=OpenPose  1=Depth  2=Soft-Edge  3=Canny
      4=Tile  5=Normal  6=Segmentation  7=Lineart
    """
    global _controlnet_pipe
    if not DIFFUSERS_AVAILABLE:
        print("Diffusers not available, using mock mode")
        return None
    if _controlnet_pipe is None:
        print(f"Loading ControlNet-Union-SDXL pipeline with CPU-offload…")
        controlnet = ControlNetModel.from_pretrained(
            CONTROLNET_UNION_PATH,
            torch_dtype=DTYPE,
        )
        base = load_sdxl_pipeline()
        if base is None:
            return None
        _controlnet_pipe = StableDiffusionXLControlNetPipeline(
            vae=base.vae,
            text_encoder=base.text_encoder,
            text_encoder_2=base.text_encoder_2,
            tokenizer=base.tokenizer,
            tokenizer_2=base.tokenizer_2,
            unet=base.unet,
            controlnet=controlnet,
            scheduler=base.scheduler,
        )
        _controlnet_pipe.vae.enable_slicing()
        _controlnet_pipe.vae.enable_tiling()
        _controlnet_pipe.enable_model_cpu_offload()
        print("ControlNet-Union-SDXL pipeline loaded (CPU-offload mode)!")
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
        cosxl.enable_model_cpu_offload()
        _cosxl_pipe = cosxl
        print("CosXL-Edit pipeline loaded (CPU-offload mode)!")
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