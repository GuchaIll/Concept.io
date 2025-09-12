import asyncio
import io
import uuid
from typing import Any, Dict, List, Optional
from enum import Enum
import torch
from enum import Enum
import torch
from PIL import Image
import numpy as np
import os

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from diffusers import StableDiffusionXLPipeline, AutoencoderKL
import cv2
import shutil


# Redirect Hugging Face cache to a large temporary volume
os.environ["HF_HOME"] = "/tmp/huggingface"
os.environ["TRANSFORMERS_CACHE"] = "/tmp/huggingface"
os.environ["DIFFUSERS_CACHE"] = "/tmp/huggingface"

class AssetType(str, Enum):
    CHARACTER = "character"
    BACKGROUND = "background"
    WEAPON = "weapon"
    ITEM = "item"
    UI_ELEMENT = "ui_element"
    TEXTURE = "texture"
    ICON = "icon"
    ENVIRONMENT = "environment"

class GameStyle(str, Enum):
    PIXEL_ART = "pixel_art"
    LOW_POLY = "low_poly"
    REALISTIC = "realistic"
    CARTOON = "cartoon"
    HAND_DRAWN = "hand_drawn"
    ISOMETRIC = "isometric"
    ANIME = "anime"
    SCI_FI = "sci_fi"
    MINIMALIST = "minimalist"
    FANTASY = "fantasy"

class GenerationRequest(BaseModel):
    prompt: str = Field(..., description="Text prompt for image generation")
    negative_prompt: Optional[str] = Field(None, description="Negative text prompt to avoid certain features")
    asset_type: AssetType = Field(..., description="Type of game asset to generate")
    game_style: GameStyle = Field(..., description="Art style for the generated asset")
    num_images: int = Field(1, ge=1, le=5, description="Number of images to generate (1-5)")
    width: int = Field(512, ge=64, le=1024, description="Width of the generated images (64-1024)")
    height: int = Field(512, ge=64, le=1024, description="Height of the generated images (64-1024)")
    guidance_scale: float = Field(7.5, ge=1.0, le=20.0, description="Guidance scale for image generation (1.0-20.0)")
    num_inference_steps: int = Field(50, ge=10, le=100, description="Number of inference steps (10-100)")
    seed: Optional[int] = Field(None, description="Random seed for reproducibility")
    enhance_details: bool = Field(False, description="Whether to enhance image details using super-resolution")
    batch_size: int = Field(default=1, ge=1, le=2, description="Batch size for generation (1-2)")
    transparent_background: bool = Field(False, description="Generate images with transparent background")

class GenerationResponse(BaseModel):
    request_id: str
    status: str
    images: List[str] = []
    metadata: Dict[str, Any] = {}

