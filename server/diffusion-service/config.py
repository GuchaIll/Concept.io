import StableDiffusionXLInpaintPipeline, StableDiffusionXLControlNetPipeline,ControlNetModel, AutoPipelineForInpainting from diffusers
import os



CONTROLNET_UNION_PATH = os.getenv("CONTROLNET_UNION_PATH", "models/controlnet-union/control_v11p_sd15_openpose.pth")
IP_ADAPTER_DIR = os.getenv("IP_ADAPTER_DIR", "models/ip-adapter")
IP_ADAPTER_WEIGHTS = os.getenv("IP_ADAPTER_WEIGHTS", "models/ip-adapter/weights.pth")
COSXL_EDIT_PATH = os.getenv("COSXL_EDIT_PATH", "models/cosxl/edit.pth")