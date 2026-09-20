# Pages tool — code review (vs. the Sheets tool)

Reviewed 2026-09-20. Scope: everything under `src/routes/projects/[pid]/pages/`
(`+page.svelte`, `ui/Viewport.svelte`, `ui/panzoom.ts`, `parts/*`, `constants.ts`), compared
against the Sheets tool core (`sheets/SheetEditor.svelte`, `parts/Canvas.svelte`, `Viewport.svelte`,
`viewports.svelte.ts`, `edit/{surface,history,selection,editing,annotations}.svelte.ts`,
`annotations/*`, `layers/*`, `types.ts`, `data.ts`, the package print page).

Method: full read of both trees, `svelte-check` on the project (filtered to `pages/`), and a
browser measurement on the running dev server for the one layout bug that was easy to confirm.
Findings are tagged **[verified]** (reproduced or reported by a tool), **[code]** (high confidence
from reading the code, not run), or **[design]** (a judgement call, not a defect).

Pages is a mock (local runes state, no Firestore), so anything `todo.md` already lists as
"not yet" is not repeated here as a bug. This review is about what is *built* and how it compares
to the patterns Sheets settled on.

---

## 1. Summary

**What's good.** The shell decomposition is clean (navigator / layers / props / history / status
bar / menubar / palette are all small components), the pointer-event + `setPointerCapture` model is
better for iPad than Sheets' mouse-event model, per-document entity/selection/view state keyed by
tab id is the right shape for split panes, the coordinate mapping via `getBoundingClientRect`
(not `getScreenCTM`) is correct under a CSS-zoomed canvas, constant-size grips and lineweights are
handled properly, and in-place text editing is an improvement over Sheets' panel-only editing.

**What needs fixing first.** Four real bugs in the built behaviour (§2.1–2.4), one TypeScript
error (§2.5), and one structural problem that will keep producing bugs until fixed: the viewport
*frame* lives in `PaperPage` local state and is destroyed on every tab switch (§2.3).

**The big architectural gap vs. Sheets.** Sheets keeps all editing logic in headless classes
(`ViewportEditor`, `SurfaceEditor`, `AnnotationEditor`, `History`) with thin Svelte components
on top. Pages puts everything inline in a 774-line `Viewport.svelte` and a 750-line `+page.svelte`.
That is fine for a mock, but the moment Pages gets delete/copy/paste/additive-select/undo-per-doc
(all listed as "adopt" in `todo.md` §1a) the inline approach will not scale. §4 recommends lifting
a `DocEditor` class out now, modelled on `SurfaceEditor`, before those features land.

---

## 2. Bugs

### 2.1 "Fit" is off-centre; the paper's origin moves with the pane size  **[verified]**

`fitPane` (`+page.svelte:324-336`) computes the translate as if the paper's top-left sits at
`(0,0)` of `.canvas-content`. It doesn't: `.paper-wrap` (`PaperPage.svelte:186`) is
`position:absolute; inset:0; display:flex; align-items:center; justify-content:center`, so the
paper is flex-centred inside the *unscaled* content box, i.e. its origin is at
`((W−pw)/2, (H−ph)/2)` **before** the translate/scale is applied. The result is an extra offset of
`z·(W−pw)/2, z·(H−ph)/2`.

Measured on the running app right after load (pane 1035×1095, zoom 0.97):

| margin | left | right | top | bottom |
|---|---|---|---|---|
| px | 88 | 15 | 420 | 16 |

Predicted error from the formula: 36 px horizontal, 202 px vertical — matches. In a narrow split
pane (`W < pw`) the sign flips and the paper is pushed off the left edge. The same flex-centring
also means the "infinite canvas" origin shifts whenever the pane resizes (window resize, sidebar
toggle, split), so a pan/zoom that was framing something no longer does.

**Fix (recommended):** do what Sheets does (`SheetEditor.svelte:279-286`, `Canvas.svelte:159-169`):
pin the paper at world `(0,0)` (drop the flex centring on `.paper-wrap`, make `.paper`
`position:absolute; left:0; top:0`) and let `fitPane` compute the centring translate. That makes
`fitPane` correct as written and gives a stable world origin.
**Fix (minimal):** subtract the centring offset in `fitPane`:
`x = (r.width − paper.w·z)/2 − (r.width − paper.w)/2·z`, same for `y`.

