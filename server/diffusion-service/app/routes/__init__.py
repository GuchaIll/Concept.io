from .health import router as health_router
from .generation import router as generation_router
from .cutout import router as cutout_router
from .edit import router as edit_router

__all__ = ["health_router", "generation_router", "cutout_router", "edit_router"]
