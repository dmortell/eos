# Trunk Tool — Implementation Plan

## Summary

Add cable trunk drawing and editing to the outlets tool. Trunks are polylines drawn on the floorplan representing conduit/tray routes. Users draw segments by clicking points, then edit by dragging nodes and edges. Trunks store width, height, type, level, and render as extruded rectangles with mitered corners.

## Data Model

### Type Changes (`parts/types.ts`)

```typescript
// Trunk cross-section shapes
export type TrunkShape = 'pipe' | 'rect'

// Common pipe/duct catalog entries
export type TrunkType =
  | 'PF22' | 'PF28'           // Plastic flexible (inner dia mm)
  | 'E51'                      // Steel aluminum-zinc (outer dia mm)
  | 'MK0' | 'MK1' | 'MK2' | 'MK3' | 'MK4' | 'MK5'  // MK duct sizes
  | 'ladder' | 'tray' | 'mat' // Generic rectangular
  | 'custom'

export interface TrunkNode {
  id: string
  position: Point              // mm from origin
  z?: number                   // elevation mm (floor=0, default 0)
  radius?: number              // corner miter radius mm (default 0 = sharp)
  connectedOutletId?: string   // snap to outlet
  connectedRackId?: string     // snap to rack
}

export interface TrunkSegment {
  id: string
  nodes: [string, string]      // [fromNodeId, toNodeId]
  label?: string
  labelOffset?: Point          // relative to midpoint, mm
}

export interface TrunkConfig {
  id: string
  shape: TrunkShape
  type: TrunkType
  widthMm: number              // cross-section width (or diameter for pipes)
  heightMm: number             // cross-section height (same as width for pipes)
  level: OutletLevel           // 'low' (under floor) or 'high' (ceiling)
  cableType?: CableType
  nodes: TrunkNode[]
  segments: TrunkSegment[]
  label?: string
  color?: string               // user override, else derived from type
}

// Update OutletsData
export interface OutletsData {
  // ... existing fields ...
  trunks?: TrunkConfig[]
}

// Update ToolMode
export type ToolMode = 'select' | 'outlet' | 'trunk'
```

### Why Graph (Nodes + Segments) Not Polyline

The requirements specify that 2+ edges can connect at a node (T-junctions, branches). A flat `points[]` array can't represent branching. A node/segment graph supports:
- T-junctions and crossings
- Splitting edges (Ctrl+click)
- Branching from existing nodes (Ctrl+drag)
- Per-node corner radius
- Per-node Z elevation
- Snapping to outlets/racks

### Constants (`parts/constants.ts`)

```typescript
export const TRUNK_CATALOG: Record<TrunkType, { shape: TrunkShape; widthMm: number; heightMm: number; label: string }> = {
  PF22:    { shape: 'pipe', widthMm: 22,  heightMm: 22,  label: 'PF22 (22mm flex)' },
  PF28:    { shape: 'pipe', widthMm: 28,  heightMm: 28,  label: 'PF28 (28mm flex)' },
  E51:     { shape: 'pipe', widthMm: 51,  heightMm: 51,  label: 'E51 (51mm steel)' },
  MK0:     { shape: 'rect', widthMm: 40,  heightMm: 20,  label: 'MK No.0 (40x20)' },
  MK1:     { shape: 'rect', widthMm: 40,  heightMm: 20,  label: 'MK No.1 (40x20)' },
  MK2:     { shape: 'rect', widthMm: 40,  heightMm: 20,  label: 'MK No.2 (40x20)' },
  MK3:     { shape: 'rect', widthMm: 80,  heightMm: 60,  label: 'MK No.3 (80x60)' },
  MK4:     { shape: 'rect', widthMm: 100, heightMm: 80,  label: 'MK No.4 (100x80)' },
  MK5:     { shape: 'rect', widthMm: 150, heightMm: 100, label: 'MK No.5 (150x100)' },
  ladder:  { shape: 'rect', widthMm: 300, heightMm: 50,  label: 'Ladder' },
  tray:    { shape: 'rect', widthMm: 200, heightMm: 50,  label: 'Tray' },
  mat:     { shape: 'rect', widthMm: 500, heightMm: 5,   label: 'Rubber mat' },
  custom:  { shape: 'rect', widthMm: 100, heightMm: 50,  label: 'Custom' },
}

export const TRUNK_COLORS: Record<TrunkShape, string> = {
  pipe: '#8b5cf6',   // purple
  rect: '#f97316',   // orange
}
```

## Architecture

### New Files