class LayerDiffusionService:
    def __init__(self):
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.pipeline = None
        self.vae = None
        self.style_prompts =  self._load_style_prompts()
        self.asset_prompts = self._load_asset_prompts()

    async def initialize(self):
        #Load VAE
        self.vae = AutoencoderKL.from_pretrained(
            "madebyollin/sdxl-vae-fp16-fix",
            torch_dtype=torch.float32
        )

        # Load SDXL pipeline
        self.pipeline = StableDiffusionXLPipeline.from_pretrained(
            "stabilityai/stable-diffusion-2-1-base",
            vae=self.vae,
            dtype=torch.float32,
            use_safetensors=True,
            cache_dir="/tmp/huggingface",
        )

        total, used, free = shutil.disk_usage("/tmp")
        print(f"Free space on /tmp: {free / 1e9:.2f} GB")

        if self.device == "cuda":
            self.pipeline = self.pipeline.to("cuda")
            # Enable memory efficient attention
            self.pipeline.enable_memory_efficient_attention()
            self.pipeline.enable_vae_slicing()
            self.pipeline.enable_vae_tiling()
        
        print("Pipeline initialized successfully!")
    def _load_style_prompts(self) -> Dict[str, Dict]:
        """Load style-specific prompt modifications"""
        return {
            GameStyle.PIXEL_ART: {
                "prefix": "pixel art, 8-bit style, retro game graphics",
                "suffix": ", pixelated, sharp edges, limited color palette",
                "negative": "blurry, smooth, realistic, photographic, anti-aliased"
            },
            GameStyle.CARTOON: {
                "prefix": "cartoon style, animated, colorful",
                "suffix": ", simple shapes, bold outlines, vibrant colors",
                "negative": "realistic, photographic, dark, gritty"
            },
            GameStyle.REALISTIC: {
                "prefix": "realistic, detailed, high quality",
                "suffix": ", photorealistic, detailed textures, professional game asset",
                "negative": "cartoon, anime, simplified, low poly"
            },
            GameStyle.FANTASY: {
                "prefix": "fantasy art, magical, medieval",
                "suffix": ", enchanted, mystical, RPG game style",
                "negative": "modern, sci-fi, realistic, contemporary"
            },
            GameStyle.SCI_FI: {
                "prefix": "sci-fi, futuristic, high-tech",
                "suffix": ", cyberpunk, space age, advanced technology",
                "negative": "fantasy, medieval, primitive, organic"
            },
            GameStyle.ANIME: {
                "prefix": "anime style, manga, Japanese animation",
                "suffix": ", cel-shaded, anime character design",
                "negative": "realistic, western, photographic"
            },
            GameStyle.MINIMALIST: {
                "prefix": "minimalist, simple, clean design",
                "suffix": ", geometric, flat design, modern",
                "negative": "complex, detailed, ornate, busy"
            }
        }
    
    def _load_asset_prompts(self) -> Dict[str, Dict]:
        """Load asset-specific prompt modifications"""
        return {
            AssetType.CHARACTER: {
                "suffix": ", game character, standing pose, full body, character design",
                "negative": "multiple characters, crowd, background elements"
            },
            AssetType.WEAPON: {
                "suffix": ", game weapon, item design, clean white background",
                "negative": "character holding, hands, person"
            },
            AssetType.ITEM: {
                "suffix": ", game item, inventory icon, object design",
                "negative": "character, background, environment"
            },
            AssetType.UI_ELEMENT: {
                "suffix": ", UI element, interface design, button, icon",
                "negative": "3d, characters, landscape"
            },
            AssetType.ENVIRONMENT: {
                "suffix": ", game environment, level design, background",
                "negative": "characters, UI elements, items"
            },
            AssetType.TEXTURE: {
                "suffix": ", seamless texture, tileable, pattern",
                "negative": "objects, characters, non-tileable"
            },
            AssetType.ICON: {
                "suffix": ", game icon, simple, recognizable, centered",
                "negative": "complex, detailed background, text"
            }
        }

    def _build_prompt(self, request: GenerationRequest) -> tuple[str, str]:
        """Build optimized prompts based on asset type and style"""
        style_config = self.style_prompts.get(request.game_style, {})
        asset_config = self.asset_prompts.get(request.asset_type, {})
        
        # Build positive prompt
        prompt_parts = []
        if style_config.get("prefix"):
            prompt_parts.append(style_config["prefix"])
        
        prompt_parts.append(request.prompt)
        
        if asset_config.get("suffix"):
            prompt_parts.append(asset_config["suffix"])
        if style_config.get("suffix"):
            prompt_parts.append(style_config["suffix"])
        
        if request.transparent_background:
            prompt_parts.append("transparent background, no background")
        
        positive_prompt = ", ".join(prompt_parts)
        
        # Build negative prompt
        negative_parts = [request.negative_prompt] if request.negative_prompt else []
        if style_config.get("negative"):
            negative_parts.append(style_config["negative"])
        if asset_config.get("negative"):
            negative_parts.append(asset_config["negative"])
        
        if request.transparent_background:
            negative_parts.append("background, detailed background, complex background")
        
        negative_prompt = ", ".join(negative_parts)
        
        return positive_prompt, negative_prompt
    
    async def generate_asset(self, request: GenerationRequest) -> GenerationResponse:
        """Generate game assets using LayerDiffusion"""
        if not self.pipeline:
            raise HTTPException(status_code=500, detail="Pipeline not initialized")
        
        request_id = str(uuid.uuid4())
        
        try:
            # Build optimized prompts
            positive_prompt, negative_prompt = self._build_prompt(request)
            
            # Set seed for reproducibility
            generator = None
            if request.seed is not None:
                generator = torch.Generator(device=self.device).manual_seed(request.seed)
            
            # Generate images
            with torch.autocast(self.device):
                if request.transparent_background:
                    # For transparent background, we'll need to implement LayerDiffusion
                    # For now, using standard pipeline and post-processing for transparency
                    result = self.pipeline(
                        prompt=positive_prompt,
                        negative_prompt=negative_prompt,
                        width=request.width,
                        height=request.height,
                        num_inference_steps=request.num_inference_steps,
                        guidance_scale=request.guidance_scale,
                        num_images_per_prompt=request.batch_size,
                        generator=generator,
                        output_type="pil"
                    )
                    images = result.images
                    
                    # Post-process for transparency (basic background removal)
                    processed_images = []
                    for img in images:
                        if request.transparent_background:
                            transparent_img = self._remove_background(img)
                            processed_images.append(transparent_img)
                        else:
                            processed_images.append(img)
                    
                    images = processed_images
                else:
                    result = self.pipeline(
                        prompt=positive_prompt,
                        negative_prompt=negative_prompt,
                        width=request.width,
                        height=request.height,
                        num_inference_steps=request.num_inference_steps,
                        guidance_scale=request.guidance_scale,
                        num_images_per_prompt=request.batch_size,
                        generator=generator,
                        output_type="pil"
                    )
                    images = result.images
            
            # Convert images to base64
            image_data = []
            for img in images:
                buffer = io.BytesIO()
                img.save(buffer, format="PNG")
                img_str = base64.b64encode(buffer.getvalue()).decode()
                image_data.append(img_str)
            
            return GenerationResponse(
                request_id=request_id,
                status="completed",
                images=image_data,
                metadata={
                    "positive_prompt": positive_prompt,
                    "negative_prompt": negative_prompt,
                    "style": request.style,
                    "asset_type": request.asset_type,
                    "dimensions": f"{request.width}x{request.height}",
                    "seed": request.seed
                }
            )
            
        except Exception as e:
            return GenerationResponse(
                request_id=request_id,
                status="failed",
                images=[],
                metadata={"error": str(e)}
            )
    
    def _remove_background(self, image: Image.Image) -> Image.Image:
        """Basic background removal (placeholder for LayerDiffusion)"""
        # Convert PIL to cv2
        img_array = np.array(image)
        img_cv2 = cv2.cvtColor(img_array, cv2.COLOR_RGB2BGR)
        
        # Simple background removal using GrabCut
        # This is a basic implementation - LayerDiffusion would be much better
        mask = np.zeros(img_cv2.shape[:2], np.uint8)
        bgd_model = np.zeros((1, 65), np.float64)
        fgd_model = np.zeros((1, 65), np.float64)
        
        height, width = img_cv2.shape[:2]
        rect = (10, 10, width-10, height-10)  # Assume object is in center
        
        try:
            cv2.grabCut(img_cv2, mask, rect, bgd_model, fgd_model, 5, cv2.GC_INIT_WITH_RECT)
            mask2 = np.where((mask == 2) | (mask == 0), 0, 1).astype('uint8')
            
            # Convert back to PIL with transparency
            img_rgb = cv2.cvtColor(img_cv2, cv2.COLOR_BGR2RGB)
            img_rgba = np.dstack((img_rgb, mask2 * 255))
            
            return Image.fromarray(img_rgba, 'RGBA')
        except:
            # Fallback: return original with alpha channel
            img_rgba = image.convert('RGBA')
            return img_rgba


