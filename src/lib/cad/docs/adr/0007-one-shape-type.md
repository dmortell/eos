# ADR 0007: One shape type for everything drawn

**Status:** Accepted (Dave, 2026-10-02).
- "2D shapes should be identical to 3D shapes with height 0, and lines (polys) should be convertible to trunks or
  walls by giving them width / depth / height / z."
- Then: one Shape for *all* drawn items: text, dimensions, leaders, clouds, images, paper and viewport lines, groups
  and block inserts.

It replaces the separate Wall / Box / Extrusion / Containment / Annotation / SymbolDef types of the first drafts.

## Context

Pages has two parallel worlds: 2D shapes (`Ent`) and 3D objects (`Obj`). On top of those it has paper frames and
annotations scoped to one view. Each has its own:
- grips and hit test
- selection kind
- layer list
- clipboard
- edit path

The editing-merge work in Pages spent days reconciling them, and a line still can't become a trunk without being
redrawn.

## Decision

**One entity, `Shape`** (`domain/shapes.ts`) = an **owner** + **geometry** + optional **plane**, **section**,
**extent**, **role**, **label**, **group**, **layer** and **style**.

| Part | Options | 2D when … |
|---|---|---|
| owner | a **level**'s model (every view of the level sees it) · one **view** (e.g. a note on one elevation) · a **sheet**'s paper | n/a |
| `geom` | **path** (nodes with x / y / z, segments, may branch) · **rect** · **circle** · **arc** · **polygon** · **text** (incl. wrapping / markdown notes) · **dimension** · **leader** · **cloud** · **image** · **insert** (a block) | always present |
| `plane` | where a non-path shape lies: plan at z, or an elevation's vertical plane at a depth | absent = plan at z 0 (or the view / sheet's own 2D space) |
| `section` (paths) | w × h, rectangular or round, optional inner size, z anchored at the bottom or centre | absent (a plain line) |
| `extent` (regions) | distance pushed out of the plane: up from a plan, away from the viewer on an elevation | absent or 0 (flat) |
| `role` | **wall** (hosts openings) · **containment** (form, tier, serves; carries cables) · **object** (category) · **penetration** (core drill: Ø, through wall / slab, tag) | absent (a plain shape) |

**What this means in use:**
- **A line is a path.** Give it a section and z and it is a 3D strip. With the wall or containment role it is a wall
  or a trunk / conduit / tray / ladder; clear the role and it is a line again. The nodes never move on conversion.
  - The Wall and Trunk tools are presets.
  - Properties offers **Convert to: Line / Wall / Trunk / Conduit / Tray** on any path.
- **A rectangle is a region.** Give it an extent and it is a box. Polygons and circles work the same way.
- **Text, dimensions, leaders and clouds are shapes too.** In a level's model they lie on a plane, so they have a
  height: a callout can sit at a ceiling TV's height in 3D.
- **Everything drawn works the same way:** select, grip, move, copy, layer, group, draw order, clipboard and undo, in
  a model, a view or on paper. A new gesture is written once.
- **Groups:** shapes with the same `groupId` move together; groups nest.
- **Blocks:** a `BlockDef` is a named list of ordinary shapes, placed by an `insert` shape. This covers both library
  modes:
  - **Linked:** edit the definition and every insert follows.
  - **Copied:** the shapes are dropped in as a group and edited freely.

  "Make block from selection" turns grouped shapes into a block. Blocks are global (shared by all projects) or per
  project.
- **Outlet graphics** are any block, so a symbol, a block or the user's own grouped shapes all work (Dave's
  pages-features answer). Text in a block can show attributes (`{LABEL}`, `{PORTS}`) filled from the outlet.
- **Labels and auto-numbering** work on any shape.

**Not shapes, because they are data or are generated:**

