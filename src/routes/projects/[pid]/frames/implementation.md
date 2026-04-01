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
- Server room count toggle (1 to 4) - use grouped buttons
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
- Renders one or more frames (one per tab as they can be quite wide with port labels)
- Frame structure: RU numbers (bottom=1) on left rail
- Each RU shows: patch panel, blanking panel, cable management, or device
- Panels render via `<PanelStrip>`
- Selected location's ports are highlighted
- Port colors by type: desk=blue, AP=green, PR=orange, etc.

### `PanelStrip.svelte`
- Single 1RU panel: 2 rows of 24 port cells per row for high-density panels, or 1 row of 24 ports for standard panels
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

---

## Phase 2: Firestore Schema

### Document Path

```
frames/{pid}
```

One document per project. The document ID equals the project ID (`pid`). This keeps the real-time subscription simple: `db.subscribeOne('frames', pid, callback)`.

### Document Structure

```ts
// Firestore document: frames/{pid}
{
  id: string,              // = pid (project ID)

  // ── Zone configuration ──
  zone: {
    floor: number,         // 1–20
    zone: string,          // "A"–"Z"
    serverRoomCount: 1 | 2,
    locations: [
      {
        locationNumber: number,     // 1–999
        portCount: number,          // 1–99
        serverRoomAssignment: string[],  // ["A","A","B","B"] per port
        locationType: string,       // "desk", "AP", etc.
        roomNumber?: string,        // optional "1234"
        isHighLevel?: boolean       // ceiling ports
      }
      // ... one entry per location
    ]
  },

  // ── Frame definitions ──
  frames: [
    {
      id: string,           // "frame-A1"
      name: string,         // "Frame A1"
      serverRoom: string,   // "A" or "B"
      totalRU: number,      // 45
      panelStartRU: number, // 1
      panelEndRU: number,   // 45
      slots: [
        { ru: number, type: string, label?: string, height: number }
        // blanking panels, cable management, devices
      ]
    }
    // ... one entry per physical frame
  ],

  // ── Room directory ──
  rooms: [
    { roomNumber: string, roomName: string }
    // e.g. { roomNumber: "1234", roomName: "Meeting Room Alpha" }
  ],

  // ── Custom location types ──
  customLocationTypes: string[],  // types beyond the defaults
  // e.g. ["CAM", "SEN", "DIS"]

  // ── Metadata ──
  updatedAt: Timestamp,    // server timestamp, auto-set on save
  updatedBy?: string       // user UID who last saved
}
```

### Size Estimate

