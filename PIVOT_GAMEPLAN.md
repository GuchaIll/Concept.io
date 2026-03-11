# Concept.io Pivot Game Plan

## 🎯 Strategic Direction

**FROM:** Collaborative drawing app (Figma + Procreate blend)  
**TO:** Asset-driven, version-controlled collaborative concept art platform

> **Positioning Statement:** Concept.io is a version-controlled, asset-first platform for collaborative concept art—built for exploring ideas, not just drawing them.

---

## 📊 Current Architecture Analysis

### What Exists Today

| Component | Location | Status |
|-----------|----------|--------|
| **Canvas Engine** | fabric.js with React | ✅ Keep (foundation) |
| **Real-time Collab** | WebSocket rooms, broadcast | ✅ Keep & Extend |
| **Layer System** | `Layer.ts` - blend modes, opacity, visibility | ✅ Keep & Extend |
| **Brush Tools** | `Brush.ts`, `CustomBrush.ts`, pattern brushes | ✅ Keep (paint + blend) |
| **Eraser** | `Eraser.ts`, EraserBrush | ✅ Keep (essential for compositing) |
| **Fill/Eyedropper** | `Fill.ts`, `EyeDropper.ts` | ✅ Keep (color sampling) |
| **Shape Tools** | `Shape.ts` | ✅ Keep (quick masking, guides) |
| **Text Tools** | `Text.ts` | ✅ Keep |
| **History/Undo** | `History.ts` | ✅ Keep & Extend |
| **Backend** | Node.js + WebSocket server | ✅ Keep & Extend |
| **Database** | In-memory + MongoDB scaffold | ✅ Migrate to full MongoDB |
| **ML API** | FastAPI scaffold (empty) | 🆕 Implement |

---

## 🎨 Phase 1: Hybrid Paint + Kitbash Architecture

### Design Philosophy

Professional concept artists blend **freehand painting** with **kitbashing/photobashing** workflows. Like Photoshop, we maintain full paint capabilities while adding asset-first features. The brush is essential for:
- Painting over imported assets to blend them
- Quick sketching and thumbnailing
- Edge cleanup and refinement
- Color/lighting adjustments via paint layers

### Files to KEEP (All Paint Tools)

```
client/concept.io/src/hooks/
├── Brush.ts              ✅ KEEP (core paint tool)
├── CustomBrush.ts        ✅ KEEP (advanced brush patterns)  
├── Eraser.ts             ✅ KEEP (compositing essential)
├── Fill.ts               ✅ KEEP (quick fills, base colors)
├── EyeDropper.ts         ✅ KEEP (color sampling from assets)
```

### Files to MODIFY

#### `client/concept.io/src/config/tools.ts`
Keep ALL existing tools AND add new ones:

**Keep these tools:**
- `Eyedropper` → Color sampling (essential for matching)
- `Fill` → Quick base colors
- `Brush` → Freehand painting & blending
- `Eraser` → Cleanup & masking
- `Shape` → Quick shapes & guides
- `Text` → Labels & annotations
- `Zoom`, `Pan`, `Rotate`, `Mirror` → Navigation

**Add new tools:**
- `Select` (selection tool for assets)
- `Asset` (import/place assets from library)
- `Transform` (scale, rotate, distort)
- `Mask` (non-destructive layer masking)
- `Generate` (AI generation trigger)

#### `client/concept.io/src/components/Submenu/`
- **KEEP:** `BrushSubmenu.tsx` (paint tool settings)
- **KEEP:** `ShapeSubmenu.tsx`, `TextSubmenu.tsx`
- **ADD:** `AssetSubmenu.tsx`, `GenerateSubmenu.tsx`, `MaskSubmenu.tsx`

#### `client/concept.io/src/components/Editor/`
- **KEEP:** `CustomBrushProperties.tsx` (brush customization)
- **ADD:** `AssetProperties.tsx`, `GenerationPanel.tsx`

#### `client/concept.io/src/contexts/`
- **KEEP:** `BrushContext.tsx` (brush state management)
- **ADD:** `AssetContext.tsx`, `VersionContext.tsx`

#### `client/concept.io/src/components/FCanvas.tsx`
- **KEEP:** `CustomBrushProperties` and brush-related props
- **ADD:** `AssetPanel`, `VersionTimeline` components

