# Trunk Cable Routing Implementation Plan

## Overview
Implement trunk cable routing system for the outlets tool, allowing users to define cable pathways (pipes/trays) as connected line segments that can be rendered with proper mitered corners and support both manual and auto-generated routing.

---

## 1. Data Structures & Types

### 1.1 Update `types.ts`

Replace basic `TrunkConfig` with comprehensive trunk types:

```typescript
export type TrunkShape = 'pipe' | 'rectangular'
export type TrunkLocation = 'floor' | 'ceiling-plenum' | 'ceiling-tray' | 'wall'

export interface PipeSpec {
  type: 'PF22' | 'PF28' | 'E51' | 'custom'
  innerDiameter: number  // mm
  outerDiameter: number  // mm (inner + 8mm for PF types)
}

export interface RectangularSpec {
  type: 'MK-duct' | 'tray' | 'ladder' | 'matting' | 'steel-container' | 'custom'
  width: number   // mm
  height: number  // mm
  mkSize?: string // 'MD02', 'MD12L10', etc.
}

export interface TrunkNode {
  id: string
  x: number       // mm from origin
  y: number       // mm from origin
  z: number       // mm elevation
  miterRadius?: number  // mm, for rounded corners
}

export interface TrunkEdge {
  id: string
  nodeA: string   // TrunkNode.id
  nodeB: string   // TrunkNode.id
  trunkId: string // parent TrunkConfig.id
}

export interface TrunkConfig {
  id: string
  shape: TrunkShape
  location: TrunkLocation
  spec: PipeSpec | RectangularSpec
  nodes: TrunkNode[]
  edges: TrunkEdge[]
  color?: string        // for visual distinction
  label?: string        // user-assigned identifier
  isPrimary: boolean    // true = user-drawn, false = auto-generated secondary
}

export interface TrunkLabel {
  id: string
  edgeId: string        // TrunkEdge.id
  text: string
  offsetX: number       // px from nearest node
  offsetY: number       // px from nearest node
}
```

### 1.2 Update `OutletsData` interface
```typescript
export interface OutletsData {
  // ... existing fields
  trunks: TrunkConfig[]
  trunkLabels?: TrunkLabel[]
  activeTrunkId?: string  // currently selected for editing
}
```

### 1.3 Add Drawing State
```typescript
export type TrunkDrawMode = 'select' | 'draw-trunk' | 'edit-z'
export interface TrunkDrawState {
  mode: TrunkDrawMode
  drawMethod: 'click' | 'drag'       // user preference
  constrainAngle: boolean            // shift key held
  activeSpec: PipeSpec | RectangularSpec
  activeLocation: TrunkLocation
  defaultZ: number                   // current z-elevation for new nodes
  tempNodes: TrunkNode[]             // nodes being drawn (not committed)
  selectedNodeIds: string[]
  selectedEdgeIds: string[]
  hoveredNodeId: string | null
  hoveredEdgeId: string | null
  dragStartNode: TrunkNode | null
}
```

---

## 2. UI Components

### 2.1 Create `TrunkPalette.svelte`
Sidebar control panel for trunk settings.

**Features:**
- Mode selector: Select / Draw Trunk / Edit Elevation
- Shape selector: Pipe / Rectangular
- Location selector: Floor / Ceiling Plenum / Ceiling Tray / Wall
- Spec configurator:
  - **Pipes**: Dropdown with PF22, PF28, E51, Custom (manual diameter input)
  - **Rectangular**: Dropdown with MK duct sizes (MD02-MD51L10), Custom (manual W×H)
- Z-elevation input (current drawing height)
- Default miter radius slider
- Drawing method toggle: Click-Click / Drag
- Color picker for trunk visual distinction
- List of existing trunks (selectable, show/hide toggle)
- "Generate Secondary Trunks" button

**Layout:**
```
┌─────────────────────┐
│ Mode: [Draw ▾]      │
│ Shape: ◉Pipe ○Rect  │
│ Location: [Floor ▾] │
│ Type: [PF28 ▾]      │
│ Z-elev: [0] mm      │
│ Miter: [═══●═] 10mm │
│ Draw: ◉Click ○Drag  │
│ Color: [■]          │
├─────────────────────┤
│ Trunks:             │
│ ☑ T001 - Main Floor │
│ ☑ T002 - Ceiling    │
│ ☐ T003 - Auto (S)   │
├─────────────────────┤
│ [Generate Secondary]│
└─────────────────────┘
```

