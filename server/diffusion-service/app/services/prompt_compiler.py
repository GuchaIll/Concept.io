# -*- coding: utf-8 -*-
"""
Prompt Compiler — deterministic prompt enrichment for diffusion models.

Pipeline:
    User Prompt → Token Expansion → Template Injection → Quality Tokens → Diffusion

Zero GPU cost, <1 ms latency.  Seeded sampling for reproducibility.
"""

from __future__ import annotations

import hashlib
import random
from typing import Optional

from ..models import ModelType


# ── Asset type (matches the client's AssetType union) ────────────

ASSET_TYPES = {
    "character", "environment", "weapon", "item", "icon",
    "texture", "ui_element", "background", "foreground",
}


# ── Token Banks ──────────────────────────────────────────────────
# Deterministic pools sampled by seed.  Each bank is a list of
# comma-separated token strings; the compiler picks ONE entry.

LIGHTING_TOKENS = [
    "cinematic lighting",
    "dramatic lighting",
    "golden hour lighting",
    "soft studio lighting",
    "volumetric lighting",
    "rim lighting",
    "natural ambient lighting",
    "high-contrast lighting",
]

CAMERA_TOKENS = [
    "35mm lens",
    "85mm lens",
    "wide angle shot",
    "shallow depth of field",
    "close-up shot",
    "establishing shot",
    "eye-level perspective",
]

ATMOSPHERE_TOKENS = [
    "atmospheric fog",
    "depth haze",
    "soft bokeh",
    "lens flare",
    "diffused haze",
    "clean atmosphere",
]

DETAIL_TOKENS = [
    "intricate details",
    "fine textures",
    "sharp focus",
    "highly detailed",
    "crisp details",
]


# ── Expansion Dictionary ────────────────────────────────────────
# key → enrichment tokens appended when the keyword appears in the
# user prompt (case-insensitive substring match).

EXPANSION_DICT: dict[str, str] = {
    # --- Environments & settings ---
    "cyberpunk":    "neon lights, futuristic, rain-slicked streets, blade runner aesthetic",
    "city":         "urban skyline, skyscrapers, metropolitan, street-level detail",
    "forest":       "dense canopy, dappled sunlight, misty undergrowth, lush vegetation",
    "castle":       "medieval stonework, turrets, dramatic sky, ancient architecture",
    "space":        "nebula, star field, cosmic scale, deep space",
    "ocean":        "rolling waves, deep blue water, sea foam, dramatic horizon",
    "mountain":     "rugged peaks, alpine landscape, dramatic elevation, atmospheric perspective",
    "desert":       "sand dunes, arid landscape, heat shimmer, vast horizon",
    "underwater":   "aquatic glow, caustic light patterns, coral reef, marine life",
    "village":      "quaint architecture, cobblestone paths, warm tones, rural charm",
    "ruins":        "crumbling architecture, overgrown vegetation, ancient stonework, weathered surfaces",
    "cave":         "stalactites, dim phosphorescent glow, rocky textures, dark atmosphere",
    "volcano":      "molten lava, smoke plumes, fiery glow, rugged terrain",
    "garden":       "blooming flowers, manicured hedges, soft sunlight, lush greenery",
    "dungeon":      "stone corridors, dim torchlight, dark atmosphere, medieval",

    # --- Character types ---
    "portrait":     "85mm lens, shallow depth of field, soft catchlights, skin detail",
    "warrior":      "battle armor, strong pose, dynamic composition, heroic",
    "mage":         "flowing robes, magical aura, arcane symbols, mystical energy",
    "knight":       "plate armor, heraldic symbols, noble bearing, medieval",
    "elf":          "pointed ears, ethereal beauty, graceful, nature-attuned",
    "dragon":       "massive scales, powerful wings, fire breath, mythical beast",
    "robot":        "metallic surfaces, mechanical joints, glowing elements, high-tech",
    "zombie":       "decayed flesh, dark atmosphere, horror, undead",
    "angel":        "divine wings, radiant glow, ethereal, heavenly",
    "demon":        "dark horns, fiery eyes, sinister aura, infernal",

    # --- Styles ---
    "anime":        "cel-shaded, vibrant colors, manga style, Japanese animation",
    "pixel art":    "8-bit style, retro game graphics, pixelated, limited color palette",
    "watercolor":   "soft washes, paper texture, blended edges, artistic",
    "oil painting": "thick brushstrokes, rich pigments, canvas texture, classical",
    "sketch":       "pencil lines, crosshatching, monochrome, artistic draft",
    "steampunk":    "brass gears, clockwork mechanisms, Victorian, industrial fantasy",
    "vaporwave":    "pastel palette, retro CRT aesthetic, glitch art, 80s nostalgia",
    "gothic":       "dark elegance, ornate architecture, dramatic shadows, moody",
    "fantasy":      "magical atmosphere, mythical elements, enchanted, epic scale",
    "sci-fi":       "advanced technology, futuristic materials, holographic, sleek design",
    "realistic":    "photorealistic, natural lighting, accurate proportions, lifelike detail",

    # --- Objects & items ---
    "sword":        "forged steel, ornate hilt, sharp blade, weapon design",
    "shield":       "heraldic emblem, sturdy construction, defensive gear",
    "potion":       "glass vial, glowing liquid, magical brew, alchemical",
    "crystal":      "faceted surface, refractive light, translucent, gemstone",
    "book":         "leather binding, aged pages, arcane text, tome",
    "treasure":     "gold coins, precious gems, gleaming, pirate loot",
}


