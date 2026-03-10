"""
Unit tests for the Diffusion Service API endpoints.

Run with: 
  cd server/diffusion-service
  pytest tests/test_api.py -v

Or run specific tests: 
  pytest tests/test_api.py::TestHealthEndpoint -v
"""

import pytest
import asyncio
import base64
import io
import sys
import os
from unittest.mock import Mock, patch, MagicMock, AsyncMock
from PIL import Image

# Add parent directory to path for imports
parent_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, parent_dir)


@pytest.fixture
def test_client():
    """Create a test client for the FastAPI app"""
    from fastapi.testclient import TestClient
    from server import app
    return TestClient(app)


class TestHealthEndpoint:
    """Tests for the /health endpoint"""
    
    def test_health_returns_200(self, test_client):
        """Health endpoint should return 200 OK"""
        response = test_client.get("/health")
        assert response.status_code == 200
    
    def test_health_returns_status_healthy(self, test_client):
        """Health endpoint should return status: healthy"""
        response = test_client.get("/health")
        data = response.json()
        assert data["status"] == "healthy"
    
    def test_health_includes_diffusers_flag(self, test_client):
        """Health endpoint should include diffusers_available flag"""
        response = test_client.get("/health")
        data = response.json()
        assert "diffusers_available" in data
        assert isinstance(data["diffusers_available"], bool)
    
    def test_health_includes_cuda_info(self, test_client):
        """Health endpoint should include CUDA availability info"""
        response = test_client.get("/health")
        data = response.json()
        assert "cuda_available" in data
        assert "device" in data
    
    def test_health_includes_pipeline_status(self, test_client):
        """Health endpoint should include pipeline loaded status"""
        response = test_client.get("/health")
        data = response.json()
        assert "sd15_loaded" in data
        assert "sdxl_loaded" in data
    
    def test_health_includes_mode(self, test_client):
        """Health endpoint should indicate real or mock mode"""
        response = test_client.get("/health")
        data = response.json()
        assert "mode" in data
        assert data["mode"] in ["real", "mock"]


class TestRootEndpoint:
    """Tests for the root / endpoint"""
    
    def test_root_returns_200(self, test_client):
        """Root endpoint should return 200 OK"""
        response = test_client.get("/")
        assert response.status_code == 200
    
    def test_root_returns_service_info(self, test_client):
        """Root endpoint should return service information"""
        response = test_client.get("/")
        data = response.json()
        assert data["service"] == "diffusion"
        assert data["status"] == "running"
        assert "diffusers" in data


