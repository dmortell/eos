# Plan: Racks Tool — Rack Elevation & Device Placement

## Context
The Frames tool handles port labeling and patch panel allocation. The Racks tool is the visual companion: interactive rack elevation drawings where users place devices (patch panels, switches, servers, cable managers) into racks, configure device properties, and visualize server room layouts. It also supports desk elevations for trading desks. Sample components already exist in `racks/sample-parts/` and provide a working foundation for Panzoom, Draggable, RackFrameSvg, Device, and Sidebar.

## Scope
- Floor → server room → row → rack hierarchy
- Interactive panzoom canvas showing rack front elevation with floor/ceiling/slab reference lines
- Drag-and-drop devices from palette to racks with RU snap
- Device property editing (hostname, model, maker, ports)
- Custom device builder (label, type, height in U, ports, width/depth, maker) saved to library
- Rack ordering and configuration (label, U height, type, width, depth, maker/model)
- Multi-select with shift/ctrl click
- Properties panel for selected items
- Desk elevation support (same canvas system, different object types)
- Per-floor Firestore persistence (same pattern as Frames tool)
- Change logging via `$lib/logger.ts`

## Data Model — Firestore

**Collection:** `racks/{projectId}_F{floor}_R{room}`

Each doc stores one server room on one floor:
```ts
{
  floor: number,
  room: string,               // 'A', 'B', etc
  rows: RackRow[],             // row groupings
  racks: RackConfig[],         // rack definitions with ordering
  devices: DeviceConfig[],     // devices placed in racks
  library: DeviceTemplate[],   // custom device templates
  settings: {
    slabLevel: number,         // mm, default 0
    floorLevel: number,        // mm, default 150
    ceilingLevel: number,      // mm, default 2600
    showGrid: boolean,
  }
}
```

### Key Types (`parts/types.ts`)
```ts
interface RackRow {
  id: string
  label: string               // "Row A", "Row B"
}

interface RackConfig {
  id: string
  label: string               // "A101"
  rowId: string               // which row
  order: number               // display order within row
  heightU: number             // 42, 48, etc
  heightMm: number            // physical height
  widthMm: number             // 600, 800
  depthMm: number             // 1000, 1200
  type: '2-post' | '4-post' | 'cabinet'
  maker?: string
  model?: string
}

interface DeviceConfig {
  id: string
  rackId: string
  label: string               // hostname or label
  type: DeviceType            // 'panel' | 'switch' | 'server' | 'manager' | 'shelf' | 'pdu' | 'other'
  heightU: number
  positionU: number           // 1-based from bottom
  portCount: number
  portType?: string           // 'RJ45' | 'LC' | 'SC' | 'SFP'
  maker?: string
  model?: string
  color?: string
}

interface DeviceTemplate {
  id: string
  label: string
  description: string
  type: DeviceType
  heightU: number
  portCount: number
  portType?: string
  widthMm?: number
  depthMm?: number
  maker?: string
  icon: string
}
```

## Files to Create/Modify

### New files in `src/routes/projects/[pid]/racks/`

1. **`+page.svelte`** — Route page (rewrite existing stub)
   - Same pattern as Frames `+page.svelte`: Firestore subscription per floor+room
   - `activeFloor`, `activeRoom` state, re-subscribe on change
   - `{#key}` block to recreate main component on floor/room change
   - `save()` callback with change logging

2. **`parts/types.ts`** — Type definitions (above)

3. **`parts/constants.ts`** — Drawing constants
   - Adapt from `sample-parts/constants.ts`: RU height px, rack width, gap, device palette

4. **`Racks.svelte`** — Main component
   - Props: `data`, `floor`, `room`, `projectId`, `onsave`, `onfloorchange`, `onroomchange`
   - Left sidebar: ConfigPanel + device palette + custom builder
   - Main area: Panzoom canvas with rack elevations
   - Right panel: Properties window (floating)
   - State: racks, devices, library, selectedIds, view
   - Debounced auto-save with change tracking (same pattern as Frames)