### 2.2 Update `OutletCanvas.svelte`
Add trunk rendering and interaction layers.

**Rendering Order:**
1. Grid / floorplan PDF
2. Trunks (below outlets)
3. Outlets & racks
4. Trunk labels
5. Selection highlights
6. Drawing preview (temp nodes/edges)

**Interaction Handlers:**
- `handleTrunkPointerDown(e)` - initiate draw/select/drag
- `handleTrunkPointerMove(e)` - preview, hover, drag updates
- `handleTrunkPointerUp(e)` - commit nodes/edges, end drag
- `handleTrunkKeyDown(e)` - delete, escape, shift constraint
- `handleTrunkDoubleClick(e)` - add label to edge

### 2.3 Create `TrunkRenderer.svelte`
Separated rendering component for cleaner code.

**Responsibilities:**
- Render trunks as polygons with mitered corners
- Pipe head-on view detection (show ellipses when viewing vertically)
- Draw node handles (control points)
- Draw miter radius adjustment handles
- Highlight selected/hovered elements
- Render labels with leader lines

---

## 3. Core Algorithms

### 3.1 Mitered Corner Generation
**Source:** Adapt `makePolygons()` from `Walls4.svelte`

**Input:** nodes[], edges[], miterRadius, lineWidth
**Output:** polygon points[] for SVG/canvas rendering

**Key Steps:**
1. Build adjacency list for each node (angle-sorted neighbors)
2. Traverse half-edges using right-hand rule
3. Calculate intersection points for mitered joints:
   - Use miterLimit to determine when to bevel sharp corners
   - Support rounded corners via miterRadius (SVG arc commands or bezier curves)
4. Generate closed polygon paths for fill/stroke

**Modifications Needed:**
- Add support for rounded miters (not just beveled)
- Handle variable trunk widths at junctions
- Support 3D coordinates (z-height affects visual width in perspective)

### 3.2 Angle Constraint (Shift-drag)
Constrain new segments to 15° increments.

```typescript
function constrainAngle(from: Point, to: Point): Point {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const angle = Math.atan2(dy, dx)
  const snapAngle = Math.round(angle / (Math.PI / 12)) * (Math.PI / 12) // 15° steps
  const dist = Math.hypot(dx, dy)
  return {
    x: from.x + Math.cos(snapAngle) * dist,
    y: from.y + Math.sin(snapAngle) * dist
  }
}
```

### 3.3 Node Snapping
When drawing/dragging, snap to:
- Existing nodes (within snapRadius, e.g., 15px)
- Outlet positions (for connectivity)
- Rack positions (for connectivity)

```typescript
function findSnapTarget(pt: Point, snapRadius: number): TrunkNode | OutletConfig | RackPlacement | null {
  // Check trunk nodes first
  for (const trunk of trunks) {
    for (const node of trunk.nodes) {
      if (distance(pt, node) <= snapRadius) return node
    }
  }
  // Check outlets
  for (const outlet of outlets) {
    if (distance(pt, outlet.position) <= snapRadius) return outlet
  }
  // Check racks
  for (const rack of rackPlacements) {
    if (distance(pt, rack.position) <= snapRadius) return rack
  }
  return null
}
```

### 3.4 Edge Splitting (Ctrl-drag/click)
Insert new node at point along edge.

```typescript
function splitEdge(edge: TrunkEdge, point: Point): TrunkNode {
  const nodeA = findNode(edge.nodeA)
  const nodeB = findNode(edge.nodeB)
  const projected = projectPointOnSegment(point, nodeA, nodeB)
  
  // Calculate z-height via linear interpolation
  const t = distance(nodeA, projected) / distance(nodeA, nodeB)
  const z = nodeA.z + (nodeB.z - nodeA.z) * t
  
  const newNode: TrunkNode = {
    id: generateId(),
    x: projected.x,
    y: projected.y,
    z: z,
    miterRadius: (nodeA.miterRadius + nodeB.miterRadius) / 2
  }
  
  // Remove old edge, create two new edges
  removeEdge(edge.id)
  createEdge(edge.nodeA, newNode.id, edge.trunkId)
  createEdge(newNode.id, edge.nodeB, edge.trunkId)
  
  return newNode
}
```