---

## 🏗️ Phase 2: Core Feature Implementation

### 2.1 Version Timeline System (Priority: HIGH)

**Concept:** Git-like version control for visual projects. Each "commit" is a full snapshot of all layers, not a flattened image.

#### New Files to Create

```
client/concept.io/src/
├── hooks/
│   └── VersionTimeline.ts          # Version control logic
├── components/
│   └── VersionTimeline/
│       ├── Timeline.tsx            # Main timeline UI
│       ├── SnapshotCard.tsx        # Individual version preview
│       ├── BranchSelector.tsx      # Branch switching
│       └── DiffViewer.tsx          # Visual diff between versions
├── types/
│   └── version.interface.ts        # Version/Branch types
```

#### Data Model

```typescript
// common/version.interface.ts
export interface ISnapshot {
  id: string;
  projectId: string;
  branchId: string;
  name: string;
  description?: string;
  layers: ILayerSnapshot[];      // Full layer stack
  thumbnail: string;              // Base64 preview
  createdBy: string;
  createdAt: number;
  parentSnapshotId?: string;      // For branching
}

export interface IBranch {
  id: string;
  projectId: string;
  name: string;                   // "main", "dark-lighting", "alt-composition"
  headSnapshotId: string;
  createdBy: string;
  createdAt: number;
}

export interface ILayerSnapshot {
  layerId: string;
  name: string;
  objects: string;                // Serialized fabric objects
  visible: boolean;
  opacity: number;
  blendMode: string;
  zIndex: number;
}
```

#### WebSocket Events to Add

```typescript
// New event types
type VersionEvent = {
  type: 'snapshot:create' | 'snapshot:restore' | 'branch:create' | 'branch:merge';
  payload: any;
  userId: string;
  roomId: string;
};
```

---

### 2.2 Asset Library System (Priority: HIGH)

**Concept:** Assets are first-class citizens with metadata, not just pixels. Supports import, AI generation, and reuse across projects.

#### New Files to Create

```
client/concept.io/src/
├── hooks/
│   └── Asset.ts                    # Asset management logic
├── components/
│   └── AssetLibrary/
│       ├── AssetPanel.tsx          # Main asset browser
│       ├── AssetCard.tsx           # Individual asset preview
│       ├── AssetUploader.tsx       # Import/drag-drop
│       ├── AssetMetadata.tsx       # Tags, description editor
│       └── AssetSearch.tsx         # Search/filter
├── contexts/
│   └── AssetContext.tsx            # Asset state management
├── types/
│   └── asset.interface.ts          # Asset types
```

#### Data Model

```typescript
// common/asset.interface.ts
export interface IAsset {
  id: string;
  name: string;
  type: 'cutout' | 'texture' | 'silhouette' | 'environment' | 'prop' | 'character';
  tags: string[];
  thumbnail: string;
  fullImage: string;              // URL or base64
  width: number;
  height: number;
  createdBy: string;
  createdAt: number;
  usageCount: number;
  projectIds: string[];           // Projects using this asset
  metadata: {
    source?: 'upload' | 'generated' | 'imported';
    generationPrompt?: string;    # If AI-generated
    originalUrl?: string;         # If imported
  };
}
```

#### Server Endpoints to Add

```typescript
// server/src/controllers/asset.controller.ts
POST   /api/assets              # Create/upload asset
GET    /api/assets              # List assets (with filters)
GET    /api/assets/:id          # Get single asset
PUT    /api/assets/:id          # Update asset metadata
DELETE /api/assets/:id          # Delete asset
POST   /api/assets/generate     # Trigger AI generation
```

---

### 2.3 AI/Diffusion Integration (Priority: MEDIUM)

**Concept:** Integrated AI tools for asset generation, regional editing, and style matching.

#### ML API Implementation

```python
# ml_api/app/main.py
from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI()

# Endpoints to implement:
@app.post("/generate/cutout")
async def generate_cutout(prompt: str, style: str = "concept-art"):
    """Generate a transparent cutout asset from text prompt"""
    pass

@app.post("/generate/environment")
async def generate_environment(prompt: str, aspect_ratio: str = "16:9"):
    """Generate background/environment"""
    pass

@app.post("/edit/regional")
async def regional_edit(
    image: UploadFile,
    mask: UploadFile,
    prompt: str
):
    """Inpaint/edit specific region of image"""
    pass

@app.post("/style/match")
async def style_match(
    source_image: UploadFile,
    target_image: UploadFile
):
    """Transfer style from source to target"""
    pass

@app.post("/remove/background")
async def remove_background(image: UploadFile):
    """Remove background, return cutout"""
    pass
```

