# Pages — the 3D floor model (reference)

The engine is ported into `3dview/` and built out. This file keeps only the design decisions and the planned
storage shape. `CHANGELOG.md` records what landed, `README.md` covers how it's wired today, and the open items
live in `todo.md` / `review.md`.

## Decisions (Dave, 2026-09-20)

- **Keep Pages' own editor; port only the geometry engine** from `sheets/tools/model3d/` (not `edit3d/`, the
  frozen playground). The pure files (`types.ts`, `graph.ts`, `projection.ts`, `migrate.ts`) were lifted
  nearly verbatim into `3dview/`. The editing glue is Pages' own (`ui/` modules, its mm space, layers, undo).
  Importing the Sheets `edit/` host would have meant two coordinate and selection systems.
- **Model vs page:** a model (a floor's 3D) is a project-level store. A page is a sheet of viewports, and each
  viewport references a model plus its view config (`direction`, scale, clip). This is how Sheets works too
  (`ViewportSource {kind:'model3d', modelId, direction, clip}`).
- **Openings are faked, not cut:** a door, window or hole is a prism on the Openings layer
  (`Layer.opening`), drawn as a paper-coloured mask plus a frame. There is no boolean CSG. True CSG (needed
  for real 3D or quantities) is a separate, large effort and is deferred.
- **Furniture** is plain prisms on a Furniture layer until blocks/instances exist.
- **Trunk vs pipe** is the conduit's edge count: 4 = rectangular trunk, 16/24 = round pipe.
- **Annotations stay separate:** 2D `Ent`s are the markup and live alongside the model, which is the
  geometry. The mock `box` Ent is retired.

## Data model (mm, `3dview/types.ts`)

- `Prism`: x/y/z, w/h/d, `edges` (4 = box, 16/24 = cylinder), `rot` (+ `rotX`/`rotY` tilt), and
  `open`/`swing` for openings.
- `Wall`: a graph of `nodes` + `segments` with per-segment `thickness`/`h`.
- `Conduit`: a graph with per-segment `w`/`h`/`edges`.
- `Obj = (Prism | Wall | Conduit) & { layer?, id?, groupId? }`.
- A `Model` also carries `layers`, `underlays`, `guides`, `sections`, `ents` and `levels`, so undo rides one
  model snapshot.

## Storage (planned, X4 / `todo.md` §12)

- One project doc **`models3d/{pid}` = `{ models: Model[] }`**, mirroring Sheets' `ModelStore`. It is
  `$state`-reactive, saved with a 500 ms debounce, and de-duplicated by JSON. A `Model` is
  `{ id: number, name, objects, layers?, underlays?, levels?, … }` with numeric ids.
- A page stays its own doc (`pages/{pid}/{pageId}` for `PageDoc`, see `review.md`), holding viewports that
  point at models by id plus `{ direction, scale, clip, frozen }`. One sheet can mix viewports of different
  models (a floor and a rack), and a floor's model is reused across pages.
- Watch the **1 MiB doc limit**. A floor of walls, furniture and trunks fits in one doc. If a model gets
  heavy, split it into a subcollection with fractional order keys.
- Until then the models are in-memory, seeded from `mock/models.ts`.
