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
- [Screenshots](#screenshots)
- [Core Capabilities](#core-capabilities)
- [System Architecture](#system-architecture)
- [API Reference](#api-reference)
- [Tech Stack](#tech-stack)
- [Key Technical Decisions & Trade-offs](#key-technical-decisions--trade-offs)
- [Technical Deep Dives](#technical-deep-dives)
- [Error Handling & Edge Cases](#error-handling--edge-cases)
- [Repository Structure](#repository-structure)
- [Database Schema](#database-schema)
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

## Screenshots

### Canvas Workspace
![Canvas workspace](img/Canvas.png)

### Project Gallery
![Project gallery](img/Projects.png)

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

> Mermaid diagrams render in GitHub, GitLab, and most Markdown viewers with Mermaid support.

### Architectural Philosophy

Concept.io separates concerns into three independently deployable services:

1. **Client (React + fabric.js)** — Responsible for canvas rendering and capturing user interaction. Communicates with the application server over REST and WebSocket only; it has no direct knowledge of the database or ML service.

2. **Application Server (Node.js + Express)** — Coordinates collaboration, persistence, and external integrations. Acts as an HTTP proxy to the ML service, translating field naming conventions at the boundary. Manages WebSocket rooms and version control state.

3. **AI Service (Python + FastAPI)** — Handles GPU-bound ML inference independently of the web server. Stateless and horizontally scalable behind a load balancer. Never writes to the database directly.

This separation allows the inference tier to be scaled independently (multiple GPU workers behind the BullMQ queue), the web tier to be scaled independently (multiple Node instances with shared room state), and each service to be deployed and versioned separately.

### Collaboration Model

Canvas operations are serialized as fabric.js JSON mutations and broadcast over WebSocket to all participants in the project room. Conflict resolution currently uses a **last-write-wins model** per object: the last client to broadcast a mutation for a given canvas object wins. This is safe for the primary use case of concurrent drawing on different parts of the canvas.

True concurrent edits to the same layer object (e.g., two clients moving the same element simultaneously) will result in one update overwriting the other. CRDT-based reconciliation is planned as a future improvement.

### Communication Interfaces

| Channel | Protocol | Payload | Responsibility |
|---------|----------|---------|----------------|
| Client -> Server | REST (HTTP) | JSON, up to 100 MB | State mutations, auth, AI triggers, asset CRUD |
| Client <-> Server | WebSocket (ws 8) | JSON events, per-room | Real-time brush sync, version ops, asset vault mutations |
| Server -> Python | HTTP (via BullMQ worker) | JSON (snake_case) | ML inference offload: SDXL, SAM, ControlNet, img2img |
| Server <-> DB | SQL via Knex.js | Structured | Snapshot versioning, branch state, sync logs, asset persistence |
| Server -> External | Strategy (Git / Local) | PNG + JSON | Parallel sync to external targets |

### Sequence: AI Generation Flow

Generation is fully asynchronous. The Node server enqueues a job via BullMQ; the client polls `/api/job/:id` for progress. Jobs can be cancelled at any point.

```mermaid
sequenceDiagram
    participant C as Client (React)
    participant S as Server (Node)
    participant Q as BullMQ / Redis
    participant AI as AI Service (FastAPI)
    participant DB as PostgreSQL

    C->>S: POST /api/generate (prompt, model, dimensions)
    S->>S: Validate + map camelCase -> snake_case
    S->>Q: addGenerationJob() — returns job_id
    Q-->>S: job_id
    S-->>C: 200 OK + { job_id, estimated_time }

    loop Poll until completed
        C->>S: GET /api/job/:id
        S-->>C: { status, progress }
    end

    Q->>AI: Worker: POST /generate (proxied)
    AI->>AI: SDXL inference on GPU (~2.5s/step)
    AI-->>Q: { status: completed, image_data }
    Q->>S: updateJobStatus() via WebSocket notify callback
    S->>DB: Log generation job
    S->>C: WS event: generation:progress (completed + image_data)
    S->>C: Broadcast asset:created (all room members)
```

### Sequence: SAM Cutout Flow

```mermaid
sequenceDiagram
    participant C as Client (React)
    participant S as Server (Node)
    participant AI as AI Service (FastAPI)

    C->>S: POST /api/cutout/proposals (source image)
    S->>AI: Proxy to /cutout/proposals
    AI->>AI: SAM ViT-B automatic mask generation (~3s GPU)
    AI->>AI: Union-Find fragment merge (< 2% area threshold)
    AI->>AI: Nearest-neighbor dilation (gap fill)
    AI->>AI: Score proposals (area ratio, stability, background)
    AI-->>S: 12+ colored overlay proposals + grayscale masks
    S-->>C: Proposals array

    C->>C: User selects subject / background regions
    C->>S: POST /api/cutout/apply (selected mask IDs)
    S->>AI: Proxy to /cutout/apply
    AI->>AI: Union of subject masks + feathering + edge refinement
    AI-->>S: RGBA PNG (transparent background)
    S-->>C: Final cutout image
```

### Sequence: Version Snapshot and Parallel Sync

```mermaid
sequenceDiagram
    participant C as Client (React)
    participant S as Server (Node)
    participant DB as PostgreSQL
    participant GH as GitHub (Octokit)
    participant FS as Local Filesystem

    C->>S: WS event: version:snapshot:create (serialized layers)
    S->>DB: INSERT snapshot + per-layer records (delta or full)
    S-->>C: Broadcast version:snapshot:created (all room members)
    S->>S: syncAllEnabled() — Promise.allSettled fan-out
    par Parallel sync to external targets
        S->>GH: Commit tree via Octokit (AES-256-GCM token decrypt)
        GH-->>S: Commit SHA
        S->>DB: INSERT sync_log (success, duration_ms)
        S->>C: WS event: version:sync:status (GitHub — success)
    and
        S->>FS: Write PNGs + metadata.json
        FS-->>S: Done
        S->>DB: INSERT sync_log (success, duration_ms)
        S->>C: WS event: version:sync:status (Local — success)
    end
```

### Concurrency Model

| Process | Model | Notes |
|---------|-------|-------|
| React client | Single-threaded event loop | Canvas rendering synchronous on main thread via fabric.js; AI jobs are fire-and-forget with WebSocket progress updates |
| Node server | Async/await, non-blocking I/O | In-memory room map for O(1) WebSocket broadcast; Knex pool (max 10 DB connections) |
| BullMQ worker | Redis-backed job queue | GPU ops block the worker; queue isolates inference from the HTTP request lifecycle |
| Python service | Single uvicorn worker | Stateless and horizontally scalable behind a load balancer |
| Sync dispatch | Promise.allSettled fan-out | Targets run in parallel; one failure does not block others |

### Storage

| Layer | Technology | What It Stores |
|-------|-----------|----------------|
| Client | React state + Context API | Canvas object tree, layer list, brush state, version timeline, job queue |
| WebSocket rooms | In-memory Map | Active connections per project room; ephemeral |
| Job queue | BullMQ + Redis | Generation job state, progress, cancellation flags; completed jobs retained 1 hour |
| PostgreSQL | Knex.js + pg | Projects, branches, snapshots (full + delta chain), layer snapshots (fabric.js JSON), asset vault, sync targets (AES-256-GCM encrypted tokens), sync logs |
| Dev / test | InMemoryDatabase | Drop-in for the same IDatabase interface; no Docker required |
| Local FS | Local sync strategy | Per-layer PNGs, composite PNG, metadata JSON |
| Git remote | Octokit commit trees | Snapshot exports pushed to a configured GitHub repository branch |

---

## Scalability Model

Concept.io scales across three independent tiers:

**Web tier**
The Node server is stateless aside from in-memory WebSocket room membership. Multiple instances can run behind a load balancer with sticky sessions (current). For sessionless horizontal scaling, the in-memory room map moves to Redis Pub/Sub so any Node instance can broadcast to any room.

**AI inference tier**
The Python FastAPI service is stateless and can be scaled horizontally behind a load balancer. BullMQ dispatches jobs to workers, decoupling inference from the HTTP request lifecycle. Multiple GPU workers can consume from the same queue for concurrent generation.

**Storage tier**
PostgreSQL handles structured metadata. Large binary assets (exported PNGs, snapshots) are offloaded to external targets (local FS, GitHub, planned S3) rather than stored in the database. Delta snapshot compression keeps the per-snapshot write volume proportional to the number of changed layers, not the full canvas size.

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

## Key Technical Decisions & Trade-offs

| Decision | Why | Trade-off | Alternative Considered |
|----------|-----|-----------|------------------------|
| fabric.js over raw Canvas2D | Built-in object model, serialization, and blend-mode compositing; `toJSON`/`loadFromJSON` serves as both the broadcast and DB persistence format | Single-threaded synchronous rendering; scenes exceeding ~1,000 objects can stall the main thread | Pixi.js (abandoned for object model complexity) |
| In-memory WebSocket rooms over Redis Pub/Sub | Direct broadcast avoids serialization overhead and a network hop, keeping brush sync latency under 15ms on LAN | Cannot scale horizontally without sticky sessions or a shared room-membership layer | Redis Pub/Sub (planned for horizontal scaling) |
| BullMQ job queue for generation | Decouples inference from HTTP request lifecycle; supports cancellation, retries, and progress tracking | Requires Redis as an additional runtime dependency | Direct HTTP proxy (abandoned — blocked request lifecycle) |
| Individual ControlNet models over ControlNet-Union | Union (~1.5 GB) + SDXL UNet (~2.6 GB) exceeds 8 GB VRAM; individual models (315-700 MB) keep peak VRAM at ~3.5-4 GB | One checkpoint per control type; first use of each type incurs a disk load; type switches cost ~2s device move | ControlNet-Union (exceeded VRAM budget) |
| SAM ViT-B + Union-Find over rembg alone | rembg produces aggressive binary masks that erase fine detail; SAM generates composable per-object masks; Union-Find + dilation ensures every pixel is assigned | 375 MB checkpoint; ~3s per image on GPU vs. ~0.5s for rembg | rembg-only (kept as fallback) |
| Delta snapshots with chain resolution | Storing unchanged layers as reference pointers reduces storage ~75% for iterative workflows | Restore latency scales linearly with chain depth | Full snapshots only (storage bloat) |
| Strategy pattern for sync dispatch | Adding a new sync target (S3, FTP) requires only a new strategy file with no changes to the orchestrator or controller | Each strategy must independently implement retry logic and error reporting | Monolithic sync handler |
| AES-256-GCM encryption for sync credentials | Git tokens are encrypted at rest and decrypted only at dispatch time, limiting blast radius on a DB compromise | Key loss makes stored credentials unrecoverable | Plaintext storage (unacceptable) |

---

## Technical Deep Dives

<details>
<summary><b>Pixel-gap coverage in SAM masks</b></summary>

**Problem:** SAM ViT-B often leaves thin unclassified strips at object boundaries where no mask claims ownership. A naive union of selected masks produces visible holes at cutout edges.

**Solution:** After Union-Find fragment merging (merging fragments below 2% image area), an iterative nearest-neighbor dilation pass assigns each unclaimed pixel to the adjacent mask with the highest composite score, running until convergence.

**Result:** Zero pixel gaps at boundaries, ~40ms of CPU NumPy overhead per mask — eliminates all holes without blurring the boundary.
</details>

<details>
<summary><b>Exponential zoom drift on fast mouse-wheel input</b></summary>

**Problem:** Applying a fixed multiplicative factor per wheel event (`zoom *= 1.1`) compounds across rapid scroll events and sends the canvas to extreme values within seconds.

**Solution:** Read the raw `deltaY`, apply a linear scale mapping, and clamp each event's contribution to a 0.8x–1.25x window before composing with the current zoom level. The global range is hard-bounded at 0.1x–10x regardless of scroll speed.

**Result:** Smooth, predictable zoom behavior across all input speeds and devices.
</details>

<details>
<summary><b>Z-index desync between fabric.js object order and React layer state</b></summary>

**Problem:** fabric.js maintains its own internal object stack independent of React state. When layers are reordered in the UI, re-adding objects naively duplicates or misorders them on the canvas.

**Solution:** `reorderCanvasObjects` collects all canvas objects, sorts them by their assigned layer z-index, removes them all atomically, and re-adds them in the correct order inside a `requestAnimationFrame` callback to prevent mid-frame visual tearing.

**Result:** Layer order in the UI is always consistent with the fabric.js render stack.
</details>

<details>
<summary><b>Delta snapshot compression algorithm</b></summary>

When creating a snapshot, the system compares each layer to its previous snapshot:
- If unchanged: stores `{ snapshotType: 'reference', referenceSnapshotId: previousId }` — only a pointer
- If changed: stores full fabric.js JSON as `{ snapshotType: 'full' }`

`resolveSnapshot` walks the reference chain until it finds a full snapshot or reaches a configured depth limit, reconstructing the complete layer set for restore. This reduces storage ~75% for typical iterative workflows where one or two layers change per save.
</details>

---

## Error Handling & Edge Cases

- **Python service unavailable:** The Node proxy catches connection-refused errors and returns a structured `503` with a `serviceUnavailable` error code. The client surfaces a toast and marks the job failed rather than silently dropping it.
- **SAM checkpoint missing at startup:** The cutout service detects the missing model file on init and falls back to rembg for all requests. The response includes a `fallback: true` flag so the client can inform the user that interactive region selection is unavailable.
- **Sync target failure:** `Promise.allSettled` isolates failures per target. Each result is written to `sync_log` with status and error detail. A per-target `version:sync:status` WebSocket event lets the client show which targets succeeded and which failed without blocking the snapshot commit.
- **Broken delta chain:** If `resolveSnapshot` encounters a missing intermediate reference, it falls back to the most recent reachable full snapshot rather than throwing, preventing a total restore failure at the cost of potentially stale layer data.
- **WebSocket reconnection:** The client uses exponential backoff on disconnect. On reconnect it rejoins the project room and requests the current canvas history log to replay events missed during the gap.
- **Generation job cancellation:** Cancelled jobs are tracked in a `cancelledJobs` Set. The BullMQ worker checks this on each poll cycle and bails out; waiting jobs are removed from the queue immediately.

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
├── docker-compose.yml          # PostgreSQL 16
└── package.json                # npm workspaces root
```

---

## Database Schema

```
branches         (id, project_id, name, head_snapshot_id, created_by, created_at, color)
snapshots        (id, project_id, branch_id, name, description, thumbnail, created_by, created_at, parent_snapshot_id)
layer_snapshots  (id, snapshot_id, layer_id, name, type, objects, visible, opacity, blend_mode, z_index)
sync_targets     (id, project_id, type, name, config[encrypted], enabled, last_synced_at, last_sync_status, created_by, ...)
sync_log         (id, sync_target_id, snapshot_id, status, message, details, started_at, completed_at, duration_ms)
```

A `branch` is a mutable pointer to its HEAD snapshot. A `snapshot` is equivalent to a commit; `layer_snapshots` with `snapshotType: 'reference'` store only a pointer to an unchanged layer from a parent snapshot — `resolveSnapshot` walks the chain to reconstruct the full layer set.

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
