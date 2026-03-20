#!/usr/bin/env python3
"""
download_models.py  –  Download all model weights for the Concept.io diffusion service.

Usage
─────
  python download_models.py              # download everything
  python download_models.py --list       # show what would be downloaded
  python download_models.py --only sam controlnet   # download specific models
  python download_models.py --skip-hf-cache         # skip diffusers prefetch

Prerequisites
─────────────
  pip install huggingface_hub requests tqdm

The script is idempotent — it skips files that already exist (unless --force).
"""

from __future__ import annotations

import argparse
import hashlib
import os
import sys
import time
from pathlib import Path
from typing import Any

# ────────────────────────────────────────────────────────────────
# Paths
# ────────────────────────────────────────────────────────────────
SCRIPT_DIR = Path(__file__).resolve().parent
MODELS_DIR = SCRIPT_DIR / "models"

# ────────────────────────────────────────────────────────────────
# Model registry
# ────────────────────────────────────────────────────────────────
# Each entry is keyed by a short CLI-friendly name.
# Supported types:
#   "hf_snapshot"  – clone a subset of a HuggingFace repo into a local dir
#   "hf_file"      – download a single file from a HuggingFace repo
#   "url"          – download from a direct URL
#   "hf_prefetch"  – pre-cache an entire HuggingFace repo (used by diffusers)

MODELS: dict[str, dict[str, Any]] = {
    # ── Local model weights (saved in models/) ──────────────────
    "controlnet-depth": {
        "description": "ControlNet Depth SDXL (distilled) – depth-map conditioning (~315 MB)",
        "type": "hf_prefetch",
        "repo_id": "diffusers/controlnet-depth-sdxl-1.0-small",
    },
    "controlnet-canny": {
        "description": "ControlNet Canny SDXL – edge-map conditioning (~315 MB)",
        "type": "hf_prefetch",
        "repo_id": "diffusers/controlnet-canny-sdxl-1.0",
    },
    "controlnet-pose": {
        "description": "ControlNet OpenPose SDXL – pose skeleton conditioning (~700 MB)",
        "type": "hf_prefetch",
        "repo_id": "xinsir/controlnet-openpose-sdxl-1.0",
    },
    "controlnet-tile": {
        "description": "ControlNet Tile SDXL – tile/upscale conditioning (~700 MB)",
        "type": "hf_prefetch",
        "repo_id": "xinsir/controlnet-tile-sdxl-1.0",
    },
    "controlnet-softedge": {
        "description": "ControlNet SoftEdge SDXL – soft-edge/sketch conditioning (~700 MB)",
        "type": "hf_prefetch",
        "repo_id": "SargeZT/controlnet-sd-xl-1.0-softedge-dexined",
    },
    "cosxl": {
        "description": "CosXL-Edit UNet weights for instruction-based image editing (~5.1 GB)",
        "type": "hf_file",
        "repo_id": "stabilityai/cosxl",
        "filename": "cosxl_edit.safetensors",
        "local_path": MODELS_DIR / "cosxl" / "cosxl_edit.safetensors",
    },
    "ip-adapter": {
        "description": "IP-Adapter-Plus-XL – image prompt adapter for SDXL (~100 MB adapter + ~2.4 GB encoder)",
        "type": "hf_snapshot",
        "repo_id": "h94/IP-Adapter",
        "local_dir": MODELS_DIR / "ip-adapter",
        "allow_patterns": [
            "sdxl_models/ip-adapter-plus_sdxl_vit-h.bin",
            "models/image_encoder/config.json",
            "models/image_encoder/model.safetensors",
        ],
        "verify_file": MODELS_DIR / "ip-adapter" / "sdxl_models" / "ip-adapter-plus_sdxl_vit-h.bin",
    },
    "sam": {
        "description": "Segment Anything Model ViT-B checkpoint (~358 MB)",
        "type": "url",
        "url": "https://dl.fbaipublicfiles.com/segment_anything/sam_vit_b_01ec64.pth",
        "local_path": MODELS_DIR / "sam_vit_b.pth",
        "sha256": "ec2df62732614e57411cdcf32a23f0bea6702a6f",  # first 40 chars only — prefix match
    },
    "pixel-art-lora": {
        "description": "Pixel Art XL v1.1 LoRA weights (~23 MB)",
        "type": "hf_file",
        "repo_id": "nerijs/pixel-art-xl",
        "filename": "pixel-art-xl-v1.1.safetensors",
        "local_path": MODELS_DIR / "pixel-art-xl-v1.1.safetensors",
    },
    # ── HuggingFace-cached models (downloaded to ~/.cache/huggingface/) ─
    "vae": {
        "description": "SDXL VAE fp16-fix – prevents fp16 overflow colour streaks (~335 MB, HF cache)",
        "type": "hf_prefetch",
        "repo_id": "madebyollin/sdxl-vae-fp16-fix",
    },
    "sdxl-base": {
        "description": "Stable Diffusion XL Base 1.0 – main generation backbone (~6.9 GB, HF cache)",
        "type": "hf_prefetch",
        "repo_id": "stabilityai/stable-diffusion-xl-base-1.0",
    },
    "sd15": {
        "description": "SD 1.5 RealCartoon v17 – stylised generation (~4.3 GB, HF cache)",
        "type": "hf_prefetch",
        "repo_id": "GraydientPlatformAPI/realcartoon-real17",
    },
    "annotators": {
        "description": "ControlNet Annotators – Midas depth, OpenPose detectors (HF cache)",
        "type": "hf_prefetch",
        "repo_id": "lllyasviel/Annotators",
    },
}

