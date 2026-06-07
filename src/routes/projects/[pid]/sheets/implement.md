# Sheets — Implementation Plan

This plan turns the spec in [`sheets.md`](./sheets.md) into a concrete, staged build. It is grounded in
two existing bodies of code:

- **`src-sample/routes/projects/[pid]/drawings/`** — a working (but partial / buggy) sheet+viewport
  skeleton. This is the foundation we copy and finish. It already implements the paper sheet, pan/zoom
  canvas, drag-out viewports, marquee select, viewport activation, title block, and an in-viewport
  trunk/shape editor.
- **`src/routes/projects/[pid]/{outlets,racks,risers}/`** — the full, complex production tools whose
  *rendering* we want to surface inside viewports, via simplified read-only copies.

The goal is a **simplified** tool, so at every step we prefer "copy the sample, wire persistence, add
one panel" over "port the full production tool".


## Key findings that shaped the plan:

- The sample drawings/ folder is already a working sheet+viewport skeleton (paper, pan/zoom Canvas, drag-out viewports via ViewportEditor, marquee select, activation, TitleBlock). It just lacks persistence (Firestore subscription is commented out, content is seeded in-memory) and a couple of unwired bits (title-block drag). So the plan is "copy the sample, finish it using snippets from our production code" rather than build from scratch.
- The old drawings/ tool is "too complex" because it mirrors three Firestore collections (pages + drawings + revisions), has 11 viewport types, versioning/publishing, and tangled coordinate transforms. The plan deliberately drops revisions/packages/pinning and uses one flat doc per sheet with an embedded viewports[] array.
- The source tools' canvases are huge (OutletCanvas ~1,900 lines, etc.), full of editing logic — so the plan makes read-only render copies that lift only the drawing code + the pure geometry modules (geometry.ts, engine.ts).
- Print-to-fit already mostly exists in the sample's Canvas.svelte (@page injection + PX_PER_MM = 96/25.4 scaling); Stage I just finalizes it.

---

## 1. What we're building (recap)

- A **project has many sheets**. Each sheet is one sheet of paper (default A3 landscape) with a title
  block.
- A sheet holds **viewports** — rectangles dragged out on the paper, each rendering a view from one
  tool (Outlets → then Racks → then Risers).
- **Floating windows** (not sidebars) edit properties. They float over the main content area (**not**
  inside the viewport). Which windows show depends on the currently selected object, and **multiple can
  be open at once** — e.g. object properties, viewport layers/settings, and paper/sheet settings
  simultaneously. (v1 ships the sheet-properties and viewport-properties windows; the per-object and
  layers windows arrive with editing later — see §6 and Q3.)
- **Print preview** renders only the paper page area, scaled so 1 paper-mm = 1 real-world-mm on the printed
  PDF / hardcopy. This **must be validated as soon as the first tool render exists** (Outlets), because
  getting scale right (e.g. a floorplan at 1:100 must measure 1:100 on paper) is a prerequisite every
  later tool depends on — not an end-of-project polish step.

Tool render order (each is a milestone): **1) Outlets, 2) Racks, 3) Risers.**

---

## 2. Foundation already present in the sample

Read these before starting — we are finishing them, not rewriting:

| Sample file | Role | Status |
|---|---|---|
| `drawings/+page.svelte` | Route root; `DrawingDoc` type; sheet-list subscription | **Subscription commented out** — needs wiring |
| `drawings/Drawing.svelte` | Owns paper, canvas, viewport gestures, title block | Works against a single hardcoded `pageId`; **seeds sample data, no save** |
| `drawings/viewports.svelte.ts` | `ViewportEditor` — viewport list, select/activate, insert + marquee gestures | Solid; `ViewportConfig = {id,x,y,w,h}` (mm) |
| `drawings/Viewport.svelte` | Per-viewport frame, handles, activation, move/resize drag | Solid |
| `drawings/Floorplan.svelte` | In-viewport content host (nested canvas + trunk/shape layers) | This becomes the **viewport content dispatcher** |
| `drawings/parts/Canvas.svelte` | Pan/zoom engine + print transform (`PX_PER_MM = 96/25.4`) | Solid; reusable for both outer sheet and nested viewport |
| `drawings/parts/TitleBlock.svelte` | Data-driven title block, CSS-grid + non-scaling SVG strokes | Drag handler exists but `onupdate` never wired |
| `drawings/DrawingMenubar.svelte` / `StatusBar.svelte` | Insert menu + context status line | Solid |
| `drawings/trunks/*` | Headless trunk + rack/outlet editors and SVG layers | Reference for how a tool renders into a viewport |