5. **`parts/ConfigPanel.svelte`** — Floor/room/row selection
   - Floor number input
   - Server room selector (A, B, C, D buttons)
   - Row selector (for rooms with multiple rack rows)
   - Compact 2-column grid layout

6. **`parts/RackList.svelte`** — Rack management sidebar section
   - Add rack form (label, U height, type, dimensions, maker/model)
   - List of racks in current row with reorder drag
   - Edit/delete rack

7. **`parts/DevicePalette.svelte`** — Device library & custom builder
   - Built-in device palette (from sample `Sidebar.svelte`)
   - Custom device builder form
   - Search filter
   - Draggable library items

8. **`parts/Canvas.svelte`** — Panzoom canvas wrapper
   - Adapts `sample-parts/PanzoomNew.svelte`
   - Renders floor/slab/ceiling reference lines via Rect
   - Renders rack frames via RackFrame
   - Renders devices via Draggable + DeviceView
   - Drop zone for palette items

9. **`parts/RackFrame.svelte`** — SVG rack frame rendering
   - Adapts `sample-parts/RackFrameSvg.svelte`
   - Label above frame, RU numbering, mounting rails
   - Highlights available/occupied RU slots

10. **`parts/DeviceView.svelte`** — Device rendering in rack
    - Adapts `sample-parts/Device.svelte`
    - Shows label, icon, port grid
    - Hover actions (edit, delete)
    - Color coding by device type

11. **`parts/Draggable.svelte`** — Drag handler
    - Adapts `sample-parts/DraggableNew.svelte`
    - Mouse + touch support, zoom-aware positioning
    - RU snap on drop

12. **`parts/Rect.svelte`** — Reference line rectangles
    - Adapts `sample-parts/Rect.svelte`

13. **`parts/PropertiesPanel.svelte`** — Selected item property editor
    - Floating window (uses `$lib` Window component)
    - Shows editable fields based on selected item type (rack or device)

## Implementation Steps

### Step 1: Scaffold & types
- Create `parts/types.ts` and `parts/constants.ts`
- Set up `+page.svelte` with Firestore subscription pattern

### Step 2: Main layout
- Create `Racks.svelte` with sidebar + canvas layout using PaneGroup
- Create `parts/ConfigPanel.svelte` for floor/room/row selection

### Step 3: Canvas & rack rendering
- Create `parts/Canvas.svelte` (panzoom) with reference lines
- Create `parts/RackFrame.svelte` for SVG rack frames
- Create `parts/Rect.svelte` for reference lines
- Render racks from state

### Step 4: Device palette & drag-drop
- Create `parts/DevicePalette.svelte` with built-in palette + custom builder
- Create `parts/Draggable.svelte` for drag handling
- Create `parts/DeviceView.svelte` for device rendering
- Implement drop-to-rack with RU snap positioning

### Step 5: Properties & editing
- Create `parts/PropertiesPanel.svelte` for editing selected rack/device
- Wire up selection (click, shift+click, ctrl+click)
- Implement device reposition within rack

### Step 6: Persistence & logging
- Wire auto-save with debounce
- Add change logging via `writeLog()`
- Add LogsDialog (reuse from frames)

### Step 7: Rack management
- Create `parts/RackList.svelte` for add/edit/delete/reorder racks
- Custom device template CRUD (save to library array in doc)

## Key Patterns to Reuse from Frames Tool
- `+page.svelte` Firestore subscription with `{#key}` recreation pattern
- Debounced auto-save with `stripUndefined()` and status indicator
- Change logging via `$lib/logger.ts` (writeLog, computeChanges)
- Multi-select with `SvelteSet` / `Set<string>` (shift=range, ctrl=toggle)
- PaneGroup/Pane/Handle for resizable sidebar
- LogsDialog for viewing change history

