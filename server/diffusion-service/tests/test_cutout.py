"""
Test the cutout endpoint for background removal
"""
import pytest
import base64
import io
from PIL import Image
from fastapi.testclient import TestClient
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from server import app

client = TestClient(app)


def create_test_image(width: int = 100, height: int = 100, color: str = "red") -> str:
    """Create a simple test image and return as base64"""
    img = Image.new("RGB", (width, height), color)
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    img_base64 = base64.b64encode(buffer.getvalue()).decode()
    return f"data:image/png;base64,{img_base64}"


class TestCutoutHealthEndpoint:
    """Test the cutout health endpoint"""
    
    def test_cutout_health_returns_200(self):
        response = client.get("/cutout/health")
        assert response.status_code == 200
    
    def test_cutout_health_shows_availability(self):
        response = client.get("/cutout/health")
        data = response.json()
        assert "available" in data
        assert "rembg_available" in data
        assert "active_engine" in data
        assert data["active_engine"] in ("sam", "rembg", "color_distance")


class TestCutoutEndpoint:
    """Test the cutout endpoint for background removal"""
    
    def test_cutout_accepts_valid_request(self):
        """Test that the cutout endpoint accepts a valid image"""
        test_image = create_test_image(200, 200, "blue")
        
        response = client.post("/cutout", json={
            "image_data": test_image,
            "feather_radius": 0,
            "threshold": 128,
            "refine_mask": True,
        })
        
        assert response.status_code == 200
        data = response.json()
        assert "success" in data
    
    def test_cutout_returns_image_data(self):
        """Test that successful cutout returns image data"""
        test_image = create_test_image(150, 150, "green")
        
        response = client.post("/cutout", json={
            "image_data": test_image,
        })
        
        assert response.status_code == 200
        data = response.json()
        
        if data["success"]:
            assert "image_data" in data
            assert data["image_data"] is not None
            assert data["image_data"].startswith("data:image/png;base64,")
    
    def test_cutout_returns_original_size(self):
        """Test that cutout returns the original image dimensions"""
        test_image = create_test_image(300, 200, "red")
        
        response = client.post("/cutout", json={
            "image_data": test_image,
        })
        
        assert response.status_code == 200
        data = response.json()
        
        if data["success"]:
            assert "original_size" in data
            # Original size should be (width, height)
            assert data["original_size"][0] == 300
            assert data["original_size"][1] == 200
    
    def test_cutout_returns_processing_time(self):
        """Test that cutout returns processing time"""
        test_image = create_test_image(100, 100, "yellow")
        
        response = client.post("/cutout", json={
            "image_data": test_image,
        })
        
        assert response.status_code == 200
        data = response.json()
        
        if data["success"]:
            assert "processing_time" in data
            assert isinstance(data["processing_time"], (int, float))
            assert data["processing_time"] > 0
    
    def test_cutout_handles_feather_radius(self):
        """Test that feather radius parameter is accepted"""
        test_image = create_test_image(100, 100, "purple")
        
        response = client.post("/cutout", json={
            "image_data": test_image,
            "feather_radius": 5,
        })
        
        assert response.status_code == 200
    
    def test_cutout_handles_threshold(self):
        """Test that threshold parameter is accepted"""
        test_image = create_test_image(100, 100, "orange")
        
        response = client.post("/cutout", json={
            "image_data": test_image,
            "threshold": 200,
        })
        
        assert response.status_code == 200
    
    def test_cutout_handles_refine_mask(self):
        """Test that refine_mask parameter is accepted"""
        test_image = create_test_image(100, 100, "cyan")
        
        response = client.post("/cutout", json={
            "image_data": test_image,
            "refine_mask": False,
        })
        
        assert response.status_code == 200


class TestCutoutInputValidation:
    """Test input validation for cutout endpoint"""
    
    def test_cutout_requires_image_data(self):
        """Test that image_data is required"""
        response = client.post("/cutout", json={})
        assert response.status_code == 422  # Validation error
    
    def test_cutout_handles_invalid_base64(self):
        """Test handling of invalid base64 data"""
        response = client.post("/cutout", json={
            "image_data": "not-valid-base64-data!!!",
        })
        
        # Should return 200 with success=false and error message
        assert response.status_code == 200
        data = response.json()
        assert data["success"] == False
        assert "error" in data


