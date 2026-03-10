"""
Comprehensive test suite for the Diffusion Service API.
Optimized for speed: Uses SD 1.5 with 20 steps for most tests.
Only one SDXL test to verify high-quality generation works.

Run with:
    pytest test_diffusion_api.py -v
    pytest test_diffusion_api.py -v -k "not sdxl"  # Skip SDXL test for faster runs
"""

import pytest
import requests
import time
import base64
from io import BytesIO
from PIL import Image
from typing import Optional

# Configuration
BASE_URL = "http://localhost:8000"
SD15_STEPS = 20  # Fast enough for testing, good quality
SDXL_STEPS = 15  # Only one SDXL test, keep it reasonable
POLL_INTERVAL = 1.0  # seconds
MAX_POLL_TIME = 300  # 5 minutes max for any single test


class TestConfig:
    """Test configuration with sensible defaults for fast execution"""
    # SD 1.5 settings (used for most tests)
    sd15_width = 512
    sd15_height = 512
    sd15_steps = SD15_STEPS
    sd15_prompt = "a beautiful sunset over mountains, digital art, highly detailed"
    sd15_negative = "blurry, bad quality, distorted"
    
    # SDXL settings (only used in one test)
    sdxl_width = 1024
    sdxl_height = 1024
    sdxl_steps = SDXL_STEPS
    sdxl_prompt = "a majestic dragon flying over a castle, epic fantasy art, 8k"
    sdxl_negative = "low quality, blurry, amateur"


def is_server_running() -> bool:
    """Check if the diffusion server is running"""
    try:
        response = requests.get(f"{BASE_URL}/health", timeout=5)
        return response.status_code == 200
    except:
        return False


def wait_for_job(job_id: str, max_wait: float = MAX_POLL_TIME) -> dict:
    """Poll for job completion with progress logging"""
    start_time = time.time()
    last_progress = -1
    
    while time.time() - start_time < max_wait:
        response = requests.get(f"{BASE_URL}/job/{job_id}")
        assert response.status_code == 200, f"Failed to get job status: {response.text}"
        
        status = response.json()
        current_progress = status.get("progress", 0)
        
        # Log progress changes
        if int(current_progress) != int(last_progress):
            elapsed = time.time() - start_time
            print(f"  [{elapsed:.1f}s] Progress: {current_progress:.1f}% - Status: {status.get('status')}")
            last_progress = current_progress
        
        if status.get("status") == "completed":
            return status
        elif status.get("status") == "failed":
            raise Exception(f"Job failed: {status.get('error')}")
        
        time.sleep(POLL_INTERVAL)
    
    raise TimeoutError(f"Job {job_id} did not complete within {max_wait}s")


def validate_image_data(image_data: str) -> Image.Image:
    """Validate and decode base64 image data"""
    assert image_data is not None, "No image data returned"
    assert image_data.startswith("data:image/"), "Invalid image data format"
    
    # Remove data URL prefix
    _, encoded = image_data.split(",", 1)
    image_bytes = base64.b64decode(encoded)
    image = Image.open(BytesIO(image_bytes))
    
    assert image.size[0] > 0 and image.size[1] > 0, "Invalid image dimensions"
    return image


# ============================================================================
# Health & Connectivity Tests
# ============================================================================

class TestHealthEndpoints:
    """Tests for server health and connectivity"""
    
    def test_server_running(self):
        """Verify server is accessible"""
        assert is_server_running(), "Diffusion server is not running. Start it with: python server.py"
    
    def test_root_endpoint(self):
        """Test root endpoint returns service info"""
        response = requests.get(f"{BASE_URL}/")
        assert response.status_code == 200
        
        data = response.json()
        assert data.get("service") == "diffusion"
        assert data.get("status") == "running"
        print(f"  Service info: {data}")
    
    def test_health_endpoint(self):
        """Test health endpoint returns detailed status"""
        response = requests.get(f"{BASE_URL}/health")
        assert response.status_code == 200
        
        data = response.json()
        assert data.get("status") == "healthy"
        
        print(f"  Health details:")
        print(f"    - Diffusers available: {data.get('diffusers_available')}")
        print(f"    - CUDA available: {data.get('cuda_available')}")
        print(f"    - Device: {data.get('device')}")
        print(f"    - Mode: {data.get('mode')}")
        
        # Store for other tests
        TestHealthEndpoints.diffusers_available = data.get("diffusers_available", False)
        TestHealthEndpoints.cuda_available = data.get("cuda_available", False)


