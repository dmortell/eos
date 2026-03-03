# EOS

EOS is a set of tools for managing IT Infrastructure related projects.

## Tech Stack

- **Framework**: SvelteKit with Svelte v5 (runes: `$state()`, `$derived()`, `$effect()` - not the old Svelte v4 `$:` reactivity)
- **Styling**: Tailwind CSS v4
- **Icons**: @lucide/svelte, available via `import { Icon } from '$lib'`
- **UI Components**: Custom components in `$lib/ui` - `import { Button, Input, Row, Icon } from '$lib'` (see `lib/index.ts`). shadcn-svelte components can be added if needed.
- **Auth**: Firebase authentication (backend restricts access to valid email domains)
- **Database**: Firestore with realtime subscriptions
- **Deployment**: Vercel via GitHub
- **Package Manager**: pnpm (preferred)
- **Testing**: Vitest + Playwright

## Tools

### Patch Frame Port Allocation

The port allocator tool generates a visual representation of data patch frames showing LAN port outlet labels assigned to each port position. It is used during infrastructure design to plan and document structured cabling layouts.

**Entry point**: `src/routes/projects/[pid]/frames/Frames.svelte`
**Sub-components**: `src/routes/projects/[pid]/frames/parts/`

#### Labeling Format

| Segment | Format | Description |
|---------|--------|-------------|
| Floor | `FF` | 01 to 20 |
| Zone | `Z` | A to Z |
| Location | `NNN` | 001 to 999 |
| Server Room | `S` | A or B |
| Port Number | `PP` | 01 to 99 per location |

- **Floor port label**: `FF.Z.NNN-SPP` (e.g., `03.B.012-A02`)
- **High-level ceiling port**: `FF.Z.NNN-SPP-H` (e.g., `03.B.012-A01-H`)

#### Configuration

- Enter floor, zone, and number of locations in that zone
- Per location: set number of data ports (1-99, default 2; some locations may need more, e.g. 24 for an AV rack)
- Each location can be assigned a type via quick-select grouped buttons: desk, AP, PR (printer), RS (room scheduler), FR (facial recognition), WC (world-clock), TV, LK (lockers), etc. Additional types can be added in settings.
- Location numbers can be assigned a 4-digit room number for floorplan reference. A room number editor allows assigning room names.
- Most floors have one server room, but some have two (A and B). Ports from a single outlet box can be split across server rooms (e.g., 4 ports: 2 to room A, 2 to room B) with bulk assignment actions (Split 50/50, All A, All B).

#### Frame Layout

- Patch frames are 45U by default (configurable)
- Each patch panel is high-density: 48 ports per RU (two rows of 24 ports)
- High-level ceiling panels are kept separate from floor port panels
- RU numbering starts at RU 1 at the bottom
- Configurable top/bottom RU boundaries for patch panel placement
- Multiple patch frames may be needed per server room

#### Frame Customization

- Blanking panels at specific RU positions
- 1U or 2U horizontal cable management at specific RU positions
- Network devices of various sizes can be placed in the frame

#### UI Layout

- Port editor list in sidebar with realtime frame drawing in the main content area
- View toggle: sidebar layout or stacked vertical layout (outlet list above frame drawing) for narrow screens
- Pan/zoom on frame drawing with auto-scroll to the panel of a selected port
- Light mode theme preferred, or light/dark toggle in titlebar

#### Export

- Export patch frame drawings to Excel

#### Data Storage

Patch frame data is stored in Firestore at `frames/{pid}` (where pid is the project id). All patch frames for a project are stored together in one document.

#### Future Features

- Outlet ports defined as Copper or Fiber, with copper/fiber panel locations specified per frame
- Allow selecting a group of outlets using shift-click & ctrl-click for editing simultaneously

## Developing

```sh
pnpm install
pnpm dev

# or open in browser automatically
pnpm dev --open
```

## Building

```sh
pnpm build
pnpm preview  # preview the production build
```

## Project Setup

To recreate this project from scratch with the same configuration:

```sh
pnpm dlx sv@0.12.4 create --template minimal --types ts --add vitest="usages:unit,component" tailwindcss="plugins:none" sveltekit-adapter="adapter:vercel" devtools-json --install pnpm .
```


*	Name convention for Low level cabling solution
o	10.Z.YY-AXX/BXX
- 	A = Hub room 01
- 	B = Hub room 02
- 	XX = Data Port Number