class TestMaskProposalsEndpoint:
    """Test the /cutout/proposals endpoint (SAM mask-picker API)"""

    def test_proposals_returns_200(self):
        """Proposals endpoint should always return HTTP 200"""
        test_image = create_test_image(200, 200, "blue")
        response = client.post("/cutout/proposals", json={"image_data": test_image})
        assert response.status_code == 200

    def test_proposals_response_shape(self):
        """Response must include success, proposals list, engine, and image_size"""
        test_image = create_test_image(200, 200, "green")
        response = client.post("/cutout/proposals", json={"image_data": test_image})
        assert response.status_code == 200
        data = response.json()
        assert "success" in data
        assert "proposals" in data
        assert "engine" in data
        assert isinstance(data["proposals"], list)

    def test_proposals_requires_image_data(self):
        """Missing image_data should return 422 validation error"""
        response = client.post("/cutout/proposals", json={})
        assert response.status_code == 422

    def test_proposals_respects_max_proposals(self):
        """max_proposals parameter should be accepted without error"""
        test_image = create_test_image(200, 200, "red")
        response = client.post("/cutout/proposals", json={
            "image_data": test_image,
            "max_proposals": 5,
        })
        assert response.status_code == 200
        data = response.json()
        assert len(data["proposals"]) <= 5

    def test_proposals_have_required_fields(self):
        """Each proposal must contain id, overlay, mask, area_ratio, bbox, centroid"""
        test_image = create_test_image(200, 200, "orange")
        response = client.post("/cutout/proposals", json={"image_data": test_image})
        data = response.json()
        for p in data.get("proposals", []):
            assert "id" in p
            assert "overlay" in p
            assert "mask" in p
            assert "area_ratio" in p
            assert "bbox" in p
            assert "centroid" in p
            assert len(p["bbox"]) == 4
            assert len(p["centroid"]) == 2


class TestCutoutApplyEndpoint:
    """Test the /cutout/apply endpoint (applies user-selected mask(s))"""

    def _get_mask_data(self, width: int = 100, height: int = 100) -> str:
        """Create a simple centre-square grayscale mask as base64 PNG."""
        mask = Image.new("L", (width, height), 0)
        from PIL import ImageDraw
        draw = ImageDraw.Draw(mask)
        q = width // 4
        draw.rectangle([q, q, width - q, height - q], fill=255)
        buf = io.BytesIO()
        mask.save(buf, format="PNG")
        return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()

    def test_apply_returns_200(self):
        test_image = create_test_image(100, 100, "blue")
        mask = self._get_mask_data()
        response = client.post("/cutout/apply", json={
            "image_data": test_image,
            "mask_data": [mask],
        })
        assert response.status_code == 200

    def test_apply_returns_rgba_png(self):
        """Successful apply should return a transparent PNG"""
        test_image = create_test_image(100, 100, "red")
        mask = self._get_mask_data()
        response = client.post("/cutout/apply", json={
            "image_data": test_image,
            "mask_data": [mask],
        })
        data = response.json()
        if data["success"]:
            assert data["image_data"].startswith("data:image/png;base64,")
            # Decode and verify RGBA
            b64 = data["image_data"].split(",", 1)[1]
            img = Image.open(io.BytesIO(base64.b64decode(b64)))
            assert img.mode == "RGBA"

    def test_apply_requires_image_data_and_mask(self):
        """Missing fields should return 422"""
        response = client.post("/cutout/apply", json={})
        assert response.status_code == 422

    def test_apply_accepts_multiple_masks(self):
        """Multiple masks should be union-merged without error"""
        test_image = create_test_image(100, 100, "green")
        mask1 = self._get_mask_data()
        mask2 = self._get_mask_data()
        response = client.post("/cutout/apply", json={
            "image_data": test_image,
            "mask_data": [mask1, mask2],
        })
        assert response.status_code == 200
        data = response.json()
        assert "success" in data


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
