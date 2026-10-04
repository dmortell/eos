# Phase 7 — Decommission

**Status:** DRAFT for Dave's review (2026-10-02). Nothing is deleted before the answers (§6).
- **Exit** (analysis §7): `src/routes/projects/[pid]/` holds only the cad tool and Uploads (plus Surveys).
- **Retires:** Pages, and with it every legacy route.

## 1. What's there

### Routes (`routes/projects/[pid]/`, files / lines)
- **Keep:** `cad` (1 / 32), `uploads` (11 / 2.6k).
- **Already superseded:**
  - outlets 30 / 7.2k (phase 2);
  - elevations 23 / 7.7k, racks 35 / 5.4k, frames 19 / 3.1k, patching 16 / 4.0k (phase 3);
  - sheets 116 / 15.3k, drawings 21 / 5.1k, packages 4 / 0.8k (phase 4);
  - fillrate 7 / 0.7k, risers 17 / 5.0k (phase 5);
  - pages 288 / 34.9k (phases 6–7).
- **No phase named them:** workspace 25 / 3.8k (wraps Outlets / Frames / Patching / Risers), edit3d 17 / 2.2k ("Edit 3D
  test"), parts 1 / 0.3k (VersionPanel), surveys (empty).
- **About 95k lines of route code go.** cad is 10k.

### Data per project (counted 2026-10-02)
| Project | Pages sheets | Pages models | Sheets-tool sheets | packages | other registry leaves | cad entities |
|---|---|---|---|---|---|---|
| Test Project | 10 | 4 | 7 (+1 sheetPackage) | 2 | outlets 2, racks 5, frames 2, risers 2, page 1 | 377 |
| Journey | 8 | 8 | 19 | 1 | racks 37, outlets 27, risers 2, page 3 | 1,197 |
| LR | — | — | 2 | — | outlets 32, risers 2 | **0 (never imported)** |
| Netflix 123 | — | — | — | — | outlets 4, racks 4 | **0 (never imported)** |

### Not imported into cad yet
- Pages: models, sheets, places, title block, global blocks.
- The Sheets tool: sheets, sheetPackages.
- The registry: revisions, versions, packages, issues.
- Old `pages/{pid}_{pageId}` docs.
- Legacy risers and fillrate docs, the racks library (templates), labelFormats.

### Code that would break if folders were just deleted
- `lib/cad/persist/import/legacyCabling.ts` and `lib/elevation/{portmap,reconcile}` import
  `frames/parts/{types,engine}` (the port-label engine the cad importer needs).
- `uploads/Uploads.svelte` imports `pages/constants` (`CAD_FILE`, `CAD_UPLOAD_MAX_MB`).
- The project page imports `Project` from `racks/parts/types`. Its tool list, the command palette and the title-bar
  menu link to the old tools. `lib/versioning` maps toolTypes → routes.
- `lib/rack`, `lib/versioning` and `lib/elevation` import from tool folders.
- `tsconfig.json` references `uploads/pdf-viewer-sample`.

## 2. Slices

| # | Slice | Contents | Check |
|---|---|---|---|
| 7.1 | **Untangle** (no behaviour change) | move frames' port-label engine + types and `CAD_FILE` constants into `lib`; the project page's `Project` type from `lib/types`; nothing outside the doomed folders imports them | svelte-check clean; cad import still identical on Test Project |
| 7.2 | **Import Pages sheets** | Pages sheets → cad sheets (paper, frames → viewports by direction / scale / model → level, clip), `revLog` → revisions, `projects.pages.titleBlock` → settings (same model), global Pages blocks → cad blocks | Journey's 8 Pages sheets open in cad looking like Pages' |
| 7.3 | **Import Sheets-tool sheets** | viewport sources: outlets → plan, racks → rack row, risers → riser view, text → paper text, model3d → plan / section, fillrate → a note; title, number, paper, revisions; sheetPackages / packages → §6 Q4 | Journey's 19 sheets in the register |
| 7.4 | **Pages models** (§6 Q3) | model objects → cad shapes on their level (walls → walls with openings, conduits / trunks → runs, prisms → boxes, annotations → shapes), sections → sections, layers | Journey 33F model in the cad plan, no duplicates of imported runs |
| 7.5 | **Soft retire** | the project page, palette and title bar list only cad, Uploads, Surveys; old routes still open by URL with a "retired — use cad" banner; import LR + Netflix into cad first (§6 Q2) | Every project opens in cad with its data |
| 7.6 | **Delete** | the route folders above + legacy-only `lib` (rack, pages, versioning, autosave, history, panzoom, formNav, ui/print, types/pages + versioning, catalog/service; check logger), in one commit after the grace period; Firestore data kept untouched | svelte-check + tests clean; the exit |

Rough size: the imports are the work (~1.5k lines). Deletion removes ~95k.

## 3. Questions for Dave (referred to as §6 above)

1. **The `pages/` folder:**
   - Your standing rule is "don't edit files in the pages folder", and another session works there in bug-fix mode.
   - Deleting it needs your explicit go-ahead and that session stopped.
   - OK to plan for it in 7.6, after the soft retire?
2. **Projects:**
   - LR and Netflix 123 have never been imported into cad (you said "don't need LR at this time").
   - Import both before the soft retire, or retire per project?
3. **Pages models (7.4):**
   - Import their 3D objects too, or only the sheets (the models' walls / trunks may duplicate what cad already
     imported from Outlets)?
   - Which projects' models matter?
4. **History:**
   - Bring the old revisions / packages / issues into cad's Issues as history?
   - Or start fresh in cad and leave the old records in Firestore (read-only)?
5. **Leftovers:**
   - Drop the legacy risers / fillrate docs (the riser view and fill are generated now)?
   - The racks library → global device templates?
6. **Grace period:** soft retire first and delete the code a while later? And keep ALL legacy Firestore data (never
   deleted, just unused)?
7. **workspace / edit3d / parts / surveys routes:** delete with the rest?

## 3a. Decisions (Dave, 2026-10-02)

1. **No deleting yet.** cad still lacks functionality. The old tools' links move into a CLOSED accordion on the
   project page.
   - 7.6 (delete) stays planned, but is not implemented until cad is feature complete.
2. **Untangle now (7.1):** move the type / constants Uploads uses (and the port-label engine the cad importer needs)
   out of the old folders.
3. **Projects:** import **LR** into cad. **Netflix 123** will be deleted (by Dave), so it isn't imported.
4. **History:** not imported into Issues.
5. **Legacy risers / fillrate:** left as they are until Dave has finished testing for gaps.
6. **Racks library → global device templates:** try it.
7. **Surveys tool:** kept. The other routes (workspace, edit3d, parts): decided later.
8. **Pages models (Q3):** pending the counts below.

### 3D objects: what cad imported from Outlets vs. what Pages models hold (2026-10-02)
| Project | cad (from Outlets / drawn) | Pages models |
|---|---|---|
| Test Project | 6 runs (trunk 4, tray 1, + the test riser), 1 wall (drawn in cad), 29 racks | "test": 4 prisms, 3 conduits · "4F": 7 prisms, 1 conduit, 1 wall, 26 notes, 1 section · "1F": 14 notes · "Room A": empty |
| Journey | 15 runs (conduit 11, trunk 3, tray 1), 25 racks, 580 outlets | "Zone 3303": 61 prisms, 13 conduits, 3 walls, 130 notes, 3 sections · "Hibiya Midtown": 10 prisms, 9 conduits · "Zone 3307": 5 conduits, 63 notes · "10F L10 WeWork": 55 notes · four floors with 0–1 notes |
| LR | not imported yet | none |

- Pages "prisms" are boxes: racks / furniture / equipment drawn in Pages. cad's racks come from the Racks tool, so
  importing them would double up the racks.
- The conduits / walls / notes / sections are the parts Pages has that cad doesn't.

## 4. Progress

### 7.1 Untangle + the project page (2026-10-02)
- **The frames port-label engine + types** moved to `src/lib/elevation/frames/{engine,types}.ts` (git mv). The old
  paths are one-line re-exports, so the legacy tools are untouched. `lib/cad` (legacyCabling), `lib/elevation`
  (portmap, reconcile + test) and `lib/versioning/adapters/frames` now import from `lib`.
- **`CAD_FILE` / `CAD_UPLOAD_MAX_MB`:** Uploads now imports them from `$lib/files/cadFiles.ts`. `pages/` is NOT
  edited and keeps its own copy until it's retired.
- **The project page:**
  - Its unused import of `Project` from `racks/parts/types` is gone.
  - It lists **CAD, Floorplan Uploads, Photo Surveys**, with the other 13 tools in a closed "Older tools" section.
    Nothing is deleted.
- **Checks:** svelte-check back to its 10 pre-existing errors (none new); 318 `lib` tests pass. Uploads and the
  legacy Frames tool still load.

### Racks library → global device templates (2026-10-02)
- **The mapper:** `persist/import/legacyTemplates.ts` (tests).
  - `type` → kind ("other" named shelf → shelf); face = panel both / PDU rear / else front.
  - RJ45 when it has ports; switches number ports in columns.
  - Stable ids `lib-<legacy id>`; one per distinct device across projects.
- **Run once:** 4 libraries / 10 entries → **9 global templates** in `settings/cadDeviceTemplates` (the two "Shelf"
  entries merged): Blanking panel 1u, Switch 10U, Shelf, Test device, Rack PDU 0U (24U), Network switch 2u 96p,
  Patch Frame (2U 48p), APC AR8841 PDU (30U), Switch Chasis (11U 240p, from Netflix 123's library).

### LR imported (2026-10-02)
- **The import:** the cad page's import imported **753 items**: 374 outlets, 154 devices, 110 links, 41 racks,
  32 spaces, 19 levels, 18 rack rows, 3 underlays, a building, settings.
- **Things to check:** 161, kept as import notes (right sidebar).
- **Netflix 123:** not imported (Dave will delete it).
