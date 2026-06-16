# Converting a standalone tool into a Sheets viewport renderer

How to take one of the original project tools (racks, outlets, risers, frames, …) and make its
drawing appear inside a **Sheets viewport** — selectable on a sheet, editable when the viewport is
active, printable, and showable full-screen in "model mode".

This is written against the existing **racks** viewport as the reference implementation
(`tools/racks/`). Outlets and risers follow the same shape.

---

## 0. The mental model

A viewport renderer must work in **three modes** from the *same* render component:

1. **Read-only on the sheet** — small, not active. Just draws the data. No handles, no input.
2. **Active (editing)** — the user double-clicked the viewport; it owns the data and shows handles,
   an annotation layer, a tool palette, undo/redo, delete, hotkeys.
3. **Model mode / print** — full-area (a `view` viewBox override) or the print page. Read-only.

The golden rule: **the render component draws from plain props (data + view), never by reaching
into the editor.** Editing is layered *on top* only when `active`. That's what lets the same
component serve all three modes.

Everything is drawn in **real millimetres** inside one `<svg>` with a mm `viewBox`
(`vector-effect="non-scaling-stroke"` keeps strokes crisp at any zoom and in PDF). The original
tools draw in CSS-pixel space with a `transform: scale(zoom)`; that has to be converted to mm-space
SVG (see §4).

---

## 1. The pieces (and the files that implement them for racks)

| Piece | Racks file | Responsibility |
|---|---|---|
| **Source type** | `../../types.ts` → `ViewportSource` | A `{ kind: 'racks', racksDocId, face, rowId?, … }` variant on `SheetViewport.source`. |
| **Dispatcher** | `../../ViewportContent.svelte` | `{#if vp.source.kind === 'racks'}<RacksViewport …/>`. |
| **Viewport wiring** | `RacksViewport.svelte` | The glue: editor + doc subscription + `useViewportEditing` + render + edit layer + panels + keydown. |
| **Headless editor** | `racks-editor.svelte.ts` (`RacksEditor extends SurfaceEditor`) | Holds the data as `$state`, `seed(doc)` / `snapshot()`, selection + mutations. No DOM. |
| **Read-only render** | `RacksRender.svelte` | Pure SVG draw from props. Sets up the `<svg>` + `viewBox`, calls `onview`/`onsvg`, renders `{@render children}` (the edit/annotation layers). |
| **Edit layer** | `RacksEditLayer.svelte` | `<svelte:options namespace="svg" />`. Interactive handles/hit-areas inside the render's svg. |
| **Tool palette / props** | `RacksEditPanel.svelte`, `DeviceLibrary.svelte`, `RacksWindow.svelte` | Floating UI (portalled) shown only when active. |
| **Layout maths** | `rack-layout.ts` | Pure helpers (`buildElevation`, `deviceBox`, `slotAtY`, `rackAtX`) shared by render + edit layer. |

Base class `edit/surface.svelte.ts` (`SurfaceEditor`) gives every editor: `svg`, `toWorld(e)` /
`toWorldXY(cx,cy)` (screen→mm via `svg.getScreenCTM()`), `startDrag(move, end)`, the marquee
machinery, and `notify()` → `onChange`. The shared hook `edit/editing.svelte.ts`
(`useViewportEditing`) wires seed-from-doc, debounced persist, the undo `History`, and the
annotation peer (`AnnotationEditor`).

---

## 2. Step-by-step recipe

### Step 1 — Define the source variant
Add a member to the `ViewportSource` union in `../../types.ts`, e.g.
`{ kind: 'mytool', myDocId: string; …options }`. Add it to the Type picker in
`parts/ViewportPropertiesWindow.svelte` (the `form.kind` select + `buildSource()` + the sync block),
and to the source-defaults helper there.