# Models that live in models/ (not HF cache) — downloaded first
LOCAL_MODELS = ["cosxl", "ip-adapter", "sam", "pixel-art-lora"]
# Models that get prefetched into HF cache
CACHE_MODELS = ["controlnet-depth", "controlnet-canny", "controlnet-pose", "controlnet-tile", "controlnet-softedge", "vae", "sdxl-base", "sd15", "annotators"]

# ────────────────────────────────────────────────────────────────
# Helpers
# ────────────────────────────────────────────────────────────────

def _bold(text: str) -> str:
    return f"\033[1m{text}\033[0m"

def _green(text: str) -> str:
    return f"\033[92m{text}\033[0m"

def _yellow(text: str) -> str:
    return f"\033[93m{text}\033[0m"

def _red(text: str) -> str:
    return f"\033[91m{text}\033[0m"

def _cyan(text: str) -> str:
    return f"\033[96m{text}\033[0m"


def _sizeof_fmt(num: float) -> str:
    """Human-readable file size."""
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if abs(num) < 1024.0:
            return f"{num:3.1f} {unit}"
        num /= 1024.0
    return f"{num:.1f} PB"


def _file_ok(path: Path, min_bytes: int = 1024) -> bool:
    """Return True if file exists and is larger than min_bytes (filters LFS pointers)."""
    return path.is_file() and path.stat().st_size > min_bytes


def _ensure_deps():
    """Check that required packages are installed."""
    missing = []
    try:
        import huggingface_hub  # noqa: F401
    except ImportError:
        missing.append("huggingface_hub")
    try:
        import requests  # noqa: F401
    except ImportError:
        missing.append("requests")
    try:
        import tqdm  # noqa: F401
    except ImportError:
        missing.append("tqdm")

    if missing:
        print(_red(f"Missing packages: {', '.join(missing)}"))
        print(f"  pip install {' '.join(missing)}")
        sys.exit(1)


# ────────────────────────────────────────────────────────────────
# Downloaders
# ────────────────────────────────────────────────────────────────

def download_hf_snapshot(spec: dict, force: bool = False) -> bool:
    """Download a subset of a HuggingFace repo to a local directory."""
    from huggingface_hub import snapshot_download

    local_dir: Path = spec["local_dir"]
    verify = spec.get("verify_file")

    if not force and verify and _file_ok(verify):
        print(f"  {_green('✓')} Already exists: {verify.relative_to(MODELS_DIR)}")
        return True

    local_dir.mkdir(parents=True, exist_ok=True)
    print(f"  Downloading {spec['repo_id']} → {local_dir.relative_to(SCRIPT_DIR)} …")
    snapshot_download(
        repo_id=spec["repo_id"],
        local_dir=str(local_dir),
        allow_patterns=spec.get("allow_patterns"),
        ignore_patterns=spec.get("ignore_patterns"),
        local_dir_use_symlinks=False,
    )
    if verify and _file_ok(verify):
        print(f"  {_green('✓')} Downloaded ({_sizeof_fmt(verify.stat().st_size)})")
        return True
    elif verify:
        print(f"  {_red('✗')} Verify file missing after download: {verify}")
        return False
    return True


