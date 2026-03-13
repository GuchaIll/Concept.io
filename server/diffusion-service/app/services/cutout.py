# -*- coding: utf-8 -*-
"""
Cutout service — SAM-based foreground extraction with rembg / color-distance fallbacks.

Pipeline priority:
  1. SAM ViT-B  (primary)  — precise edge-aware segmentation
  2. rembg      (fallback)  — U²-Net based, good but aggressive on some images
  3. Color-dist (tertiary)  — heuristic corner-sampling; always available
"""

import io
import math
import base64
import time
from typing import Optional

import numpy as np
from PIL import Image, ImageFilter

from ..config import (
    SAM_AVAILABLE,
    REMBG_AVAILABLE,
    rembg_remove,
    get_sam_model,
)
from ..utils.image import decode_base64_image


# ─────────────────────────────────────────────────────────────────
# Distinct colours used to paint mask proposal overlays
# ─────────────────────────────────────────────────────────────────

DISTINCT_COLORS: list[tuple[int, int, int]] = [
    (255,  80,  80),   # red
    ( 80, 200,  80),   # green
    ( 80, 140, 255),   # blue
    (255, 200,  50),   # yellow
    (200,  80, 255),   # purple
    ( 80, 220, 220),   # cyan
    (255, 140,  50),   # orange
    (255, 100, 200),   # pink
    (100, 255, 150),   # mint
    (220, 160,  80),   # tan
    (160,  80, 220),   # violet
    ( 80, 180, 180),   # teal
    (255, 220, 100),   # light yellow
    (180, 255,  80),   # lime
    ( 80, 120, 220),   # cornflower
    (255,  60, 160),   # hot pink
    (100, 200, 255),   # sky blue
    (200, 100,  60),   # brown
    ( 60, 200, 160),   # seafoam
    (220,  80, 140),   # rose
    (140, 220,  60),   # yellow-green
    ( 60,  80, 200),   # indigo
    (255, 180,  80),   # apricot
    (140,  60, 200),   # deep violet
]


# ─────────────────────────────────────────────────────────────────
# Shared post-processing helpers
# ─────────────────────────────────────────────────────────────────

def apply_feathering(image: Image.Image, radius: int) -> Image.Image:
    """Gaussian-blur the alpha channel for soft edges."""
    if radius <= 0 or image.mode != "RGBA":
        return image
    r, g, b, a = image.split()
    a = a.filter(ImageFilter.GaussianBlur(radius=radius))
    return Image.merge("RGBA", (r, g, b, a))


def apply_threshold(image: Image.Image, threshold: int) -> Image.Image:
    """Binary-threshold the alpha channel."""
    if image.mode != "RGBA":
        return image
    r, g, b, a = image.split()
    a = a.point(lambda x: 255 if x > threshold else 0)
    return Image.merge("RGBA", (r, g, b, a))


def refine_mask_edges(image: Image.Image) -> Image.Image:
    """Clean mask edges with morphological open (erosion → dilation)."""
    if image.mode != "RGBA":
        return image
    try:
        r, g, b, a = image.split()
        a = a.filter(ImageFilter.MinFilter(3))
        a = a.filter(ImageFilter.MaxFilter(3))
        return Image.merge("RGBA", (r, g, b, a))
    except Exception:
        return image


def _mask_to_rgba(image_rgb: np.ndarray, mask: np.ndarray) -> Image.Image:
    """Convert an H×W bool/uint8 mask + RGB array into a Pillow RGBA image."""
    alpha = (mask.astype(np.uint8) * 255)
    rgba = np.dstack((image_rgb, alpha))
    return Image.fromarray(rgba, mode="RGBA")