Key data shapes (verbatim from sample):

```ts
// viewports.svelte.ts
interface ViewportConfig { id: string; x: number; y: number; w: number; h: number } // mm on paper

// Drawing.svelte page model (normalized)
page = { title, drawingNumber?, titleBlock?: TitleBlockConfig|null, paper: PrintSettings }
```

```ts
// $lib/ui/print/types.ts  (already in src/)
interface PrintSettings { paperSize:'A3'|'A4'; orientation:'landscape'|'portrait';
  drawingOffset:Point; scale:number; showPaper:boolean; margins:number }
const DEFAULT_PRINT_SETTINGS = { paperSize:'A3', orientation:'landscape',
  drawingOffset:{x:0,y:0}, scale:100, showPaper:false, margins:10 }
paperDimsMm(settings) // → {w,h} in mm, orientation-aware
```

Available shared primitives (already in `src/lib`): `Window` (draggable, dockable, localStorage-persisted
floating panel), `Dialog`, `Titlebar`, `Button`, `Input`, `Select`, `Icon`, `Row`, plus the
`Firestore`/`Session` wrapper and the `$lib/ui/print/` system (`triggerPrint`, `paperDimsMm`,
`PrintToolbar`, `PrintPaper`).

`Firestore` API we will use: `subscribeMany(path, cb)`, `subscribeOne(table, id, cb)`,
`subscribeWhere(path, field, value, cb)`, `save(path, data)` (auto-ids via `nanoid(8)`, `merge:true`),
`saveBatch(path, docs)`, `delete(path, id)`. All subscriptions return an unsub function.

---

## 3. Data model & Firestore schema

Keep it flat and simple — **one doc per sheet**, viewports embedded as an array (matches the sample's
in-memory model; avoids the production tool's separate `pages/` + `drawings/` + `revisions/` mirroring,
which is a major source of its complexity).

```ts
// sheets/types.ts  (new)
import type { PrintSettings } from '$lib/ui/print/types'

export interface SheetDoc {
  id: string
  projectId: string
  title: string                 // shown in list + title block
  drawingNumber?: string
  sortOrder: number
  paper: PrintSettings          // paper size / orientation / margins / scale
  titleBlock?: TitleBlockConfig | null   // null = hidden, undefined = default
  viewports: SheetViewport[]
  updatedAt?: number
  updatedBy?: string
}

export interface SheetViewport {
  id: string
  x: number; y: number; w: number; h: number   // mm on the paper (= ViewportConfig)
  label?: string
  source: ViewportSource        // discriminated union, grows per milestone
  scale?: number                // 1:N denominator; 0 / undefined = fit-to-viewport
  contentOffsetMm?: Point       // pan offset of source content within the viewport
  border?: 'none' | 'thin'
}

export type ViewportSource =
  | { kind: 'empty' }
  | { kind: 'text'; content: string; fontSizePt?: number }      // trivial, build first to prove the pipe
  | { kind: 'outlets'; outletsDocId: string; fileId?: string; pageNum?: number; showPdf?: boolean }  // milestone 1 (fileId = floorplan PDF underlay)
  | { kind: 'racks'; racksDocId: string; face: 'front' | 'rear' | 'plan' }  // milestone 2
  | { kind: 'risers'; risersDocId: string; fromFloor?: number; toFloor?: number }  // milestone 3

export interface TitleBlockConfig {
  template?: 'vertical' | 'compact' | 'horizontal'
  positionMm?: Point; widthMm?: number; heightMm?: number
  fields?: Record<string, string>   // per-sheet overrides; fall back to project defaults
}
```

