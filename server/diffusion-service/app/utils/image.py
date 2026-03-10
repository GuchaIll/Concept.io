# -*- coding: utf-8 -*-
"""
Image utility functions: encoding, decoding, and mock image generation.
"""

import io
import base64
import random
from PIL import Image


def image_to_base64(image: Image.Image, format_type: str = "PNG") -> str:
    """Convert a PIL Image to a base64 string."""
    buffered = io.BytesIO()

    try:
        img_copy = image.copy()
        fmt = format_type.upper()
        if fmt == "JPG":
            fmt = "JPEG"

        # Ensure compatible mode for target format
        if fmt == "PNG":
            if img_copy.mode not in ("RGB", "RGBA", "L", "LA", "P"):
                img_copy = img_copy.convert("RGB")
        elif fmt == "JPEG":
            if img_copy.mode not in ("RGB", "L"):
                img_copy = img_copy.convert("RGB")
        else:
            if img_copy.mode not in ("RGB", "RGBA"):
                img_copy = img_copy.convert("RGB")
            fmt = "PNG"

        img_copy.save(buffered, format=fmt)
        return base64.b64encode(buffered.getvalue()).decode()

    except Exception as e:
        print(f"Error in image_to_base64: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()
        # Fallback: basic RGB PNG
        try:
            buf2 = io.BytesIO()
            image.convert("RGB").save(buf2, format="PNG")
            return base64.b64encode(buf2.getvalue()).decode()
        except Exception as e2:
            print(f"Fallback also failed: {e2}")
            raise RuntimeError(f"Failed to convert image to base64: {e}")


def decode_base64_image(image_data: str) -> Image.Image:
    """Decode a base64 (optionally data-URI-prefixed) string to a PIL Image."""
    if "," in image_data:
        image_data = image_data.split(",", 1)[1]
    image_bytes = base64.b64decode(image_data)
    return Image.open(io.BytesIO(image_bytes))


def generate_mock_image(prompt: str, width: int, height: int) -> Image.Image:
    """Generate a gradient placeholder when diffusers is unavailable."""
    img = Image.new("RGB", (width, height))
    pixels = img.load()

    seed = hash(prompt) % 10000
    random.seed(seed)

    r1, g1, b1 = random.randint(30, 100), random.randint(30, 100), random.randint(80, 150)
    r2, g2, b2 = random.randint(80, 150), random.randint(30, 100), random.randint(80, 150)

    for y in range(height):
        for x in range(width):
            t = x / width
            r = int(r1 * (1 - t) + r2 * t)
            g = int(g1 * (1 - t) + g2 * t)
            b = int(b1 * (1 - t) + b2 * t)
            noise = random.randint(-20, 20)
            r = max(0, min(255, r + noise))
            g = max(0, min(255, g + noise))
            b = max(0, min(255, b + noise))
            pixels[x, y] = (r, g, b)

    # Text overlay
    try:
        from PIL import ImageDraw, ImageFont
        draw = ImageDraw.Draw(img)

        try:
            font = ImageFont.truetype("arial.ttf", min(width, height) // 15)
            small_font = ImageFont.truetype("arial.ttf", min(width, height) // 25)
        except Exception:
            font = ImageFont.load_default()
            small_font = font

        text1 = "AI Generated (Mock)"
        bbox1 = draw.textbbox((0, 0), text1, font=font)
        tw1 = bbox1[2] - bbox1[0]
        draw.text(((width - tw1) // 2, height // 3), text1, fill=(255, 255, 255), font=font)

        display_prompt = (prompt[:50] + "...") if len(prompt) > 50 else prompt
        bbox2 = draw.textbbox((0, 0), display_prompt, font=small_font)
        tw2 = bbox2[2] - bbox2[0]
        draw.text(((width - tw2) // 2, height // 2), display_prompt, fill=(200, 200, 200), font=small_font)

        text3 = "Install diffusers for real generation"
        bbox3 = draw.textbbox((0, 0), text3, font=small_font)
        tw3 = bbox3[2] - bbox3[0]
        draw.text(((width - tw3) // 2, height * 2 // 3), text3, fill=(150, 150, 150), font=small_font)
    except Exception as e:
        print(f"Could not add text overlay: {e}")

    return img
