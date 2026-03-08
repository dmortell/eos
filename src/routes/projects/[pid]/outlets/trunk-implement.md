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




  ## How Trunk Drawing Works

  Key scenarios:

  * Scenario 1: Extend an existing trunk from its endpoint
  1. Click on existing trunk's node A → drawingNodes = [{id: 'A', ...}], drawingSnaps = {A → trunkX}
  2. Click new point B → drawingNodes = [A, B], drawingSegments = [{A→B}]
  3. Finish → addTrunk sees snap for node A → merges into trunkX, adds node B and segment A→B

  * Scenario 2: Connect two existing trunks
  1. Click on trunk1's node A → snaps recorded
  2. Click new point B → new node + segment
  3. Click on trunk2's node C → snaps recorded
  4. Finish → addTrunk sees snaps for A (trunk1) and C (trunk2) → merges all into trunk1, incorporating trunk2's nodes/segments + the new drawing

  * Scenario 3: Create T-junction on same trunk
  1. Click on existing trunk's node A → snaps recorded
  2. Click new points B, C → new nodes + segments
  3. Finish → merges into trunkA, creating a branch from node A


  The trunk tool uses click-click mode (not click-drag). Here's the workflow:

  * Drawing a New Trunk

  1. Switch to the Trunks sidebar tab (click "Trunks" in the sidebar tabs)
  2. Activate the trunk tool — press T or click the "Trunk" button in the toolbar
  3. Click on the floorplan to place the first node — nothing visible yet, just a starting point
  4. Click again at the next position — this creates the second node and a segment connecting them. The trunk body now renders
  5. Keep clicking to add more nodes/segments — each new click extends the chain from the last node
  6. Finish the trunk by one of:
    - Press Escape — commits the trunk (requires 2+ nodes)
    - Double-click — commits
    - Click the green Finish button in the toolbar
  7. Cancel (discard without saving) by right-clicking or clicking the red X button

  * Modifiers While Drawing

  - Shift+click — constrains the next segment to 15-degree angle increments
  - Snap indicators appear when your cursor is near an existing node, outlet, or rack (within 500mm)

  * What "Connecting" Means

  Currently, the drawing always creates a new trunk as a linear chain. There is no support yet for clicking on an existing node to merge into it or create a junction during drawing. The handleTrunkClick function (line 661) always creates a brand-new node — it never checks if you clicked near an existing trunk's node to reuse it.

  The snapping (line 672) snaps the position to nearby targets, but doesn't actually link the new node to the existing one — it just places the new node at the same coordinates.

  * After Drawing — Editing

  Once a trunk is committed, switch back to Select mode:
  - Click a node — selects it, then drag to move it
  - Click trunk body — selects the whole trunk
  - Ctrl+click a segment — splits it (inserts a new node at that point)
  - Delete key — removes selected nodes or trunks


  How to use it now

  1. Activate trunk tool (T key or toolbar button)
  2. Click near an existing node to start from it (you'll see the snap indicator)
  3. Click to place new intermediate nodes
  4. Click near another existing node (same or different trunk) to connect to it
  5. Press Escape or double-click to finish — the new segments merge into the existing trunk(s)

## Verification Checklist

- [x] Draw trunk by clicking points on floorplan (click-click mode)
- [ ] Draw trunk by dragging (drag mode) — NOT IMPLEMENTED, click-click only
- [x] Shift constrains to 15-degree angles (drawing + node drag)
- [x] Snap to existing nodes/outlets/racks within threshold (125mm, rack edge midpoints)
- [x] Escape finishes drawing, right-click cancels
- [x] Click existing node during drawing creates junction (reuses node ID, merges trunks)
- [x] Select mode: click node/segment/body to select
- [x] Drag node moves it, updates connected segments (absolute delta, grid snap, node snap)
- [x] Drag segment moves both endpoints
- [ ] Ctrl+drag from node creates branch — NOT IMPLEMENTED
- [x] Ctrl+click segment splits it
- [x] Delete node removes node + connected segments (merges 2-segment nodes)
- [ ] Delete segment removes segment only — NOT IMPLEMENTED (delete removes nodes)
- [ ] Miter radius handle adjusts corner rounding — NOT IMPLEMENTED (radius field exists but no drag handle)
- [x] Undo/redo works for all operations
- [x] Trunk renders with correct width and mitered corners
- [x] Rounded corners render when node.radius > 0
- [x] Pipes vs rectangular trunks visually distinct
- [x] Location-based styling (dashed for ceiling, solid for floor)
- [ ] Primary vs secondary trunk styling distinct — PARTIAL (opacity differs)
- [ ] Labels display at segment midpoints, are editable via dblclick — NOT IMPLEMENTED
- [x] Per-trunk visibility toggle works
- [ ] Properties panel shows/edits trunk, node, and segment details — PARTIAL (palette only)
- [x] Sidebar lists all trunks with visibility toggles
- [x] Data persists to Firestore
- [x] Zoom-invariant stroke widths and handles

## Additional Features Implemented (not in original plan)

- [x] Grid snapping with configurable size (status bar input, default 100mm)
- [x] Realtime grid snap during drag (absolute delta from snapshot)
- [x] Realtime node snap during drag with visual highlight ring
- [x] Drawing snap highlight (purple ring near targets)
- [x] Incompatible trunk types kept separate (trunksCompatible check)
- [x] Coincident node dragging (connected-but-separate trunks move together)
- [x] Alt+drag to disconnect nodes at junctions
- [x] Right-click-drag to disconnect last segment from a node
- [x] Same-trunk node reconnection on drop
- [x] Trunk-to-rack connections (connectedRackId on nodes, edge midpoint snaps)
- [x] Connected nodes move with rack drag
- [x] Segment midpoint handles only show crosshair cursor when Ctrl held
- [x] Loop support with evenodd fill-rule (hollow interiors)
- [x] Escape cascade: finish drawing → clear selection → switch to select mode
- [x] Status bar hint "Alt+drag to disconnect" for junction nodes
- [x] Double-click duplicate node prevention (e.detail >= 2 and same-position check)
