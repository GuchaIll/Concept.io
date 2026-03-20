# Concept.io

**A Real-Time Collaborative Canvas with Diffusion-Powered Asset Generation and Git-Like Version Branching**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue)](https://www.typescriptlang.org/)
[![Python](https://img.shields.io/badge/Python-3.10+-green)](https://www.python.org/)
[![React](https://img.shields.io/badge/React-19-61dafb)](https://reactjs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## Table of Contents

- [Who This Is For](#who-this-is-for)
- [What Is Concept.io?](#what-is-conceptio)
- [Quick Start](#quick-start)
- [Core Capabilities](#core-capabilities)
- [System Architecture](#system-architecture)
- [API Reference](#api-reference)
- [Tech Stack](#tech-stack)
- [Repository Structure](#repository-structure)
- [Getting Started](#getting-started)
- [Troubleshooting](#troubleshooting)
- [Current Limitations](#current-limitations)
- [Roadmap](#roadmap)
- [Design Inspiration](#design-inspiration)
- [Contributing](#contributing)
- [License](#license)

---

## Who This Is For

- **Technical artists** wanting AI-assisted workflows with version control and real-time collaboration
- **Developers** building or studying collaborative creative tools with ML integration
- **Teams** needing Git-like project branching across a shared canvas without leaving the browser

---

## What Is Concept.io?

Concept art workflows are fragmented across disconnected tools: painting applications, AI image generators, and manual file-based version tracking that cannot be shared in real time. Concept.io unifies these into a single browser session.

A team can paint freehand, generate AI assets directly inside the scene, extract subjects with AI-assisted masking, branch and snapshot versions like Git, and sync projects to GitHub or the filesystem — without leaving the canvas.

Think Figma + Photoshop + Stable Diffusion + Git, all in one canvas.

---

## Demo

https://github.com/user-attachments/assets/1163ffe1-113b-41c8-9177-40b12367f8aa

https://github.com/user-attachments/assets/a47a366a-2c19-47c2-9890-894ee19658cd

https://github.com/user-attachments/assets/f21fbbe4-4f2b-4d51-a4ba-b58acaa52f61

---

## Quick Start

```bash
git clone https://github.com/yourusername/Concept.io.git && cd Concept.io
npm run install:all          # installs Node deps + Python conda env
npm run db:up                # docker compose up -d postgres
npm run db:migrate           # knex migrate:latest
npm run dev:all              # client :5173  |  server :5000  |  diffusion :8000
```

See [Getting Started](#getting-started) for full configuration and environment variables.

---

## Core Capabilities

| Capability | What It Does | Why It Matters |
|------------|--------------|----------------|
| Real-time collaborative canvas | Typed layer system built on fabric.js 6 | Unifies freehand painting + AI generation in one shared surface |
| AI asset generation | SDXL + ControlNet pipelines via BullMQ queue | Async generation with job queue, progress tracking, and cancellation |
| Instruction-based editing | CosXL-Edit img2img + SDXL inpainting | Edit existing assets with natural language without leaving the canvas |
| Intelligent subject extraction | SAM ViT-B with Union-Find gap fill; rembg fallback | Composable per-object masks with pixel-perfect boundaries |
| Git-like version control | Branches, snapshots, delta-compressed layer persistence | Track iterations without storage bloat; branch without file copies |
| Parallel sync | GitHub (Octokit) + local filesystem strategies | Snapshot exports fan out to multiple external targets simultaneously |

---

## System Architecture

```mermaid
graph TD
    %% User/Client Tier
    subgraph Client_Tier [Client Tier]
        User((User))
        React[React 19 / fabric.js]
    end

    %% Application Tier
    subgraph App_Tier [Application Tier]
        direction TB
        NodeServer[Express 5 Orchestrator]
        WSS[WebSocket Server]
        BullMQ[BullMQ Job Queue]
        FastAPI[Python Diffusion Service]
    end

    %% Data Tier
    subgraph Data_Tier [Data & Persistence Tier]
        DB[(PostgreSQL 16)]
        Redis[(Redis)]
        Git[(External Git Repo)]
        FS[(Local Filesystem)]
    end

    %% Connections
    User -->|Interactive Input| React
    React <-->|HTTPS / REST| NodeServer
    React <-->|WSS / Real-time Sync| WSS

    NodeServer -->|Knex.js / SQL| DB
    NodeServer -->|Job dispatch| BullMQ
    BullMQ -->|Worker polling| FastAPI
    BullMQ <-->|Queue state| Redis

    NodeServer -->|Octokit / Git Strategy| Git
    NodeServer -->|Node fs / Local Strategy| FS

    %% Styling
    style Client_Tier fill:#f9f,stroke:#333,stroke-width:2px
    style App_Tier fill:#bbf,stroke:#333,stroke-width:2px
    style Data_Tier fill:#dfd,stroke:#333,stroke-width:2px
```

Three independently deployable services:

1. **Client (React + fabric.js)** — Canvas rendering and user interaction over REST/WebSocket
2. **Application Server (Node.js + Express)** — Collaboration, persistence, and external integrations
3. **AI Service (Python + FastAPI)** — GPU-bound ML inference, stateless and horizontally scalable

> **📖 For detailed architecture diagrams, sequence flows, technical deep dives, and design decisions, see [docs/architecture.md](docs/architecture.md)**

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/generate` | Enqueue async SDXL generation job. Returns `job_id`. |
| GET | `/api/job/:id` | Poll job status and retrieve completed image. |
| POST | `/api/edit` | Synchronous image edit (instruction, inpaint, ControlNet, outpaint). |
| POST | `/api/cutout/proposals` | Run SAM on an image and return mask proposals. |
| POST | `/api/cutout/apply` | Apply selected masks to produce an RGBA cutout. |
| GET | `/api/projects` | List all projects. |
| POST | `/api/projects` | Create a project. |
| GET | `/api/projects/:id/versions` | List branches and snapshots. |
| POST | `/api/projects/:id/versions/snapshot` | Create a snapshot on the current branch. |
| POST | `/api/projects/:id/sync` | Trigger manual sync to all enabled external targets. |
| GET/POST | `/api/assets` | Asset vault CRUD. |

---

## Tech Stack

| Category | Tooling |
|----------|---------|
| Language | TypeScript 5.8 (client + server), Python 3.10+ (diffusion service) |
| Client framework | React 19, Vite 7, fabric.js 6, Tailwind CSS 4 |
| Client libraries | @xyflow/react (timeline graph), framer-motion, react-router-dom 7, @dnd-kit, react-colorful |
| Server framework | Express 5.1, ws 8 |
| Server libraries | Knex.js 3, pg 8, BullMQ, helmet, morgan, compression, cors, @octokit/rest 22, sharp 0.34 |
| ML / AI | PyTorch 2.3+, diffusers (SDXL, individual ControlNet x5, fp16-fix VAE, CosXL-Edit img2img, inpainting), segment-anything (SAM ViT-B), rembg (U2-Net), controlnet-aux, OpenCV, Pillow |
| Database | PostgreSQL 16 (Docker Compose) |
| Queue / Cache | Redis, BullMQ |
| Infrastructure | Docker Compose, GitHub Actions CI (4-job pipeline), uvicorn ASGI |
| Auth | Session-based (Redis-backed sessions) |
| Testing | Jest 30, ts-jest, supertest (141+ tests), ESLint 9 |

---

## Repository Structure

```
Concept.io/
├── client/concept.io/          # React + fabric.js frontend (Vite)
│   └── src/
│       ├── components/         # Canvas, panels, toolbars, timeline UI
│       ├── contexts/           # VersionContext, ErrorBoundary
│       ├── hooks/              # Canvas.ts, Layer.ts, Brush.ts, EyeDropper.ts
│       ├── services/           # sync.service.ts (client-side WS wrapper)
│       └── types/              # Shared TypeScript interfaces
│
├── server/
│   ├── src/
│   │   ├── controllers/        # HTTP route handlers (generation, cutout, edit, sync, version, project)
│   │   ├── services/           # sync.service, export.service, crypto.service, diffusion.service
│   │   │   └── sync-strategies/  # git.strategy.ts, local.strategy.ts
│   │   ├── queues/             # diffusion.queue.ts (BullMQ job queue + cancellation)
│   │   ├── workers/            # diffusion.worker.ts (BullMQ consumer)
│   │   ├── db/                 # DAC interface, PostgresDatabase, InMemoryDatabase, MongoDatabase
│   │   │   └── migrations/     # Knex migration files
│   │   └── WebSocketServer.ts  # Room management + event broadcast
│   └── diffusion-service/      # Python FastAPI ML service
│       ├── app/
│       │   ├── routes/         # generation.py, edit.py, cutout.py, health.py
│       │   ├── services/       # pipeline.py (model loaders + LRU cache), cutout.py, generation.py, prompt_compiler.py
│       │   ├── models.py       # Pydantic request/response models
│       │   └── config.py       # Device detection, model IDs, env config
│       ├── pipeines/           # controlnet.py, inpaint.py, lora.py, generate.py  (note: folder name is a typo in the codebase)
│       └── models/             # Local model checkpoints (SAM, ControlNet, CosXL)
│
├── common/                     # Shared TypeScript types (client + server)
│   └── sync.interface.ts, asset.interface.ts, user.interface.ts, ...
├── docs/                       # Architecture diagrams, sequence flows, design docs
├── docker-compose.yml          # PostgreSQL 16
└── package.json                # npm workspaces root
```

---

## Getting Started

### Prerequisites

- Node.js >= 20
- Python 3.10+ with conda (recommended for environment isolation)
- Docker (for PostgreSQL)
- Redis (required for BullMQ job queue; `redis://localhost:6379` by default)
- A CUDA GPU is recommended; CPU fallback is functional at significantly reduced throughput (~40s/step for SDXL vs ~2.5s/step on GPU)
- SAM ViT-B checkpoint: download `sam_vit_b_01ec64.pth` from the Facebook Research segment-anything release and place it at `server/diffusion-service/models/sam_vit_b_01ec64.pth`

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/Concept.io.git
cd Concept.io

# Install all Node dependencies (client + server via npm workspaces)
# Also installs Python dependencies into the 'project' conda env
npm run install:all

# Start PostgreSQL
npm run db:up                  # runs: docker compose up -d postgres

# Run database migrations
npm run db:migrate

# Configure environment
cp server/.env.example server/.env
```

Required environment variables in `server/.env`:

```env
# Database
DB_DRIVER=postgres
DATABASE_URL=postgresql://postgres:concept123@localhost:5432/conceptio

# Services
DIFFUSION_SERVICE_URL=http://localhost:8000

# Redis (required for BullMQ generation queue)
REDIS_HOST=localhost
REDIS_PORT=6379

# Sync encryption — AES-256-GCM key for stored Git tokens
SYNC_ENCRYPTION_KEY=<32+ character random string>
```

### Running

```bash
# Start all three services concurrently
npm run dev:all

# The application is available at http://localhost:5173

# Or start services individually:
npm run dev:client      # Vite on port 5173
npm run dev:server      # Express + WebSocket on port 5000
npm run dev:diffusion   # FastAPI on port 8000 (uses conda env: project)

# Test, lint, typecheck
npm test
npm run test:coverage
npm run lint
npm run typecheck
```

---

## Troubleshooting

### "Cannot connect to diffusion service"
- Verify service is running: `curl http://localhost:8000/health`
- Check `DIFFUSION_SERVICE_URL` in `server/.env`
- GPU memory: run `nvidia-smi` to confirm available VRAM (minimum ~4 GB for SDXL)

### SAM checkpoint not found / fallback to rembg
- Expected path: `server/diffusion-service/models/sam_vit_b_01ec64.pth`
- The service will start and use rembg as a fallback; the client will indicate interactive region selection is unavailable
- Download from the [Facebook Research segment-anything release](https://github.com/facebookresearch/segment-anything#model-checkpoints)

### Generation jobs stuck in queue
- Verify Redis is running: `redis-cli ping` should return `PONG`
- Check `REDIS_HOST` and `REDIS_PORT` in `server/.env`
- The BullMQ worker logs job state transitions to stdout; check the server terminal

### WebSocket disconnections
- Check the browser console for reconnection backoff logs
- Verify no proxy is stripping WebSocket upgrade headers
- The client automatically rejoins the project room and replays missed events on reconnect

### Database migration errors
- Ensure PostgreSQL is running: `npm run db:up`
- The `uuid-ossp` extension is required; it is created automatically by the first migration

---

## Current Limitations

- WebSocket rooms are in-memory on a single Node instance; horizontal scaling requires sticky sessions or Redis Pub/Sub room membership.
- GPU inference is serialized through a single uvicorn worker; BullMQ queues jobs but a single worker processes them one at a time.
- Canvas rendering degrades noticeably beyond approximately 1,000 fabric.js objects due to synchronous main-thread rendering.
- Snapshot restore latency increases linearly with delta chain depth; long chains require a manual full-snapshot reset.
- Last-write-wins conflict resolution means simultaneous edits to the same canvas object by two users will silently discard one update.

---

## Roadmap

- **Redis Pub/Sub for WebSocket rooms** to enable horizontal scaling of the Node server without sticky sessions.
- **Multi-worker diffusion service** — deploy multiple BullMQ workers consuming from the same Redis queue, each with its own GPU, for concurrent generation.
- **Prometheus + Grafana** for generation latency per model, SAM processing time, WebSocket throughput, and sync success/failure rates.
- **S3 sync strategy** as a third sync target alongside local filesystem and Git.
- **Snapshot chain compaction** as a background job to bound restore latency by rewriting long delta chains into a single full snapshot.
- **CRDT conflict resolution** to replace last-write-wins broadcast with a model that handles true concurrent edits to the same layer without data loss.
- **Pressure-sensitive brush input** via Pointer Events API for stylus pressure and tilt on drawing tablets.

---

## Design Inspiration

- **Figma** — real-time collaborative canvas model and room-based WebSocket architecture
- **Git** — branching, HEAD pointers, snapshot (commit) chaining, and delta compression
- **Photoshop** — typed layer system with blend modes, opacity, and lock state
- **Stable Diffusion web UIs** — async job dispatch, polling, and in-canvas result placement

---

## Contributing

### Development Workflow
1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Run tests: `npm test && npm run test:coverage`
4. Submit a pull request against `main`

### Code Style
- TypeScript: ESLint + Prettier (see `client/concept.io/eslint.config.js`)
- Python: follow existing style in the diffusion service

### Adding a New Sync Target
1. Implement the `ISyncStrategy` interface
2. Register it in `server/src/services/sync.service.ts`
3. Add tests in `server/src/__tests__/sync.controller.test.ts`

---

## License

MIT License. See [LICENSE](LICENSE) for details.
