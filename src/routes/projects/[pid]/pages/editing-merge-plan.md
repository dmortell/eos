# Editing merge — one editing path for shapes, 3D objects and sheet viewports

**Status:** phases 0–2 DONE 2026-09-27 (CHANGELOG round 15); phases 3–4 open. Planned 2026-09-27. Asked for by Dave ("ctrl-drag should have been working on all shapes including
viewports — why separate move / drag / select functions?"). Supersedes the scattered todos it absorbs:
`todo.md` → "P1 — ONE editing path for paper space", "REFACTOR: unify editing" (the frame part) and "Unify PRIMARY
viewport … (d) PaperPage ↔ Viewport merge".

## 1. Goal

Every editing gesture and command works the same way on every editable thing, because there is ONE implementation of
it. A new gesture (e.g. Alt-click cycling) is written once and works everywhere. Concretely, a sheet viewport frame
gets, for free: Ctrl-drag copy, arrow nudge, marquee window / crossing, Shift-add / Ctrl-toggle multi-select,
align / distribute, Delete, Ctrl+C / X / V / D, grid snap, and MOVE / COPY / ARRAY / ERASE / ALIGN on the command line.

Non-goals: changing what frames ARE (they stay page-model frames with nested viewports), the 3D engine, persistence.

## 2. Today — who implements what

| Gesture | 2D shapes (`ent`) | 3D objects (`obj`) | Sheet frames (`frame`) | Sections / guides |
|---|---|---|---|---|
| Click select, Shift / Ctrl toggle | vpInteraction `onDown` / `onClick` | vpInteraction (`pickObj`) | PaperPage `onSheetDown` (border band only, single) | vpInteraction (own branches) |
| Press-drag move (threshold) | `startEntDrag` / `onDragMove` | `moveModelItems` (vpModelEdit.ts, own `MDrag`) | PaperPage `startDrag` / `onDrag` | own drags |
| Ctrl-drag copy | `drag.dup` in `onDragMove` | — | `dupFrameInPlace` (+page, a patch) | — |
| Grips (resize / reshape) | `gripsFor` (grips.ts) | `modelGrips` (grips.ts) | `gripsLocal` rect branch + PaperPage `onDrag` | own |
| Marquee (window / crossing) | `onMarqueeUp` → `marqueeSelect` | (via entity marquee) | PaperPage `endMarquee` → `marqueeSelect` | — |
| Arrow nudge | `onKey` | — | — | — |
| Delete / Copy / Paste / Dup | `onKey` → editor.ents / docEdit | docEdit (objIds) | +page `onGlobalKey` → `frameClipKey`, `deleteSelAt` | editor.sel.delete |
| Align / distribute | Properties › ARRANGE (arrange.ts) | — | — | — |
| Snapping while moving | `snapDelta` (grid) + OSNAP for grips | `rndSnap` | `frameSnapDelta` (paper edges, margin, title block, 5 mm) | — |
| Command line (MOVE, COPY …) | `cmdTarget` (per viewport) | partly | — (no target on paper) | — |

Shared already: `beginPointerDrag` + `DragRegistry` (gestures.ts), the grips.ts rect maths, `marqueeSelect`, the
`selStore` Selection model (kinds `ent` / `obj` / `frame` / …). Everything else is written 2–3 times.

## 3. Target design

### 3.1 Items and surfaces

- An **ItemSource** adapts one kind of editable thing to the engine (`ui/items.ts`):
  ```ts
  interface ItemSource<T> {
    kind: SelKind                       // 'ent' | 'obj' | 'frame' | …
    multi: boolean                      // joins Shift / Ctrl multi-select + marquee
    list(): readonly T[]                // paint order (last = on top)
    id(t: T): string
    bbox(t: T): Box                     // surface coords, for marquee / align / nudge-snap / zoom-to
    hit(t: T, p: Pt, tol: number): 'body' | 'none'   // frames: the BORDER BAND only (interior passes through)
    grips(t: T): Grip[]                 // the existing grips.ts Grip = { x, y, apply(p) }
    translate(t: T, dx: number, dy: number): T
    duplicate(ts: T[], newId: () => string): T[]     // Ctrl-drag / Ctrl+D (frames: carry their content view)
    canMove?(t: T): boolean             // a locked frame / locked layer: selects, never drags
    snap?: SnapProvider                 // frames: paper edges + margin + title block + 5 mm; shapes: grid + OSNAP
    commit: { begin(): void; update(ts: T[]): void; add(ts: T[]): void; remove(ids: string[]): void; end(label: string): void }
    clipboard?: { copy(ids: string[]): void; paste(at?: Pt): string[] }   // system-clipboard format stays per kind
  }
  ```
  `commit` keeps each kind on ITS OWN history channel (shapes / objects → the model timeline via `edit.begin/mark/end`;
  frames → the page history via `ensureHist` / `setFrames` / `recordEdit`) — the engine never knows which.
- A **Surface** is where items live and are picked: `{ toSurface(clientX, clientY): Pt; tol(px): number; selKey: string;
  sources: ItemSource[] (hit priority order); env (snap / ortho toggles) }`. Two surfaces:
  - **Viewport surface** (today's VpView): sources = [ents, objs] (+ sections / guides later), drawing coords.
  - **Paper surface** (NEW): sources = [frames] (+ paper annotations later), sheet-area coords. Built in PaperPage
    from `frames`, `toSheet`, the paper snap lines.

### 3.2 The engine — `ui/itemEdit.svelte.ts`

One class, `ItemEditor(surface)`, owning ONLY the generic gestures, all through `beginPointerDrag` + one `DragRegistry`:
click-select (+ Shift add / Ctrl toggle), press-drag move with threshold, Ctrl-drag duplicate (copies on first move),
grip drag (with the source's `snap`), marquee (window L→R / crossing R→L, Shift / Ctrl unions), arrow nudge (grid
step, Shift × 10), Delete, Ctrl+C / X / V / D, and `arrange()` for align / distribute. Tool-specific behaviour
(drafting, text edit, image calibration, conduit branch / node split, section arrows, iso orbit) STAYS in
vpInteraction and runs first; vpInteraction hands everything else to its ItemEditor. PaperPage's hand-rolled
`onSheetDown` / `startDrag` / `onDrag` / `endMarquee` / `frameClipKey` / `dupFrameInPlace` are deleted.

### 3.3 Paper surface specifics

- **Coordinates:** keep sheet-area px internally (frames are stored in mm and converted in `frameToDoc`); the command
  line shows / takes paper **mm** (the surface converts at its edge).
- **Border band:** `hit()` returns body only on the band (`frameBorderHit` logic moves into the frame source); a press
  inside an inactive frame's interior falls through (no marquee, deselect) — double-click still activates.
- **Event routing rule:** a press inside the ACTIVE viewport belongs to that viewport's surface; everywhere else on the
  sheet to the paper surface. (Already the rule in `onSheetDown`; it becomes the one place that decides.)
- **Locked frames** (`canMove` false): selectable, not movable / resizable.
- **Frame snapping** becomes the frame source's `snap` provider (paper edges, margin, title block, 5 mm grid; Alt off).
- **Duplicate** carries the content view + orbit (`frameClipOf` / `applyClipViews` move into the frame source).
- **Viewport tool:** creating a frame uses the RECTANGLE tool's gesture (ACAD two-click / EOS press-drag) on the paper
  surface, instead of the bespoke marquee (the old todo).

### 3.4 Command line on paper

With no active viewport, `cmdBus.target` becomes a **paper cmdTarget** built on the paper surface: ERASE, MOVE,
COPY (+ multiple), ARRAY, ALIGN, DIST, ZOOM, Z-order, and select-by-point work on frames (units: paper mm). Commands a
frame can't do (ROTATE, SCALE, MIRROR, TRIM …) answer "Not on paper — enter a viewport (double-click it)".

## 4. Phases (each one commit, green gate, live-checked)

**Phase 0 — characterization tests (S).** Pin today's behaviour before moving code: frame move / resize / snap / lock /
marquee / band-only hit / Ctrl-drag copy / copy-paste keeps view; entity move / Ctrl-drag / marquee / nudge / delete.
Pure tests where the logic is pure (hit, snap, marquee, duplicate), plus a scripted live check list (§6).

**Phase 1 — extract the engine for SHAPES (M).** Write `ItemSource` + `ItemEditor`; implement the `ents` source over
VpView; route vpInteraction's select / move / Ctrl-drag / grips / marquee / nudge / delete / clipboard for entities
through it. **No behaviour change** — the Phase 0 tests stay green. vpInteraction shrinks.

**Phase 2 — the PAPER surface (M).** The `frames` source + paper Surface in PaperPage; delete PaperPage's bespoke
interaction and `dupFrameInPlace` / `frameClipKey`; frames join multi-select (`'frame'` into `MULTI` in
selection.ts) → marquee / Shift-select / align / nudge / Ctrl+D on several frames. Properties shows a multi-frame
panel (common scale / border / lock).

**Phase 3 — 3D OBJECTS (M).** The `objs` source (plan + elevation; iso keeps its face-pick) replaces `MDrag` /
`moveModelItems` / `endModelMove` for body moves (connection-follow + join-on-drop stay as the source's `commit`
hooks). 3D objects get arrow nudge, Ctrl-drag copy, align / distribute, and mixed marquee with shapes (a selection may
then hold ents + objs — decide in this phase whether to lift the one-kind rule; recommended: yes, the engine
handles per-kind commit).

**Phase 4 — paper command line + Viewport tool (S–M).** The paper cmdTarget (§3.4); the Viewport tool on the rect
gesture; Help / CHANGELOG.

**Phase 5 (optional, later) — paper annotations (S).** Text / lines / dimensions drawn on the paper itself (not in a
viewport): just an `ents` source on the paper surface with `space: 'paper'`. Also sections / guides as sources.

## 5. Risks and how they're handled

- **Two history channels** (page vs model): kept separate behind `commit`; a mixed selection records one step per
  channel — acceptable; document it.
- **Event routing** between the paper and an active viewport (and nested panzoom): one routing rule (§3.3), covered by
  Phase 0 live checks (drawing inside an active viewport must never start a paper marquee — a past regression).
- **Coordinate units** (paper px vs mm vs model mm): each surface converts at its edge; the engine is unit-free.
- **Svelte proxies:** sources hand the engine plain snapshots (`$state.snapshot`) for bases / copies — the known
  "mutating the raw object is a silent no-op" trap.
- **Hit tolerances:** each source keeps its current tolerance (band = 11 px, shapes 3.5 px, objects 4 px) — no feel
  change.
- **Scope creep:** Phase 1 must be behaviour-neutral; new abilities arrive only in Phases 2–4.

## 6. Live acceptance checklist (run after each phase, Test Project)

1. Shapes: click / Shift / Ctrl select; drag; Ctrl-drag copy; grip resize with OSNAP; marquee both directions; arrows
   (+ Shift); Delete; Ctrl+C / V (same model steps aside, other tab exact); undo each.
2. Frames: border select (interior doesn't); drag with paper snaps (Alt off); corner resize; locked frame won't move;
   Ctrl-drag copy keeps its view; Ctrl+C / V / D; Delete; marquee several → align tops → one undo; arrows nudge.
3. Routing: drawing a line inside an active viewport never selects / moves the frame; double-click enters / exits.
4. 3D objects (Phase 3): drag a box with a trunk attached (end follows); drop a trunk end on another (joins); arrows.
5. Paper command line (Phase 4): with no active viewport, `M` moves the selected frame by `@50,0` (paper mm); `ERASE`.

## 7. Size

Phase 0 S · Phase 1 M · Phase 2 M · Phase 3 M · Phase 4 S–M → about 3–4 focused days. Phases 0–2 alone deliver
what Dave asked for (frames behave like shapes); 3–4 finish the job.