def download_hf_file(spec: dict, force: bool = False) -> bool:
    """Download a single file from a HuggingFace repo."""
    from huggingface_hub import hf_hub_download

    local_path: Path = spec["local_path"]

    if not force and _file_ok(local_path):
        print(f"  {_green('✓')} Already exists: {local_path.relative_to(MODELS_DIR)} ({_sizeof_fmt(local_path.stat().st_size)})")
        return True

    local_path.parent.mkdir(parents=True, exist_ok=True)
    print(f"  Downloading {spec['repo_id']}/{spec['filename']} …")
    hf_hub_download(
        repo_id=spec["repo_id"],
        filename=spec["filename"],
        local_dir=str(local_path.parent),
        local_dir_use_symlinks=False,
    )
    if _file_ok(local_path):
        print(f"  {_green('✓')} Downloaded ({_sizeof_fmt(local_path.stat().st_size)})")
        return True
    else:
        print(f"  {_red('✗')} File missing after download: {local_path}")
        return False


def download_url(spec: dict, force: bool = False) -> bool:
    """Download a file from a direct URL with progress bar."""
    import requests
    from tqdm import tqdm

    local_path: Path = spec["local_path"]

    if not force and _file_ok(local_path):
        print(f"  {_green('✓')} Already exists: {local_path.relative_to(MODELS_DIR)} ({_sizeof_fmt(local_path.stat().st_size)})")
        return True

    local_path.parent.mkdir(parents=True, exist_ok=True)
    url = spec["url"]
    print(f"  Downloading {url} …")

    resp = requests.get(url, stream=True, timeout=60)
    resp.raise_for_status()
    total = int(resp.headers.get("content-length", 0))

    tmp_path = local_path.with_suffix(".tmp")
    sha = hashlib.sha256()
    with open(tmp_path, "wb") as f, tqdm(
        total=total, unit="B", unit_scale=True, desc=f"  {local_path.name}", leave=True
    ) as bar:
        for chunk in resp.iter_content(chunk_size=8192):
            f.write(chunk)
            sha.update(chunk)
            bar.update(len(chunk))

    # Rename atomically
    tmp_path.replace(local_path)

    if _file_ok(local_path):
        print(f"  {_green('✓')} Downloaded ({_sizeof_fmt(local_path.stat().st_size)})")
        return True
    else:
        print(f"  {_red('✗')} File missing after download")
        return False


def prefetch_hf_repo(spec: dict, force: bool = False) -> bool:
    """Pre-cache a HuggingFace repo to ~/.cache/huggingface/hub/."""
    from huggingface_hub import snapshot_download

    repo_id = spec["repo_id"]
    print(f"  Pre-caching {repo_id} to HuggingFace cache …")
    try:
        snapshot_download(
            repo_id=repo_id,
            # Exclude documentation, images, and — critically — the full SDXL UNet
            # binaries that some ControlNet repos bundle alongside their own weights.
            # These UNets are never used by the diffusers pipeline (it loads the
            # ControlNet safetensors directly); the .bin files can be 2.5–5 GB each.
            ignore_patterns=[
                "*.md", "*.txt", ".gitattributes", "*.png", "*.jpg", "*.webp",
                "diffusion_pytorch_model*.bin",   # bundled full SDXL UNet (2.5–5 GB)
            ],
        )
        print(f"  {_green('✓')} Cached")
        return True
    except Exception as e:
        print(f"  {_yellow('⚠')} Cache failed (non-fatal): {e}")
        return False


DOWNLOADERS = {
    "hf_snapshot": download_hf_snapshot,
    "hf_file": download_hf_file,
    "url": download_url,
    "hf_prefetch": prefetch_hf_repo,
}


# ────────────────────────────────────────────────────────────────
# CLI
# ────────────────────────────────────────────────────────────────

