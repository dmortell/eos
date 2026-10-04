# EOS Application Refactoring & Improvement Plan

## Executive Summary

This document outlines systematic improvements to make the EOS codebase more maintainable, consistent, and easier for LLMs to understand. The current architecture is sound, but several patterns are repeated across tools, leading to duplication and increased complexity.

**Primary Goals:**
1. Reduce file sizes and complexity (target: <400 lines per component)
2. Minimize prop drilling with enhanced context usage
3. Extract shared patterns into reusable utilities and components
4. Improve UI/UX consistency across all tools
5. Establish clear architectural boundaries

---

## 1. Context Architecture Enhancement

### Problem
Long parameter lists in main components (15-20+ props), making component signatures hard to understand and maintain.

**Example:**
```typescript
// Outlets.svelte - 20+ parameters
let { data, files, floors, frameData, racksData, floor, projectId, projectName,
      onsave, onfloorchange, onupdatefloors, ondeletefloor, onsaverack } = $props()
```

### Solution: Hierarchical Context System

Create specialized context providers that group related data:

#### 1.1 Create `src/lib/contexts/ProjectContext.svelte.ts`
```typescript
import { getContext, setContext } from 'svelte'

export class ProjectContext {
  projectId = $state<string>('')
  projectName = $state<string>('')
  floor = $state<number>(1)
  floors = $state<FloorConfig[]>([])

  constructor(initial?: Partial<ProjectContext>) {
    if (initial) Object.assign(this, initial)
  }
}

export function setProjectContext(ctx: ProjectContext) {
  setContext('project', ctx)
}

export function getProjectContext(): ProjectContext {
  return getContext('project')
}
```

#### 1.2 Create `src/lib/contexts/DataContext.svelte.ts`
```typescript
export class DataContext {
  loading = $state(false)
  error = $state<string | null>(null)
  saveStatus = $state<'saved' | 'saving' | 'unsaved'>('saved')

  // Tool-specific data as generic
  data = $state<any>(null)
}
```

#### 1.3 Create `src/lib/contexts/ViewContext.svelte.ts`
```typescript
export class ViewContext {
  // Common view state
  selectedIds = $state<Set<string>>(new Set())
  activeTool = $state<string>('select')
  zoom = $state(1)
  pan = $state({ x: 0, y: 0 })
}
```

#### 1.4 Update Tool Entry Points

**Before:**
```svelte
<!-- outlets/Outlets.svelte -->
<script>
  let { data, files, floors, frameData, racksData, floor, projectId,
        projectName, onsave, onfloorchange, ... } = $props()
</script>
```

**After:**
```svelte
<!-- outlets/Outlets.svelte -->
<script>
  import { getProjectContext, getDataContext } from '$lib/contexts'

  let project = getProjectContext()
  let dataCtx = getDataContext()
  let { onsave } = $props() // Only callbacks remain as props
</script>
```

**Impact:** Reduces prop count from 15-20 to 1-3 per component.

---

## 2. Shared Components Library

### Problem
UI patterns repeated across tools: floor tabs, save status, toolbars, status bars, search/filter panels.

### Solution: Extract Common UI Components

#### 2.1 Create `src/lib/components/app/` Directory

Extract these reusable components:

**`FloorTabs.svelte`**
```svelte
<script lang="ts">
  import { getProjectContext } from '$lib/contexts'
  let project = getProjectContext()
  let { onfloorchange, onmanagefloors } = $props<{
    onfloorchange?: (floor: number) => void
    onmanagefloors?: () => void
  }>()
</script>

<div class="flex items-center gap-0 overflow-x-auto">
  {#each project.floors as fl}
    <button
      class="px-3 py-1 text-xs border-r {project.floor === fl.number ? 'bg-blue-50' : ''}"
      onclick={() => onfloorchange?.(fl.number)}
    >
      {fl.label || `Floor ${fl.number}`}
    </button>
  {/each}
  {#if onmanagefloors}
    <button class="px-2 py-1" onclick={onmanagefloors}>
      <Icon name="settings" size={14} />
    </button>
  {/if}
</div>
```

**`SaveStatus.svelte`**
```svelte
<script lang="ts">
  import { getDataContext } from '$lib/contexts'
  let data = getDataContext()
</script>

<div class="text-xs text-gray-500">
  {#if data.saveStatus === 'saved'}
    <Icon name="check" size={12} class="text-green-500" /> Saved
  {:else if data.saveStatus === 'saving'}
    <Spinner size={12} /> Saving...
  {:else}
    <Icon name="circle" size={12} class="text-amber-500" /> Unsaved
  {/if}
</div>
```

**`ToolToolbar.svelte`**
```svelte
<!-- Common toolbar with tool buttons, zoom controls, etc. -->
<script lang="ts">
  let { tools, activeTool, zoom, onzoom, ontoolchange } = $props<{
    tools: Array<{ id: string; label: string; icon: string }>
    activeTool: string
    zoom?: number
    onzoom?: (z: number) => void
    ontoolchange: (tool: string) => void
  }>()
</script>

<div class="h-8 flex items-center gap-2 px-2 border-b bg-gray-50">
  <!-- Tool buttons -->
  <div class="flex items-center gap-1">
    {#each tools as tool}
      <button
        class="px-2 py-1 text-xs rounded {activeTool === tool.id ? 'bg-blue-500 text-white' : 'hover:bg-gray-200'}"
        onclick={() => ontoolchange(tool.id)}
      >
        <Icon name={tool.icon} size={14} />
        {tool.label}
      </button>
    {/each}
  </div>

  <!-- Zoom controls (if zoom provided) -->
  {#if zoom !== undefined && onzoom}
    <div class="ml-auto flex items-center gap-1">
      <button onclick={() => onzoom?.(zoom! * 0.9)}>
        <Icon name="zoomOut" size={14} />
      </button>
      <span class="text-xs w-12 text-center">{Math.round(zoom! * 100)}%</span>
      <button onclick={() => onzoom?.(zoom! * 1.1)}>
        <Icon name="zoomIn" size={14} />
      </button>
    </div>
  {/if}
</div>
```

**`SearchFilter.svelte`**
```svelte
<!-- Reusable search + filter dropdown pattern -->
<script lang="ts">
  let { value = $bindable(''), placeholder, filters } = $props<{
    value?: string
    placeholder?: string
    filters?: Array<{ label: string; value: string; checked: boolean }>
  }>()
</script>

<div class="flex items-center gap-2 border rounded px-2 py-1 bg-white">
  <Icon name="search" size={14} class="text-gray-400" />
  <input
    type="text"
    class="flex-1 text-xs outline-none"
    {placeholder}
    bind:value
  />
  {#if filters}
    <Dropdown>
      <Button slot="trigger" variant="ghost" size="sm">
        <Icon name="filter" size={14} />
      </Button>
      <svelte:fragment slot="content">
        {#each filters as filter}
          <label class="flex items-center gap-2 px-2 py-1">
            <input type="checkbox" bind:checked={filter.checked} />
            <span class="text-xs">{filter.label}</span>
          </label>
        {/each}
      </svelte:fragment>
    </Dropdown>
  {/if}
</div>
```

