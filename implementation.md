# Patch Frame Port Allocation Tool - Implementation Plan

## Overview

Build the Patch Frame Port Allocation tool as a Svelte 5 application within the existing SvelteKit project. The tool generates visual representations of data patch frames showing LAN port outlet labels assigned to each port position.

The React sample in `/sample/` provides a working reference for core logic (label generation, rack layout). This plan extends that foundation with Firestore persistence, richer UI features, and the full spec from README.md.

---

## Architecture

### File Structure

```
src/routes/projects/[pid]/frames/
├── +page.svelte              # Route entry: loads frame data from Firestore, passes to Frames
├── Frames.svelte             # Main orchestrator: sidebar + frame drawing layout
└── parts/
    ├── types.ts              # All TypeScript interfaces and enums
    ├── engine.ts             # Pure functions: label generation, rack layout, validation
    ├── ConfigPanel.svelte    # Zone config form (floor, zone, locations, server rooms)
    ├── LocationList.svelte   # Scrollable list of locations with port/type editors
    ├── LocationRow.svelte    # Single location row: port count, type, room assignments
    ├── FrameDrawing.svelte   # Full patch frame visual (rack + panels + RU numbers)
    ├── PanelStrip.svelte     # Single 1RU patch panel (2 rows x 24 ports)
    ├── PortCell.svelte       # Individual port cell with label and color coding
    ├── FrameToolbar.svelte   # Toolbar: export, add frame, frame selector, view toggle
    └── SettingsDialog.svelte # Settings: custom location types, frame defaults
```

### Data Flow

```
Firestore (frames/{pid})
  → +page.svelte (subscribe & load)
    → Frames.svelte (state management)
      ├── Sidebar: ConfigPanel → LocationList → LocationRow
      └── Main: FrameToolbar → FrameDrawing → PanelStrip → PortCell
```

All state lives in `Frames.svelte` using `$state()`. Child components receive data via props and emit changes via callback props. Firestore saves are debounced on config changes.

---

## Types (`parts/types.ts`)

```ts
// Location types - extensible via settings
type LocType = 'desk' | 'AP' | 'PR' | 'RS' | 'FR' | 'WC' | 'TV' | 'LK' | string

interface LocationConfig {
  locationNumber: number
  portCount: number                       // 1-99
  serverRoomAssignment: ('A' | 'B')[]     // per-port room assignment
  locationType: LocType                   // quick-select type
  roomNumber?: string                     // optional 4-digit room number
  isHighLevel?: boolean                   // ceiling port (appends "-H" to labels)
}

interface ZoneConfig {
  id: string                              // Firestore doc id
  floor: number                           // 1-20
  zone: string                            // A-Z
  serverRoomCount: 1 | 2
  locations: LocationConfig[]
}

interface FrameConfig {
  id: string
  name: string                            // e.g. "Frame A1"
  serverRoom: 'A' | 'B'
  totalRU: number                         // default 45
  panelStartRU: number                    // first RU for patch panels
  panelEndRU: number                      // last RU for patch panels
  slots: FrameSlot[]                      // what occupies each RU
}

type SlotType = 'patch-panel' | 'blanking' | 'cable-mgmt-1u' | 'cable-mgmt-2u' | 'device'

interface FrameSlot {
  ru: number
  type: SlotType
  label?: string                          // device name or panel label
  height: 1 | 2                           // RU height
}

// Generated output
interface PortLabel {
  label: string                           // FF.Z.NNN-SPP or FF.Z.NNN-SPP-H
  serverRoom: 'A' | 'B'
  locationNumber: number
  portNumber: number
  locationType: LocType
  isHighLevel: boolean
}

interface PanelData {
  panelNumber: number
  ru: number                              // position in frame
  topRow: (PortLabel | null)[]            // 24 slots
  bottomRow: (PortLabel | null)[]         // 24 slots
  isHighLevel: boolean                    // high-level panels kept separate
}

interface RackData {
  frame: FrameConfig
  panels: PanelData[]
  slots: FrameSlot[]                      // non-panel slots (blanking, cable mgmt)
}

// Room number directory
interface RoomEntry {
  roomNumber: string
  roomName: string
}

// Firestore document shape (one doc per project)
interface FrameDocument {
  id: string                              // = pid
  zones: ZoneConfig[]
  frames: FrameConfig[]
  rooms: RoomEntry[]
  locationTypes: LocType[]                // custom types beyond defaults
  updatedAt: Timestamp
}
```

---

## Engine (`parts/engine.ts`)

Pure functions, no side effects. Adapted from `sample/lib/patchConfig.ts` with extensions:

### `generatePortLabels(zone: ZoneConfig): PortLabel[]`
- Iterate locations, generate `FF.Z.NNN-SPP` labels
- Append `-H` for high-level ports
- Include locationType in output for color coding

### `generateRacks(labels: PortLabel[], frames: FrameConfig[]): RackData[]`
- Group labels by serverRoom
- Separate high-level and floor-level labels
- Fill panels within each frame respecting `panelStartRU`/`panelEndRU`
- High-level panels placed after floor panels (not mixed)
- Include non-panel slots from frame config

### `validateConfig(zone: ZoneConfig): string[]`
- Return array of validation error messages
- Check: floor 1-20, zone A-Z, port counts 1-99, location numbers unique

