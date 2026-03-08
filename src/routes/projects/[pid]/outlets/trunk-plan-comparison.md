# Trunk Implementation Plan Comparison

## Executive Summary

**Recommendation:** Combine the best of both approaches:
- Use `routing-implement.md`'s **coordinate system**, **phasing strategy**, and **integration approach**
- Use `trunk-plan.md`'s **detailed specifications**, **node-edge graph**, **rendering algorithms**, and **interaction patterns**

---

## Side-by-Side Analysis

### 1. Coordinate System & Calibration

| Aspect | routing-implement.md | trunk-plan.md | Winner |
|--------|---------------------|---------------|---------|
| **Coordinate system** | **Explicit real-world mm from origin** with clear rationale (CAD interop, drawing-independent, multi-drawing overlay, natural cable lengths) | Mentions mm but less explicit about conversion | **routing-implement** ✓ |
| **Conversion functions** | **Explicit `toMm()` and `toPx()`** with clear formulas | Not detailed | **routing-implement** ✓ |
| **Calibration requirement** | **Only allows placement on calibrated pages** (origin + scale set) | Not addressed | **routing-implement** ✓ |
| **PDF rendering approach** | **Canvas in PDF-pixel space, SVG overlay converts mm→px** - matches existing PdfViewer pattern | Less explicit | **routing-implement** ✓ |

**Key Insight from routing-implement.md:**
```typescript
// Two-line conversions make this crystal clear
const toMm = (px: Point): Point => ({
  x: (px.x - origin.x) * scaleFactor,
  y: (px.y - origin.y) * scaleFactor,
})

const toPx = (mm: Point): Point => ({
  x: mm.x / scaleFactor + origin.x,
  y: mm.y / scaleFactor + origin.y,
})
```

This solves problems trunk-plan.md didn't address: different PDF scales, reissued drawings, multi-drawing overlays.

---

### 2. Data Model & Specifications

| Aspect | routing-implement.md | trunk-plan.md | Winner |
|--------|---------------------|---------------|---------|
| **Trunk specifications** | Simple: `points[]`, `level`, `cableType`, `label` | **Detailed: PF22/PF28/E51 pipes with diameters, MK duct sizes (MD02-MD51L10) with actual dimensions** | **trunk-plan** ✓ |
| **Data structure** | Simple `points[]` array | **Node-edge graph with `TrunkNode[]` and `TrunkEdge[]`** | **trunk-plan** ✓ |
| **Shape types** | Not specified | **`pipe` vs `rectangular` with separate specs** | **trunk-plan** ✓ |
| **Location types** | Not specified | **`floor` / `ceiling-plenum` / `ceiling-tray` / `wall`** | **trunk-plan** ✓ |
| **3D coordinates** | Not mentioned | **Full z-coordinate support** | **trunk-plan** ✓ |

**Why node-edge graph is better than points[]:**
- **Branching:** T-junctions and complex networks (essential per trunk-features.md requirement: "2 or more edges can connect to a node")
- **Splitting:** Can split edges to insert nodes (ctrl-drag requirement)
- **Variable specs:** Different trunk sizes can connect at nodes
- **Miter calculation:** Each node knows its connected edges for corner rendering

**Verdict:** trunk-plan.md's detailed specifications match the requirements much better.

---

### 3. Rendering

| Aspect | routing-implement.md | trunk-plan.md | Winner |
|--------|---------------------|---------------|---------|
| **Mitered corners** | Not addressed | **Detailed algorithm ported from Walls4.svelte with rounded miter support** | **trunk-plan** ✓ |
| **Symbol scaling** | **Fixed mm size so outlets scale with drawing** (smart!) | Not addressed for symbols | **routing-implement** ✓ |
| **Pipe vs rectangular** | Not detailed | **Different rendering: rectangles for pipes in plan, ellipses for head-on** | **trunk-plan** ✓ |
| **Selection highlights** | General mention | **Detailed specs: colors, sizes, hover states** | **trunk-plan** ✓ |
| **Miter radius handles** | Not mentioned | **Draggable handles to adjust corner radius** | **trunk-plan** ✓ |

