# Page Editor — Implementation Plan

## Context

**Current state — January 2026:**
- The racks tool canvas stacks front elevation, rear elevation, and plan view in one pan/zoom space ([Racks.svelte](../../racks/Racks.svelte), [RackElevations.svelte](../../racks/parts/RackElevations.svelte), [RackPlan.svelte](../../racks/parts/RackPlan.svelte)). View toggle is a **bitmask** (multiple views can be on simultaneously).
- The plan view works but its drawable area is invisible — users can't tell where they can add walls / doors / rects.
- Print export is single-tool / single-scope. Multi-page drawing packages (M7) have no foundation yet.
- `drawings/+page.svelte` + `drawings/parts/DrawingList.svelte` today only list `DrawingDoc` records (title / revisions / tool-type links) — there's no visual page editor.
- A reusable paper component already exists at [`$lib/ui/print/`](../../../../../lib/ui/print) (`PrintPaper`, `PrintToolbar`, `PrintSettings`, `triggerPrint`) and is used by the outlets tool to show A3/A4 paper outlines with scale+margin inside its canvas.

**Goals of this redesign:**

1. **Rack canvas: exclusive views.** Only one of {front elevation, rear elevation, plan view} is visible at any time. Cleaner canvas, makes the plan drawable area obvious.
2. **Build a general-purpose Page Editor** in `drawings/parts/` that can compose **viewports** from *any* tool onto a printable page with a title block.
3. **Support mixing rows on the plan view** within a page — one viewport might show Row A from floor 2 room A, another viewport shows Row B from floor 2 room B, etc.
4. **Source-agnostic viewports** — a page can embed rack elevations, rack plans, frame details, fillrate diagrams, floorplan PDF sections, static text, or images. Each tool contributes a small "render-into-a-rectangle" component.
5. **Pages are the unit of drawing-package output.** A drawing package = ordered list of pages → one PDF.

---

## Architecture Decisions (proposed — open for discussion)

### D1. Rack canvas: radio, not checkboxes

Today: `viewMask = VIEW_FRONT | VIEW_REAR | VIEW_PLAN` (bitmask, combinable).
Proposed: `view: 'front' | 'rear' | 'plan'` (single-choice).

- Eliminates most of the print bugs noted in the row-builder plan (front/rear interleaving, plan sitting below walls, etc.) — whichever view is active takes the whole canvas.
- Plan view becomes full-canvas and self-contained; the invisible-drawable-area problem disappears because the 20 m × 20 m drawable area is the canvas.
- URL params simplify: `?view=plan` instead of `?front=1&rear=1&plan=1`.
- Versioning presets simplify: one layer `view` with three values instead of three bit layers.
- **Breaking change** for existing saved drawings/URLs — handle with a migration: read old bit flags, collapse to a single `view` (priority: plan > front > rear).

Users who previously relied on "front + rear at the same time" can compose this via the Page Editor with two viewports on a page (the better answer for drawing packages anyway).

### D2. Page model — new Firestore collection

