# Patching Tool — Implementation Plan

## Known Issues / TODO

- **PDU and VCM rendering in elevation view is broken** — currently filtered out in `Patching.svelte` (`racks` excludes `type === 'vcm'`, `devices` excludes `type === 'pdu'`). They render correctly in the racks tool, so the fix is to port that handling into `ElevationRack.svelte` / `ElevationView.svelte`. Symptoms before filtering: PDUs (0U) drew full-width across the rack; VCMs (rack-type, no devices) drew as standalone 0U racks in the row.
- **Patch List view disabled** — unusable with >30 rows (~60s load). Default and only view is Elevation. Toggle button commented out in `Patching.svelte`; `PatchList` import + related handlers retained for easy re-enable once the per-row dropdown perf is fixed (see UX brainstorm below).

## Overview

The patching tool manages patch lists: connections between patch frame ports and network devices (switches, servers, etc.), including device-to-device patch cords. It supports copper and fiber patch cords of various types and estimates optimum cable lengths for bill-of-materials generation.

This tool integrates data from **racks** (device positions, port counts) and **frames** (port labels, panel assignments) to build a complete patching schedule.

### End-to-End Circuit Chains

A key concept is the **circuit chain** — the full path from an endpoint device (e.g., outlet, AP, desk port) through one or more patch frames and interconnects to the final destination device:

```
outlet1/device1 → frameA:portX → [interconnectA → interconnectB →] frameB:portY → device2
```

Chains can span multiple floors and rooms via cross-connects. Each segment in the chain is a separate `PatchConnection`, but the tool can trace and display the full end-to-end path.

---

## Sample App Analysis

### Sample 0 (`sample/sample0/`) — Rack Device Visualizer

A single-rack prototype for rendering rack frames and devices at 1:1 mm scale.

**Files:**
- `PatcherV0.svelte` — Sidebar with sliders (RU height, port count, mount position, rack width) + centered rack
- `parts-v0/RackFrame.svelte` — 42U 2-post frame with SVG rails, U labels, mounting holes (1mm/px scale)
- `parts-v0/RackDevice.svelte` — Patch panel with interactive ports (24-col grid, 18mm pitch, click to toggle)

**Reusable from Sample 0:**
- Accurate rack dimension constants (`RU_HEIGHT_MM = 44.45`, `RACK_WIDTH_MM = 482.6`)
- Mounting hole geometry and RU label rendering
- Port grid layout algorithm (24 ports/row, calculated pitch)

Must support 48 port per RU devices and patch panels. Pan/zoom required to read small details.

### Sample 1 (`sample/sample1/`) — Full Patching Planner

A complete drag-drop rack layout and cabling tool with BOM export.

**Files:**
| File | Purpose |
|------|---------|
| `Patcher.svelte` | Main orchestrator (843 lines): racks state, connections, drag-drop, pan/zoom, circuit tracing |
| `parts/types.ts` | Core types: `Port`, `Device`, `Rack`, `Connection`, `DragState`, `BomItem` |
| `parts/constants.ts` | Layout constants, device configs, cable types/colors, standard lengths |
| `parts/cableUtils.ts` | `getPortCoordinates()` and `calculateCableLength()` |
| `parts/RackView.svelte` | Rack frame with U markers, bottom-aligned |
| `parts/DeviceView.svelte` | Device with port grid, drag handles, edit/delete |
| `parts/PortView.svelte` | Interactive port dot (selected/highlighted/connected/idle states) |
| `parts/CableOverlay.svelte` | SVG cable paths (direct/managed/custom routes, waypoint editing) |
| `parts/Sidebar.svelte` | Device palette, add rack, global actions |
| `parts/BOMModal.svelte` | Bill of materials: cable + equipment schedules |
| `parts/PatchMatrixModal.svelte` | Port-to-port connectivity matrix with copy export |

**Key Functions to Reuse:**

1. **`getPortCoordinates(portId, racks)`** — Port ID to global canvas XY. Essential for cable rendering.
2. **`calculateCableLength(portAId, portBId, racks)`** — Manhattan distance + slack, snapped to standard lengths.
3. **`traceCircuit(portId)` (BFS)** — Breadth-first circuit chain highlighting.
4. **Cable path rendering** — Direct (quadratic sag), managed (S-curve), custom (waypoints).
5. **BOM aggregation** — Group connections by cable type + length.
6. **Patch matrix export** — Tabular source→destination→cable mapping.

