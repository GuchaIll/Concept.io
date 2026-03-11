"""
Test script to verify the diffusion server endpoints work correctly.
Run the server first: uvicorn server:app --host 0.0.0.0 --port 8000
Then run this script: python test_server.py
"""

import requests
import time
import base64
from io import BytesIO
from PIL import Image

BASE_URL = "http://localhost:8000"

def test_root():
    """Test root endpoint"""
    print("\n=== Testing Root Endpoint ===")
    try:
        response = requests.get(f"{BASE_URL}/")
        print(f"Status: {response.status_code}")
        print(f"Response: {response.json()}")
        return response.status_code == 200
    except Exception as e:
        print(f"Error: {e}")
        return False

def test_health():
    """Test health endpoint"""
    print("\n=== Testing Health Endpoint ===")
    try:
        response = requests.get(f"{BASE_URL}/health")
        print(f"Status: {response.status_code}")
        data = response.json()
        print(f"Response: {data}")
        return data.get("status") == "healthy"
    except Exception as e:
        print(f"Error: {e}")
        return False

def test_generation():
    """Test image generation"""
    print("\n=== Testing Image Generation ===")
    
    # Start generation job
    payload = {
        "prompt": "a beautiful sunset over mountains, digital art",
        "negative_prompt": "blurry, bad quality",
        "width": 512,
        "height": 512,
        "steps": 10,  # Low steps for quick test
        "guidance_scale": 7.5,
        "model": "sd15"
    }
    
    print(f"Starting generation with payload: {payload}")
    
    try:
        response = requests.post(f"{BASE_URL}/generate", json=payload)
        print(f"Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"Error response: {response.text}")
            return False
        
        result = response.json()
        job_id = result.get("job_id")
        print(f"Job started: {job_id}")
        print(f"Estimated time: {result.get('estimated_time')}s")
        
        # Poll for completion
        max_polls = 120  # 2 minutes max
        for i in range(max_polls):
            time.sleep(1)
            
            status_response = requests.get(f"{BASE_URL}/job/{job_id}")
            status = status_response.json()
            
            print(f"  Poll {i+1}: status={status.get('status')}, progress={status.get('progress'):.1f}%")
            
            if status.get("status") == "completed":
                print("\n=== Generation Complete! ===")
                
                # Check if we got image data
                image_data = status.get("image_data")
                if image_data:
                    # Decode and save the image
                    if image_data.startswith("data:image"):
                        # Remove data URL prefix
                        image_data = image_data.split(",", 1)[1]
                    
                    image_bytes = base64.b64decode(image_data)
                    image = Image.open(BytesIO(image_bytes))
                    
                    output_path = "test_server_output.png"
                    image.save(output_path)
                    print(f"Image saved to: {output_path}")
                    print(f"Image size: {image.size}")
                    return True
                else:
                    print("No image data in response!")
                    return False
            
            elif status.get("status") == "failed":
                print(f"Generation failed: {status.get('error')}")
                return False
        
        print("Generation timed out!")
        return False
        
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    print("=" * 60)
    print("  Diffusion Server Test Script")
    print("=" * 60)
    
    all_passed = True
    
    # Run tests
    if not test_root():
        print("ROOT TEST FAILED")
        all_passed = False
    
    if not test_health():
        print("HEALTH TEST FAILED")
        all_passed = False
    
    if all_passed:  # Only test generation if basic tests pass
        if not test_generation():
            print("GENERATION TEST FAILED")
            all_passed = False
    
    print("\n" + "=" * 60)
    if all_passed:
        print("  ALL TESTS PASSED!")
    else:
        print("  SOME TESTS FAILED")
    print("=" * 60)