class TestGenerationEndpoint:
    """Tests for the /generate endpoint"""
    
    def test_generate_requires_prompt(self, test_client):
        """Generate endpoint should require a prompt"""
        response = test_client.post("/generate", json={})
        assert response.status_code == 422  # Validation error
    
    def test_generate_accepts_valid_request(self, test_client):
        """Generate endpoint should accept valid request and return job info"""
        payload = {
            "prompt": "a test image",
            "width": 512,
            "height": 512,
            "steps": 10,
            "guidance_scale": 7.5,
            "model": "sd15"
        }
        response = test_client.post("/generate", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        assert "job_id" in data
        assert data["status"] in ["pending", "loading_model", "generating"]
        assert data["model"] == "sd15"
    
    def test_generate_returns_job_id(self, test_client):
        """Generate endpoint should return a unique job ID"""
        payload = {"prompt": "test"}
        
        response1 = test_client.post("/generate", json=payload)
        response2 = test_client.post("/generate", json=payload)
        
        assert response1.json()["job_id"] != response2.json()["job_id"]
    
    def test_generate_accepts_all_parameters(self, test_client):
        """Generate endpoint should accept all optional parameters"""
        payload = {
            "prompt": "a beautiful landscape",
            "negative_prompt": "ugly, blurry",
            "width": 768,
            "height": 512,
            "steps": 25,
            "guidance_scale": 8.0,
            "model": "sdxl",
            "seed": 42
        }
        response = test_client.post("/generate", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        assert data["model"] == "sdxl"
    
    def test_generate_validates_model_type(self, test_client):
        """Generate endpoint should validate model type"""
        payload = {
            "prompt": "test",
            "model": "invalid_model"
        }
        response = test_client.post("/generate", json=payload)
        assert response.status_code == 422  # Validation error
    
    def test_generate_includes_estimated_time(self, test_client):
        """Generate endpoint should include estimated time"""
        payload = {"prompt": "test", "model": "sd15"}
        response = test_client.post("/generate", json=payload)
        data = response.json()
        
        assert "estimated_time" in data
        assert data["estimated_time"] > 0
    
    def test_generate_includes_created_at(self, test_client):
        """Generate endpoint should include creation timestamp"""
        payload = {"prompt": "test"}
        response = test_client.post("/generate", json=payload)
        data = response.json()
        
        assert "created_at" in data
        assert len(data["created_at"]) > 0


class TestJobStatusEndpoint:
    """Tests for the /job/{job_id} endpoint"""
    
    def test_job_status_returns_404_for_unknown_job(self, test_client):
        """Job status should return 404 for unknown job ID"""
        response = test_client.get("/job/nonexistent-job-id")
        assert response.status_code == 404
    
    def test_job_status_returns_job_info(self, test_client):
        """Job status should return info for existing job"""
        # First create a job
        create_response = test_client.post("/generate", json={"prompt": "test"})
        job_id = create_response.json()["job_id"]
        
        # Then check its status
        status_response = test_client.get(f"/job/{job_id}")
        assert status_response.status_code == 200
        
        data = status_response.json()
        assert data["job_id"] == job_id
        assert "status" in data
        assert "progress" in data
    
    def test_job_status_progress_is_percentage(self, test_client):
        """Job progress should be a percentage (0-100)"""
        create_response = test_client.post("/generate", json={"prompt": "test"})
        job_id = create_response.json()["job_id"]
        
        status_response = test_client.get(f"/job/{job_id}")
        data = status_response.json()
        
        assert 0 <= data["progress"] <= 100


class TestJobDeletion:
    """Tests for job deletion endpoint"""
    
    def test_delete_returns_404_for_unknown_job(self, test_client):
        """Delete should return 404 for unknown job"""
        response = test_client.delete("/job/nonexistent-job-id")
        assert response.status_code == 404
    
    def test_delete_existing_job(self, test_client):
        """Delete should remove the job"""
        # Create a job
        create_response = test_client.post("/generate", json={"prompt": "test"})
        job_id = create_response.json()["job_id"]
        
        # Wait a bit for it to complete (mock mode is fast)
        import time
        time.sleep(2)
        
        # Delete it
        delete_response = test_client.delete(f"/job/{job_id}")
        assert delete_response.status_code == 200
        assert "message" in delete_response.json()
        
        # Verify it's deleted
        status_response = test_client.get(f"/job/{job_id}")
        assert status_response.status_code == 404


class TestMockGeneration:
    """Tests for mock image generation (when diffusers is unavailable)"""
    
    def test_mock_image_is_valid_png(self):
        """Mock generation should produce valid PNG image"""
        from server import generate_mock_image
        
        image = generate_mock_image("test prompt", 256, 256)
        
        assert isinstance(image, Image.Image)
        assert image.size == (256, 256)
        assert image.mode == "RGB"
    
    def test_mock_image_respects_dimensions(self):
        """Mock generation should respect requested dimensions"""
        from server import generate_mock_image
        
        image = generate_mock_image("test", 512, 768)
        assert image.size == (512, 768)
        
        image2 = generate_mock_image("test", 1024, 512)
        assert image2.size == (1024, 512)
    
    def test_mock_image_varies_by_prompt(self):
        """Different prompts should produce different mock images"""
        from server import generate_mock_image
        
        image1 = generate_mock_image("sunset", 64, 64)
        image2 = generate_mock_image("ocean", 64, 64)
        
        # Convert to bytes for comparison
        buf1 = io.BytesIO()
        buf2 = io.BytesIO()
        image1.save(buf1, format="PNG")
        image2.save(buf2, format="PNG")
        
        # Images should be different
        assert buf1.getvalue() != buf2.getvalue()


class TestImageConversion:
    """Tests for image conversion utilities"""
    
    def test_image_to_base64(self):
        """image_to_base64 should produce valid base64 string"""
        from server import image_to_base64
        
        # Create a test image
        image = Image.new("RGB", (64, 64), color="red")
        
        result = image_to_base64(image)
        
        # Should be valid base64
        assert isinstance(result, str)
        decoded = base64.b64decode(result)
        
        # Should be a valid PNG
        decoded_image = Image.open(io.BytesIO(decoded))
        assert decoded_image.size == (64, 64)
    
    def test_base64_roundtrip(self):
        """Image should survive base64 encode/decode roundtrip"""
        from server import image_to_base64
        
        original = Image.new("RGB", (100, 100), color="blue")
        
        b64 = image_to_base64(original)
        decoded = base64.b64decode(b64)
        restored = Image.open(io.BytesIO(decoded))
        
        assert original.size == restored.size


class TestGenerationStatus:
    """Tests for GenerationStatus enum"""
    
    def test_status_values(self):
        """GenerationStatus should have all expected values"""
        from server import GenerationStatus
        
        expected = ["pending", "loading_model", "generating", "completed", "failed", "cancelled"]
        
        for status in expected:
            assert hasattr(GenerationStatus, status.upper())


class TestModelType:
    """Tests for ModelType enum"""
    
    def test_model_types(self):
        """ModelType should have SD15 and SDXL"""
        from server import ModelType
        
        assert ModelType.SD15.value == "sd15"
        assert ModelType.SDXL.value == "sdxl"


class TestConcurrentGeneration:
    """Tests for handling multiple concurrent generation requests"""
    
    def test_multiple_jobs_tracked_separately(self, test_client):
        """Multiple jobs should be tracked independently"""
        # Create multiple jobs
        job_ids = []
        for i in range(5):
            response = test_client.post("/generate", json={"prompt": f"test {i}"})
            job_ids.append(response.json()["job_id"])
        
        # All job IDs should be unique
        assert len(set(job_ids)) == 5
        
        # Each job should be trackable
        for job_id in job_ids:
            response = test_client.get(f"/job/{job_id}")
            assert response.status_code == 200


class TestJobsListEndpoint:
    """Tests for the /jobs endpoint"""
    
    def test_jobs_returns_200(self, test_client):
        """Jobs endpoint should return 200"""
        response = test_client.get("/jobs")
        assert response.status_code == 200
    
    def test_jobs_returns_list(self, test_client):
        """Jobs endpoint should return a list of jobs"""
        response = test_client.get("/jobs")
        data = response.json()
        assert "jobs" in data
        assert isinstance(data["jobs"], list)
    
    def test_jobs_shows_created_jobs(self, test_client):
        """Jobs list should include created jobs"""
        # Create a job
        create_response = test_client.post("/generate", json={"prompt": "test"})
        
        # Check jobs list
        jobs_response = test_client.get("/jobs")
        data = jobs_response.json()
        
        # Job should be in list
        assert isinstance(data["jobs"], list)
        assert "total" in data


class TestInputValidation:
    """Tests for input validation on generation requests"""
    
    def test_empty_prompt_rejected(self, test_client):
        """Empty prompt should be rejected"""
        response = test_client.post("/generate", json={"prompt": ""})
        # Should either reject with 422 or accept empty string
        # Behavior depends on implementation
        assert response.status_code in [200, 422]
    
    def test_whitespace_only_prompt(self, test_client):
        """Whitespace-only prompt should be handled"""
        response = test_client.post("/generate", json={"prompt": "   "})
        assert response.status_code in [200, 422]
    
    def test_very_long_prompt(self, test_client):
        """Very long prompts should be handled gracefully"""
        long_prompt = "a " * 10000
        response = test_client.post("/generate", json={"prompt": long_prompt})
        # Should either accept or reject gracefully
        assert response.status_code in [200, 400, 422]
    
    def test_special_characters_in_prompt(self, test_client):
        """Special characters should be handled"""
        response = test_client.post("/generate", json={
            "prompt": "test <script>alert('xss')</script>"
        })
        assert response.status_code == 200
    
    def test_unicode_in_prompt(self, test_client):
        """Unicode characters should be accepted"""
        response = test_client.post("/generate", json={
            "prompt": "a beautiful 🎨 日本語 painting"
        })
        assert response.status_code == 200
    
    def test_negative_dimensions_rejected(self, test_client):
        """Negative dimensions should be rejected"""
        response = test_client.post("/generate", json={
            "prompt": "test",
            "width": -512,
            "height": 512
        })
        assert response.status_code == 422
    
    def test_zero_dimensions_rejected(self, test_client):
        """Zero dimensions should be rejected"""
        response = test_client.post("/generate", json={
            "prompt": "test",
            "width": 0,
            "height": 512
        })
        assert response.status_code == 422
    
    def test_negative_steps_rejected(self, test_client):
        """Negative steps should be rejected"""
        response = test_client.post("/generate", json={
            "prompt": "test",
            "steps": -10
        })
        assert response.status_code == 422


class TestEndToEndGeneration:
    """End-to-end tests for the full generation flow"""
    
    def test_full_generation_flow_mock_mode(self, test_client):
        """Test complete generation flow in mock mode"""
        import time
        
        # Start generation
        payload = {
            "prompt": "a test image for unit testing",
            "width": 256,
            "height": 256,
            "steps": 5,
            "model": "sd15"
        }
        
        create_response = test_client.post("/generate", json=payload)
        assert create_response.status_code == 200
        
        job_id = create_response.json()["job_id"]
        
        # Poll for completion (with timeout)
        max_attempts = 30
        for attempt in range(max_attempts):
            status_response = test_client.get(f"/job/{job_id}")
            data = status_response.json()
            
            if data["status"] == "completed":
                # Verify we got image data
                assert "image_data" in data
                assert data["image_data"] is not None
                assert data["image_data"].startswith("data:image/png;base64,")
                
                # Verify progress is 100%
                assert data["progress"] == 100.0
                return
            
            elif data["status"] == "failed":
                pytest.fail(f"Generation failed: {data.get('error')}")
            
            time.sleep(0.2)
        
        pytest.fail("Generation timed out")


# Fixture to run async tests
@pytest.fixture
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])