### Step 2 — Headless editor (`mytool-editor.svelte.ts`)
```ts
export class MyEditor extends SurfaceEditor {
  items = $state<Item[]>([])
  settings = $state<Settings>(DEFAULTS)
  // selection + mutations …
  seed(d: MyDocData | null) { this.items = (d?.items ?? []).map(x => ({ ...x })) }
  snapshot() { return { items: $state.snapshot(this.items), settings: $state.snapshot(this.settings) } }
  // override marqueeCollect / hasMultiSel / deleteMany if you support marquee multi-select
}
```
`seed` mirrors the Firestore doc → editor; `snapshot` is what gets persisted. Mutations call
`this.notify()` (debounced save + undo touch).

### Step 3 — Read-only render (`MyRender.svelte`)
- Owns the `<svg>` with a mm `viewBox` derived from the data bounds (and the `view` override for
  model mode). Fit-to-viewport when `view` is null; use `view` directly when given.
- Draw **only from props**: `items`, `settings`, `face`, `hidden` (layer ids to skip), etc.
- Call `onview({x,y,w,h,den})` after computing the viewBox (the host needs `den` =
  mm-per-… for scale labels) and `onsvg(svgEl)` so the editor can map coordinates.
- Render `{@render children?.()}` near the end so the edit + annotation layers compose inside the
  same svg/viewBox.
- Respect `hidden`: `{#if !hidden.includes('mylayer')}…{/if}` per object class.

### Step 4 — Edit layer (`MyEditLayer.svelte`)
- First line: `<svelte:options namespace="svg" />` (it's mounted via the render's `{@render
  children}` slot, which otherwise compiles elements in the HTML namespace → inert/zero-size).
