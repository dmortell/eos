# Layer architecture (sheets)

There are **three layer scopes**. They share one per-viewport visibility/lock
mechanism but live in different documents with different lifecycles.

## 1. Global default layers — `LAYERS` (in `layers.ts`)
- Hardcoded constant: `outlets, trunks, racks, devices, rooms, ladders, cables, annotations`.
- **Project-wide, fixed, never deleted.** They are the canonical categories every
  tool maps its objects onto (e.g. the outlets tool tags outlets to `outlets`,
  annotations default to `annotations`).
- A custom layer's *category* = its `base` (one of these) or, for a default, its own id.

## 2. Project custom layers — `vps.customLayers`
- User-created layers, filed under a default via `base` (e.g. base:`annotations`).
- **Persisted project-wide** in `projects/{pid}.sheetLayers` (see `SheetEditor`
  `onLayersChange`). So they are shared across **all sheets and all floors**.
- Used by the non-model3d tools (outlets / racks / risers) and their annotations.
- ⚠️ **Deleting one removes it from the whole project** (every floor/sheet). This is
  the known footgun — acceptable for shared categories, but not for per-floor work.

## 3. Model layers — `model.layers`
- Each model3d model (`models3d/{pid}` → `models[]`) owns its layer set:
  `Walls, Furniture, Services, Structure, Background` (+ user-added).
- **Per-model = per-floor** (a model is generally one floor). Create/delete only
  affects that model. Reserved layers (`background`) are protected.

## Per-viewport visibility / lock (shared by all scopes)
- `vp.layerOverrides[layerId] = { hidden?, locked? }` toggles a layer **per viewport**
  (AutoCAD layer-state-per-layout style) — independent of where the layer is defined.
- `effectiveLayers(vp, layers)` resolves the hidden/locked id lists.

## Per-object layer assignment (tool objects)
Every tool object can be assigned to **any** sheet layer (default or project custom),
not just its kind's default — mirroring how annotations already carry a `layerId`.

- **Data:** each object type carries an optional `layerId` (absent → the object's
  *kind default* layer: outlets→`outlets`, trunks→`trunks`, rooms→`rooms`,
  ladders→`ladders`, cables→`cables`, racks→`racks`, devices→`devices`). Covered
  types: `OutletConfig`, `TrunkConfig`, `RackPlacement` (outlets tool);
  `RiserRoom`, `Ladder`, `Cable` (risers); `RackConfig`, `DeviceConfig` (racks).
  (model3d objects use their own `model.layers` `layer` field — separate system.)
- **Helpers (`layers.ts`):**
  - `objLayerOf(layerId, kindDefault, layers)` — effective layer id (the explicit
    `layerId` if it still resolves, else the kind default). The render/show-hide
    counterpart of `annLayerOf`.
  - `objLayerColor(effLayerId, layers)` — the layer's colour **only when it's a
    custom layer** (so moving an object onto a custom layer visibly recolours it);
    `null` for default layers, so semantic kind colours (outlet level, room kind,
    device type) are preserved.
- **Render:** each `*Render.svelte` resolves `objLayerOf(...)` per object and skips
  it when that layer is in the viewport's `hidden` list (was a whole-group
  `hidden.includes('<kind>')` gate), and applies `objLayerColor(...)` as a colour
  override. Per-object hide/colour for: outlets/trunks/floorplan-racks, riser
  rooms/ladders/cables, rack racks/devices (elevation + plan).
- **Editors:** each tool editor gained `setSelLayer(layerId)` — sets `layerId` over
  the current single or marquee-multi selection, then `notify()`. (Cf.
  `AnnotationEditor.setSelLayer`.)
- **Property editors:** `*EditPanel.svelte` show a **Layer** `<select>` (all
  `vps.allLayers`) per selection — single object sections and the multi-select
  block. The panels receive `layers={vps.allLayers}` from their viewport.
- **Creation:** new objects do **not** inherit the global `activeLayerId` (which is
  annotation-centric and would surprise — e.g. drop an outlet onto `annotations`).
  They default to their kind layer; the user re-assigns via the property editor.
- **Not yet done:** per-object *lock* still falls back to kind-level locking in the
  edit layers (only render hide is per-object); the racks panel has no multi-device
  layer block (assign devices singly). Both are follow-ups.

## model3d unification (per-model symbols)
Symbols/outlets are annotations (stored on `vp.annotations`), but in a model3d
viewport they can file onto **model layers** as well as `annotations`:
- `Model3dViewport.annLayerDefs` = the model's layers (mapped `base:'annotations'`
  so they're annotation-assignable) **+ the global `annotations` default**.
  Project *custom* layers are intentionally **not** offered (avoid the cross-floor
  footgun) — except any already referenced by this viewport's annotations
  (transitional, so existing data doesn't orphan). Add a **model layer** for new
  per-floor custom layers.
- `annHidden` / `annLocked` extend the sheet hidden/locked lists with the model
  layers' per-viewport overrides, so locking Walls hides symbols filed on Walls too.
- Outlet symbols are coloured by their assigned layer's colour
  (`a.color ?? layer.color ?? red`).
- `useAnnotations` takes optional `layers` / `activeLayer` / `locked` providers;
  other tools use the defaults (project layers) unchanged.

## Decision log
- **Per-model custom layers (chosen).** model3d custom layers live in `model.layers`
  (per-floor, safe delete). Global defaults stay. Non-model tools keep project
  customs for now. A full per-floor-for-all-tools merge was considered too large
  (outlets/racks/risers key off their own `pid_F{floor}` docs, not a model).
- **Per-object layer = any layer (chosen).** Tool objects can move to any sheet
  layer, not only their own category. More flexible (cross-tool grouping, e.g. a
  "Tenant A" layer) at the cost of the kind→default-layer assumption no longer
  holding everywhere — handled by the `objLayerOf`/`objLayerColor` resolvers.
- **Adopt the custom layer's colour (chosen).** Objects on a custom layer render in
  that layer's colour so grouping is visible; default layers keep semantic colours.
- **New objects default to their kind layer, not the active layer (chosen).** The
  global `activeLayerId` is annotation-oriented; auto-filing tool objects onto it
  would be surprising. Assignment is an explicit property-editor action.