# FastAPI Application
app = FastAPI(title="Game Asset Generation Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global service instance
layer_diffusion_service = LayerDiffusionService()


@app.on_event("startup")
async def startup_event():
    """Initialize the service on startup"""
    await layer_diffusion_service.initialize()


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "device": layer_diffusion_service.device,
        "pipeline_loaded": layer_diffusion_service.pipeline is not None
    }


@app.post("/generate", response_model=GenerationResponse)
async def generate_asset(request: GenerationRequest, background_tasks: BackgroundTasks):
    """Generate game assets"""
    try:
        response = await layer_diffusion_service.generate_asset(request)
        return response
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/styles")
async def get_available_styles():
    """Get available art styles"""
    return {
        "styles": [style.value for style in GameStyle],
        "descriptions": {
            GameStyle.PIXEL_ART: "8-bit retro game style with pixelated graphics",
            GameStyle.CARTOON: "Colorful animated cartoon style",
            GameStyle.REALISTIC: "Photorealistic detailed artwork",
            GameStyle.FANTASY: "Medieval fantasy RPG style",
            GameStyle.SCI_FI: "Futuristic cyberpunk style",
            GameStyle.ANIME: "Japanese animation style",
            GameStyle.MINIMALIST: "Clean, simple geometric design"
        }
    }


@app.get("/asset-types")
async def get_asset_types():
    """Get available asset types"""
    return {
        "asset_types": [asset_type.value for asset_type in AssetType],
        "descriptions": {
            AssetType.CHARACTER: "Game characters, NPCs, enemies",
            AssetType.WEAPON: "Swords, guns, magic items",
            AssetType.ITEM: "Consumables, collectibles, inventory items",
            AssetType.UI_ELEMENT: "Buttons, icons, interface elements",
            AssetType.ENVIRONMENT: "Backgrounds, levels, scenery",
            AssetType.TEXTURE: "Tileable patterns and surfaces",
            AssetType.ICON: "Small symbols and indicators"
        }
    }


@app.post("/batch-generate")
async def batch_generate(requests: List[GenerationRequest]):
    """Generate multiple assets in batch"""
    results = []
    for request in requests:
        try:
            response = await layer_diffusion_service.generate_asset(request)
            results.append(response)
        except Exception as e:
            results.append(GenerationResponse(
                request_id=str(uuid.uuid4()),
                status="failed",
                images=[],
                metadata={"error": str(e)}
            ))
    
    return {"results": results}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)