**Key algorithm from trunk-plan.md:**
- `makePolygons()` function from Walls4.svelte (adjacency graph, angle-sorted neighbors, half-edge traversal)
- Handles variable width junctions, sharp corner beveling, rounded corners

---

### 4. Interaction Patterns

| Aspect | routing-implement.md | trunk-plan.md | Winner |
|--------|---------------------|---------------|---------|
| **Drawing modes** | Polyline tool: "click to add waypoints" | **Both click-click AND drag modes with user preference toggle** | **trunk-plan** ✓ |
| **Edge splitting** | Not detailed | **Ctrl-drag edge to split and start new segment, ctrl-click to split and create node** | **trunk-plan** ✓ |
| **Extending from nodes** | Not detailed | **Drag from existing node to create new segment** | **trunk-plan** ✓ |
| **Angle constraints** | Not mentioned | **Shift-drag for 15° angle snapping** | **trunk-plan** ✓ |
| **Node snapping** | Not detailed | **Snap to outlets, racks, other nodes within snapRadius** | **trunk-plan** ✓ |
| **Z-editing** | Not mentioned | **Select node to edit z-coordinate, elevation viewports** | **trunk-plan** ✓ |
| **Labels** | Not detailed | **Double-click edge to add draggable label with leader lines** | **trunk-plan** ✓ |

**Verdict:** trunk-plan.md has significantly more detailed and user-friendly interaction patterns.

---

### 5. Implementation Strategy

| Aspect | routing-implement.md | trunk-plan.md | Winner |
|--------|---------------------|---------------|---------|
| **Phasing** | **Phase 1: Outlets only, Phase 2: Trunks later** (pragmatic!) | All-at-once feature-complete approach | **routing-implement** ✓ |
| **Integration points** | **Explicit list of components to reuse (PdfState, PaneGroup, LOC_TYPE_COLORS, etc.)** | References but less specific | **routing-implement** ✓ |
| **Implementation order** | **Clear 11-step sequence** | 7 phases but more granular | **routing-implement** ✓ |
| **Effort estimation** | Not provided | **44-62 hours with detailed phase breakdowns** | **trunk-plan** ✓ |
| **Testing strategy** | Not detailed | **Comprehensive: unit tests, integration tests, manual scenarios** | **trunk-plan** ✓ |

**Key insight from routing-implement.md:**
Phasing outlets first (simpler, high-value) then trunks second (complex, lower initial priority) is more realistic and delivers value faster.

---

### 6. Auto-Routing & Secondary Trunks

| Aspect | routing-implement.md | trunk-plan.md | Winner |
|--------|---------------------|---------------|---------|
| **Algorithm** | "Find nearest trunk entry point → follow trunk → nearest exit → rack" | **A* or Dijkstra's shortest path with graph-based routing** | **trunk-plan** ✓ |
| **Route storage** | **Separate `RouteConfig` entity with waypoints and length** | Secondary trunks are just different trunk type | **routing-implement** ✓ |
| **Visual distinction** | Dashed lines, color-coded | Separate trunk with `isPrimary: false` flag | **routing-implement** ✓ |

**Verdict:** routing-implement.md's approach of separating routes from trunks is cleaner. Trunk-plan's algorithm detail is better.

---

### 7. UI Components

| Aspect | routing-implement.md | trunk-plan.md | Winner |
|--------|---------------------|---------------|---------|
| **Component structure** | OutletPalette (file picker, tools, outlet list), OutletCanvas (pan/zoom + PDF + SVG) | TrunkPalette (mode, shape, spec, z-elev, etc.), TrunkRenderer (separated rendering) | **Tie** - Similar quality |
| **Palette layout** | Simple tool buttons + outlet list | **Detailed mockup with all controls shown** | **trunk-plan** ✓ |
| **Elevation views** | Not mentioned | **Floating viewports for front/back/left/right side elevations** | **trunk-plan** ✓ |

---

### 8. Frame Integration & Linking

