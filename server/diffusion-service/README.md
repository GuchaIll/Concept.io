# Diffusion Service

FastAPI-based image generation & editing service powered by Stable Diffusion XL.

## Hardware Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| GPU VRAM  | 6 GB    | 8 GB+       |
| RAM       | 16 GB   | 32 GB       |
| Disk      | ~25 GB  | ~40 GB      |

> All pipelines use `enable_model_cpu_offload()` — peak VRAM stays around 4-5 GB on an RTX 4070 Laptop (8 GB).

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

### 3. Download model weights

```bash
python download_models.py
```

This downloads all required models (~15-20 GB total). See below for selective downloads.

### 4. Start the server

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000
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
python download_models.py --only sam controlnet cosxl

# Skip HuggingFace cache prefetch (models will download on first use)
python download_models.py --skip-hf-cache

# Force re-download
python download_models.py --force
```

### Model Inventory

| Key | Model | Size | Location |
|-----|-------|------|----------|
| `controlnet` | ControlNet-Union-SDXL | ~2.4 GB | `models/controlnet-union-sdxl/` |
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
├── controlnet-union-sdxl/
│   ├── config.json
│   └── diffusion_pytorch_model.safetensors
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

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check |
| `POST` | `/generate` | Text-to-image generation |
| `POST` | `/edit` | Image editing (inpaint, outpaint, controlnet, cosxl) |
| `POST` | `/cutout` | SAM-based background removal |

## Pipelines

- **SDXL Base** – text-to-image generation with DPM++ SDE Karras
- **SDXL Inpaint** – mask-based inpainting (white=modify, black=preserve)
- **ControlNet-Union** – structure-guided generation (depth, pose, canny, etc.)
- **CosXL-Edit** – instruction-based image editing
- **IP-Adapter** – image-prompt guided generation
- **SD 1.5 RealCartoon** – stylised cartoon generation
- **SAM ViT-B** – Segment Anything for automatic cutout/background removal
