"""
Test script to verify diffusers import works
Run this to debug import issues
"""

import os
import sys

# Disable xformers and triton before importing anything else
os.environ["XFORMERS_DISABLED"] = "1"
os.environ["DIFFUSERS_NO_XFORMERS"] = "1"
os.environ["TRITON_DISABLED"] = "1"
os.environ["ATTN_BACKEND"] = "sdpa"

print("=" * 60)
print("Testing diffusers import...")
print("=" * 60)

# Step 1: Check Python version
print(f"\n1. Python version: {sys.version}")

# Step 2: Check PyTorch
print("\n2. Testing PyTorch...")
try:
    import torch
    print(f"   ✓ PyTorch {torch.__version__}")
    print(f"   - CUDA available: {torch.cuda.is_available()}")
    if torch.cuda.is_available():
        print(f"   - CUDA version: {torch.version.cuda}")
        print(f"   - GPU: {torch.cuda.get_device_name(0)}")
    else:
        print("   - Running on CPU")
except ImportError as e:
    print(f"   ✗ PyTorch import failed: {e}")
    sys.exit(1)

# Step 3: Mock xformers to prevent DLL errors
print("\n3. Setting up xformers mock...")
class MockModule:
    def __getattr__(self, name):
        return MockModule()
    def __call__(self, *args, **kwargs):
        return MockModule()

mock_modules = [
    'xformers', 'xformers.ops', 'xformers.ops.fmha',
    'xformers.ops.fmha.flash3', 'xformers.flash_attn_3',
    'triton', 'triton.language'
]
for mod in mock_modules:
    if mod not in sys.modules:
        sys.modules[mod] = MockModule()
print("   ✓ Mock modules installed")

# Step 4: Try importing diffusers
print("\n4. Testing diffusers import...")
try:
    from diffusers import StableDiffusionPipeline
    print("   ✓ StableDiffusionPipeline imported")
except Exception as e:
    print(f"   ✗ Failed: {type(e).__name__}: {e}")

try:
    from diffusers import StableDiffusionXLPipeline
    print("   ✓ StableDiffusionXLPipeline imported")
except Exception as e:
    print(f"   ✗ Failed: {type(e).__name__}: {e}")

try:
    from diffusers import DPMSolverMultistepScheduler
    print("   ✓ DPMSolverMultistepScheduler imported")
except Exception as e:
    print(f"   ✗ Failed: {type(e).__name__}: {e}")

# Step 5: Summary
print("\n" + "=" * 60)
print("Import test complete!")
print("=" * 60)

# Step 6: Try a simple generation test
print("\n5. Testing simple image generation (mock)...")
try:
    from PIL import Image, ImageDraw
    
    img = Image.new('RGB', (256, 256), color=(50, 50, 80))
    draw = ImageDraw.Draw(img)
    draw.text((128, 128), "Test OK", fill=(255, 255, 255), anchor="mm")
    
    # Save test image
    test_path = os.path.join(os.path.dirname(__file__), "test_output.png")
    img.save(test_path)
    print(f"   ✓ Test image saved to: {test_path}")
except Exception as e:
    print(f"   ✗ Failed: {e}")