## Sample Components to Adapt
- `sample-parts/PanzoomNew.svelte` → `parts/Canvas.svelte` (pan, zoom, grid, touch)
- `sample-parts/DraggableNew.svelte` → `parts/Draggable.svelte` (drag with zoom awareness)
- `sample-parts/RackFrameSvg.svelte` → `parts/RackFrame.svelte` (SVG rack with RU marks)
- `sample-parts/Device.svelte` → `parts/DeviceView.svelte` (device display with ports)
- `sample-parts/Sidebar.svelte` → split into ConfigPanel + DevicePalette + RackList
- `sample-parts/Rect.svelte` → `parts/Rect.svelte` (floor/ceiling reference lines)

## Verification
1. Navigate to `/projects/{pid}/racks` — page loads with empty state
2. Select floor 1, room A — empty canvas with floor/ceiling lines
3. Add a rack — SVG rack frame appears on canvas
4. Drag a patch panel from palette to rack — snaps to RU position
5. Click device — properties panel shows, edit hostname
6. Add second rack — appears adjacent with correct spacing
7. Switch floor/room — data is independent per floor+room
8. Reload page — data persists from Firestore
9. Create custom device template — appears in palette, can be dragged to rack




# Plan: Integrate Racks ↔ Frames — Single Source of Truth for Rack Contents

## Context
Currently Frames and Racks both define rack contents independently. Frames has `FrameConfig` with `slots` (blanking, cable managers, devices) and panel RU ranges. Racks has `RackConfig` with `DeviceConfig[]`. This duplicates rack management. The goal is to make Racks the single source of truth, with Frames reading rack/device data from the Racks Firestore docs.

**Key decisions:**
- Frames reads Racks Firestore docs (`racks/{pid}_F{floor}_R{room}`) to get rack contents
- Slots editor removed from Frames, but Frames still displays rack devices in the frame drawing
- Patch panels in Racks get panel-level fields (`patchLevel`, `serverRoom`) so Frames knows which panels get which ports

## Changes to Racks Tool

### 1. Add patch-panel metadata to `DeviceConfig` (`racks/parts/types.ts`)

```ts
export interface DeviceConfig {
  // ... existing fields ...

  // Patch panel fields (only relevant when type === 'panel')
  patchLevel?: 'floor' | 'high'  // floor-level or high-level (ceiling) ports
  serverRoom?: string             // 'A', 'B', 'C', 'D' — which server room this panel serves
}
```

### 2. Update Racks UI to show these fields

In `DevicePalette.svelte` / `PropertiesPanel.svelte`:
- When device type is `'panel'`, show dropdowns for `patchLevel` (floor/high) and `serverRoom` (A/B/C/D)
- Default: `patchLevel: 'floor'`, `serverRoom: 'A'`

### 3. Add `serverRoom` to `RackConfig` (`racks/parts/types.ts`)

```ts
export interface RackConfig {
  // ... existing fields ...
  serverRoom?: string  // 'A', 'B', 'C', 'D' — which server room this rack is in
}
```

This is needed because Frames groups racks by server room. Currently Frames has `FrameConfig.serverRoom`.

## Changes to Frames Tool

### 4. Subscribe to Racks data in `frames/+page.svelte`

Add a second Firestore subscription to the racks doc for the current floor + room:
```js
// Subscribe to racks data for the active floor + each room
const rackDocId = `${pid}_F${floor}_R${room}`
db.subscribeOne('racks', rackDocId, data => { rackData[room] = data })
```

Since Frames has `serverRoomCount` (1–4), subscribe to rooms A, B, C, D as needed. Pass `racksData` to the `Frames` component.

### 5. Derive `FrameConfig[]` from rack data in `Frames.svelte`

Replace the user-managed `frames` state with a derived value computed from racks data:

