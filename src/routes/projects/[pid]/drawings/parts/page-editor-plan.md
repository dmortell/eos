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
  revision?: string                  // e.g. "A"
  order: number                      // position in the drawing package
  paper: PrintSettings               // reuse existing type from $lib/ui/print/types
  titleBlock?: TitleBlockConfig
  viewports: Viewport[]
  notes?: string
  updatedAt?: number
  updatedBy?: string
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
  /** Drawing scale ratio — 50 = 1:50, 100 = 1:100, etc. Zero = "fit". */
  scale: number
  /** Optional viewport label (shown above the viewport frame). */
  label?: string
  /** Optional border / frame style. */
  border?: 'none' | 'thin' | 'thick'
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
- Firestore rules added for `pages/` collection.

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
- `TitleBlock.svelte` with 'standard' / 'compact' templates.
- Project-level defaults (project name, author, address) pulled from the project doc.
- Per-page overrides.

### P7 — Remaining viewport kinds
- `FrameDetailViewport`, `FillrateViewport`, `FloorplanViewport`.

### P8 — Drawing packages
- `DrawingPackage` collection + CRUD.
- Package editor page (reorder pages, set cover/rev).
- Multi-page PDF export via sequential print or a batched approach.

---

## Open Questions

1. **Source freshness** — when a viewport shows "rack elevations floor 2 room A", does it live-subscribe to the racks doc (always current) or snapshot the data at placement time (stable, can be updated manually)? Recommend **live by default**, with an optional "pin to version" that references a `RevisionDoc` snapshot — matches the existing versioning story.
2. **Scale per viewport vs page** — viewports can have independent scales (e.g. a detail callout at 1:20 alongside a plan at 1:100). Confirm the paper's `scale` is just the *default* used when creating new viewports; each viewport carries its own.
3. **Title block authoring** — full template-editor with a visual designer, or just a JSON-configured layout in code for v1? Recommend **code layout** for P6, **template editor** later if needed.
4. **Drawings tool integration** — should every page automatically appear in the drawing list (`DrawingDoc` created on page creation)? Or are pages + drawings separate? Recommend **pages subsume drawings for page-edited tools** — a page gets a `DrawingDoc` record so revisioning / listing / linking keeps working unchanged, but tool-scoped drawings (e.g. rack elevation of a single room) stay as today.
5. **Print scale fidelity** — at print time, 1 mm in source must equal exactly 1 mm on paper × (1 / scale). Reuse the calibration pattern from `OutletCanvas` but simpler since paper IS the coordinate space.

---

## Out of scope for this plan

- The M7 row-builder.md backlog item "multi-page drawing package export, one server room per page" — this becomes trivial once the Page Editor ships (just a package with one page per room, using a default template).
- Cross-tool editing from within a viewport — viewports are read-only windows into other tools' data. To edit the source, click through to the owning tool via a "jump to source" link.
- Collaborative real-time editing of a page — Firestore already gives us last-write-wins eventual consistency; concurrent authoring on a single page is rare enough that we don't need OT/CRDT for v1.
