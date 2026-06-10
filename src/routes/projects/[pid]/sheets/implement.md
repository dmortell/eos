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
  /**
   * Coordinate-convention version for this viewport's source data. Drives the y-axis flip in
   * ViewportContent. Standard going forward is y-up (version 2). Legacy outlet floorplans whose
   * stored coords are y-down render at version 1 until a conversion tool migrates them.
   *   1 = y-down (legacy outlet floorplans)
   *   2 = y-up   (current standard — default for all NEW viewports)
   */
  version?: 1 | 2               // undefined ⇒ treat as the current default (2 / y-up)
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

> **Coordinate-axis convention (DECIDED: y-up standard, with a per-viewport version flag).** The
> standard going forward is **y extending *upwards*** for all renders — floorplan *and* elevation
> (racks/risers) — so one canvas/coordinate convention is shared everywhere. The y-axis flip lives in a
> single place: the source-mm → paper-mm transform in `ViewportContent` (and the PDF underlay
> placement), so individual tool renders stay axis-agnostic.
>
> Legacy outlet floorplans store coordinates **y-down**. We do **not** rewrite that data now; instead
> each viewport carries `version` (see `SheetViewport`): `version: 2` (y-up) is the default for all new
> viewports, and `version: 1` (y-down) keeps legacy outlet floorplans rendering correctly until a
> dedicated conversion tool migrates their stored coords to y-up (after which their viewports flip to
> version 2). `ViewportContent` reads `version` and applies (or skips) the flip accordingly.

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
  EmptyViewport.svelte         # generic: dashed "choose a source" placeholder
  TextViewport.svelte          # generic: prove-the-pipe text render
  parts/
    Canvas.svelte              # = sample parts/Canvas.svelte (pan/zoom + print)
    TitleBlock.svelte          # = sample parts/TitleBlock.svelte
    SheetList.svelte           # list UI (rows, inline rename, add/delete)
    SheetPropertiesWindow.svelte   # floating Window: paper + title-block fields (Stage D)
    ViewportPropertiesWindow.svelte# floating Window: viewport type + data source (Stage E)
  tools/                       # one folder per tool: its viewport, render, geometry, AND property editors
    outlets/
      OutletsViewport.svelte   # subscribes to source doc(s); hosts render in the nested canvas (milestone 1)
      OutletsRender.svelte     # read-only SVG: PDF underlay + outlets + trunks + racks
      OutletsProperties.svelte # floating-window body: floor/file/page/layer pickers for this viewport
      geometry.ts              # copied from outlets/trunks/geometry.ts (pure)
      types.ts                 # OutletConfig, TrunkConfig, RackPlacement subset
    racks/
      RacksViewport.svelte     # milestone 2
      RacksRender.svelte       # read-only front/rear/plan
      RacksProperties.svelte   # floor/room/face pickers
      types.ts
    risers/
      RisersViewport.svelte    # milestone 3
      RisersRender.svelte      # read-only building elevation
      RisersProperties.svelte  # from/to floor pickers
      engine.ts                # copied from risers/parts/engine.ts (pure)
      types.ts
