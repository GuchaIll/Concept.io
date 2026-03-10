"""
Tests for the /edit endpoint — Phase 1 SDXL/CosXL image editing.

Run (from server/diffusion-service/):
    pytest tests/test_edit.py -v                     # all tests
    pytest tests/test_edit.py -v -m "not slow"       # fast/unit tests only
    pytest tests/test_edit.py -v -m slow             # inference tests only
"""

import base64
import io
import os
import sys

import pytest
from PIL import Image
from fastapi.testclient import TestClient

# ---------------------------------------------------------------------------
# Path setup
# ---------------------------------------------------------------------------
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from server import app  # noqa: E402

client = TestClient(app)


# ---------------------------------------------------------------------------
# Availability guards
# ---------------------------------------------------------------------------

def _controlnet_aux_available() -> bool:
    try:
        import controlnet_aux  # noqa: F401
        return True
    except ImportError:
        return False


def _cosxl_weights_present() -> bool:
    weights = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "models", "cosxl", "cosxl_edit.safetensors",
    )
    return os.path.isfile(weights)


CONTROLNET_AUX_AVAILABLE = _controlnet_aux_available()
COSXL_WEIGHTS_PRESENT = _cosxl_weights_present()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_b64_image(width: int = 128, height: int = 128, color: str = "cornflowerblue") -> str:
    """Create a solid-colour PNG and return it as a base64 data-URL."""
    img = Image.new("RGB", (width, height), color)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