### Cable Routing Notes

- Cables must route through vertical cable managers (if installed, else up/down the rack sides), and horizontal cable managers (if installed in the rack) if they need to cross from side to side even if the route is longer
- Some devices are front-mounted, some rear-mounted — patching between front/rear must account for rack depth in length calculations
- Cable line drawing: straight horizontal/vertical routes similar to trunk drawing in outlets tool (mark for later — initially use simple straight lines)

### BOM & Export Notes

- BOM generation will be a separate tool for all racks; patching tool shows summary for current view
- Need to separate cord requirements into existing vs. future (vendor-assigned cord IDs distinguish these)
- Excel export required for vendor handover; vendor fills in cord ID numbers; import cord IDs back into tool

### Cable Type Requirements

Built-in types: U/UTP, S/FTP, F/UTP, U/FTP, OS2, OM3, OM4, DAC
Support user-defined custom cable types: cross-cables, MPO, SF/UTP, etc.

### Auto-Assign Function

Allow user to select outlet ports to be auto-allocated to compatible switch ports.

---

## Architecture

### Data Model

The patching tool does **not** duplicate rack/device data. It reads from the existing `racks/{docId}` and `frames/{docId}` Firestore documents and stores only the **connections** (patch list).

#### Firestore Document: `patching/{projectId}_F{floor}_R{room}`

```typescript
interface PatchDoc {
  floor: number
  room: string
  connections: PatchConnection[]
  customCableTypes: CustomCableType[]  // user-defined cable types
  settings: PatchSettings
}

interface PatchConnection {
  id: string
  fromPortRef: PortRef
  toPortRef: PortRef
  cableType: string               // built-in or custom cable type ID
  cableColor: string              // hex color
  lengthMeters: number            // estimated or manual override
  lengthLocked: boolean           // true = user-specified, skip auto-calc
  kind: 'patch' | 'cross-connect' // patch = normal, cross-connect = interconnect
  cordId?: string                 // vendor-assigned patch cord ID (imported)
  status: PatchStatus              // add, remove, change, installed
  notes?: string
}

/** Identifies a port on a device in a rack */
interface PortRef {
  rackId: string
  deviceId: string
  portIndex: number               // 1-based
  face: 'front' | 'rear'         // which side of the device
  label?: string                  // cached display label (from frames engine)
}

interface CustomCableType {
  id: string
  label: string                   // e.g. "MPO-12", "SF/UTP Cat7"
  category: 'copper' | 'fiber' | 'other'
  color: string                   // default hex color
}

interface PatchSettings {
  defaultCableType: string
  defaultCableColor: string
  showLabels: boolean
  showLengths: boolean
  groupBy: 'rack' | 'device' | 'cableType'
}
```

#### Built-in Cable Types

| ID | Label | Category | Default Color |
|----|-------|----------|---------------|
| `uutp` | U/UTP | Copper | `#3b82f6` Blue |
| `sftp` | S/FTP | Copper | `#94a3b8` Slate |
| `futp` | F/UTP | Copper | `#6366f1` Indigo |
| `uftp` | U/FTP | Copper | `#8b5cf6` Violet |
| `os2` | OS2 SM | Fiber | `#facc15` Yellow |
| `om3` | OM3 MM | Fiber | `#22d3ee` Aqua |
| `om4` | OM4 MM | Fiber | `#e879f9` Magenta |
| `dac` | DAC | Direct Attach | `#0f172a` Black |

#### Standard Cable Lengths (meters)

`[0.3, 0.5, 1, 1.5, 2, 3, 5, 7, 10, 15, 20, 30]`

### Cross-Tool Data Flow

```
frames/{docId}     →  port labels (FF.Z.NNN-SPP format), panel assignments
racks/{docId}      →  rack layouts, device positions, port counts, physical dimensions
patching/{docId}   →  connections only (port A → port B + cable metadata)
```

### End-to-End Circuit Tracing

Connections form a graph. `traceCircuit(portId)` does BFS across all connections (even across floors/rooms) to find the full chain:
- Within same room: direct BFS through connections array
- Cross-room/cross-floor: follow cross-connect connections that reference ports in other rooms (future phase)