*	Name convention for High level cabling solution (for WAP, Ceiling TV, etc.)
o	10.Z.YY-AXX/BXX-H
- 	A = Hub room 01
- 	B = Hub room 02
- 	XX = Data Port Number
- 	H = High Level



● All tasks complete. Here's a summary of everything created:

  Files Created/Updated
  ┌──────────────────────────────────┬───────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
  │               File               │                                                  Description                                                  │
  ├──────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────────────┤                                                                                                                              │ implementation.md                │ Detailed implementation plan with architecture, types, components, 4 phases, and now Phase 2 Firestore schema │                                                                                                                              ├──────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────────────┤                                                                                                                              │ README.md                        │ Reorganized with tech stack section, structured tool spec with tables                                         │                                                                                                                              ├──────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ frames/+page.svelte              │ Route entry - subscribes to Firestore, passes data to Frames                                                  │
  ├──────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ frames/Frames.svelte             │ Main orchestrator - sidebar (360px) + frame drawing area, reactive data flow                                  │
  ├──────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ frames/parts/types.ts            │ All TypeScript interfaces, default factories, loc type colors/labels                                          │
  ├──────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ frames/parts/engine.ts           │ Pure functions: generatePortLabels(), generateRacks(), validateConfig()                                       │
  ├──────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ frames/parts/ConfigPanel.svelte  │ Zone config form: floor, zone, server rooms, location count                                                   │
  ├──────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ frames/parts/LocationList.svelte │ Scrollable location list container                                                                            │
  ├──────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ frames/parts/LocationRow.svelte  │ Per-location editor: port count, type buttons, room assignment toggles                                        │
  ├──────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ frames/parts/FrameDrawing.svelte │ Rack visualization with panels, RU numbers, empty RU indicator                                                │
  ├──────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ frames/parts/PanelStrip.svelte   │ Single 1RU panel: 2 rows x 24 port cells                                                                      │
  ├──────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ frames/parts/PortCell.svelte     │ Individual port with color coding by type, selection highlighting                                             │
  └──────────────────────────────────┴───────────────────────────────────────────────────────────────────────────────────────────────────────────────┘

  Firestore Schema (Phase 2)

  Single document at frames/{pid} containing:
  - zone - floor, zone letter, server room count, locations array
  - frames - array of frame configs with RU settings and slots
  - rooms - room number directory
  - customLocationTypes - user-defined types beyond defaults
  - Debounced auto-save (500ms), merge writes, real-time sync


  ● Phase 2 is complete. Here's what was added:

  Firestore Persistence
  - +page.svelte: Subscribes to frames/{pid} and passes a save() function that calls db.save('frames', { id: pid, ...payload })
  - Frames.svelte: Added onsave callback prop, debounced auto-save via $effect() (500ms delay), and a save status indicator (Saved/Saving.../Unsaved) in the summary bar. Skips the initial render to avoid a save-on-load. Persists zone, frames, rooms, and customLocationTypes.
  High-Level Port Support

  - LocationRow.svelte: Added "High-level" checkbox that toggles isHighLevel on the location. Location number displays with amber color and "H" suffix when high-level.
  - PanelStrip.svelte: High-level panels get an amber-tinted RU rail with "HL" label to visually distinguish them from floor panels.
  - engine.ts: Already handles -H suffix generation and separates floor/high-level panels (implemented in Phase 1).

  Room Number Input

  - LocationRow.svelte: Added a 4-character room number input field between the type buttons and server room assignments. Stored as optional roomNumber on each location.


● All done. Here's a summary of everything in this round:

  Bug Fixes
  - Generate preserves locations: When changing location count and clicking Generate, existing locations keep their port counts, types, room assignments, etc. Only new locations get defaults.
  - Compact LocationRow: Room number and high-level checkbox moved to the same row as port count (single line: 001 [2] [room] [HL] [desk|AP|PR|...])
  - Readable port labels: Font bumped from text-[7px] to text-[9px], height from h-6 to h-7, and floor prefix (FF.) removed from display (still in tooltip)

  Phase 3: Frame Customization

  - FrameToolbar.svelte (new): Frame tab selector, add/remove frames per server room, expandable settings panel per frame with:
    - Frame name, total RU, panel start/end RU range
    - Slot manager: add blanking panels, 1U/2U cable management, and devices at specific RU positions
  - FrameDrawing.svelte (rewritten): Now renders a full RU map top-to-bottom showing:
    - Patch panels at their assigned RU positions
    - Blanking panels (gray), cable management (yellow), devices (indigo) at their configured slots
    - Empty RU rows with faded numbers for unoccupied positions
    - RU numbering starts at 1 from bottom (highest RU at top of visual)
  - Frames.svelte: Integrated FrameToolbar, added selectedFrameId state, updateFrames handler with auto-reselection on removal


