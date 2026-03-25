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
  status: 'planned' | 'installed' // planned = future, installed = existing
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

### Phase 1 — Data Layer & Scaffolding ← START HERE

1. `parts/types.ts` — All type definitions
2. `parts/constants.ts` — Built-in cable types, colors, standard lengths
3. `+page.svelte` — Firestore subscriptions (patching + racks + frames), floor/room state
4. `Patching.svelte` — PaneGroup shell with sidebar device tree + patch list area, auto-save

### Phase 2 — Patch List (Core Feature)

5. `parts/PortPicker.svelte` — Rack → Device → Port cascading dropdown
6. `parts/PatchRow.svelte` — Inline-editable connection row
7. `parts/PatchList.svelte` — Scrollable table with add/delete/sort/filter
8. `parts/PatchToolbar.svelte` — Cable type default, export buttons

### Phase 3 — Cable Length Estimation

9. `parts/cableUtils.ts` — Length calculation using real rack positions, front/rear depth

### Phase 4 — Rack Elevation View (later)

10. `parts/RackPreview.svelte` — Read-only racks with interactive port indicators
11. `parts/CableOverlay.svelte` — H/V straight-line cable routing (like outlet trunks)
12. Drag-to-connect on rack elevation view

### Phase 5 — BOM & Export

13. `parts/BomSummary.svelte` — Aggregated summary, planned vs. installed
14. `parts/exportExcel.ts` — Patch schedule + BOM sheets, cord ID column

### Phase 6 — Polish

15. Custom cable types UI, cord ID import, auto-assign, settings dialog, audit logging