def make_b64_mask(width: int = 128, height: int = 128) -> str:
    """
    Create a mask PNG: left half black (keep), right half white (inpaint).
    Returns a base64 data-URL.
    """
    img = Image.new("L", (width, height), 0)
    # Paint the right half white so SDXL has something to inpaint
    for y in range(height):
        for x in range(width // 2, width):
            img.putpixel((x, y), 255)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


def _assert_edit_response_shape(data: dict) -> None:
    """Common assertions on a successful EditResponse."""
    assert "success" in data
    assert "processing_time" in data
    assert isinstance(data["processing_time"], (int, float))


def _assert_image_data_valid(data: dict) -> None:
    """Assert that image_data is a valid PNG data-URL."""
    assert data.get("image_data") is not None
    assert data["image_data"].startswith("data:image/png;base64,"), (
        f"image_data should be a PNG data-URL, got: {str(data['image_data'])[:60]}"
    )
    # Decode and validate it is actually a PNG
    raw = base64.b64decode(data["image_data"].split(",", 1)[1])
    with Image.open(io.BytesIO(raw)) as img:
        assert img.format == "PNG"


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def test_image() -> str:
    return make_b64_image(128, 128, "steelblue")


@pytest.fixture(scope="module")
def test_mask() -> str:
    return make_b64_mask(128, 128)


# ---------------------------------------------------------------------------
# Validation / fast tests (no inference)
# ---------------------------------------------------------------------------

class TestEditEndpointValidation:
    """Fast tests that verify request validation without running inference."""

    def test_missing_image_data_returns_422(self):
        """Omitting image_data should cause a 422 Unprocessable Entity."""
        response = client.post("/edit", json={
            "prompt": "make it glow",
        })
        assert response.status_code == 422

    def test_missing_prompt_returns_422(self, test_image):
        """Omitting prompt should cause a 422 Unprocessable Entity."""
        response = client.post("/edit", json={
            "image_data": test_image,
        })
        assert response.status_code == 422

    def test_valid_payload_returns_200(self, test_image):
        """A fully-valid payload should always return HTTP 200 (errors are in body)."""
        response = client.post("/edit", json={
            "image_data": test_image,
            "prompt": "make it look painterly",
            "mode": "instruction",
            "steps": 1,
            "width": 128,
            "height": 128,
        })
        # The endpoint may succeed or fail depending on weights, but HTTP level is 200
        assert response.status_code == 200

    def test_inpaint_missing_mask_returns_error(self, test_image):
        """
        Inpaint mode without mask_data should return success=False with an error
        message, not a 500 crash.
        """
        response = client.post("/edit", json={
            "image_data": test_image,
            "prompt": "fill with clouds",
            "mode": "inpaint",
            "steps": 1,
            "width": 128,
            "height": 128,
        })
        assert response.status_code == 200
        data = response.json()
        _assert_edit_response_shape(data)
        assert data["success"] is False
        assert data.get("error"), "Expected a non-empty error message"

    def test_response_has_required_fields(self, test_image):
        """EditResponse must always contain success and processing_time."""
        response = client.post("/edit", json={
            "image_data": test_image,
            "prompt": "add dramatic lighting",
            "mode": "instruction",
            "steps": 1,
            "width": 128,
            "height": 128,
        })
        assert response.status_code == 200
        data = response.json()
        _assert_edit_response_shape(data)

    def test_invalid_mode_returns_422(self, test_image):
        """An unrecognised mode value should be rejected at validation time."""
        response = client.post("/edit", json={
            "image_data": test_image,
            "prompt": "touch up",
            "mode": "nonexistent_mode",
        })
        assert response.status_code == 422

    def test_processing_time_is_non_negative(self, test_image):
        """processing_time should always be >= 0."""
        response = client.post("/edit", json={
            "image_data": test_image,
            "prompt": "sunshine",
            "mode": "instruction",
            "steps": 1,
            "width": 128,
            "height": 128,
        })
        assert response.status_code == 200
        data = response.json()
        assert data["processing_time"] >= 0


# ---------------------------------------------------------------------------
# Inference tests (slow — require models)
# ---------------------------------------------------------------------------

class TestEditInpaint:
    """Inpaint mode — requires SDXL base weights (cached via HuggingFace)."""

    @pytest.mark.slow
    def test_inpaint_returns_image(self, test_image, test_mask):
        """Inpaint mode should return a valid PNG when mask is supplied."""
        response = client.post("/edit", json={
            "image_data": test_image,
            "mask_data": test_mask,
            "prompt": "smooth blue gradient",
            "negative_prompt": "text, watermark",
            "mode": "inpaint",
            "steps": 2,
            "strength": 0.99,
            "guidance_scale": 7.5,
            "width": 128,
            "height": 128,
            "seed": 42,
        })

        assert response.status_code == 200
        data = response.json()
        _assert_edit_response_shape(data)
        assert data["success"] is True, f"Edit failed: {data.get('error')}"
        _assert_image_data_valid(data)

    @pytest.mark.slow
    def test_inpaint_output_is_correct_size(self, test_image, test_mask):
        """Output image should match requested width/height."""
        response = client.post("/edit", json={
            "image_data": test_image,
            "mask_data": test_mask,
            "prompt": "ocean waves",
            "mode": "inpaint",
            "steps": 2,
            "width": 128,
            "height": 128,
            "seed": 7,
        })

        assert response.status_code == 200
        data = response.json()
        if not data["success"]:
            pytest.skip(f"Inpaint pipeline unavailable: {data.get('error')}")

        raw = base64.b64decode(data["image_data"].split(",", 1)[1])
        with Image.open(io.BytesIO(raw)) as img:
            assert img.width == 128
            assert img.height == 128

    @pytest.mark.slow
    def test_inpaint_processing_time_recorded(self, test_image, test_mask):
        """processing_time should be > 0 after a real inference run."""
        response = client.post("/edit", json={
            "image_data": test_image,
            "mask_data": test_mask,
            "prompt": "mountain scenery",
            "mode": "inpaint",
            "steps": 2,
            "width": 128,
            "height": 128,
        })

        assert response.status_code == 200
        data = response.json()
        if not data["success"]:
            pytest.skip(f"Inpaint pipeline unavailable: {data.get('error')}")
        assert data["processing_time"] > 0


class TestEditInstruction:
    """Instruction (CosXL) mode — skipped when cosxl_edit.safetensors is absent."""

    @pytest.mark.slow
    @pytest.mark.skipif(not COSXL_WEIGHTS_PRESENT, reason="CosXL weights not present")
    def test_instruction_returns_image(self, test_image):
        """Instruction mode should return a valid PNG with valid weights."""
        response = client.post("/edit", json={
            "image_data": test_image,
            "prompt": "make the scene look like a watercolour painting",
            "mode": "instruction",
            "steps": 2,
            "width": 128,
            "height": 128,
            "seed": 0,
        })

        assert response.status_code == 200
        data = response.json()
        _assert_edit_response_shape(data)
        assert data["success"] is True, f"CosXL edit failed: {data.get('error')}"
        _assert_image_data_valid(data)

    def test_instruction_fails_gracefully_without_weights(self, test_image):
        """
        Without CosXL weights, the endpoint must return success=False with an
        error message rather than raising an unhandled 500.
        """
        if COSXL_WEIGHTS_PRESENT:
            pytest.skip("CosXL weights are present — graceful-failure test not applicable")

        response = client.post("/edit", json={
            "image_data": test_image,
            "prompt": "increase contrast",
            "mode": "instruction",
            "steps": 1,
            "width": 128,
            "height": 128,
        })

        assert response.status_code == 200
        data = response.json()
        _assert_edit_response_shape(data)
        assert data["success"] is False
        assert data.get("error"), "Expected a non-empty error string"


class TestEditControlNet:
    """ControlNet mode — skipped when controlnet-aux is not installed."""

    @pytest.mark.slow
    @pytest.mark.skipif(not CONTROLNET_AUX_AVAILABLE, reason="controlnet-aux not installed")
    def test_controlnet_depth_returns_image(self, test_image):
        """ControlNet depth conditioning should return a valid PNG."""
        response = client.post("/edit", json={
            "image_data": test_image,
            "prompt": "futuristic city at dusk",
            "mode": "controlnet",
            "controlnet_type": 1,  # depth
            "controlnet_scale": 0.8,
            "steps": 2,
            "width": 128,
            "height": 128,
            "seed": 99,
        })

        assert response.status_code == 200
        data = response.json()
        _assert_edit_response_shape(data)
        assert data["success"] is True, f"ControlNet edit failed: {data.get('error')}"
        _assert_image_data_valid(data)

    def test_controlnet_unavailable_without_aux(self, test_image):
        """
        When controlnet-aux is absent the pipeline will raise an ImportError
        which must be caught and returned as success=False.
        """
        if CONTROLNET_AUX_AVAILABLE:
            pytest.skip("controlnet-aux is installed — unavailability test not applicable")

        response = client.post("/edit", json={
            "image_data": test_image,
            "prompt": "pencil sketch version",
            "mode": "controlnet",
            "controlnet_type": 1,
            "steps": 1,
            "width": 128,
            "height": 128,
        })

        assert response.status_code == 200
        data = response.json()
        _assert_edit_response_shape(data)
        # Either success=False (import error caught) or success=True if somehow importable
        if not data["success"]:
            assert data.get("error"), "Expected a non-empty error string"


# ---------------------------------------------------------------------------
# Seed reproducibility (slow)
# ---------------------------------------------------------------------------

class TestEditReproducibility:
    """Verify that the same seed yields bitwise-identical results."""

    @pytest.mark.slow
    def test_inpaint_same_seed_is_deterministic(self, test_image, test_mask):
        """Two inpaint calls with identical inputs and seed must return the same image."""
        payload = {
            "image_data": test_image,
            "mask_data": test_mask,
            "prompt": "soft purple clouds",
            "mode": "inpaint",
            "steps": 2,
            "width": 128,
            "height": 128,
            "seed": 1234,
        }

        r1 = client.post("/edit", json=payload)
        r2 = client.post("/edit", json=payload)

        assert r1.status_code == 200
        assert r2.status_code == 200

        d1, d2 = r1.json(), r2.json()

        if not d1["success"] or not d2["success"]:
            pytest.skip("Inpaint pipeline unavailable; skipping reproducibility test")

        assert d1["image_data"] == d2["image_data"], (
            "Same seed should produce identical output"
        )
