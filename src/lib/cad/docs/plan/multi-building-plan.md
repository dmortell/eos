# Several buildings in one project — plan

Dave 2026-10-16: "prep a plan for multi buildings — Journey has 3 floors in one building, and 1 floor in another, with 3
more floors coming in a third building and an office in Osaka". Backlog item "Several buildings in a project" (P3 · L).

## Where cad is today

- **The model already has buildings.** `Building` (`domain/types.ts:26`) has a name, order and its own `floors` range,
  and every `Level` has a `buildingId`. The Navigator groups levels under their building (`navTree.ts:72`).
  `backupParts.ts` already tells buildings apart.
- **In practice there is one building.**
  - Floors… (`FloorsPanel.svelte`) edits only `ofType('building')[0]`.
  - `planFloors` / `restack` / `renumberFloor` / `renameFloors` (`domain/floors.ts`) take every level, whatever its
    building. A second building's 10F would be restacked onto the first one's.
  - Only Floors… (on its first Apply) and the legacy import create a building, and both make exactly one.
  - Nothing renames, adds, orders or deletes buildings.
- **Riser view:** one per project (`settings.riser`). It draws every level, banded by elevation alone, so two buildings'
  floors at the same height would merge into one band. Its spec has `buildingId`, but nothing uses it.
- **Labels** (`FF.Z.NNN-SPP`): no building token. Server-room letters (`Space.code`) are per level.
- **Sheets:** no `{BUILDING}` field, no building key in the title block, and no grouping by building (a sheet's
  `placeId` may already be a building id).
- **Journey, as it is now:**

  | Building (legacy `projects.floors`) | Floors | In cad |
  |---|---|---|
  | Hibiya Midtown | 12F, 30F, 33F (areas 3303, 3307) | All under a building named "Project Journey" |
  | Hibiya Fort Tower | 10F (L10 WeWork) | Missing — the import dropped it |
  | Third building | 3 floors coming | — |
  | Osaka office | — | — |

  There is also a second, empty "Project Journey" building record.

## The model

- **Building:** name, **code** (short: `MT`, `FT`, `OSK` — for labels, file names and sheet numbers), order, site
  address (title block; the Osaka office has its own), and its own floors range, datum and heights. Each building's
  levels stack on that building's own datum (FFL ±0), never against another building's.
- **No "site" or "campus" entity.** A Tokyo / Osaka grouping is only the order and the address. Buildings aren't linked
  in space: cabling between them is a link with a typed length, not a drawn route.
- **A level** belongs to exactly one building, as it does now. Moving a level to another building is an explicit
  command.

## Phases

1. **Buildings you can manage (M):**
   - Project › Buildings… lists buildings: add, rename, code, address, order, and delete when empty.
   - The Navigator gets "+ Building", and each building row keeps its "+" (floor models) and Floors….
   - Floors… takes the building: its range, names, heights and Apply touch only that building's levels.
     `planFloors` / `restack` / `renumber` / `renameFloors` filter by `buildingId`.
   - "Move to building…" on a level.
   - Merge the duplicate empty building on load (the empty one is deleted).
2. **Riser view per building (M):**
   - Each building row gets its own "Riser view". The spec's `buildingId` is used, and the riser settings
     (range, groups) live per building.
   - Bands come from that building's levels only.
   - Links to another building show as an off-page note ("→ FT 10F IDF") instead of a drawn riser.
3. **Labels and naming (S–M):**
   - An optional building token `{B}` in the label patterns (e.g. `MT.33.A.001-A01`). It's needed when two buildings
     have the same floor number and zone letters, or when a server-room letter repeats.
   - `{BUILDING}` text field and a title-block "Building" key; `{building}` in the file-name pattern.
   - Sheets › Group by building. Sheet numbers optionally prefixed with the code.
4. **Journey migration (S):**
   - From the legacy `projects.floors[].building`: create Hibiya Midtown (12F, 30F, 33F 3303 / 3307) and Hibiya Fort
     Tower (10F L10 WeWork, imported from its legacy floor).
   - Rename "Project Journey" to Hibiya Midtown.
   - Later: the third building (Floors… for it once its floors are known) and the Osaka office.
   - Undoable, and run only with Dave's go-ahead.
5. **Across buildings (S each, later):**
   - The BOM, cable and outlet schedules filtered or grouped by building.
   - Backbone links between buildings' server rooms with a typed length (no route). Fill and riser views ignore them.
   - Find / Ctrl+K shows the building on each hit.

## Decisions for Dave

1. **Building code in labels:** add `{B}` to Journey's patterns, or keep labels as they are (floor numbers differ
   anyway: 10 / 12 / 30 / 33)? Default: off, available per project.
2. **Osaka office:** a building in Journey, or its own project? A building keeps one BOM and one register. A project
   keeps its own sheets, numbering and members.
3. **Sheet numbers:** one sequence for the project, or per building (`MT-S001`, `FT-S001`)?
4. **Riser view:** per building only, or also a side-by-side "all buildings" view (stacks next to each other, no
   links drawn)?
5. **Server-room letters:** unique per building (A in MT and A in FT both allowed) or across the project?

Order: phase 1, then 4 (Journey on it), then 2 and 3; phase 5 as needed.
