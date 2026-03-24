# Block Assign — Panel-Port-Level Reservation on Patch Frames

## Overview

Allow users to drag-select rectangular blocks of **physical panel ports** across one or more panels (including 48-port high-density panels) and assign them a usage type (AP, desk, PR, etc.). Reservations exist independently of the location engine — ports can be reserved before any locations are generated. Reserved-but-unassigned ports are colored by their reservation type.

Primary use case: "select the left-most 8 ports on panels RU 5–10 and reserve them for WIFI AP outlets."

---

## Current State

- Ports render in a 24-column grid per panel row (`PanelStrip.svelte` → `PortCell.svelte`).
- 48-port panels render as **two rows of 24** within a single RU.
- `PortCell` currently only renders assigned `PortLabel | null` — empty ports are inert gray divs with no interactivity.
- Selection is location-based (`selectedLocations: Set<string>`) — no concept of selecting individual physical port positions.
- The engine (`generateRacks`) fills panel ports sequentially with location-derived labels; empty ports are `null`.

---

## Key Design Decisions

### 1. Port-level, not location-level

Block assign operates on **physical port positions** identified by `(frameId, ru, row, col)`:
- `frameId`: which rack frame
- `ru`: RU number of the panel
- `row`: `'top'` or `'bottom'` (bottom only exists on 48-port panels)
- `col`: 0–23 column index within the row

This is independent of the location/label system. A reservation says "this physical port slot is earmarked for AP usage" regardless of whether a location label has been assigned to it yet.

### 2. Reservations live alongside (not inside) locations

Reservations are a separate data structure, not embedded in `LocationConfig`. This keeps concerns clean:
- **Locations** = logical outlet points on the floor (how many ports, which zone, which room)
- **Reservations** = physical panel port pre-assignments (this slot on this panel is for AP)

When the engine fills ports, it can respect reservations by matching location types to reserved slots. But even without that, the drawing shows reservations as colored backgrounds on empty ports.

### 3. Unassigned reserved ports show the reservation color

Currently empty ports (`port === null`) render as inert gray divs. With block assign, empty ports that have a reservation show the reservation type's color from `LOC_TYPE_COLORS` (e.g., green tint for AP). This gives an immediate visual map of what's planned for each panel.

---

## Data Model

### New type: `PortReservation`

```ts
/** A single port position on a physical panel */
interface PortPosition {
  frameId: string
  ru: number
  row: 'top' | 'bottom'  // 'bottom' only for 48-port panels
  col: number             // 0–23
}

/** A block reservation: a set of port positions sharing a usage type */
interface PortReservation {
  id: string              // unique ID (nanoid)
  type: LocType           // 'AP', 'desk', 'PR', etc.
  ports: PortPosition[]   // the reserved port positions
  label?: string          // optional user note ("WiFi APs for west wing")
}
```

### Storage

Reservations are stored in the Frames Firestore doc (`frames/{pid}`) alongside existing data:

```ts
// Inside the frames document, keyed by floor
{
  zoneLocations: { ... },
  rooms: [ ... ],
  // NEW
  portReservations: PortReservation[]
}
```

This is saved/loaded through the existing `onsave` flow. The `portReservations` array is included in the auto-save payload and change tracking.

### Lookup map (derived, not stored)

For fast rendering, derive a lookup map from the reservations array:

```ts
// key = "frameId:ru:row:col"
let reservationMap = $derived<Map<string, LocType>>(
  new Map(
    (portReservations ?? []).flatMap(r =>
      r.ports.map(p => [`${p.frameId}:${p.ru}:${p.row}:${p.col}`, r.type])
    )
  )
)
```

---

## Implementation Plan

### Step 1 — Data attributes on every port cell (including empty)

**Files:** `PortCell.svelte`, `PanelStrip.svelte`

Currently empty ports (`port === null`) are non-interactive `<div>`. Change them to carry position data so they can be drag-selected:

**PanelStrip.svelte** — pass position metadata to each PortCell:
```svelte
{#each panel.topRow as port, col (col)}
  <PortCell {port} {col} row="top" ru={panel.ru} frameId={frameId}
    reservation={reservationMap?.get(`${frameId}:${panel.ru}:top:${col}`)}
    selected={...} {onselect} />
{/each}
```

**PortCell.svelte** — add `data-port` attribute on both filled and empty cells:
```svelte
<!-- data-port="frameId:ru:row:col" on every cell -->
<button data-port="{frameId}:{ru}:{row}:{col}" ...>
```

