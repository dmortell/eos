# Pages — `ui/Viewport.svelte` split (review.md §R1) — implementation plan

Written 2026-09-22 against `Viewport.svelte` @ a927094 (2124 lines). Line numbers below are from
that revision; expect ±10 drift once the in-flight bug fixes (B1, B2, B4, B5, B6 — another
session) land. **No code was changed for this plan.**

Goal: `Viewport.svelte` ≤ ~600 lines = props + one `Mapper` per event + pointer/key dispatch +
the SVG skeleton. Everything else becomes plain `.ts` modules that take an explicit **view
context** instead of reading component closure state, so they are unit-testable and shared with
`PaperPage` (R8) and `PropertiesPanel` (which already duplicates `bbox`).

---

## 0. The two shared shapes every module takes

```ts
// ui/view.ts (new, tiny — types only)
import type { Dir, Model, Clip } from '../3dview/types'
import type { ElevDir, Pt } from './geometry'

/** What a hit/grip/snap function needs to know about the view it runs in. Built once per
 *  render from the Viewport props ($derived), passed explicitly. No component state inside. */
export type ViewCtx = {
  dir: Dir                      // 'plan' | ElevDir | 'iso'   (today `kind`, with 'floorplan' → 'plan')
  isPlan: boolean; isElev: boolean; isIso: boolean
  elevDir: ElevDir              // valid when isElev (defaults 'front')
  cx: number; cy: number        // PLAN_CX / PLAN_CY (scale pivot)
  ground: number                // GROUND
  frameId?: string              // for `space: 'view:<id>'` scoping
  mdl: Model | undefined        // the model this viewport renders (objects, ents, guides, sections after B5)
  yaw: number; pitch: number    // iso camera
  modelLayerVisible: (o: Obj) => boolean
  snapStep: number              // SNAP_STEP (100)
}

/** Per-event coordinate mapping (see §2). */
export type Mapper = {
  toModel(clientX: number, clientY: number): Pt          // today toLocalXY
  toClient(x: number, y: number): { x: number; y: number } // today localToClient
  tolMm(px: number): number                              // screen px → UNSCALED model mm  (hitTol(px)/dscale)
  paperMm: number                                        // model mm per paper mm (B2 fix; = 1/dscale on paper)
  gripMm: number                                         // today gripSize (HANDLE_PX in model mm)
  screenPxPerMm: number                                  // view.zoom * m.scale * dscale (for strokes ÷ canvasZoom)
}
```

`ViewCtx` replaces the component-level `$derived`s `isElev`, `elevDir`, `isPlan`, `viewSpace`,
`mdl`, `modelEditable`, `modelLayerVisible`, and the `CX/CY` consts. Build it in Viewport as
`const ctx = $derived<ViewCtx>({ … })` and pass `ctx` as the first argument everywhere.

---

## 1. `ui/annotations.ts` — pure annotation geometry  *(step 1, no deps)*

| Move (current name, line) | New signature |
|---|---|
| `arrowPts(from, to)` `:1312` | `arrowPts(from: Pt, to: Pt, size: number): string` — `size` = arrow length in model mm (caller passes `3 * mapper.paperMm` after B3; today `gripSize`) |
| `cloudPath(a, b)` `:1321` | `cloudPath(a: Pt, b: Pt, bump: number): string` — `bump` = target diameter (model mm) |
| `sectionArrowFor(c, dir)` `:656` | `sectionArrowFor(clip: Clip, dir: ElevDir, size: number): string` — `size` replaces the internal `hitTol(11)/dscale` |
| `groundPts(e)` `:1301` | `groundPts(e: Ent): { pts: Pt[]; closed: boolean }` (unchanged; pure) |
| `centerCorners(c, p)` `:65` | `centerCorners(c: Pt, p: Pt): [Pt, Pt]` |
| `orthoPt(a, p)` `:68` | `orthoPt(a: Pt, p: Pt): Pt` |
| `constrainPt(a, p, shift)` `:184` | `constrainPt(tool: string, a: Pt, p: Pt, shift: boolean): Pt` (was reading `tool` from closure) |

Deps: `./geometry` only. Render snippets and `place.ts` call these.
**Check stays green:** pure moves; update the 8 call sites (`drawn` ×5, `drawnGround`, `preview`,
`onClick`/`onMove`/`reconstrain` for `constrainPt`).

---

## 2. `ui/mapper.ts` — coordinate mapping, built once per event  *(step 2)*

| Move | New signature |
|---|---|
| `vbMap()` `:146`, `clientToVB()` `:151`, `toLocalXY()` `:156`, `toLocal(e)` `:160`, `localToClient()` `:162`, `hitTol()` `:448`, `gripSize` `:1319` | `makeMapper(a: MapperArgs): Mapper` where `MapperArgs = { rect: DOMRect; vbW; vbH; minX; minY; view: View; scaleN: number; cx; cy; canvasZoom; pxPerUnit: number; onPaper: boolean }` |

`makeMapper` reads `svg.getBoundingClientRect()` **once** (the caller passes `rect`), then every
`toModel/toClient/tolMm` is arithmetic — this is P1 (findSnap/pick did a layout read per point).
Viewport keeps a `$derived` "static" part (`vbW`, `minX`, …) and does
`const m = makeMapper({ rect: svg.getBoundingClientRect(), … })` at the top of `onDown`,
`onMove`, `onClick`, `onDblclick`, each drag-move handler, and for the `$derived` overlays
(`scaleGeom`, `secToolbar`) — those two keep their own `getBoundingClientRect()` since they run
outside events.

**B2 is committed (bf214ef) — the formula the mapper implements:**
- `pxPerUnit = boxW ? PAPER_PX_PER_MM : BASE` (`Viewport.svelte:145`): a paper frame (parent
  passes `boxW/boxH` in paper px) uses `PAPER_PX_PER_MM` (960/420 = 2.2857); a standalone /
  full-size viewport keeps `BASE` (1.84). `MapperArgs.pxPerUnit` carries this choice; `onPaper =
  !!boxW`.
- `vbW = (boxW ?? vpW) / pxPerUnit` (`:146`); `gripMm = HANDLE_PX / pxPerUnit / view.zoom /
  canvasZoom / dscale` (`:1319`).
- `screenPxPerMm = pxPerUnit · dscale · view.zoom · canvasZoom` (dscale = 1/N).
- `paperMm` (paper mm per model unit) = `modelUnitToPaperMm(scaleN)` = `1/N` on a paper frame;
  for a standalone viewport there is no paper, so `paperMm = modelUnitToPaperMm(scaleN)` still
  (annotations then size as if printed at the chosen scale) — B3 relies on this.
