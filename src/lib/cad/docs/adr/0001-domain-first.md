# ADR 0001: Project data first; drawings are generated; tables are first-class

**Status:** Accepted (User, 2026-10-02: "the new drawing tool owns locations, ports, labels and cords").

## Context

Pages centres on drawings: sheets → viewports → a generic model of prisms, graphs and shapes. Cabling concepts are
faked inside that model:
- an outlet is a block insert with string attributes
- a panel is a prism with a `device` blob
- allocation is a label snapshot in `device.alloc`

So every report (schedule, BOM, patch list) has to work the data back out of the shapes, and there is no BOM and no
patch list at all.

The legacy tools hold the real domain model, split across four stores that don't agree:
- Frames locations and labels
- Outlets outlets and trunks
- Racks / Elevations devices
- Patching cords

`docs/archive/ux-plan.md` already decided that one label is canonical and that everything links by id.

## Decision

1. **The project data is typed entities with stable ids** (`domain/types.ts`): places, layout, outlets with ports,
   racks, devices, links, cords, containment, settings. The cad tool owns this data. The legacy docs are imported once
   and then retired, slice by slice.
2. **An outlet is one record.** The Frames *location* (labels, ports, server room per port, usage, tier) and the
   Outlets *outlet* (position, mount, symbol) become one `Outlet`. It may exist before it is drawn, so `at` is optional.
3. **Drawings are generated.** A `ViewDef` names a generator and its inputs. Plans, elevations, rack fronts, riser
   diagrams and schedules are computed from the data on every change. The only stored drawing content is:
   - view configuration
   - sheets and viewports
   - per-viewport overrides
   - drawn shapes (ADR 0007): model geometry, text, dimensions and other marks
4. **Tables are first-class editors.** Outlet / port entry, label review, panel allocation, the patch list and the BOM
   are grids over the same entities, in a bottom panel next to the canvas. They are not drawn objects and not
   separate tools. Each entity type declares its fields once, and that declaration drives both the Properties panel
   and the grid columns.
5. **Reports are pure functions over the entities:** `renderLabel`, `allocatePorts`, `routeLinks`, `fillBySegment`,
   `lengths`, `bom`, `patchList`, `outletSchedule`, `riserRuns`. Nothing derived is stored. The one exception is
   printed panel labels (ADR 0002).

## Consequences

- **Legacy importers are part of the plan, not an afterthought.** The legacy engines are ported with their tests:
  - the Frames label engine
  - `$lib/elevation/*`
  - patching `cableUtils`
  - racks `bom` / `compat`
  - the risers engine
  - fill-rate `packing`
- **Legacy outlets linked N:1 to one location** (several drawn outlets sharing a location) can't be represented. The
  importer reports them in an issues list for a person to resolve. User confirmed on 2026-10-02 that this is never
  intentional ("several outlets should not intentionally point to one frame location"), so the importer treats it as
  a data error: it keeps the first outlet and reports the rest.
- **Generated drawings can't be hand-edited.** The release valves are per-viewport overrides (hide, nudge a label) and
  shapes drawn on top. Anything that needs more is a missing generator feature.
- **A data-only workflow becomes possible**: enter outlets in the grid, allocate, print the patch list, then draw.