```ts
let derivedFrames = $derived<FrameConfig[]>(() => {
  // For each rack in racks data that has a serverRoom:
  // Build a FrameConfig from the rack + its panel devices
  return allRackDocs.flatMap(doc =>
    (doc?.racks ?? []).filter(r => r.serverRoom).map(rack => {
      const rackDevices = (doc?.devices ?? []).filter(d => d.rackId === rack.id)
      const slotRUs = new Set<number>()
      // Non-panel devices become slots (occupying RU space)
      for (const dev of rackDevices) {
        if (dev.type !== 'panel') {
          for (let u = dev.positionU; u < dev.positionU + dev.heightU; u++) slotRUs.add(u)
        }
      }
      // Panel devices define available panel positions
      const floorPanels = rackDevices.filter(d => d.type === 'panel' && d.patchLevel !== 'high')
      const highPanels = rackDevices.filter(d => d.type === 'panel' && d.patchLevel === 'high')

      return {
        id: rack.id,
        name: rack.label,
        serverRoom: rack.serverRoom!,
        totalRU: rack.heightU,
        // Panel ranges from actual panel device positions
        panelStartRU: Math.min(...floorPanels.map(d => d.positionU), rack.heightU),
        panelEndRU: Math.max(...floorPanels.map(d => d.positionU + d.heightU - 1), 1),
        hlPanelStartRU: highPanels.length ? Math.min(...highPanels.map(d => d.positionU)) : undefined,
        hlPanelEndRU: highPanels.length ? Math.max(...highPanels.map(d => d.positionU + d.heightU - 1)) : undefined,
        slots: [...slotRUs].map(ru => ({ ru, type: 'device' as const, height: 1 })),
      } satisfies FrameConfig
    })
  )
})
```

This means `engine.ts` works unchanged — it still receives `FrameConfig[]` but now they're derived from Racks data.

### 6. Remove slots editor from `FrameToolbar.svelte`

- Remove the "Add Slot" button and slot editing UI
- Keep the frame tab selector (now shows racks with server rooms)
- Remove the RU range inputs (panelStartRU/panelEndRU/hlPanelStartRU/hlPanelEndRU) — these are now computed from actual panel positions in the rack
- Keep the frame name display and server room indicator

### 7. Update `FrameDrawing.svelte` to show rack devices

Currently it shows panels + slots. Update to also show non-panel devices from Racks data:
- Pass `rackDevices` alongside `panels`
- Render non-panel devices (switches, servers, managers, etc.) in their RU positions with label/type
- Keep panel rendering (PanelStrip) as-is for patch panels with port labels

### 8. Remove `frames` from Frames Firestore doc

The `frames: FrameConfig[]` field is no longer stored in `frames/{pid}_F{floor}`. Remove:
- `frames` from the auto-save payload in `Frames.svelte`
- Frame CRUD functions (`addFrame`, `removeFrame`, `updateFrame`)
- The `frames` state variable (replaced by `derivedFrames`)

Keep in the Frames doc: `zoneLocations`, `serverRoomCount`, `rooms`, `customLocationTypes`, `excelGroupByRoom`

## Files to Modify

| File | Change |
|------|--------|
| `racks/parts/types.ts` | Add `patchLevel`, `serverRoom` to DeviceConfig; add `serverRoom` to RackConfig |
| `racks/parts/PropertiesPanel.svelte` | Show patchLevel + serverRoom fields for panel devices |
| `racks/parts/RackList.svelte` | Add serverRoom field to rack add/edit form |
| `racks/Racks.svelte` | Pass serverRoom to addRack; pass patchLevel/serverRoom to addDevice for panels |
| `frames/+page.svelte` | Subscribe to racks docs for each server room; pass to Frames |
| `frames/Frames.svelte` | Replace `frames` state with `derivedFrames` from racks data; remove frame CRUD |
| `frames/parts/FrameToolbar.svelte` | Remove slot editor + RU range inputs; keep frame tabs |
| `frames/parts/FrameDrawing.svelte` | Render non-panel devices from racks data alongside panels |
| `frames/parts/types.ts` | No changes needed — FrameConfig interface stays as compatibility layer |
| `frames/parts/engine.ts` | No changes — still receives FrameConfig[], works the same |

## Implementation Steps

