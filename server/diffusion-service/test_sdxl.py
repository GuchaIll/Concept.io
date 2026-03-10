# test_sdxl.py
import torch
from diffusers import StableDiffusionXLPipeline
from diffusers import DPMSolverMultistepScheduler



# pipe = StableDiffusionXLPipeline.from_pretrained(
#     "stabilityai/stable-diffusion-xl-base-1.0",
#     torch_dtype=torch.float16,
#     use_safetensors=True
# ).to("cuda")
print(torch.cuda.is_available())
print(torch.cuda.get_device_name(0))

pipe = StableDiffusionXLPipeline.from_pretrained(
    "stabilityai/stable-diffusion-xl-base-1.0",
    torch_dtype=torch.float16
).to("cuda")

pipe.scheduler = DPMSolverMultistepScheduler.from_config(pipe.scheduler.config)

pipe.load_lora_weights("./models/pixel-art-xl-v1.1.safetensors")

pipe.enable_vae_slicing()
pipe.enable_vae_tiling()

pipe.to("cuda", torch_dtype=torch.float16, variant="fp16",
        use_safetensors=True)

print(next(pipe.unet.parameters()).device)
print(next(pipe.unet.parameters()).dtype)

image = pipe("pixel art house background comfy brown and blue, pixel art style, 8k, detailed, high quality",
             height=768,
             width=768,
             num_inference_steps=20).images[0]
image.save("sdxl.png")