### 2.2 Print is hard-wired to A3 landscape and doesn't scale the frame  **[code]**

- `PRINT_CSS` (`+page.svelte:349-358`) hardcodes `@page { size: A3 landscape }` and
  `.print-target { width:420mm; height:297mm }`. Since 9df2efd the status bar lets you pick
  A4/A3/A2 and portrait/landscape (`constants.ts:16-24`), so printing any other size/orientation
  produces the wrong page.
- The paper is resized to real mm at print time, but its *contents* are not. `.vp-frame` is
  positioned with inline px (`PaperPage.svelte:141`) and the viewport's `viewBox` is derived from
  the frame's px size, so on a 420 mm (=1587 px) page the frame stays 936 px wide, i.e. it prints
  at ~60 % size in the top-left corner. The titleblock (flex, `width:16%`) does scale, so the two
  will disagree.

Sheets solves both in `Canvas.svelte:309-335`: `@page` size is computed from `paperDimsMm(paper)`,
and the whole content group is scaled by `zoom: 96/25.4` (CSS `zoom`, not `transform`, so text
stays vector). Pages should compute `@page` from `paperSize`/`paperLandscape` and scale
`.print-target` content by `(mm·96/25.4) / PAPER_PX_PER_MM` — or better, adopt mm world units
(§4.2) so the Sheets print path applies unchanged.

### 2.3 Viewport-frame state is lost on tab switch, and the Properties panel keeps a dead handle  **[code]**

`{#key p.activeId}` (`+page.svelte:521`) remounts `PaperPage` whenever a pane changes tab.
`PaperPage` owns `frame`, `frameBorder`, `selected` as local `$state`
(`PaperPage.svelte:27,40-41`), so:

- moving/resizing the frame or setting its border, then switching tabs and back, resets the frame
  to "fill the sheet, dashed";
- in split view the same sheet shows two independent frames (good);
- the `$effect` that publishes `onframe(...)` (`PaperPage.svelte:29-35`) never emits `null` on
  unmount, so `viewportSel` in the parent (`+page.svelte:245-249`) keeps a `FrameSel` whose
  `setRect`/`setBorder` closures write into a destroyed component. The Properties panel then shows
  stale X/Y/W/H and edits silently do nothing.

Entities, selection and view are already per-doc (`docEnts/docSel/docView`); the frame should be
too (`docFrame: Record<string, { x,y,w,h, border }>`), passed down as a prop with an `onframechange`
callback, exactly like `entities`/`onupdate`. Sheets keeps frame geometry in `vps.viewports` and
the frame component is stateless apart from the in-progress drag (`sheets/Viewport.svelte:31-34`).
Also emit `onframe(null)` from the effect's cleanup, or derive `viewportSel` from per-doc state in
the parent and drop the effect→callback pattern entirely.

### 2.4 In-place text editor is mispositioned and double-scaled when the canvas is zoomed  **[code]**

`startTextEdit` (`Viewport.svelte:202-208`) computes `fontPx = 11 · view.zoom · m.scale` where
`m.scale = svg.getBoundingClientRect().width / vbW` — that already includes the canvas CSS zoom
(`BASE · canvasZoom`). The textarea is then placed in `.vp` with `left/top/font-size` in the
host's *local* px, and the host is itself inside `.canvas-content { transform: scale(canvasZoom) }`.
So on screen the editor is at `client·canvasZoom` and its font is
`11 · view.zoom · BASE · canvasZoom²`. At `canvasZoom = 1` it looks right (which is presumably how
it was tested); after Fit (≈0.97 here, ≈0.56 in a split pane) it drifts and mis-sizes.

Fix: divide `x`, `y` and `fontPx` by the host's ancestor scale
(`host.getBoundingClientRect().width / host.offsetWidth`), the same trick `PaperPage.scaleOf()`
and Sheets' `Canvas.ancestorScale()` use. The `cols · fontPx · 0.62 + 14` width/height math then
stays in local px and works.

### 2.5 Type error  **[verified]**

`+page.svelte:583` — `onrestore={(s) => restoreRevision(s)}`: `HistoryPanel`'s `Snap` is
`Record<string, unknown>` (`HistoryPanel.svelte:6`) but `restoreRevision` takes
`Record<string, Ent[]>`. Either export `Snap` from a shared module and import it in
`HistoryPanel`, or make `HistoryPanel` generic. `pnpm check` currently reports this as an error
(the rest of the pages output is warnings, listed in §6).

