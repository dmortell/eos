# Pages features: where each one goes

This is the Pages feature set as of 2026-10-02 (CHANGELOG rounds 1–21, the Help dialog, and the parity reviews). For
each feature it records which cad phase rebuilds it (analysis §7), or that it is changed or dropped. Phase 0 is done
when User has gone through the **Confirm?** column.

**Phase key:**

| Phase | Covers |
|---|---|
| P1 | domain + store |
| P2 | kernel + plan (Outlets) |
| P3 | racks / ports / patching (Elevations) |
| P4 | sheets + issue |
| P5 | routing / fill / quote / risers |
| P6 | elevations, sections, optional 3D viewer |
| P7 | decommission |

## Workspace and navigation

| Feature | Phase | Note | Confirm? |
|---|---|---|---|
| Tabs, preview tabs, split panes (vertical) | P2 | Workspace store per project, localStorage | y |
| Tree navigator: places, sheets under places, drag to re-file | P2 / P4 | Places = Building / Level / Space entities | y |
| Tree views: by type / level / discipline, custom + smart folders, tags | P4 | Port `store/treeViews.ts` + `tags.ts` as is | y |
| Items panel (lists of outlets / trunks / racks …) | P2 | Becomes the bottom **grid** panel, editable | y |
| Find a drawing (Ctrl+K), command palette | P2 | | y |
| Touch: two-finger pan / zoom, one-finger tools, latched Pan / Orbit | P2 | Port `ui/panzoom.ts` / `gestures.ts` model | y (no orbit) |
| URL restore of tree / tab | P2 | | y |
| Help dialog (how-to, shortcuts, F-keys) | every phase | Kept current per feature | y |

## Drafting and editing

| Feature | Phase | Note | Confirm? |
|---|---|---|---|
| Command line, typed coordinates, Space / Enter repeat, aliases | P2 | Port `commands.ts` + `CommandRunner` | y |
| OSNAP (end / mid / centre / intersection / perpendicular / nearest), POLAR, ORTHO, grid snap | P2 | Port `snap.ts` | y (osnap and grid snap only for now) |
| Object tracking (OTRACK) | **drop** | ADR 0005 | ✓ |
| Typed input while drawing: `x,y`, `@dx,dy`, `@d<a`, a bare number = direct distance towards the cursor; length / angle readout by the cursor | P2 | **Kept** (ADR 0005). This row was split out of "dynamic input" | |
| AutoCAD DYN: editable length / angle boxes floating at the cursor | **drop** | Covered by typing into the command line (ADR 0005) | |
| LINE, PLINE, RECT, CIRCLE, ARC, TEXT, NOTE, DIM (linear / aligned / rotated), LEADER / CALLOUT, CLOUD | P2 / P4 | ADR 0005 | y |
| MOVE, COPY, ROTATE, SCALE, MIRROR, ERASE, ARRAY, OFFSET, TRIM, EXTEND, STRETCH, MATCHPROP, ALIGN / distribute | P2 | Port `modify.ts`, `arrange.ts`, `groupXf.ts` | y |
| FILLET, CHAMFER, BREAK, JOIN, LENGTHEN, HATCH, SPLINE, ELLIPSE, AREA, ID, LIST, quick select, isolate | **drop** | ADR 0005; ask if any is used | ✓ ok to drop |
| Grips (rotated shapes, nodes, Ctrl-branch, Alt-split, double-click insert node) | P2 | Port `grips.ts`; one grip abstraction for all entity types | y |
| Marquee window / crossing, Shift / Ctrl multi-select, click-cycle through stacked items | P2 | | y |
| Clipboard: copy / cut / paste / duplicate, across sheets and projects, system clipboard images | P2 / P4 | | y |
| Groups, draw order (Ctrl+[ ]) | P2 | Every shape (ADR 0007), nested groups; data entities have no draw order | y |
| Lineweights, line patterns, structure lines | P4 | From the display list | y |
| Auto-number, walk renumber, sticky outlet defaults, next label | P2 | Text labels on any shape; **Renumber** (high priority: pick / reading / label order, ports follow) and next label; Relabel-from-pattern later (ADR 0002, `domain/labels.ts`) | y (not just outlets, should work on any shape with a label) |
| Undo / redo with History panel (jump to step) | P1 / P2 | Operation-based, per user (ADR 0003) | y |
| Named views | P2 | Stored on the view / workspace, not localStorage | y |

## Cabling objects

