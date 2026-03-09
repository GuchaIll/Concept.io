# -*- coding: utf-8 -*-
"""
Concept.io Diffusion Service — modular FastAPI application.

Usage:
    from app import create_app
    app = create_app()
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import DIFFUSERS_AVAILABLE, CUDA_AVAILABLE
from .routes import health_router, generation_router, cutout_router, edit_router


def create_app() -> FastAPI:
    """Factory that builds and returns the configured FastAPI instance."""
    application = FastAPI(title="Concept.io Diffusion Service", version="2.0.0")

    # CORS
    application.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Routers
    application.include_router(health_router)
    application.include_router(generation_router)
    application.include_router(cutout_router)
    application.include_router(edit_router)

    @application.on_event("startup")
    async def startup_event():
        print("=" * 50)
        print("Diffusion service starting…")
        print(f"  DIFFUSERS_AVAILABLE: {DIFFUSERS_AVAILABLE}")
        print(f"  CUDA available: {CUDA_AVAILABLE}")
        print("=" * 50)

    return application
