# Trunk Tool — Implementation Plan

## Summary

Add cable trunk drawing and editing to the outlets tool. Trunks define cable pathways (pipes, trays, ducts) as connected node/segment graphs drawn on the floorplan. Users draw segments by clicking points, then edit by dragging nodes and edges. Trunks render as extruded rectangles with mitered corners.

Build new components and utilities in `src/routes/projects/[pid]/outlets/trunks/` directory.

## Data Model

### Type Definitions (`trunks/types.ts`)

```typescript
export type TrunkShape = 'pipe' | 'rect'

export type TrunkLocation = 'floor' | 'ceiling-plenum' | 'ceiling-tray' | 'wall'

// Pipe specs — inner diameter defines capacity, outer = inner + 8mm for PF types
export interface PipeSpec {
  catalog: 'PF22' | 'PF28' | 'E51' | 'custom'
  innerDiameterMm: number
  outerDiameterMm: number
}

// Rectangular specs — MK duct, trays, ladders, etc.
export interface RectSpec {
  catalog: 'MK0' | 'MK1' | 'MK2' | 'MK3' | 'MK4' | 'MK5'
         | 'ladder' | 'tray' | 'mat' | 'custom'
  widthMm: number
  heightMm: number
}

export interface TrunkNode {
  id: string
  position: Point              // mm from origin
  z: number                    // elevation mm (0 = floor slab)
  radius?: number              // corner miter radius mm (0 = sharp)
  connectedOutletId?: string   // snap-linked to outlet
  connectedRackId?: string     // snap-linked to rack
}

export interface TrunkSegment {
  id: string
  nodes: [string, string]      // [fromNodeId, toNodeId]
}

export interface TrunkLabel {
  id: string
  segmentId: string            // which segment this label belongs to
  text: string
  offset: Point                // mm offset from segment midpoint
}

export interface TrunkConfig {
  id: string
  shape: TrunkShape
  location: TrunkLocation
  spec: PipeSpec | RectSpec
  nodes: TrunkNode[]
  segments: TrunkSegment[]
  labels?: TrunkLabel[]
  label?: string               // trunk-level name, e.g. "Main Floor Run"
  color?: string               // user override, else derived from shape
  isPrimary: boolean           // true = user-drawn, false = auto-generated
  visible?: boolean            // show/hide toggle (default true)
}

// Transient drawing state (not persisted)
export interface TrunkDrawState {
  drawMethod: 'click' | 'drag'
  constrainAngle: boolean      // shift held
  activeSpec: PipeSpec | RectSpec
  activeLocation: TrunkLocation
  activeShape: TrunkShape
  defaultZ: number
  tempNodes: TrunkNode[]       // nodes being drawn (uncommitted)
  selectedNodeIds: Set<string>
  selectedSegmentIds: Set<string>
  selectedTrunkIds: Set<string>
  hoveredNodeId: string | null
  hoveredSegmentId: string | null
}
```

### Update `parts/types.ts`

```typescript
// Add to ToolMode
export type ToolMode = 'select' | 'outlet' | 'trunk'

// Add to SidebarTab
export type SidebarTab = 'outlets' | 'racks' | 'trunks'

// Add to OutletsData
export interface OutletsData {
  // ... existing fields ...
  trunks?: TrunkConfig[]
}
```

### Why Graph (Nodes + Segments) Not Polyline

The requirements specify that 2+ edges can connect at a node (T-junctions, branches). A flat `points[]` array can't represent branching. The node/segment graph supports:
- T-junctions and crossings
- Splitting edges (Ctrl+click)
- Branching from existing nodes (Ctrl+drag)
- Per-node corner radius and Z elevation
- Snapping to outlets/racks

### Constants (`trunks/constants.ts`)

```typescript
export const PIPE_CATALOG: Record<string, { innerMm: number; outerMm: number; label: string }> = {
  PF22:   { innerMm: 22,  outerMm: 30,  label: 'PF22 (22mm flex)' },
  PF28:   { innerMm: 28,  outerMm: 36,  label: 'PF28 (28mm flex)' },
  E51:    { innerMm: 43,  outerMm: 51,  label: 'E51 (51mm steel)' },
}

export const RECT_CATALOG: Record<string, { widthMm: number; heightMm: number; label: string }> = {
  MK0:    { widthMm: 40,  heightMm: 20,  label: 'MK No.0 (40x20)' },
  MK1:    { widthMm: 40,  heightMm: 20,  label: 'MK No.1 (40x20)' },
  MK2:    { widthMm: 40,  heightMm: 20,  label: 'MK No.2 (40x20)' },
  MK3:    { widthMm: 80,  heightMm: 60,  label: 'MK No.3 (80x60)' },
  MK4:    { widthMm: 100, heightMm: 80,  label: 'MK No.4 (100x80)' },
  MK5:    { widthMm: 150, heightMm: 100, label: 'MK No.5 (150x100)' },
  ladder: { widthMm: 300, heightMm: 50,  label: 'Ladder' },
  tray:   { widthMm: 200, heightMm: 50,  label: 'Tray' },
  mat:    { widthMm: 500, heightMm: 5,   label: 'Rubber mat' },
}

export const TRUNK_COLORS: Record<TrunkShape, string> = {
  pipe: '#8b5cf6',   // purple
  rect: '#f97316',   // orange
}

export const LOCATION_LABELS: Record<TrunkLocation, string> = {
  'floor':          'Under Floor',
  'ceiling-plenum': 'Ceiling Plenum',
  'ceiling-tray':   'Ceiling Tray',
  'wall':           'Wall',
}
```