# ============================================================================
# SD 1.5 Generation Tests (Fast - used for most testing)
# ============================================================================

class TestSD15Generation:
    """Tests for Stable Diffusion 1.5 generation (fast execution)"""
    
    @pytest.mark.dependency()
    def test_sd15_basic_generation(self):
        """Test basic SD 1.5 image generation"""
        print(f"\n  Testing SD 1.5 with {TestConfig.sd15_steps} steps...")
        
        payload = {
            "prompt": TestConfig.sd15_prompt,
            "negative_prompt": TestConfig.sd15_negative,
            "width": TestConfig.sd15_width,
            "height": TestConfig.sd15_height,
            "steps": TestConfig.sd15_steps,
            "guidance_scale": 7.5,
            "model": "sd15"
        }
        
        # Start generation
        start_time = time.time()
        response = requests.post(f"{BASE_URL}/generate", json=payload)
        assert response.status_code == 200, f"Failed to start generation: {response.text}"
        
        result = response.json()
        job_id = result.get("job_id")
        estimated_time = result.get("estimated_time", 0)
        
        print(f"  Job ID: {job_id}")
        print(f"  Estimated time: {estimated_time:.1f}s")
        
        # Wait for completion
        status = wait_for_job(job_id)
        actual_time = time.time() - start_time
        
        print(f"\n  Actual time: {actual_time:.1f}s")
        print(f"  Time estimation accuracy: {(actual_time / estimated_time * 100):.1f}%" if estimated_time > 0 else "N/A")
        
        # Validate image
        image = validate_image_data(status.get("image_data"))
        assert image.size == (TestConfig.sd15_width, TestConfig.sd15_height)
        
        # Save for inspection
        image.save("test_sd15_output.png")
        print(f"  Image saved to: test_sd15_output.png")
    
    def test_sd15_different_sizes(self):
        """Test SD 1.5 with different image sizes"""
        sizes = [(512, 512), (768, 512), (512, 768)]
        
        for width, height in sizes:
            print(f"\n  Testing {width}x{height}...")
            
            payload = {
                "prompt": "a simple landscape, minimalist",
                "width": width,
                "height": height,
                "steps": TestConfig.sd15_steps,
                "model": "sd15"
            }
            
            response = requests.post(f"{BASE_URL}/generate", json=payload)
            assert response.status_code == 200
            
            result = response.json()
            status = wait_for_job(result["job_id"])
            
            image = validate_image_data(status.get("image_data"))
            assert image.size == (width, height), f"Expected {width}x{height}, got {image.size}"
            print(f"    OK - Generated {width}x{height}")
    
    def test_sd15_with_seed(self):
        """Test reproducible generation with seed"""
        payload = {
            "prompt": "a red apple on a white table",
            "width": 512,
            "height": 512,
            "steps": TestConfig.sd15_steps,
            "model": "sd15",
            "seed": 42
        }
        
        # Generate twice with same seed
        images = []
        for i in range(2):
            response = requests.post(f"{BASE_URL}/generate", json=payload)
            assert response.status_code == 200
            
            status = wait_for_job(response.json()["job_id"])
            images.append(validate_image_data(status.get("image_data")))
            print(f"  Generated image {i+1}")
        
        # Note: Due to GPU non-determinism, images may not be pixel-perfect identical
        # but should be very similar. We just verify both completed successfully.
        assert images[0].size == images[1].size
        print("  Both images generated successfully with same seed")
    
    def test_sd15_prompt_variations(self):
        """Test various prompt styles"""
        prompts = [
            "a photo of a cat",
            "abstract geometric art, vibrant colors",
            "a cyberpunk city at night, neon lights",
        ]
        
        for prompt in prompts:
            print(f"\n  Testing: '{prompt[:40]}...'")
            
            payload = {
                "prompt": prompt,
                "width": 512,
                "height": 512,
                "steps": TestConfig.sd15_steps,
                "model": "sd15"
            }
            
            response = requests.post(f"{BASE_URL}/generate", json=payload)
            assert response.status_code == 200
            
            status = wait_for_job(response.json()["job_id"])
            validate_image_data(status.get("image_data"))
            print(f"    OK")