#### Frontend Integration

```typescript
// client/concept.io/src/services/AIService.ts
export class AIService {
  private baseUrl = 'http://localhost:8000';
  
  async generateCutout(prompt: string, style?: string): Promise<Blob>;
  async generateEnvironment(prompt: string): Promise<Blob>;
  async regionalEdit(image: Blob, mask: Blob, prompt: string): Promise<Blob>;
  async styleMatch(source: Blob, target: Blob): Promise<Blob>;
  async removeBackground(image: Blob): Promise<Blob>;
}
```

---

### 2.4 Art Tools Hub (Priority: MEDIUM)

**Concept:** Centralized panel for advanced AI-powered creation tools, organized as modular "tool cards."

#### Components to Create

```
client/concept.io/src/components/
└── ArtToolsHub/
    ├── ArtToolsHub.tsx           # Main hub container
    ├── ToolCard.tsx              # Individual tool card
    ├── GenerateCutout.tsx        # Cutout generation UI
    ├── GenerateEnvironment.tsx   # Environment generation UI
    ├── RegionalEdit.tsx          # Inpainting interface
    ├── StyleMatcher.tsx          # Style transfer UI
    └── BackgroundRemover.tsx     # Background removal tool
```

---

## 🗄️ Phase 3: Backend & Database

### 3.1 MongoDB Full Implementation

Extend `mongo.db.ts` with proper collections:

```typescript
// Collections needed:
- projects         # Project metadata
- snapshots        # Version snapshots
- branches         # Version branches  
- assets           # Asset library
- assetUsage       # Asset usage tracking
- users            # Extended user data
- teams            # Team/collaboration data
```

### 3.2 WebSocket Event Extensions

```typescript
// Add to server/src/common/
VersionEvent.ts    # snapshot:*, branch:*
AssetEvent.ts      # asset:add, asset:remove, asset:update
```

---

## 📁 Final File Structure (Post-Pivot)

```
client/concept.io/src/
├── hooks/
│   ├── Asset.ts              # NEW
│   ├── Brush.ts              # KEEP (paint tools)
│   ├── Canvas.ts             # KEEP
│   ├── CanvasNav.ts          # KEEP
│   ├── Color.ts              # KEEP (for paint & asset tinting)
│   ├── CustomBrush.ts        # KEEP (advanced brushes)
│   ├── Eraser.ts             # KEEP (compositing)
│   ├── EyeDropper.ts         # KEEP (color sampling)
│   ├── FabricHelper.ts       # KEEP
│   ├── Fill.ts               # KEEP (quick fills)
│   ├── History.ts            # KEEP & EXTEND
│   ├── Layer.ts              # KEEP & EXTEND
│   ├── Project.ts            # KEEP
│   ├── Shape.ts              # KEEP
│   ├── Text.ts               # KEEP
│   ├── VersionTimeline.ts    # NEW
│   ├── util.ts               # KEEP
│   └── ZoomPan.ts            # KEEP
├── components/
│   ├── AssetLibrary/         # NEW
│   ├── ArtToolsHub/          # NEW
│   ├── VersionTimeline/      # NEW
│   ├── Controls/
│   │   ├── Layer/            # KEEP & EXTEND
│   │   └── Selector/         # KEEP
│   ├── Editor/
│   │   ├── CustomBrushProperties.tsx  # KEEP
│   │   ├── AssetProperties.tsx        # NEW
│   │   └── GenerationPanel.tsx        # NEW
│   ├── Panel/
│   │   └── ToolBar.tsx       # MODIFY (add new tools)
│   └── Submenu/
│       ├── AssetSubmenu.tsx      # NEW
│       ├── BrushSubmenu.tsx      # KEEP
│       ├── GenerateSubmenu.tsx   # NEW
│       ├── MaskSubmenu.tsx       # NEW
│       ├── NavigationSubmenu.tsx # KEEP
│       ├── ShapeSubmenu.tsx      # KEEP
│       └── TextSubmenu.tsx       # KEEP
├── contexts/
│   ├── AssetContext.tsx      # NEW
│   ├── BrushContext.tsx      # KEEP
│   ├── CanvasContext.tsx     # KEEP & MODIFY
│   ├── ToolContext.tsx       # KEEP & MODIFY
│   └── VersionContext.tsx    # NEW
├── services/
│   ├── AIService.ts          # NEW
│   ├── AssetService.ts       # NEW
│   ├── VersionService.ts     # NEW
│   └── WebSocketService.ts   # KEEP & EXTEND
└── types/
    ├── asset.interface.ts    # NEW
    ├── version.interface.ts  # NEW
    └── tools.ts              # MODIFY (add new tools)
```