## Architecture

### New Files (in `trunks/`)

| File | Purpose |
|------|---------|
| `types.ts` | TrunkConfig, TrunkNode, TrunkSegment, TrunkLabel, PipeSpec, RectSpec, TrunkDrawState |
| `constants.ts` | PIPE_CATALOG, RECT_CATALOG, TRUNK_COLORS, LOCATION_LABELS |
| `geometry.ts` | Pure functions: miter polygon, hit testing, snapping, splitting, length calc |
| `TrunkPalette.svelte` | Sidebar: drawing settings, trunk list with visibility toggles, properties panel |
| `TrunkRenderer.svelte` | SVG rendering: extruded polygons, node handles, labels |

### Modified Files

| File | Changes |
|------|---------|
| `parts/types.ts` | Add `'trunk'` to ToolMode, `'trunks'` to SidebarTab, `trunks` to OutletsData |
| `Outlets.svelte` | Trunk state, CRUD with HistoryStore, sidebar tab, keyboard shortcuts, autosave |
| `parts/OutletCanvas.svelte` | Trunk drawing interaction, hit testing, TrunkRenderer integration |

## Interaction Design

### Drawing Mode (`activeTool === 'trunk'`)

Two user-selectable methods (toggle in TrunkPalette):

**Click-click mode:**
1. First click places first node
2. Subsequent clicks add nodes + segments connecting to previous
3. Click on existing node: connect to it (creates junction)
4. Dbl-click or Escape: finish current trunk
5. Right-click: cancel current drawing

**Drag mode:**
1. Click and hold: place first node
2. Drag: show preview line
3. Release: commit node + segment
4. Next drag from endpoint continues trunk
5. Dbl-click or Escape: finish

**Modifiers (both modes):**
- Shift: constrain angle to 15-degree increments
- Snap indicators when near existing nodes/outlets/racks (within 500mm)

**Visual feedback while drawing:**
- Rubber-band line from last node to cursor
- Ghost node at cursor position
- Angle constraint guide line when Shift held
- Snap indicator ring when near snap target

### Select Mode (trunks)

**Click:**
- Click node: select node (show Z editing, position, radius)
- Click segment: select segment (show label editing)
- Click trunk body (polygon): select entire trunk
- Ctrl+click: toggle multi-select

**Drag:**
- Drag node: move node, update connected segments
- Drag segment: move both endpoint nodes by same delta
- Ctrl+drag from node: start new segment from that node (branch)
- Ctrl+click segment: split segment, insert new node at click point
- Ctrl+drag from segment: split + start new segment from split point

**Delete:**
- Delete selected node: removes node and its segments
- Delete selected segment: removes segment only (keeps nodes)
- Delete selected trunk: removes entire trunk

**Keyboard:**
- T: switch to trunk drawing tool
- Delete: remove selected items
- Escape: deselect / cancel drawing

**Miter radius handle:**
- When a node with 2+ segments is selected, show a draggable handle at the miter position
- Drag handle to adjust `node.radius` (0–200mm)
- Visual feedback: arc preview updates in real-time

### Sidebar (`sidebarTab === 'trunks'`)

TrunkPalette layout:
```
┌─────────────────────┐
│ Shape: ◉Pipe ○Rect  │
│ Location: [Floor ▾] │
│ Type: [PF28 ▾]      │
│ Width/Dia: [28] mm  │
│ Z-elev: [0] mm      │
│ Draw: ◉Click ○Drag  │
├─────────────────────┤
│ Trunks:             │
│ 👁 T001 Main Floor  │
│ 👁 T002 Ceiling     │
│ 👁̶ T003 Auto (sec)  │
├─────────────────────┤
│ Selected: T001      │
│ Type: PF28 pipe     │
│ Location: Floor     │
│ Nodes: 12           │
│ Length: 45,230 mm   │
├─────────────────────┤
│ Node N003:          │
│ Pos: 1200, 3400 mm  │
│ Z: 0 mm             │
│ Radius: 50 mm       │
│ Connected: Outlet 5  │
└─────────────────────┘
```