```ts
// src/lib/types/pages.ts (new)
export interface Page {
  id: string                         // pageId
  projectId: string
  title: string                      // drawing title on the title block
  drawingNumber?: string             // e.g. "E-001"
  order: number                      // position in the parent drawing package (if any)
  /** Default scale applied to newly-created viewports. Each viewport stores its own `scale`. */
  paper: PrintSettings               // reuse existing type from $lib/ui/print/types
  titleBlock?: TitleBlockConfig
  viewports: Viewport[]
  notes?: string
  /** Whether this page is printed when its drawing packages are published. Default true. */
  includeInPackages?: boolean
  updatedAt?: number
  updatedBy?: string
  // Note: the "revision code" (A/B/C) shown on the title block is NOT stored here.
  // It comes from the page's `RevisionDoc` subcollection — see Versioning section.
}

export interface Viewport {
  id: string
  /** Position on the page paper, in mm from the paper top-left. */
  positionMm: { x: number; y: number }
  widthMm: number
  heightMm: number
  rotationDeg?: number               // 0/90/180/270
  /** Where to draw from. Discriminated union — one kind per tool + a few primitives. */
  source: ViewportSource
  /** Clip / crop within the source drawing's own coordinate space (mm). */
  sourceClip?: { x: number; y: number; widthMm: number; heightMm: number }
  /**
   * Drawing scale for this viewport — 50 = 1:50, 100 = 1:100, etc. Zero = "fit to viewport".
   * Independent of `Page.paper.scale`, which only seeds new viewports' default.
   */
  scale: number
  /** Optional viewport label (shown above the viewport frame). */
  label?: string
  /** Optional border / frame style. */
  border?: 'none' | 'thin' | 'thick'
  /**
   * When set, the viewport renders a frozen revision of its source. Absent = live-subscribed
   * to the source's current state. See the Versioning section for how publishing sets this.
   */
  sourcePin?: {
    drawingId: string                // target DrawingDoc id
    revisionCode: string             // e.g. 'A', 'B', 'C'
  }
}

export type ViewportSource =
  | { kind: 'rack-elevation'; rackDocId: string; face: 'front' | 'rear'; rowId?: string }
  | { kind: 'rack-plan';       rackDocId: string; rowIds?: string[] /* undefined = all rows */ }
  | { kind: 'frame-detail';    frameDocId: string; frameId: string }
  | { kind: 'fillrate';        projectId: string }
  | { kind: 'floorplan';       fileId: string; pageNum: number }
  | { kind: 'text';            content: string; fontSizePt?: number; align?: 'left' | 'center' | 'right' }
  | { kind: 'image';           url: string; fit?: 'contain' | 'cover' }

export interface TitleBlockConfig {
  /** Position on the page paper, mm from top-left. Defaults to bottom-right 180×60 mm. */
  positionMm?: { x: number; y: number }
  widthMm?: number
  heightMm?: number
  template: 'standard' | 'compact' | 'custom'
  /** Per-field overrides; anything not overridden falls back to project/page defaults. */
  fields?: Record<string, string>
}
```

**Storage:** `pages/{projectId}_{pageId}` — one doc per page (simple subscribe patterns, cheap). Pages are ordered via their `order` field; drawing packages just filter + sort this collection by `projectId`.

### D3. Viewport renderers — one per source kind, under `drawings/parts/viewports/`

Each viewport kind gets a Svelte component with a **common interface**:

```ts
interface ViewportRenderProps {
  viewport: Viewport
  /** Fresh live data for this viewport's source — loaded by the page editor. */
  sourceData: unknown
  /** Scale factor to apply — mm in source → mm on paper. Derived from viewport.scale. */
  renderScale: number
  /** Bounding rect of the viewport on the paper (mm), for clipping. */
  paperRect: { x: number; y: number; widthMm: number; heightMm: number }
  /** true when printing; renderers may hide selection/UI chrome in print mode. */
  printMode: boolean
}
```

Components:
- `RackElevationViewport.svelte` — wraps a cleaned-up version of the existing elevation renderer. Takes `rackDocId`, `face`, optional `rowId` (or all rows). Renders the elevation inside its viewport rect with its own clip.
- `RackPlanViewport.svelte` — same shape, for plan view. **Supports multi-row** — you can pass `rowIds: ['rowA', 'rowB']` and the two rows sit side-by-side (or at their plan positions).
- `FrameDetailViewport.svelte`, `FillrateViewport.svelte`, `FloorplanViewport.svelte` — thin wrappers over each tool's existing renderer.
- `TextViewport.svelte`, `ImageViewport.svelte` — primitives for notes / legends / logos.

The **existing** `RackElevations.svelte` and `RackPlan.svelte` components get refactored so the render logic (SVG + positioning) is separated from the Canvas-specific (pan/zoom/drag handlers) logic. The Rack tool's canvas and the Page Editor's viewport both embed the same render primitives, but with different wrappers.

### D4. Page Editor UI — new route `/projects/[pid]/drawings/pages/[pageId]`

Layout: sidebar (viewport palette + page properties) | main canvas (paper + viewports).

**Main canvas** (new `PageCanvas.svelte` in `drawings/parts/`):
- Reuses `PrintPaper` from `$lib/ui/print` for the paper outline + margins + scale label.
- Pan/zoom (SvelteKit-standard — same `Canvas.svelte` pattern).
- Viewports render as framed rectangles with their source content inside. In edit mode, each viewport has drag handles for move / resize; rotate via the properties panel.
- Title block renders as a special "pinned" viewport in the bottom-right by default.
- Print button triggers `triggerPrint` with the paper settings.

**Sidebar:**
- **Add Viewport** palette — one button per source kind. Click → opens a form (choose source doc, preset, size), then drops the new viewport at a default position.
- **Selected viewport** properties — position / size / rotation / scale / source settings / label / border.
- **Page properties** — title, drawing number, revision, paper settings (uses existing `PrintToolbar`).
- **Drawing package** — links/buttons to add this page to a package, reorder, navigate to other pages in the same package.

