# Rack View Modes — Implementation Plan

## Current State

- Single front elevation view rendered by `RackElevations.svelte` inside a pan/zoom `Canvas`
- `DeviceConfig.mounting` field exists (`front | rear | both | none`) — already editable in DeviceProperties
- `rackOverlaps` already tracks front/rear rail occupancy separately
- `RackFrame.svelte` draws rack structure as SVG; `DeviceView.svelte` renders each device
- Devices positioned via `deviceScreenRect()` in RackElevations — no view-mode awareness yet

## Recommended Approach: Option A — Stacked Views

Show front and rear as separate labeled elevation strips in the **same canvas**, one above the other. The user pans/zooms both together. This is the standard approach in rack elevation tools (Visio templates, RackTables, NetBox) and avoids mode-switching friction.

### Why not B or C?

- **B (single view toggle):** Users constantly need to cross-reference front and rear when planning — toggling back and forth is slow and error-prone. Poor for printing too.
- **C (floating viewports):** Overkill for 2-4 views. Managing overlapping panels adds UX complexity with no real benefit. Better suited for CAD tools, not a web-based rack planner.

### Layout

```
┌─────────────────────────────────────────────────┐
│  FRONT ELEVATION          [A101] [A102] [A103]  │
│  ┌──────┐ ┌──────┐ ┌──────┐                    │
│  │ 42U  │ │ 42U  │ │ 42U  │    ← full opacity  │
│  │      │ │      │ │      │      rear devices   │
│  │      │ │      │ │      │      shown at 0.5   │
│  └──────┘ └──────┘ └──────┘                    │
│                                                 │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  │
│                                                 │
│  REAR ELEVATION           [A103] [A102] [A101]  │
│  ┌──────┐ ┌──────┐ ┌──────┐                    │
│  │ 42U  │ │ 42U  │ │ 42U  │    ← full opacity  │
│  │      │ │      │ │      │      front devices  │
│  │      │ │      │ │      │      shown at 0.5   │
│  └──────┘ └──────┘ └──────┘                    │
└─────────────────────────────────────────────────┘
```

- **Rear row mirrors rack order** (right-to-left) — as you'd see walking around to the back.
- Gap between front and rear rows: ~200mm logical (100px at default scale).
- Each section has a label (`FRONT ELEVATION` / `REAR ELEVATION`) rendered in the canvas.
- Plan and side views can be added below/beside later using the same pattern.

### Device Opacity Rules

| Device mounting | Front view | Rear view |
|----------------|------------|-----------|
| `front`        | 1.0        | 0.5       |
| `rear`         | 0.5        | 1.0       |
| `both`         | 1.0        | 1.0       |
| `none`         | 1.0        | 1.0       |

Faded devices are also non-interactive (pointer-events: none) — you can't accidentally select or drag a rear device from the front view.

## Implementation Steps

### 1. Add view elevation type and toggle state

**`types.ts`** — Add type:
```ts
export type ElevationFace = 'front' | 'rear'
```

**`Racks.svelte`** — Add state:
```ts
let showRear = $state(true)  // toggle rear elevation visibility
```

Add a toggle button to the toolbar/room-selector bar (next to zoom info or floor tabs).

### 2. Compute rear rack positions in `Racks.svelte`

Derive a second `rearRacks` array from `activeRacks` with:
- **Reversed order** (last rack first) to mirror the view
- **Offset `_z`** pushed below the front row (e.g. `_z = floorLevel - rearGap - maxRackHeight`)
- Same `_x` recomputed from reversed order

```ts
const REAR_GAP_MM = 200

let rearRacks = $derived(
  showRear
    ? [...activeRacks]
        .reverse()
        .map((rack, idx, arr) => {
          let x = 0
          for (let i = 0; i < idx; i++) x += arr[i].widthMm + RACK_GAP_PX / SCALE
          const z = settings.floorLevel - REAR_GAP_MM - rack.heightMm
          return { ...rack, _x: x, _z: z, _face: 'rear' as const }
        })
    : []
)
```

### 3. Update `RackElevations.svelte`

Add a new prop `face: ElevationFace` (default `'front'`), or render both sections internally:

**Option: Render both in one component** (simpler, keeps shared floor/ceiling lines):
- Accept `rearRacks` as an additional prop
- Render front racks section with "FRONT ELEVATION" label
- Render rear racks section with "REAR ELEVATION" label, mirrored order
- Rear section gets its own floor/ceiling lines offset to match `_z`

**For each section**, pass the face to device rendering so opacity can be applied.

### 4. Update `DeviceView.svelte`

Add prop:
```ts
face?: ElevationFace  // which elevation this device is being rendered in
```

Compute opacity:
```ts
let opacity = $derived(() => {
  const m = device.mounting ?? 'both'
  if (m === 'both') return 1
  if (m === 'none') return 0.5
  if (face === 'front') return m === 'front' ? 1 : 0.5
  return m === 'rear' ? 1 : 0.5  // face === 'rear'
})
```

Apply to the wrapper div: `style:opacity={opacity}`. When faded, also add `pointer-events: none` to prevent interaction.

### 5. Update `RackFrame.svelte` for rear view

- Rear frames render identically (same RU numbering — U1 at bottom is universal)
- Add a subtle visual indicator: e.g. a small "REAR" badge or different rail color.
- Add a bold FRONT or REAR label above the rack

### 6. Device interaction scoping

- **Dragging:** Only allow drag on devices with full opacity in their view section. Faded devices ignore pointer events.
- **Selection:** Clicking a faded device does nothing. The user must interact with it in the correct view.
- **Drag-and-drop from palette:** Determine which section (front/rear) the drop lands in based on Y coordinate. Set `mounting` accordingly on new devices:
  - Drop in front section → `mounting: 'front'`
  - Drop in rear section → `mounting: 'rear'`
  - Existing behavior (single view) → `mounting: 'both'` (unchanged default)

### 7. Print support

The existing print CSS forces A3 landscape. With two elevation rows, the layout should still fit. If it doesn't:
- Front and rear could print on separate pages
- Or scale down slightly to fit both

## Future: Plan & Side Views

This stacked approach extends naturally:

- **Plan view** (top-down): Render as a separate strip below rear, showing rack depth, aisle spacing, and device depth (`depthMm`). Uses the same `_x` positions but draws `widthMm x depthMm` rectangles instead of `widthMm x heightMm`.
- **Side view**: Single rack cross-section showing front/rear rail positions and device depths. Rendered to the right of the selected rack, or as a floating panel.

Both can be toggled independently with the same pattern (`showPlan`, `showSide` state flags).

## File Changes Summary

| File | Change |
|------|--------|
| `types.ts` | Add `ElevationFace` type |
| `Racks.svelte` | Add `showRear` state, compute `rearRacks`, pass to RackElevations, update drop handling |
| `RackElevations.svelte` | Accept `rearRacks` prop, render second rack row with section labels |
| `DeviceView.svelte` | Add `face` prop, compute/apply opacity, conditionally disable pointer events |
| `RackFrame.svelte` | Add `face` prop for optional rear badge/indicator |
| `RoomSelector.svelte` or toolbar | Add front/rear toggle button |