---

## File Structure

```
src/routes/projects/[pid]/patching/
├── +page.svelte              # Entry: Firestore subscriptions, floor/room state
├── Patching.svelte           # Main component: PaneGroup layout, auto-save
├── parts/
│   ├── types.ts              # PatchConnection, PortRef, CableType, PatchSettings
│   ├── constants.ts          # Cable types, colors, standard lengths
│   ├── cableUtils.ts         # calculateCableLength (adapted from sample1)
│   ├── PatchList.svelte      # Tabular patch list (main editing view)
│   ├── PatchRow.svelte       # Single connection row with inline editing
│   ├── PortPicker.svelte     # Dropdown: rack → device → port selection
│   ├── RackPreview.svelte    # Read-only rack elevation with port indicators (later)
│   ├── CableOverlay.svelte   # SVG cable lines on rack view (later, H/V routing)
│   ├── BomSummary.svelte     # Inline BOM summary for current view
│   ├── PatchToolbar.svelte   # Cable type selector, view toggles, export
│   ├── SettingsDialog.svelte # Defaults, custom cable types
│   └── exportExcel.ts        # Excel export for patch schedule + BOM
├── implementation.md         # This file
└── sample/                   # Reference implementations (sample0, sample1)
```

---

## Implementation Phases

### Phase 1 — Data Layer & Scaffolding ✓

1. ✓ `parts/types.ts` — All type definitions
2. ✓ `parts/constants.ts` — Built-in cable types, colors, standard lengths
3. ✓ `+page.svelte` — Firestore subscriptions (patching + racks + frames), floor/room state
4. ✓ `Patching.svelte` — PaneGroup shell with sidebar device tree + patch list area, auto-save

### Phase 2 — Patch List (Core Feature) ✓

5. ✓ `parts/PatchList.svelte` — Port selector dropdowns (grouped by rack/device), inline editing for all fields, sort/filter, bulk select/delete, auto-scroll to new rows
6. ✓ Toolbar with filter, bulk delete, add connection, export button
7. ✓ Sidebar: device tree (racks → devices with port counts) + summary tab (stats, cable type breakdown)

### Phase 3 — Cable Length Estimation ✓

8. ✓ `parts/cableUtils.ts` — Manhattan distance with U positions, inter-rack gaps, front/rear depth, slack, snap to standard lengths

### Phase 4 — BOM & Export ✓

9. ✓ `parts/exportExcel.ts` — Patch schedule sheet (landscape, all fields) + BOM sheet (aggregate by cable type + length + status). Merged U/Face columns, print titles (header row repeats), header/footer with title + page numbers.

### Phase 4b — Bulk Add (sidebar-driven) ✓

10. ✓ Sidebar device tree made interactive: click device → select as "from" (blue highlight), click another → select as "to" (green highlight)
11. ✓ Inline bulk-add panel at sidebar bottom: port range inputs (from-start, to-start), count, cable type selector, preview of port ranges, "Create N patches" button
12. ✓ Auto-defaults: first available port on each device, count = min available ports, cable type from settings

### Phase 5 — Rack Elevation View

See detailed design below in **Elevation View Design**.

10. `parts/ElevationView.svelte` — Multi-rack elevation canvas with pan/zoom, port grid rendering, cable overlay
11. `parts/ElevationRack.svelte` — Single rack column: U markers, devices, port grid
12. `parts/ElevationPort.svelte` — Individual port cell: color-coded by usage type (from frames data), connection state indicators
13. `parts/CableOverlay.svelte` — SVG cable lines between connected ports, color-coded by cable type
14. View toggle in toolbar: list view ↔ elevation view
15. Click port → select/create connection; click cable → select connection in list
16. Auto-assign with left/right port affinity to minimize cable crossing

### Phase 6a — Polish ✓