Firestore paths:

- `projects/{pid}/sheets/{sheetId}` — the `SheetDoc` (list = `subscribeMany`, editor = `subscribeOne`).
- Source docs are read **live, read-only** from the existing collections:
  - Outlets: `outlets/{projectId}_F{floor:2d}`
  - Racks: `racks/{projectId}_F{floor:2d}_R{room}`
  - Risers: `risers/{projectId}` (one doc per project)
  - Floorplan PDF + calibration: `files/{fileId}` — **required** for the floorplan underlay (see below)
  - Project defaults for the title block: `projects/{pid}` (name, author, address, logoUrl, client)

No revisions, no packages, no source-pinning in v1 — those are what made the old tool "too complex".

### Floorplan PDF underlay

The outlets viewport renders over a **floorplan PDF underlay** (required, not optional). The PDF page is
positioned and scaled using the **origin and scale settings stored per page in the files list**
(`files/{fileId}.pages[pageNum]` — origin point + scale factor + crop, as used by the uploads/outlets
tools today). The underlay therefore lands in the same source-mm space as the outlets/trunks vectors, so
both share one viewport transform and print at the correct ratio.

> **Coordinate-axis note (decision pending — see Q5).** Floorplans currently use **y extending
> *downwards*** (screen convention), while the elevation tools (racks/risers) use **y extending
> *upwards***. We are considering **inverting the floorplan canvas to y-up** so a single canvas/coordinate
> convention is shared across floorplan and elevation renders. This affects the source-mm → paper-mm
> transform in `ViewportContent` and the PDF underlay placement, so settle it **before** building the
> Outlets render (Stage F). If inverted, the conversion lives in one place (the viewport transform) and
> tool renders stay axis-agnostic.

---

## 4. Folder layout (target)

```
src/routes/projects/[pid]/sheets/
  +page.svelte                 # sheet LIST + "new sheet" (Stage A)
  [sheetId]/+page.svelte       # sheet EDITOR route (Stage B)
  types.ts                     # SheetDoc, SheetViewport, ViewportSource, TitleBlockConfig
  data.svelte.ts               # subscribe/save helpers (subscribeSheets, subscribeSheet, saveSheet…)
  SheetEditor.svelte           # = sample Drawing.svelte, persistence-wired
  SheetMenubar.svelte          # = sample DrawingMenubar.svelte
  StatusBar.svelte             # = sample StatusBar.svelte
  Viewport.svelte              # = sample Viewport.svelte (frame/handles/activation)
  ViewportContent.svelte       # = sample Floorplan.svelte, becomes the source dispatcher
  parts/
    Canvas.svelte              # = sample parts/Canvas.svelte (pan/zoom + print)
    TitleBlock.svelte          # = sample parts/TitleBlock.svelte
    SheetList.svelte           # list UI (rows, inline rename, add/delete)
    SheetPropertiesWindow.svelte   # floating Window: paper + title-block fields (Stage D)
    ViewportPropertiesWindow.svelte# floating Window: type + data source (Stage E)
  viewports/
    EmptyViewport.svelte
    TextViewport.svelte        # prove-the-pipe
    OutletsViewport.svelte     # milestone 1 — simplified outlets render
    RacksViewport.svelte       # milestone 2
    RisersViewport.svelte      # milestone 3
  tools/                       # simplified, read-only render copies of the source tools
    outlets/                   # geometry.ts (copied), OutletsRender.svelte, types.ts
    racks/                     # RacksRender.svelte (front/rear/plan), types.ts
    risers/                    # engine.ts (copied), RisersRender.svelte, types.ts
```

> Naming: the sample calls everything "Drawing". We rename to "Sheet" on copy-in so the new tool reads
> cleanly and doesn't collide with the old `drawings/` tool (which stays untouched until we delete it).

---

## 5. Staged build

Each stage is independently runnable and reviewable. Stages A–E deliver the spec's four implementation
steps; F–H add the three tool renders; I finalizes print.

### Stage A — Sheet list + create (spec step 1)