| Item | What it is instead |
|---|---|
| Outlets, racks, devices, links, cords, levels, spaces | Project data (`domain/types.ts`), drawn by generators. In the editor they still select, move and grip like shapes (one behaviour registry), so the user doesn't feel a difference. |
| Title blocks | Generated on the sheet from the project template plus the sheet's fields. A later option is letting a template include shapes. |
| Schedules (outlets, patch list, BOM, drawing list) | Schedule views placed in viewports, always current. A hand-typed table is a text shape with a markdown table. |
| Section lines, elevation markers | The view itself, drawn in plan. Dragging or rotating a marker edits the view's frame. |
| Guides | Work planes (ADR 0006), saved per level. |
| Viewports | Part of the sheet. |

## Decided: outlets, racks and devices stay data (Dave, 2026-10-02)

"Keep outlets and racks as is. Devices too, but if I need to add odd items like modems / ONUs in racks or computers /
monitors / phones on furniture then I'll use blocks / groups."

Such items are block inserts or groups with `hostId` set to the rack or the desk shape, so they move with it. A
block placed in a rack elevation lies on the rack's front plane (`rackFrontFrame`). The background to the decision
follows.

## Background: should outlets and racks be shapes too?

Dave (2026-10-02): "not certain about outlets, racks and devices — I feel they are shapes, as they need selection /
grips and other functions like shapes, but willing to try your way for now."

**The alternative** is to fold them into ADR 0007 the way walls and trunks were:
- **An outlet** would be an insert shape with an `outlet` role (label, tier, usage, ports, zone).
- **A rack** would be a rect + extent shape with a `rack` role (U height, kind, row).
- **Conversion** would come for free, as with line → trunk: a box becomes a rack by giving it the role.
- **Uniformity:** layers, groups, labels, style and the clipboard would apply to them unchanged.

**Devices stay data either way.** Their geometry is fully derived from the rack and U position, so there is nothing
to draw or grip in plan.

**The costs of the alternative:**
- **Outlets entered in the grid before they are drawn** would need a shape with no geometry yet.
- **Domain queries** (allocation, schedules) would filter shapes by role instead of reading a typed collection.

**If it comes back:** the kernel's behaviour registry handles shapes and data entities through one interface, so the
user-facing behaviour is the same either way. Revisit only if, in Phase 2, the Outlet and Rack behaviours end up
duplicating shape behaviours (move, rotate, copy, layer, group).

## Consequences

- **Kernel behaviours** (hit, grips, move, transform, snap points) are written once per **geometry kind**. Roles
  only add fields and rendering details (wall hatch, trunk lid line, riser symbol, penetration tag).
- **Routing, fill and lengths** run over shapes with the containment role. Openings live on wall-role shapes.
  `Link.route` references `{shape, seg}`.
- **Penetrations** are found automatically where containment crosses a wall (plan) or a slab (a vertical segment
  between levels). Accepted ones become penetration shapes whose `source` keeps their tag stable. PEN places them by
  hand where no run is drawn (Phase 5).
- **Firestore:**
  - A shape's owner is stored as flat `levelId` / `viewId` / `sheetId` fields, so listeners query by owner (ADR 0003).
  - Blocks embed their shapes. A global block lives outside projects, as `blocks/{id}` does today.
- **Pages import mapping:**

  | Pages | cad |
  |---|---|
  | `Ent` line / polyline / rect / ellipse / arc / text / note / dim / callout / cloud / image / insert | the same geometry kinds; an ellipse becomes a polygon |
  | `space: 'view:<frameId>'` | a view owner |
  | wall graphs | path + wall role |
  | conduit graphs | path + containment role (4 edges → rectangular section, 16 / 24 → round) |
  | prisms | rect + extent |
  | openings on a layer | hosted openings where a wall overlaps them; otherwise an object with category `opening`, and reported |
  | penetration inserts | penetration role |
  | Pages blocks | `BlockDef`s |
- **The cost is one record with optional fields.** Per-kind constructors and `validateShape` (Phase 1) keep it
  honest: one owner, plane only on non-paths, section only on paths, and roles only on compatible geometry.