● Here's a summary of everything done:

  Bug Fixes
  - Duplicate ports across frames: Engine now distributes labels across frames of the same server room by capacity instead of duplicating. First frame fills up, overflow goes to the next.
  - Panels from top: Panels now assigned from panelEndRU downward (top of frame first), skipping RUs occupied by slots.

Phase 4: Advanced Features

  - Excel export (exportExcel.ts): Full workbook with one sheet per frame, port labels in 24-column grid with color-coded cells (blue=room A, purple=room B), slot rows, and empty RU rows. Downloads as PatchFrame_F01_ZA.xlsx.
  - View toggle: Sidebar layout (default) or stacked vertical layout via toggle buttons in toolbar.
  - Scroll sync: Clicking a port in the frame drawing scrolls to that location in the sidebar list (and vice versa) using data-loc / data-loc-row attributes.
  - Settings dialog (SettingsDialog.svelte): Add/remove custom location types beyond defaults, manage room directory (room number + name pairs).
  - Icon additions: Added settings (Settings) and rows (Rows3) to the Icon component.

  Type Widening for 1-4 Server Rooms

  - Updated serverRoomCount from 1 | 2 to number, serverRoom from 'A' | 'B' to string, and serverRoomAssignment from ('A' | 'B')[] to string[] across all types to support the user's expansion to 4 server rooms.


  Here's a summary of what was completed:
  Done:
  1. Memory note written — Saved onclick|stopPropagation Svelte 5 gotcha and other project patterns to MEMORY.md
  2. excelGroupByRoom wired up in Frames.svelte — added to state (initialized from Firestore data), included in auto-save payload, passed to SettingsDialog
  3. updateSettings handler updated to accept and store excelGroupByRoom
  4. exportToExcel updated to support groupByRoom mode — when enabled, frames sharing the same server room are merged into a single Excel tab (e.g., "Room A") with spacing between frames
  5. Slots Firestore save verified — the frames array (which includes slots) is tracked by the $effect via JSON.stringify and included in the save payload. The save should work correctly.
  6. Type check passed — no errors in frames code (all 11 errors are pre-existing in unrelated files)

● Good, the zone data retention is done. Now let me fix the Firebase error — the issue is that FrameSlot.label is undefined when not set, and Firestore doesn't accept undefined values. Let me check where slots are created:
● There it is — label: slotLabel || undefined. Firestore can't store undefined. I need to either omit the field or use an empty string.

  Here's what was fixed:
  1. ConfigPanel height/spacing — Switched to a compact 4-column grid layout (grid-cols-4). All inputs, selects, and buttons are now a consistent h-7. Server rooms moved to a horizontal row with inline label. Overall vertical space reduced.
  2. Zone data retention — Added a zoneDataMap (keyed by "{floor}-{zone}") that stashes locations and frames when you switch floor or zone. When you switch back, your previous data is restored. The map is persisted to Firestore.
  3. Firestore undefined error — Slots with empty labels were saving label: undefined, which Firestore rejects. Fixed slot creation to omit the label field when empty, and added a stripUndefined() sanitizer on all save payloads as a safety net.


● Everything looks good. Here's what changed:

  Multi-zone architecture:
  - zone (single) replaced with zones[] array + activeZoneIndex                                                                                                                                                                                                                     - Zone tabs above ConfigPanel let you switch between zones, add new ones (+ Zone), or remove the active one
  - Each zone keeps its own floor, zone letter, server room count, and locations independently
  - All zones' port labels are combined into allLabels and distributed across the shared frames
  - maxServerRooms is derived from the max across all zones for the frame "add room" buttons
  - Backward compatible: migrates old single-zone data.zone to [data.zone]
  - Firestore now saves zones array instead of single zone

  ConfigPanel height fix:
  - Switched to 4-column grid (grid-cols-4) with all elements at h-7
  - Generate button uses native <button> with matching h-7 instead of the unsized <Button> component
  - Server rooms row is now a compact horizontal line with inline label
  - Overall vertical space reduced

  Other fixes from earlier:
  - Firestore undefined error fixed (slot labels, stripUndefined sanitizer)
  - generateRacks and FrameToolbar now take serverRoomCount: number instead of a full zone object
  - exportToExcel takes zones[] array, builds combined filename