### D5. Drawing packages

Proposal: a **package** is just a tag + order on pages. Minimal schema, maximum flexibility.

```ts
export interface DrawingPackage {
  id: string                         // packageId
  projectId: string
  name: string                       // e.g. "Issue for Construction — Rev A"
  revision: string
  /** Ordered list of page ids. */
  pageOrder: string[]
  createdAt?: number
}
```

Packages live in `drawingPackages/{pid}_{packageId}`. The "Export Drawing Package (PDF)" action reads a package, iterates `pageOrder`, and renders each page sequentially into one PDF via a specialized print flow.

This decouples page *authoring* (one-off, ad-hoc) from package *assembly* (curated, revisioned). A page can belong to multiple packages.

---

## Reuse from existing code

| Existing | Reused by Page Editor | Notes |
|---|---|---|
| `$lib/ui/print/PrintPaper.svelte` | Paper outline in `PageCanvas` | No change needed. |
| `$lib/ui/print/PrintToolbar.svelte` | Paper settings in sidebar | No change needed. |
| `$lib/ui/print/types.ts` | `PrintSettings` reused as `Page.paper` | No change needed. |
| `$lib/ui/print/print-handler.ts` | Print trigger for single page | Extend with `triggerPackagePrint(pages)` for multi-page sequential rendering. |
| `outlets/parts/OutletCanvas.svelte` | Pattern only — do not import | Shows how to embed `PrintPaper` inside a pan/zoom canvas with calibration-based `toPx`/`toMm`. Page Editor is simpler (no PDF underlay / calibration — paper IS the drawing surface). |
| `racks/parts/RackElevations.svelte` | Refactor → `RackElevationRenderer.svelte` (pure render) + keep interactive behaviour in the racks tool | Extract the drawing primitives (rack frames, device rects, dimension lines) into a component that takes data + a viewport rect. |
| `racks/parts/RackPlan.svelte` | Same refactor treatment | Drawing tools (wall/door/rect) stay in the racks tool; viewport version is read-only. |
| `racks/parts/types.ts` | `RoomObject`, `RackRow`, `RackConfig` read in viewport | No change. |
| `versioning/service.ts` + `DrawingDoc` | Existing drawing records become lightweight pointers — each `DrawingDoc` can gain an optional `pageId?: string` for "this drawing is edited as a Page". Tool-scoped drawings (racks/frames tools) keep working as today. | Additive — no breaking change. |

## New files

```
src/lib/types/pages.ts                                         # Page + Viewport + TitleBlock types
src/lib/pages/service.ts                                       # createPage / subscribePage / savePage / ...
src/lib/pages/package-export.ts                                # multi-page PDF export
src/routes/projects/[pid]/drawings/pages/[pageId]/+page.svelte # editor entry
src/routes/projects/[pid]/drawings/parts/PageCanvas.svelte     # paper + viewports pan/zoom
src/routes/projects/[pid]/drawings/parts/ViewportFrame.svelte  # positioned/resized wrapper with drag handles
src/routes/projects/[pid]/drawings/parts/ViewportProperties.svelte
src/routes/projects/[pid]/drawings/parts/AddViewportPalette.svelte
src/routes/projects/[pid]/drawings/parts/PageProperties.svelte
src/routes/projects/[pid]/drawings/parts/TitleBlock.svelte
src/routes/projects/[pid]/drawings/parts/viewports/RackElevationViewport.svelte
src/routes/projects/[pid]/drawings/parts/viewports/RackPlanViewport.svelte
src/routes/projects/[pid]/drawings/parts/viewports/FrameDetailViewport.svelte
src/routes/projects/[pid]/drawings/parts/viewports/FloorplanViewport.svelte
src/routes/projects/[pid]/drawings/parts/viewports/TextViewport.svelte
src/routes/projects/[pid]/drawings/parts/viewports/ImageViewport.svelte
src/routes/projects/[pid]/drawings/parts/viewports/FillrateViewport.svelte  (stub for later)
src/routes/projects/[pid]/drawings/packages/[packageId]/+page.svelte        (package editor + export)
```

## Changes to existing files