**`LoadingOverlay.svelte`**
```svelte
<script>
  let { loading, message = 'Loading...' } = $props<{
    loading: boolean
    message?: string
  }>()
</script>

{#if loading}
  <div class="absolute inset-0 bg-white/80 flex items-center justify-center z-50">
    <div class="flex flex-col items-center gap-2">
      <Spinner size={32} />
      <div class="text-sm text-gray-600">{message}</div>
    </div>
  </div>
{/if}
```

#### 2.2 Update `src/lib/index.ts`

Add to barrel export:
```typescript
export { default as FloorTabs } from './components/app/FloorTabs.svelte'
export { default as SaveStatus } from './components/app/SaveStatus.svelte'
export { default as ToolToolbar } from './components/app/ToolToolbar.svelte'
export { default as SearchFilter } from './components/app/SearchFilter.svelte'
export { default as LoadingOverlay } from './components/app/LoadingOverlay.svelte'
```

---

## 3. Shared Canvas Utilities

### Problem
Pan/zoom logic duplicated across Outlets, Uploads (PdfViewer), and Racks tools.

### Solution: Extract Canvas Controller

#### 3.1 Create `src/lib/utils/CanvasController.svelte.ts`

```typescript
/** Reusable pan/zoom canvas controller with wheel and drag handlers */
export class CanvasController {
  x = $state(0)
  y = $state(0)
  zoom = $state(1)
  panning = $state(false)
  dragging = $state(false)

  constructor(initial?: { x?: number; y?: number; zoom?: number }) {
    if (initial) {
      this.x = initial.x ?? 0
      this.y = initial.y ?? 0
      this.zoom = initial.zoom ?? 1
    }
  }

  /** Get CSS transform string for canvas wrapper */
  get transform() {
    return `translate(${this.x}px, ${this.y}px) scale(${this.zoom})`
  }

  /** Convert screen coords to canvas coords */
  screenToCanvas(screenX: number, screenY: number, rect: DOMRect) {
    return {
      x: (screenX - rect.left - this.x) / this.zoom,
      y: (screenY - rect.top - this.y) / this.zoom,
    }
  }

  /** Handle wheel event (pan/zoom) */
  handleWheel(e: WheelEvent) {
    e.preventDefault()
    const factor = 1.15

    if (e.ctrlKey || e.metaKey) {
      // Zoom
      const delta = e.deltaY > 0 ? 1 / factor : factor
      this.zoom = Math.max(0.1, Math.min(10, this.zoom * delta))
    } else if (e.shiftKey) {
      // Horizontal pan
      this.x -= e.deltaY
    } else {
      // Vertical pan
      this.y -= e.deltaY
    }
  }

  /** Handle pointer down (start pan) */
  handlePointerDown(e: PointerEvent, button: 'middle' | 'right' = 'right') {
    const targetButton = button === 'middle' ? 1 : 2
    if (e.button === targetButton) {
      e.preventDefault()
      this.panning = true
    }
  }

  /** Handle pointer move (update pan) */
  handlePointerMove(e: PointerEvent) {
    if (this.panning) {
      this.x += e.movementX
      this.y += e.movementY
    }
  }

  /** Handle pointer up (end pan) */
  handlePointerUp() {
    this.panning = false
  }

  /** Persist state to localStorage */
  save(key: string) {
    try {
      localStorage.setItem(key, JSON.stringify({
        x: this.x,
        y: this.y,
        zoom: this.zoom,
      }))
    } catch {}
  }

  /** Restore state from localStorage */
  static load(key: string, defaults = { x: 0, y: 0, zoom: 1 }): CanvasController {
    try {
      const saved = localStorage.getItem(key)
      if (saved) {
        const data = JSON.parse(saved)
        return new CanvasController(data)
      }
    } catch {}
    return new CanvasController(defaults)
  }
}
```

#### 3.2 Usage Example

**Before (OutletCanvas.svelte - 50+ lines of pan/zoom logic):**
```svelte
<script>
  let vx = $state(0), vy = $state(0), zoom = $state(1)
  let panning = $state(false)

  function onWheel(e: WheelEvent) {
    e.preventDefault()
    // ... 30 lines of zoom/pan logic
  }

  function onPointerDown(e: PointerEvent) {
    // ... pan logic
  }
  // ... etc
</script>
```

**After:**
```svelte
<script>
  import { CanvasController } from '$lib/utils'

  let canvas = new CanvasController({ x: 60, y: 40, zoom: 0.5 })

  // Auto-persist to localStorage
  $effect(() => {
    canvas.save(`outlet-canvas-${projectId}-F${floor}`)
  })
</script>

<div
  class="relative overflow-hidden"
  style="transform: {canvas.transform}; transform-origin: 0 0"
  onwheel={e => canvas.handleWheel(e)}
  onpointerdown={e => canvas.handlePointerDown(e)}
  onpointermove={e => canvas.handlePointerMove(e)}
  onpointerup={() => canvas.handlePointerUp()}
>
  <!-- Canvas content -->
</div>
```

**Impact:** Reduces each canvas component by ~50-70 lines.

---

## 4. Firestore Data Management

### Problem
- Subscription patterns repeated in every `+page.svelte`
- Strip/sanitize logic duplicated
- Save patterns with debouncing repeated

### Solution: Enhanced Firestore Wrapper

#### 4.1 Extend `src/lib/db.svelte.ts`

Add helper methods:

```typescript
export class Firestore {
  // ... existing methods

  /**
   * Subscribe to project doc and set project context
   * Returns unsubscribe function
   */
  subscribeToProject(pid: string, projectCtx: ProjectContext) {
    return this.subscribeOne('projects', pid, (data) => {
      if (data?.name) projectCtx.projectName = data.name?.name
      if (data?.floors) projectCtx.floors = data.floors
    })
  }

  /**
   * Subscribe to tool data for a specific floor
   * Pattern: {collection}/{projectId}_F{floor}-R{room}
   */
  subscribeToToolData(collection: string, pid: string, floor: number, room?: string) {
    let docId = `${pid}_F${String(floor).padStart(2, '0')}`
    if (room) docId += `-R${room}`
    return this.subscribeOne(collection, docId, data => data)
  }

  /**
   * Debounced save with change tracking
   * Returns a save function that debounces calls
   */
  createDebouncedSave(
    collection: string,
    docId: string,
    delay = 500
  ): (data: any) => void {
    let timer: ReturnType<typeof setTimeout> | null = null

    return (data: any) => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        this.save(collection, { id: docId, ...data })
      }, delay)
    }
  }
}
```

#### 4.2 Update Tool +page.svelte Files