| Feature | Phase | Note | Confirm? |
|---|---|---|---|
| Outlets as symbols with LABEL / PORTS / usage, hi / lo level, height presets | P2 | `Outlet` entity drawn by any block (`blockId`): a symbol, a block, or grouped shapes made into a block (ADR 0007) | y (as symbols or blocks or grouped shapes) |
| Outlet schedule Excel | P1 / P2 | `outletSchedule()` | y |
| Trunks / pipes with spec bar + catalogue (PF22 / MK …), joins, branches, connection points | P2 | A path `Shape` with the containment role (ADR 0007); port `graph*.ts`, `connect.ts` | y (spec bar and catalog are not required) |
| **Vertical trunks / conduits (drops, rises, risers)** | P2 (drops) / P5 (risers) | ADR 0006: Rise / Drop / Level, draw in elevation | **required** |
| **2.5D shapes: position in plan, extend in z (or draw on an elevation, extend in depth)** | P2 (plan) / P6 (elevation) | ADR 0006: region shapes + extent, work planes, plane inset | **required** |
| **2D shapes = 3D shapes with no height; a line converts to a wall / trunk by giving it a section and z** | P2 | ADR 0007: one `Shape` type, CONVERT | **required** |
| Openings (door / window / hole), desk holes | P6 | Hosted on walls (ADR 0004). Free-standing "holes in boxes": confirm | ✓ |
| Walls | P2 (plan) / P6 (elevation) | A path `Shape` with the wall role (ADR 0007) | y |
| Fill on a conduit, fill section viewport | P5 | Accumulated over routes, not nearest-conduit | y (low priority) |
| Rack rows import, rack / device properties, RU marks | P3 | Parametric rack elevation (Elevations renderer) | y |
| Allocate outlets to panels (AllocateDialog) | P3 | Links + reservations; the Elevations allocation UI | y |
| Penetrations (PEN) | P5 | Decided 2026-10-02: **auto-detect + manual**. Found where containment crosses a wall or slab, tagged, listed in a schedule / BOM; accepted ones keep a stable tag; PEN by hand where no run is drawn (penetration role, ADR 0007) | ✓ |
| Blocks library (global), legend | P2 / P4 | `BlockDef` = named shapes, global or project; insert **linked** or **copied** (ADR 0007) | y |
| Guide lines | **drop** | Decided 2026-10-02 (User): no guides and no plane inset. The split view plus the Z / Depth fields set the work plane (ADR 0006) | ✓ |

## Views and 3D

| Feature | Phase | Note | Confirm? |
|---|---|---|---|
| Plan views, underlay PDFs with calibration (live Uploads link), images | P2 | `files/{id}` only | y |
| Elevations front / rear / left / right, elevation markers, any-angle frames | P6 | Generated; `conventions.ts` | y |
| Sections with depth bands, Z↑ / Z↓ handles | P6 | | y (Z handles are low priority) |
| Hidden lines (show / hide) | P6 | Interval method + vector fallback | y (low priority) |
| Structural slabs, raised floor, ceiling lines in elevations | P6 | From `Level.heights` | y |
| ViewCube, view-direction preview / keep / revert | P6 | Decided 2026-10-02: **ViewCube on model tabs** for quick plan / front / left … switching; sheet viewports change view from Properties as a normal undoable edit; **no preview chip** | ✓ keep? |
| 3D pop-out: iso / perspective / wire, orbit | P6 (optional) | Read-only three.js | ✓ |
| Editing objects in 3D / iso, tilted boxes, oblique views | **drop** | ADR 0004 | ✓ |
| Site view from OSM (building + neighbours) | **drop** | Reconsider later as an underlay source | ✓ |
| Building model / storeys, risers import | P1 / P5 | Levels + vertical containment | y |

## Sheets, drawings and issue

| Feature | Phase | Note | Confirm? |
|---|---|---|---|
| Sheets with viewports at true scale, viewport zoom = scale, Custom 1:N | P4 | | y |
| Viewport freeze / lock, viewport-only layers, labels / numbers | P4 | Per-view `hiddenLayers`; viewport-only layers → view-owned shapes | y |
| Title block templates (vertical / compact / horizontal), logos, revision table, company / client blocks | P4 | Port `titleBlock.ts` + editor | y |
| Drawing management dialog (table, filters, bulk edit, renumber, Excel) | P4 | Port `store/drawingList*.ts` | y |
| Model versions, sheet revisions / issue, packages | P4 | Issue snapshots by level (ADR 0003) | y |
| Print book (multi-sheet), print to PDF | P4 | | y |
| DXF export (layers, colours, blocks, images) | P4 | From the display list | y (low priority) |
| Duplicate sheet, pages between projects | P4 | | y |
| Sheets-tool import, register drawing import | P7 | One-shot importers | import or copy/paste |

## Not carried over

- Demo / mock data (models m1–m4, mock nav tree, mock layer presets).
- The second layer system (page layers vs model layers).
- Per-tab vs global history.
- `img:` session-only image keys.