```

Each `tools/<tool>/` folder is self-contained: the viewport host, the read-only render, the pure
geometry, the local types, **and the property-editor window body** for that tool's viewport live
together, so a tool can be added (or removed) as one unit. `ViewportContent.svelte` dispatches to the
right `*Viewport.svelte`; `ViewportPropertiesWindow.svelte` dispatches to the right `*Properties.svelte`.

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
2. `parts/ViewportPropertiesWindow.svelte` (floating `Window`, shown when a viewport is selected) —
   a thin shell that picks the **Type** then dispatches the **data-source** body to the tool's own
   `tools/<tool>/*Properties.svelte`:
   - **Type** select (`empty` / `text` / `outlets` / `racks` / `risers` — only enable the kinds shipped
     so far).
   - **Data source** body (per type; lives with the tool):
     - text → textarea + font size (inline; generic)
     - outlets → `OutletsProperties`: floor select → `outletsDocId = {pid}_F{floor:2d}`; floorplan
       file + page picker (`fileId`/`pageNum`); layer toggles
     - racks → `RacksProperties`: floor + room select + face (front/rear/plan)
     - risers → `RisersProperties`: from/to floor range
   - common controls (scale / fit toggle, border, label) stay in the shell.
   - Writes through `saveSheet`.
3. Build `EmptyViewport.svelte` (dashed placeholder + "choose a source") and `TextViewport.svelte`
   (whitespace-pre-wrap div at `fontSizePt`) at the `sheets/` root. **Text is the prove-the-pipe
   milestone** — it exercises select-viewport → set type → set source → render → persist → print, with
   zero tool-render complexity.

**Done when:** select a viewport → window opens → set type=text + content → text renders in the
viewport, persists, and prints.

### Stage F — Milestone 1: Outlets render (incl. floorplan PDF underlay)

Make a **simplified, read-only** copy of the outlets render (the production `OutletCanvas.svelte` is
~1,900 lines and full of editing logic we don't want).

0. **Wire the y-axis flip in `ViewportContent` first.** Read `vp.version` (default 2 = y-up); apply the
   y-flip in the source-mm → paper-mm transform for version 2, skip it for version 1 (legacy y-down
   outlet floorplans). Existing outlet floorplan sources start at `version: 1`; new viewports default to
   `version: 2`. Keep tool renders axis-agnostic — they never see the flip.
1. `tools/outlets/geometry.ts` + `types.ts`: copy `outlets/trunks/geometry.ts` (pure polygon math — no
   Svelte) and the minimal `types.ts` subset (`OutletConfig`, `TrunkConfig`, `RackPlacement`).
2. `tools/outlets/OutletsRender.svelte`: takes `OutletsData` (outlets, trunks, rackPlacements) **plus the
   floorplan PDF underlay** and renders **read-only SVG**: PDF page underlay positioned/scaled at the
   page's origin + scale settings from `files/{fileId}.pages[pageNum]`, then outlet circles (color by
   usage), trunk polygons via `generateTrunkPolygons`, placed racks. No tools, no selection, no drag —
   lift only the drawing code out of `OutletCanvas.svelte`.
3. `tools/outlets/OutletsViewport.svelte`: `subscribeOne('outlets', vp.source.outletsDocId)` **and**
   `subscribeOne('files', vp.source.fileId)` → `<OutletsRender>` inside the nested canvas, scaled to the
   viewport (`vp.scale` or fit). The underlay shares the viewport's source-mm → paper-mm transform so it
   prints at the same ratio as the vectors.

**Done when:** an outlets viewport shows the floorplan PDF underlay + outlets + trunks live, all
correctly aligned.

### Stage G — Print preview / print-to-fit (validate NOW, on the Outlets render)

> Pulled forward deliberately: print scale is a prerequisite for every later tool, so we prove it on the
> first real render (a floorplan at 1:100 **must** measure 1:100 on the printed page) rather than
> deferring it. Stages H/I then reuse this proven print path unchanged.

The sample's `Canvas.svelte` already injects an `@page { size: {w}mm {h}mm; margin:0 }` rule and scales
the panzoom content by `PX_PER_MM = 96/25.4` on `beforeprint`, restoring on `afterprint`. Finalize:

1. Confirm nested viewport canvases inherit the parent print scale (the sample marks non-interactive
   nested canvases `managesPrint:false` so only the outer one injects `@page`). Verify the Outlets render
   uses **non-scaling strokes** where lines must stay hairline (title block already does), and that the
   PDF underlay scales with content (raster, so it scales by the transform — confirm DPI looks right).
2. Hide all chrome on print: menubar, status bar, floating `Window`s (`Window` already has
   `print:hidden`), selection/frame overlays, margin guide if desired. Add `data-no-print` / `print:hidden`
   to viewport frames and handles so only paper content remains.
3. Add a **Print** action to the menubar calling `triggerPrint(sheet.paper, '<paper selector>')` (or the
   sample's existing Canvas print path).
4. **Scale test (the important one):** place an outlets viewport at `vp.scale = 100`, Print → Save as
   PDF, and measure a known building dimension on the PDF — 1000mm real must read as 10mm on an A3 page.
   Repeat at 1:50 and Fit. Also confirm one sheet = exactly one A3 page, chrome hidden.

**Done when:** the floorplan prints to the correct scale on a single A3 page with no chrome — this is the
reusable print contract for Racks and Risers.

### Stage H — Milestone 2: Racks render

1. `tools/racks/RacksRender.svelte`: read-only port of `racks/parts/RackElevationRenderer.svelte`
   (front/rear) and `RackPlanRenderer.svelte` (plan). Inputs: `racks[]`, `devices[]`, `settings`,
   `roomObjects[]`.
2. `tools/racks/RacksViewport.svelte`: `subscribeOne('racks', vp.source.racksDocId)` → render the chosen
   `face`. Reuses the Stage G print path.

**Done when:** a racks viewport shows a front/rear elevation or plan, live + to scale + prints correctly.

### Stage I — Milestone 3: Risers render

1. `tools/risers/`: copy `risers/parts/engine.ts` (band/lane/compression geometry — pure) + `types.ts`.
2. `tools/risers/RisersRender.svelte`: read-only port of the risers SVG (FloorBand / RoomBox / Ladder /
   CablePath), honoring `fromFloor`/`toFloor`.
3. `tools/risers/RisersViewport.svelte`: `subscribeOne('risers', vp.source.risersDocId)` → render range.
   Reuses the Stage G print path.

**Done when:** a risers viewport shows the building elevation for a floor range, live + to scale +
prints correctly.

---

## 6. Cross-cutting concerns

- **Coordinate spaces** (keep these straight — they were a complexity trap in the old tool):
  - *paper mm* — viewport `{x,y,w,h}` and title block live here; Canvas world unit = 1mm.
  - *source mm* — internal coordinates of outlets/racks/risers docs.
  - *screen px* — actual pixels; Canvas zoom = `rect.width / offsetWidth`.
  - Each viewport applies one transform: source-mm → paper-mm via `vp.scale` (+ `contentOffsetMm`).
    Centralize this in `ViewportContent` so individual tool renders stay scale-agnostic.
  - **y-axis convention (DECIDED — y-up standard):** renders use **y-up everywhere** (floorplan +
    elevation). The flip lives in this single viewport transform (and the PDF underlay placement), so
    tool renders stay axis-agnostic. A per-viewport `version` flag bridges legacy data: `version: 2`
    (y-up) is the default for new viewports; `version: 1` (y-down) keeps legacy outlet floorplans
    rendering until a conversion tool migrates their stored coords. `ViewportContent` branches on
    `version` to apply or skip the flip. See §3 for details.
- **Future editing (post-v1, see Q3):** v1 renders are read-only (edit in the source tool). Later,
  editing happens via **floating windows over the main content area** (never inside the viewport),
  shown based on the selected object, with **multiple open at once** — object properties, viewport
  layers/settings, paper/sheet settings. Design the property-window shell (Stages D/E) so additional
  windows can mount independently and coexist; the per-tool `*Properties.svelte` bodies are where
  object/layer editing will later hang off the selected object.
- **Svelte 5 rules** (per CLAUDE.md): runes only; no `$:`; no `onclick|stopPropagation`; `{@const}` only
  as immediate child of block; `{@render children?.()}`. Use `pushState`/`replaceState` from
  `$app/navigation` if syncing URL params, never raw `history.*`.
- **Performance:** debounce all Firestore writes (300–500ms). Render tool viewports read-only — no
  per-frame recompute; memoize geometry with `$derived`.
- **Locale** is `'ja'`; keep user-facing strings consistent with the rest of the app.
- **Bugs to fix from the sample** (flagged during analysis):
  - Title-block `onupdate` never wired (Stage D fixes). No need to drag titleblock.
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
| F | tool 1 | Outlets viewport render + floorplan PDF underlay | E |
| G | print | **Print-to-fit, validated on the Outlets render at scale** | F |
| H | tool 2 | Racks viewport render (reuses print path) | G |
| I | tool 3 | Risers viewport render (reuses print path) | G |

Ship A→E first (full sheet/viewport/text workflow end-to-end), then F (first real render) immediately
followed by G (prove print scale on it) — print is the contract every later tool depends on. H and I
then reuse the proven print path.

---

## 8. Decisions & remaining questions

**Decided (incorporated above):**

1. **Sheet list location** — ✅ standalone `/sheets` list page.
2. **Storage** — ✅ embedded `viewports[]` array, one doc per sheet. (Tool *content* is referenced by id,
   not copied, so docs stay well under Firestore's 1MB limit.)
3. **Editing model** — ✅ read-only renders in v1 (edit in the source tool). Later: floating windows over
   the main content area (not in the viewport), shown per selected object, multiple open at once. See §6.
4. **Floorplan PDF underlay** — ✅ required; positioned/scaled from the per-page origin + scale settings
   in the files list (`files/{fileId}.pages[pageNum]`). See §3.

5. **Floorplan y-axis** — ✅ **y-up is the standard** (one convention across floorplan + elevation),
   implemented as a single flip in the `ViewportContent` transform. A per-viewport `version` flag carries
   legacy data: `version: 2` (y-up) default for new viewports; `version: 1` (y-down) keeps legacy outlet
   floorplans correct until a conversion tool migrates their stored coords to y-up. See §3 and §6.

**Still open:** none — ready to build. (Future: a conversion tool to migrate legacy `version: 1` outlet
floorplans to y-up, after which their viewports move to `version: 2`.)

---

## 9. Post-v1 task list (editing era — living checklist)

The render pipeline (Stages A–I) shipped. v1's read-only renders have since grown into an in-place
editing surface (merged edit/annotate overlay, per-tool canvas editors, model mode, annotations). This
section is the **living task list** for that ongoing work — keep it updated as items land.

### Done

- [x] Merged edit/annotate overlay; per-tool canvas editors (`SurfaceEditor` base + outlets/racks/risers editors); model mode.
- [x] Annotations: text/line/arrow/rect/cloud/symbol/callout/dimension; reusable `TransformBox` + `PointHandles`; multi-line text; 15° rotate snap; `PropColor` (swatches + custom + opacity); separate fill + border colours; smaller arrowheads; Leader folded into Callout (border option).
- [x] Callout UX: drag box vs. drag line (box-only vs. move-both); double-click text → focus props textarea.
- [x] Zoom flicker fix (text re-layout): `text-rendering: geometricPrecision`.
- [x] Floating-window scrollbar fix: clamp windows to viewport (`Window`) + portal into a fixed clipped overlay (`edit/portal.ts`, `pointer-events:auto` on panels).
- [x] TextViewport: fold Empty into Text ("Empty — choose source" placeholder); restore text editing (show props window when active); model-mode pan/zoom via SVG `viewBox` + `foreignObject`.
- [x] Viewport properties window stays visible while a viewport is active.
- [x] Marquee + group-drag/delete — **outlets** viewport (outlets, racks, trunk nodes/segments, annotations).
- [x] Marquee + group-drag/delete — **racks** viewport (devices in elevation, rows in plan, annotations; device group-drag reassigns into the rack under the cursor preserving relative U).
- [x] Rack device hover cursor: `move` (was `ns-resize`).
- [x] **Refactor:** marquee (`marquee` state + `beginMarquee`) lifted into `SurfaceEditor`; tools keep only `marqueeCollect`/group-translate.
- [x] Marquee + group-drag/delete — **risers** viewport (rooms + ladders + annotations; rooms reassign floor by cursor y, relative offsets kept). Multi-select now covers all three viewports.
- [x] Status bar swallows the browser context menu (right-click consistency).
- [x] **Undo/redo (Ctrl-Z / Ctrl-Shift-Z / Ctrl-Y)** — reusable snapshot `History` (`edit/history.svelte.ts`); one per viewport covers tool editor + annotation peer as one frame; debounced; wired into all three viewports.
- [x] Riser room/ladder x-coords snap to a 20mm grid (create/drag/resize/group). (Confirmed riser coords are real-world mm — floor-to-floor ~3.8m default, configurable; distances/cable lengths computable.)
- [x] Edit handles / selection outlines / marquee box are `print:hidden` (outlets, racks, risers) — only drawing content prints.

### In progress / next

- (nothing active — see backlog)

### Backlog — from sheets.md "Pending bugs/features"

- [ ] **Viewport pan/zoom model rework** (sheets.md §Pending) — disable content pan/zoom in an active viewport by default; right-wheel/drag pans/zooms the whole sheet as usual. Per-viewport toggle to enable content pan/zoom. Model mode keeps pan/zoom as-is. Show a small toolbar in the top-right of a selected/active viewport frame: current scale, a content-pan/zoom toggle, and the model (⤢) button.
- [ ] Text viewport pan/zoom in model mode — **done** (foreignObject + viewBox); verify the sheets.md note is stale.
- [ ] **VCMs as optional rack/frame parts** — model VCMs (vertical cable managers) as attachable parts rather than fixed.
- [ ] **Trunk/conduit bend radius** — curved corners with a configurable bend-radius for trunks in plan and front/side elevations.
- [ ] **Wall outlet / faceplate shapes** for elevations.
- [ ] **Shape library** — palette of reusable shapes + save user-drawn shapes (port the original outlets tool's library).
- [ ] Layers: **lock toggle** (not just visibility); **project-scope** layer list (vs per-model) so layers aren't recreated per floor; viewport toggles independent of model layers.
- [ ] Annotations: revision-cloud / dimension kinds polish; linked-symbol click-through navigation (section markers → drawing ref; photo markers → survey album).
- [ ] Racks: catalog/library + patch cords (port labels on panels, patch-cord lists shown in racks) — later phase.

### Candidate features (analysed from the existing tools — for review)

- [ ] **Measure / dimension tool** — coords are real mm everywhere, so a click-click measure (and auto cable-length readouts on risers/trunks) is cheap and high-value for engineers.
- [ ] **Cable schedule / BOM viewport** — a table viewport summarising outlets/cables/devices (the standalone outlets tool already has `exportOutletsToExcel`); could render as a text/table viewport and export.
- [ ] **Trunk fill-rate overlay** — the outlets tool computes `nodeFillMap` (cable area vs conduit area); surface a fill-% colour/label on trunks (mirrors the `fillrate` tool).
- [ ] **Align / distribute** for multi-selected objects & viewports; **snap-to-grid / alignment guides** while dragging.
- [ ] **Copy/paste** objects & annotations within and across viewports.
- [ ] **Auto-legend** for a viewport (symbol/colour key), and a **north arrow** placement helper.
- [ ] 3D viewer for rooms/risers (big; mentioned in spec).

### Backlog — earlier notes

- [ ] **Racks plan view polish** — drag handles are world-mm `<circle r={250}>` (huge/scale with zoom) → make screen-constant + smaller; one handle appears orphaned (row with no rendered geometry); verify doors/walls actually render in plan. (May be mooted by the consolidation below.)
- [ ] **Building elements + vertical trunks** — add/edit racks, walls, doors, ceilings, floors, and **vertical trunks** in rack elevation & plan. Vertical trunks must be connectable to the horizontal (floorplan) trunks later (unify the trunk model with a riser/junction concept).
- [ ] **Consolidate plan onto the outlet floorplan** — likely remove rack *plan* view from the racks viewport and use the outlet floorplan as the single plan surface; that means **adding walls & doors to the outlets floorplan**. Racks viewport becomes elevation-only.
- [ ] **Selection-while-active** — a viewport can be selected while another is active (decided: leave as-is for now).
- [ ] Legacy `version: 1` (y-down) outlet floorplan → y-up conversion tool (from §8).