**Before (outlets/+page.svelte - ~100 lines):**
```svelte
<script>
  let db = new Firestore()
  let outletsData = $state(null)
  let files = $state([])
  let floors = $state([])
  let frameData = $state(null)
  let racksData = $state({})
  let loading = $state(true)
  let activeFloor = $state(1)
  let projectName = $state('')

  // 5 separate $effect blocks for subscriptions
  $effect(() => {
    const pid = page.params.pid
    if (!pid) return
    const unsub = db.subscribeOne('projects', pid, data => {
      if (data?.name) projectName = data.name
      if (Array.isArray(data?.floors)) floors = data.floors
    })
    return () => { unsub?.() }
  })

  // ... repeat for files, outlets, frames, racks

  async function handleSave(payload: any) {
    await db.save('outlets', { id: docId(), ...payload })
  }
</script>

{#if loading}
  <Spinner />
{:else}
  <Outlets ... /> <!-- 15+ prop bindings -->
{/if}
```

**After (~40 lines):**
```svelte
<script>
  import { setProjectContext, setDataContext, ProjectContext, DataContext } from '$lib/contexts'
  import { Firestore } from '$lib'
  import Outlets from './Outlets.svelte'

  let db = new Firestore()
  let pid = $derived(page.params.pid)
  let docId = $derived(`${pid}_F${String(floor).padStart(2, '0')}`)

  // Setup contexts
  let project = new ProjectContext()
  let dataCtx = new DataContext()
  setProjectContext(project)
  setDataContext(dataCtx)

  // Single subscription effect using helper
  $effect(() => {
    if (!pid) return

    const unsubs = [
      db.subscribeToProject(pid, project),
      db.subscribeOne('outlets', docId, data => {
        dataCtx.data = data
        dataCtx.loading = false
      }),
      db.subscribeMany('files', files => project.files = files),
      // ... other subscriptions
    ]

    return () => unsubs.forEach(u => u?.())
  })

  const handleSave = db.createDebouncedSave('outlets', docId)
</script>

<Outlets {handleSave} />
```

**Impact:** Reduces +page.svelte files by ~60% and eliminates prop drilling.

---

## 5. Component Size Reduction

### Problem
Several components exceed 400-500 lines, making them hard to understand and maintain.

### Solution: Component Decomposition

#### 5.1 Break Down Large Components

**Target files (current line counts):**
- `Racks.svelte` - Split into RacksCanvas, RacksState, device/rack operations
- `Frames.svelte` - Split into FramesState, location operations
- `Outlets.svelte` - Split into OutletsCanvas, OutletsState, toolbar
- `OutletCanvas.svelte` - Split rendering logic into OutletRenderer
- `OutletPalette.svelte` - Split into FileSelector, ToolSelector, OutletList

**Example: Outlets.svelte Decomposition**

**Before: Outlets.svelte (600+ lines)**
```svelte
<script>
  // 100+ lines of state
  // 200+ lines of handlers
  // 100+ lines of $effects
  // 200+ lines of template
</script>
```

**After: Outlets.svelte (150 lines)**
```svelte
<script>
  import { OutletsState } from './state.svelte.ts'
  import { OutletsCanvas, OutletsPalette, OutletsToolbar } from './parts'

  let state = new OutletsState()
  let { onsave } = $props()

  // Minimal glue code only
</script>

<Window>
  <OutletsToolbar />
  <PaneGroup>
    <Pane><OutletsPalette /></Pane>
    <Pane><OutletsCanvas /></Pane>
  </PaneGroup>
</Window>
```

**Create: outlets/state.svelte.ts (200 lines)**
```typescript
/** Centralized state management for outlets tool */
export class OutletsState {
  outlets = $state<OutletConfig[]>([])
  selectedIds = $state<Set<string>>(new Set())
  activeTool = $state<ToolMode>('select')

  // All business logic methods
  addOutlet(pos: Point) { ... }
  updateOutlet(id: string, updates: Partial<OutletConfig>) { ... }
  deleteOutlet(id: string) { ... }
  // etc.
}
```

#### 5.2 Decomposition Strategy

For each large component:

1. **Extract State Class** - All `$state` declarations → `{tool}State.svelte.ts`
2. **Extract Business Logic** - CRUD operations, calculations → separate methods/modules
3. **Split UI Chunks** - Toolbar, palette, canvas into separate components
4. **Keep Main File Thin** - Only composition and high-level coordination

**Target:** No component over 400 lines, most under 300.

---

## 6. UI/UX Consistency

### Problem
Inconsistent styling, spacing, and interaction patterns across tools.

### Solution: Design System Refinement

#### 6.1 Create `src/lib/theme.ts`

Centralize design tokens:

```typescript
export const theme = {
  colors: {
    primary: 'rgb(59, 130, 246)', // blue-500
    secondary: 'rgb(107, 114, 128)', // gray-500
    success: 'rgb(34, 197, 94)', // green-500
    warning: 'rgb(251, 146, 60)', // orange-500
    danger: 'rgb(239, 68, 68)', // red-500

    // Semantic
    selected: 'rgb(147, 197, 253)', // blue-300
    hover: 'rgb(243, 244, 246)', // gray-100
    border: 'rgb(229, 231, 235)', // gray-200
  },

  spacing: {
    toolbar: '2rem', // h-8
    statusBar: '1.75rem', // h-7
    titlebar: '1.875rem', // h-[30px]
    panePadding: '0.75rem', // p-3
  },

  text: {
    heading: 'text-sm font-semibold',
    body: 'text-xs',
    label: 'text-xs text-gray-600',
    caption: 'text-[10px] text-gray-500',
  },

  interactive: {
    button: 'px-2 py-1 text-xs rounded hover:bg-gray-100 transition-colors',
    input: 'px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400',
    select: 'px-2 py-1 text-xs border border-gray-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-400',
  },
}
```

#### 6.2 Standardize Common Patterns

**Consistent component heights:**
- Titlebar: 30px (already standard)
- Toolbar: 32px (h-8)
- Status bar: 28px (h-7)
- Floor tabs: 28px (h-7)
- Input/select: 32px (h-8)
- Small button: 24px (h-6)

**Consistent spacing:**
- Panel padding: 12px (p-3)
- Section gap: 12px (space-y-3)
- Item gap: 8px (space-y-2)
- Inline gap: 8px (gap-2)

**Consistent interactive states:**
- Hover: bg-gray-100
- Selected: bg-blue-50 + border-blue-300
- Active tool: bg-blue-500 text-white
- Disabled: opacity-50 cursor-not-allowed

#### 6.3 Audit and Update

Go through each tool and align:
- Button sizes and variants
- Input field styling
- Table row heights and hover states
- Modal/dialog sizes
- Icon sizes (consistently 14px or 16px)
- Loading states (use LoadingOverlay)

---

## 7. Type System Improvements

### Problem
Type definitions scattered across `parts/types.ts` in each tool with some overlap.