### 3.5 Secondary Trunk Auto-Generation
Calculate shortest routes from outlets to nearest primary trunk, then to assigned rack.

**Algorithm:**
1. Build graph: primary trunk nodes + outlets + racks
2. For each unrouted outlet:
   - Find nearest primary trunk node (Euclidean distance)
   - Find shortest path: outlet → trunk node → assigned rack
   - Use A* or Dijkstra's algorithm
3. Create secondary trunk edges along calculated paths
4. Merge parallel/overlapping secondary routes (optional optimization)

**Constraints:**
- Secondary trunks inherit spec from nearest primary trunk
- Avoid crossing walls (requires wall geometry integration)
- Prefer straight runs, minimize turns

---

## 4. Interaction Workflows

### 4.1 Draw Trunk (Click-Click Mode)
1. User clicks: create first node at mouse position (z = defaultZ)
2. User moves mouse: show preview line from last node to cursor
3. User clicks again: commit node, create edge
4. Repeat steps 2-3 for polyline
5. User double-clicks or presses ESC: finalize trunk

### 4.2 Draw Trunk (Drag Mode)
1. User clicks and holds: create first node
2. User drags: show preview line
3. User releases: commit node + edge
4. Next drag from endpoint continues trunk
5. Double-click or ESC to finalize

### 4.3 Extend Existing Trunk (Drag from Node)
1. User drags from existing node: create new edge
2. Commit on release
3. Works in both click and drag modes

### 4.4 Select & Move
1. Click node: select (show z-coord editor)
2. Click edge: select edge
3. Drag selected node: move node, update connected edges
4. Drag selected edge: translate entire edge (move both nodes)

### 4.5 Ctrl-Drag Shortcuts
- **Ctrl-drag from node:** Start new segment from that node
- **Ctrl-drag from edge:** Split edge, start new segment from split point
- **Ctrl-click edge:** Split edge, create node (no new segment)

### 4.6 Delete
- Select node → press Delete: remove node and reconnect edges (if 2 edges)
- Select edge → press Delete: remove edge only (keep nodes)

### 4.7 Edit Z-Coordinate
- Select node → show input field in palette
- Type new z-value → update node.z
- Visual feedback: change trunk rendering (elevation indicators)

### 4.8 Adjust Miter Radius
- Select node with 2+ edges → show draggable radius handle
- Drag handle: adjust node.miterRadius
- Updates corner rendering in real-time

### 4.9 Add Label
- Double-click edge → show label input dialog
- Enter text → create TrunkLabel linked to edge
- Label is draggable (relative to nearest node)

---

## 5. Rendering Specifications

### 5.1 Rectangular Trunks
- **Plan View:** Render as filled polygons with width = spec.width
- **Stroke:** 1-2px outline in darker shade
- **Fill:** Semi-transparent color (user-selected)

### 5.2 Pipe Trunks
- **Plan View (horizontal):** Render as rectangles with width = outerDiameter
- **Side View (vertical):** Show as rectangles in elevation viewports
- **Head-On View:** Render as ellipses (rare, only when z changes rapidly)

### 5.3 Node Rendering
- **Normal:** Small circle (4px radius), semi-transparent
- **Selected:** Larger circle (6px), bright color, stroke
- **Hovered:** Medium circle (5px), outline pulse

### 5.4 Miter Radius Handle
- **Position:** At node, perpendicular to bisector of adjacent edges
- **Visual:** Small diamond or circle at miterRadius distance
- **Interaction:** Draggable to adjust radius (0-100mm typical range)

### 5.5 Labels
- **Position:** Center of edge or user-dragged offset
- **Visual:** White rounded rect background, dark text, 10-12px font
- **Leader Line:** Thin line from label to edge midpoint (if dragged away)

### 5.6 Selection Highlights
- **Selected Nodes:** Bright blue circle + glow
- **Selected Edges:** Thick dashed stroke overlay
- **Hover:** Subtle highlight (lighter shade)