1. **Racks types**: Add `patchLevel`/`serverRoom` to DeviceConfig, `serverRoom` to RackConfig
2. **Racks UI**: Update PropertiesPanel, RackList, DevicePalette to show new fields for panels/racks
3. **Frames +page.svelte**: Add racks doc subscriptions per room, pass data to Frames
4. **Frames.svelte**: Derive FrameConfig[] from racks data, remove frames state + CRUD
5. **FrameToolbar**: Remove slot editor and RU range inputs
6. **FrameDrawing**: Display rack devices alongside panels

## Verification

1. In Racks: add a rack with `serverRoom: 'A'`, place 2 patch panels (floor-level) and a switch
2. In Frames: verify the rack appears as a frame with 2 panels and the switch shown as occupied RU
3. Port labels should be generated and assigned to the 2 patch panels correctly
4. Add a high-level patch panel in Racks → Frames should show it in a separate HL section
5. Switch floor → data independent, racks subscription updates
6. Existing Frames data (zoneLocations, rooms, etc.) still works


● Build succeeds cleanly. Let me mark the task as complete.
● All integration changes are complete and the build passes. Here's a summary of what was done:

  FrameToolbar.svelte — Simplified to read-only frame tabs:
  - Removed slot editor (add/edit/remove slots UI)
  - Removed frame CRUD functions (addFrame, removeFrame, updateFrame)
  - Removed "Add Frame" buttons and delete confirmation dialog
  - Removed RU range inputs (panelStartRU/panelEndRU/hlPanelStartRU/hlPanelEndRU)
  - Kept frame tab selector with room-color dots
  - Added a read-only info toggle showing frame details (room, RU, panel ranges, slot count)
  - Shows a hint message when no frames exist ("add racks in the Rack Elevations tool")

  FrameDrawing.svelte — Enhanced device display:
  - Added color-coded device type rendering (switch=green, router=blue, server=indigo, ups=amber, etc.)
  - Non-panel devices from Racks data now show with their type color and label
  - Extended room color dot to support all 4 rooms (A-D)

  Frames.svelte — Cleaned up:
  - Removed updateFrames no-op function
  - Removed onupdate prop from FrameToolbar usage


  How to add patch panels for the Frames tool: In the Racks tool, add a rack and set its Server Room (A/B/C/D). Then click a patch panel from the device library (e.g. "24-Port Patch Panel"). The device gets placed in the rack. Select the device — in the Properties panel you'll   see Patch Level (floor/high) and Server Room fields. These tell the Frames tool which panels to use for port label generation. Floor-level panels get normal labels, high-level panels get the -H suffix.

  Why Frames wasn't displaying devices: The Firebase error (undefined field value) was preventing the racks data from being saved to Firestore. Since the data never saved, Frames had no racks data to subscribe to. The undefined values came from optional fields like maker,
  model, portType on devices/racks. I've added a strip() function that recursively removes all undefined values before saving — this matches what Frames already does with its stripUndefined() helper.

