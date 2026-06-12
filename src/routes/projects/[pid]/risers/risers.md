# Riser Tool — Implementation Plan

## Purpose

A schematic **building-elevation** view (sideways slice through the building) that lets a designer:

1. Pick a floor range (from / to) and auto-generate a stacked elevation showing each floor's slab, raised-floor, ceiling, and plenum void.
2. Drop **Server Rooms** and **EPS Rooms** onto each floor at chosen horizontal positions.
3. Draw **vertical ladders** (cable risers) that connect vertically-aligned rooms through the plenum/slab.
4. Add **cables** (e.g. `OM4 48-core`, `CAT6A 24-port`) and route them as a sequence of *(room → level → ladder → level → room)* segments — so a cable can leave a room at high or low level, travel horizontally to a ladder, go up or down through a series of EPS rooms, and arrive at the destination room at either high or low level.

The tool is **building-wide** (not per-floor) — it spans the whole vertical slice and reuses the project's existing floor list, server-room metadata, and structural reference levels.

---

## Routing & File Structure

```
src/routes/projects/[pid]/risers/
├── +page.svelte           # Route entry — subscribes to Firestore, resolves drawingId
├── Risers.svelte          # Orchestrator: toolbar + sidebar + canvas
├── risers.md              # This file
└── parts/
    ├── types.ts           # All TypeScript interfaces
    ├── engine.ts          # Pure helpers: floor geometry, route validation, label gen
    ├── Canvas.svelte      # Pan/zoom SVG canvas — the elevation drawing
    ├── FloorBand.svelte   # One floor row: slab, raised floor, ceiling, plenum
    ├── RoomBox.svelte     # A server-room or EPS-room rectangle on a floor
    ├── Ladder.svelte      # Vertical riser passing through floors
    ├── CablePath.svelte   # Renders the polyline for one cable's route
    ├── RoomPalette.svelte # Drag-from list: server room / EPS room
    ├── CableList.svelte   # Sidebar list of cables with type + route summary
    ├── CableEditor.svelte # Form: cable type, segment-by-segment route builder
    ├── PropertiesPanel.svelte # Selected room / ladder / cable properties
    ├── RiserToolbar.svelte # Floor range, zoom, export, add ladder/cable buttons
    └── SettingsDialog.svelte  # Per-floor heights, default plenum/raised-floor sizes
```

Mirrors the frames / racks tools — `+page.svelte` subscribes, `Risers.svelte` owns state, `parts/` holds presentation + pure logic.

---

## Data Model

### Firestore — `risers/{projectId}`

**One document per project** (the riser is a building-wide view; floors come from the project doc).

```ts
interface RiserDocData {
  projectId: string
  /** Floor heights — keyed by floor number. Defaults applied when absent. */
  floorHeights: Record<number, FloorHeights>
  /** Visible range — what the canvas renders. Subset of project.floors. */
  fromFloor: number
  toFloor: number
  rooms: RiserRoom[]      // server + EPS rooms placed on the elevation
  ladders: Ladder[]       // vertical risers
  cables: Cable[]         // routed cables
  settings: RiserSettings
}

interface FloorHeights {
  /** Structural slab thickness (mm). Default 200. */
  slabMm: number
  /** Raised floor height above slab (mm). Default 300. Set 0 for none. */
  raisedFloorMm: number
  /** Clear ceiling height above raised floor (mm). Default 2600. */
  clearHeightMm: number
  /** Plenum void above ceiling, below next slab (mm). Default 700. */
  plenumMm: number
}

interface RiserSettings {
  /** Horizontal scale — mm of building per pixel at zoom 1. */
  mmPerPx: number
  /** Building width drawn (mm). Default 30_000. */
  widthMm: number
  showGrid: boolean
  /** Default heights applied to floors with no explicit entry. */
  defaultFloorHeights: FloorHeights
}

interface RiserRoom {
  id: string
  kind: 'server' | 'eps'
  floor: number
  /** Horizontal centre of the room on the elevation (mm). */
  xMm: number
  widthMm: number          // default 1200 (server) / 800 (eps)
  /** Optional link back to a racks-tool room key (A/B/C/D) so room name + content can be looked up. */
  serverRoomKey?: string
  label: string            // e.g. "SER11" or "EPS-A"
  color?: string
}

interface Ladder {
  id: string
  label: string                // e.g. "RISER-1"
  xMm: number                  // horizontal position (mm) — shared across floors
  /** Vertical span of the ladder. */
  fromFloor: number
  toFloor: number
  /** Side of the slab the ladder pierces (where it routes within the floor void).
   *  'high' = penetrates ceiling/plenum, 'low' = penetrates raised-floor, 'both' = full-height shaft. */
  level: 'high' | 'low' | 'both'
  widthMm?: number             // visual width, default 150
  color?: string
}

/** A single hop of a route. */
interface CableSegment {
  /** The room the cable enters or exits at this hop. */
  roomId: string
  /** Level the cable runs at *leaving* this room (i.e. into the next hop).
   *  Ignored on the final segment. */
  level?: 'high' | 'low'
  /** Ladder used to travel to the next room (omit on the final segment). */
  ladderId?: string
}

interface Cable {
  id: string
  label?: string                 // optional human label
  /** Free-form cable spec, e.g. "OM4 48-core" or "CAT6A 24-port". */
  type: string
  /** Optional structured fields (parsed from `type` or set by the user). */
  media?: 'copper' | 'fiber'
  mediaSpec?: string             // e.g. "OM4", "CAT6A"
  count?: number                 // 48, 24, etc.
  countUnit?: 'core' | 'port' | 'pair'
  /** Ordered list of hops. First segment = source room, last = destination room. */
  segments: CableSegment[]
  color?: string
  notes?: string
}
```