def _make_overlay(image_rgb: np.ndarray, mask: np.ndarray, color: tuple[int, int, int]) -> str:
    """Return a base64 RGBA PNG: semi-transparent colored overlay for one mask region."""
    h, w = mask.shape
    ch = np.zeros((h, w, 4), dtype=np.uint8)
    ch[mask > 0] = [color[0], color[1], color[2], 150]  # ~60 % opacity
    img = Image.fromarray(ch, "RGBA")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


def _mask_to_b64(mask: np.ndarray) -> str:
    """Encode a boolean/uint8 mask as a base64 grayscale PNG for round-tripping."""
    img = Image.fromarray((mask.astype(np.uint8) * 255), mode="L")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


# ─────────────────────────────────────────────────────────────────
# 1. SAM primary path
# ─────────────────────────────────────────────────────────────────

def _score_auto_mask(m: dict, img_w: int, img_h: int) -> float:
    """
    Score an automatically-generated SAM mask to find the best foreground subject.

    Scoring components (all normalised 0-1):
      • centrality  (0.40) — centroid close to image centre
      • size        (0.35) — subject occupies 5-75 % of image area
      • stability   (0.25) — SAM's own stability score
    """
    seg: np.ndarray = m["segmentation"]
    area: int = m["area"]
    total = img_w * img_h
    if total == 0:
        return 0.0

    area_ratio = area / total

    # Favour subjects in the 5 % - 75 % area band
    if area_ratio < 0.05 or area_ratio > 0.85:
        size_score = 0.0
    elif area_ratio <= 0.5:
        size_score = area_ratio / 0.5           # ramps 0 -> 1 at 50 %
    else:
        size_score = (0.85 - area_ratio) / 0.35  # ramps 1 -> 0 at 85 %

    # Centrality: normalised distance of centroid from image centre
    ys, xs = np.where(seg)
    if len(xs) == 0:
        return 0.0
    cx, cy = img_w / 2, img_h / 2
    cent_x, cent_y = float(np.mean(xs)), float(np.mean(ys))
    max_dist = math.sqrt(cx ** 2 + cy ** 2)
    dist = math.sqrt((cent_x - cx) ** 2 + (cent_y - cy) ** 2)
    centrality_score = 1.0 - min(dist / max_dist, 1.0)

    stability = m.get("stability_score", 0.5)

    return centrality_score * 0.40 + size_score * 0.35 + stability * 0.25


def _sam_cutout(
    image_rgb: np.ndarray,
    point_x: Optional[float] = None,
    point_y: Optional[float] = None,
) -> np.ndarray:
    """
    Run SAM on the image and return an H×W boolean mask for the foreground.

    point_x / point_y: normalised [0, 1] image coordinates of a foreground hint.
      - Provided: SamPredictor point-prompt (most accurate when subject centre is known)
      - Omitted:  SamAutomaticMaskGenerator with heuristic subject selection
    """
    _sam, predictor, mask_generator = get_sam_model()
    h, w = image_rgb.shape[:2]

    if point_x is not None and point_y is not None:
        # ── Point-prompt mode ──────────────────────────────────────
        print(f"  [SAM] Point-prompt mode: ({point_x:.3f}, {point_y:.3f})")
        predictor.set_image(image_rgb)

        px = int(max(0.0, min(1.0, point_x)) * w)
        py = int(max(0.0, min(1.0, point_y)) * h)
        input_point = np.array([[px, py]])
        input_label = np.array([1])  # 1 = foreground

        masks, scores, _ = predictor.predict(
            point_coords=input_point,
            point_labels=input_label,
            multimask_output=True,   # 3 candidate masks at different scales
        )
        best_idx = int(np.argmax(scores))
        print(f"  [SAM] Best mask score: {scores[best_idx]:.4f}")
        return masks[best_idx]

    # ── Automatic mode ─────────────────────────────────────────────
    print("  [SAM] Automatic mask generation...")
    masks = mask_generator.generate(image_rgb)

    if not masks:
        raise ValueError("SAM generated no masks for this image")

    best = max(masks, key=lambda m: _score_auto_mask(m, w, h))
    score = _score_auto_mask(best, w, h)
    area_pct = best["area"] / (w * h) * 100
    print(
        f"  [SAM] Best mask: area={area_pct:.1f}%, "
        f"stability={best.get('stability_score', 0):.3f}, "
        f"composite_score={score:.3f} (from {len(masks)} candidates)"
    )
    return best["segmentation"]