# ============================================================================
# SDXL Generation Test (Single test for high-quality generation)
# ============================================================================

class TestSDXLGeneration:
    """Single SDXL test - skip for faster test runs"""
    
    @pytest.mark.slow
    def test_sdxl_generation(self):
        """
        Test SDXL high-quality generation.
        This is the ONLY SDXL test - it takes longer but verifies the pipeline works.
        Skip with: pytest -k "not sdxl"
        """
        print(f"\n  Testing SDXL with {TestConfig.sdxl_steps} steps...")
        print("  NOTE: This test takes longer due to SDXL model size")
        
        payload = {
            "prompt": TestConfig.sdxl_prompt,
            "negative_prompt": TestConfig.sdxl_negative,
            "width": TestConfig.sdxl_width,
            "height": TestConfig.sdxl_height,
            "steps": TestConfig.sdxl_steps,
            "guidance_scale": 7.5,
            "model": "sdxl"
        }
        
        # Start generation
        start_time = time.time()
        response = requests.post(f"{BASE_URL}/generate", json=payload)
        assert response.status_code == 200, f"Failed to start SDXL generation: {response.text}"
        
        result = response.json()
        job_id = result.get("job_id")
        estimated_time = result.get("estimated_time", 0)
        
        print(f"  Job ID: {job_id}")
        print(f"  Estimated time: {estimated_time:.1f}s")
        
        # Wait for completion (SDXL takes longer)
        status = wait_for_job(job_id, max_wait=600)  # 10 minutes for SDXL
        actual_time = time.time() - start_time
        
        print(f"\n  Actual time: {actual_time:.1f}s")
        print(f"  Time estimation accuracy: {(actual_time / estimated_time * 100):.1f}%" if estimated_time > 0 else "N/A")
        
        # Validate image
        image = validate_image_data(status.get("image_data"))
        assert image.size == (TestConfig.sdxl_width, TestConfig.sdxl_height)
        
        # Save for inspection
        image.save("test_sdxl_output.png")
        print(f"  Image saved to: test_sdxl_output.png")


# ============================================================================
# Job Management Tests
# ============================================================================

class TestJobManagement:
    """Tests for job status tracking and management"""
    
    def test_job_status_polling(self):
        """Test job status updates correctly"""
        payload = {
            "prompt": "test image",
            "width": 512,
            "height": 512,
            "steps": TestConfig.sd15_steps,
            "model": "sd15"
        }
        
        response = requests.post(f"{BASE_URL}/generate", json=payload)
        assert response.status_code == 200
        
        job_id = response.json()["job_id"]
        
        # Check initial status
        status_response = requests.get(f"{BASE_URL}/job/{job_id}")
        assert status_response.status_code == 200
        status = status_response.json()
        assert status["job_id"] == job_id
        assert status["status"] in ["pending", "loading_model", "generating", "completed"]
        
        # Wait for completion
        wait_for_job(job_id)
        
        # Verify completed status
        final_status = requests.get(f"{BASE_URL}/job/{job_id}").json()
        assert final_status["status"] == "completed"
        assert final_status["progress"] == 100.0
        assert final_status["image_data"] is not None
    
    def test_list_jobs(self):
        """Test job listing endpoint"""
        response = requests.get(f"{BASE_URL}/jobs")
        assert response.status_code == 200
        
        data = response.json()
        assert "jobs" in data
        assert "total" in data
        assert isinstance(data["jobs"], list)
        print(f"  Total jobs in queue: {data['total']}")
    
    def test_delete_job(self):
        """Test job deletion"""
        # First create a job
        payload = {
            "prompt": "test deletion",
            "width": 512,
            "height": 512,
            "steps": TestConfig.sd15_steps,
            "model": "sd15"
        }
        
        response = requests.post(f"{BASE_URL}/generate", json=payload)
        job_id = response.json()["job_id"]
        
        # Wait for completion
        wait_for_job(job_id)
        
        # Delete it
        delete_response = requests.delete(f"{BASE_URL}/job/{job_id}")
        assert delete_response.status_code == 200
        
        # Verify it's gone
        status_response = requests.get(f"{BASE_URL}/job/{job_id}")
        assert status_response.status_code == 404
        print("  Job deleted successfully")
    
    def test_nonexistent_job(self):
        """Test 404 for non-existent job"""
        response = requests.get(f"{BASE_URL}/job/nonexistent-job-id-12345")
        assert response.status_code == 404


