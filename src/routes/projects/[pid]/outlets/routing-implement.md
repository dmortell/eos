# Outlets Tool — Implementation Plan

## Overview

A floorplan-based outlet placement and cable routing tool. Users select a PDF floorplan page (from the uploads manager), place network outlets on it, link outlets to patch frame ports, and (later) draw cable trunk routes.

## Architecture

```
+page.svelte          — Firestore subscriptions, floor/file selection, data flow
Outlets.svelte        — Main layout: Titlebar, sidebar, canvas pane, status bar
parts/
  OutletCanvas.svelte — Pan/zoom canvas with PDF background + SVG overlay
  OutletPalette.svelte— Sidebar: tool select, file/page picker, outlet list
  types.ts            — All type definitions
  constants.ts        — Colors, sizes, defaults
```

### Coordinate System

All outlet positions are stored in **PDF page coordinates** (the native coordinate space of the rendered page at scale=1). Pan/zoom is handled by a CSS `transform: translate(vx, vy) scale(zoom)` on a wrapper div containing both the rasterised PDF canvas and the SVG overlay. This matches the PdfViewer pattern exactly.

The uploads tool already stores `origin` and `scale` per page in `files/{id}.pages[pageNum]`. The outlets tool reads these to convert between page-pixel coords and real-world mm for cable length calculations.

### Firestore Schema

```
Collection: outlets
Doc ID: {projectId}_F{floor}

{
  floor: number,
  outlets: OutletConfig[],
  trunks: TrunkConfig[],       // Phase 2
  routes: RouteConfig[],       // Phase 2
  selectedFileId?: string,     // which uploaded file is shown
  selectedPage?: number,       // which page of that file
}
```

Outlets reference frame ports by label (`FF.Z.NNN-SPP[-H]`), not by internal IDs, so they survive frame reconfiguration.

---

## Data Model

```typescript
// types.ts

interface Point { x: number; y: number }

type OutletLevel = 'low' | 'high'
type CableType = 'cat6a' | 'fiber-sm' | 'fiber-mm'
type MountType = 'wall' | 'floor' | 'box' | 'panel' | 'ceiling'
type OutletUsage = 'network' | 'phone' | 'av' | 'printer' | 'security'

interface OutletConfig {
  id: string
  position: Point              // PDF page coords
  level: OutletLevel
  portCount: number            // 1-12
  cableType: CableType
  mountType: MountType
  usage: OutletUsage
  label?: string               // user-assigned label, e.g. "A.042"
  portLabels?: string[]        // linked frame port labels (FF.Z.NNN-SPP)
  rotation?: number            // degrees, for symbol orientation
  roomNumber?: string          // optional room ref
  locked?: boolean             // prevent auto-routing changes
}

// Phase 2
interface TrunkConfig {
  id: string
  points: Point[]
  level: OutletLevel
  cableType: CableType
  label?: string
}

interface RouteConfig {
  id: string
  outletId: string
  rackId: string               // frame ID from racks tool
  waypoints: Point[]
  length: number               // mm (real-world via scale)
}
```

---

## Phase 1: Canvas + PDF + Outlet Placement

### 1.1 Page route (`+page.svelte`)

Subscribe to:
- `projects/{pid}` — project name, floors list
- `files` collection — all uploaded PDFs (filtered to projectId)
- `outlets/{pid}_F{floor}` — outlet data for active floor
- `frames/{pid}_F{floor}` — frame data (read-only, for port linking)

Props to `Outlets.svelte`: `data`, `files`, `floors`, `floor`, `projectId`, `projectName`, `frameData`, callbacks.

Floor switching follows the same pattern as frames `+page.svelte` — `{#key activeFloor}` re-mounts.

### 1.2 Layout (`Outlets.svelte`)