### 2.6 Keyboard handling with two active viewports  **[code]**

`activeVps` is a `Set` (`+page.svelte:28-31`), so in split view both panes can have an active
viewport, and every `Viewport` instance registers its own `<svelte:window onkeydown>`
(`Viewport.svelte:588`). With two active instances of the same doc: Esc runs the ladder in both
(instance A cancels its draft while instance B, with no draft, clears the selection or deactivates);
Enter finishes a polyline in whichever has a draft and is harmless in the other; Shift re-constrain
runs twice. Sheets has exactly one `activeId` and one window key handler
(`viewports.svelte.ts:63`, `SheetEditor.svelte:226-248`).

Options: (a) make activation per *pane* (`panes[i].vpActive`) and route keys only to the focused
pane's instance; (b) keep per-tab memory but only the focused pane's instance handles keys
(`if (!active || !focused) return`). (b) is the smaller change — pass `focused` down.

### 2.7 Undo/redo is global across documents and skips selection  **[code]**

One `undoStack` for all docs (`+page.svelte:96-118`). Ctrl-Z while looking at doc A may silently
revert doc B (the last edit anywhere). Sheets scopes undo to the surface being edited
(sheet-level `vps.undo()` for frames, per-viewport `History` for content). Simplest fix: key the
stacks by doc id (`undoStacks[id]`) and undo the focused doc's stack.

Related: `applyUndo` restores `docEnts` but not `docSel` (undoing an Add leaves the deleted id
selected; `selEnts` filters it out but `Viewport.pick` still iterates it), and undo/redo don't
appear in the change log. Sheets' `History` captures selection with each frame
(`surface.svelte.ts:79-80`, `history.svelte.ts:70-75`).

### 2.8 Smaller bugs

- **No way to delete an entity.** Edit › Delete is a no-op (`+page.svelte:200-213`), there is no
  Delete/Backspace handler, and no Properties "Delete" button. Sheets: Delete/Backspace on the
  window (`SheetEditor.svelte:245-247`) plus a panel button. This is the most visible gap for a
  drawing mock.
- **`dirty` is never set** — `t2` is hardcoded `dirty:true`; `addEnt/updateEnt` don't mark the tab.
- **`dropDoc` leaks `activeVps`/`docProj`** (`+page.svelte:138-142`), and the preview-tab reuse path
  (`+page.svelte:229`) keeps the id, so the *next* previewed drawing inherits the previous one's
  activation and ViewCube projection.
- **Tabs are matched by title** in `openDrawing` (`+page.svelte:225`); two drawings with the same
  label (e.g. "Row A" under different rooms once those become drawings) would collapse into one tab.
  Key by the navigator node id.
- **`HistoryPanel` mutates a prop**: `bind:value={r.note}` (`HistoryPanel.svelte:47`) writes into
  the parent's `revisions` array through a prop → Svelte 5 `ownership_invalid_mutation` warning in
  dev. Emit `onnote(i, text)` instead.
- **Titleblock lies**: SIZE is hardcoded "A3" (`PaperPage.svelte:174`) regardless of the selected
  paper; PROJECT/DRAWN are fixed strings. Pass `paperSize` down at least.
- **Status-bar coords say "mm"** (`StatusBar.svelte:36`) but `cx/cy` are canvas px
  (`+page.svelte:299-302`).
- **ViewCube → layout is one-way and global**: picking FRONT/RIGHT/3D on a sheet forces
  `layout='model'` for *every* pane and picking TOP again doesn't restore `sheet`
  (`+page.svelte:554`).
- **Frame drag has no move threshold and no undo**: a click on the band that jitters 1 px moves
  the frame (`PaperPage.svelte:60-87`). Sheets uses a 4 px `THRESHOLD` and
  `checkpoint()/cancelCheckpoint()` so an un-moved click leaves no undo step
  (`sheets/Viewport.svelte:22,52-61,118-125`).
- **Properties ↔ grips disagree on `z0`**: `setBoxZ0` clamps to ≥ 0 (`PropertiesPanel.svelte:67`)
  but the elevation grips allow negative (`Viewport.svelte:323`). Height shows `?? 0` in the panel
  (`PropertiesPanel.svelte:114`) while the renderer defaults to 45 (`Viewport.svelte:38`).
