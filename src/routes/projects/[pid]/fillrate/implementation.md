# Fill Rate Tool — Implementation Plan

## Overview

Multi-section fill rate calculator. Each project gets a single Firestore doc containing an ordered array of sections. Users add/edit/reorder/delete sections on a printable page. Each section has a label (for floorplan reference), containment type, dimensions, and cable groups.

## Existing Tool Patterns (Reference)

### +page.svelte Pattern
All tools follow the same structure:
- Import `{ page }` from `$app/state`, `{ getContext }` from `svelte`
- Import `{ Firestore, Spinner, Session }` from `$lib`
- Import `{ writeLog }` and `type { ChangeDetail }` from `$lib/logger`
- Create `db = new Firestore()`, `session = getContext('session') as Session`
- Declare state: `data`, `loading`, `projectName`, `floors`
- **Subscription 1:** `db.subscribeOne('projects', pid, ...)` — project name + floors list
- **Subscription 2:** `db.subscribeOne('toolname', docId, ...)` — tool-specific data
- Each subscription returns cleanup: `return () => { unsub?.(); }`
- `save()` function: calls `db.save(collection, { id: docId(), ...payload })`, writes audit log via `writeLog(pid, tool, uid, changes)`
- Template: `{#if loading}<Spinner>` else render main component with `{#key}`

### Doc ID Patterns
- **Frames:** `{pid}_F{floor}` (per-floor, one doc for all rooms)
- **Racks:** `{pid}_F{floor}_R{room}` (per-floor-room)
- **Outlets:** `{pid}_F{floor}` (per-floor)
- **Fillrate:** `{pid}` (single doc per project — sections are lightweight)

### Main Component Pattern (e.g., Racks.svelte, Frames.svelte)
- Props via `$props()`: `data`, `projectId`, `projectName`, `onsave`, floor/room callbacks
- State initialized from `data` with defaults: `let x = $state(data?.x ?? defaultValue)`
- **Sync pause:** `syncPaused` flag prevents remote updates overwriting local edits
- **Remote sync effect:** `$effect` watches `data` and updates local state only when `!syncPaused && saveStatus === 'saved'`
- **Auto-save:** `scheduleSave()` sets `saveStatus='unsaved'`, pauses sync, debounces 500ms → `doSave()`
- **doSave():** builds payload object, calls `onsave?.(payload, pendingChanges)`, clears changes, pauses sync, sets `saveStatus='saved'`
- **logChange():** pushes to `pendingChanges[]` then calls `scheduleSave()`
- **Save status:** displayed as text indicator (`saved`/`saving`/`unsaved`)

### UI Layout Pattern
- `<Titlebar>` at top (from `$lib`)
- `PaneGroup` + `Pane` + `Handle` for resizable sidebar layout (from `$lib/components/ui/resizable`)
- Toolbar with `Button` + `Icon` components
- Status bar at bottom with floor tabs
- Print support: `window.addEventListener('beforeprint/afterprint')`, CSS `print:hidden` classes

### Shared Imports
- `$lib` barrel exports: Button, Dialog, Dropdown, Icon, Input, Row, Select, Spinner, Titlebar, etc.
- `$lib/logger`: `writeLog`, `type ChangeDetail`
- `$lib/utils/floor`: `migrateFloors`, `updateFloors`, `deleteFloor`, `fmtFloor`
- `$lib/types/project`: `type FloorConfig`
- Icons are camelCase names mapped to `@lucide/svelte`

## Firestore Schema

**Collection:** `fillrate` — single doc per project.

**Doc ID:** `{pid}`

```ts
{
  id: string,              // "{pid}"
  sections: Section[],     // ordered array (index = display order)
  nextLabel: number        // auto-increment counter for label generation
}

interface Section {
  id: string               // short unique id
  label: string            // e.g. "FR-001", user-editable
  containmentType: 'rectangular' | 'round'
  diameter: number         // mm (round)
  width: number            // mm (rectangular)
  height: number           // mm (rectangular)
  calcMethod: 'rectangular' | 'circular'
  cables: Cable[]
}

interface Cable {
  id: string
  diameter: number         // mm
  quantity: number
}
```

## File Structure

```
src/routes/projects/[pid]/fillrate/
  +page.svelte              // Firestore subscription, props wiring
  FillRate.svelte           // Main component (section list + toolbar + print layout)
  FillRateSample.svelte     // Keep as reference
  parts/
    Section.svelte          // Single section editor card with canvas
    SectionCanvas.svelte    // Canvas drawing logic (extracted from sample)
    constants.ts            // Types, defaults, color thresholds
```

## Components

### +page.svelte
- Subscribe to `projects/{pid}` and `fillrate/{pid}`
- Pass `data`, `projectId`, `projectName`, `onsave` to `FillRate.svelte`
- `onsave` calls `db.save('fillrate', payload)` + `writeLog()`

### FillRate.svelte
- Props: `data`, `projectId`, `projectName`, `onsave`
- State: `sections[]`, `nextLabel`, `selectedId`, `saveStatus`
- Toolbar: Add Section, Delete, Move Up/Down, Print
- Layout: sidebar list + main print-ready grid of sections
- Auto-save: debounced 500ms, same pattern as racks/frames

### Section.svelte
- Props: section data + `onchange` callback
- Containment type toggle, dimension inputs, cable table, fill rate display
- Inline canvas via SectionCanvas

### SectionCanvas.svelte
- Props: containment params + cables + fillRate
- `$effect` redraws canvas when props change
- Cable packing algorithm from FillRateSample.svelte

## Implementation Order

1. `parts/constants.ts` — types, defaults, thresholds
2. `parts/SectionCanvas.svelte` — extract drawing code
3. `parts/Section.svelte` — editor card
4. `FillRate.svelte` — main component
5. `+page.svelte` — Firestore wiring
6. Print CSS