# ── Asset Templates ──────────────────────────────────────────────
# {subject} is replaced with the expanded user prompt.
# Templates include contextual bank references resolved at compile time.

def _asset_template(asset_type: Optional[str]) -> dict:
    """Return (positive_template, negative_extra, use_camera, use_lighting)."""
    # Shared positive/negative clauses for all single-subject isolated assets
    _ISO_POS = (
        "single object, centered, isolated, floating, pure white seamless background, "
        "no horizon line, no floor, no depth cues, no perspective background, "
        "studio product render, orthographic feel, evenly lit, shadow very faint or none"
    )
    _ISO_NEG = (
        "background clutter, complex background, textured background, gradient background, "
        "shadows too dark, multiple objects, overlapping objects, cropped, cut off, "
        "border, frame, watermark, text, logo, reflection, busy scene"
    )

    templates: dict[str, dict] = {
        "character": {
            # Anatomy + face + pose — most sensitive type
            "template":  (
                "{subject}, full body, centered, standing pose, neutral pose, facing forward, "
                "clear silhouette, detailed clothing, highly detailed face, symmetrical face, "
                "sharp eyes, clean anatomy, concept art, soft studio lighting, "
                "pure white background, no environment, no props, no floor, no horizon line"
            ),
            "negative":  (
                "deformed face, bad anatomy, extra limbs, cross-eye, asymmetrical eyes, "
                "blurry face, cropped, cut off, multiple characters, crowd, "
                "complex background, textured background, gradient background, "
                "colored background, background clutter, scenery, landscape, sky"
            ),
            "camera":    True,
            "lighting":  True,
        },
        "environment": {
            # Depth + scale + cinematic — forces foreground/mid/background layers
            "template":  (
                "{subject}, wide shot, cinematic composition, "
                "strong foreground midground background separation, atmospheric perspective, "
                "volumetric lighting, detailed environment, immersive, "
                "concept art, matte painting, ultra detailed, 4k"
            ),
            "negative":  "characters, people, close-up, blurry, low detail, flat lighting",
            "camera":    True,
            "lighting":  True,
        },
        "weapon": {
            # Silhouette + isolation — segmentation-ready production asset
            "template":  (
                "{subject}, centered, isolated, full view, clean silhouette, "
                "clear design language, highly detailed, sharp focus, studio lighting, "
                "soft shadow, pure white background, no environment, no props, "
                "product render, concept art"
            ),
            "negative":  (
                "multiple objects, clutter, background, environment, "
                "hands, character holding, cropped, cut off"
            ),
            "camera":    False,
            "lighting":  True,
        },
        "item": {
            # Same silhouette-first approach for general game objects
            "template":  (
                "{subject}, centered, isolated, full view, clean silhouette, "
                "clear design language, highly detailed, sharp focus, studio lighting, "
                "soft shadow, pure white background, no environment, no props, "
                "product render, concept art"
            ),
            "negative":  (
                "multiple objects, clutter, background, environment, "
                "hands, character holding, cropped, cut off"
            ),
            "camera":    False,
            "lighting":  True,
        },
        "icon": {
            "template":  "{subject}, game icon, centered, simple, recognizable, clean edges",
            "negative":  "complex background, text, multiple objects",
            "camera":    False,
            "lighting":  False,
        },
        "texture": {
            "template":  "{subject}, seamless tileable texture, high resolution, uniform pattern",
            "negative":  "objects, characters, text, non-tileable",
            "camera":    False,
            "lighting":  False,
        },
        "ui_element": {
            "template":  "{subject}, UI element, interface design, clean edges, flat style",
            "negative":  "3D, characters, landscape, complex scene",
            "camera":    False,
            "lighting":  False,
        },
        "background": {
            "template":  "{subject}, concept art, matte painting, environment design, wide cinematic composition, expansive vista, painterly style, no characters, empty scene",
            "negative":  "people, person, character, figure, human, creature, animal, portrait, face, text, UI, watermark, logo",
            "camera":    True,
            "lighting":  True,
        },
        "foreground": {
            "template":  f"{{subject}}, {_ISO_POS}",
            "negative":  _ISO_NEG,
            "camera":    True,
            "lighting":  True,
        },
    }
    return templates.get(asset_type or "", templates["foreground"])