| File | Purpose |
|------|---------|
| `parts/TrunkPalette.svelte` | Sidebar panel: trunk list, type picker, drawing settings |
| `parts/TrunkRenderer.svelte` | SVG rendering: extruded polygons with mitered corners |
| `parts/trunk-geometry.ts` | Pure functions: miter polygon generation, hit testing, snapping |

### Modified Files

| File | Changes |
|------|---------|
| `parts/types.ts` | Add TrunkNode, TrunkSegment, TrunkConfig, TrunkShape, TrunkType; update ToolMode, OutletsData |
| `parts/constants.ts` | Add TRUNK_CATALOG, TRUNK_COLORS |
| `Outlets.svelte` | Add trunk state, CRUD functions, sidebar tab, tool mode, keyboard shortcuts |
| `parts/OutletCanvas.svelte` | Add trunk drawing interaction, rendering, hit testing, snapping |

## Interaction Design

### Drawing Mode (`activeTool === 'trunk'`)

**Click-click drawing:**
1. First click sets first node
2. Subsequent clicks add nodes + segments connecting to previous
3. Shift held: constrain angle to 15-degree increments
4. Click on existing node: connect to it (creates junction)
5. Dbl-click or Escape: finish current trunk
6. Right-click: cancel current drawing

**Visual feedback while drawing:**
- Rubber-band line from last node to cursor
- Ghost node at cursor position
- Shift-constrained angle snaps shown as guide line
- Snap indicators when near existing nodes/outlets/racks (within 500mm)

### Select Mode (trunks)

**Click:**
- Click node: select node (show properties, enable Z editing)
- Click segment: select segment (show label editing)
- Click trunk body (polygon): select entire trunk
- Ctrl+click: toggle multi-select

**Drag:**
- Drag node: move node, update connected segments
- Drag segment: move both endpoint nodes by same delta
- Ctrl+drag from node: start new segment from that node (branch)
- Ctrl+click segment: split segment, insert new node at click point

**Keyboard:**
- Delete: remove selected nodes (and their segments) or selected trunks
- R: set corner radius on selected node (cycle 0 → 50 → 100 → 200 → 0 mm)
- T: switch to trunk drawing tool
- Escape: deselect

### Sidebar (`sidebarTab === 'trunks'`)

TrunkPalette shows:
1. **Drawing settings** (for new trunks): type dropdown, level toggle, width/height inputs
2. **Trunk list**: all trunks on this floor, click to select/zoom
3. **Selected trunk properties**: type, dimensions, level, label, node count, total length
4. **Selected node properties**: position (x, y, z), corner radius, connected items

## Rendering

### Trunk Body (SVG)

Use the miter algorithm from `Walls4.svelte` adapted to trunk geometry:

```
For each trunk:
  1. Build adjacency graph from nodes + segments
  2. For each connected subgraph, compute outline polygon:
     - Extrude each segment by widthMm/2 on each side
     - At junctions, compute miter or bevel based on angle
     - Apply corner radius if node.radius > 0
  3. Render as <path> with fill (semi-transparent) + stroke
  4. Pipes: same rectangle from above, dashed outline to distinguish
```

**Colors:**
- Fill: trunk color at 20% opacity
- Stroke: trunk color at full opacity, `1.5/zoom` width
- Selected: cyan highlight ring
- Level indication: dashed stroke for 'high' (ceiling), solid for 'low' (floor)

### Node Handles (SVG)

When trunk is selected:
- Nodes: small circles (radius `4/zoom`), draggable
- Midpoint of segments: smaller circles (radius `3/zoom`), Ctrl+click to split
- Connected nodes: show link icon

### Labels

- Segment labels: positioned at midpoint + offset, rotated to follow segment direction
- Trunk label: positioned at centroid of all nodes

### Front/End Indicators

For pipes, show ellipse at dead-end nodes (viewed head-on). For rectangular trunks, show filled end cap.

## Implementation Order

### Phase 1: Data + Types + Constants
1. Update `types.ts` with TrunkNode, TrunkSegment, TrunkConfig, update ToolMode/OutletsData
2. Add TRUNK_CATALOG and TRUNK_COLORS to `constants.ts`
3. Add `trunks` to snapshot/save in `Outlets.svelte`

### Phase 2: Geometry Module (`trunk-geometry.ts`)
1. `generateTrunkPolygon(nodes, segments, widthMm)` — miter algorithm adapted from Walls4
2. `hitTestTrunkNode(pos, nodes, radiusMm)` — point-in-circle for nodes
3. `hitTestTrunkSegment(pos, nodes, segments, widthMm)` — point-to-line-segment distance
4. `hitTestTrunkBody(pos, polygon)` — point-in-polygon
5. `snapToGrid(point, angleDeg)` — 15-degree angle constraint from reference point
6. `snapToNearby(point, targets, thresholdMm)` — snap to nodes/outlets/racks
7. `splitSegment(trunk, segmentId, point)` — insert node at point on segment
8. `computeTrunkLength(trunk)` — sum of segment lengths