# ─────────────────────────────────────────────────────────────────
# 2. rembg fallback
# ─────────────────────────────────────────────────────────────────

def _rembg_cutout(input_image: Image.Image) -> Image.Image:
    """Run rembg background removal."""
    buf = io.BytesIO()
    input_image.save(buf, format="PNG")
    output_bytes = rembg_remove(buf.getvalue())
    return Image.open(io.BytesIO(output_bytes))


# ─────────────────────────────────────────────────────────────────
# 3. Color-distance tertiary fallback
# ─────────────────────────────────────────────────────────────────

def _color_distance_cutout(input_image: Image.Image) -> Image.Image:
    """
    Heuristic corner-based background removal.
    Samples the image border to estimate background colour then thresholds
    on Euclidean colour distance.  Handles green/blue-screen images specially.
    """
    img_array = np.array(input_image.convert("RGB")).astype(np.float32)
    height, width = img_array.shape[:2]

    sample = max(10, min(width, height) // 20)

    corners = [
        img_array[:sample, :sample],
        img_array[:sample, -sample:],
        img_array[-sample:, :sample],
        img_array[-sample:, -sample:],
    ]
    edges = [
        img_array[:sample, sample:-sample],
        img_array[-sample:, sample:-sample],
        img_array[sample:-sample, :sample],
        img_array[sample:-sample, -sample:],
    ]

    all_samples = [c.reshape(-1, 3) for c in corners]
    for e in edges:
        if e.size > 0:
            all_samples.append(e.reshape(-1, 3))

    bg_colors = np.concatenate(all_samples)
    bg_mean = np.mean(bg_colors, axis=0)
    bg_std = np.std(bg_colors, axis=0)

    is_green = bg_mean[1] > bg_mean[0] * 1.3 and bg_mean[1] > bg_mean[2] * 1.3
    is_blue = bg_mean[2] > bg_mean[0] * 1.3 and bg_mean[2] > bg_mean[1] * 1.3

    diff = np.abs(img_array - bg_mean)
    if is_green:
        diff *= np.array([1.0, 2.0, 1.0])
        color_threshold = 60.0
    elif is_blue:
        diff *= np.array([1.0, 1.0, 2.0])
        color_threshold = 60.0
    else:
        color_threshold = max(40.0, float(np.mean(bg_std)) * 4)

    distance = np.sqrt(np.sum(diff ** 2, axis=2))
    alpha = np.where(distance > color_threshold, 255, 0).astype(np.uint8)

    # Morphological cleanup
    alpha_img = Image.fromarray(alpha, mode="L")
    for filt in (
        ImageFilter.MaxFilter(5),
        ImageFilter.MinFilter(3),
        ImageFilter.MaxFilter(3),
        ImageFilter.MinFilter(3),
        ImageFilter.GaussianBlur(radius=1.5),
    ):
        alpha_img = alpha_img.filter(filt)

    result = input_image.convert("RGBA")
    result.putalpha(alpha_img)
    print(
        f"  [color-dist] bg_mean={bg_mean.astype(int)}, "
        f"green={is_green}, blue={is_blue}, threshold={color_threshold:.1f}"
    )
    return result


# ─────────────────────────────────────────────────────────────────
# Background classification heuristics
# ─────────────────────────────────────────────────────────────────

def _box_blur(arr: np.ndarray, radius: int) -> np.ndarray:
    """
    Fast separable box blur via prefix sums — no scipy/cv2 required.
    arr: float32 H×W or H×W×C.  Returns same shape.
    """
    if radius <= 0:
        return arr
    k = 2 * radius + 1

    def _blur_axis(a: np.ndarray, axis: int) -> np.ndarray:
        pad = [(0, 0)] * a.ndim
        pad[axis] = (radius, radius)
        p = np.pad(a, pad, mode="edge")
        cs = np.cumsum(p, axis=axis)
        slc_hi = [slice(None)] * a.ndim
        slc_lo = [slice(None)] * a.ndim
        slc_hi[axis] = slice(2 * radius, None)
        slc_lo[axis] = slice(None, -2 * radius if 2 * radius else None)
        return (cs[tuple(slc_hi)] - cs[tuple(slc_lo)]) / k

    return _blur_axis(_blur_axis(arr, 0), 1)


def _compute_background_score(
    image_np: np.ndarray,     # H×W×3 uint8
    seg: np.ndarray,          # H×W bool
    corner_frac: float = 0.05,
    border_margin: int = 8,
) -> float:
    """
    Estimate how "background-like" a region is using four CV heuristics.

    Factors:
      1. Flatness      (0.35) — low intra-region colour variance → uniform = background.
      2. Low texture   (0.30) — Laplacian-pyramid residual (box blur difference) is low
                                after multi-scale smoothing → flat = background.
      3. Border touch  (0.20) — high fraction of pixels within `border_margin` of image
                                edge → background wraps the scene.
      4. Corner colour (0.15) — region mean colour close to sampled corner colours
                                → typical background tone.

    Returns a float in [0, 1] where 1.0 = almost certainly background.
    """
    h, w = image_np.shape[:2]
    total_px = int(seg.sum())
    if total_px == 0:
        return 0.0

    img_f = image_np.astype(np.float32)
    pixels = img_f[seg]          # N×3 float32

    # ── 1. Flatness: per-channel std then mean ────────────────────
    std_per_ch = pixels.std(axis=0)           # shape (3,)
    mean_std   = float(std_per_ch.mean())
    # std of ~0 = perfectly flat; ~80 = typical noisy region; cap at 100
    flatness = 1.0 - min(mean_std / 100.0, 1.0)

    # ── 2. Low texture via Laplacian pyramid ──────────────────────
    # Build 3-level pyramid: blur at r=2, 6, 14 — sum of detail levels
    detail = np.zeros((h, w), dtype=np.float32)
    prev = img_f
    for radius in (2, 6, 14):
        blurred = _box_blur(prev, radius)
        detail  += np.abs(img_f - blurred).mean(axis=2)
        prev     = blurred

    region_detail  = float(detail[seg].mean())
    # Normalise against global image mean detail (prevents bright images skewing)
    global_detail  = float(detail.mean()) + 1e-6
    rel_detail     = region_detail / global_detail
    low_texture    = 1.0 - min(rel_detail / 3.0, 1.0)   # rel > 3× global = very textured

    # ── 3. Border contact ─────────────────────────────────────────
    ys, xs = np.where(seg)
    on_border = (
        (ys < border_margin) |
        (ys >= h - border_margin) |
        (xs < border_margin) |
        (xs >= w - border_margin)
    )
    border_touch = float(on_border.sum()) / total_px

    # ── 4. Corner colour similarity ───────────────────────────────
    corner_h = max(1, int(h * corner_frac))
    corner_w = max(1, int(w * corner_frac))
    corners  = np.concatenate([
        img_f[:corner_h,  :corner_w ].reshape(-1, 3),
        img_f[:corner_h,  -corner_w:].reshape(-1, 3),
        img_f[-corner_h:, :corner_w ].reshape(-1, 3),
        img_f[-corner_h:, -corner_w:].reshape(-1, 3),
    ])
    corner_mean = corners.mean(axis=0)              # (3,)
    region_mean = pixels.mean(axis=0)               # (3,)
    # Euclidean distance in RGB space; max possible ≈ 441 (white↔black)
    dist = float(np.linalg.norm(region_mean - corner_mean))
    corner_sim = 1.0 - min(dist / 220.0, 1.0)

    score = (
        flatness    * 0.35 +
        low_texture * 0.30 +
        border_touch * 0.20 +
        corner_sim  * 0.15
    )
    return round(float(score), 4)


# ─────────────────────────────────────────────────────────────────
# Union-Find region merger
# ─────────────────────────────────────────────────────────────────

def _merge_small_regions(
    scored_masks: list[tuple[dict, float]],
    img_w: int,
    img_h: int,
    min_area_ratio: float = 0.02,
    min_groups: int = 2,
) -> list[tuple[dict, float]]:
    """
    Merge every mask whose area_ratio < min_area_ratio into its most-adjacent
    neighbour using Union-Find on pixel-border contacts.

    Algorithm:
      1. Build a label map: each pixel stores the index of the mask covering it.
      2. Count shared-border pixels between every pair of adjacent labels.
      3. Sort small masks ascending by area and union each into its highest-
         contact neighbour, stopping once only min_groups remain.
      4. Re-combine segmentation masks (OR) and re-score the merged groups.

    Returns a new list of (mask_dict, composite_score) tuples.
    """
    n = len(scored_masks)
    if n <= min_groups:
        return scored_masks

    total_px = img_w * img_h
    area_threshold = min_area_ratio * total_px

    # ── Union-Find helpers ────────────────────────────────────────
    parent = list(range(n))
    uf_rank = [0] * n

    def find(x: int) -> int:
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a: int, b: int) -> None:
        ra, rb = find(a), find(b)
        if ra == rb:
            return
        if uf_rank[ra] < uf_rank[rb]:
            ra, rb = rb, ra
        parent[rb] = ra
        if uf_rank[ra] == uf_rank[rb]:
            uf_rank[ra] += 1

    # ── Label map: lowest-index mask wins on overlap ──────────────
    segs  = [m["segmentation"].astype(bool) for m, _ in scored_masks]
    areas = [float(m["area"])               for m, _ in scored_masks]

    label_map = np.full((img_h, img_w), -1, dtype=np.int16)
    for idx in range(n - 1, -1, -1):   # reverse so idx=0 beats idx=1 on tie
        label_map[segs[idx]] = np.int16(idx)

    # ── Adjacency: count shared border pixels between label pairs ─
    adj: dict[tuple[int, int], int] = {}

    def _record_borders(a_map: np.ndarray, b_map: np.ndarray) -> None:
        valid = (a_map >= 0) & (b_map >= 0) & (a_map != b_map)
        a_vals = a_map[valid].astype(np.int32)
        b_vals = b_map[valid].astype(np.int32)
        # Normalise so smaller index is first, then encode as a single int
        lo = np.minimum(a_vals, b_vals)
        hi = np.maximum(a_vals, b_vals)
        pair_ids = lo * n + hi
        unique_pairs, counts = np.unique(pair_ids, return_counts=True)
        for pid, cnt in zip(unique_pairs.tolist(), counts.tolist()):
            key = (pid // n, pid % n)
            adj[key] = adj.get(key, 0) + int(cnt)

    _record_borders(label_map[:-1, :], label_map[1:,  :])   # vertical
    _record_borders(label_map[:, :-1], label_map[:,  1:])   # horizontal

    # ── Merge small regions smallest-first ───────────────────────
    small = sorted(
        [i for i, a in enumerate(areas) if a < area_threshold],
        key=lambda i: areas[i],
    )
    current_groups = n

    for i in small:
        if current_groups <= min_groups:
            break
        pi = find(i)
        # After earlier merges, this group may already be large enough — skip it.
        group_area = sum(areas[j] for j in range(n) if find(j) == pi)
        if group_area >= area_threshold:
            continue
        best_other = -1
        best_cnt   = 0
        for (a, b), cnt in adj.items():
            ra, rb = find(a), find(b)
            if ra == rb:
                continue
            if ra == pi or rb == pi:
                other_root = rb if ra == pi else ra
                if cnt > best_cnt:
                    best_cnt   = cnt
                    best_other = other_root
        if best_other >= 0 and best_cnt > 0:
            union(i, best_other)
            current_groups -= 1

    # ── Rebuild merged mask dicts ─────────────────────────────────
    groups: dict[int, list[int]] = {}
    for i in range(n):
        groups.setdefault(find(i), []).append(i)

    merged: list[tuple[dict, float]] = []
    for root_members in groups.values():
        if len(root_members) == 1:
            merged.append(scored_masks[root_members[0]])
            continue

        # Representative = highest-scoring member
        rep = max(root_members, key=lambda x: scored_masks[x][1])
        rep_score = scored_masks[rep][1]

        new_seg = np.zeros((img_h, img_w), dtype=bool)
        for idx in root_members:
            new_seg |= segs[idx]

        # Weighted-average stability score
        total_area = sum(areas[idx] for idx in root_members)
        w_stability = (
            sum(float(scored_masks[idx][0].get("stability_score", 0.0)) * areas[idx]
                for idx in root_members) / total_area
            if total_area > 0 else 0.0
        )

        new_m = dict(scored_masks[rep][0])
        new_m["segmentation"]    = new_seg
        new_m["area"]            = float(new_seg.sum())
        new_m["stability_score"] = w_stability
        merged.append((new_m, rep_score))

    return merged


# ─────────────────────────────────────────────────────────────────
# Interactive mask-proposal API (Photoshop-style "Object Select")
# ─────────────────────────────────────────────────────────────────

def generate_mask_proposals(
    image_data: str,
    max_proposals: int = 12,
) -> tuple[list[dict], tuple[int, int], str]:
    """
    Run SAM automatic mask generation and return ALL proposals for user selection.

    Unlike ``process_cutout`` this function deliberately does NOT pick a winner.
    It returns every segmented region so the user can click the one they want —
    exactly how Photoshop Object Selection / Select Subject works.

    Returns:
        (proposals, (width, height), engine_name)

        Each proposal dict contains:
          id, overlay (base64 RGBA PNG), mask (base64 grayscale PNG),
          area_ratio, stability_score, composite_score,
          bbox  ([x, y, w, h] normalised 0-1),
          centroid ([cx, cy] normalised 0-1),
          color ([R, G, B])
    """
    input_image = decode_base64_image(image_data)
    original_size = input_image.size           # (width, height)
    input_rgb = input_image.convert("RGB")
    image_np = np.array(input_rgb)
    h, w = image_np.shape[:2]

    if not SAM_AVAILABLE:
        print("[proposals] SAM not available — returning empty proposal list")
        return [], original_size, "unavailable"

    try:
        _sam, _predictor, mask_generator = get_sam_model()
        print(f"[proposals] Running SAM on {w}\u00d7{h} image (max_proposals={max_proposals})...")
        t0 = time.time()
        raw_masks = mask_generator.generate(image_np)
        elapsed = time.time() - t0
        print(f"[proposals] SAM produced {len(raw_masks)} raw masks in {elapsed:.2f}s")

        # Score every mask
        scored = [(m, _score_auto_mask(m, w, h)) for m in raw_masks]

        # ── Union-Find: merge adjacent small regions (< 2 % area) ─
        # Run on the full scored list so small edge fragments can
        # always find a large neighbour to absorb into.
        # Guarantee at least 2 groups (background + subject) remain.
        t1 = time.time()
        scored = _merge_small_regions(scored, w, h, min_area_ratio=0.10, min_groups=2)
        # Re-score after merge (merged masks may have changed area/centroid)
        scored = [(m, _score_auto_mask(m, w, h)) for m, _ in scored]
        print(
            f"[proposals] After merge: {len(scored)} groups "
            f"({len(raw_masks) - len(scored)} small regions absorbed) "
            f"in {time.time() - t1:.2f}s"
        )

        # Sort best-first and take top max_proposals
        scored.sort(key=lambda x: x[1], reverse=True)
        top = scored[:max_proposals]
        print(f"[proposals] Returning top {len(top)} proposals")

        proposals: list[dict] = []
        for i, (m, score) in enumerate(top):
            seg: np.ndarray = m["segmentation"]      # bool H×W
            color = DISTINCT_COLORS[i % len(DISTINCT_COLORS)]
            area_ratio = float(m["area"]) / (w * h)

            ys, xs = np.where(seg)
            if len(xs) > 0:
                bbox_norm = [
                    float(xs.min()) / w,
                    float(ys.min()) / h,
                    float(xs.max() - xs.min() + 1) / w,
                    float(ys.max() - ys.min() + 1) / h,
                ]
                centroid = [float(np.mean(xs)) / w, float(np.mean(ys)) / h]
            else:
                bbox_norm = [0.0, 0.0, 1.0, 1.0]
                centroid = [0.5, 0.5]

            bg_score = _compute_background_score(image_np, seg)

            proposals.append({
                "id": i,
                "overlay": _make_overlay(image_np, seg, color),
                "mask": _mask_to_b64(seg),
                "area_ratio": round(area_ratio, 4),
                "stability_score": round(float(m.get("stability_score", 0.0)), 4),
                "composite_score": round(score, 4),
                "background_score": bg_score,
                "bbox": [round(v, 4) for v in bbox_norm],
                "centroid": [round(v, 4) for v in centroid],
                "color": list(color),
            })
            print(
                f"  [proposals] #{i}: area={area_ratio:.1%}, "
                f"stability={m.get('stability_score', 0):.3f}, score={score:.3f}, "
                f"bg_score={bg_score:.3f}"
            )

        return proposals, original_size, "sam"

    except FileNotFoundError as e:
        print(f"[proposals] SAM checkpoint missing \u2014 {e}")
        return [], original_size, "unavailable"
    except Exception as e:
        import traceback
        print(f"[proposals] SAM error: {type(e).__name__}: {e}")
        traceback.print_exc()
        return [], original_size, "error"


def apply_mask_to_image(
    image_data: str,
    mask_data_list: list[str],
    feather_radius: int = 0,
    threshold: int = 128,
    refine: bool = True,
) -> tuple[Image.Image, tuple[int, int]]:
    """
    Apply one or more grayscale mask PNGs (base64) to an image.

    Multiple masks are merged with a union (OR) before being applied so the
    user can shift-click several proposals to combine them.

    Returns:
        (result_RGBA, (original_width, original_height))
    """
    if not mask_data_list:
        raise ValueError("apply_mask_to_image: at least one mask_data entry is required")

    input_image = decode_base64_image(image_data)
    original_size = input_image.size
    input_rgb = input_image.convert("RGB")
    image_np = np.array(input_rgb)
    h, w = image_np.shape[:2]

    print(f"[apply-mask] Merging {len(mask_data_list)} mask(s) onto {w}\u00d7{h} image")
    merged = np.zeros((h, w), dtype=np.uint8)
    for idx, mask_b64 in enumerate(mask_data_list):
        mask_img = (
            decode_base64_image(mask_b64)
            .convert("L")
            .resize((w, h), Image.NEAREST)
        )
        mask_arr = np.array(mask_img)
        merged = np.maximum(merged, mask_arr)
        print(f"  [apply-mask] Mask {idx}: {int((mask_arr > 127).sum())} foreground pixels")

    binary = (merged > 127).astype(np.uint8)
    result = _mask_to_rgba(image_np, binary)

    if refine:
        result = refine_mask_edges(result)
    if threshold != 128:
        result = apply_threshold(result, threshold)
    if feather_radius > 0:
        result = apply_feathering(result, feather_radius)

    print(f"[apply-mask] Done: {int(binary.sum())} foreground pixels in final mask")

    # ── Tight crop: trim to the bounding box of non-transparent pixels ──
    alpha = np.array(result.split()[3])       # H×W uint8 alpha channel
    rows = np.any(alpha > 0, axis=1)
    cols = np.any(alpha > 0, axis=0)
    if rows.any() and cols.any():
        y0, y1 = int(np.argmax(rows)),     int(len(rows) - 1 - np.argmax(rows[::-1]))
        x0, x1 = int(np.argmax(cols)),     int(len(cols) - 1 - np.argmax(cols[::-1]))
        crop_box = (x0, y0, x1 - x0 + 1, y1 - y0 + 1)   # (left, top, w, h) in px
        result = result.crop((x0, y0, x1 + 1, y1 + 1))
        print(f"[apply-mask] Cropped to {crop_box[2]}×{crop_box[3]} "
              f"at ({crop_box[0]}, {crop_box[1]})")
    else:
        crop_box = (0, 0, w, h)

    return result, original_size, crop_box


# ─────────────────────────────────────────────────────────────────
# Public auto-cutout entry point (single-shot, no user interaction)
# ─────────────────────────────────────────────────────────────────

def process_cutout(
    image_data: str,
    feather_radius: int = 0,
    threshold: int = 128,
    refine: bool = True,
    point_x: Optional[float] = None,
    point_y: Optional[float] = None,
) -> tuple[Image.Image, tuple[int, int]]:
    """
    Remove the background from a base64-encoded image.

    Args:
        image_data:     Base64 image string (data URI or raw).
        feather_radius: Pixels of Gaussian feathering on alpha edges.
        threshold:      Binary alpha threshold (only applied when != 128).
        refine:         Run morphological edge refinement after cutout.
        point_x:        Optional normalised [0-1] X hint for SAM point-prompt.
        point_y:        Optional normalised [0-1] Y hint for SAM point-prompt.

    Returns:
        (result_image_RGBA, (original_width, original_height))
    """
    input_image = decode_base64_image(image_data)
    original_size = input_image.size
    input_rgb = input_image.convert("RGB")

    result: Optional[Image.Image] = None

    # ── 1. Try SAM ────────────────────────────────────────────────
    if SAM_AVAILABLE:
        try:
            print("Processing cutout with SAM...")
            image_np = np.array(input_rgb)
            mask = _sam_cutout(image_np, point_x, point_y)
            result = _mask_to_rgba(image_np, mask)
            print("  [SAM] Cutout complete")
        except FileNotFoundError as e:
            print(f"  [SAM] Checkpoint missing — {e}")
            print("  Falling back to rembg / color-distance")
        except Exception as e:
            import traceback
            print(f"  [SAM] Error: {type(e).__name__}: {e}")
            traceback.print_exc()
            print("  Falling back to rembg / color-distance")

    # ── 2. Try rembg ──────────────────────────────────────────────
    if result is None and REMBG_AVAILABLE:
        try:
            print("Processing cutout with rembg (fallback)...")
            result = _rembg_cutout(input_rgb)
            print("  [rembg] Cutout complete")
        except Exception as e:
            print(f"  [rembg] Error: {type(e).__name__}: {e}")
            print("  Falling back to color-distance")

    # ── 3. Color-distance tertiary fallback ───────────────────────
    if result is None:
        print("Processing cutout with color-distance heuristic (tertiary fallback)...")
        result = _color_distance_cutout(input_rgb)

    # ── Post-processing ───────────────────────────────────────────
    if refine:
        result = refine_mask_edges(result)
    if threshold != 128:
        result = apply_threshold(result, threshold)
    if feather_radius > 0:
        result = apply_feathering(result, feather_radius)

    return result, original_size
