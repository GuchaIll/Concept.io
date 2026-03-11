#!/bin/bash

set -e

echo "Creating virtual environment..."
python -m venv venv
source venv/bin/activate

echo "Upgrading pip..."
pip install --upgrade pip

echo "Installing PyTorch (CUDA 12.1 build for RTX 4070)..."
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121

echo "Installing requirements..."
pip install -r requirements.txt

echo "Pre-downloading SDXL model (first run only)..."
python - <<EOF
from diffusers import StableDiffusionXLPipeline
StableDiffusionXLPipeline.from_pretrained(
"stabilityai/stable-diffusion-xl-base-1.0",
torch_dtype="auto"
)
EOF

echo ""
echo " Setup complete"
echo "Activate with: source venv/bin/activate"
echo "Run server with: bash run.sh"