### Phase 3: Drawing Interaction (OutletCanvas.svelte)
1. Add trunk drawing state: `drawingTrunk`, `drawingNodes`, `rubberBandTarget`
2. Click handler for trunk tool: place nodes, create segments
3. Shift-constrain logic
4. Snap-to-existing-node logic
5. Escape/dblclick to finish
6. Render rubber-band line + ghost node during drawing

### Phase 4: Trunk Rendering (TrunkRenderer.svelte)
1. SVG component receiving trunks[], calibration, zoom, selectedIds
2. Generate polygons via `generateTrunkPolygon`
3. Render `<path>` for each trunk body
4. Render node handles when selected
5. Render labels
6. Level-based styling (dashed vs solid)

### Phase 5: Select/Edit Interaction (OutletCanvas.svelte)
1. Hit testing: node → segment → body priority
2. Node drag with undo/redo
3. Segment drag (move both endpoints)
4. Ctrl+drag from node (branch)
5. Ctrl+click segment (split)
6. Delete selected nodes/trunks
7. Corner radius cycling (R key)

### Phase 6: Sidebar (TrunkPalette.svelte)
1. Drawing settings: type picker, level toggle, dimension inputs
2. Trunk list with select-to-zoom
3. Properties panel for selected trunk/node
4. Sidebar tab integration (outlets | racks | trunks)

### Phase 7: CRUD + State (Outlets.svelte)
1. `trunks` state array, initialized from data prop
2. `addTrunk`, `updateTrunk`, `removeTrunk`, `updateTrunkNode`
3. All with HistoryStore undo/redo
4. Include trunks in autosave snapshot
5. Keyboard shortcuts: T for trunk tool

### Phase 8: Polish
1. Snap indicators (visual guides when near snap targets)
2. Segment labels (dblclick to add/edit)
3. Z-elevation editing in properties panel
4. Connected outlet/rack highlighting
5. Export: include trunk data in Excel export (optional)

## Deferred (per trunk-features.md: "inv2026-04")

- **Secondary/automatic routing**: auto-route cables from outlets to nearest trunk to rack
- **Route length calculation** along trunk paths
- **Side elevation viewports** for vertical trunk editing
- **Trunk capacity fill** indicators

## Reference: Route Calculation Algorithm

`sample-routing/mine/CableRouter.svelte` (lines 654-774) has a working route calculator:

**`calculateOptimalRoute(from, to, level)`** — for each outlet:
1. Filter trunks matching the outlet's level (low/high)
2. Find nearest point on any trunk segment to the outlet (`findNearestPointOnLine` — perpendicular projection clamped to segment)
3. Find nearest point on any trunk segment to the destination rack
4. Walk trunk waypoints between entry and exit segment indices (forward or reverse)
5. Build waypoints array: `[outlet, trunkEntry, ...trunkNodes, trunkExit, rack]`
6. Sum segment distances for cable length

**`findNearestPointOnLine(point, lineStart, lineEnd)`** — projects point onto segment, clamps t to [0,1]
**`findNearestSegmentIndex(point, points[])`** — returns index of segment closest to point
**`calculateRouteLength(route)`** — sums distances between consecutive waypoints

This algorithm works for simple polyline trunks. For the graph-based trunk model, the route calculator will need Dijkstra/BFS to find shortest path through the node/segment graph between entry and exit points.

## Verification Checklist

- [ ] Draw trunk by clicking points on floorplan
- [ ] Shift constrains to 15-degree angles
- [ ] Snap to existing nodes within threshold
- [ ] Escape finishes drawing, right-click cancels
- [ ] Click existing node during drawing creates junction
- [ ] Select mode: click node/segment/body to select
- [ ] Drag node moves it, updates connected segments
- [ ] Drag segment moves both endpoints
- [ ] Ctrl+drag from node creates branch
- [ ] Ctrl+click segment splits it
- [ ] Delete removes selected nodes/trunks
- [ ] R cycles corner radius on selected node
- [ ] Undo/redo works for all operations
- [ ] Trunk renders with correct width and mitered corners
- [ ] Pipes vs rectangular trunks visually distinct
- [ ] High vs low level visually distinct (dashed vs solid)
- [ ] Labels display and are editable
- [ ] Properties panel shows/edits trunk details
- [ ] Sidebar lists all trunks, click to select
- [ ] Data persists to Firestore
- [ ] Zoom-invariant stroke widths and handles