### Solution: Centralized Type Library

#### 7.1 Create `src/lib/types/` Directory

```
src/lib/types/
  index.ts           # Barrel export
  core.ts            # Point, Rect, Size, etc.
  project.ts         # Project, Floor, Room
  task.ts            # Task, Project (already exists)
  firestore.ts       # Document, Collection types
  ui.ts              # ToolMode, ViewState, etc.
```

**`core.ts`:**
```typescript
/** Real-world coordinates in mm from origin */
export interface Point {
  x: number
  y: number
}

export interface Point3D extends Point {
  z: number
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface Size {
  width: number
  height: number
}

export type Level = 'low' | 'high'
export type CableType = 'cat5e' | 'cat6' | 'cat6a' | 'fiber-sm' | 'fiber-mm'
```

**`project.ts`:**
```typescript
export interface Project {
  id: string
  name: string
  description?: string
  floors: FloorConfig[]
  ownerId?: string
  createdAt?: Timestamp
  updatedAt?: Timestamp
  deleted?: boolean
}

export interface FloorConfig {
  number: number
  label?: string
  serverRoomCount: number
  roomNames?: Record<string, string>
}

export interface Room {
  letter: string
  name: string
  floor: number
}
```

#### 7.2 Tool-Specific Types Stay Local

Keep tool-specific interfaces in tool directories:
- `outlets/parts/types.ts` - OutletConfig, TrunkConfig
- `racks/parts/types.ts` - RackConfig, DeviceConfig
- `frames/parts/types.ts` - LocationConfig, FrameConfig

But import shared types from `$lib/types`:
```typescript
import type { Point, Level, CableType } from '$lib/types'
```

---

## 8. Improved State Persistence

### Problem
localStorage logic repeated for view state, filters, preferences.

### Solution: Unified Persistence Utility

#### 8.1 Create `src/lib/utils/persistence.ts`

```typescript
import { getProjectContext } from '$lib/contexts'

/** Type-safe localStorage wrapper with automatic context-aware keys */
export class Persistence<T> {
  constructor(
    private key: string,
    private defaults: T,
    private scope: 'global' | 'project' | 'tool' = 'global'
  ) {}

  /** Get full storage key with project/tool scope */
  private getKey(): string {
    if (this.scope === 'global') return this.key

    try {
      const project = getProjectContext()
      if (this.scope === 'project') {
        return `${this.key}-${project.projectId}`
      }
      return `${this.key}-${project.projectId}-F${project.floor}`
    } catch {
      return this.key
    }
  }

  /** Load value from localStorage */
  load(): T {
    try {
      const saved = localStorage.getItem(this.getKey())
      if (saved) return JSON.parse(saved)
    } catch {}
    return structuredClone(this.defaults)
  }

  /** Save value to localStorage */
  save(value: T): void {
    try {
      localStorage.setItem(this.getKey(), JSON.stringify(value))
    } catch {}
  }

  /** Create reactive state that auto-persists */
  reactive(): T {
    const value = $state(this.load())

    $effect(() => {
      this.save(value)
    })

    return value
  }
}

/** Helper to create project-scoped persistence */
export function projectStorage<T>(key: string, defaults: T) {
  return new Persistence(key, defaults, 'project')
}

/** Helper to create tool-scoped (project + floor) persistence */
export function toolStorage<T>(key: string, defaults: T) {
  return new Persistence(key, defaults, 'tool')
}
```

#### 8.2 Usage Examples

**Before:**
```svelte
<script>
  let filters = $state(DEFAULT_FILTERS)

  $effect(() => {
    try {
      const saved = localStorage.getItem('task-filters')
      if (saved) filters = JSON.parse(saved)
    } catch {}
  })

  $effect(() => {
    try {
      localStorage.setItem('task-filters', JSON.stringify(filters))
    } catch {}
  })
</script>
```

**After:**
```svelte
<script>
  import { projectStorage } from '$lib/utils/persistence'

  let filters = projectStorage('task-filters', DEFAULT_FILTERS).reactive()
</script>
```

**For canvas view state:**
```svelte
<script>
  import { toolStorage } from '$lib/utils/persistence'

  let view = toolStorage('canvas-view', { x: 0, y: 0, zoom: 1 }).reactive()
</script>
```

---

## 9. Documentation & Code Organization

### Problem
Limited inline documentation, unclear module purposes.

### Solution: Standardized Documentation

#### 9.1 Add README.md to Each Tool

**Example: `outlets/README.md`**
```markdown
# Outlets Tool

Floor plan-based network outlet placement and cable routing.

## Architecture

- `+page.svelte` - Data subscriptions and context setup
- `Outlets.svelte` - Main layout coordinator
- `state.svelte.ts` - Centralized state management
- `parts/` - UI components
  - `OutletCanvas.svelte` - Pan/zoom canvas with PDF and SVG overlay
  - `OutletPalette.svelte` - Sidebar controls
  - `OutletRenderer.svelte` - Outlet symbol rendering
- `trunks/` - Cable trunk routing (Phase 2)

## Data Model

Outlets use real-world mm coordinates from calibrated PDF origin.
Each outlet has: position, ports, cable type, mount type, labels.

See `parts/types.ts` for full type definitions.

## Key Components

- **OutletCanvas** - Handles pan/zoom, PDF rendering, coordinate conversion
- **OutletPalette** - File selection, tool buttons, outlet list
- **OutletRenderer** - Draws outlet symbols with usage color coding
```

#### 9.2 Add JSDoc Comments to Key Functions

```typescript
/**
 * Convert PDF pixel coordinates to real-world millimeters.
 * Uses calibration data (origin point + scale factor) from file metadata.
 *
 * @param px - Point in PDF pixel space
 * @param calibration - Origin and scale factor from file.pages[n]
 * @returns Point in mm from origin
 */
export function pxToMm(px: Point, calibration: PageCalibration): Point {
  return {
    x: (px.x - calibration.origin.x) * calibration.scaleFactor,
    y: (px.y - calibration.origin.y) * calibration.scaleFactor,
  }
}
```

#### 9.3 File Headers

Add standardized headers to complex files:

```typescript
/**
 * @file outlets/state.svelte.ts
 * @description Centralized state management for the Outlets tool.
 * Handles CRUD operations, selection, undo/redo, and coordination
 * between canvas and palette components.
 */
```

---

## 10. Testing Infrastructure

### Problem
Limited test coverage makes refactoring risky.

### Solution: Unit Tests for Core Logic

#### 10.1 Create `src/lib/utils/__tests__/` Directory

Add tests for:
- `CanvasController` - Pan/zoom logic
- `persistence.ts` - Storage helpers
- `geometry.ts` - Coordinate conversion, snapping
- `engine.ts` (frames) - Port label generation