A typical project with 200 locations, 2 ports each, 2 frames:
- `zone.locations`: ~200 entries x ~80 bytes = ~16 KB
- `frames`: 2 entries x ~200 bytes = ~0.4 KB
- `rooms`: ~50 entries x ~60 bytes = ~3 KB
- **Total: ~20 KB** (well within Firestore's 1 MB document limit)

Even a large project with 999 locations at 4 ports each stays under 100 KB. The single-document approach is safe.

### Save Strategy

```
User edits config/location/frame
  → $state mutation in Frames.svelte
  → $effect() detects change
  → Debounce 500ms (clearTimeout/setTimeout)
  → db.save('frames', { id: pid, zone, frames, rooms, customLocationTypes })
  → Firestore merges (merge: true), sets updatedAt via serverTimestamp
```

Key behaviors:
- **Debounced**: 500ms delay after last edit before saving (avoids saving on every keystroke)
- **Merge**: Uses `{ merge: true }` so partial updates don't wipe unset fields
- **Optimistic**: UI updates immediately via local state; Firestore write is fire-and-forget
- **Real-time**: `subscribeOne` in +page.svelte means other clients see changes in real time
- **Initial load**: If no document exists yet, Frames.svelte uses `defaultZoneConfig()` and creates the doc on first save

### Load Strategy

```
+page.svelte
  → db.subscribeOne('frames', pid, data => frameData = data)
  → Frames.svelte receives data prop
  → On mount: initializes $state from data.zone, data.frames, etc.
  → Falls back to defaults if fields are missing (defensive)
```

### Migration Path

If the document grows beyond 500 KB (unlikely but possible with very large projects):
- Split `zone.locations` into a subcollection `frames/{pid}/locations/{locId}`
- Or split by zone into `frames/{pid}/zones/{zoneId}`
- The engine functions already accept a `ZoneConfig` object, so the component layer would just need to assemble it from multiple docs

### Firestore Rules (recommended)

```
match /frames/{pid} {
  allow read, write: if request.auth != null;
}
```

This matches the existing pattern where Firebase auth restricts access to valid email domains.

## Architecture change

Currently all patch frame data (zones, locations, frames, settings) is stored in a single Firestore doc at frames/{pid} with a single
     floor value. When the user changes the floor number, the same locations/frames are shown — there's no per-floor separation. The user
     needs each floor to have its own independent zone locations, server room count, and frame configurations.

     Data Model Change

     Old: Single doc at frames/{pid} containing everything
     New: Per-floor docs at frames/{pid}_F{floor} (e.g., frames/111-222_F01, frames/111-222_F02)

     Each floor doc contains:
     {
       floor: number,
       serverRoomCount: number,
       zoneLocations: Record<string, LocationConfig[]>,
       frames: FrameConfig[],
       rooms: [...],
       customLocationTypes: [...],
       excelGroupByRoom: boolean
     }

     Settings like rooms, customLocationTypes, excelGroupByRoom remain per-floor since they're stored in the same doc.

     Files to Modify

     1. src/routes/projects/[pid]/frames/+page.svelte

     - Change subscribeOne('frames', pid, ...) to use floor-keyed doc ID: frames/{pid}_F{floor}
     - Add activeFloor state (default 1)
     - Re-subscribe when floor changes: unsubscribe old, subscribe to new floor doc
     - Pass activeFloor and onfloorchange callback to Frames
     - The save function uses the floor-keyed doc ID

     2. src/routes/projects/[pid]/frames/Frames.svelte

     - Accept new props: activeFloor: number, onfloorchange: (floor: number) => void
     - Remove floor from internal state — it comes from the parent via activeFloor
     - When ConfigPanel changes floor, call onfloorchange(newFloor) which triggers parent to re-subscribe
     - The component re-renders with new data prop when the parent re-subscribes
     - Remove floor from the auto-save payload (it's part of the doc ID now, but still save it in the doc for reference)
     - Data migration: handle loading from old single-doc format on first load

     3. src/routes/projects/[pid]/frames/parts/ConfigPanel.svelte

     - No structural changes needed — onfloor callback already exists and will be wired to trigger floor switch

     4. Migration strategy

     - On first load, check if old frames/{pid} doc exists with data
     - If it does, copy its data to frames/{pid}_F{floor} (using the floor value in the doc)
     - This is a one-time migration handled in +page.svelte

     Implementation Steps

     1. Update +page.svelte: Add activeFloor state, change Firestore subscription to use {pid}_F{floor} doc ID, re-subscribe on floor
     change
     2. Update Frames.svelte: Accept activeFloor prop, wire onfloor to trigger parent's floor change instead of local state update, keep
     saving all other fields normally
     3. Add migration: In +page.svelte, check for old doc format and migrate on first load

     Verification

     - Change floor → should see empty/different data for new floor
     - Add locations on floor 1, switch to floor 2, add different locations → switch back to floor 1, data should be preserved
     - Reload page → data persists per floor
     - Excel export should still work with current floor's data


● Good. The ConfigPanel snippet already passes {floor} and onfloor={setFloor} — and now floor comes from the prop, and setFloor triggers the
  parent to re-subscribe via onfloorchange.

  The {#key activeFloor} in +page.svelte ensures the entire Frames component is destroyed and recreated when the floor changes, so all internal   state gets re-initialized from the new floor's data.

  Here's what changed:

  src/lib/db.svelte.ts — Added getOne(path, id) method for one-time document reads (used by migration).

  src/routes/projects/[pid]/frames/+page.svelte
  - Manages activeFloor state and subscribes to frames/{pid}_F{floor} (e.g., frames/111-222_F01)
  - Re-subscribes when floor changes, passes new data to Frames
  - {#key activeFloor} destroys/recreates Frames to reinitialize state from new doc
  - One-time migration copies old frames/{pid} doc to the new per-floor format

  src/routes/projects/[pid]/frames/Frames.svelte
  - floor is now a prop (from parent), not internal state
  - setFloor calls onfloorchange to trigger parent re-subscription
  - Auto-save writes to the current floor's doc via parent's onsave


  1. Slots now show actual type names — "Cable Manager", "Switch", "Fiber Enclosure", "Server", etc. instead of generic "Device". Labels from the rack device are shown too (e.g. "Switch: SW-48p-01").
  2. Only copper panel type gets ports — enclosure (fiber) and all other non-panel types are treated as slots that occupy RU space but don't get copper port labels assigned by the engine.
  3. enclosure type added throughout — racks types, device colors, and frames slot colors/labels all support the new type.

    1. Fixed: Device selection not showing Properties Panel
  - Root cause: Clicking a device in Draggable set the selection, but the browser's synthesized click event bubbled up to the canvas wrapper's onCanvasClick, which immediately cleared selectedIds.
  - Fix: Added onclick={e => e.stopPropagation()} to Draggable's div to prevent the click from reaching the canvas handler.

  2. Added: Overlap warning indicators on racks
  - When 2+ devices occupy the same RU position, the overlapping RU numbers turn red and bold on both sides of the rack.
  - A red ! exclamation mark appears in the right rail area for each overlapping RU, with a tooltip saying "Overlap: multiple devices at U{n}".
  - Computed via rackOverlaps derived state in Racks.svelte — a Map of rackId → Set of overlapping RU numbers, passed to each RackFrame as an overlaps prop.




  Plan: Scalable Rack Selector for Frames Tool

Problem

  When a floor has >6 racks across multiple rooms and rows, the current flat row of buttons becomes unwieldy — too many buttons to scan, no visual grouping by room/row.

  Current behavior (keep for ≤6 racks)

  Flat row of pill buttons, each with a colored dot for room. Works well at small scale.

  Proposed alternative (>6 racks): Grouped dropdown-style selector

  Layout: Replace the flat button row with a compact grouped selector that organizes racks by server room, then visually clusters by row within each room.

  ┌─────────────────────────────────────────────────────┐
  │ Room A                    │ Room B                   │
  │ ┌─────┬─────┬─────┬─────┐│ ┌─────┬─────┬─────┐     │
  │ │ R01 │ R02 │ R03 │ R04 ││ │ R01 │ R02 │ R03 │     │
  │ └─────┴─────┴─────┴─────┘│ └─────┴─────┴─────┘     │
  │ ┌─────┬─────┬─────┐      │ ┌─────┬─────┐           │
  │ │ R05 │ R06 │ R07 │      │ │ R04 │ R05 │           │
  │ └─────┴─────┴─────┘      │ └─────┴─────┘           │
  │ Row A         Row B       │ Row A        Row B      │
  └─────────────────────────────────────────────────────┘

  Specifics:

  1. Threshold: frames.length > 6 switches to the grouped view. Below that, current flat buttons are kept as-is.
  2. Grouped layout — a compact inline panel (not a dropdown/popover, always visible):
    - Racks grouped by serverRoom (A, B, C, D) into columns, each column headed by room letter with the existing room color dot
    - Within each room, racks shown as small pill buttons in a wrapping flex row
    - Selected rack highlighted with the room's color scheme (same as current)
    - Rows not explicitly labeled (they're a racks-tool concept), but racks naturally appear in their sort order which groups them visually
  3. Selected rack summary: Below the grid, show the same info bar that the current showInfo toggle reveals — room, RU count, panel ranges — always visible for the selected rack (no toggle needed when there are many racks, context is more important).
  4. Keyboard nav (optional enhancement): Left/Right arrow keys to move between racks within a room, Up/Down to jump between rooms.

  Why this approach

  - No popover/dropdown: The rack selector is the primary navigation control in the frames tool — hiding it behind a click adds friction. Keeping it always visible but reorganized is better.
  - Room grouping is natural: Racks already have a serverRoom field. Grouping by room makes it immediately clear which physical space you're looking at.
  - Compact: Small pill buttons (same text-xs font-mono as current) in a wrapping grid stay compact even with 20+ racks. Two rooms with 8 racks each would be ~2 rows tall per room, maybe 80px total height.
  - No new components needed: Just conditional logic in FrameToolbar.svelte — if frames.length > 6, render the grouped layout instead of the flat row.

  Files to modify

  ┌──────────────────────────────────┬────────────────────────────────────────────────┐
  │               File               │                     Change                     │
  ├──────────────────────────────────┼────────────────────────────────────────────────┤
  │ frames/parts/FrameToolbar.svelte │ Add grouped view branch when frames.length > 6 │
  └──────────────────────────────────┴────────────────────────────────────────────────┘

  What stays the same

  - Props interface unchanged
  - Room color scheme reused
  - Info panel content reused
  - Selection callback unchanged