- Reuse `constants.ts` `modelUnitToPaperMm(N)` / `modelUnitToPaperPx(N)` (`constants.ts:23-25`,
  with `constants.test.ts`) instead of re-deriving; `mapper.test.ts` builds on those tests.

Deps: `./geometry` (Pt, View). Everything below takes a `Mapper`.
**Check stays green:** keep thin wrappers in Viewport for one commit
(`const toLocalXY = (x, y) => m().toModel(x, y)` where `m()` builds a mapper lazily), then
delete them when steps 3–7 have switched call sites.

---

## 3. `ui/hit.ts` — hit-testing + bbox + one `pickAt`  *(step 3)*

| Move | New signature |
|---|---|
| `onPlanPlane`, `inScope`, `inThisView`, `groundInIso`, `isFlatElev` `:397-407` | `onPlanPlane(e)`, `inScope(e, frameId?)`, `inThisView(ctx, e)`, `groundInIso(ctx, e)`, `isFlatElev(ctx, e)` |
| `flatXSpan(e)` `:409` | `flatXSpan(ctx, e): [number, number]` (wraps `geometry.flatSpan`) |
| `rotCenter(e)`, `rotatePt(p, c, deg)` `:412-413` | `rotCenter(ctx, e): Pt`, `rotatePt(p, c, deg): Pt` (pure; `rotCenter` needs `bbox`) |
| `isFilled`, `inBox` `:417-424` | unchanged, pure |
| `hitEnt(e, p, thr)` `:425` | `hitEnt(ctx, e: Ent, p: Pt, thr: number): boolean` |
| `pickable(e)` `:453` | `pickable(ctx, e, layers: { hidden(id?): boolean; locked(id?): boolean }): boolean` — pass the two layer predicates (from `layers.svelte.ts` today; from the model after R5) |
| `hit(p)` `:471` | `hitEnts(ctx, ents: Ent[], p: Pt, thr: number, pickable): string[]` — **iterate in paint order** (B7): caller passes `paintEnts` |
| `expandGroup(ids)` `:480` | `expandGroup(ents: Ent[], ids: string[]): string[]` |
| `bbox(e)` `:1643` | `bbox(ctx, e: Ent): [number, number, number, number]` — also replaces `PropertiesPanel.bbox` (B19) |
| `prismRect(o)` `:501` | `prismRect(ctx, o: Obj)` |
| `graphNodeDraw(n)` `:516` | `graphNodeDraw(ctx, n: GN): Pt` (+ export `GN` type) |
| `graphHit(o, p, thr)` `:549` | `graphHit(ctx, o, p, thr)` |
| `hitModel(p)` `:560` | `hitModel(ctx, p: Pt, thrMm: number): string \| null` — **thr in unscaled mm** (B9: today `hitTol(4)`) |
| `hitModelIso(p)` `:583` | `hitModelIso(ctx, p: Pt): string \| null` (P4: accept an optional precomputed `faces` list) |
| `hitSection(p)` `:611`, `sectionCorners(c)` `:624` | `hitSection(ctx, sections: SectionLike[], p, thrMm)`, `sectionCorners(c: Clip): Pt[]` |
| `hitGuide(p)` `:716` | `hitGuide(guides: Guide[], p: Pt, thrMm: number): string \| null` |
| marquee test inside `onMarqueeUp` `:1666-1676` | `marqueeSelect(ctx, ents, a: Pt, b: Pt, pickable): string[]` (window vs crossing decided by `b[0] < a[0]`) |
| `pick(clientX, clientY)` `:1337` | `pickAt(ctx, m: Mapper, clientX, clientY, args: { ents; sel; paintEnts; sections; guides; selObj: Obj \| null; selSection; pickable; layers }): Pick` |

```ts
export type Pick =
  | { kind: 'grip';    id: string; gi: number }            // entity grip (selected entity)
  | { kind: 'mgrip';   grip: MGrip }                       // model-object grip (selected object)
  | { kind: 'sgrip';   id: string; gi: number }            // section corner
  | { kind: 'ent';     id: string }
  | { kind: 'guide';   id: string }
  | { kind: 'section'; id: string }
  | { kind: 'obj';     id: string }
  | null
```
`pickAt` encodes today's priority order from `onDown` (`:1452-1541`): model grip → section grip
→ entity grip → entity body → guide → section border → model object → nothing. `hoverBody` (P2)
becomes `pickAt(...) !== null`.

**B5 dependency:** after sections move into the model, `sections` comes from `ctx.mdl.sections`
and `SectionLike` = the model's `Section` type; `hitSection`'s array param stays so the function
is still testable with a literal list.

Deps: `./geometry`, `./view`, `./mapper` (type only), `../3dview/{projection,types}`.
**Check stays green:** move in the order listed (predicates → hitEnt → bbox → model → section/
guide → marquee → pickAt); Viewport call sites change from `hit(p)` to `hitEnts(ctx, paintEnts, p,
m.tolMm(3.5), pickable)`.

---

## 4. `ui/grips.ts` — grip definitions and constraints  *(step 4; needs hit.ts)*

| Move | New signature |
|---|---|
| `Grip` type `:1113`, `MGrip` type `:807` | exported |
| `ROTATABLE`, `canRotate(e)` `:1117-1119` | `canRotate(ctx, e, imgCropId: string \| null): boolean` |
| `rotGripLocal(e)` `:1122` | `rotGripLocal(ctx, e, gripMm: number, shift: () => boolean): Grip` — `shift` is a getter so the rotate-apply still reads live Shift |
| `setFlatX(e, edge, u)` `:1136` | `setFlatX(ctx, e, edge, u): Ent` |
| `gripsLocal(e)` `:1177` | `gripsLocal(ctx, e, opts: { gripMm; shift: () => boolean; imgCropId }): Grip[]` |
| `gripsFor(e)` `:1146` | `gripsFor(ctx, e, opts): Grip[]` |
| `constrainGrip(base, gi, p, shift)` `:1264` | `constrainGrip(ctx, base, gi, p, shift, opts): Pt` |
| `prismCorners(o)` `:781`, `applyPrismGrip(...)` `:790` | `prismCorners(ctx, o)`, `applyPrismGrip(ctx, o, gi, p, anchor, snap: (v) => number)` |
| `modelGrips(o)` `:808` | `modelGrips(ctx, o: Obj, opts: { snapNode; rnd }): MGrip[]` (door-swing + rotate handles included) |
| `pickModelGrip(...)` `:833`, `pickSectionGrip(...)` `:635`, `resizeSectionClip` `:630` | `pickModelGrip(m, grips, clientX, clientY): MGrip \| null`, `pickSectionGrip(m, clip, clientX, clientY)`, `resizeSectionClip(c, gi, p, anchor): Clip` |
| `branchNode(o, from)` `:841` | move to **place.ts** (it mutates the store) |