- `racks/parts/types.ts` — change `VIEW_FRONT/REAR/PLAN` bits to a `RackView = 'front' | 'rear' | 'plan'` enum + migration helper.
- `racks/Racks.svelte` — swap view bitmask for a single-view enum; RoomSelector becomes radio buttons.
- `racks/+page.svelte` — parse `?view=` URL param (backwards-compatible fallback reading old `?front=/?rear=/?plan=`).
- `lib/versioning/adapters/racks.ts` — preset layers simplify to `{ view: 'front' | 'rear' | 'plan' }`.
- `racks/parts/RackElevations.svelte` + `racks/parts/RackPlan.svelte` — refactor to expose pure-render subcomponents; edit handlers stay in the racks tool's tree.

---

## Implementation Milestones

### P1 — Rack canvas simplification (standalone, ships independent value)
- Radio-style view switcher on the racks canvas.
- URL param + versioning preset migration.
- Print bugs fixed by design (single view = single layout).

### P2 — Page model + storage
- `Page` / `Viewport` / `TitleBlock` types.
- `lib/pages/service.ts` — CRUD + subscribe.
- **On page create, auto-create a matching `DrawingDoc` with `toolType: 'page'`** so it flows into the drawing list and the versioning system. `ToolType` union gets `'page'` added; `drawingToolHref('page', …)` returns `/projects/{pid}/drawings/pages/{pageId}`.
- Add `meta['page']` entry in `lib/versioning/adapters/index.ts` with `scope: 'project'`.
- Firestore rules added for `pages/` collection.
- Drawing list row actions for page rows: **Open page editor** + a **"Include in packages"** checkbox inline.

### P3 — PageCanvas foundation
- `PageCanvas.svelte` with paper + pan/zoom + add/select/move/resize viewport frames.
- No source rendering yet — just empty boxes with labels ("rack-elevation: Floor 2 Room A Row A").

### P4 — Renderer refactor
- Extract `RackElevationRenderer.svelte` and `RackPlanRenderer.svelte` from the current racks components so they can render inside any bounding rect.
- Racks tool switches to using these renderers; no change in observable behaviour there.

### P5 — Core viewport kinds
- `RackElevationViewport`, `RackPlanViewport` (multi-row), `TextViewport`, `ImageViewport`.
- Add-viewport palette wires each kind to its creation form.

### P6 — Title block
- `TitleBlock.svelte` with 'standard' / 'compact' code-defined templates.
- Layout is hard-coded in the component (grid of fields — project name, drawing number, revision from current `RevisionDoc`, scale, paper size, date, drawn/checked/approved initials, client logo slot).
- Project-level defaults (project name, author, address, logo) pulled from the project doc.
- Per-page overrides via `titleBlock.fields`.
- *Backlog:* **visual block editor** — let project admins drag-design custom title blocks (company-specific headers, custom field sets, logo placement) without touching code. Stored as a `TitleBlockTemplate` doc, referenced by `titleBlock.template` when set to a custom id.

### P7 — Remaining viewport kinds
- `FrameDetailViewport`, `FillrateViewport`, `FloorplanViewport`.

### P7.5 — Page publishing + viewport pin-on-publish
- Implement the publish flow described in the Versioning section: walk each live viewport, find-or-create a source `RevisionDoc`, write `sourcePin` into the page revision snapshot.
- `pagesAdapter` with `serialize` that includes pinned viewport sources keyed by viewport id.
- "N changes since pin" badge logic on stale viewports.
- Version panel wired up for pages (uses the generic version panel already used by other tools).

### P8 — Drawing packages
- `DrawingPackage` collection + CRUD.
- Package editor page (reorder pages, set cover/rev).
- Bulk publish: for each page in the package with `includeInPackages === true`, call the page-publish routine, then concatenate pinned renders into one PDF.
- Multi-page PDF export via sequential print or a batched approach.

---

## Settled Decisions

1. **Page scale is just the default** used when creating new viewports. Each viewport carries its own `scale` — a detail callout at 1:20 can sit alongside a plan at 1:100.
2. **Title block uses a code-defined layout** for v1 (a Svelte component with fixed zones for the usual fields). *Backlog:* add a visual block editor later so project admins can design custom title blocks without code changes.
3. **Every page appears in the drawing list.** A `DrawingDoc` record is auto-created when a page is created (with `toolType: 'page'` — a new value in the ToolType union). Each page has an **"include in published packages"** boolean (default `true`) that controls whether it's printed when a drawing package is exported.
4. **Print scale fidelity:** at print time, 1 mm in source = 1 mm on paper × (1 / viewport.scale). Reuse the `triggerPrint` / `updatePrintStyles` pipeline from `$lib/ui/print` — simpler than `OutletCanvas` because the paper IS the coordinate space (no PDF underlay calibration needed).

