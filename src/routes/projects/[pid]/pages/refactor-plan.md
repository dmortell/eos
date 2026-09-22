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
| `mUid`, `uid` `:918,:122` | delete; import `newId(prefix)` from `../3dview/graph` (B13) |

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
| 9 | delete wrappers, `uid/mUid` → `newId`, re-measure line count | all | target ≤ 600 lines |

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