● Summary of fixes:
  1. Firebase undefined error — added strip() to recursively remove undefined values from save payload
  2. Row delete — added delete button (red x on hover) with confirmation dialog to ConfigPanel, cascades to delete all racks and devices in the row
  3. Device palette — changed label from "Drag to Rack" to "Click to Add", removed grab cursor
  4. Device placement — already works correctly: clicking a device in the library adds it to the first free RU slot (from bottom) in the first rack


  Drag from palette to rack:
  - Mousedown on a palette item starts drag tracking with a floating ghost label showing device name + height
  - Drag to canvas, release over a rack — the device snaps to the RU position at the drop point
  - If released outside a rack, the drop is ignored
  - Ghost element follows the cursor during drag

  Click-to-add targets selected rack:
  - If a rack is selected (clicked on canvas or in rack list), click-to-add places the device in that rack
  - If no rack is selected, falls back to the first rack in the active row

  Both modes work together:
  - Quick click (no drag movement) triggers click-to-add to selected/first rack
  - Mousedown + move triggers drag-to-rack with position targeting

  Toolbar under titlebar — Room pills (A B C D) on the left, Row pills on the right with + to add row. Row delete on hover (red x badge) with confirmation
  dialog. Compact h-8 bar.

  Floor tabs in status bar — Excel-style F01 F02 F03 + tabs at the bottom-left, active floor highlighted with blue top border. Plus button creates next floor.
   Stats and zoom on the right.

  ConfigPanel removed from sidebar — frees up space for rack list and device palette.

  Drop ghost — When dragging a device (from palette or within canvas) over a rack, a dashed blue rectangle shows the snap position at the target RU.
  Disappears on drop or when cursor leaves the rack area.



  Plan: Floor Manager Dialog

 Context

 Currently floors can only be added by clicking a "+" button that auto-increments the floor number. There's no way to add a specific floor number (e.g., floor 50), edit floor properties, or see a structured overview.
 Server room count is set per-floor in Frames but not visible in Racks. We need a Floor Manager dialog to provide a single place to set up the project's floor structure, shared between both tools.

 Data Model Change

 Project-level floor config (stored in projects/{pid})

 Replace floors: number[] with:

 interface FloorConfig {
   number: number          // floor/level number (e.g., 1, 50)
   serverRoomCount: number // 1–4 (rooms A, B, C, D)
 }

 Store as floors: FloorConfig[] in the project doc. Single source of truth for which floors exist and how many rooms each has.

 Migration: On load in both +page.svelte files, if floors is number[] (old format), convert to FloorConfig[] with serverRoomCount defaulting to 1 (or pulled from existing frames doc data if available).

 Remove serverRoomCount from Frames per-floor doc

 Currently in frames/{pid}_F{nn}. Frames will read it from project-level FloorConfig instead. The ConfigPanel room count buttons will propagate changes to the project doc.

 New Component: FloorManagerDialog.svelte

 Location: src/lib/components/FloorManagerDialog.svelte (shared between both tools)

 Props:
 {
   open: boolean
   floors: FloorConfig[]
   floorFormat: string
   onclose: () => void
   onupdate: (floors: FloorConfig[]) => void  // called on any change (add, edit rooms, reorder)
   ondelete: (floorNumber: number) => void     // separate because it deletes Firestore docs
 }

 UI (dialog, ~500px wide):
 ┌─ Floor Manager ──────────────────────────── ✕ ─┐
 │                                                 │
 │  ┌───────┬──────────────────────────┬─────────┐ │
 │  │  L01  │  Rooms: [1] [2] [3] [4] │   [🗑️]  │
 │  ├───────┼──────────────────────────┼─────────┤ │
 │  │  L02  │  Rooms: [1] [2] [3] [4] │   [🗑️]  │
 │  ├───────┼──────────────────────────┼─────────┤ │
 │  │  L50  │  Rooms: [1] [2] [3] [4] │   [🗑️]  │
 │  └───────┴──────────────────────────┴─────────┘ │
 │                                                 │
 │  Floor: [___] Rooms: [1][2][3][4]  [Add Floor]  │
 │                                                 │
 └─────────────────────────────────────────────────┘

 - List of floors sorted by number, each row showing formatted floor name + room count buttons + delete
 - Room count editable inline via 1-4 button group (changes propagate immediately)
 - Add floor: number input + room count + Add button
 - Delete: inline confirmation (text changes to "Confirm delete? All data will be lost. [Yes] [Cancel]")
 - Duplicate floor numbers rejected

 Files to Modify

 ┌──────────────────────────────────────────────┬────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
 │                     File                     │                                                                       Change                                                                       │
 ├──────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
 │ src/lib/components/FloorManagerDialog.svelte │ New — shared dialog                                                                                                                                │
 ├──────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
 │ frames/+page.svelte                          │ Migrate floors to FloorConfig[], pass to Frames, handle onupdate/ondelete                                                                          │
 ├──────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
 │ frames/Frames.svelte                         │ Replace "+" with "manage floors" button, read serverRoomCount from floors prop, remove from save payload, remove inline delete confirmation dialog │
 ├──────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
 │ frames/parts/ConfigPanel.svelte              │ Room count changes emit callback to update project doc                                                                                             │
 ├──────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
 │ racks/+page.svelte                           │ Migrate floors to FloorConfig[], pass to Racks, handle onupdate/ondelete                                                                           │
 ├──────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
 │ racks/Racks.svelte                           │ Replace "+" with "manage floors" button, remove inline delete confirmation dialog                                                                  │
 └──────────────────────────────────────────────┴────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘

 Implementation Steps

 1. Create FloorManagerDialog.svelte — the shared dialog component
 2. Update frames/+page.svelte — migrate floors format, add updateFloors/deleteFloor handlers, save FloorConfig[] to project doc
 3. Update frames/Frames.svelte — accept floors: FloorConfig[], derive serverRoomCount from it, open Floor Manager dialog, remove inline floor delete dialog, remove serverRoomCount from save payload
 4. Update frames/parts/ConfigPanel.svelte — emit onroomchange callback when room count changes (parent updates project doc)
 5. Update racks/+page.svelte — same migration + handlers as frames
 6. Update racks/Racks.svelte — accept floors: FloorConfig[], open Floor Manager dialog, remove inline floor delete dialog
 7. Clean up — remove now-unused addFloor/deleteFloorConfirm state from both tools

 Verification

 1. Open Floor Manager from floor tabs → add floor 50 with 2 rooms → tab appears in both tools
 2. Change room count on a floor → Frames server room options update, Racks room buttons reflect it
 3. Delete a floor → inline confirmation → frames + racks docs deleted
 4. Old projects with floors: [1, 2] → auto-migrated to FloorConfig[]
 5. Try adding duplicate floor number → rejected
 6. Floor format (L01/01F/01) applied in dialog display



 Here's what was implemented:

  New shared component: src/lib/components/FloorManagerDialog.svelte
  - Dialog to manage floors across both tools
  - Add floors with specific numbers (not just increment)
  - Edit server room count per floor (1–4 button group)
  - Delete floors with inline confirmation ("Delete all data? Yes / No")
  - Duplicate floor numbers rejected with error message
  - Exports FloorConfig interface ({ number, serverRoomCount })

  Data model change:
  - floors in project doc changed from number[] to FloorConfig[]
  - Both +page.svelte files auto-migrate old format on load
  - serverRoomCount removed from frames per-floor save payload — now stored at project level

  Frames tool:
  - serverRoomCount is now $derived from the floors config
  - ConfigPanel room count buttons propagate changes to project doc
  - Floor tabs simplified (no inline delete buttons)
  - "+" button opens Floor Manager dialog instead of auto-adding
  - Inline delete confirmation dialog removed

  Racks tool:
  - Floor tabs use FloorConfig[] with .number keys
  - Room buttons respect per-floor serverRoomCount from floors config
  - "+" button opens Floor Manager dialog
  - Inline delete confirmation dialog removed

  1. Fixed: Device Properties Panel not appearing on click
  - The browser's synthesized click event was bubbling from the Draggable to the canvas wrapper, which called selectedIds.clear() immediately after selectedIds.add().
  - Fix: Added onclick={e => e.stopPropagation()} to Draggable's div.

  2. Added: Overlap warning indicators on racks
  - When 2+ devices occupy the same RU position, the RU numbers turn red/bold with a ! warning icon and tooltip in the right rail.
  - Computed via rackOverlaps derived Map in Racks.svelte, passed as overlaps prop to each RackFrame.

  3. Added: Real-time sync from Firestore
  - Racks.svelte now watches the data prop via $effect and applies remote changes to local state (rows, racks, devices, settings).
  - Sync is paused while the user is editing (saveStatus !== 'saved') and for 1.5s after each save to avoid our own Firestore echo overwriting state.
  - The +page.svelte already had subscribeOne real-time listeners, so no changes needed there — updates from other users now flow through to the canvas immediately.