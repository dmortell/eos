# Shape Library (todo 36) — implementation plan

Goal: a searchable, categorized palette of reusable **shapes** for the sheets annotation
system — built-in shapes (basic kinds + symbols + preconfigured outlets) plus **user-saved
custom shapes** (a single annotation or a saved group), placeable onto a viewport.

## Reference vs. ours
- **Reference** (`M:\dev\inv2026-04\src\routes\cad2026` — `LibraryStore.svelte.ts` + `ShapeLibrary.svelte`):
  a reactive store of `LibraryItem { id, name, category, shapeType, icon, tags, defaultData }`,
  search + category accordion, HTML drag-and-drop with `defaultData` → created via a shape registry
  on drop. Categories: basic / network / furniture / cabling / 3d.
- **In-repo precedent to copy** (closer fit, same stack): `tools/racks/DeviceLibrary.svelte` +
  `tools/racks/racks-editor.svelte.ts` (`library` array persisted in Firestore) +
  `RacksViewport.svelte:47` (`placeFromDrop`). A `Window` with `Search`, filtered list, per-item
  drag, add/edit `Dialog`.

Key difference from the reference: in sheets a **symbol is not free-form geometry** — it's a
hardcoded `switch(id)` render in `AnnotationLayer`. So a "library shape" is **not** a new render
type; it's a saved **blob of existing annotation(s)** (`kind` + field data, or a group of them).
No new rendering code per shape.

## 1. Data model
```ts
// one stored shape: a single annotation, or a group (relative coords, normalised to bbox origin)
interface LibraryShape {
  id: string
  name: string
  category: string          // 'Basic' | 'Symbols' | 'Outlets' | 'Custom' | user-defined
  tags?: string[]
  items: Partial<Annotation>[]   // 1 = single shape; N = a group (placed with one fresh groupId)
  builtin?: boolean         // code-defined defaults (not user-deletable)
  w?: number; h?: number    // bbox size (mm) for preview + drop sizing
}
```
A single symbol is just `items: [{ kind:'symbol', symbol:'section', ... }]`. A saved selection is
`items: [...selectedAnnList normalised so bbox top-left = (0,0)]`.

## 2. Storage (Firestore) — mirror `sheetLayers` / `annotationDefaults`
Project-wide array on the **project doc**: `projects/{pid}.shapeLibrary: LibraryShape[]`.
- `ViewportEditor` (`viewports.svelte.ts`): add `shapeLibrary = $state<LibraryShape[]>([])`,
  `addShape/removeShape/updateShape`, `onShapesChange` callback (mirror `customLayers`/`annoDefaults`).
- `SheetEditor.svelte:155-166`: read `data.shapeLibrary` in the existing `subscribeOne('projects', pid)`
  block; write via `db.save('projects', { id: pid, shapeLibrary })` (reuse the JSON echo-guard).
- **Built-in shapes** are code constants merged in (not persisted), like the reference
  `DEFAULT_LIBRARY_ITEMS`. (Global cross-project collection `shapeLibrary/{id}` is a later option.)

## 3. Built-in shapes + categories
- **Basic**: text, line, arrow, rect, ellipse, cloud, callout, dimension, grid, legend.
- **Symbols**: every `SYMBOLS` entry (section, elevation, detail, photo, north, door, faceplate).
- **Outlets**: one per `USAGE_COLORS` usage (Network, CCTV, Phone, AV, …) — preconfigured
  `{ kind:'symbol', symbol:'outlet', outlet:{ usage } , text }`.
- **Custom**: user-saved (see §6).
Categories derived from the items (`['All', ...unique]`), like the reference.

## 4. Library panel  (`annotations/ShapeLibrary.svelte`)
Copy `DeviceLibrary.svelte`: a `<Window name="sheet-shapes" title="Shapes">` with
- `Search` box (filter by name/category/tags/kind),
- category accordion (or flat grouped list),
- each row: a **mini SVG preview** + name. Preview = the actual annotation render at small scale
  (render the shape's `items` into a tiny `<svg viewBox>` reusing `AnnotationLayer`'s shape branch,
  or a simpler per-kind icon fallback initially),
- "＋ Save selection as shape" button (enabled when ≥1 annotation selected),
- per-custom-row delete + rename (a small `Dialog`, like DeviceLibrary's add/edit).
Mount next to `<LayersPanel {vps} />` in `SheetEditor.svelte:328`, and via `use:portal` in
`Model3dViewport.svelte:300` for model mode.

## 5. Placement — phase it
- **Phase 1 (click-to-place, lowest risk):** clicking a library row stashes the shape and arms a
  "place-library" tool. Add `AnnotationEditor.placeLibraryShape(p, shape)` that `push`es each item
  with new ids, a fresh `groupId` (if >1), offset to `p` — reuse `cloneItems()`/`paste()` logic
  (`annotations.svelte.ts:378-411`). Hook into the existing canvas press (`EditBackground.svelte:27-44`,
  `place()` routing). Escape cancels (existing behaviour).
- **Phase 2 (drag-to-place, nicer UX):** copy DeviceLibrary's `beginDrag/onMove/onUp` ghost +
  `RacksViewport.placeFromDrop`; on drop call `editor.toWorldXY(clientX, clientY)` then
  `placeLibraryShape`. Optional.

## 6. Save selection as shape
Action in the right-click menu (next to Group/Ungroup, `Model3dViewport.svelte:308`) and the panel:
1. `editor.selectedAnnList()` → snapshot the annotations.
2. Normalise coords relative to the selection bbox (`selWorldBounds()`), so the saved origin is (0,0).
3. Prompt for a name + category (small `Dialog`).
4. `vps.addShape({ id, name, category:'Custom', items, w, h })` → persists to the project doc.

## 7. Files to touch
- NEW `annotations/ShapeLibrary.svelte` (panel), `annotations/shapes/library.ts` (built-ins + types).
- `viewports.svelte.ts` — `shapeLibrary` state + add/remove/update + `onShapesChange`.
- `SheetEditor.svelte` — read/write `shapeLibrary` on the project doc; mount the panel.
- `annotations/annotations.svelte.ts` — `placeLibraryShape()` (+ arm state) reusing clone/paste.
- `Model3dViewport.svelte` — mount panel (model mode); "Save as shape" in the context menu.
- (Phase 2) drag-drop wiring like `RacksViewport.placeFromDrop`.

## 8. Effort / phasing
- **MVP**: data model + project-doc persistence + panel (built-ins, search) + click-to-place +
  save-selection-as-shape. ~1 focused PR.
- **Enhancements**: drag-to-place, accurate mini-render previews, per-shape edit dialog, global
  (cross-project) library, import/export.

## Open questions
- Single shapes vs groups: support both from the start (the `items[]` model covers both) — yes.
- Preview fidelity: start with per-kind icons or a tiny live render? (Recommend a tiny live render
  reusing the shape branch for accuracy; icon fallback for symbols if needed.)
- Global library now or later? (Recommend project-wide first.)