| Aspect | routing-implement.md | trunk-plan.md | Winner |
|--------|---------------------|---------------|---------|
| **Port linking** | **Detailed: outlets link to frame ports by label format (FF.Z.NNN-SPP), auto-numbering by zone** | Not addressed | **routing-implement** ✓ |
| **Read-only frame data** | **Subscribes to frames/{pid}_F{floor}, shows linked status (green/amber/gray dots)** | Not detailed | **routing-implement** ✓ |
| **Auto-numbering** | **Zone-based sequential labeling with UI** | Not addressed | **routing-implement** ✓ |

**Verdict:** routing-implement.md has essential outlet→frame integration that trunk-plan.md missed.

---

## Combined Recommendations

### Use from routing-implement.md:
1. ✅ **Real-world mm coordinate system** with explicit conversion functions
2. ✅ **Calibration requirement** (only place on calibrated pages)
3. ✅ **Phased approach** (outlets first in Phase 1, trunks in Phase 2)
4. ✅ **Integration strategy** (reuse PdfState, PaneGroup, LOC_TYPE_COLORS, etc.)
5. ✅ **Frame linking approach** (port labels, auto-numbering, linked status indicators)
6. ✅ **Route as separate entity** (RouteConfig with waypoints and length)
7. ✅ **Symbol scaling approach** (fixed mm size for drawing-scale independence)
8. ✅ **11-step implementation order**

### Use from trunk-plan.md:
1. ✅ **Detailed trunk specifications** (PF22/PF28/E51, MK duct MD02-MD51L10 with dimensions)
2. ✅ **Node-edge graph structure** (TrunkNode[], TrunkEdge[] instead of simple points[])
3. ✅ **Mitered corner algorithm** (makePolygons from Walls4.svelte with rounded joint support)
4. ✅ **Drawing interaction patterns** (click-click/drag modes, ctrl-drag shortcuts, shift-angle-constraint)
5. ✅ **Z-coordinate support** with elevation viewport option
6. ✅ **Miter radius adjustment handles**
7. ✅ **Edge labels** with draggable positioning and leader lines
8. ✅ **A*/Dijkstra for auto-routing** algorithm detail
9. ✅ **Testing strategy** (unit/integration/manual test specifications)
10. ✅ **Effort estimation** (44-62 hours phased breakdown)

---

## Reconciled Implementation Plan

### Phase 1: Outlet Placement (from routing-implement.md)
Priority: High | Effort: ~12-16 hours

1. Create types.ts with Point, OutletConfig, PageCalibration
2. Implement coordinate conversion (toMm, toPx with calibration data)
3. Build OutletCanvas with PDF rendering + SVG overlay
4. Implement outlet placement (click to place at mm coordinates)
5. Add outlet selection, dragging (in mm space), properties editing
6. Create OutletPalette with file/page picker (calibration-filtered)
7. Implement outlet list with linked status indicators
8. Add frame linking (read frames/{pid}_F{floor}, show FF.Z.NNN-SPP labels)
9. Implement auto-numbering (zone-based sequential labels)

### Phase 2: Basic Trunk Drawing (simplified from trunk-plan.md)
Priority: Medium | Effort: ~8-12 hours

1. Add TrunkNode, TrunkEdge, TrunkConfig (node-edge graph structure)
2. Add PipeSpec and RectangularSpec with detailed type/size options
3. Implement click-click drawing mode (create nodes/edges in mm space)
4. Simple line rendering (no miters yet, just straight segments)
5. Node selection and basic dragging
6. Add TrunkPalette (mode, shape, spec configurator, z-elevation input)

### Phase 3: Advanced Trunk Rendering (from trunk-plan.md)
Priority: Medium | Effort: ~6-8 hours

1. Port makePolygons() algorithm from Walls4.svelte
2. Implement mitered corner rendering (adjacency graph, half-edge traversal)
3. Add rounded miter support (miterRadius per node)
4. Render pipes vs rectangles correctly (width from spec)
5. Add miter radius adjustment handles (draggable)