13. ✓ Settings dialog (`SettingsDialog.svelte`) — default cable type/color, accessible via gear icon in toolbar
14. ✓ Custom cable types UI — add/edit/delete custom types with label, category (copper/fiber/other), color picker
15. ✓ Notes column — inline text input in patch list table, persisted to Firestore, included in Excel export
16. ✓ Port number zero-padding — ports padded to 2+ digits when device has 10+ ports
17. ✓ Status types expanded: Add (new patch), Change (re-patch), Remove (remove existing), Installed (done). When status changes to "Change", current from/to ports are captured in notes automatically.
18. ✓ Column order: Cord ID before Status (status is the action column, placed near notes)
19. ✓ Rack label shown in port dropdowns when patching across multiple racks
20. ✓ Display settings (showLabels, showLengths, groupBy) removed from settings dialog — they had no effect. Will be wired up when rack elevation view is implemented.

### Phase 6b — Polish ✓

21. ✓ Orphaned reference detection — scans connections for rackId/deviceId refs that no longer exist in racks data. Warning banner with count, amber-highlighted rows with warning icon. Protects against silent breakage when devices are moved/deleted in Racks tool.
22. ✓ Cord ID import — "Import" button reads vendor-returned Excel (.xlsx), matches rows by row number (#) to connections, updates cordId fields. Status message shows import result with auto-dismiss.
23. ✓ Audit logging — already wired up via `logChange()` → `pendingChanges` → `onsave` → `writeLog()` in +page.svelte. All CRUD operations (add, update, delete, bulk, import) generate `ChangeDetail` entries logged to `logs/{pid}/patching`.
24. ✓ Bulk operations toolbar — when rows are selected: color picker, cable type changer, status changer, delete. All apply to selected rows.

### Phase 6c — Polish (future)

25. Auto-assign function (select outlet ports → auto-allocate to compatible switch ports)
26. Lock patched devices in Racks tool (prevent moving/deleting devices with active patch connections)

---

## Cross-Tool Data Integrity

**Problem:** Patching stores references to rackId + deviceId. If a user moves or deletes a device in the Racks tool, patching connections become orphaned/broken — the dropdown shows "— Select port —" instead of the correct device.

**Options:**
1. **Detect & warn (recommended first step)** — On load, scan connections for orphaned deviceId/rackId references. Show a warning banner listing broken connections. Highlight broken rows in the table with a warning icon.
2. **Lock patched devices** — In the Racks tool, prevent moving/deleting devices that have active patch connections. Show a warning: "This device has N patch connections. Remove patches first."
3. **Auto-update references** — When a device moves in the racks tool, fire an update to all patching docs that reference it. Complex because racks and patching are separate Firestore docs, and the move might change the rackId.
4. **Manual reconciliation** — Let users review and fix broken references. A "Fix broken" button that lets them re-assign orphaned ports.

Start with option 1 (detection + visual warnings) and 2 (lock in racks tool). Options 3-4 are more complex and can come later.

---

## Future UX Notes

- **Drag-to-connect** — In rack elevation view, allow click-drag from one port to another to create a connection (visual patching workflow)
- **Circuit tracing** — BFS `traceCircuit()` to highlight full end-to-end path through cross-connects, even across floors/rooms
- **Port label resolution** — Where patch panels exist in both racks and frames tools, resolve port labels (FF.Z.NNN-SPP) from frames data for display and export
- **Cord ID import** — Parse vendor Excel to match cord IDs back to connections; use cord ID presence to distinguish existing vs. future cords
- **Validation warnings** — Port type mismatches (RJ45↔LC), duplicate connections, unpatched port summary
- **Keyboard navigation** — Tab through ports, Enter to confirm, Escape to cancel
- **Bulk-add enhancements** — Skip already-used ports in bulk range; support face selection (front/rear) in bulk panel; allow reverse port mapping (e.g. ports 1-24 → ports 24-1)
- **Quick single-add from sidebar** — "+" button on device hover to add one connection pre-filled with that device's first available port as "from"

---

## Elevation View Design

### Scope & Purpose

The elevation view shows **front-face port grids** for all racks in the current room, side by side, with cable lines drawn between connected ports. This is a **visual patching view** — the user can see which ports are patched, to where, and what type of cable. It complements the table view (which is for bulk data entry/editing).

The frames tool handles **structured cabling behind the panels** (outlet → patch panel port assignments, zone/location labeling). The patching tool handles **patch cords on the front** (panel port → switch port). The elevation view needs to consume port assignment data from frames to color-code ports by usage type, but does NOT duplicate the frames tool's assignment/editing capabilities.

### Frames vs. Patching — Division of Responsibility

| Concern | Frames Tool | Patching Tool |
|---------|-------------|---------------|
| Port labeling (FF.Z.NNN-SPP) | Owns — assigns labels | Reads — displays labels |
| Port usage type (desk, AP, PR) | Owns — assigns via block select | Reads — colors ports by type |
| Port reservation blocks | Owns — drag-select + assign type | N/A |
| Structured cabling (outlet → panel) | Owns | N/A |
| Patch cords (panel → switch) | N/A | Owns |
| Port grid rendering | HTML grid (PortCell.svelte) | HTML grid (ElevationPort.svelte) |
| LOC_TYPE_COLORS | Exports from `frames/parts/types.ts` | Imports and reuses |

**Key principle:** The patching tool **imports** `LOC_TYPE_COLORS` and port label data from the frames tool. No duplication of assignment logic. The elevation view is read-only for frames data; write-only for patch connections.

### Multi-Rack Layout

All racks in the current floor/room rendered side by side horizontally:

```
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│   Rack A    │  │   Rack B    │  │   Rack C    │
│  ┌───────┐  │  │  ┌───────┐  │  │  ┌───────┐  │
│  │ U42   │  │  │  │ U42   │  │  │  │ U42   │  │
│  │  ...  │  │  │  │  ...  │  │  │  │  ...  │  │
│  │ Sw-1  │◄─┼──┼──┤ PP-1  │  │  │  │ PP-2  │  │
│  │ ░░░░░ │  │  │  │ ▓▓▓▓▓ │◄─┼──┼──┤ ▓▓▓▓▓ │  │
│  │  ...  │  │  │  │  ...  │  │  │  │  ...  │  │
│  │ U1    │  │  │  │ U1    │  │  │  │ U1    │  │
│  └───────┘  │  │  └───────┘  │  │  └───────┘  │
└─────────────┘  └─────────────┘  └─────────────┘
```

- Pan/zoom canvas (right/middle-click to pan, ctrl+wheel to zoom) following existing pan/zoom pattern from racks/frames/uploads tools
- Rack spacing: configurable gap (default ~40px)
- U labels on left rail of each rack

### Port Grid Rendering

Each device with ports renders a port grid inside its device block:

- **24-port devices:** Single row of 24 cells
- **48-port devices:** Two rows of 24 cells (top + bottom)
- Port cells: small rectangles (~16×14px) with:
  - **Background color** from `LOC_TYPE_COLORS` (frames data) — shows usage type (desk=blue, AP=green, PR=orange, etc.)
  - **Dot/ring indicator** for connection state:
    - Empty port: no indicator
    - Connected port: colored dot matching cable type color
    - Selected: ring highlight
  - **Port number** in tiny monospace font
  - **Tooltip** on hover: full port label, connection details, cable type

### Port Coloring Strategy

Ports are colored by **two independent dimensions**:

1. **Background = usage type** (from frames data): desk, AP, PR, WC, etc. using `LOC_TYPE_COLORS`. This tells the technician what KIND of outlet is connected to this panel port.
2. **Dot/badge = connection state** (from patching data): which cable type is patched, or whether the port is unpatched. This tells the technician what's actually plugged in.

This dual-coding means a technician can see at a glance: "This is a desk port (blue background) patched with U/UTP (blue dot) to Switch A port 3."

### Cable Overlay

SVG layer over the rack canvas, drawing lines between connected ports:

- **Line color** matches cable type color
- **Line style:** solid for installed, dashed for add/change/remove
- **Routing:** Initially straight lines between port centers. Future: H/V orthogonal routing through cable manager zones (vertical channels between racks, horizontal channels between U positions)
- **Hover:** Highlight cable + both endpoints; show tooltip with cable type, length, status
- **Click:** Select the connection in both elevation view and table view (scroll to row)

### Auto-Assign with Port Affinity

When auto-assigning patch panel ports to switch ports, minimize cable crossing by using **left/right affinity**. Port physical layout varies by device type:

**Patch panels** (ports numbered left-to-right per row):
- 24-port (1RU): ports 1-12 left, 13-24 right
- 48-port (2RU): top row 1-12 left / 13-24 right, bottom row 25-36 left / 37-48 right

**Switches** (varied layouts — need port layout config per device):
- 48-port stacked: ports 1-24 left half, 25-48 right half (or 1&2 stacked, 3&4 stacked, etc.)
- 24-port: ports 1-12 left, 13-24 right
- Small switches (8/12 port): all ports may be on one side (left or right)
- Stacked pairs: port 1 above port 2, 3 above 4, etc.

**Port layout definition** — devices in the Racks tool should eventually support a `portLayout` config that defines the physical arrangement. For now, assume the default: left half = first half of ports, right half = second half. This can be refined per device type later.

Auto-assign algorithm:
1. User selects source ports (on patch panel) — optionally filtered by usage type (e.g., "all desk ports")
2. User selects target device (switch)
3. Algorithm groups source ports by left/right physical position
4. Assigns left-source → lowest-available left-target, right-source → lowest-available right-target
5. If one side is full, spill to the other side
6. Cable type inherited from settings default

This can be triggered from:
- Sidebar: select source device → target device → "Auto-assign" option in bulk panel
- Elevation view (future): select ports on panel → "Auto-assign to..." context action

### Cross-Room / Cross-Floor Chain Visualization

Connections can span rooms (cross-connects) and floors. The elevation view shows only the current room's racks, but needs to indicate when a cable leaves the room:

- Ports patched to a different room/floor show a **"→ F2/B"** badge (target floor/room)
- Clicking such a port could navigate to the target room's patching view (future)
- Circuit tracing (BFS across all patching docs) highlights the full end-to-end path (future)
- Such cross-connects will be defined as structured cabling using the Frame tool

### Implementation Approach

**Integrated toggle view** — Toolbar toggle switches between table view and elevation view within the existing Patching.svelte layout. Both views share the same connections state. Sidebar remains unchanged. Can evolve to split-pane later if both views are needed simultaneously.

**Option A — Integrated elevation pane (recommended)**
- Add elevation view as a toggleable view within the existing Patching.svelte layout
- Toggle button in toolbar switches between table view and elevation view
- Both views share the same connections state — edits in one reflect in the other
- Sidebar remains the same (device tree + summary)
- Pros: Single source of truth, no sync issues, compact
- Cons: Only one view visible at a time

**Option B — Split pane (elevation + table)**
- PaneGroup with elevation on top, table on bottom (or side by side)
- Both visible simultaneously
- Clicking a port in elevation scrolls to the connection in the table
- Clicking a row in the table highlights the cable in the elevation
- Pros: See both views, cross-reference easily
- Cons: Screen real estate, complex layout

**Option C — Elevation as a separate tool page**
- `/projects/[pid]/patching/elevation/` — separate route
- Reads same Firestore doc
- Pros: Clean separation, full screen for elevation
- Cons: Two pages to maintain, potential sync issues with concurrent edits

**Recommendation:** Start with **Option A** (toggle) for simplicity, move to **Option B** (split) if users need both views simultaneously. Option C is unnecessary given Firestore's real-time sync.

### Component Structure

```
parts/
├── ElevationView.svelte      # Canvas container: pan/zoom, rack layout, cable overlay
├── ElevationRack.svelte      # Single rack: U markers, device blocks, port grids
├── ElevationPort.svelte      # Port cell: color-coded, connection indicator, click handler
├── CableOverlay.svelte       # SVG cable lines between connected ports
└── elevationUtils.ts         # Port coordinate calculation, auto-assign algorithm
```

### Data Flow

```
frames/{docId}  → port labels + usage types (LOC_TYPE_COLORS)
                   ↓
racks/{docId}   → rack layout, device positions, port counts
                   ↓
              ElevationView
                   ↓
patching/{docId} → connections (which ports are patched)
                   ↓
              CableOverlay (SVG lines)
```

### Shared Code Strategy

To avoid duplicating code between frames and patching tools:

1. **Move `LOC_TYPE_COLORS` and `LOC_TYPE_LABELS` to `$lib`** — both tools import from shared location
2. **Port grid rendering** — frames uses `PortCell.svelte` (with assignment editing); patching uses `ElevationPort.svelte` (read-only for usage, click-to-patch). Different components, shared color constants.
3. **Pan/zoom** — already a common pattern across racks/frames/uploads tools. No shared component needed, just follow the same `view = { x, y, scale }` pattern.


# Issues with current implementation

The list of combobox dropdowns we have now will not work, and causes performance issues even with just 30 or 40 rows.
Editing any source code, even this markdown, causes the patching page to refresh and reset to the first room of the first floor, and switches from elevation view back to patch list view.

In PatchList.svelte, two giant <select> per row, each rebuilding hundreds of <option> and <optgroup> nodes, plus the isPortUsed O(n) scan inside each {#each}. The DOM cost compounds fast. Worth fixing the tech, but I agree the bigger win is rethinking the interaction.

Here are the directions I'd weigh, roughly from most-disruptive to least:

1. Visual patching (my favourite). Patch cords are inherently spatial — humans wire them by looking at two faceplates. Add a "Patch" mode where the workspace splits into two pickable panes (rack elevation, frame layout, or floor outlet on either side). Click a port → it lights up as "from", click another → cord drawn between them, row appended to the list. The list stays as the system of record / bulk editor, but creation and re-routing happen visually. Bonus: you already have rack/frame/floorplan canvases — reuse them. Bonus 2: cable colour and length can be inferred from geometry.

2. Sidebar "port tray" + drag-to-cell. Persistent tree (Location → Rack/Frame → Device → Port) on one side, virtualised list on the other. Drag a port onto the From or To cell of a row. Multi-select N consecutive ports on each side and drop → N rows generated. Fast for the "wire all 24 of these to all 24 of those" case which is most of real patching.

3. Command-palette cell editor. Replace the native <select> with a popover that opens on cell click — single search input with fuzzy match over rack/device/port labels (r1 sw01 24, 1.A.001-101), virtualised results, recent/adjacent ports pinned. Type-ahead beats dropdown-scrolling once you have >50 ports. This is the smallest UX shift and fixes the perf issue almost for free (one popover at a time, not 80 dropdowns mounted at once).

4. Range-based batch row. A separate "Add patches" form: From = "SW-01 ports 1–24", To = "PP-01 ports 1–24", optional reverse/stride, → creates N rows. Avoids the per-row editing problem entirely for the common bulk case; the list becomes a review/exception-edit surface.

5. Parse the canonical label. Single text cell per side, parse FF.Z.NNN-SPP directly with suggestions. Brutally fast for power users; useless for everyone else. Probably best as a complement to one of the above, not the primary interaction.

6. Have two tree views side by side, that let the user drill down from building/floor/room/rack in each tree, then use multi-select to drag ports to connect them to the other tree.
   I like it more than my #2 because the symmetry matches reality — there's no real "from" and "to," just two endpoints. It also unifies racks/frames/outlets/devices under one navigation metaphor

   A few things I'd push on before you commit:

    * Leaf level is the friction point. Drilling Building → Floor → Room → Rack → Device is fine — those are short lists. But then you hit a 48-port switch, and a flat list of 48 port nodes is both ugly and slow to scan. I'd render the device leaf as a compact port strip (one square per port, port number inside, colour = used/free/selected, hover = label). That way the tree handles location navigation and the strip handles port picking — the thing each is good at. Bonus: a port strip is just the rack-face you already render in the racks tool, scaled down.

    * The "navigate back up after every drop" problem. If a user wires 24 cords from SW-01 to PP-01, they don't want to re-drill on both sides 24 times. Two things help: (a) make the device node sticky — after dropping, both trees stay expanded on the last device, just clear the port selection; (b) range-select on the port strip (shift-click port 1, shift-click port 24) so 24 cords happen in one drag.

    * Used-port visibility. Mark ports already in a connection with a coloured dot/border on the port strip, and on hover show "→ PP-01:14". The current isPortUsed scan can be replaced with a Map<portKey, connectionId> derived once, used everywhere.

    * Where does the list live? The patch list still has to exist (cable type, length, status, cord ID, bulk edits, export). I'd put it as a bottom pane under the two trees — selecting a cord in the list highlights both endpoints in the trees, and vice versa. Three-pane layout: tree | tree | list-below.

    * Re-routing. Clicking a connection in the list (or its cord line if you draw one) should select both endpoints in the trees, then dragging either endpoint to a new port re-routes it. Don't make users delete + re-add.


If I had to ship one: #1 as the primary creation flow + #3 for inline cell edits on the list. The list stops being a data-entry form and becomes a review/edit/bulk-action grid, which is what it should be for 100s of cords.