- **Uncontrolled inputs in Properties**: `<input value={...} onchange>` doesn't reset a
  half-typed value when the selection changes (`PropertiesPanel.svelte:76-127`). Sheets mirrors
  into a `form` `$state` re-synced on selection change (`ViewportPropertiesWindow.svelte:63-106`).
- **Coalescing merges unrelated edits**: `record` drops any push within 450 ms of the last
  (`+page.svelte:104-111`), so Add-then-immediately-move, or two quick Properties edits, become one
  undo step labelled with the first action. Sheets' `History.touch()` debounces *per burst* and
  compares snapshots so no-op edits don't record (`history.svelte.ts:38-55`).

---

## 3. Feature / behaviour comparison

| Area | Pages (now) | Sheets | Note |
|---|---|---|---|
| Editing logic location | inline in `Viewport.svelte` (774 lines) | headless classes + thin components | §4.1 |
| World units | abstract px, paper = 960×679 px (`PAPER_PX_PER_MM` 2.29) | 1 world unit = 1 mm; print via CSS `zoom` | §4.2 |
| Paper sizes | own `PAPER_SIZES` A4/A3/A2 (`constants.ts`) | `$lib/ui/print/types` (A3/A4 + margins) | duplicate; extend the lib type with A2 |
| Wheel handling | `exp(−deltaY·0.0015)`, no `deltaMode` normalisation (`panzoom.ts:27`) | `normalizeWheelToPixels` + `wheelZoomFactorFromEvent` from `$lib/ui/panzoom-controller` | Firefox line-mode wheel zooms ~16× slower in Pages |
| Pan/zoom persistence | none (lost on reload) | per-`viewKey` in localStorage, debounced (`Canvas.svelte:68-83,295-302`) | mock, but cheap to add |
| Pointer model | pointer events + capture (touch-friendly) | mouse events (+ touch synthesised) | Pages is better here |
| One-finger touch | draws/edits, never pans (decided) | pans empty background | decided in `todo.md` |
| Active viewport | many (`Set`), per tab | exactly one | §2.6 |
| Hit-testing | topmost by array order; rect/box interior is a hit | second pass sorted by footprint, outline-only hit for rects, tiny-shape fallback (`AnnotationLayer.svelte:28-38,284-332`) | in Pages a small shape drawn *before* a rect that encloses it is unselectable by click |
| Snap | object snap (end/mid/centre/quad) with marker | frame snap to paper edges/margins/titleblock/5 mm grid; Alt disables (`sheets/Viewport.svelte:62-84`) | Pages has no frame snap, no grid snap |
| Marquee | window (L→R) / crossing (R→L) | crossing, Shift = additive | Pages richer, but no additive |
| Additive select / Ctrl-drag dup / group / clipboard / nudge / Ctrl-A | none | all, via `SurfaceEditor` + `SelectionCoordinator` | listed as "adopt" |
| Delete | none | Delete/Backspace + panel | §2.8 |
| Undo | global, time-coalesced snapshots | per-surface `History` (debounced, no-op-skipping, restores selection) + sheet-level checkpoint | §2.7 |
| Text editing | in place (better UX) but zoom bug | side panel, F2 focus | §2.4 |
| Layers | mock tree, not wired | `LayerDef` (defaults + custom with `base`), per-viewport `layerOverrides`, lock guards with toasts, active-layer routing (`layers.ts`) | §4.3 |
| Properties panel | one component, per-kind fields, multi-select bbox move | `Prop*` field components, `formNav`, per-source sub-panels | Pages should reuse `Prop*` |
| Print | hardcoded A3, inner content unscaled | computed `@page`, `zoom` trick, package print page | §2.2 |
| Keyboard | Ctrl-K/Z/Y, Esc, Enter, Shift | + Delete, Ctrl-C/X/V/D, PageUp/Down, markup hotkeys (`edit/hotkeys.ts`), F2 | |
| Tests | none | none | both tools have testable pure geometry; see §5 |

Where Sheets is *worse* and Pages should not copy it: window-level capture listeners keyed on a
growing `closest('.dwg-menubar, .ctx-menu, …')` selector list (`SheetEditor.svelte:192-261`);
mouse-only frame handles; floating `Window` panels instead of a sidebar; the `JSON.stringify`
echo guards everywhere (necessary there, but Pages should design its persistence so the editor is
the single writer and the doc subscription seeds only while idle — see `edit/editing.svelte.ts`
and the memory note about remote-apply effects).