# ── Quality Tokens (per model) ───────────────────────────────────

QUALITY_TOKENS = {
    ModelType.SD15: "(masterpiece:1.2), (best quality:1.2), ultra detailed, sharp focus",
    ModelType.SDXL: "ultra detailed, high quality, sharp focus, professional",
}

# Model-specific base negatives (always included)
BASE_NEGATIVE = {
    ModelType.SD15: (
        "(worst quality:1.4), (low quality:1.4), normal quality, lowres, blurry, "
        "bad anatomy, bad hands, missing fingers, extra digits, "
        "deformed iris, deformed pupils, mutated hands, fused fingers, "
        "poorly drawn face, extra limb, missing limb, floating limbs, "
        "disconnected limbs, mutation, disgusting, amputation"
    ),
    ModelType.SDXL: (
        "ugly, deformed, noisy, blurry, low contrast, low quality, "
        "bad anatomy, bad hands, missing fingers, extra digits, "
        "deformed iris, deformed pupils, mutated hands, text, watermark"
    ),
}


# ── Keyword auto-detection for asset type ────────────────────────

_DETECT_RULES: list[tuple[list[str], str]] = [
    (["portrait", "face", "person", "man", "woman", "boy", "girl",
      "warrior", "mage", "knight", "elf", "demon", "angel",
      "character", "hero", "villain"], "character"),
    (["city", "forest", "castle", "mountain", "ocean", "desert",
      "cave", "dungeon", "village", "landscape", "ruins",
      "skyline", "valley", "swamp", "volcano", "garden"], "environment"),
    (["sword", "axe", "bow", "dagger", "staff", "spear",
      "weapon", "blade", "shield"], "weapon"),
    (["potion", "scroll", "ring", "amulet", "gem", "crystal",
      "book", "key", "treasure", "item", "artifact"], "item"),
    (["icon", "button", "badge", "emblem", "symbol"], "icon"),
    (["texture", "pattern", "surface", "material", "tileable"], "texture"),
]