Empty ports with a reservation render with the reservation type's color instead of plain gray:
```svelte
{:else}
  <div
    data-port="{frameId}:{ru}:{row}:{col}"
    class="w-full h-7 rounded-sm border {reservation ? LOC_TYPE_COLORS[reservation] : 'bg-gray-100 border-gray-200/50'}"
  />
{/if}
```

### Step 2 — Rectangle drag-select on FrameDrawing

**File:** `parts/FrameDrawing.svelte`

Add pointer-event-driven rubber-band selection:

- **State:** `dragStart`, `dragEnd`, `isDragging`
- **`pointerdown`** (left button): record start position relative to frame container, set `isDragging`.
- **`pointermove`**: update `dragEnd`, render semi-transparent blue rectangle overlay.
- **`pointerup`**: compute bounding rect, query all `[data-port]` elements whose bounding rects intersect, collect their `data-port` values, fire `onblockselect(portKeys: string[])`.
- **Minimum drag distance:** 4px before activating (to distinguish from single-click).
- **Cursor:** `crosshair` over the panel area.

Intersection logic:
```ts
function getIntersectingPortKeys(container: HTMLElement, rect: DOMRect): string[] {
  const keys: string[] = []
  for (const el of container.querySelectorAll('[data-port]')) {
    const r = el.getBoundingClientRect()
    if (r.right > rect.left && r.left < rect.right &&
        r.bottom > rect.top && r.top < rect.bottom) {
      keys.push(el.getAttribute('data-port')!)
    }
  }
  return keys
}
```

**Selection overlay component** (`SelectionRect.svelte`):
```svelte
<div
  class="absolute border-2 border-blue-400 bg-blue-400/10 pointer-events-none z-50 rounded-sm"
  style:left="{x}px" style:top="{y}px" style:width="{width}px" style:height="{height}px"
/>
```

### Step 3 — Port selection state in Frames.svelte

**File:** `Frames.svelte`

Add a **separate** selection set for port positions (coexists with existing `selectedLocations`):

```ts
let selectedPorts = $state<Set<string>>(new Set())  // "frameId:ru:row:col" keys
let portReservations = $state<PortReservation[]>(data?.portReservations ?? [])
```

Handler for block select:
```ts
function blockSelectPorts(portKeys: string[], event: PointerEvent) {
  if (event.shiftKey) {
    selectedPorts = new Set([...selectedPorts, ...portKeys])
  } else if (event.ctrlKey || event.metaKey) {
    const next = new Set(selectedPorts)
    for (const k of portKeys) next.has(k) ? next.delete(k) : next.add(k)
    selectedPorts = next
  } else {
    selectedPorts = new Set(portKeys)
  }
}
```

Include `portReservations` in the auto-save payload:
```ts
onsave({ floor, zoneLocations, rooms, customLocationTypes, excelGroupByRoom, floorFormat, portReservations }, changesToLog)
```

### Step 4 — Block Assign toolbar

**File:** new `parts/BlockAssignBar.svelte`

Appears when `selectedPorts.size > 0`. Positioned above the frame drawing (sticky).

```
┌──────────────────────────────────────────────────────────────┐
│ 48 ports selected                                            │
│ Assign: [AP] [desk] [PR] [RS] [FR] [WC] [TV] [LK] [custom] │
│ [Clear]  [Remove reservation]                                │
└──────────────────────────────────────────────────────────────┘
```

- **Type buttons:** Each creates (or updates) a `PortReservation` for the selected ports.
- **Remove reservation:** Deletes any reservations covering the selected ports.
- **Clear:** Deselects ports without changing reservations.

Assign logic:
```ts
function assignReservation(type: LocType) {
  const positions: PortPosition[] = [...selectedPorts].map(key => {
    const [frameId, ru, row, col] = key.split(':')
    return { frameId, ru: Number(ru), row: row as 'top' | 'bottom', col: Number(col) }
  })

  // Remove these ports from any existing reservations
  let updated = portReservations.map(r => ({
    ...r,
    ports: r.ports.filter(p => !selectedPorts.has(`${p.frameId}:${p.ru}:${p.row}:${p.col}`))
  })).filter(r => r.ports.length > 0)

  // Add new reservation
  updated.push({ id: nanoid(), type, ports: positions })
  portReservations = updated
  selectedPorts = new Set()
}
```

### Step 5 — Visual rendering of reservations and selection

**Files:** `PortCell.svelte`, `PanelStrip.svelte`

