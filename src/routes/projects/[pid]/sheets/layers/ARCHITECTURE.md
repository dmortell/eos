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
