# ADR 0004: 2.5D, and one set of geometric conventions

**Status:**
- **Accepted:** 2.5D (Dave, 2026-10-02).
- **Proposed:** the conventions below. They match Pages as of f10f2dd0, so Pages data imports without flipping
  signs.

## Context

Pages carries:
- about ten coordinate systems
- four angle conventions
- duplicate basis tables, one of them with the opposite signs
- elevation annotations stored in coordinates that bake in `GROUND = 10250` and `PLAN_CX/CY`

Sign bugs followed:
- iso flipped
- LEFT / RIGHT mirrored
- hidden lines back to front
- the rack front facing away

Tests that pinned current output then locked those bugs in. The general 3D engine (iso / perspective editing, tilted
boxes, painter's sort) costs a lot and serves presentation more than the deliverables.

## Decision

### 2.5D

- **Everything has a z; nothing is a general solid.**
  - Walls, boxes and racks are upright extrusions.
  - Containment runs are 3D polylines (slopes, drops, risers).
  - There is no CSG, tilt or orbit editing.
- **A 3D view, if built later (Phase 6), is read-only three.js.** It is for presentation and never drives print or
  DXF.
- **Shapes and vertical runs:** drawing and editing them from plan *or* elevation (work planes, profile then extend,
  Rise / Drop) is specified in ADR 0006.
- **Openings are hosted on a wall segment:** offset along it, width, sill, head. They move with the wall, and
  generators cut gaps from them directly. There is no footprint-overlap matching.

### Conventions (implemented once in `domain/conventions.ts`, tested as what a viewer sees)

| Concept | Convention |
|---|---|
| Plan | Model mm; x to the right of the sheet, **y down the sheet** |
| Height | **z = mm above the level's FFL** (top of the raised floor). Under-floor runs are negative. Slab top = −`raisedFloorMm`. Levels stack by `Level.elevationMm`. |
| Angles | Degrees from +x towards +y, i.e. **clockwise on screen**. Only UI input/output converts to the counter-clockwise angle a user types (`screenCcwToPlan`). |
| Rotation | `rot` rotates an item about its `at` (footprint centre) with that same sense |
| Elevation frame | `{o, t, n}`: t = the viewer's right, n points **towards the viewer**, the viewer looks along −n. `(u, v) = ((p−o)·t, z)`; depth = `(p−o)·n`, larger = nearer. |
| Named elevations | `front` stands at the bottom of the sheet looking up (n = +y); `rear` n = −y; `right` stands at the right (n = +x); `left` n = −x |
| Rack front | The rack's **local +y face**, so an unrotated rack is seen from the front by `front` |
| Elevation drawing space | Each elevation view has its own 2D space (u, z) with the origin at the frame's `o` and FFL. Annotations owned by that view are stored in it. No global ground / pivot constants. |
| Paper | Paper mm from the sheet's top-left. A viewport maps view space to paper by its 1:N scale and centre. |

So there are two stored coordinate spaces (model plan mm, and each view's drawing mm) plus paper mm. The screen is
only a camera transform.

### Hidden lines

- Elevations and sections of upright extrusions use **interval occlusion in (u, z)**, which is exact for that case.
- The Pages `hiddenLines.ts` vector algorithm stays as a fallback for anything else.
- There is no painter's sort.

## Import mapping

- **Pages:** same plan axes, angles, front frame and FFL datum, so no flips. A Pages prism stores its `x, y` corner;
  convert it to the footprint centre. Elevation-space annotations subtract `GROUND` / `PLAN_CX` to land in view space.
- **Outlets trunks:** z is from the slab, so subtract the level's `raisedFloorMm`.
- **Racks / Elevations:** U positions stay U (1-based from the bottom). Row plan placement uses the row's
  `originMm` / `rotationDeg` → rack `at` / `rot`. *Check RU = 44.45 vs 45 mm before drawing heights.*
- **Risers:** floor heights map to `Level.heights`. Ladders become containment with nodes on several levels.

## Consequences

- **Every generator, tool and importer calls `conventions.ts`.** A second basis table or sign table is a review
  failure.
- **New convention tests are written as observations** ("the left view sees what faces −x"), never as snapshots of
  coordinates.
