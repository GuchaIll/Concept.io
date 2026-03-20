# Diffusion Service

FastAPI-based image generation & editing service powered by Stable Diffusion XL.

## Hardware Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| GPU VRAM  | 6 GB    | 8 GB+       |
| RAM       | 16 GB   | 32 GB       |
| Disk      | ~25 GB  | ~40 GB      |

> All pipelines use `enable_model_cpu_offload()` — peak VRAM stays around 3.5-4 GB on an RTX 4070 Laptop (8 GB).
> Individual ControlNet models (315–700 MB each) are loaded one at a time via an LRU cache with in-place
> `pipe.controlnet` swapping, keeping ControlNet VRAM under 1 GB at any moment.

## Quick Start

### 1. Create & activate conda environment

```bash
conda create -n project python=3.11 -y
conda activate project
```

### 2. Install Python dependencies

```bash
pip install -r requirements.txt
pip install git+https://github.com/facebookresearch/segment-anything.git
```

### 3. (Optional) Speed up HuggingFace downloads

Install `hf_transfer` for 5-10× faster downloads on slow connections before running the download script:

```bash
pip install hf_transfer
export HF_HUB_ENABLE_HF_TRANSFER=1   # Linux/macOS
# $env:HF_HUB_ENABLE_HF_TRANSFER=1  # Windows PowerShell
```

### 4. Download model weights

```bash
python download_models.py
```

This downloads all required models (~16-21 GB total). See below for selective downloads.

### 5. Start the server

```bash
uvicorn server:app --host 0.0.0.0 --port 8000
```

Or use the provided helper:

```bash
bash run.sh
```

## Model Management

Model weights are **not** committed to git (see `.gitignore`). The `download_models.py` script handles downloading everything you need.

### Commands

```bash
# Download all models
python download_models.py

# Check status of all models
python download_models.py --list

# Download only specific models
python download_models.py --only sam cosxl controlnet-depth controlnet-canny

# Skip HuggingFace cache prefetch (models will download on first use)
python download_models.py --skip-hf-cache

# Force re-download
python download_models.py --force
```

### Model Inventory

| Key | Model | Size | Location |
|-----|-------|------|----------|
| `controlnet-depth` | ControlNet Depth SDXL (distilled) | ~315 MB | HuggingFace cache |
| `controlnet-canny` | ControlNet Canny SDXL | ~315 MB | HuggingFace cache |
| `controlnet-pose` | ControlNet OpenPose SDXL | ~700 MB | HuggingFace cache |
| `controlnet-tile` | ControlNet Tile SDXL | ~700 MB | HuggingFace cache |
| `controlnet-softedge` | ControlNet SoftEdge SDXL | ~700 MB | HuggingFace cache |
| `vae` | SDXL VAE fp16-fix | ~335 MB | HuggingFace cache |
| `cosxl` | CosXL-Edit UNet | ~5.1 GB | `models/cosxl/cosxl_edit.safetensors` |
| `ip-adapter` | IP-Adapter-Plus-XL | ~2.5 GB | `models/ip-adapter/` |
| `sam` | Segment Anything ViT-B | ~358 MB | `models/sam_vit_b.pth` |
| `pixel-art-lora` | Pixel Art XL v1.1 LoRA | ~23 MB | `models/pixel-art-xl-v1.1.safetensors` |
| `sdxl-base` | SDXL Base 1.0 | ~6.9 GB | HuggingFace cache |
| `sd15` | RealCartoon v17 (SD 1.5) | ~4.3 GB | HuggingFace cache |
| `annotators` | ControlNet Annotators | ~1.5 GB | HuggingFace cache |

### Directory Structure

```
models/                          # ← gitignored
├── cosxl/
│   └── cosxl_edit.safetensors
├── ip-adapter/
│   ├── sdxl_models/
│   │   └── ip-adapter-plus_sdxl_vit-h.bin
│   └── models/
│       └── image_encoder/
│           ├── config.json
│           └── model.safetensors
├── pixel-art-xl-v1.1.safetensors
└── sam_vit_b.pth
```

All ControlNet and VAE models are loaded directly from the HuggingFace cache (`~/.cache/huggingface/`).

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check |
| `POST` | `/generate` | Text-to-image generation |
| `POST` | `/edit` | Image editing (inpaint, outpaint, controlnet, cosxl) |
| `POST` | `/cutout` | SAM-based background removal |

## Pipelines

- **SDXL Base** – text-to-image generation with DPM++ SDE Karras; uses `madebyollin/sdxl-vae-fp16-fix` to prevent fp16 colour overflow
- **SDXL Inpaint** – mask-based inpainting (white=modify, black=preserve); same fp16-fix VAE
- **Individual ControlNets** – structure-guided generation with one model loaded at a time:
  - `depth` – depth-map conditioning (`diffusers/controlnet-depth-sdxl-1.0-small`)
  - `canny` – edge-map conditioning (`diffusers/controlnet-canny-sdxl-1.0`)
  - `pose` – OpenPose skeleton conditioning (`xinsir/controlnet-openpose-sdxl-1.0`)
  - `tile` – tile/upscale conditioning (`xinsir/controlnet-tile-sdxl-1.0`)
  - `softedge` – soft-edge/sketch conditioning (`SargeZT/controlnet-sd-xl-1.0-softedge-dexined`)
- **CosXL-Edit** – instruction-based image editing
- **IP-Adapter** – image-prompt guided generation
- **SD 1.5 RealCartoon** – stylised cartoon generation
- **SAM ViT-B** – Segment Anything for automatic cutout/background removal

### ControlNet Loading Strategy

The service maintains an LRU cache of loaded ControlNet models. When a request arrives for a specific control type:

1. If the model is already in cache, it is returned immediately.
2. If the cache is full (default size: 1), the least-recently-used model is evicted.
3. The required model is loaded from the HuggingFace cache and assigned to `pipe.controlnet` in-place.

Swapping takes ~10–20 s; a full cold load takes ~60 s. To pre-warm a specific model, send a dummy request or extend the cache size via the `CONTROLNET_CACHE_SIZE` environment variable.
