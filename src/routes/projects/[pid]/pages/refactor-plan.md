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

# R8 — merge `PaperPage` into `Viewport` (review.md §R8) — design plan

Written 2026-09-23 against `PaperPage.svelte` @ `f3424fe` (234 lines) and `Viewport.svelte` @ the
same revision (1361 lines), after R1 (hit/grips/snap/gestures are modules), R3 (one Selection
model, `'frame'` is already a `SelKind`), and R9 (Workspace object). **No code was changed for
this plan — Dave approved R8 as design-first; implementation waits for his explicit go-ahead on
this document, relayed via eos-07.**

Today a sheet tab renders `PaperPage.svelte`: a bespoke little editor in PAPER px with its own
hand-rolled hit-test (border-band click), drag machine (move + 4-corner resize, opposite corner
fixed), marquee (window-select touching a frame) and `<Handle>` corner grips — a second, parallel
implementation of everything `Viewport.svelte` already does properly (and unit-tests) for
entities in MODEL mm. The frames it manages are `SheetFrame` records (`types.ts:19-23`) held in
`PageDoc.frames` (`doc.svelte.ts`), completely separate from the `Ent`/`Model` system entities
live in. The goal: delete `PaperPage.svelte`'s bespoke geometry/interaction code entirely and
render a sheet as a `Viewport` whose entities happen to include the frames, reusing R1's modules
outright instead of maintaining two hit/grip/drag/marquee implementations forever.

## 0. Target shape