Port states and their visual treatment:

| State | Appearance |
|-------|------------|
| Empty, no reservation | Gray (`bg-gray-100`) — unchanged |
| Empty, reserved | Reservation type color from `LOC_TYPE_COLORS` (e.g., green tint for AP), dashed border |
| Assigned (has PortLabel), no reservation | Current behavior — colored by `locationType` |
| Assigned + reservation matches | Current behavior (reservation is fulfilled) |
| Assigned + reservation differs | Current color, small warning dot (reservation mismatch) |
| Selected (in drag rect) | `ring-2 ring-blue-400` overlay on any of the above |

For reserved empty ports, show a small type abbreviation in the cell:
```svelte
{:else}
  <div
    data-port="{frameId}:{ru}:{row}:{col}"
    class="w-full h-7 rounded-sm border flex items-center justify-center
      {reservation
        ? LOC_TYPE_COLORS[reservation] + ' border-dashed'
        : 'bg-gray-100 border-gray-200/50'}"
    class:ring-2={portSelected}
    class:ring-blue-400={portSelected}
  >
    {#if reservation}
      <span class="font-mono text-[7px] opacity-60">{reservation}</span>
    {/if}
  </div>
{/if}
```

### Step 6 — Keyboard shortcuts

**File:** `Frames.svelte`

When `selectedPorts.size > 0`, listen for keydown:

| Key | Action |
|-----|--------|
| `Escape` | Clear port selection |
| `a` | Assign AP |
| `d` | Assign desk |
| `p` | Assign PR |
| `Delete` / `Backspace` | Remove reservation from selected ports |

Guard: only active when focus is not in an input/select element.

### Step 7 — Change tracking

**File:** `Frames.svelte` (in `computeChanges`)

Add diff for `portReservations`:
```ts
if (JSON.stringify(prev.portReservations) !== JSON.stringify(next.portReservations)) {
  const prevCount = (prev.portReservations ?? []).reduce((s, r) => s + r.ports.length, 0)
  const nextCount = (next.portReservations ?? []).reduce((s, r) => s + r.ports.length, 0)
  changes.push({ action: 'update', field: 'portReservations', from: prevCount, to: nextCount })
}
```

---

## 48-Port Panel Handling

48-port panels have two rows of 24 within a single RU. The `row` field in `PortPosition` (`'top'` | `'bottom'`) distinguishes them:

- A rectangle drag across a 48-port panel naturally captures ports in both rows if the rect spans vertically.
- A narrow horizontal drag selects only one row.
- The `data-port` attribute encodes the row, so intersection detection handles this automatically.

Example: dragging across cols 0–7 on RU 5–10 (48-port panels) selects:
```
RU10:top:0, RU10:top:1, ..., RU10:top:7, RU10:bottom:0, ..., RU10:bottom:7,
RU9:top:0,  ..., RU9:bottom:7,
...
RU5:top:0,  ..., RU5:bottom:7
```
= 8 cols × 2 rows × 6 RUs = 96 ports.

For 24-port panels in the same range, there's no bottom row, so only 48 ports are selected.

---

## Engine Integration (Optional Future Enhancement)

The port reservation system is intentionally **decoupled** from the label generation engine. Reservations are a visual planning layer. However, a future enhancement could make the engine respect reservations:

- When filling panels with location-derived labels, prefer placing AP-type locations into AP-reserved slots.
- Flag reserved slots that remain unfilled after engine allocation.
- Flag locations placed into slots with mismatched reservations.

This is not needed for v1 — the immediate value is the visual planning and reservation map.

---

## File Change Summary

| File | Change |
|------|--------|
| `parts/types.ts` | Add `PortPosition`, `PortReservation` types |
| `parts/PortCell.svelte` | Add `data-port` attr to all cells, reservation color for empty ports, port-level selection highlight |
| `parts/PanelStrip.svelte` | Pass position metadata (`frameId`, `ru`, `row`, `col`) + reservation lookup to PortCell |
| `parts/FrameDrawing.svelte` | Pointer event handlers for drag-select, rubber-band overlay, intersection query |
| `parts/SelectionRect.svelte` | **New** — rubber-band rectangle overlay component |
| `parts/BlockAssignBar.svelte` | **New** — floating toolbar for assigning type to selected ports |
| `Frames.svelte` | Add `selectedPorts`, `portReservations` state, `blockSelectPorts()`, `assignReservation()`, keyboard shortcuts, save/load reservations, change tracking |
