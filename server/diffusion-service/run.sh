#!/bin/bash

source venv/bin/activate

export CUDA_VISIBLE_DEVICES=0
export PYTORCH_CUDA_ALLOC_CONF=max_split_size_mb:128

uvicorn server:app --host 0.0.0.0 --port 8000