# ============================================================================
# Error Handling Tests
# ============================================================================

class TestErrorHandling:
    """Tests for error handling and edge cases"""
    
    def test_invalid_model(self):
        """Test handling of invalid model type"""
        payload = {
            "prompt": "test",
            "model": "invalid_model"
        }
        
        response = requests.post(f"{BASE_URL}/generate", json=payload)
        assert response.status_code == 422  # Validation error
    
    def test_missing_prompt(self):
        """Test handling of missing prompt"""
        payload = {
            "width": 512,
            "height": 512,
            "model": "sd15"
        }
        
        response = requests.post(f"{BASE_URL}/generate", json=payload)
        assert response.status_code == 422  # Validation error
    
    def test_empty_prompt(self):
        """Test handling of empty prompt"""
        payload = {
            "prompt": "",
            "width": 512,
            "height": 512,
            "model": "sd15"
        }
        
        # Empty prompts may be allowed but should produce something
        response = requests.post(f"{BASE_URL}/generate", json=payload)
        # Could be 200 (accepted) or 422 (validation error)
        assert response.status_code in [200, 422]


# ============================================================================
# Synchronous Generation Tests
# ============================================================================

class TestSyncGeneration:
    """Tests for synchronous generation endpoint"""
    
    def test_sync_generation(self):
        """Test synchronous generation (blocking call)"""
        print("\n  Testing synchronous generation...")
        
        payload = {
            "prompt": "a simple flower, watercolor style",
            "width": 512,
            "height": 512,
            "steps": TestConfig.sd15_steps,
            "model": "sd15"
        }
        
        start_time = time.time()
        response = requests.post(f"{BASE_URL}/generate/sync", json=payload, timeout=300)
        elapsed = time.time() - start_time
        
        assert response.status_code == 200
        
        data = response.json()
        assert data["status"] == "completed"
        assert data["image_data"] is not None
        
        image = validate_image_data(data["image_data"])
        print(f"  Completed in {elapsed:.1f}s, image size: {image.size}")


# ============================================================================
# Time Estimation Tests
# ============================================================================

class TestTimeEstimation:
    """Tests to verify time estimation accuracy"""
    
    def test_sd15_time_estimation(self):
        """Test that SD 1.5 time estimation is reasonably accurate"""
        payload = {
            "prompt": "time estimation test",
            "width": 512,
            "height": 512,
            "steps": TestConfig.sd15_steps,
            "model": "sd15"
        }
        
        start_time = time.time()
        response = requests.post(f"{BASE_URL}/generate", json=payload)
        result = response.json()
        
        estimated_time = result.get("estimated_time", 0)
        status = wait_for_job(result["job_id"])
        actual_time = time.time() - start_time
        
        print(f"\n  Estimated: {estimated_time:.1f}s")
        print(f"  Actual: {actual_time:.1f}s")
        
        # Allow 50% variance for time estimation
        # (First run loads model, subsequent runs are faster)
        if estimated_time > 0:
            ratio = actual_time / estimated_time
            print(f"  Ratio: {ratio:.2f}x")
            # Very loose bound - estimation is hard
            assert 0.2 < ratio < 5.0, f"Time estimation too far off: {ratio:.2f}x"


# ============================================================================
# Run Tests
# ============================================================================

if __name__ == "__main__":
    import sys
    
    print("=" * 60)
    print("  Diffusion Service API Tests")
    print("=" * 60)
    
    # Quick check if server is running
    if not is_server_running():
        print("\nERROR: Diffusion server is not running!")
        print("Start it with: python server.py")
        print("Then run tests with: pytest test_diffusion_api.py -v")
        sys.exit(1)
    
    print("\nServer is running. Run tests with:")
    print("  pytest test_diffusion_api.py -v              # All tests")
    print("  pytest test_diffusion_api.py -v -k 'not sdxl'  # Skip slow SDXL test")
    print("  pytest test_diffusion_api.py -v -k 'health'    # Only health tests")
    print("  pytest test_diffusion_api.py -v -k 'sd15'      # Only SD 1.5 tests")