Grips that mutate the store (`modelGrips` apply, `graphNodeApply`) stay mutation-in-place —
that is the existing contract with `snapModels` undo; note it in the module header.

Deps: `./hit` (bbox, rotCenter, rotatePt, prismRect, graphNodeDraw, boxElev via geometry),
`./snap` (only `graphNodeApply` for node grips — so **step 5 before wiring model grips**, or
pass `apply` in via `opts`; the plan above passes `snapNode/rnd` in `opts` to avoid a cycle).
**Tests to add:** the verified 40° anchor invariance; Shift-square in the local frame; door swing
0–180 clamp.

---

## 5. `ui/snap.ts` — object / grid / node / depth snapping  *(step 5; needs hit.ts + mapper)*

| Move | New signature |
|---|---|
| `SNAP_STEP`, `snapToGrid(p)` `:66-67`, `rndSnap(v)` `:515` | `snapToGrid(p, step): Pt`, `rnd(v, step \| 0): number` |
| `entSnaps(e)` `:1062` | `entSnaps(ctx, e: Ent): { point: Pt; type: SnapType }[]` — **extend with model geometry** (K5): `objSnaps(ctx, o: Obj)` from `project(o, dir)` outline points + graph nodes |
| `findSnap(clientX, clientY, exclude?)` `:1077` | `findSnap(ctx, m: Mapper, ents, objs, clientX, clientY, opts: { exclude?: string; editingId?: string; radiusPx = 11 }): SnapHit \| null` — **returns** the mark instead of writing `snapMark` state; Viewport sets `snapMark = result` |
| `drawPoint(clientX, clientY, base?, shift)` `:1092` | `drawPoint(ctx, m, inputs: { osnap; snap; ortho; tool; ents; objs }, clientX, clientY, base?, shift?): { p: Pt; mark: SnapHit \| null } \| null` |
| `snapNode(p, exclude, origin?)` `:524` | `snapNode(ctx, p, exclude: GN, thrMm, brkMm, origin?): Pt \| null` |
| `graphNodeApply(n, p, origin?)` `:541` | `graphNodeApply(ctx, n: GN, p: Pt, opts: { snapNode; rnd }): SnapHit \| null` (returns the mark) |
| `elevDepthSnap(p)` `:993` | `elevDepthSnap(ctx, p: Pt, tolMm): { off; a; b } \| null` |
| `snapDelta(dx, dy, base)` `:1580` | `snapDelta(dx, dy, base: Ent, step \| 0): [number, number]` |

Deps: `./hit` (bbox), `./mapper`, `../3dview/projection` (for `objSnaps`).
State that stays in Viewport: `snapMark`, `depthSnapMark` (both become
`$state`/`$derived` fed by the return values).

---

## 6. `ui/place.ts` — entity/object builders and store mutations  *(step 6; needs snap.ts)*