- Draw transparent hit-rects over objects with `onmousedown` → select/drag via
  `editor.startDrag(...)`. Guard `if (e.button !== 0) return` so **right/middle-drag falls through
  to pan/zoom** (don't `stopPropagation` for those).
- Selection outlines use `vector-effect="non-scaling-stroke"`.
- Respect `hidden`/`locked`: a hidden or locked layer must be non-interactive
  (`pointer-events: none`).

### Step 5 — Wire it all in `MyViewport.svelte`
```ts
const editor = new MyEditor()
let src = $derived(vp.source.kind === 'mytool' ? vp.source : null)
let doc = $state<MyDocData | null>(null)
const { annEditor, history } = useViewportEditing({
  editor, collection: 'mytool', docId: () => src?.myDocId, doc: () => doc,
  active: () => active, vp: () => vp, vps, db,
})
$effect(() => {                      // live source doc subscription
  const id = src?.myDocId; if (!id) { doc = null; return }
  const unsub = db.subscribeOne('mytool', id, (d) => { doc = d ?? null })
  return () => unsub?.()
})
```
Template:
```svelte
<MyRender {…dataProps} {vp} {view} {hidden} onview={…} onsvg={(el) => { editor.svg = el; annEditor.svg = el }}>
  {#if active}
    <EditBackground {tool} {annEditor} toolEditor={editor} onadd={…place new objects…} />
    <MyEditLayer {editor} interactive={tool === 'select'} {hidden} {locked} />
  {/if}
  <AnnotationLayer editor={annEditor} interactive={active && tool === 'select'} {hidden} {locked} den={viewDen} />
</MyRender>
{#if active}<MyEditPanel … />{/if}
```
Add the keydown handler (markup hotkeys, Ctrl-Z/Y undo via `history`, Ctrl-C/V annotations, Esc,
Delete) — copy the block from `RacksViewport.svelte` and swap the editor mutations.

### Step 6 — Register in the dispatcher
Add the `{:else if vp.source.kind === 'mytool'}<MyViewport …/>` branch to `ViewportContent.svelte`.

---

## 3. Critical conventions / gotchas

- **`namespace="svg"`** on every edit/handle component rendered through `{@render children}`.
- **Right/middle mouse = pan/zoom.** Hit handlers must `if (e.button !== 0) return` *before* any
  `stopPropagation`, or the canvas can never pan over an object. (This was the racks "right-drag
  drags devices" bug.)
- **`EditBackground` has its own hardcoded list of annotation kinds it will place** — if a new
  annotation/placement kind doesn't work, check `edit/EditBackground.svelte` `ANN`/`onadd` gating.
- **Layers**: tool objects currently map to a fixed default layer by kind. Honour `hidden`/`locked`
  (passed from `effectiveLayers(vp, vps.allLayers)`); annotations carry a `layerId`.
- **Persist via `snapshot()`**, and always `$state.snapshot()` nested arrays/objects before saving
  (Firestore rejects proxies). The debounced saver + echo-guard live in `useViewportEditing`/`persist`.
- **No raw `history.pushState`** etc. (project rule). Use runes only.
- **mm-space**: 1 world unit = 1 mm. Convert any original px/zoom drawing maths to mm.

---

## 4. Racks-specific: making the viewport look like the original tool

Good news: the **data models already match**. `tools/racks/types.ts` and the original
`racks/parts/types.ts` share `RackConfig` / `DeviceConfig` / `RackSettings` with the same key fields
(`heightU`, `positionU`, `rowId`, `floorLevel`, `ceilingLevel`). The Firestore doc is the same
`racks/{pid}_F##_R#` shape. So **no data migration is needed** — this is purely a *rendering* upgrade.

The nicer visuals live in the original renderer; mine them and port into `RacksRender.svelte`
(read-only) and `RacksEditLayer.svelte` (selection):

- `racks/parts/RackElevationRenderer.svelte` — overall elevation layout, RU rails + tick marks.
- `racks/parts/RackFrame.svelte` — the rack frame chrome (posts, labels, RU numbering).
- `racks/parts/DeviceView.svelte` — device boxes (grey fill when "color devices" off, label layout).

Concrete differences the original does better (from the todo notes), and where to change them:
- **RU rails + tick marks** beside the numbers → `RacksRender.svelte` RU block (partly added already).
- **Thin blue selection border** (`#3b82f6`) for racks *and* devices, not a thick highlight →
  `RacksEditLayer.svelte` (done for devices; original uses the same blue).
- **Grey device fill** (`#d8d8d8`) when color-off → `RacksRender.svelte` device branch (done).
- **Floor/ceiling constrained to 10 mm steps** → this is an *editor* concern (where
  `settings.floorLevel`/`ceilingLevel` are edited), not the renderer. Snap on input in the
  racks editor / its properties panel.
- **Row builder** (more RU/depth options, move out of the sidebar to a menu) → original
  `racks/Racks.svelte` sidebar; this is original-tool UX, only relevant if you bring that panel in.

### The decision to make
You have two routes for the visual upgrade:

**A. Port the look into the existing `RacksRender.svelte`** (recommended). Keep the viewport plumbing
(editor, edit layer, `useViewportEditing`) exactly as is and only rewrite the *drawing* to match the
original — copying colours, stroke widths, RU rail geometry, device box styling from
`RackElevationRenderer`/`RackFrame`/`DeviceView`, translated into the mm-space SVG. Lowest risk;
everything else keeps working.

**B. Adapt `RackElevationRenderer.svelte` itself into the render slot.** Move it under `tools/racks/`,
strip its dependence on the original `Canvas`/`ViewState` (px+zoom) and re-express positions in mm
using `rack-layout.ts`, then have it set up the `<svg>`/`viewBox`/`onview`/`onsvg` like
`RacksRender` does. More faithful, more work — you're effectively rewriting its coordinate space.

Either way the editor, edit layer, panels, and persistence are untouched — only the read-only
drawing changes.

---

## 5. Checklist when converting / upgrading a tool

- [ ] Source variant added to `ViewportSource` + the Type picker (`ViewportPropertiesWindow`).
- [ ] `XEditor` with `seed()` / `snapshot()`; mutations call `notify()`.
- [ ] `XRender` draws from props only; sets up mm `viewBox`; calls `onview`/`onsvg`; renders
      `{@render children}`; honours `hidden`.
- [ ] `XEditLayer` has `namespace="svg"`, guards `e.button !== 0`, honours `hidden`/`locked`.
- [ ] `XViewport` calls `useViewportEditing`, subscribes to the doc, has the keydown block.
- [ ] Dispatcher branch added in `ViewportContent.svelte`.
- [ ] Works read-only on the sheet, active (edit), in model mode, and in package print.
- [ ] `pnpm check` clean (0 errors).