See the next section for versioning — this needed more thought than the other questions.

## Versioning across viewports

### The problem

A page has viewports pointing to source drawings in other tools. Each source already has its own versioning (`DrawingDoc` + `RevisionDoc` subcollection). The page itself also needs revisions. Three things interact:
1. When a source drawing changes, does the page see the new version immediately?
2. When you publish a revision of a page, does it freeze the viewports' source data so the revision is reproducible?
3. How do you compare "page rev A" vs "page rev B" — structural differences plus source data differences?

### Strategy: live by default, pin on publish

**Authoring** (default state while someone is designing the page):
- Every viewport is **live-subscribed** to its source doc — it shows whatever the source currently contains.
- No `sourcePin` set.
- Editing the page's structure (move/add/remove viewports, change layout) creates autosave writes like any other tool.

**Publishing** (creating a page revision, typically via the version panel or when assembling a drawing package):
- Walks every live viewport on the page.
- For each, ensures the source drawing has a revision at its current state (creates one automatically, labelled like `Auto — pinned for {Page.title} rev {Rev.code}` if no revision at current state exists; otherwise references the latest existing revision).
- Writes each viewport's `sourcePin: { drawingId, revisionCode }` into the snapshot stored on the page's `RevisionDoc`.
- The page's current doc is not modified — viewports stay live for ongoing authoring.

**Viewing an older page revision:**
- Each viewport reads its `sourcePin` from the revision snapshot and loads that exact source revision's data.
- Renders read-only. "Jump to source" navigates to the source tool filtered by the pinned revision.
- An "N changes since pin" badge appears on pins that have been superseded — useful for deciding whether to re-publish.

**Promoting to a new page revision:**
- User edits the live page → autosaves land in the current page doc.
- "Publish revision" again → re-pins viewports to their current source state → new page `RevisionDoc`.

### Data model additions

```ts
export interface Viewport {
  // … existing fields …
  /**
   * When set, this viewport renders against a specific frozen revision of the source.
   * Absent = live (follow source's latest). Populated automatically when a page
   * revision is published; may also be set manually by the user via the viewport
   * properties panel ("Pin to version").
   */
  sourcePin?: {
    drawingId: string    // target DrawingDoc id
    revisionCode: string // e.g. 'A', 'B', 'C'
  }
}

export interface Page {
  // … existing fields …
  /** Whether this page is included when its drawing packages are printed. Default true. */
  includeInPackages?: boolean
  // Drop the old top-level `revision` field — revision data lives on RevisionDoc subcollection.
}
```

### Auto-creation of source revisions

When publishing a page revision, we may need to create revisions on source drawings that haven't been explicitly revised. To avoid polluting the version list with noise:

- Auto-created source revisions get a special flag `autoCreatedForPage?: { pageId: string; pageRevisionCode: string }` on the RevisionDoc.
- The version panel UI filters or visually dims auto-created revisions by default (toggle "show auto pins").
- If the source state is identical to the latest existing revision, we *reference* that one instead of creating a new revision.

### Adapter work

- New `pagesAdapter` in `src/lib/versioning/adapters/pages.ts` — its serialize/validate handles the Page type.
- `meta['page']` added to the `ToolType` registry: scope `'project'`, default presets like `{ name: 'As drafted', layers: { printable: true } }`.
- Per-page `buildSourceDocId` returns `pages/{pid}_{pageId}` (the storage doc for live page state).
- `pageRevision.snapshot` stores `{ page: Page, viewportSources: Record<viewportId, { drawingId, revisionCode }> }` — the viewport pins indexed for fast lookup.

### Open sub-questions

- Should creating a page auto-create a rev A immediately, or only on first "publish"? Lean **only on first publish** — a freshly-created page with no data isn't worth a revision.
- When a viewport's source drawing is *deleted*, the pinned revision is still reachable (revisions survive deletion), but "edit source" navigation is broken. Show a warning badge and allow the user to replace the viewport source with something current.

---

## Other settled questions