def _auto_detect_asset(prompt_lower: str) -> Optional[str]:
    """Return the best-matching asset type from keywords, or None."""
    for keywords, asset in _DETECT_RULES:
        for kw in keywords:
            if kw in prompt_lower:
                return asset
    return None


# ── Seeded random helper ─────────────────────────────────────────

def _pick(bank: list[str], seed_int: int) -> str:
    """Pick one entry from a bank using a deterministic seed."""
    return bank[seed_int % len(bank)]


def _make_seed(user_seed: Optional[int], prompt: str) -> int:
    """Create a deterministic integer seed for token-bank sampling."""
    if user_seed is not None:
        return user_seed
    # Derive a stable hash from the prompt text
    return int(hashlib.md5(prompt.encode()).hexdigest()[:8], 16)


# ── Public API ───────────────────────────────────────────────────

def compile_prompt(
    prompt: str,
    model: ModelType = ModelType.SD15,
    negative_prompt: Optional[str] = None,
    asset_type: Optional[str] = None,
    seed: Optional[int] = None,
) -> tuple[str, str]:
    """
    Compile a user prompt into an enriched prompt + negative prompt.

    Pipeline:
        1. Keyword expansion (substring dictionary match)
        2. Asset-type template wrapping
        3. Token-bank sampling (lighting, camera, atmosphere, detail)
        4. Model-specific quality tokens
        5. Negative prompt assembly

    Returns (positive_prompt, negative_prompt).
    """
    prompt_lower = prompt.lower().strip()
    seed_int = _make_seed(seed, prompt)

    # ── 1. Keyword expansion ─────────────────────────────────────
    expansions: list[str] = []
    for keyword, tokens in EXPANSION_DICT.items():
        if keyword in prompt_lower:
            expansions.append(tokens)

    expanded = prompt.strip()
    if expansions:
        expanded = f"{expanded}, {', '.join(expansions)}"

    # ── 2. Asset-type template ───────────────────────────────────
    effective_asset = asset_type if asset_type in ASSET_TYPES else None
    if effective_asset is None:
        effective_asset = _auto_detect_asset(prompt_lower)

    tmpl = _asset_template(effective_asset)
    subject = expanded
    compiled = tmpl["template"].replace("{subject}", subject)

    # ── 3. Token-bank sampling ───────────────────────────────────
    bank_parts: list[str] = []
    if tmpl.get("lighting"):
        bank_parts.append(_pick(LIGHTING_TOKENS, seed_int))
    if tmpl.get("camera"):
        bank_parts.append(_pick(CAMERA_TOKENS, seed_int >> 4))
    # Always sample one detail token
    bank_parts.append(_pick(DETAIL_TOKENS, seed_int >> 8))
    # Atmosphere only for environments
    if effective_asset in ("environment", "background"):
        bank_parts.append(_pick(ATMOSPHERE_TOKENS, seed_int >> 12))

    if bank_parts:
        compiled = f"{compiled}, {', '.join(bank_parts)}"

    # ── 4. Quality tokens ────────────────────────────────────────
    quality = QUALITY_TOKENS.get(model, QUALITY_TOKENS[ModelType.SDXL])
    compiled = f"{compiled}, {quality}"

    # ── 5. Negative prompt assembly ──────────────────────────────
    neg_parts: list[str] = []

    # Model base negative (always present)
    base_neg = BASE_NEGATIVE.get(model, BASE_NEGATIVE[ModelType.SDXL])
    neg_parts.append(base_neg)

    # Asset-type negative
    asset_neg = tmpl.get("negative", "")
    if asset_neg:
        neg_parts.append(asset_neg)

    # User-supplied negative (appended, not replacing)
    if negative_prompt:
        neg_parts.append(negative_prompt)

    compiled_negative = ", ".join(neg_parts)

    return compiled, compiled_negative