```
┌─ Titlebar ─────────────────────────────────────────┐
│ PaneGroup (horizontal)                              │
│ ┌─ Sidebar (20%) ─┐ ┌─ Main (80%) ──────────────┐ │
│ │ File picker      │ │ Toolbar (tools, zoom, lvl) │ │
│ │ Page thumbnails  │ │                            │ │
│ │ ─────────────── │ │ OutletCanvas               │ │
│ │ Outlet list      │ │ (PDF + SVG overlay)        │ │
│ │                  │ │                            │ │
│ │                  │ ├────────────────────────────┤ │
│ │                  │ │ Status bar (floor tabs)    │ │
│ └──────────────────┘ └────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

Toolbar inside main pane (same pattern as racks tool after recent refactor).

### 1.3 Canvas (`OutletCanvas.svelte`)

Reuse the PdfViewer pan/zoom pattern:
- State: `vx`, `vy`, `zoom`, `panning`
- CSS transform on wrapper: `translate({vx}px, {vy}px) scale({zoom})`
- Wheel: Ctrl/Meta = zoom (factor 1.15), Shift = horiz pan, else vert pan
- Right/middle drag = pan
- Left drag = tool action (place outlet, drag-select, etc.)
- `getPagePos(e)` converts screen to page coords

PDF rendering:
- Import `PdfState` from uploads tool (already exists)
- Render active page to `<canvas>` at RENDER_SCALE=2
- Apply grayscale filter by default (matching PdfViewer)
- Read crop from `fileDoc.pages[pageNum].crop` to clip display

SVG overlay (sibling of canvas, same dimensions):
- Outlets rendered as SVG symbols (circles, with port-count indicator)
- Selection highlights (cyan border)
- Drag-select rectangle
- (Phase 2: trunk lines, route dashes)

### 1.4 Sidebar (`OutletPalette.svelte`)

**File/page picker:**
- Dropdown of uploaded files (filtered to `projectId`, only files with `pages[n].origin` and `pages[n].scale` — i.e. calibrated files marked "Ready")
- Page number selector (if multi-page PDF)
- Small thumbnail of selected page

**Tool buttons:**
- Select (pointer) — default
- Outlet (circle icon) — click to place
- (Phase 2: Trunk, Route)

**Outlet list:**
- Table of placed outlets: label, ports, type, mount, linked status
- Click to select/scroll-to on canvas
- Bulk actions on selected: delete, change type, change port count

### 1.5 Outlet Placement

**Click to place:**
- In outlet tool mode, left-click on canvas creates outlet at page coords
- New outlet gets defaults: `level: 'low', portCount: 2, cableType: 'cat6a', mountType: 'wall', usage: 'network'`
- Auto-increment label counter (within zone): next available number

**Outlet symbols (SVG):**
- Circle (r=8/zoom for consistent screen size, or fixed page-coords size ~15px)
- Color by usage (matching frame tool LOC_TYPE_COLORS: blue=network, green=AP, etc.)
- Port count shown as small number inside or beside circle
- Level indicator: solid fill = low, ring/outline = high
- Mount type indicator: small icon suffix (wall bracket, floor arrow, box square)
- Selected: cyan highlight ring

**Dragging:**
- Left-click on existing outlet in select mode → select it
- Drag selected outlet(s) → move by delta in page coords
- Ctrl+click for multi-select, shift+click for range (if in list)
- Drag from empty space → drag-select rectangle

**Properties:**
- Selected outlet shows editable properties in sidebar or inline popover
- Port count (1-12), cable type, mount type, usage, level, label, room number

### 1.6 Keyboard Shortcuts

```
Esc         — Select mode / deselect
O           — Outlet tool
Delete/Bksp — Delete selected
1-9         — Set port count on selected outlet(s)
L           — Toggle to low level view
H           — Toggle to high level view
C           — Set cable type: cat6a
S           — Set cable type: fiber-sm
M           — Set cable type: fiber-mm
W           — Mount: wall
F           — Mount: floor
B           — Mount: box
```

### 1.7 Auto-save

Same debounced pattern as frames/racks tools:
- `$effect` watches state, debounces 500ms, calls `onsave(payload)`
- Parent writes to `outlets/{pid}_F{floor}` in Firestore
- `syncPaused` flag prevents remote updates from clobbering local edits

---

## Outlet Numbering & Frame Linking

### Auto-numbering

Outlets need labels that match the frame tool's location numbering scheme: `FF.Z.NNN` (floor.zone.locationNumber).

**Approach:**
- User selects a zone letter (A-Z) from sidebar
- "Auto-number" button or mode: user clicks outlets in desired order, each gets the next sequential number in that zone
- Label format: `{zone}.{NNN}` displayed on canvas (floor prefix added when generating full port labels)
- Manual override: user can edit the label directly

**Port-level linking:**
- Each outlet has `portCount` ports
- Each port maps to a frame port label: `FF.Z.NNN-SPP` where S=server room, PP=port number
- The server room assignment comes from the frame tool's LocationConfig for that location number
- Linking is automatic when the outlet label matches a location in the active zone: outlet label `A.042` with 2 ports → frame ports `FF.A.042-A01`, `FF.A.042-A02` (assuming room A)

**Read-only frame data:**
- Outlets tool subscribes to `frames/{pid}_F{floor}` (read-only)
- Displays linked status: green dot if all ports have matching frame entries, amber if partial, gray if unlinked
- Sidebar can show the full port labels for a selected outlet

---

## Phase 2: Cable Trunks & Routes (future)

### Trunks
- Polyline tool: click to add waypoints, right-click/Escape to finish
- Draggable waypoints and segments
- Level-aware (low/high)
- Containment type and size metadata

### Auto-routing
- For each outlet, find nearest rack (from frames data)
- Route: outlet → nearest trunk entry point → follow trunk → nearest trunk exit → rack
- Cable length = sum of segment lengths, converted to mm via page scale factor
- Display as dashed lines color-coded by cable type

### Cable Calculations
- Per-outlet cable length
- Aggregate by type, by rack, by zone
- Export to Excel (BOM)

---

## Files to Create

| File | Purpose |
|------|---------|
| `outlets/+page.svelte` | Firestore subscriptions, floor management |
| `outlets/Outlets.svelte` | Main layout with PaneGroup |
| `outlets/parts/types.ts` | OutletConfig, TrunkConfig, Point, enums |
| `outlets/parts/constants.ts` | Colors, default values, symbol sizes |
| `outlets/parts/OutletCanvas.svelte` | Pan/zoom canvas, PDF render, SVG overlay |
| `outlets/parts/OutletPalette.svelte` | Sidebar: file picker, tools, outlet list |

## Implementation Order

1. **types.ts + constants.ts** — data model and defaults
2. **+page.svelte** — Firestore wiring (outlets doc, files, frames, project)
3. **Outlets.svelte** — layout shell with Titlebar, PaneGroup, floor tabs
4. **OutletCanvas.svelte** — pan/zoom with PDF background (no tools yet)
5. **OutletPalette.svelte** — file/page picker, tool buttons
6. **Outlet placement** — click-to-place, select, drag, delete
7. **Outlet properties** — sidebar editing, keyboard shortcuts
8. **Auto-numbering** — zone-based sequential labeling
9. **Frame linking** — read frame data, show linked port labels
10. **Trunk tool** — Phase 2
11. **Auto-routing** — Phase 2

## Key Reuse

- `PdfState` from `uploads/parts/PdfState.svelte.ts` — PDF loading and rendering
- Pan/zoom pattern from `PdfViewer.svelte` — vx/vy/zoom with CSS transform
- `PaneGroup/Pane/Handle` from `$lib/components/ui/resizable`
- `Titlebar`, `Icon`, `Button`, `Firestore`, `Spinner` from `$lib`
- `FloorManagerDialog` from `$lib/components`
- `LOC_TYPE_COLORS` concept from `frames/parts/types.ts` for outlet coloring
- Port label format `FF.Z.NNN-SPP[-H]` from frames engine