**Example: `CanvasController.test.ts`**
```typescript
import { describe, it, expect } from 'vitest'
import { CanvasController } from '../CanvasController.svelte'

describe('CanvasController', () => {
  it('converts screen to canvas coords correctly', () => {
    const canvas = new CanvasController({ x: 100, y: 50, zoom: 2 })
    const rect = { left: 0, top: 0, width: 800, height: 600 }

    const result = canvas.screenToCanvas(300, 200, rect)

    expect(result.x).toBe(100) // (300 - 0 - 100) / 2
    expect(result.y).toBe(75)  // (200 - 0 - 50) / 2
  })

  it('handles zoom correctly', () => {
    const canvas = new CanvasController({ zoom: 1 })

    canvas.handleWheel({
      deltaY: -100,
      ctrlKey: true,
      preventDefault: () => {}
    } as any)

    expect(canvas.zoom).toBeGreaterThan(1)
  })
})
```

#### 10.2 Component Tests for UI

Add basic component tests:
```typescript
import { render } from '@testing-library/svelte'
import { describe, it, expect } from 'vitest'
import FloorTabs from '../FloorTabs.svelte'

describe('FloorTabs', () => {
  it('renders floor buttons', () => {
    const { container } = render(FloorTabs, {
      floors: [
        { number: 1, serverRoomCount: 1 },
        { number: 2, serverRoomCount: 2 },
      ],
      activeFloor: 1,
    })

    const buttons = container.querySelectorAll('button')
    expect(buttons).toHaveLength(2)
  })
})
```

---

---

## 16. Eliminate Code Duplication (Critical)

### Problem
Several utility functions are copy-pasted verbatim across multiple files, creating silent maintenance traps where a bug fix or enhancement in one place is missed in others.

### 16.1 ✅ Extract `fmtFloor` Utility

**Current state:** Identical function in 4 files:
- `Outlets.svelte`
- `Racks.svelte`
- `Frames.svelte`
- `FloorManagerDialog.svelte`

**Solution:** Create `src/lib/utils/floor.ts`:

```typescript
import type { FloorConfig } from '$lib/types/project'

/**
 * Format a floor number for display using the project's floor format setting.
 * Uses custom label from FloorConfig if set.
 *
 * @param fl - Floor number (negative = basement)
 * @param floorFormat - Format style: 'L01' | '01F' | '01'
 * @param floors - Floor config array for custom label lookup
 */
export function fmtFloor(
  fl: number,
  floorFormat: string = 'L01',
  floors: FloorConfig[] = []
): string {
  const cfg = floors.find(f => f.number === fl)
  if (cfg?.label) return cfg.label

  if (fl < 0) {
    const n = String(Math.abs(fl)).padStart(2, '0')
    if (floorFormat === '01F') return `B${Math.abs(fl)}F`
    if (floorFormat === '01') return `B${n}`
    return `B${n}`
  }
  const n = String(fl).padStart(2, '0')
  if (floorFormat === '01F') return `${n}F`
  if (floorFormat === '01') return n
  return `L${n}`
}

/** Build a Firestore doc ID for a floor-scoped tool document */
export function floorDocId(projectId: string, floor: number): string {
  return `${projectId}_F${String(floor).padStart(2, '0')}`
}

/** Build a Firestore doc ID for a floor+room-scoped document */
export function roomDocId(projectId: string, floor: number, room: string): string {
  return `${floorDocId(projectId, floor)}_R${room}`
}
```

**Import everywhere:**
```typescript
import { fmtFloor, floorDocId, roomDocId } from '$lib/utils/floor'
```

**Impact:** Removes ~25 lines × 4 files = 100 lines of duplication. Bug fixes apply everywhere instantly.

---

### 16.2 ✅ Extract `migrateFloors` Utility

**Current state:** Identical function duplicated in `racks/+page.svelte` and `frames/+page.svelte`:
```javascript
function migrateFloors(raw) {
  if (!raw?.length) return [{ number: 1, serverRoomCount: 1 }]
  if (typeof raw[0] === 'object' && 'number' in raw[0]) return raw
  return raw.map(n => ({ number: n, serverRoomCount: 1 }))
}
```

**Solution:** Add to `src/lib/utils/floor.ts`:
```typescript
/** Migrate legacy floors format: number[] → FloorConfig[] */
export function migrateFloors(raw: any[]): FloorConfig[] {
  if (!raw?.length) return [{ number: 1, serverRoomCount: 1 }]
  if (typeof raw[0] === 'object' && 'number' in raw[0]) return raw as FloorConfig[]
  return raw.map((n: number) => ({ number: n, serverRoomCount: 1 }))
}
```

---

### 16.3 ✅ Remove Redundant `strip`/`stripUndefined` Functions

**Current state:**
- `Racks.svelte` has `strip(obj)` — strips undefined values before saving
- `Frames.svelte` has `stripUndefined(obj)` — identical logic, different name
- `db.svelte.ts` already calls `sanitizeFirestoreData()` on **every** `save()` and `saveBatch()` call

**Solution:** Delete both component-level functions entirely. The `Firestore.save()` method already sanitizes, so double-stripping is unnecessary work.

```diff
- function strip(obj: any): any {
-   if (Array.isArray(obj)) return obj.map(strip)
-   if (obj && typeof obj === 'object') {
-     const out: any = {}
-     for (const [k, v] of Object.entries(obj)) {
-       if (v !== undefined) out[k] = strip(v)
-     }
-     return out
-   }
-   return obj
- }
```

In `doSave()` / save handlers, remove the `strip()` wrapper:
```diff
- onsave?.(strip({ rows, racks: racks.map(...), devices, settings }), pendingChanges)
+ onsave?.({ rows, racks: racks.map(({ _x, _z, ...r }) => r), devices, settings }, pendingChanges)
```

**Impact:** Removes ~30 lines, eliminates confusion about why data is stripped twice.

---

### 16.4 Extract Shared Floor Management Logic

**Current state:** All three +page.svelte files have near-identical `updateFloors()` and `deleteFloor()` handlers duplicated verbatim.

**Solution:** Add helper functions to `src/lib/utils/floor.ts`:

```typescript
import type { Firestore } from '$lib'

/** Save updated floors list to the project document */
export async function saveFloors(
  db: Firestore,
  projectId: string,
  floors: FloorConfig[]
): Promise<void> {
  await db.save('projects', { id: projectId, floors })
}

/** Delete all tool documents for a floor (frames, racks for all rooms) */
export async function deleteFloorDocs(
  db: Firestore,
  projectId: string,
  floor: number,
  tools: Array<'outlets' | 'frames' | 'racks'>
): Promise<void> {
  const fstr = String(floor).padStart(2, '0')
  const pid = projectId
  for (const tool of tools) {
    if (tool === 'racks') {
      for (const rm of ['A', 'B', 'C', 'D']) {
        try { await db.delete('racks', `${pid}_F${fstr}_R${rm}`) } catch {}
      }
    } else {
      try { await db.delete(tool, `${pid}_F${fstr}`) } catch {}
    }
  }
}
```

