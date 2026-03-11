#!/usr/bin/env python3
"""
Phase 1 smoke test for the /edit endpoint.

Tests all three modes:
  1. instruction  — CosXL-Edit img2img
  2. inpaint      — SDXL inpaint with mask
  3. controlnet   — ControlNet-Union depth

Usage:
  python smoke_test_edit.py                        # test Python service directly (port 8000)
  python smoke_test_edit.py --via-node             # test through Node proxy  (port 5000)
  python smoke_test_edit.py --mode instruction     # run one mode only
  python smoke_test_edit.py --fast                 # minimal steps (steps=2) for quick routing check
"""
import argparse
import base64
import io
import json
import sys
import time
from pathlib import Path

import urllib.request
import urllib.error

# ── CLI ──────────────────────────────────────────────────────────────────────

parser = argparse.ArgumentParser()
parser.add_argument("--via-node", action="store_true",
                    help="Route through Node server instead of hitting Python directly")
parser.add_argument("--mode", choices=["instruction", "inpaint", "controlnet"],
                    help="Run a single mode only")
parser.add_argument("--fast", action="store_true",
                    help="Use steps=2 to test routing without waiting for full inference")
args = parser.parse_args()

BASE = "http://localhost:5000/api/edit" if args.via_node else "http://localhost:8000/edit"
STEPS = 2 if args.fast else 20
OUT_DIR = Path(__file__).parent / "smoke_output"
OUT_DIR.mkdir(exist_ok=True)

print(f"\n{'='*60}")
print(f"  Phase 1 edit smoke test")
print(f"  Target : {BASE}")
print(f"  Steps  : {STEPS}  ({'fast routing check' if args.fast else 'real inference'})")
print(f"{'='*60}\n")


# ── Helpers ──────────────────────────────────────────────────────────────────

def _make_test_image(w: int = 256, h: int = 256, color=(100, 140, 200)) -> str:
    """Return a solid-colour JPEG as a base64 data-URL (no PIL needed)."""
    try:
        from PIL import Image as PILImage
        img = PILImage.new("RGB", (w, h), color)
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=85)
        b64 = base64.b64encode(buf.getvalue()).decode()
        return f"data:image/jpeg;base64,{b64}"
    except ImportError:
        # Fallback: 1×1 white pixel JPEG (minimal valid JPEG)
        jpeg_1x1 = (
            b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00"
            b"\xff\xdb\x00C\x00\x08\x06\x06\x07\x06\x05\x08\x07\x07\x07\t\t"
            b"\x08\n\x0c\x14\r\x0c\x0b\x0b\x0c\x19\x12\x13\x0f\x14\x1d\x1a"
            b"\x1f\x1e\x1d\x1a\x1c\x1c $.' \",#\x1c\x1c(7),01444\x1f'9=82<.342\x1e"
            b"\xff\xc0\x00\x0b\x08\x00\x01\x00\x01\x01\x01\x11\x00\xff\xc4\x00\x1f"
            b"\x00\x00\x01\x05\x01\x01\x01\x01\x01\x01\x00\x00\x00\x00\x00\x00\x00"
            b"\x00\x01\x02\x03\x04\x05\x06\x07\x08\t\n\x0b\xff\xc4\x00\xb5\x10\x00"
            b"\x02\x01\x03\x03\x02\x04\x03\x05\x05\x04\x04\x00\x00\x01}\x01\x02\x03"
            b"\x00\x04\x11\x05\x12!1A\x06\x13Qa\x07\"q\x142\x81\x91\xa1\x08#B\xb1"
            b"\xc1\x15R\xd1\xf0$3br\x82\t\n\x16\x17\x18\x19\x1a%&'()*456789:CDEFG"
            b"HIJKLMNOPQRSTUVWXYZ\xff\xda\x00\x08\x01\x01\x00\x00?\x00\xfb\xd9"
        )
        b64 = base64.b64encode(jpeg_1x1).decode()
        return f"data:image/jpeg;base64,{b64}"


def _make_white_mask(w: int = 256, h: int = 256) -> str:
    """Return a white (fully-inpaint) grayscale PNG as base64."""
    from PIL import Image as PILImage
    mask = PILImage.new("L", (w, h), 255)
    buf = io.BytesIO()
    mask.save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


def post(payload: dict) -> dict:
    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        BASE,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=600) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        return {"success": False, "processingTime": 0, "error": f"HTTP {e.code}: {body[:300]}"}
    except Exception as e:
        return {"success": False, "processingTime": 0, "error": str(e)}


def save_result(result: dict, tag: str) -> None:
    # Accept both camelCase (Node proxy) and snake_case (Python direct)
    raw = result.get("imageData") or result.get("image_data", "")
    if not raw:
        return
    if "," in raw:
        raw = raw.split(",", 1)[1]
    out_path = OUT_DIR / f"{tag}.png"
    out_path.write_bytes(base64.b64decode(raw))
    print(f"  → saved: {out_path}")


def run_test(label: str, payload: dict) -> bool:
    print(f"[{label}]")
    t0 = time.time()
    result = post(payload)
    elapsed = time.time() - t0
    ok = result.get("success", False)
    pt = result.get("processingTime") or result.get("processing_time", elapsed)
    status = "✓ PASS" if ok else "✗ FAIL"
    print(f"  {status}  wall={elapsed:.1f}s  service={pt:.2f}s")
    if not ok:
        print(f"  error: {result.get('error', 'unknown')}")
    else:
        save_result(result, label.lower().replace(" ", "_"))
    return ok


# ── Tests ─────────────────────────────────────────────────────────────────────

src = _make_test_image()
results = []

# Node proxy uses camelCase; Python service uses snake_case
VIA_NODE = args.via_node

def field(camel: str, snake: str):
    return camel if VIA_NODE else snake

run_modes = [args.mode] if args.mode else ["instruction", "inpaint", "controlnet"]

if "instruction" in run_modes:
    results.append(run_test("instruction", {
        field("imageData",     "image_data"):    src,
        "prompt": "make the background a vibrant sunset",
        "mode": "instruction",
        "model": "edit",
        "strength": 0.7,
        "steps": STEPS,
        field("guidanceScale", "guidance_scale"): 7.5,
        "width": 256,
        "height": 256,
    }))

if "inpaint" in run_modes:
    mask = _make_white_mask()
    results.append(run_test("inpaint", {
        field("imageData", "image_data"): src,
        field("maskData",  "mask_data"):  mask,
        "prompt": "a red sofa on a white background",
        "mode": "inpaint",
        "model": "edit",
        "strength": 0.99,
        "steps": STEPS,
        field("guidanceScale", "guidance_scale"): 7.5,
        "width": 256,
        "height": 256,
    }))

if "controlnet" in run_modes:
    results.append(run_test("controlnet", {
        field("imageData",       "image_data"):      src,
        "prompt": "a detailed fantasy landscape",
        "mode": "controlnet",
        "model": "edit",
        field("controlnetType",  "controlnet_type"):  1,
        field("controlnetScale", "controlnet_scale"): 0.8,
        "steps": STEPS,
        field("guidanceScale",   "guidance_scale"):   7.5,
        "width": 256,
        "height": 256,
    }))

# ── Summary ───────────────────────────────────────────────────────────────────

passed = sum(results)
total  = len(results)
print(f"\n{'='*60}")
print(f"  Result: {passed}/{total} passed")
print(f"  Output images: {OUT_DIR}")
print(f"{'='*60}\n")
sys.exit(0 if passed == total else 1)