### Why a single doc per project (not per floor)

The riser **spans floors by definition** — ladders and cables cross floor boundaries, so partitioning by floor would force every write to touch multiple docs and complicate routing. The doc stays modest in size (rooms + ladders + cables are all small) so a single subscription is fine.

### Reuse from existing collections

- `projects/{pid}.floors` is the source-of-truth floor list — Riser tool reads it and offers a from/to range subset. It **does not** mutate the floor list (that's the FloorManager's job).
- `racks/{pid}_F{ff}_R{rm}` already knows server-room names per floor. When the user adds a server-room box, we let them pick from the existing rack-tool rooms (`serverRoomKey`) so labels stay in sync.
- `frames/{pid}_F{ff}.floorFormat` provides the label format (`L01`, `01F`, `01`) — reuse via `fmtFloor()` in `$lib/utils/floor.ts`.

---

## Coordinate System

- **Y axis (vertical)** — building elevation. Y=0 is the top of the slab of the lowest visible floor. Positive Y grows **downward** in SVG, but we flip for display so higher floor numbers are higher on screen. Each floor's Y extent is the sum of its `FloorHeights` fields.
- **X axis (horizontal)** — building width in mm; X=0 is the left edge. Building width comes from `settings.widthMm`.
- Both axes converted to pixels via `settings.mmPerPx` × `view.zoom`.

`engine.ts` exposes:

```ts
floorYExtent(fl: number, heights: Record<number, FloorHeights>, range: {from: number, to: number}, settings): {
  slabTop: number,        // top of structural slab (mm)
  raisedFloorTop: number, // walking surface
  ceilingBottom: number,
  plenumTop: number,
}
totalBuildingHeightMm(range, heights, settings): number
```

---

## Canvas & Interaction

Same pan/zoom pattern documented in `CLAUDE.md`:

- CSS `transform: translate(Xpx, Ypx) scale(Z)` with `transform-origin: 0 0` on the SVG layer.
- Right/middle-click drag = pan; ctrl/alt/meta + wheel = zoom; right + wheel = zoom.
- Wheel listener attached `{ passive: false }`.
- `tick()` for DOM-timing after state changes.

### Tools / modes

A small mode bar at the top-left of the canvas (similar to frames/racks):

| Mode | Action |
|---|---|
| Select | Click to select rooms, ladders, cables. Shift/Ctrl multi-select. |
| Add Server Room | Click on a floor to drop a room at click X. |
| Add EPS Room | Same, but EPS kind. |
| Add Ladder | Click + drag vertically to span floors at a given X. Snaps to nearby rooms. |
| Add Cable | Sequentially click rooms / ladders to build a route. ESC commits or cancels. |

Selection is shared between canvas and sidebar — clicking a `CableList` row highlights its `CablePath`.