**Impact:** Reduces each +page.svelte by ~20-30 lines of floor management boilerplate.

---

### 16.5 ✅ Move `FloorConfig` Type Out of a Component

**Current state:** `FloorConfig` is exported from `FloorManagerDialog.svelte`:
```typescript
// FloorManagerDialog.svelte
export interface FloorConfig {
  number: number
  serverRoomCount: number
  roomNames?: Record<string, string>
  label?: string
}
```

This forces every file that needs this type to import it from a UI component:
```typescript
import FloorManagerDialog, { type FloorConfig } from '$lib/components/FloorManagerDialog.svelte'
```

**Solution:** Move to `src/lib/types/project.ts` (already planned), update `FloorManagerDialog.svelte` to import from there, and update all 6+ import sites.

```typescript
// src/lib/types/project.ts
export interface FloorConfig {
  number: number
  serverRoomCount: number
  roomNames?: Record<string, string>
  label?: string
}
```

**Impact:** Types belong in `$lib/types`, not in components. Enables importing just the type without dragging in component code.

---

## 17. TypeScript Migration for +page.svelte Files

### Problem
All three tool +page.svelte files use JavaScript with JSDoc annotations (`/** @type {any} */`, `/** @param {string} pid */`) while their child components use full TypeScript. This inconsistency:
- Loses type safety at the data layer
- Makes JSDoc annotations verbose and error-prone
- IDE tooling is degraded (no TypeScript-aware refactoring)

### Solution: Convert to `<script lang="ts">`

**Before (`outlets/+page.svelte`):**
```javascript
<script>
  let files = $state(/** @type {any[]} */ ([]))
  let floors = $state(/** @type {import('$lib/components/FloorManagerDialog.svelte').FloorConfig[]} */ ([{ number: 1, serverRoomCount: 1 }]))

  function save(payload) { ... }
  async function deleteFloor(/** @type {number} */ fl) { ... }
</script>
```

**After:**
```typescript
<script lang="ts">
  import type { FloorConfig } from '$lib/types/project'

  let files = $state<any[]>([])
  let floors = $state<FloorConfig[]>([{ number: 1, serverRoomCount: 1 }])

  function save(payload: any): void { ... }
  async function deleteFloor(fl: number): Promise<void> { ... }
</script>
```

**Files to convert:**
- `outlets/+page.svelte`
- `racks/+page.svelte`
- `frames/+page.svelte`

**Impact:** Consistent codebase, full type safety end-to-end, better IDE support.

---

## 18. Fix Architecture Issues

### 18.1 Session Context vs Multiple Instantiation

**Problem:** `Titlebar.svelte` creates `let session = new Session()` which calls `onAuthStateChanged` and registers a new Firebase auth listener. Some +page.svelte files also use `getContext('session')`. Multiple `Session` instances mean multiple auth listeners.

**Solution:** Have `Titlebar.svelte` use context instead of creating a new instance:
```svelte
<script>
  import { getContext } from 'svelte'
  import type { Session } from '$lib'

  let session: Session = getContext('session')
</script>
```

The session is already set up at the layout level — Titlebar shouldn't create its own.

---

### 18.2 Replace `{#key activeFloor}` Full Remounts

**Problem:** All tool +page.svelte files use `{#key activeFloor}` which destroys and recreates the entire child component on floor change. This is wasteful and loses all local state (scroll position, open dialogs, etc.).

**Before:**
```svelte
{#key activeFloor}
  <Outlets data={outletsData} floor={activeFloor} ... />
{/key}
```

**After:** Remove `{#key}` and handle resets reactively in the child component:
```svelte
<!-- In +page.svelte -->
<Outlets data={outletsData} floor={activeFloor} ... />
```

```typescript
// In Outlets.svelte — react to floor prop changes
$effect(() => {
  void floor  // track floor changes
  // Reset only what needs resetting (selection, active tool)
  selectedIds = new Set()
  selectedRackIds = new Set()
  selectedTrunkIds = new Set()
})
```

**Impact:** Smoother floor switching, canvas view preserved, no component teardown overhead.

---

### 18.3 Fix `activeTool` Ownership in OutletCanvas

**Problem:** `OutletCanvas.svelte` receives `activeTool` as a plain prop (not `$bindable`), but its internal toolbar writes `activeTool = 'select'` directly — modifying a prop, which is an anti-pattern in Svelte 5 and doesn't propagate back to the parent.

**Solution:** Either:

**Option A:** Make it `$bindable()` (simple):
```typescript
// OutletCanvas.svelte
let { ..., activeTool = $bindable<ToolMode>('select'), ... } = $props()
```

**Option B:** Use a callback (cleaner):
```typescript
// OutletCanvas.svelte — toolbar buttons call:
onclick={() => ontoolchange?.('select')}

// Outlets.svelte passes:
ontoolchange={(t) => activeTool = t}
```

Option B is preferred as it makes data flow explicit.

---

### 18.4 Scope the `files` Firestore Subscription

**Problem:** `outlets/+page.svelte` calls `subscribeMany('files', ...)` which loads **all** files from Firestore across all projects. Filtering to project files happens in a `$derived` in the component. As the files collection grows, this becomes increasingly inefficient.

**Solution:** Use the existing `subscribeWhere` method:
```typescript
// Before
const unsub = db.subscribeMany('files', data => { files = data })

// After
const unsub = db.subscribeWhere('files', 'projectId', pid, data => { files = data })
```

**Impact:** Only downloads files belonging to the current project. Significant bandwidth and memory savings as file count grows.

---

## 19. Component Extraction

### 19.1 Extract `RackPropertiesPanel.svelte` from Outlets

**Problem:** `Outlets.svelte` contains an ~80-line inline floating `<Window>` component with a complete rack properties form. This makes `Outlets.svelte` even larger and harder to understand at a glance.

**Solution:** Create `outlets/parts/RackPropertiesPanel.svelte`:

```svelte
<!-- outlets/parts/RackPropertiesPanel.svelte -->
<script lang="ts">
  import { Window, Icon } from '$lib'
  import type { RackConfig } from '../../racks/parts/types'
  import type { RackPlacement } from './types'

  let { selectedRackConfigs, selectedRackPlaced, sharedRack, sharedRotation,
        onupdate, onremove, onrotate } = $props<{
    selectedRackConfigs: (RackConfig & { room: string })[]
    selectedRackPlaced: RackPlacement[]
    sharedRack: <K extends keyof RackConfig>(key: K) => RackConfig[K] | undefined
    sharedRotation: number | undefined
    onupdate: (updates: Partial<RackConfig>) => void
    onremove: () => void
    onrotate: () => void
  }>()
</script>

{#if selectedRackConfigs.length > 0}
  <Window title="Rack Properties" open={true} right={16} top={48} class="p-3 space-y-1.5 text-xs w-56">
    <!-- ...form content... -->
  </Window>
{/if}
```