### `getDefaultLocations(count: number, serverRoomCount: 1|2): LocationConfig[]`
- Generate N locations with default 2 ports each, all assigned to room A

---

## Components

### `+page.svelte` (Route Entry)
- Extract `pid` from `page.params`
- Subscribe to `frames/{pid}` Firestore document
- Show spinner while loading
- Pass data to `<Frames>`, save callback for persistence

### `Frames.svelte` (Main Orchestrator)
- **Layout**: Sidebar (left, ~350px) + Main content (right, flex-1)
- **State**: `$state()` for zoneConfig, frames, selectedFrame, selectedLocation, viewMode
- **Derived**: `$derived()` for generated labels and racks (recompute on config change)
- **Persistence**: `$effect()` to debounce-save to Firestore on state changes (500ms)
- **View toggle**: sidebar | stacked (vertical) for narrow screens
- Sidebar contains: ConfigPanel, LocationList
- Main area contains: FrameToolbar, FrameDrawing

### `ConfigPanel.svelte`
- Floor number input (1-20)
- Zone letter select (A-Z)
- Server room count toggle (1 or 2) - use grouped buttons
- Location count input with "Generate" button
- All inputs use existing `$lib` Input/Button components

### `LocationList.svelte`
- Scrollable container of LocationRow components
- Bulk actions at top: "Set all to 2 ports", "All to Room A", etc.
- Search/filter by location number

### `LocationRow.svelte`
- Location number display (LOC 001)
- Port count input (number, 1-99)
- Location type quick-select: grouped buttons for common types (desk, AP, PR, RS, FR, WC, TV, LK)
- Room number input (optional, 4-digit)
- High-level checkbox
- Server room assignment (when 2 rooms):
  - Per-port toggle buttons showing `P01:A`, `P02:B`, etc.
  - Quick actions: Split 50/50, All A, All B
- Click to select → highlights corresponding ports in frame drawing

### `FrameDrawing.svelte`
- Renders one or more frames (tabs or side-by-side)
- Frame structure: RU numbers (bottom=1) on left rail
- Each RU shows: patch panel, blanking panel, cable management, or device
- Panels render via `<PanelStrip>`
- Selected location's ports are highlighted
- Port colors by type: desk=blue, AP=green, PR=orange, etc.

### `PanelStrip.svelte`
- Single 1RU panel: 2 rows of 24 port cells
- Row labels: T (top), B (bottom)
- Column numbers 1-24 in header
- Renders `<PortCell>` for each slot

### `PortCell.svelte`
- Displays port label in monospace ~8px text
- Color coded by server room (A=blue, B=purple) and/or location type
- Hover tooltip with full label
- Empty cells shown as muted placeholder
- Click to select location in sidebar

### `FrameToolbar.svelte`
- Frame selector tabs (when multiple frames)
- "Add Frame" button
- Frame settings (total RU, panel range, add blanking/cable mgmt)
- Export to Excel button
- View toggle (sidebar ↔ stacked)

### `SettingsDialog.svelte`
- Manage custom location types (add/remove beyond defaults)
- Room number directory: assign room names to room numbers
- Default frame size (RU count)
- Uses existing `$lib` Dialog component

---

## Implementation Phases

### Phase 1: Core Foundation
1. Create `types.ts` with all interfaces
2. Create `engine.ts` with label generation and rack layout functions
3. Build `Frames.svelte` with basic sidebar + main area layout
4. Build `ConfigPanel.svelte` with zone configuration form
5. Build `LocationList.svelte` and `LocationRow.svelte` with port editing
6. Build `FrameDrawing.svelte`, `PanelStrip.svelte`, `PortCell.svelte` for visualization
7. Wire up reactive data flow: config changes → label generation → rack rendering

### Phase 2: Persistence & Polish
1. Update `+page.svelte` to load/save from Firestore `frames/{pid}`
2. Add debounced auto-save on config changes
3. Add location type quick-select buttons
4. Add server room assignment UI (per-port toggles, bulk actions)
5. Add high-level port support (separate panels, `-H` suffix)
6. Add room number input per location

### Phase 3: Frame Customization
1. Multiple frames per server room
2. Configurable RU range for panel placement
3. Blanking panels and cable management slots
4. RU numbering from bottom (RU 1 = bottom)
5. Frame selector tabs in toolbar

### Phase 4: Advanced Features
1. Excel export (using a library like `xlsx` or `exceljs`)
2. View toggle: sidebar ↔ stacked vertical layout
3. Port selection sync: click port in drawing → scroll to location in sidebar (and vice versa)
4. Settings dialog for custom location types and room directory
5. Pan/zoom on frame drawing for large configurations

---

## Key Design Decisions

- **Single Firestore document per project**: All zones, frames, and config stored in one `frames/{pid}` doc. This keeps real-time sync simple and avoids subcollection complexity. If data grows large (>1MB), zones can be split into subcollection docs later.
- **Pure engine functions**: All label/rack computation is side-effect-free, making it testable and predictable. Components just call these with current state.
- **Svelte 5 runes only**: `$state()`, `$derived()`, `$effect()`, `$props()`, `$bindable()`. No stores, no `$:` reactivity.
- **Existing UI components**: Use `$lib` Button, Input, Icon, Dialog, Row where possible. Only build domain-specific components in `parts/`.
- **Color coding**: Location types get distinct colors for visual scanning. Server room A/B get distinct colors (blue/purple as in sample).