- **Pages flow into the drawing list unchanged** — `DrawingList.svelte` just needs to handle `toolType: 'page'` (different row actions — "open page editor" instead of "open in tool"). Revisions render the same way they do for other tools.
- **Publishing workflow for drawing packages** — a future `packages/[packageId]/+page.svelte` view filters `Page[]` by `projectId + packageId + includeInPackages === true`, sorts by the package's `pageOrder`, and calls a bulk-publish routine that walks each page, calls the page-publish logic above, then concatenates the resulting pinned renders into one PDF.

---

## Known follow-ups

### Viewports — missing renderers

Existing `ViewportSource` kinds have renderers, but some are placeholder-level and several tools are entirely unrepresented. Everything below adds a new file under `src/routes/projects/[pid]/drawings/parts/viewports/` plus a new branch in `ViewportSource` + `ViewportFrame` dispatch + sidebar source picker.

- **`frame-detail` — full port-grid fidelity.** `FrameDetailViewport.svelte` currently renders a panel-summary card (RU + coloured bar + port count) because the real frames tool derives its visual from a fan-out of racks docs + `engine.ts#generatePortLabels` + `generateRacks`. A full viewport needs to replicate that pipeline: subscribe to all `racks/{pid}_F{NN}_R{A..D}` docs for the frame's floor, build `allLabels`, derive the matching `RackData` for the requested `frameId`, then mount `FrameDrawing.svelte` read-only inside the clipped viewport. Worth building when users need printable patch schedules on a page.
- **`outlets` viewport** (missing kind). Represents low-level outlet plans and high-level trunk-route plans from the Outlets tool. The tool already calibrates floorplans against a PDF underlay, so the viewport should reuse `OutletCanvas`'s SVG output layer with the PDF disabled (or as a faint background) plus the view-preset layers (`lowOutlets`, `highTrunks`). Probably becomes two `ViewportSource` kinds (`outlets-floor` and `outlets-trunks`) so one page can show both at different scales.
- **`patching` viewport** (missing kind). Renders a patch-schedule extract — typically a paginated table of panel ports, source labels, destinations, cable types, and notes for a floor+room. Should wrap the existing Patching tool's schedule table component, filter by the viewport's (floor, room, frame) scope, and apply the print-friendly table styling already used in `patching/Patching.svelte`.
- **`survey` viewport** (missing kind). Photo-survey album or single-photo embed. Two likely sub-forms: (a) a contact-sheet tile grid of photos for a scoped album (project / floor / room), (b) a single annotated photo with the current `AnnotationOverlay` pins rendered read-only. Data path: `survey/{projectId}/...` — same subscription model the survey tool already uses.
- **Rack elevation — multi-row / full-room composition.** `RackElevationViewport.svelte` renders one row at a time (first row when `source.rowId` is absent). A "full-room" mode that stacks all rows side-by-side matching the rack canvas's 'front' layout would be useful for summary pages.
- **Frame-rotation support.** All viewports ignore `viewport.rotationDeg`. Wrap the inner scaled container in a second `rotate({deg})` transform + swap width/height in 90° increments so sheets can host vertical callouts on landscape paper.

### Other known follow-ups

- **Rear-view wall positions** — `RackElevationRenderer.svelte` draws the left/right walls at the same x-coordinates in both `front` and `rear` faces. When viewing from the rear the room is mirrored, so walls (and rack x-positions) need to swap sides for the rear face to read correctly. Tracked inline via a `TODO` in the wall block.
- **Mixed-paper-size printing** — `@page` is applied globally per print job, so the package print preview forces the first page's size onto the entire job. True per-sheet sizing needs named `@page` rules + per-sheet `page` CSS properties.
- **Visual title-block editor** — explicit P6 backlog item. Lets project admins drag-design custom templates stored as `TitleBlockTemplate` docs and referenced by `titleBlock.template` when set to a custom id.
- **Stale-badge precision** — currently a boolean `latestRevisionCode !== sourcePin.revisionCode`. A "N versions behind" count would join `RevisionDoc.fromVersionId` → `VersionDoc.number` and compare against `DrawingDoc.currentVersionNumber`.

## Out of scope for this plan

- The M7 row-builder.md backlog item "multi-page drawing package export, one server room per page" — this becomes trivial once the Page Editor ships (just a package with one page per room, using a default template).
- Cross-tool editing from within a viewport — viewports are read-only windows into other tools' data. To edit the source, click through to the owning tool via a "jump to source" link. Implemented.
- Collaborative real-time editing of a page — Firestore already gives us last-write-wins eventual consistency; concurrent authoring on a single page is rare enough that we don't need OT/CRDT for v1. Not required.