1. Copy `sample/+page.svelte` → `sheets/+page.svelte`; strip commented code; rename `DrawingDoc`→`SheetDoc`.
2. Add `sheets/types.ts` and `sheets/data.svelte.ts` with:
   - `subscribeSheets(db, pid, cb)` → `subscribeMany('projects/{pid}/sheets', …)`, sorted by `sortOrder`.
   - `createSheet(db, pid, partial)` → `save('projects/{pid}/sheets', { title:'Untitled', sortOrder:next, paper:DEFAULT_PRINT_SETTINGS, viewports:[] })`.
   - `saveSheet(db, pid, sheet)` / `deleteSheet(db, pid, id)`.
3. `parts/SheetList.svelte`: table of sheets (number, title, paper size, scale). Inline rename
   (pencil → Enter commits / Esc cancels — pattern exists in old `DrawingList.svelte`). "New sheet"
   button → `createSheet` → navigate to editor. Row click → navigate.
4. Navigation uses SvelteKit `goto` to `/projects/{pid}/sheets/{sheetId}`.

**Done when:** list renders live, new sheets appear, rename/delete persist, clicking a row routes to a
(stub) editor.

### Stage B — Sheet editor shell (spec step 2, part 1)

1. Create `sheets/[sheetId]/+page.svelte`: reads `params.sheetId`, `subscribeOne('projects/{pid}/sheets', sheetId)`, renders `<SheetEditor>`.
2. Copy `sample/Drawing.svelte` → `SheetEditor.svelte`. Changes:
   - Replace the hardcoded `pageId`/`pages` subscription with the `SheetDoc` passed in as a prop.
   - Replace the dev `sampleTrunks` seed with `vps.viewports = sheet.viewports` (load embedded array).
   - Keep `Canvas`, `TitleBlock`, the window-level gesture `$effect`, menubar, status bar.
3. Copy `Canvas.svelte`, `TitleBlock.svelte`, `Viewport.svelte`, `SheetMenubar`, `StatusBar` across,
   fixing imports.

**Done when:** opening a sheet shows the paper at correct A3 size with margin guide + default title
block; pan/zoom works; print transform untouched.

### Stage C — Persist viewport geometry (spec step 2, part 2)

The sample's `ViewportEditor` is in-memory only. Bridge it to Firestore:

1. After any mutating gesture (`addViewport`, move/resize commit in `Viewport.svelte`,
   `deleteSelected`), debounce-save the sheet:
   `saveSheet(db, pid, { ...sheet, viewports: vps.viewports.map(toSheetViewport) })`.
   - Add an `onchange` callback prop to `ViewportEditor` consumers, or a `$effect` in `SheetEditor`
     watching `vps.viewports` (deep) with a 300–500ms debounce (mirror Canvas's localStorage debounce).
2. New viewports default to `source:{kind:'empty'}`.
3. Reload round-trips: editing geometry, refreshing the page, geometry persists.

**Done when:** drag-out / move / resize / delete all survive reload.

### Stage D — Sheet properties window (spec step 3)

1. `parts/SheetPropertiesWindow.svelte` using `$lib` `Window` (floating, draggable, dockable).
   Opened from the menubar ("Sheet ▸ Properties").
2. Fields: paper size (A3/A4), orientation, margins, scale (reuse `SCALE_OPTIONS` / `PrintToolbar`
   internals), drawing number, sheet title, and title-block field overrides
   (`titleBlock.fields`: drawnBy, checkedBy, date, client, …). Title-block show/hide toggle
   (`titleBlock = null`).
3. Two-way: bind to a local copy, write through `saveSheet` on change (debounced). The `TitleBlock`
   component already resolves `config.fields?.[k] ?? projectDefault ?? ''`.
4. **Wire the title-block drag** the sample left dangling: pass an `onupdate` callback into
   `TitleBlock` that writes `titleBlock.positionMm` back to the sheet.

**Done when:** changing paper/scale reflows the canvas; title-block fields edit live and persist;
title block can be dragged and hidden.

### Stage E — Viewport properties window + content dispatcher (spec step 4)

1. Copy `sample/Floorplan.svelte` → `ViewportContent.svelte` and convert it from "always trunks/shapes"
   into a **source dispatcher**:

   ```svelte
   {#if vp.source.kind === 'empty'}    <EmptyViewport />
   {:else if vp.source.kind === 'text'} <TextViewport {vp} />
   {:else if vp.source.kind === 'outlets'} <OutletsViewport {vp} {db} />
   {:else if vp.source.kind === 'racks'}   <RacksViewport {vp} {db} />
   {:else if vp.source.kind === 'risers'}  <RisersViewport {vp} {db} />
   {/if}
   ```

   Each inner viewport renders inside the nested `Canvas` (non-interactive by default; interactive
   only when the parent viewport is active).
2. `parts/ViewportPropertiesWindow.svelte` (floating `Window`, shown when a viewport is selected):
   - **Type** select (`empty` / `text` / `outlets` / `racks` / `risers` — only enable the kinds shipped
     so far).
   - **Data source** picker, dependent on type:
     - text → textarea + font size
     - outlets → floor select → resolves `outletsDocId = {pid}_F{floor:2d}`
     - racks → floor + room select + face (front/rear/plan)
     - risers → from/to floor range
   - scale / fit toggle, border, label.
   - Writes through `saveSheet`.
3. Build `viewports/EmptyViewport.svelte` (dashed placeholder + "choose a source") and
   `viewports/TextViewport.svelte` (whitespace-pre-wrap div at `fontSizePt`). **Text is the
   prove-the-pipe milestone** — it exercises select-viewport → set type → set source → render →
   persist → print, with zero tool-render complexity.

**Done when:** select a viewport → window opens → set type=text + content → text renders in the
viewport, persists, and prints.

### Stage F — Milestone 1: Outlets render

Make a **simplified, read-only** copy of the outlets render (the production `OutletCanvas.svelte` is
~1,900 lines and full of editing logic we don't want).

1. `tools/outlets/`: copy `outlets/trunks/geometry.ts` (pure polygon math — no Svelte) and the minimal
   `types.ts` subset (`OutletConfig`, `TrunkConfig`, `RackPlacement`).
2. `tools/outlets/OutletsRender.svelte`: takes `OutletsData` (outlets, trunks, rackPlacements) + optional
   PDF calibration and renders **read-only SVG**: outlet circles (color by usage), trunk polygons via
   `generateTrunkPolygons`, placed racks, optional PDF underlay. No tools, no selection, no drag — lift
   only the drawing code out of `OutletCanvas.svelte`.
3. `viewports/OutletsViewport.svelte`: `subscribeOne('outlets', vp.source.outletsDocId)` →
   `<OutletsRender>` inside the nested canvas, scaled to the viewport (`vp.scale` or fit).

**Done when:** an outlets viewport shows the floor's outlets + trunks live and prints to scale.

### Stage G — Milestone 2: Racks render

1. `tools/racks/RacksRender.svelte`: read-only port of `racks/parts/RackElevationRenderer.svelte`
   (front/rear) and `RackPlanRenderer.svelte` (plan). Inputs: `racks[]`, `devices[]`, `settings`,
   `roomObjects[]`.
2. `viewports/RacksViewport.svelte`: `subscribeOne('racks', vp.source.racksDocId)` → render the chosen
   `face`.

**Done when:** a racks viewport shows a front/rear elevation or plan, live + to scale.

### Stage H — Milestone 3: Risers render

1. `tools/risers/`: copy `risers/parts/engine.ts` (band/lane/compression geometry — pure) + `types.ts`.
2. `tools/risers/RisersRender.svelte`: read-only port of the risers SVG (FloorBand / RoomBox / Ladder /
   CablePath), honoring `fromFloor`/`toFloor`.
3. `viewports/RisersViewport.svelte`: `subscribeOne('risers', vp.source.risersDocId)` → render range.

**Done when:** a risers viewport shows the building elevation for a floor range, live + to scale.

### Stage I — Print preview / print-to-fit (spec: print requirement)

The sample's `Canvas.svelte` already injects an `@page { size: {w}mm {h}mm; margin:0 }` rule and scales
the panzoom content by `PX_PER_MM = 96/25.4` on `beforeprint`, restoring on `afterprint`. Finalize:

1. Confirm nested viewport canvases inherit the parent print scale (the sample marks non-interactive
   nested canvases `managesPrint:false` so only the outer one injects `@page`). Verify each tool render
   uses **non-scaling strokes** where lines must stay hairline (title block already does).
2. Hide all chrome on print: menubar, status bar, floating `Window`s (`Window` already has
   `print:hidden`), selection/frame overlays, margin guide if desired. Add `data-no-print` / `print:hidden`
   to viewport frames and handles so only paper content remains.
3. Add a **Print** action to the menubar calling `triggerPrint(sheet.paper, '<paper selector>')` (or the
   sample's existing Canvas print path).
4. Test: Print → Save as PDF gives a single A3 page where 100mm on the drawing measures 100mm on paper
   (verify with a known dimension at 1:1, then at 1:100).

**Done when:** print preview shows only the paper area, correctly scaled, chrome hidden, one sheet = one
page.

---

## 6. Cross-cutting concerns

- **Coordinate spaces** (keep these straight — they were a complexity trap in the old tool):
  - *paper mm* — viewport `{x,y,w,h}` and title block live here; Canvas world unit = 1mm.
  - *source mm* — internal coordinates of outlets/racks/risers docs.
  - *screen px* — actual pixels; Canvas zoom = `rect.width / offsetWidth`.
  - Each viewport applies one transform: source-mm → paper-mm via `vp.scale` (+ `contentOffsetMm`).
    Centralize this in `ViewportContent` so individual tool renders stay scale-agnostic.
- **Svelte 5 rules** (per CLAUDE.md): runes only; no `$:`; no `onclick|stopPropagation`; `{@const}` only
  as immediate child of block; `{@render children?.()}`. Use `pushState`/`replaceState` from
  `$app/navigation` if syncing URL params, never raw `history.*`.
- **Performance:** debounce all Firestore writes (300–500ms). Render tool viewports read-only — no
  per-frame recompute; memoize geometry with `$derived`.
- **Locale** is `'ja'`; keep user-facing strings consistent with the rest of the app.
- **Bugs to fix from the sample** (flagged during analysis):
  - Title-block `onupdate` never wired (Stage D fixes).
  - No persistence — everything is seeded/in-memory (Stages A–C fix).
  - `TrunkLabel` type defined but never rendered (only relevant if we surface trunk labels).

---

## 7. Build order summary

| Stage | Spec step | Deliverable | Depends on |
|---|---|---|---|
| A | 1 | Sheet list + create/rename/delete | — |
| B | 2 | Sheet editor shell (paper, canvas, title block) | A |
| C | 2 | Viewport geometry persists | B |
| D | 3 | Sheet properties floating window | B |
| E | 4 | Viewport properties window + text render (pipe proof) | C |
| F | tool 1 | Outlets viewport render | E |
| G | tool 2 | Racks viewport render | E |
| H | tool 3 | Risers viewport render | E |
| I | print | Print-to-fit, chrome hidden | F (then G, H) |

Ship A→E first (full sheet/viewport/text workflow end-to-end), then layer in F/G/H, then harden print
(I) once at least one real tool render exists to validate scale.

---

## 8. Open questions to confirm before/while building

1. **Sheet list location** — standalone `/sheets` list page (this plan), or reuse the existing project
   nav? Plan assumes standalone.
2. **One doc vs. subcollection** — embedded `viewports[]` array (this plan, simplest) vs. a
   `viewports` subcollection. Embedded is fine until a sheet exceeds Firestore's 1MB doc limit; tool
   *content* is referenced (by `outletsDocId` etc.), not copied, so docs stay small.
3. **Editable in-viewport?** — spec says "Floating windows/sidebars allow editing properties of the
   content". This plan ships tool renders **read-only** first (edit happens in the source tool), then
   can add in-viewport editing later when a viewport is active. Confirm read-only-first is acceptable.
4. **PDF underlay for outlets** — include the floorplan PDF in the outlets viewport, or vectors only?
   Plan supports it via `files/{fileId}` but treats it as optional.