---

## 4. Design recommendations

### 4.1 Lift the editor out of `Viewport.svelte` into a headless class  **[design]**

`Viewport.svelte` currently holds: coordinate mapping, draft/preview state, click/drag/marquee
gestures, hit-testing, osnap, grips, Shift-constraints, text editing, elevation projection, and
rendering. `+page.svelte` holds documents, tabs, panes, undo, revisions, print and menus.

Sheets' split is worth copying, not because it's Sheets, but because the "adopt" list in
`todo.md` §1a (additive select, Ctrl-drag duplicate, rotate, delete, clipboard, nudge) is exactly
the set of operations `SurfaceEditor` already generalises (`surface.svelte.ts:61-260`):

- `DocEditor` (per document, `.svelte.ts`): `entities`, `sel`, `view`, `frame`, undo `History`,
  and mutations (`add`, `update`, `remove`, `translate`, `duplicate`, `selectIds`, `marquee…`).
  `+page.svelte` keeps a `Map<tabId, DocEditor>` instead of four parallel `Record`s.
- `Viewport.svelte` becomes render + gesture wiring that calls the editor. The projection-specific
  bits (`boxElev`, `boxFaces`, `gripsFor` per kind) move to a `geometry.ts` next to it (mirrors
  `annotations/geometry.ts`), which also removes the duplicated `bbox`/`translate` in
  `PropertiesPanel.svelte:27-48` and the duplicated `MIN = 90` (`PaperPage.svelte:42`,
  `PropertiesPanel.svelte:81-82`).
- Undo becomes per-doc for free (§2.7), and `History`'s "capture selection with the frame" and
  "skip no-op commits" come along.

You don't need Sheets' peer/coordinator machinery (that exists because tool objects and
annotations are two editors on one surface). Pages' decided model (`todo.md` §6: one entity
model with `space` + `layerId`) needs only one editor per doc.

### 4.2 Use mm as the world unit now, not later  **[design]**

`todo.md` §2 already decides "model units are millimetres, integers". Doing it before more
geometry code lands avoids a painful conversion:

- paper = `paperDimsMm(...)` px (like Sheets, 1 px = 1 mm before zoom), drop `PAPER_PX_PER_MM`;
- viewport `viewBox` in mm with `scale` = 1:N denominator (Sheets' `vp.scale`, 0 = fit),
  replacing `BASE = 1.84`;
- print via the Sheets `Canvas` rules (`zoom: 96/25.4`), which then also fixes §2.2;
- Properties can show integer mm as decided.

`$lib/ui/print/types` should grow `A2` (and A1/A0 if wanted) so both tools share `PaperSize`.

### 4.3 Reuse the Sheets layer model  **[design]**

`layers/layers.ts` already encodes the decisions Pages needs: fixed default layers, custom layers
with a `base` category, `effectiveLayers(vp)` for per-view hidden/locked overrides, and
`layerBlockReason` for the lock guard. Pages' `LayersPanel` groups/sub-layers map onto
default/custom-with-`base`. Reusing the types (even before Firestore) means the panel can be wired
to entities (`layerId`) without inventing a second schema, and a future "View Preset" is just a
saved `layerOverrides` map.

### 4.4 Pan/zoom: use the shared helpers  **[design]**

`ui/panzoom.ts` is a nice small action and the "consumer applies deltas" shape is right. Swap the
raw `deltaY` for `normalizeWheelToPixels`/`wheelZoomFactorFromEvent` from
`$lib/ui/panzoom-controller` (also gives Mac trackpad speeds and factor clamping), and add
`touchcancel` to the touch listeners (Sheets' adapter handles it; a cancelled pinch currently
leaves `mode='pinch'`).

### 4.5 Persistence shape (when `todo.md` §12 lands)  **[design]**

Sheets' pattern that works: editor is the single writer; `docSaver` debounces writes
(`edit/persist.ts`); the subscription seeds the editor only while idle, and while active applies
remote frames through an echo guard with `untrack` (`edit/editing.svelte.ts:58-68`). Pages'
per-doc `DocEditor` (§4.1) slots straight into that. Avoid a `$effect` that reads local state and
writes the doc back (see the memory note on `Outlets.svelte` 2026-08-19).

---

## 5. Performance and testability

- `findSnap` (`Viewport.svelte:287-300`) and `pick` (`382-394`) call `localToClient` per snap
  point / per grip, and each call runs `vbMap()` → `svg.getBoundingClientRect()`. That is one
  forced layout read per snap point per pointer-move (≈ 9 per rect × N entities). Compute the map
  once per event and pass it in (Sheets reads the CTM once per `toWorld`). Same for `hoverBody`
  on every move.
- `hit()` runs a full linear scan with per-kind branches; fine for a mock, but once `DocEditor`
  exists a cached bbox per entity makes marquee/hit/snap all cheap.
- `history` list is keyed by index (`HistoryPanel.svelte:58`) while being prepended to, so every
  row re-renders on each edit; key by `h.t + h.label`.
- `LayersPanel` keys groups and kids by index (`LayersPanel.svelte:86,108`) and encodes
  `editing`/`dlg` as indices, so deleting a group shifts the rename target and the open dialog.
  Give layers ids.

Testability: `constrainPt`, `constrainGrip`, `hitEnt`, `bbox`, `boxElev`, `boxElevSet`, the
marquee window/crossing test and `paperDims` are all pure — once moved to a `.ts` module they can
get Vitest unit tests (neither tool has any today; `pnpm test` runs Vitest with Playwright).

---

## 6. Cleanups and nits

- Dead `'circle'` entity type: no tool creates it since Ellipse (Shift = circle) replaced it, but
  hit/grips/snaps/bbox/Properties still carry branches for it (`Viewport.svelte:245,283,338-341,513`,
  `PropertiesPanel.svelte:29,65,119-120`).
- Two types for one concept: EOS press-drag makes `'line'`, ACAD click-click makes `'polyline'`
  (`Viewport.svelte:145,156`). Make the Line tool always produce a `polyline` (a 2-point one in
  EOS mode) and drop `'line'`.
- Stale duplicated comment above `boxElevSet` (`Viewport.svelte:560-563`).
- Redundant condition `tool !== 'Select' && DRAW.has(tool)` (`Viewport.svelte:176`).
- `uid()` seeds a per-instance counter (`Viewport.svelte:75-76`); two instances of the same doc in
  split view can collide within one ms. Use one counter per `DocEditor` (or `nanoid`, as
  `sheets/data.ts` does).
- `CommandPalette` resets `sel` from an `$effect` (`CommandPalette.svelte:18`); do it in the
  input handler instead.
- `PaperPage`'s paper-space marquee is always crossing (`PaperPage.svelte:119`) while the
  viewport marquee is window/crossing — pick one convention.
- `Env` carries two booleans (`acad`, `navContent`) plus `wheelZoom` on the action; a single
  `mode: 'acad' | 'eos'` would read better.
- `svelte-check` warnings in `pages/` (all warnings except §2.5): unused CSS `.side-body*`
  (`+page.svelte:705-709`), `.hp-row.rev:hover` (`HistoryPanel.svelte:87`), `path` in the
  `:where()` list (`Viewport.svelte:749`); a11y — `<rect>` with pointerdown needs a role
  (`Handle.svelte:14`), click-without-key on `LayersPanel.svelte:139,141`,
  `ViewGizmos.svelte:27-31`, `CommandPalette.svelte:30,32`.
- Icon names all resolve (Lucide first, then the Kestrel set via the `k-` fallback in
  `Icon.svelte:60-64`) — no missing glyphs.

---

## 7. Suggested order

1. §2.5 type error, §2.1 fit/origin, §2.4 text-editor zoom, §2.2 print — small, contained,
   user-visible.
2. §2.3 lift frame state per doc (+ emit `null` on unmount) and §2.6 single key-handling instance —
   both are "state in the wrong place" fixes that get harder the longer they wait.
3. §4.1 `DocEditor` + `geometry.ts`, then add Delete, additive select, per-doc undo on top of it
   (this is also where the §2.7/2.8 undo issues resolve).
4. §4.2 mm world units + shared `PaperSize`, before layers/annotations get real geometry.
5. §4.3/§4.4 reuse `layers.ts` types and the `$lib` pan/zoom helpers.


/compact to flush mcp results and chrome browser results
/clear to switch to new tasks
set cheaper model for simpler subagents
break sessions

Layers need a lock button beside the visibility button. Changing between plan and elevation in a split tab affects the vertical offset of the other tab