### Snapping

- Rooms snap to floor bounds (their Y is derived from `floor`).
- Ladders snap horizontally to the centre X of any vertically-aligned room on the floors they span (so a ladder "lines up" with rooms it serves).
- Cable-route picker only offers ladders whose `fromFloor..toFloor` includes both the entry and exit floors of that hop.

---

## Cable Routing — the core flow

The user describes a cable as: **start-room → (high|low)level → ladder → (high|low)level → … → end-room**.

`CableEditor.svelte` is a vertical list of hops:

```
┌───────────────────────────────┐
│ Type: [OM4 48-core         ▾] │
│                                │
│ 1. From  [SER11 (F01)  ▾]      │
│         Level [● high  ○ low ] │
│         Via   [RISER-1   ▾]    │
│                                │
│ 2. Then  [EPS-A (F03)  ▾]      │
│         Level [○ high  ● low ] │
│         Via   [RISER-2   ▾]    │
│                                │
│ 3. To    [SER31 (F05)  ▾]      │
│         (arrives at low level) │
│                                │
│  [+ Add hop]   [Save] [Cancel] │
└───────────────────────────────┘
```

Each row is one `CableSegment`. The renderer walks segments and emits a polyline:

```
roomCenter(seg.room) →
  horizontal at seg.level Y →
  ladderTopOrBottom(seg.ladder) →
  vertical through ladder →
  horizontal at next-seg.level Y →
  roomCenter(next-seg.room)
```

Y-levels in mm:
- `high` = mid-plenum of the floor
- `low` = mid-raised-floor of the floor (or floor-slab-top if `raisedFloorMm == 0`)

### Lane spacing — avoiding overlapping parallel cables

Two cables that share the same horizontal level on a floor (or the same ladder shaft) must render side-by-side, not on top of each other. The engine assigns each cable hop a **lane index** per shared channel; the renderer offsets the polyline perpendicular to the run direction by `laneIndex × LANE_SPACING_MM` (default 40 mm).