**Impact:** Removes ~80 lines from `Outlets.svelte`, makes the rack properties form independently editable/testable.

---

### 19.2 Extract `PropertyField` for OutletPalette

**Problem:** `OutletPalette.svelte` repeats the same 6 property fields (ports, level, usage, mount, cable, room) nearly identically three times: once for single selection, once for multi-selection, and once for defaults. That's ~180 lines of duplicated form markup.

**Solution:** Extract a data-driven `PropertyRow.svelte` and reduce to one rendered block:

```svelte
<!-- outlets/parts/PropertyRow.svelte -->
<script lang="ts">
  let { label, width = 'w-12', children } = $props<{
    label: string
    width?: string
    children?: any
  }>()
</script>
<label class="flex items-center gap-2">
  <span class="text-gray-500 {width} shrink-0">{label}</span>
  {@render children?.()}
</label>
```

Then in `OutletPalette.svelte`, factor the fields into a snippet or sub-component that accepts a generic `values` object and `onchange` handler, reducing the three near-identical blocks to one.

**Impact:** Removes ~120 lines of duplicated markup from `OutletPalette.svelte`.

---

## 20. Unified Auto-Save Pattern

### Problem
Three tools have divergent auto-save implementations:

| Tool | Pattern |
|------|---------|
| Outlets | Snapshot diff + `setTimeout` in `$effect` |
| Racks | `logChange()` → `scheduleSave()` → `doSave()` with `syncPaused` flag |
| Frames | `$effect` with `computeChanges()` + `setTimeout` + `initialized` guard |

This makes it hard to reason about save behavior, and each has slightly different edge cases.

### Solution: Create `AutoSave.svelte.ts`

```typescript
/**
 * @file src/lib/utils/AutoSave.svelte.ts
 * Reusable debounced auto-save with status tracking and sync pause.
 */
export class AutoSave {
  status = $state<'saved' | 'saving' | 'unsaved'>('saved')
  private timer: ReturnType<typeof setTimeout> | null = null
  private syncPaused = false
  private syncTimer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private readonly onSave: (payload: any) => void,
    private readonly delay = 400
  ) {}

  /** Call when data changes. Debounces the save. */
  schedule(payload: () => any): void {
    this.status = 'unsaved'
    this.syncPaused = true
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.status = 'saving'
      this.onSave(payload())
      this.status = 'saved'
      // Resume remote sync after a delay to avoid clobbering
      if (this.syncTimer) clearTimeout(this.syncTimer)
      this.syncTimer = setTimeout(() => { this.syncPaused = false }, 1500)
    }, this.delay)
  }

  /** Returns true if remote updates should be applied */
  get canSync(): boolean { return !this.syncPaused }
}
```

**Usage in each tool:**
```typescript
// In Racks.svelte
const autoSave = new AutoSave((payload) => onsave?.(payload, pendingChanges))

function logChange(action: string, field?: string, details?: string) {
  pendingChanges.push({ action, field, details })
  autoSave.schedule(() => strip({ rows, racks, devices, settings }))
}
```

**Impact:** Removes ~30 lines per tool, consistent behavior everywhere, single place to fix save bugs.

---

## 21. Security & Environment Configuration

### Problem
Firebase API keys and project configuration are hardcoded in `src/lib/db.svelte.ts`:

```typescript
const config = {
  apiKey: 'AIzaSyCfoM8CLFAWuMDveWMeCJ8k3cYb-4ah_xA',
  authDomain: 'sunny-jetty-180208.firebaseapp.com',
  projectId: 'sunny-jetty-180208',
  // ...
}
```

While Firebase web API keys are somewhat public by nature (protected by security rules), hardcoding them has drawbacks:
- Cannot switch between dev/staging/prod environments
- Keys appear in git history
- No clear indication of how to configure for a new deployment

### Solution: Use Vite Environment Variables

**`.env` file (gitignored):**
```
VITE_FIREBASE_API_KEY=AIzaSyCfoM8CLFAWuMDveWMeCJ8k3cYb-4ah_xA
VITE_FIREBASE_AUTH_DOMAIN=sunny-jetty-180208.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=sunny-jetty-180208
VITE_FIREBASE_STORAGE_BUCKET=sunny-jetty-180208.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=699730861576
VITE_FIREBASE_APP_ID=1:699730861576:web:73bfa0ed599a7011
VITE_FIREBASE_DATABASE_URL=https://sunny-jetty-180208.firebaseio.com
```

**`.env.example` (committed — update from current `.env.example`):**
```
VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
# ...
```

**`db.svelte.ts`:**
```typescript
const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
}
```

**Impact:** Enables multi-environment deployments, removes credentials from source code.

---

## 22. Racks Toolbar Deduplication

### Problem
`Racks.svelte` displays floor selection tabs in **two places**:
1. The top toolbar (as pill buttons with Floor/Room/Row controls)
2. The bottom status bar (as tab buttons identical to Outlets and Frames)

This is redundant UI — users have two separate controls doing the same thing.

### Solution

Remove the floor pills from the **top toolbar** since the status bar tabs are the consistent pattern used by all three tools. The top toolbar should only contain Room and Row selection controls (which are unique to Racks).

**Before (toolbar):**
```svelte
<div class="h-8 px-3 flex items-center gap-3 ...">
  <!-- Floor (remove this section) -->
  <span>Floor</span>
  <div class="flex gap-0.5">
    {#each floors as fl} ... {/each}
    <button title="Manage floors">+</button>
  </div>
  <div class="divider"></div>
  <!-- Room (keep) -->
  <span>Room</span> ...
  <!-- Row (keep) -->
  <span>Row</span> ...
</div>
```

**After (toolbar):**
```svelte
<div class="h-8 px-3 flex items-center gap-3 ...">
  <!-- Room only -->
  <span>Room</span> ...
  <!-- Row only -->
  <span>Row</span> ...
</div>
```

**Impact:** Removes ~15 lines of duplicated markup, cleaner toolbar, consistent navigation pattern with other tools.

---

## 11. Implementation Phases

### Phase 1: Foundation (Week 1)
**Goal:** Establish new architecture without breaking existing functionality.

- ✅ Create context system (`ProjectContext`, `DataContext`, `ViewContext`)
- ✅ Create `CanvasController` utility
- ✅ Create `Persistence` utility
- ✅ Extract common UI components (`FloorTabs`, `SaveStatus`, `ToolToolbar`)
- ✅ Update `$lib/index.ts` exports
- ✅ Write unit tests for new utilities

**Validation:** New code works in isolation, old code unchanged.

### Phase 2: Outlets Tool Migration (Week 2)
**Goal:** Prove the new patterns in one complete tool.

- ✅ Update `outlets/+page.svelte` to use contexts
- ✅ Extract `OutletsState` class
- ✅ Split `Outlets.svelte` into smaller components
- ✅ Replace pan/zoom logic with `CanvasController`
- ✅ Update `OutletCanvas` to use new utilities
- ✅ Add component-level documentation