- **A sheet tab's paper is a `Viewport` instance** with a new `kind: 'paper'` (today `kind: 'plan'
  | 'iso' | ElevDir`), sized `boxW/boxH = paperDims(paper.size, paper.landscape)` (`constants.ts`)
  — exactly the box a frame already sizes itself with, just one level up. `ViewCtx.dir` gains the
  `'paper'` literal; `isPaper` joins `isPlan/isElev/isIso` (false for the other three on a paper
  viewport). Unit = **paper mm**, not model mm — `mapper.ts`'s existing `pxPerUnit = boxW ?
  PAPER_PX_PER_MM : BASE` path already treats a boxed viewport as paper px/mm; a paper-kind
  viewport just has no OUTER scale factor (`scaleN` = 1 always — "1:1" doesn't apply to the sheet
  itself, only to what a frame shows).
- **Frames become entities.** `Ent` (`geometry.ts:14`) gains an optional `role?: 'viewport'`. A
  role-`viewport` entity reuses `type: 'rect'` (`a`/`b` = the frame's top-left/bottom-right
  corners in paper mm) so it gets `hit.ts`'s/`grips.ts`'s existing rect bbox/hit/grip machinery
  for free, plus the frame-specific fields `SheetFrame` already has: `proj: Proj`, `frameScale:
  string` (renamed from `scale` — `Ent` doesn't otherwise have a `scale` field and `PropertiesPanel`
  already disambiguates model/frame scale), `clip: Clip | null`, `label: string`, `modelId?:
  number`, `border: 'dashed' | 'solid' | 'none'`. `SheetFrame` the type is retired; every current
  reader (`types.ts` `Workspace.framesOf/updateFrame`, `PropertiesPanel`'s frame props,
  `doc.svelte.ts`) switches to filtering/mapping `Ent[]` by `role === 'viewport'`.
- **Frames need a model to live in.** `entsForModel`/`Model.ents` (`3dview/types.ts:106`) is the
  only place `Ent[]` lives today, keyed by 3D model id — there is no per-*document* ents array.
  Proposal: each `PageDoc` gets a **page model** — a `Model` with `objects: []` (unused) whose
  `ents` holds the frame-ents + titleblock-ents (§4) + free page annotations, auto-created lazily
  (id convention `` `page:${docId}` ``, mirroring `FLOOR_MODEL_ID`'s pattern) the first time a
  sheet is opened, same lifecycle as `docs.seed`. **Open decision for Dave** (flagged, not
  resolved here): does the page model ride the existing undo history the way a content model's
  edits already do (`recordEdit`/`snapModels`), or does it stay on `PageDoc`'s own
  frames-only history slice like today (`doc.svelte.ts`'s `allFrames`/`restoreFrames`)? This plan
  assumes the latter (least change — frame edits keep exactly today's undo behaviour; only the
  STORAGE shape changes from `SheetFrame[]` to `Ent[]`), but a real per-doc model would be the more
  uniform long-term answer once B4 (history) is settled.
- **A frame's own content is a NESTED `Viewport`**, exactly as today (`PaperPage.svelte:153-155`):
  unchanged — R8 only replaces the PAPER-space editor, not the per-frame content viewport, which
  already goes through every R1 module via the normal `Viewport` props.

## 1. PaperPage's drag / marquee / Handles / frame selection → `gestures.ts` / `grips.ts` / `hit.ts` / `selStore`

| PaperPage today | Maps onto |
|---|---|
| `startDrag`/`onDrag` move branch (`:67-77`, border-band drag anywhere non-corner) | **New interaction rule**, not a straight port: a role-`viewport` entity's BODY is a drag-to-move handle, unlike a normal entity (which is picked/dragged by its body too, so this part is actually the SAME as today's entity-drag path once picking treats the border band as the pick target — see next row) |
| `onSheetDown`'s frame hit test via `.vp-band`/`.vp-interior` DOM elements (CSS-based interior/border split) | `hit.ts`'s `hitEnt`/`inBox` gets a `role === 'viewport'` branch: `inBox(p, x0, y0, x1, y1, thr, filled=false)` with `thr` = the 11px band width **converted to paper mm** (not the usual few-mm entity pick tolerance) — the interior stays a hole (unfilled `inBox` already returns `false` inside the inner band), so a press over the interior falls through to the paper background (deactivate) exactly like today's `.vp-interior` `stopPropagation`+`clearFrameSel` |
| 4-corner resize (`onDrag`'s grip branches, opposite-corner-fixed) | `grips.ts`'s existing `gripsLocal`'s `e.type === 'rect'` branch (`grips.ts:224-232`) already does opposite-corner-fixed box resize with an `anchor`+`resize` closure — a role-`viewport` rect entity gets this for free through the SAME `gripsFor` call every selected entity goes through; frames never rotate (`e.rot` stays `undefined`) so `gripsFor`'s rotation wrapping is a no-op, matching today exactly |
| `<Handle>` corner-grip rendering (`parts/Handle.svelte`, PaperPage's own template loop `:162-169`) | Deleted — the generic entity-grip overlay Viewport already renders for a selected entity (wherever `gripsFor`'s output is drawn today) covers it; `Handle.svelte` itself may become dead code (check other call sites before deleting) |
| `onSheetDown`/`onMarquee`/`endMarquee` (paper-space window-select, "touches any frame") | `hit.ts`'s `marqueeSelect` (`hit.ts:269-277`) unchanged — it already does crossing-vs-window by drag direction over an `Ent[]`; frames-as-ents just need to be IN the `ents` array a paper-kind Viewport passes to its own marquee handler. This is the single biggest win: PaperPage's marquee is bespoke code duplicating exactly what `marqueeSelect` already does |
| `placingFrame`/"Viewport tool" (drag out a NEW frame) | `place.ts`'s `buildEnt` gets a `'Viewport'` tool branch building a role-`viewport` rect ent (parallel to the existing rect-tool branch), replacing `onaddframe`/`addFrame` |
| Frame selection → `editor.sel.only([{kind:'frame', id}])` | **Unchanged** — R3 commit 3 already wired the page-level `editor.sel` for the `'frame'` kind; R8 only changes how the PICK that feeds `.sel.only(...)` is computed (today PaperPage's own DOM-based hit test; after R8, the same `hitEnts`/`pickAt` pass every other entity pick goes through, filtered/tagged by `role`) |
| 4px move threshold (B19, `startDrag`'s `beginPointerDrag(..., { thresholdPx: 4 })`) | `gestures.ts` already supports `thresholdPx` per call (shipped in R1, unused until now per refactor-plan.md §11's deviations note) — the frame move-drag becomes the FIRST real non-zero-threshold caller; **note this explicitly in the commit** so a future "why does this drag feel laggy, let's remove the threshold" doesn't undo B19 by accident |
| Page-level `editor` prop, `paperEditor(a: Tab)` (`+page.svelte:198-209`, the frame-exclusive-with-active-frame-selection logic) | Unchanged — this is Selection-model logic (R3), orthogonal to how the pick/drag/grip geometry is computed |

## 2. Frame snapping → `snap.ts`

PaperPage has **no snapping today** — frames drag/resize freely to any pixel. The design brief
(review.md §R8) asks for paper-edge, margin, titleblock-edge and 5mm-grid snap with Alt
disabling it. This is new functionality riding the refactor, not an extraction:

- New `snap.ts` export `frameSnap(ctx, dragged: {x0,y0,x1,y1}, targets: {paper: {w,h}; margin:
  number; titleblock?: {x0,y0,x1,y1}}, gridMm: number, alt: boolean): {x0,y0,x1,y1}` — snaps
  each of the 4 edges of the dragged/resized rect independently against the candidate edges
  (paper 0/w/h, `margin` in from each paper edge, the titleblock's own left edge) within a
  screen-px tolerance (`Mapper.tolMm`, same pattern `findSnap`'s `radiusPx` uses), falling back to
  a `gridMm` round (a NEW constant, e.g. `PAPER_SNAP_STEP = 5` in `constants.ts` — paper mm, a
  different unit/scale than `snap.ts`'s existing `SNAP_STEP = 100` which is model mm) when no edge
  is close enough. `alt` (from `e.altKey` on the drag's pointer events) bypasses everything and
  returns `dragged` unchanged.
- **This is the first Alt-key modifier wired anywhere in Pages** — a repo-wide grep found no
  existing `altKey` handling to match conventions against (Shift is the only modifier used today,
  for square/15°-constrain). Flag this as a fresh UI decision, not an established pattern: confirm
  with Dave that Alt (not e.g. Ctrl, which some OSes/browsers intercept) is still the right choice
  before wiring it.
- Wired into the SAME move/resize path §1 already routes through `grips.ts`'s rect resize and the
  new move-drag: after computing the raw dragged rect, call `frameSnap` before calling `onDrag`'s
  `.set(...)` (today) / the entity-update callback (after R8) — same shape as `drawPoint`'s
  `{ p, mark }` return contract, so a snapped edge can show the same kind of snap-mark indicator
  object-snap already draws.
- Margin value and titleblock-edge geometry are currently **not modeled anywhere** (PaperPage's
  titleblock is a fixed 16%-width CSS strip, §4) — `frameSnap`'s `targets` argument needs real
  numbers once §4 settles how the titleblock is represented; until then this can ship snapping to
  paper edges + 5mm grid only, with titleblock/margin snap added once §4 lands.

## 3. The nested content `Viewport` inside each frame — activation, "Pan content", print

No behaviour change intended here — this section documents how the existing per-frame content
`Viewport` continues to work once its PARENT is a `Viewport` instead of a bespoke `PaperPage` div:

- **Activation** (`activateFrame`, `+page.svelte:264`; `vpFrameView`'s `activate`/`deactivate`,
  `:268-275`) stays exactly as-is — it's keyed by the frame's own id via `activeVps`
  (`isVpActive`/`activateVp`/`deactivateVp`), independent of how the frame's BORDER is picked.
  Double-click-to-enter moves from PaperPage's `ondblclick={() => fon.activate?.()}` on `.vp-band`
  to a dblclick handler on the role-`viewport` entity's pick region (same hit-test as §1's border
  band) inside the parent Viewport's own `onDblclick`.
  A subtlety worth flagging: today `.vp-interior`'s own `ondblclick` ALSO activates (so a
  double-click anywhere in the frame enters it, not just the border) — the merged version needs
  the same "double-click activates the frame, single-click on the interior does nothing (paper
  space) / edits (model space)" duality, which means the interior can't be a total hit-testing
  hole for DBLCLICK even though it is for single-click pick/drag (§1's `inBox(..., filled=false)`
  suppresses interior SELECT, not necessarily interior DBLCLICK — these need separate hit passes).
- **"Pan content"** (`env.navContent`, gates whether the ACTIVE frame's own view pans/zooms vs the
  page canvas) is unchanged — it already lives on `Env` (`Viewport.svelte`'s `Env` type) and B28/
  B28-follow-up's `zoomsContent`/`activeViewportId`/`fitPane` logic (`+page.svelte:816-848`)
  already treats a sheet's active frame as "the viewport whose content zoom/fit applies" via
  `activeVpOf`. Once the sheet itself is a `Viewport`, `fitPane`'s own sheet-branch (`:839-847`,
  computing a fit-to-pane zoom from `canvasEls[idx]` vs `paperDimsOf`) becomes REDUNDANT — a
  `Viewport` already knows how to fit its own `boxW/boxH` box within the pane the same way a frame
  fits within the sheet today (needs confirming which existing Viewport code path that is before
  deleting `fitPane`'s sheet branch — flagged as a commit-6 task in §5, not assumed here).
- **Print** (`printing.ts`) targets `.pane.focused .paper` (falling back to `.pane.focused .vp`) —
  once the sheet's root element is a `Viewport` (which already renders with a `.vp` class, per the
  fallback selector), the FIRST selector (`.paper`) may stop matching depending on what CSS class
  a paper-kind Viewport's root gets. This needs a real check against the merged markup, not an
  assumption — §6 lists it as a risk. The print CSS's `.print-target .vp { border: none !important;
  … }` rule (hiding the viewport's own border chrome at print time) already anticipates a `.vp`
  root, which is a good sign the fallback path is the one to keep deliberately.

## 4. The titleblock

Today the titleblock is a hardcoded template in `PaperPage.svelte`'s markup (`:178-190`): a fixed
16%-width right-hand strip with `PROJECT`/`TITLE`/`SCALE`/`SIZE`/`REV`/`DATE`/`DRAWN`/`DWG №`
cells, populated from plain props (`title`, `drawingNo`, `scale`, `rev`, `revDate`, `sizeLabel`) —
not stored as drawable content at all. Folding it into the entity system (per review.md §R8's
"titleblock cells") is a genuine design choice, not an extraction, with two live options:

- **(a) Keep it a template, not entities.** The paper-kind Viewport renders a fixed titleblock
  block (same as today, just living in `Viewport.svelte`/a new `TitleblockRender.svelte` instead
  of `PaperPage.svelte`), driven by the SAME live props (doc title, revision, scale). Simplest;
  no snap-target ambiguity (§2's `targets.titleblock` is just this block's known rect); no
  Firestore shape change; loses "the titleblock is user-editable/movable content" as a future
  feature.
  **This plan recommends (a) for the first commit slice** — it's the behaviour-preserving option
  and doesn't block §0-§3 landing; text-editable/moveable titleblock cells (b) can follow later as
  its own slice once someone actually asks for a non-standard titleblock layout.
- **(b) Titleblock cells are entities** (`role: 'titleblock'`, `type: 'text'`, bound to a live
  field like `bind: 'title' | 'rev' | 'scale' | ...` instead of a static `text` string, resolved at
  render time from the doc) — matches review.md's literal wording ("titleblock cells") and makes
  the titleblock genuinely editable/movable/restylable like every other entity, at the cost of a
  live-binding resolution step (`text` vs `bind`) that nothing else in the `Ent` type needs today,
  and a firestore migration for existing sheets (none exist as real user data yet — this is still
  a mockup — so migration risk is low, but this needs Dave's call since it's the more invasive
  option). Flagged for Dave, not decided here.

## 5. Commit slices (behaviour-preserving where possible)

Each commit gets its own `svelte-check`/`vitest` gate, same discipline as R1/R9. Ordered so each
step leaves the app in a working, testable state — no big-bang rewrite.

| # | Commit | What | Behaviour change? |
|---|---|---|---|
| 1 | `geometry.ts` + `types.ts` | Add `Ent.role?: 'viewport'` + the frame fields (`proj`/`frameScale`/`clip`/`label`/`modelId`/`border`) to `Ent`; keep `SheetFrame` as a type ALIAS for the role-narrowed `Ent` shape (not deleted yet) so nothing else needs to change | None (additive) |
| 2 | `doc.svelte.ts` | `PageDoc.frames: SheetFrame[]` → the page-model `ents: Ent[]` (§0); `framesOf`/`setFrames`/`allFrames`/`restoreFrames` become thin filters over the new storage; a one-time `migrateEnt`-style conversion (matching R4 part 3's `migrateModels` pattern) for any persisted `SheetFrame[]` data | None if migration is exact |
| 3 | `hit.ts` | `hitEnt`/`inBox` gain the role-`viewport` border-band branch (§1); `pickable` gates it like any entity (layer-hidden/locked don't apply — frames have no layer — so this branch skips that check) | None (new code path, not yet wired to any UI) |
| 4 | `grips.ts` | Confirm `gripsLocal`'s existing rect branch handles a role-`viewport` ent with no changes (it should — it doesn't inspect `role`); add a regression test pinning this | None (test-only) |
| 5 | `snap.ts` | `frameSnap` (§2) + `PAPER_SNAP_STEP` constant; unit-tested standalone (not yet wired) | None (new code, unwired) |
| 6 | `Viewport.svelte` | `kind: 'paper'` + `isPaper`; role-`viewport` entity pick/drag/grip/marquee wiring (§1); frame activation dblclick (§3); frame-move-drag threshold (§1's B19 note); wires `frameSnap` into the drag (§2) | Sheet interaction now goes through Viewport's own pointer pipeline — **first behaviour-risk commit**, see §6 |
| 7 | Titleblock | Option (a) from §4: a template block in the paper-kind Viewport (or a small `TitleblockRender.svelte`), fed the same props PaperPage took | None if (a); see §4 if (b) is chosen instead |
| 8 | Wire `+page.svelte` | Replace `<PaperPage ...>` with `<Viewport kind="paper" ...>`; delete `paperEditor`'s now-unneeded wrapping if selection plumbing simplifies; `fitPane`'s sheet branch reassessed (§3) | User-visible: this is the cutover commit |
| 9 | Delete `PaperPage.svelte`, `Handle.svelte` (if dead), `SheetFrame` type alias, dead `+page.svelte` frame-CRUD wrappers (`seedFrame`/`addFrame`/`deleteFrame`/`commitFrame` if `place.ts`/`modelEdit.ts` now own frame CRUD) | Cleanup | None |

Steps 1-5 and 7 are independent of each other and of step 6 (build/test in isolation); 6 needs
1+3+4+5; 8 needs 6+7; 9 needs 8. This mirrors R1's "extract the modules first, wire them in one
focused commit, clean up last" shape.

## 6. Risks, and what must be live-tested

**No live browser testing has been possible this session (no browser tooling available here) —
every one of the following MUST be clicked through by Dave or eos-f8 before this ships, not just
diff-reviewed:**

- **Frame select/move/resize by hand** — border-band click-select, drag-move, all 4 corner
  resizes (opposite corner stays fixed), on a sheet with 2+ frames overlapping.
- **Marquee select** touching one vs. multiple frames, crossing vs. window direction.
- **Interior click-through**: clicking inside an inactive frame does nothing (doesn't select,
  doesn't drag); double-click activates it; double-click on bare paper outside any frame
  deactivates + deselects.
- **The new frame snap** (§2): dragging/resizing near a paper edge, a margin, the titleblock edge,
  and mid-paper (5mm grid) — and that Alt genuinely bypasses all of it. This is BRAND NEW behaviour
  with no prior version to regress against, so it needs the most scrutiny, not the least.
  Genuinely open question for Dave: is 5mm/Alt/margin-snap even wanted for v1, or should §2 ship
  disabled/deferred and this whole slice ship as paper-edge-only snap?
  Actually the most useful data would be Dave clicking around a real sheet with several frames and
  saying what snap behaviour he expects — this plan is guessing at AutoCAD-viewport-snap
  conventions, not confirmed ones.
- **"Pan content" + Fit/zoom on a sheet frame** — re-verify B28/B28-follow-up's exact scenarios
  (status-bar zoom, Fit button, automatic refits on mount/split/resize) still behave once
  `fitPane`'s sheet branch is touched (§3, §5 step 8).
- **Ctrl+P print** — the `.print-target` selector risk (§3): print a sheet after the merge and
  confirm the paper (not the wrong element, not nothing) is what prints, at true size, with no UI
  chrome or selection highlight.
- **The Viewport tool** (drag out a new frame) — including the existing `tool !== 'Viewport'`
  guard in `onSheetDown` that stops a press inside an ACTIVE frame from starting a paper-space
  marquee/frame-placement — this nuance needs to survive the port into Viewport's own `onDown`
  dispatch.
- **Section → viewport drop** (`dropSectionDir`, `+page.svelte:229-245`) — creates a frame
  programmatically (not via drag); confirm it still builds a valid role-`viewport` entity and gets
  selected/focused correctly after the storage-shape change (step 2).
- **Undo/redo of frame add/move/resize/delete** — `doc.svelte.ts`'s `allFrames`/`restoreFrames`
  snapshot contract changes shape (step 2); a stale history entry (recorded before this migration)
  redoing/undoing across the change is NOT a real scenario (no persisted user data exists yet, per
  §4), but a normal add→undo→redo cycle within one session must still work.
- **Touch** (per-tool canvas pan/zoom, memory: "Touch/iPad pan-zoom" — Sheets/Racks already done,
  Outlets/Uploads buggy, Pages not in that list at all) — a merged sheet-as-Viewport should inherit
  whatever touch handling Viewport already has, which may be BETTER or WORSE than PaperPage's
  current touch behaviour (PaperPage was never audited for touch); this needs its own pass, not an
  assumption either way.
- **Properties panel** — `selFrameObj`/`onframeupdate`/`onframedelete` (`+page.svelte:1006-1010`)
  read/write frame fields through the OLD `SheetFrame` shape; confirm every field still round-trips
  once frames are `Ent`s with extra fields (particularly `frameScale` vs whatever property name
  Properties currently binds to for a frame's scale, since `Ent` doesn't otherwise have a bare
  `scale` field the way `SheetFrame` did).