Features:
1. **Drawing settings**: shape, location, catalog type, dimensions, Z, draw method
2. **Trunk list**: all trunks on floor, click to select, eye icon to toggle visibility
3. **Selected trunk properties**: type, location, dimensions, node count, total length
4. **Selected node properties**: position, Z elevation, corner radius, connected items

## Rendering

### Trunk Body (SVG via TrunkRenderer.svelte)

Miter algorithm adapted from `Walls4.svelte`:
1. Build adjacency graph from nodes + segments
2. For each connected subgraph, compute outline polygon:
   - Extrude each segment by widthMm/2 (or outerDiameterMm/2 for pipes) on each side
   - At junctions, compute miter or bevel based on angle and miterLimit
   - Apply SVG arc commands at nodes where `radius > 0` for rounded corners
3. Render as `<path>` with fill + stroke

**Visual styles:**
- Fill: trunk color at 20% opacity
- Stroke: trunk color, `1.5/zoom` width
- Selected: cyan highlight ring (`2/zoom` width)
- Dashed stroke for `ceiling-*` locations, solid for `floor`/`wall`
- Pipes: additional inner parallel dashed lines to distinguish from rectangular
- Secondary trunks (`isPrimary: false`): thinner stroke, lighter fill

### Node Handles (SVG, shown when trunk selected)

- Nodes: circles radius `4/zoom`, draggable, filled with trunk color
- Segment midpoints: circles radius `3/zoom`, semi-transparent, Ctrl+click to split
- Miter radius handle: diamond at radius distance from node, draggable
- Connected nodes: small link icon overlay

### Labels

- `TrunkLabel` entities rendered at segment midpoint + offset
- White rounded-rect background, dark text, `10/zoom` font size
- Leader line from label to segment midpoint if dragged away
- Dblclick segment to add/edit label

### Dead-End Indicators

- Pipes: ellipse at dead-end nodes (head-on view)
- Rectangular: filled end cap rectangle

## Geometry Module (`trunks/geometry.ts`)

Pure functions, fully testable:

```typescript
// Miter polygon from graph — adapted from Walls4.svelte
generateTrunkPolygon(nodes, segments, widthMm): Point[][]

// Hit testing (all in mm coordinates)
hitTestNode(pos, nodes, radiusMm): TrunkNode | null
hitTestSegment(pos, nodes, segments, widthMm): { segment: TrunkSegment; t: number } | null
hitTestBody(pos, polygons): TrunkConfig | null

// Snapping
constrainAngle(from, to): Point  // 15-degree snap
snapToNearby(point, targets, thresholdMm): { target: any; snappedPos: Point } | null

// Graph operations
splitSegment(trunk, segmentId, point): { node: TrunkNode; seg1: TrunkSegment; seg2: TrunkSegment }
computeTrunkLength(trunk): number  // sum of segment lengths in mm

// Utilities
findNearestPointOnSegment(point, a, b): { point: Point; t: number }
distanceToSegment(point, a, b): number
```

## Implementation Phases

### Phase 1: Types + Constants + Scaffold
1. Create `trunks/types.ts` with all trunk interfaces
2. Create `trunks/constants.ts` with catalogs and colors
3. Update `parts/types.ts`: add `'trunk'` to ToolMode, `'trunks'` to SidebarTab, `trunks` to OutletsData
4. Add `trunks` state to `Outlets.svelte`, include in autosave snapshot

### Phase 2: Geometry Module (`trunks/geometry.ts`)
1. `generateTrunkPolygon` — miter algorithm from Walls4.svelte
2. `hitTestNode`, `hitTestSegment`, `hitTestBody`
3. `constrainAngle`, `snapToNearby`
4. `splitSegment`, `computeTrunkLength`
5. `findNearestPointOnSegment`, `distanceToSegment`

### Phase 3: Basic Drawing (OutletCanvas.svelte)
1. Trunk drawing state: `drawingTrunk`, `tempNodes`, `rubberBandTarget`
2. Click-click handler: place nodes, create segments
3. Drag drawing handler
4. Shift-constrain and snap-to-existing logic
5. Escape/dblclick to finish, right-click to cancel
6. Render rubber-band line + ghost node during drawing

### Phase 4: Trunk Rendering (TrunkRenderer.svelte)
1. SVG component: props = trunks[], calibration, zoom, selectedIds, hoveredId
2. Generate and cache polygons via `generateTrunkPolygon`
3. Render `<path>` per trunk body with location-based styling
4. Render node handles + midpoint handles when selected
5. Render labels with backgrounds and leader lines
6. Miter radius drag handle rendering