---

## 📅 Implementation Timeline

### Week 1-2: Foundation & New Tools
- [ ] Update `tools.ts` with new tool definitions (Select, Asset, Transform, Mask, Generate)
- [ ] Create `AssetContext.tsx` and `VersionContext.tsx`
- [ ] Add Select tool as primary asset interaction mode
- [ ] Implement basic Transform tool for asset manipulation
- [ ] Scaffold new submenu components

### Week 3-4: Version Timeline MVP
- [ ] Create `ISnapshot` and `IBranch` interfaces
- [ ] Implement `VersionTimeline.ts` hook
- [ ] Build `Timeline.tsx` UI component
- [ ] Add snapshot creation/restore functionality
- [ ] Extend WebSocket for version events

### Week 5-6: Asset Library MVP
- [ ] Create `IAsset` interface
- [ ] Implement `Asset.ts` hook
- [ ] Build `AssetPanel.tsx` with drag-drop
- [ ] Add server endpoints for asset CRUD
- [ ] Implement asset placement on canvas

### Week 7-8: AI Integration
- [ ] Set up FastAPI server in `ml_api/`
- [ ] Implement background removal endpoint
- [ ] Add cutout generation endpoint
- [ ] Build `AIService.ts` client
- [ ] Create `ArtToolsHub` UI

### Week 9-10: Polish & Integration
- [ ] Branch merging and visual diff
- [ ] Asset metadata and search
- [ ] Regional AI editing
- [ ] Performance optimization
- [ ] Testing and bug fixes

---

## 🎨 UI/UX Considerations

### Canvas Layout (Post-Pivot)
```
┌─────────────────────────────────────────────────────────────┐
│  [Logo]  File  Edit  View  Tools  Help     [Share] [Collab] │
├────────┬────────────────────────────────────┬───────────────┤
│        │                                    │               │
│  Tool  │                                    │   Layer       │
│  Bar   │         Canvas                     │   Panel       │
│        │         (Asset Composition)        │   +           │
│  ---   │                                    │   Asset       │
│  Quick │                                    │   Preview     │
│  Tools │                                    │               │
│        │                                    │               │
├────────┴────────────────────────────────────┴───────────────┤
│  ◀ ──────────── Version Timeline ──────────────────────── ▶ │
│  [main ▼]  ○──○──●──○──○──○    [+ Branch] [Merge] [Diff]   │
└─────────────────────────────────────────────────────────────┘
```

### Key Interactions
1. **Drag assets from library** → Canvas placement
2. **Right-click layer** → Generate AI variations
3. **Timeline scrub** → Instant state restoration
4. **Branch button** → Fork current state for exploration

---

## ✅ Success Metrics

- [ ] Paint tools (brush, eraser, fill) work seamlessly with asset layers
- [ ] Version timeline with 5+ snapshots working
- [ ] Asset library with 10+ test assets
- [ ] At least 2 AI generation endpoints functional
- [ ] Real-time collaboration still works with new features
- [ ] README updated with new project description

---

## 🚀 Getting Started

```bash
# 1. Create a new branch for the pivot
git checkout -b feature/asset-platform-pivot

# 2. Install new dependencies
cd client/concept.io
npm install uuid react-dnd react-dnd-html5-backend

# 3. Set up ML API
cd ml_api
pip install -r requirements.txt

# 4. Start development
npm run dev
```

---

**Document Version:** 1.0  
**Last Updated:** February 10, 2026  
**Author:** Concept.io Team