### 5.7 Drawing Preview
- **Temp Nodes:** Yellow/orange circles
- **Temp Edges:** Dashed lines in drawing color
- **Constraint Indicator:** Show angle value when shift held

---

## 6. Side Elevation Viewports (Phase 2)

**Purpose:** Edit vertical trunk routing (walls, risers)

### 6.1 Viewport Component: `TrunkElevationView.svelte`
- Show front/back/left/right elevations in floating windows
- Render trunks as 2D projections (x-z or y-z planes)
- Allow node dragging in elevation view (updates 3D coordinates)
- Sync with main plan view

### 6.2 Projection Logic
```typescript
type ElevationView = 'front' | 'back' | 'left' | 'right'

function projectNode(node: TrunkNode, view: ElevationView): Point {
  switch (view) {
    case 'front': return { x: node.x, y: -node.z } // X-Z plane
    case 'back':  return { x: -node.x, y: -node.z }
    case 'left':  return { x: node.y, y: -node.z } // Y-Z plane
    case 'right': return { x: -node.y, y: -node.z }
  }
}
```

### 6.3 UI Layout
```
┌──────────────────────────────────┐
│ Main Plan View (X-Y)             │
│                                  │
│  ╔════════════════╗              │
│  ║ Front (X-Z) ▾  ║              │
│  ║                ║              │
│  ║  Rack A _|‾|_  ║              │
│  ║         ˉˉˉˉˉ  ║              │
│  ║  Node @ 2400mm ║              │
│  ╚════════════════╝              │
└──────────────────────────────────┘
```

---

## 7. Firestore Integration

### 7.1 Save Operations
- Auto-save trunk changes on commit (debounced 500ms)
- Save to `outlets/{docId}` with `trunks` and `trunkLabels` arrays

### 7.2 History/Undo Support
- Integrate with existing `HistoryStore.svelte.ts`
- Push snapshots before: add/delete nodes, move nodes, split edges
- Undo/redo restores full trunk state

---

## 8. Implementation Phases

### Phase 1: Basic Drawing (Est. 8-12 hours)
- [ ] Update types.ts with new trunk interfaces
- [ ] Create TrunkPalette.svelte (basic controls)
- [ ] Add trunk state management to OutletCanvas.svelte
- [ ] Implement click-click drawing mode
- [ ] Simple line rendering (no miters yet)
- [ ] Node selection and deletion
- [ ] Firestore save integration

### Phase 2: Advanced Rendering (Est. 6-8 hours)
- [ ] Port mitered corner algorithm from Walls4.svelte
- [ ] Implement rounded miter support
- [ ] Add miter radius adjustment handles
- [ ] Render pipes vs rectangles correctly
- [ ] Add visual distinction for primary vs secondary trunks

### Phase 3: Interaction Polish (Est. 6-8 hours)
- [ ] Implement drag drawing mode
- [ ] Add shift-constrain angle snapping
- [ ] Implement ctrl-drag shortcuts (split edge, extend from node)
- [ ] Node snapping (to outlets, racks, other nodes)
- [ ] Drag-to-move nodes and edges
- [ ] Hover states and cursor feedback

### Phase 4: Labels & Z-Editing (Est. 4-6 hours)
- [ ] Double-click edge to add label
- [ ] Draggable labels with leader lines
- [ ] Z-coordinate editor in palette
- [ ] Elevation indicators in plan view (height markers)

### Phase 5: Secondary Trunk Auto-Generation (Est. 8-10 hours)
- [ ] Implement shortest path algorithm (A* or Dijkstra)
- [ ] Build routing graph from primary trunks + outlets + racks
- [ ] Generate secondary trunk routes
- [ ] Visual distinction (dashed lines, different color)
- [ ] Allow manual editing of auto-generated routes

### Phase 6: Elevation Views (Est. 8-12 hours)
- [ ] Create TrunkElevationView.svelte component
- [ ] Floating window management
- [ ] Projection logic for front/back/left/right views
- [ ] Sync dragging between plan and elevation
- [ ] Visual cues for vertical trunks

### Phase 7: Testing & Refinement (Est. 4-6 hours)
- [ ] Complex junction testing (3+ edges at node)
- [ ] Variable width junction rendering
- [ ] Performance optimization for large trunk networks
- [ ] User testing and UX polish

