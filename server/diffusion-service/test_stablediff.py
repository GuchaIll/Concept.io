import torch
from diffusers import StableDiffusionPipeline

pipe = StableDiffusionPipeline.from_pretrained(
    "GraydientPlatformAPI/realcartoon-real17",
    torch_dtype=torch.float16
).to("cuda")

# load LoRA
pipe.load_lora_weights("vislupus/SD1.5-LoRA-Princess-Mononoke-Style")

image = pipe(
    "pm_style, a stunning Japanese woman in traditional Japanese armor, filled with a Shinto temple",
   
    
).images[0]

image.save("lora.png")