### Phase 4: Interaction & Features (from trunk-plan.md)
Priority: Medium | Effort: ~6-8 hours

1. Add drag drawing mode (alternative to click-click)
2. Implement shift-constrain (15° angle snapping)
3. Add ctrl-drag shortcuts (split edge, extend from node)
4. Implement node snapping (to outlets, racks, other nodes)
5. Add edge labels (double-click to add, draggable with leader lines)
6. Z-coordinate editing UI in palette

### Phase 5: Auto-Routing (combined)
Priority: Low | Effort: ~8-10 hours

1. Create RouteConfig entity (separate from TrunkConfig)
2. Implement A*/Dijkstra pathfinding
3. Build routing graph (outlets → trunk nodes → racks)
4. Generate routes for unlinked outlets
5. Render routes as dashed lines (distinct from primary trunks)
6. Calculate and display cable lengths (already in mm)

### Phase 6: Polish & Testing (from trunk-plan.md)
Priority: Low | Effort: ~4-6 hours

1. Add elevation viewports (optional, for vertical trunk editing)
2. Unit tests (angle constraint, edge splitting, node snapping, miter generation)
3. Integration tests (save/load, undo/redo)
4. Manual testing scenarios (T-junctions, complex networks, variable widths)

**Total: ~44-60 hours** (phased incrementally, matches trunk-plan.md estimate)

---

## Critical Differences Resolved

### 1. Coordinate System
**Decision:** Use routing-implement.md's explicit mm approach with conversion functions.
**Rationale:** CAD interop, drawing-independence, multi-drawing overlay, and natural cable calculations are compelling.

### 2. Data Structure
**Decision:** Use trunk-plan.md's node-edge graph, NOT routing-implement.md's simple points[].
**Rationale:** Requirements explicitly state "2 or more edges can connect to a node" — this requires a graph structure, not a polyline.

### 3. Phasing
**Decision:** Follow routing-implement.md's Phase 1 (outlets) → Phase 2 (trunks) sequencing.
**Rationale:** Delivers value faster, reduces initial complexity.

### 4. Specifications
**Decision:** Use trunk-plan.md's detailed PipeSpec / RectangularSpec with real product types.
**Rationale:** Matches trunk-features.md requirements (PF22, PF28, E51, MK duct sizes).

### 5. Rendering
**Decision:** Use trunk-plan.md's mitered corner algorithm.
**Rationale:** Requirements explicitly ask for "mitered corners, with specifiable radius."

### 6. Auto-Routing
**Decision:** Use routing-implement.md's RouteConfig entity, trunk-plan.md's A* algorithm.
**Rationale:** Separating routes from trunks is cleaner; detailed pathfinding is necessary.

---

## What routing-implement.md Gets Right

1. **Real-world coordinate system** — This is fundamental and well-explained
2. **Calibration dependency** — Smart guard rail
3. **Phased delivery** — More realistic than trunk-plan's all-at-once
4. **Integration awareness** — Explicitly lists reusable components
5. **Frame linking detail** — Essential for port labeling workflow
6. **Symbol scaling approach** — Fixed mm sizing is correct
7. **Route separation** — RouteConfig separate from TrunkConfig is cleaner

## What trunk-plan.md Gets Right

1. **Product specifications** — PF28, MD32L10, etc. match requirements
2. **Node-edge graph** — Essential for branching and splitting
3. **Mitered corners** — Detailed algorithm with rounded support
4. **Interaction richness** — Ctrl-drag shortcuts, shift-constrain, miter handles
5. **Z-coordinate support** — Needed for vertical routing
6. **Testing strategy** — Comprehensive and realistic
7. **Effort estimation** — Honest 44-62 hour breakdown

---

## Conclusion

**Neither plan is complete on its own.** The best implementation combines:
- routing-implement.md's **coordinate system, phasing, and integration strategy**
- trunk-plan.md's **specifications, graph structure, rendering, and interactions**

The reconciled plan above merges both into a realistic 6-phase implementation (~44-60 hours) that delivers incrementally and covers all requirements from trunk-features.md.