**Channels:**
- **Horizontal**: keyed by `(floor, level)` — every cable run at high-level on floor 5 contends for lanes here. Offset applied to Y.
- **Vertical**: keyed by `ladderId` — every cable threading the same ladder contends here. Offset applied to X (within the ladder's width).

**Assignment algorithm** (interval scheduling):

1. Sort cables deterministically by id.
2. For each cable, walk its non-final hops. Each hop contributes one horizontal interval `[x(room), x(ladder)]` on `(floor, level)` and one vertical interval `[floor_i, floor_{i+1}]` on `ladderId`.
3. For each channel, keep a list of lanes (each lane = a list of non-overlapping intervals already placed). Assign the new interval to the lowest-indexed lane whose intervals don't overlap it; create a new lane if needed.
4. Return `Map<cableId, CableLaneAssignment[]>` keyed by hop index.

Helper lives in `engine.ts` as `computeCableLanes()` (stub in Phase 1; full algorithm in Phase 3).

Edge case: when a cable passes *through* a transit room (EPS), it doesn't consume a horizontal lane in that room itself — only on the floor segments approaching it. The room's vertical extent absorbs the level transition.

### Validation

`engine.ts → validateRoute(cable, ctx)`:

- Adjacent hops must share a ladder whose floor span covers both rooms' floors.
- Each non-terminal room should be an `eps` (a server room is a terminus, not a transit point) — warn (not error) if violated.
- A cable must have ≥ 2 segments.
- Surface warnings inline next to each hop row (red border + tooltip).

---

## Rendering Layers (SVG, bottom → top)

1. **Grid** (optional) — light gridlines every 1 m.
2. **Floor bands** — one `<g>` per floor: slab (dark), raised-floor (hatched), open space (white), ceiling (thin line), plenum (light hatched). Floor label on the left margin via `fmtFloor()`.
3. **Ladders** — vertical rectangles spanning their floor range.
4. **Rooms** — rectangles inside their floor band; server rooms get a server icon, EPS rooms get a "EPS" badge.
5. **Cable paths** — polylines with color per cable, label at midpoint.
6. **Selection overlays** — dashed outline on selected items.
7. **Drag preview** — semi-transparent shape while adding.

---

## Toolbar

`RiserToolbar.svelte`:

- Floor range pickers (from / to) — populated from `project.floors`.
- Zoom in/out/fit.
- Mode buttons (Select / Add Server / Add EPS / Add Ladder / Add Cable).
- Export PDF (defer — Phase 2).
- Settings (opens dialog with per-floor heights).
- Drawing version dropdown (uses existing `findOrCreateDrawing` from `$lib/versioning/service`, same as racks/frames).

---

## Sidebar Layout

Two collapsible panes:

1. **Items** — tabs for `Rooms`, `Ladders`, `Cables`. Lists + add buttons.
2. **Properties** — what's selected on the canvas (room/ladder/cable). Inline editing.

`CableEditor.svelte` opens as a dialog (or expands the properties pane) when a cable is selected or being created.

---

## State & Persistence

- `Risers.svelte` holds top-level `$state()` for `doc`, `selectedIds`, `mode`, `view` (pan/zoom).
- All mutations go through small helpers (`addRoom`, `addLadder`, `updateCable`, …) that:
  1. produce a new `doc` value,
  2. emit a `ChangeDetail[]` for the audit log,
  3. call `onsave(doc, changes)`.
- `+page.svelte` persists via `db.save('risers', { id: pid, ...payload })` and writes `writeLog(pid, 'risers', uid, changes)`.
- Saves are debounced ~300 ms for drag interactions (mirroring racks tool).

---

## Versioning

Use the existing versioning service (same as frames/racks):

```ts
findOrCreateDrawing(db, {
  projectId: pid,
  toolType: 'risers',
  sourceDocId: pid,                    // single doc per project
  title: `Riser Diagram — ${projectName}`,
  uid,
})
```

---

## Project-list Integration

Add to the tool list in [src/routes/projects/[pid]/+page.svelte](src/routes/projects/[pid]/+page.svelte):

```ts
{ detail:1, href: 'risers', icon: 'columns', label: 'Risers',
  description: 'Building elevation with cable risers and inter-floor routing.' },
```

(Choose an icon — `columns`, `arrowUpDown`, or `building` — confirm during implementation; map in `$lib/ui/Icon.svelte` if not already present.)

---

## Phased Build

### Phase 1 — Skeleton & static drawing
- `types.ts`, `engine.ts` (geometry helpers).
- `+page.svelte` + `Risers.svelte` subscribe and render an empty canvas.
- `FloorBand.svelte` draws the slab/raised-floor/ceiling/plenum bands from `floorHeights`.
- Floor-range picker in the toolbar.
- Pan/zoom + grid.

### Phase 2 — Rooms & ladders
- Add/move/delete server rooms and EPS rooms via the palette + drag.
- Ladder add tool with floor-span drag.
- Properties panel for selected items.
- Persistence + change logging.

### Phase 3 — Cables & routing
- `CableEditor.svelte` segment list with room/level/ladder pickers.
- `CablePath.svelte` polyline renderer with mid-segment label.
- `validateRoute()` warnings.
- Cable list in sidebar; click-to-highlight.

### Phase 4 — Polish
- Snapping (rooms-to-floor, ladders-to-rooms).
- Multi-select + bulk delete.
- Settings dialog for per-floor heights.
- Versioning + drawing register entry.
- Export (PDF/SVG) — likely deferred.

---

## Open Questions (resolve before/during Phase 1)

1. **Icon choice** — `columns`, `arrowUpDown`, or new SVG. (Pick during impl.)
2. **EPS room ↔ racks-tool coupling** — EPS rooms are currently *not* tracked in the racks tool. Do we add an `eps` flag to rack-tool rooms, or keep EPS purely a Riser-tool concept? *Recommend: Riser-tool-only for now; revisit if EPS appears in other tools.*
3. **Multiple ladders sharing the same X** — allowed (e.g. one high-only + one low-only at the same shaft). Visually offset by ~50 mm if duplicates detected.
4. **Cable color defaults** — per-media palette (fiber = yellow/aqua, copper = blue/grey) vs. user-picked. Start with per-cable user color, auto-suggest from media.
5. **Cross-tool navigation** — clicking a server-room box could deep-link to the racks tool for that room (`/projects/{pid}/racks?floor={fl}&room={rm}`). Easy win; add in Phase 2.