| Move | New signature |
|---|---|
| `drawPlane()` `:200` | `drawPlane(ctx): 'plan' \| ElevDir \| undefined` |
| `place(a, b)` `:201` | `buildEnt(ctx, tool, a, b, opts: { centerDraw; uid }): Ent \| null` (rect/ellipse/line/dim/box) — pure; the model tools split out below |
| `finishPolyline()` `:217` | `polylineEnt(ctx, pts, uid): Ent \| null` + `trimTail(pts)` |
| `placeGraph(pts)` `:1017` | `graphObj(ctx, tool, pts: Pt[], opts: { guide: Guide \| null; depthSnap: (p) => number \| null; uid; layerId }): Obj` — pure builder; the toast + `addModelObj` stay in Viewport |
| `placePrism(a, b, layer, h, tag)` `:1042` | `prismObj(ctx, a, b, layer, h, uid, extra?): Obj` |
| `placeGuide(p, shift)` `:680` | `guideObj(ctx, p, vertical: boolean, id): Guide` |
| `addModelObj(o)` `:920`, `deleteModelSel()` `:929`, `deleteGraphNode(sel)` `:944`, `insertGraphNode(p)` `:961`, `branchNode(o, from)` `:841` | keep as **store mutations** but take `(mdl: Model, …)` + an `edit: { begin(); mark(label?); end() }` object instead of `on.beginedit/modeledit/endedit` — this is the seam R6 uses (`editor` prop) |
| `setImageOrigin(id, p)` `:688`, `applyScale()` `:704` | `imageWithOrigin(img, p): Ent`, `imageScaled(img, measured, real): Ent` (pure) |
| `moveEnt(en, dx, dy)` `:1565` | `moveEnt(ctx, en, dx, dy): Ent` |
| `applyDrag(p, shift)` `:1587` | stays in Viewport (reads `drag`), calls `grips.constrainGrip` + `snap.snapDelta` |
| `mUid`, `uid` `:918,:122` | delete; import `newId(prefix)` from a new `pages/ids.ts` built on **`nanoid`** (B13, Dave's preference) — also replaces `graph.ts newId`, `+page newId`, `guideId`, the `layers.svelte.ts` ids |

**B5 dependency:** `buildEnt` for `tool === 'Section'` currently calls `on.section?.(clip)`; after
B5 it becomes `sectionObj(ctx, a, b): Section` pushed into `mdl.sections` through the same
`edit` object. Coordinate the `Section` type name/fields with that session.

---

## 7. `ui/gestures.ts` — one pointer-drag helper  *(step 7; independent, mechanical)*

```ts
export type DragHandlers<T> = {
  onMove: (e: PointerEvent, s: T) => void
  onUp?:  (e: PointerEvent, s: T, moved: boolean) => void
  onCancel?: (s: T) => void            // second finger / Esc
}
export type DragHandle = { cancel(): void }
export function beginPointerDrag<T>(e: PointerEvent, state: T, h: DragHandlers<T>, reg: DragRegistry): DragHandle
export class DragRegistry { cancelAll(): void; active(): boolean; suppressClick: boolean }
```
`beginPointerDrag` does: `setPointerCapture` (try/catch for synthetic events), `preventDefault`,
window `pointermove`/`pointerup` listeners, a `moved` flag (with an optional px threshold —
give PaperPage's frame drag the 4 px it lacks, B19), registers itself so `cancelAll()` replaces
`cancelPointerDrag` (`:1360-1407`), sets `reg.suppressClick` when `moved`.

Replace, one per commit, checking after each:
1. `orbitDrag` `:900-914`  2. `secDrag` `:870-883`  3. `secResize` `:885-897`
4. `guideDrag` `:724-738`  5. `scaleDrag` `:697-703`  6. `mDrag` `:742-767`
7. `mGrip` `:849-866`  8. `marquee` `:1642-1680`  9. press-draw `:1623-1638`
10. `drag` (entity move/grip) `:1354-1619`.
The `pointers` Set + `$effect` `:1359,1408-1413` and `rDownPt` capture `:1417,1730` move into the
registry (`reg.noteDown(e)`, `reg.noteUp(e)`, `reg.multiTouch`).

Keep the Svelte delegation gotchas as comments in the module header: (a) the `.section-arrow.pick`
`closest()` bail in `onDown`/`onClick` (delegated handlers ignore the arrow's own
`stopPropagation`), (b) right-button presses never reach delegated `onpointerdown` because
`panzoom` stops them — hence the capture-phase `rDownPt`.

---

## 8. `ui/render/EntRender.svelte` — the `drawn` / `drawnGround` snippets  *(step 8, last)*

```svelte
<!-- <svelte:options namespace="svg" /> -->
let { e, ctx, selected = false, style, isoGround = null, imgCrop = null, clipNs }:
  { e: Ent; ctx: ViewCtx; selected?: boolean;
    style: { lwt: boolean; canvasZoom: number; paperMm: number; ink: string; sel: string; layerColor: (id?) => string | undefined };
    isoGround?: ((x: number, y: number) => Pt) | null; imgCrop?: string | null; clipNs: string } = $props()
```
Closure variables the snippets use today and how they arrive: `ink`/`w`/`fill` (computed inside
from `e` + `style`), `SEL`/`INK` (`style`), `lwt`, `canvasZoom`, `gripSize` → `style.paperMm`
(**B3**: all annotation sizes switch to paper mm here), `isFlatElev/flatXSpan/rotCenter/rotatePt`
(`hit.ts`), `textBox/boxFaces/boxElev` (`geometry`), `arrowPts/cloudPath/groundPts`
(`annotations.ts`), `imgEdit.mode/id` → `imgCrop`, `clipNs` (prop), `kind/isElev/elevDir` →
`ctx`. `preview`, `drawDot`, `crosshair` snippets stay in Viewport (they are tool UI, not content).
Optional follow-up: `DimRender`, `TextRender`, `ImageRender` sub-components if `EntRender` exceeds
~200 lines. `PaperPage`/`SheetRender` (X5 print) can then render entities without the editor.

---

## 9. Extraction order and check gates

Each step is one commit; run `NODE_OPTIONS=--max-old-space-size=8192 pnpm check` (dev server
stopped) + `pnpm test --project=server` before moving on. Steps 1, 2, 7 are independent of each
other; 3 → 4 → 5 → 6 are sequential; 8 needs 1 and 3.

| Step | Module | Blocked by | Green-check tactic |
|---|---|---|---|
| 0 | `ui/view.ts` types; `ctx` `$derived` in Viewport | — | additive only |
| 1 | `annotations.ts` | — | pure moves, update 8 call sites |
| 2 | `mapper.ts` | — (B2 landed) | keep `toLocalXY/localToClient/hitTol` wrappers for one commit |
| 3 | `hit.ts` | 2 | move predicates first, `pickAt` last; `PropertiesPanel.bbox` → `hit.bbox` |
| 4 | `grips.ts` | 3 | pass `snapNode/rnd` via `opts` to avoid a grips↔snap cycle |
| 5 | `snap.ts` | 3, 2 | `findSnap` returns the mark; Viewport assigns `snapMark` |
| 6 | `place.ts` | 5, **B5 Section type** | introduce the `edit` object; `on.beginedit/modeledit/endedit` become its three methods |
| 7 | `gestures.ts` | — | one drag machine per commit in the order of §7; `cancelAll` replaces `cancelPointerDrag` when the last one moves |
| 8 | `render/EntRender.svelte` | 1, 3, **B3 paperMm** | `svelte-check` will flag every missing prop; namespace `svg` required (memory: SVG gotchas) |
| 9 | delete wrappers, all id generators → `ids.ts` (`nanoid`), re-measure line count | all | target ≤ 600 lines |

Tests to add per step (P5): `annotations.test.ts` (arrow points, cloud sweep flag = 1, section
arrow direction per dir), `mapper.test.ts` (round-trip `toModel(toClient(p)) ≈ p` at zoom/dscale
combos; `tolMm` at 1:1 vs 1:100; the B2 "1000 mm at 1:100 = 10 paper mm" case), `hit.test.ts`
(outline-vs-fill, rotated rect, paint-order precedence B7, marquee window/crossing), `grips.test.ts`
(anchor invariance), `snap.test.ts` (osnap beats grid; `snapDelta` keeps shape; depth snap picks the
nearest segment in model space), `place.test.ts` (polyline tail trim, graph builder in elevation
with/without guide).

---

## 10. Signatures affected by the in-flight fixes (other session)

- **B2 (landed, bf214ef)** — `MapperArgs.pxPerUnit` + `scaleN` replace the earlier `base` idea
  (§2); `Mapper.paperMm` comes from `constants.modelUnitToPaperMm`; `EntRender.style.paperMm`
  (§8); `arrowPts/cloudPath/sectionArrowFor` `size` args (§1) will be fed `k · paperMm` instead
  of `gripSize` once B3 is done. Step 2 is no longer blocked.
- **B5 (sections into the model)** — `ViewCtx.mdl.sections` replaces the `sections` prop;
  `hitSection/sectionCorners/pickSectionGrip` take `Section[]`/`Clip` values (§3, §4); `buildEnt`'s
  Section branch becomes `sectionObj` (§6); `on.section*` callbacks collapse into the `edit`
  object. `secDrag`/`secResize` gestures (§7 items 2–3) then mutate `mdl.sections[i].clip` in
  place like guides.
- **B4/B6 (history/doc state)** — no signature impact on these modules; the `edit` object (§6)
  is the only touch point (`begin/mark/end` map onto whatever `+page` exposes after B4).
- **B1 (type imports)** — every new module imports `Ent/Pt/View/ElevDir` from `./geometry`, never
  from `Viewport.svelte`, so it is compatible with either outcome.


---

## 11. R1 close-out (2026-09-23)

Steps 0–9 are done. Commits, oldest first (all on `main`):

| Step | Module | Commits |
|---|---|---|
| 0 | `ViewCtx` / `MLayers` shapes (design only, no dedicated commit) | consumed starting step 3 slice 2 (`530ec40`) |
| 1 | `ui/annotations.ts` | `7562f8c` |
| 2 | `ui/mapper.ts` | `4ebef85`, `5206eb4` (wiring) |
| 3 | `ui/hit.ts` (+ `pickAt`) | `84c53a0`, `530ec40`, `cb41247`, `a5c6a2a`, `90373e7` |
| 4 | `ui/grips.ts` | `55a0742`, `bda942e`, `e694e94` |
| 5 | `ui/snap.ts` | `bc5615f`, `e4bccb0`, `c0828bd`, `2eda177` |
| 6 | `ui/place.ts` | `56c85ad` (extraction), `806dccd` (wiring) |
| 7 | `ui/gestures.ts` | `d36f5b8`, `72af7b5`, `b901686`, `f070ffc`, `d8d8f1c`, `200a3e9` |
| 8 | `ui/render/EntRender.svelte` | `17b5be8` (extraction), `29745b7` (wiring) |
| 9 | Wrapper cleanup (dead + single-call-site) | `36270d8` (part 1); mop-ups `8564e64`, `6542d5b` |

Beyond R1 proper, prep work landed in the same stretch: `snap.ts` gained `objSnaps` for K5
(model-object snapping), unwired — `fa982e7`, `8324721`.

### Deviations from the plan, and why

- **`drawPlane(ctx)` returns `ElevDir | undefined`, not `plan | ElevDir | undefined`.** The
  Viewport never produced the literal plan string — `undefined` already means plan/model-plane
  everywhere else (`onPlanPlane`) — so keeping `undefined` made every call site a byte-identical
  drop-in instead of introducing a second plan sentinel to normalise away.
- **`buildEnt` doesn't build Furniture/Opening prisms; `PRISM_TOOL` does.** Section 6 described one
  `buildEnt` covering rect/ellipse/line/dim "with the model tools split out below" — that split
  became a small lookup table (`PRISM_TOOL: Record<string, {layer, h, tag}>`) the caller reads
  before calling `prismObj`, rather than a second builder function, since the two prism tools
  differ only in three data fields.
- **Builders take `uid` as an injected function, not a name.** `buildEnt`/`polylineEnt`/`prismObj`/
  `graphObj` all take `uid: () => string` (or, for `graphObj`, `uid(prefix) => string`) instead of
  reading a module id generator — keeps them pure/deterministic under test and matches how B13
  centralised id generation in `ids.ts`.
- **`snapNode`/`graphNodeApply` take explicit `opts` objects, not raw closures.** `graphNodeApply`
  takes `{ snapNode, rnd }` rather than calling a Viewport-closure `snapNode`/`rndSnap` directly —
  same shape as passing `uid` to place.ts: the Viewport still owns the tolerances/state, but the
  pure function only sees the two operations it needs.
- **`gestures.ts`'s `thresholdPx` exists (per section 7 / the plan's note) but no call site uses a
  non-zero value yet.** The capability shipped and is tested (`beginPointerDrag` accepts
  `{ thresholdPx }`), but wiring PaperPage's frame drag onto a 4 px threshold (B19) is still open —
  it needs a decision on which drags should debounce, not just the mechanism.
- **Step 9 kept wrappers with 2+ call sites as named aliases; only dead code and single-call-site
  wrappers were removed/inlined in part 1** (`36270d8`). `hitEnt`, `pickable`, `hitSection`,
  `snapDelta`, `elevDepthSnap` (2 calls each) and the 3+-call ones (`rndSnap` 15, `drawPoint` 7,
  `inThisView`/`gripsFor`/`moveEnt` 4, `bbox`/`graphNodeDraw`/`hitModel`/`hitGuide` 3) are still
  named `const`s in `Viewport.svelte` — full inlining was never the goal past 1-call-site; the
  point was deleting the two genuinely dead ones (`inScope`, `prismRect`, unused anywhere) and the
  ones only adding a redirect over a single call.

### Line-count trajectory

| Point | Commit | `Viewport.svelte` lines |
|---|---|---:|
| Right before step 1 (R1 start) | `7562f8c^` | 2209 |
| Step 5 handoff (mid-snap.ts) | `a8edee2` | 1709 |
| Step 9 part 1 (current close-out point) | `36270d8` | 1365 |

Section 9's table set a **≤ 600 line** target after step 9. Current is **1365 — well above
target**; step 9 alone was never going to reach it (it only removes wrapper redirects). Getting
under 600 needs the structural moves section 9's own table already named as blocked on other
work: **B5** (sections into the model — removes the `sections` prop + `pickSectionGrip`/
`secToolbar`/`onSecDrag*`/`onSecResize*`, ~150 lines, see region 8 below) and **R6** (shrink
`VpOn`/the drag-state union, which is most of region 4 + region 8's drag-move/up handlers). R1's
extraction moved the REUSABLE logic out; what's left is mostly Viewport-specific orchestration
that R6 is the one to shrink.

### What the remaining 1365 lines ARE (measured, not estimated)

Region boundaries below are exact line ranges in `Viewport.svelte` at `36270d8`/current HEAD
(`8147fec`); template and CSS totals are exact, the 9 script regions are a partition of all but 2
of the 1085 script-body lines (the 2 are blank-line/tag-boundary slack, not missing logic):

| # | Region | Lines | % of script |
|---|---|---:|---:|
| 1 | Imports, props, env-flag `$derived`, viewBox/canvas state | 152 | 14% |
| 2 | Coordinate mapping + pan/zoom (`vbMap`…`onZoom`) | 42 | 4% |
| 3 | Draw/place tool dispatch (`place`, `finishPolyline`) | 17 | 2% |
| 4 | Pointer + keyboard EVENT HANDLERS (`onClick`/`onMove`/`onDblclick`/`onContext`/`onKey`/`onDown`/`onDragMove-Up-Cancel`/`onDrawMove-Up`/`onMarqueeMove-Up`) | 318 | 29% |
| 5 | Text-edit (`startTextEdit`/`commitText`) | 24 | 2% |
| 6 | Hit/pick wrappers + view-state `$derived` (`ctx`, `pickable`/`hit`/`expandGroup`, `isPlan`/`modelEditable`/`mlayers`, `hitModel`/`hitSection`, `pick`/`pickAt`, snap wrappers, `gripsFor`/`entStyle`/`isoGround`) | 216 | 20% |
| 7 | Model store mutations (`addModelObj`/`deleteModelSel`/`deleteGraphNode`/`insertGraphNode`/`branchNode`/`placeGraph`/`graphNodeApply`) | 100 | 9% |
| 8 | Section / guide / image-calibration / model-drag / orbit UI (`pickSectionGrip`, `secToolbar`, guide preview+drag, image origin/scale, model body+grip drag, section drag/resize, orbit) | 170 | 16% |
| 9 | Prompt / status-bar text `$derived` | 44 | 4% |
|  | **Script subtotal** | **1083** | **100%** |
|  | Template (`<svg>` markup) | 217 | — |
|  | `<style>` | 60 | — |
|  | **File total** | **1364** | — |

Notable for scoping R6/B5 from this data rather than guesses:

- **Region 4 (event handlers, 318 lines / 29%) is the single biggest block** and is exactly what
  R6 targets — `onDown` alone is ~101 lines because it still dispatches to every drag kind
  (`scaleDrag`/`guideDrag`/`mDrag`/`mGrip`/`secDrag`/`secResize`/`orbitDrag`/`drag`/`marquee`/
  press-draw) inline; step 7 moved the drag MECHANICS onto `beginPointerDrag`, but the dispatch
  switch and each drag's `onMove`/`onUp` callback bodies are still here by design (section 7 said
  the callback bodies stay in Viewport, just simpler).
- **Region 6 (216 lines / 20%) is almost entirely thin ctx-injecting wrappers** — the step-9
  survey (sent to eos-34 separately) has the per-wrapper call-site counts; this is where R6's
  "shrink `VpOn`" work will read from once the wrapper question is settled per-wrapper rather than
  in bulk.
- **Region 8 (170 lines / 16%) is B5's target almost exactly** — section marker UI
  (`pickSectionGrip`/`secToolbar`/`onSecDrag*`/`onSecResize*`) is ~65 of these 170 lines and
  disappears once sections live in the model with `Section[]`/`Clip` values instead of
  Viewport-local state (section 10). The rest (guide/image/model-drag/orbit) is not a B5 concern.
- **Region 7 (100 lines / 9%) is the "keep as store mutations" list section 6 already named** —
  `addModelObj`/`deleteModelSel`/`deleteGraphNode`/`insertGraphNode`/`branchNode` — still waiting
  on the `edit` object (`begin/mark/end`) that would let them move to `place.ts` per section 6's
  own table; not attempted in R1 since it needs the history/doc-state (B4) decision from section
  10 first.
- **Regions 1–3 + 5 + 9 (259 lines / 24% combined) are small, Viewport-specific, and not worth
  moving** — props/setup, coordinate mapping (already thin — mapper.ts did the real work), the
  2-line draw dispatch, inline text editing (DOM textarea positioning, inherently component-local),
  and the status-bar text. R6/B5 have nothing to gain from these.

---

# R8-lite — reuse the shared modules inside `PaperPage`, no Viewport merge

Rewritten 2026-09-23 per Dave's decision (relayed via eos-07) on the first draft of this section:
**not** the full "sheet becomes a `Viewport`" merge. His review of that draft found real gaps it
didn't cover — events inside a frame's content Viewport bubbling up to a wrapping paper Viewport,
both Viewports reacting to Delete/Esc, double pan/zoom (the pane canvas AND a paper-kind
Viewport's own view), and Viewport growing past its already-missed 600-line target. `PaperPage.svelte`
stays as today's thin per-sheet component, positioned by the pane canvas exactly as now. What
changes: its hand-written geometry/interaction code (hit test, corner-resize math, marquee) is
replaced by calls into `hit.ts`/`grips.ts`/`snap.ts`, so there's one implementation of each, not
two. Storage is untouched: `SheetFrame[]` stays in `PageDoc.frames` (`doc.svelte.ts`) — no `Ent`
role, no page model. Where a shared module wants an `Ent`-shaped or rect-shaped argument, PaperPage
builds one on the fly with a tiny local converter; nothing is stored that way.

## 0. What changes, module by module

- **`hit.ts` — no code change.** `inBox(p, x0, y0, x1, y1, thr, filled)` (`hit.ts:30-36`) already
  takes plain numbers, not an `Ent`. PaperPage's `onSheetDown` replaces its DOM-based `.vp-band`/
  `.vp-interior` hit test (two overlapping absolutely-positioned divs relying on the browser's own
  hit-testing) with an explicit pass over `frames` (topmost/last-drawn first, matching today's
  z-order) calling `inBox(p, f.x, f.y, f.x + f.w, f.y + f.h, bandMm, false)` — `filled: false` so
  the interior stays a hole (report "nothing hit" there → falls through to deactivate/deselect,
  same as today's `.vp-interior` branch), the border band picks within `bandMm` of the edge
  (paper-mm equivalent of the current CSS `border: 11px solid transparent` on `.vp-band`, `:216`).
  Double-click-to-activate is a SEPARATE check (any point inside the frame's outer rect, band or
  interior) — unchanged in spirit from today's `.vp-band`/`.vp-interior` both having their own
  `ondblclick={() => fon.activate?.()}`.
- **`hit.ts`'s `marqueeSelect` — reused as-is.** `marqueeSelect(ctx, ents, a, b, isPickable)`
  (`hit.ts:269-277`) takes `Ent[]` and calls `bbox(ctx, en)`, whose generic fallback branch
  (`hit.ts:72-73`, any type other than polyline/text/image) is just `[a[0], a[1], b[0], b[1]]` — a
  bare `{ id, type: 'rect', a: [f.x, f.y], b: [f.x + f.w, f.y + f.h] }` built per-frame on the fly
  satisfies it with no new hit.ts code. `isPickable` is `() => true` (frames have no layer to gate
  on). `ctx` is unused by this path (bbox's rect fallback reads no `ctx` field) — a throwaway
  `ViewCtx` stub is enough; no real view context exists for "paper space" and none needs to.
  **Behaviour change to flag**: `marqueeSelect` picks WINDOW (fully enclosed) vs CROSSING (any
  overlap) by drag direction (`b[0] < a[0]`, `hit.ts:271`) — today's `endMarquee` touch test
  (`PaperPage.svelte:125-126`) is direction-INSENSITIVE, always crossing-style. Adopting
  `marqueeSelect` makes a left-to-right marquee over a partially-covered frame stop selecting it.
  This is a real, user-visible behaviour change riding along with the refactor — call it out
  explicitly in the commit message; it's arguably an improvement (matches every other marquee in
  the app, including the entity marquee) but Dave didn't ask for it, so it shouldn't be silent.
- **`grips.ts`'s `gripsLocal`'s rect branch — reused via a fake rect `Ent`.** The rect branch
  (`grips.ts:224-232`) reads only `e.a`/`e.b`, no `ctx` field — build `{ id: f.id, type: 'rect', a:
  [f.x, f.y], b: [f.x + f.w, f.y + f.h] }`, call `gripsLocal(ctx, fakeEnt, opts)` (same throwaway
  `ctx`; `opts.imgCropId = null`, `opts.shift`/`opts.gripMm` real) to get the 4 corner `Grip`s, each
  `apply(p)` returning an edited fake `Ent` — convert back with a one-line `rectToFrame(e, f.id):
  SheetFrame` (`{ ...frame, x: min(a,b), y: min(a,b), w: abs(...), h: abs(...) }`). Call `gripsLocal`
  directly, NOT the `gripsFor` wrapper — `gripsFor` also attaches a rotate handle for any
  `ROTATABLE` type including `'rect'` (`grips.ts:134-136`), which frames must never get (they don't
  rotate); `gripsLocal` alone skips that. Shift-square-constrain reuses `constrainGrip` (`grips.ts
  :275-291`) the same way, on the same fake `Ent`.
- **`grips.ts`'s `pickModelGrip`-style corner pick — reused pattern, not the function itself**
  (that one is typed for `MGrip`/model objects); PaperPage's own 4-corner `Handle.svelte` loop
  (`:162-169`) stays for RENDERING the grip squares (they're tiny UI, not worth a new abstraction),
  but the corner APPLY math it drives now goes through the `gripsLocal` grips above instead of
  `onDrag`'s hand-rolled `gi === 0/1/2/3` branches (`PaperPage.svelte:78-84`) — those four branches
  are deleted.
- **`gestures.ts` — no change, already wired.** `startDrag` (`PaperPage.svelte:67-71`) already
  calls `beginPointerDrag` with `{ thresholdPx: 4 }` (B19) through the shared `DragRegistry` — this
  was done before this plan existed; nothing to do here beyond keeping it as the move/resize
  drag continues to use it.
- **`ui/selection.ts` / `editor.sel` — no change.** Frame selection already goes through the
  page-level `editor.sel` (`'frame'` kind, R3 commit 3) regardless of how the pick that feeds it
  is computed. Untouched by this plan.
- **Titleblock — no change.** Option (a) from the original draft (fixed template, live props) is
  what already exists (`PaperPage.svelte:178-190`) — Dave confirmed it stays as-is; option (b)
  (bindable titleblock-cell entities) is dropped, not deferred.

## 1. Frame snap — `snap.ts`, ported from Sheets' `Viewport.svelte`

Sheets (the older, separate tool at `src/routes/projects/[pid]/sheets/Viewport.svelte:62-117`)
already has exactly this feature for its own viewport frames — paper edges / printable margin /
title-block edges / 5 mm grid, Alt disables. Dave: match that Alt convention and reuse the logic
rather than inventing a new one. **v1 scope: paper edges + 5 mm grid only** (margin + titleblock
snap come later, once/if a margin or titleblock-rect concept exists for Pages' sheets — today's
titleblock is a fixed CSS strip with no stored geometry to snap to, see §0's titleblock note).

Sheets' implementation (reference, not copied verbatim — Pages' version is a pure `snap.ts` export
instead of component-closure functions):
```ts
// sheets/Viewport.svelte:71-84 (existing, for reference)
function snapDelta(edges: number[], lines: number[], tolMm: number): number {
	const grid = snap?.grid ?? 0
	let best = 0, bestAbs = tolMm
	for (const e of edges) {
		for (const ln of lines) { const d = ln - e; if (Math.abs(d) < bestAbs) { bestAbs = Math.abs(d); best = d } }
		if (grid > 0) { const d = Math.round(e / grid) * grid - e; if (Math.abs(d) < bestAbs) { bestAbs = Math.abs(d); best = d } }
	}
	return best
}
```
Alt check: `const doSnap = !!snap && !e.altKey` (`sheets/Viewport.svelte:93`) — read straight off
the drag's `PointerEvent`, an all-or-nothing bypass for the whole drag (not per-axis). Tolerance:
`SNAP_TOL = 6` screen px, converted to mm via the drag's own mm-per-px (`sheets/Viewport.svelte
:23,94`) — Pages' `Mapper.tolMm`/`drag.s` (`PaperPage.svelte`'s existing `scaleOf()`) is the direct
equivalent.

Pages port, in `ui/snap.ts` (new exports, pure, unit-tested — `snap.test.ts` gains a
`frameSnapDelta`/`paperSnapLines` describe block):
```ts
export const PAPER_SNAP_STEP = 5   // grid spacing, PAPER mm (distinct unit from SNAP_STEP=100, model mm)

/** Candidate snap lines for a paper of size w×h (paper mm). v1: the 4 paper edges only — margin/
 *  titleblock lines are a later param once those have real geometry (see refactor-plan.md R8-lite §0/§1). */
export function paperSnapLines(w: number, h: number): { x: number[]; y: number[] } {
	return { x: [0, w], y: [0, h] }
}

/** Smallest delta (paper mm) to add so one of `edges` lands on a line in `lines` or a `step` grid
 *  multiple, within `tolMm`; 0 if nothing is close enough. Ported from sheets/Viewport.svelte's
 *  snapDelta (same algorithm; renamed to avoid colliding with snap.ts's existing entity-move
 *  snapDelta, a different function for a different unit/purpose). */
export function frameSnapDelta(edges: number[], lines: number[], step: number, tolMm: number): number {
	let best = 0, bestAbs = tolMm
	for (const e of edges) {
		for (const ln of lines) { const d = ln - e; if (Math.abs(d) < bestAbs) { bestAbs = Math.abs(d); best = d } }
		if (step > 0) { const d = Math.round(e / step) * step - e; if (Math.abs(d) < bestAbs) { bestAbs = Math.abs(d); best = d } }
	}
	return best
}
```
PaperPage calls `frameSnapDelta` per axis exactly like Sheets calls `snapDelta` — move: both edges
of that axis (`[x, x + w]` / `[y, y + h]`) snap together (the whole frame shifts); resize: only the
edge(s) actually being dragged snap (a `TL` corner drag snaps `x` and `y` but not `x+w`/`y+h`).
`e.altKey` off `onDrag`'s `PointerEvent` gates the whole call, matching Sheets exactly. A snap mark
(small dot/line at the matched guide, "if that's cheap" per Dave) is a `$state<Pt | null>` in
PaperPage set alongside the delta call and cleared on drag end — cheap, added in the same commit
if it falls out naturally, not blocking the rest if it doesn't.

## 2. Commit slices

| # | Commit | What |
|---|---|---|
| 1 | `snap.ts` | `PAPER_SNAP_STEP`, `paperSnapLines`, `frameSnapDelta` + `snap.test.ts` coverage (paper-edge snap, grid snap, Alt bypass is the CALLER's job so not tested here — pure function has no "Alt" concept, just tolerance) |
| 2 | `PaperPage.svelte` | Replace `onSheetDown`'s DOM-based hit test with `inBox`-driven picking (§0); replace `endMarquee`'s hand-rolled `touches()` with `hit.marqueeSelect` over on-the-fly fake rect `Ent`s (§0, flag the crossing/window behaviour change in the commit message) |
| 3 | `PaperPage.svelte` | Replace `onDrag`'s 4-corner resize math with `gripsLocal`/`constrainGrip` via the fake-rect-`Ent` adapter (§0); delete the now-dead `gi === 0/1/2/3` branches |
| 4 | `PaperPage.svelte` | Wire `frameSnapDelta` into `onDrag`'s move + resize branches (§1), Alt bypass, snap mark if it falls out cheaply |
| 5 | Cleanup | Delete anything now provably dead (check `Handle.svelte`'s other call sites before touching it — likely stays, it's still rendering the grip squares, see §0); re-measure `PaperPage.svelte`'s line count for the commit message |

Each commit: `svelte-check` (compare to the 10-error/130-warning baseline) + full `vitest run`,
same discipline as every other slice this session. One commit per slice; hash sent to eos-07 for
diff review after each, per the established cadence — no live-gate requests (Dave's standing
process-change instruction still applies).

## 3. Risks, and what must be live-tested

Same caveat as every slice this session: no browser tooling here, so none of this has been clicked
through. Carried over from the fuller draft, trimmed to what R8-lite still touches:

- **Frame select/move/resize by hand** — border-band click-select, drag-move, all 4 corner resizes
  (opposite corner fixed), on a sheet with 2+ overlapping frames — the NEW `inBox`/`gripsLocal`
  code paths replacing hand-rolled math is exactly the kind of off-by-one/sign-flip risk that only
  shows up interactively.
- **Marquee select**, specifically the crossing-vs-window direction change (§0) — drag a marquee
  left-to-right vs right-to-left over a frame that's only partially inside it, confirm the new
  behaviour is understood/accepted, not just "different from before and nobody noticed."
- **Interior click vs. double-click-activate** — clicking inside an inactive frame does nothing
  (no select, no drag start); double-click anywhere in the frame (band or interior) activates it;
  double-click on bare paper outside any frame deactivates + deselects. The `inBox`-based hit test
  needs to preserve this exactly, including the existing `onSheetDown` guard that a press INSIDE
  an ACTIVE frame's `.vp.active` region is that viewport's own business, not the sheet's
  (`PaperPage.svelte:97`) — this guard predates R8-lite and must survive the rewrite untouched.
- **The Viewport tool** (drag out a new frame, `placingFrame`) — including its interaction with the
  active-frame guard above (the tool disables the border bands so a new frame can be dragged out
  over an existing one, `PaperPage.svelte:97`, `:216` `pointer-events` toggle) — confirm this still
  works once the hit test is math-based rather than DOM/CSS-based.
- **The new frame snap + Alt** — dragging/resizing near a paper edge and mid-paper (5 mm grid);
  confirm Alt genuinely bypasses both. Brand new behaviour with no prior Pages version to regress
  against (ported from Sheets, but Sheets and Pages are separate tools/separate code) — needs real
  scrutiny, not a glance.
- **Section → viewport drop** (`dropSectionDir`, `+page.svelte:229-245`) — still builds a plain
  `SheetFrame` (unchanged, storage untouched) and gets selected/focused — should need zero changes,
  but it's the one path that creates a frame WITHOUT going through the new drag/resize code, worth
  a quick re-check that nothing assumed "frames are only ever created by dragging."
- **Undo/redo of frame add/move/resize/delete** — storage is unchanged (`SheetFrame[]` in
  `PageDoc.frames`), so `doc.svelte.ts`'s `allFrames`/`restoreFrames` snapshot contract doesn't
  move — this should be the LOWEST-risk item on this list precisely because R8-lite kept storage
  untouched; still worth one pass to confirm nothing in the new drag code forgot to `commit`/
  `recordEdit` the way the old hand-rolled code did.
- **Properties panel round-trip** — `selFrameObj`/`onframeupdate`/`onframedelete`
  (`+page.svelte:1006-1010`) read/write `SheetFrame` fields directly; unaffected by R8-lite (no
  field renames, no shape change) — listed only to confirm that expectation holds once the rewrite
  lands, not because anything here is expected to break.
- **Ctrl+P print** — R8-lite doesn't touch `PaperPage`'s root markup/classes (`.paper`/`.vp`
  selectors in `printing.ts`), so this should be unaffected; a quick print smoke-test is still
  worth doing since the hit-test/grip rewrite touches the same file printing's DOM query depends
  on existing at all.

## 4. B17 — deferred to X4

Dave's call (relayed via eos-07): the module-singleton half of B17 (`models`/`layers`/`layerUI`/
`imgEdit`/`docs`/`viewState`/`selStore` still shared across a project→project client-side
navigation) is **deferred to X4** (`review.md` §X4, "Persistence pattern for §12 — copy Outlets/
Elevations, not Sheets") rather than tackled standalone — it naturally belongs with whatever
per-project storage/lifecycle X4 settles, rather than being patched twice. Recorded in `review.md`
§0a and §8 (see that commit).