### Phase 5: Select/Edit Interaction (OutletCanvas.svelte)
1. Hit testing pipeline: node → segment → body (priority order)
2. Node drag with snapshot-based undo/redo
3. Segment drag (translate both endpoints)
4. Ctrl+drag from node (branch) / Ctrl+click segment (split)
5. Delete: node removes node+segments, segment removes segment only
6. Miter radius handle drag

### Phase 6: Sidebar (TrunkPalette.svelte)
1. Drawing settings: shape toggle, location dropdown, catalog picker, dimension inputs, Z, draw method
2. Trunk list with visibility toggles and click-to-select
3. Properties panel: selected trunk info, selected node info
4. Sidebar tab integration

### Phase 7: CRUD + State (Outlets.svelte)
1. `addTrunk`, `updateTrunk`, `removeTrunk`, `updateTrunkNode`
2. All operations with HistoryStore undo/redo
3. Keyboard shortcuts: T for trunk tool
4. Include trunks in Firestore save payload

### Phase 8: Polish
1. Visual snap indicators (ring/crosshair near snap targets)
2. Dblclick segment to add/edit labels
3. Z-elevation editing in properties panel
4. Connected outlet/rack highlighting when node selected
5. Hover states and cursor feedback
6. Per-trunk visibility toggle rendering

## Deferred

Per trunk-features.md ("inv2026-04"):
- **Auto-routing**: generate secondary trunks from outlets to nearest primary trunk to rack
- **Route length calculation** along trunk graph (needs Dijkstra for branching)
- **Side elevation viewports** — floating windows with front/back/left/right projections for vertical trunk editing
- **Trunk capacity/fill** indicators
- **Trunk fill calculation** — % fill based on cable count/diameter

## Reference: Route Calculation Algorithm

`sample-routing/mine/CableRouter.svelte` (lines 654-774) has a working route calculator:

**`calculateOptimalRoute(from, to, level)`** — for each outlet:
1. Filter trunks matching the outlet's level
2. Find nearest point on any trunk segment to the outlet (`findNearestPointOnLine` — perpendicular projection clamped to segment)
3. Find nearest point on any trunk segment to the destination rack
4. Walk trunk waypoints between entry and exit segment indices (forward or reverse)
5. Build waypoints array: `[outlet, trunkEntry, ...trunkNodes, trunkExit, rack]`
6. Sum segment distances for cable length

**Key helpers:**
- `findNearestPointOnLine(point, lineStart, lineEnd)` — projects point onto segment, clamps t to [0,1]
- `findNearestSegmentIndex(point, points[])` — returns index of segment closest to point
- `calculateRouteLength(route)` — sums distances between consecutive waypoints

This works for simple polyline trunks. For the graph-based model, the route calculator will need Dijkstra/BFS to find shortest path through the node/segment graph.

## Reference: Miter Algorithm

`sample-routing/route-rendering/Walls4.svelte` (lines 88-167):
- Build adjacency list with angle-sorted neighbors
- Half-edge traversal using right-hand rule
- Miter joint calculation: intersect offset perpendiculars, bevel if angle exceeds miterLimit
- Dead-end handling: 180-degree turn with both perpendiculars
- Vector math: `sub`, `add`, `scale`, `norm`, `perp`, `cross`, `distSq`

## Verification Checklist

- [ ] Draw trunk by clicking points on floorplan (click-click mode)
- [ ] Draw trunk by dragging (drag mode)
- [ ] Shift constrains to 15-degree angles
- [ ] Snap to existing nodes/outlets/racks within threshold
- [ ] Escape finishes drawing, right-click cancels
- [ ] Click existing node during drawing creates junction
- [ ] Select mode: click node/segment/body to select
- [ ] Drag node moves it, updates connected segments
- [ ] Drag segment moves both endpoints
- [ ] Ctrl+drag from node creates branch
- [ ] Ctrl+click segment splits it
- [ ] Delete node removes node + connected segments
- [ ] Delete segment removes segment only, keeps nodes
- [ ] Miter radius handle adjusts corner rounding
- [ ] Undo/redo works for all operations
- [ ] Trunk renders with correct width and mitered corners
- [ ] Rounded corners render when node.radius > 0
- [ ] Pipes vs rectangular trunks visually distinct
- [ ] Location-based styling (dashed for ceiling, solid for floor)
- [ ] Primary vs secondary trunk styling distinct
- [ ] Labels display at segment midpoints, are editable via dblclick
- [ ] Per-trunk visibility toggle works
- [ ] Properties panel shows/edits trunk, node, and segment details
- [ ] Sidebar lists all trunks with visibility toggles
- [ ] Data persists to Firestore
- [ ] Zoom-invariant stroke widths and handles