---

## 9. Reference Code & Resources

### From Existing Codebase:
- **Mitered corners:** `sample-routing/route-rendering/Walls4.svelte`
  - `makePolygons()` function (lines 90-180)
  - Vector math utilities (lines 95-110)
  - Adjacency graph traversal (lines 120-150)

- **CAD drawing patterns:** `F:\Dev\web\inv2025-cad\src\routes\cad\CadView.svelte`
  - Click vs drag mode toggling
  - Node snapping logic
  - Ctrl-key interaction patterns

- **Existing canvas interaction:** `outlets/parts/OutletCanvas.svelte`
  - Pan/zoom handling
  - PDF overlay coordinate transformation
  - Pointer event patterns

### External References:
- **Canvas miterLimit:** [MDN Canvas API](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/miterLimit)
- **SVG path arcs:** For rounded corners in SVG rendering
- **A* pathfinding:** For secondary trunk auto-routing

---

## 10. Testing Strategy

### Unit Tests:
- [ ] Angle constraint calculation (15° snapping)
- [ ] Point-to-segment distance
- [ ] Edge splitting at point
- [ ] Node snapping logic
- [ ] Miter polygon generation

### Integration Tests:
- [ ] Save/load trunk data from Firestore
- [ ] Undo/redo trunk operations
- [ ] Multi-trunk selection and bulk operations

### Manual Testing Scenarios:
1. **Simple L-shape:** Draw 2 nodes, verify corner rendering
2. **T-junction:** Draw 3 edges meeting at node, verify miter
3. **Complex network:** Draw 10+ nodes with cycles, verify all corners
4. **Outlet connection:** Snap trunk to outlet, verify link
5. **Secondary generation:** Place outlets and racks, generate routes
6. **Z-editing:** Create vertical trunk, view in elevation
7. **Performance:** Create 100+ nodes, verify smooth interaction

---

## 11. Known Challenges & Considerations

### Challenge 1: Variable Width Junctions
When trunks of different widths meet at a node, miter calculation becomes complex.
**Solution:** Use weighted interpolation or stepped transitions.

### Challenge 2: 3D to 2D Projection
Trunk z-coordinates affect visual appearance in plan view (perspective foreshortening).
**Solution:** For now, ignore perspective; use orthographic projection. Add parallax later if needed.

### Challenge 3: Overlapping Trunks
Multiple trunks at same location (e.g., stacked ceiling trays).
**Solution:** Render in z-order. Add z-offset visualization (dashed outline at vertical offset).

### Challenge 4: Secondary Trunk Routing Performance
A* pathfinding can be slow for large floorplans with many obstacles.
**Solution:** Use spatial indexing (quadtree), limit search radius, or run async with progress indicator.

### Challenge 5: Circular References
Ctrl-drag from node could create invalid loops.
**Solution:** Detect cycles during edge creation, warn user or auto-break loop.

---

## 12. Future Enhancements (Post-MVP)

- **Trunk fill calculation:** Show % fill based on cable count/diameter
- **Clash detection:** Warn when trunks intersect walls or other obstacles
- **BIM export:** Generate IFC or Revit-compatible geometry
- **Cost estimation:** Calculate material costs from trunk lengths/specs
- **Installation sequencing:** Suggest optimal installation order
- **Augmented labels:** Show trunk ID, spec, and fill % on hover
- **Multi-floor vertical routing:** Connect trunks across floor slabs
- **Curved trunks:** Bezier curve support for smooth bends

---

## 13. Success Criteria

✅ Users can draw primary trunks with click-click or drag methods  
✅ Trunks render with proper mitered corners  
✅ Nodes can be selected, moved, and deleted  
✅ Edges can be split via ctrl-drag/click  
✅ Z-coordinates can be edited, affecting vertical routing  
✅ Labels can be added to edges and repositioned  
✅ Secondary trunks auto-generate from outlets to racks  
✅ All trunk data persists to Firestore  
✅ Undo/redo works for all trunk operations  
✅ Performance is smooth for networks of 100+ nodes  

---

**Total Estimated Development Time:** 44-62 hours across 7 phases
