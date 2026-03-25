# Patching Tool — Implementation Plan

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

- Cables should route through vertical cable managers (if installed, else rack sides) and horizontal cable managers
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

### Phase 5 — Rack Elevation View (future)

10. `parts/RackPreview.svelte` — Read-only racks with interactive port indicators
11. `parts/CableOverlay.svelte` — H/V straight-line cable routing (like outlet trunks)
12. Drag-to-connect on rack elevation view

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