**Validation:** Outlets tool works identically, but code is 40% smaller.

### Phase 3: Racks & Frames Migration (Week 3)
**Goal:** Apply patterns to remaining major tools.

- ✅ Migrate Racks tool
- ✅ Migrate Frames tool
- ✅ Migrate Uploads tool (PdfViewer)
- ✅ Standardize all tool +page.svelte files

**Validation:** All tools working, UI consistent, code reduced by ~35%.

### Phase 4: UI/UX Polish (Week 4)
**Goal:** Visual consistency and user experience improvements.

- ✅ Apply design system tokens
- ✅ Standardize spacing, sizing, colors
- ✅ Update all interactive states
- ✅ Add loading states everywhere
- ✅ Improve keyboard navigation

**Validation:** UI feels cohesive, all tools have consistent look/feel.

### Phase 5: Testing & Documentation (Week 5)
**Goal:** Solidify improvements with tests and docs.

- ✅ Add unit tests for all utilities
- ✅ Add component tests for shared UI
- ✅ Write README.md for each tool
- ✅ Add JSDoc comments to complex functions
- ✅ Create architecture diagram

**Validation:** >60% test coverage, all tools documented.

---

## 12. Success Metrics

### Code Quality
- ✅ Average component size: <300 lines (currently ~450)
- ✅ Largest component: <400 lines (currently ~700+)
- ✅ Prop count per component: <5 (currently 10-20)
- ✅ Code duplication: <10% (estimate currently ~25%)
- ✅ TypeScript strict mode: 0 errors

### Performance
- ✅ Initial load time: <2s
- ✅ Tool switch time: <200ms
- ✅ Canvas render time: <16ms (60fps)
- ✅ Search/filter response: <100ms

### Maintainability
- ✅ LLM context fit: All major files fit in 2000 token window
- ✅ New feature time: 50% faster (measured after Phase 3)
- ✅ Bug fix time: 40% faster
- ✅ Test coverage: >60%

### User Experience
- ✅ UI consistency score: 9/10 (audit checklist)
- ✅ Keyboard navigation: Complete
- ✅ Loading states: Everywhere
- ✅ Error messages: User-friendly

---

## 13. Risks & Mitigation

### Risk 1: Breaking Changes During Migration
**Impact:** Medium
**Mitigation:**
- Migrate one tool at a time
- Keep old and new code side-by-side initially
- Add feature flags for gradual rollout
- Maintain backward compatibility in contexts

### Risk 2: Performance Regression
**Impact:** Low
**Mitigation:**
- Profile before and after each phase
- Use Chrome DevTools performance tab
- Monitor bundle size (should stay same or decrease)
- Test on low-end devices

### Risk 3: Incomplete Migration
**Impact:** Medium
**Mitigation:**
- Clear phase boundaries with validation
- Document what's complete vs in-progress
- Don't mix old/new patterns in same component
- Parallel tracks: new features go to new architecture only

### Risk 4: Context Overhead
**Impact:** Low
**Mitigation:**
- Context reads are O(1) lookups, minimal cost
- Use derived state to avoid unnecessary reactivity
- Profile context usage in large components

---

## 14. Long-Term Benefits

### For LLMs
1. **Smaller context windows** - Each file easily fits in one prompt
2. **Clear boundaries** - Know exactly where to look for functionality
3. **Consistent patterns** - Learn once, apply everywhere
4. **Self-documenting** - Types and structure reveal purpose

### For Developers
1. **Faster onboarding** - Clear architecture, good docs
2. **Easier debugging** - Smaller components, clear data flow
3. **Safer refactoring** - Tests catch regressions
4. **Better composition** - Reusable components and utilities

### For Users
1. **Consistent UX** - Same patterns across all tools
2. **Better performance** - Less code to load and parse
3. **Fewer bugs** - Shared code means fewer bugs
4. **Faster features** - Developers work more efficiently

---

## 15. Quick Wins (Immediate Actions)

Start with these high-impact, low-risk improvements:

### Original Quick Wins

1. **Extract FloorTabs component** (2 hours)
   - Used in 4 places, immediate consistency gain

2. **Create CanvasController** (4 hours)
   - Replace duplicated pan/zoom logic in 3 tools

3. **Add SaveStatus component** (1 hour)
   - Standardize save feedback across tools

4. **Centralize theme tokens** (2 hours)
   - Create `theme.ts`, document design decisions

5. **Add ProjectContext** (3 hours)
   - Eliminate 5-10 props from each tool component

**Total:** ~12 hours, ~30% code reduction in main files.

### Additional Quick Wins (from Sections 16–22)

6. **Create `src/lib/utils/floor.ts`** (1 hour) — §16.1, §16.2
   - Extract `fmtFloor`, `floorDocId`, `roomDocId`, `migrateFloors`
   - Removes ~100 lines of duplication across 4 files immediately
   - Zero risk: pure utility, no UI changes

7. **Delete `strip()`/`stripUndefined()` from components** (30 min) — §16.3
   - `db.svelte.ts` already sanitizes on every save
   - Remove ~30 lines, zero functional impact

8. **Move `FloorConfig` to `$lib/types/project.ts`** (1 hour) — §16.5
   - Update 6+ import sites
   - Unblocks clean type imports everywhere

9. **Convert +page.svelte files to TypeScript** (2 hours) — §17
   - Add `lang="ts"`, replace JSDoc with proper types
   - Immediate type safety at the data layer

10. **Fix `files` subscription scope** (15 min) — §18.4
    - `subscribeMany` → `subscribeWhere('files', 'projectId', pid, ...)`
    - Single line change, significant efficiency gain

11. **Fix Titlebar Session instantiation** (30 min) — §18.1
    - Replace `new Session()` with `getContext('session')`
    - Eliminates redundant auth listener

12. **Remove duplicate floor tabs from Racks toolbar** (30 min) — §22
    - Remove ~15 lines of HTML from top toolbar
    - Keep only in status bar (matches Outlets/Frames pattern)

13. **Extract `RackPropertiesPanel.svelte`** (1 hour) — §19.1
    - Pull the 80-line floating properties window out of `Outlets.svelte`
    - Makes `Outlets.svelte` immediately more readable

**Total additional:** ~6 hours, removes ~300+ lines of duplication/redundancy.

---

## Conclusion

This refactoring plan balances ambition with pragmatism. By focusing on:
- **Contexts over props** (reduces complexity)
- **Shared utilities** (reduces duplication)
- **Component decomposition** (improves understandability)
- **Consistent UI patterns** (better UX)
- **Incremental migration** (safe progression)

...we can transform the codebase into something significantly more maintainable while preserving all existing functionality.

**Recommended Start:** Phase 1 foundation + Quick Wins (Week 1), then reassess based on results.