def list_models():
    """Print a table of all models and their status."""
    print()
    print(_bold("  Model Registry"))
    print("  " + "─" * 74)
    for key, spec in MODELS.items():
        status = "?"
        # Determine status
        if spec["type"] in ("hf_snapshot",):
            vf = spec.get("verify_file")
            status = _green("OK") if vf and _file_ok(vf) else _yellow("MISSING")
        elif spec["type"] in ("hf_file", "url"):
            lp = spec.get("local_path")
            status = _green("OK") if lp and _file_ok(lp) else _yellow("MISSING")
        elif spec["type"] == "hf_prefetch":
            status = _cyan("HF cache")

        tag = "local" if key in LOCAL_MODELS else "cache"
        print(f"  {key:<18s}  [{tag:<5s}]  {status:<10s}  {spec['description']}")

    print("  " + "─" * 74)
    print()


def run_downloads(
    model_keys: list[str],
    force: bool = False,
    skip_cache: bool = False,
) -> tuple[list[str], list[str]]:
    """Download the requested models. Returns (successes, failures)."""
    successes: list[str] = []
    failures: list[str] = []

    for key in model_keys:
        if key not in MODELS:
            print(_red(f"Unknown model key: {key}"))
            failures.append(key)
            continue

        spec = MODELS[key]

        if skip_cache and spec["type"] == "hf_prefetch":
            print(f"  {_yellow('⊘')} Skipping {key} (--skip-hf-cache)")
            continue

        print()
        print(_bold(f"[{key}]") + f"  {spec['description']}")

        downloader = DOWNLOADERS.get(spec["type"])
        if not downloader:
            print(_red(f"  Unknown type: {spec['type']}"))
            failures.append(key)
            continue

        t0 = time.time()
        try:
            ok = downloader(spec, force=force)
        except Exception as e:
            print(_red(f"  Error: {e}"))
            ok = False

        elapsed = time.time() - t0
        if ok:
            successes.append(key)
            if elapsed > 2:
                print(f"  ({elapsed:.0f}s)")
        else:
            failures.append(key)

    return successes, failures


def main():
    parser = argparse.ArgumentParser(
        description="Download model weights for the Concept.io diffusion service.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python download_models.py                  # download everything
  python download_models.py --list           # show status of all models
  python download_models.py --only sam cosxl # download specific models
  python download_models.py --skip-hf-cache  # skip HuggingFace cache prefetch
  python download_models.py --force          # re-download even if files exist
""",
    )
    parser.add_argument(
        "--list", action="store_true",
        help="List all models and their download status, then exit.",
    )
    parser.add_argument(
        "--only", nargs="+", metavar="MODEL",
        help=f"Download only specific models. Choices: {', '.join(MODELS.keys())}",
    )
    parser.add_argument(
        "--skip-hf-cache", action="store_true",
        help="Skip pre-caching of HuggingFace diffusers models (they download on first use).",
    )
    parser.add_argument(
        "--force", action="store_true",
        help="Re-download even if files already exist.",
    )

    args = parser.parse_args()

    # Show banner
    print()
    print(_bold("╔══════════════════════════════════════════════════════╗"))
    print(_bold("║  Concept.io Diffusion Service – Model Downloader    ║"))
    print(_bold("╚══════════════════════════════════════════════════════╝"))

    if args.list:
        list_models()
        return

    _ensure_deps()

    MODELS_DIR.mkdir(parents=True, exist_ok=True)

    # Decide which models to download
    if args.only:
        model_keys = args.only
    else:
        # Local models first, then cache models
        model_keys = LOCAL_MODELS + CACHE_MODELS

    successes, failures = run_downloads(
        model_keys,
        force=args.force,
        skip_cache=args.skip_hf_cache,
    )

    # Summary
    print()
    print(_bold("── Summary ──────────────────────────────────────────"))
    if successes:
        print(f"  {_green('✓')} Downloaded / verified: {', '.join(successes)}")
    if failures:
        print(f"  {_red('✗')} Failed: {', '.join(failures)}")

    # Final status check
    print()
    print(_bold("── Model Status ─────────────────────────────────────"))
    list_models()

    if failures:
        sys.exit(1)


if __name__ == "__main__":
    main()