● You're right, I overcomplicated this. The model should be:

  - One floor, one set of frames/server rooms — those are shared
  - Multiple zones each with their own locations, all feeding into the same frames
  - Switching zone in the config panel just switches which zone's locations you're editing
  - The floor and server room count are global, not per-zone

  Let me simplify. Instead of ZoneConfig holding everything, I'll separate the global settings (floor, serverRoomCount) from the per-zone location lists.

● OK so generatePortLabels takes a ZoneConfig with floor, zone letter, and locations. The engine is already fine — it uses zone.floor and zone.zone to build labels. I just need the data model in Frames.svelte to be:

  - Global: floor, serverRoomCount
  - Per-zone: zone letter + locations[]
  - When switching zone, just change which zone's locations are shown in the sidebar
  - Labels are generated from ALL zones combined (each zone knows the shared floor)

  Let me rewrite Frames.svelte to this simpler model, keeping ZoneConfig as-is for the engine (each zone passed to generatePortLabels will have the shared floor + its own zone letter and locations).

● OK here's my plan. I'll restructure ConfigPanel so:
  - Floor and Server Rooms are global (passed separately, callbacks go to parent)
  - Zone selector switches which zone's locations are being edited — this is a tab row, not a dropdown
  - Locations count + Generate applies to the active zone
  And in Frames.svelte:
  - Store floor, serverRoomCount as top-level state
  - Store zoneLocations: Record<string, LocationConfig[]> — keyed by zone letter
  - Store activeZoneLetter
  - Build ZoneConfig objects on the fly for the engine from floor + zone letter + locations
  - Generate labels from all zones that have locations


  Here's what changed:
  Data model — Floor and server room count are now global (shared across all zones). Per-zone data is just a zoneLocations: Record<string, LocationConfig[]> map keyed by zone letter.

  - Switching zone in the config panel just swaps which zone's location list you're editing in the sidebar
  - All zones' ports are combined into the frames — changing zone doesn't touch other zones' data
  - Generate only affects the active zone's locations
  - The frame drawing always shows ports from all zones together

  ConfigPanel — Now takes flat props (floor, serverRoomCount, activeZone, zoneLetters, locations) with individual callbacks instead of a single ZoneConfig object. Zone selector is a row of tab buttons.

  Migration — Handles old single-zone (data.zone) and the intermediate multi-zone array (data.zones) formats, converting to the new flat zoneLocations map.

● Clean. Fixed:
  - Zone is a select box again (A-Z dropdown)
  - Row 1: Floor input + Server Rooms buttons
  - Row 2: Zone select + Locations input + Generate button
  - Switching zone just changes which zone's locations you're editing — other zones' data is preserved and all zones' ports remain in the frames

  Two fixes done:
  1. Checkbox moved — "All zones" checkbox now sits to the right of the location count in the LocationList header row (using a slot).
  2. Selection highlight bug fixed — Selection keys are now "zone-locNum" strings (e.g., "C-3") instead of just the location number. Clicking port C.003 in the frame only highlights that specific zone C location, not D.003 or E.003. The PortLabel type now includes a zone
  field, and the selection key flows through PortCell, PanelStrip, LocationList, and LocationRow.

  - Column titles (RU, H, Type/Label) now show permanently whenever there are slots or the add form is open, not just when adding
  - Edit button (pencil icon) on each slot — clicking it populates the form with the slot's values inline, replacing that slot row. The button label changes to "Save" and the "+ Add slot" becomes "Cancel"
  - Add form appears at the bottom of the list (for new slots) or inline (when editing an existing slot)
  - Removed cable-mgmt-2u, kept just cable-mgmt since height is user-specified

  ● Now multi-U slots in the Excel export render one row per RU (each showing its RU number in column A, top-down), with the type/label merged across all rows in columns B-Z.