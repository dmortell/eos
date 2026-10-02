# Phase 1: domain and store (status 2026-10-02)

**Exit criterion** (analysis §7): `bom()`, `patchList()` and `outletSchedule()` run against data imported from a real
project. **Met.** A read-only dry run in the browser (`dev/dryRun.ts`) imported all three projects in Firestore and ran
every report. Nothing was written.

## What was built

| Module | What | Tests |
|---|---|---|
| `domain/conventions.ts` | Axes, angles, elevation frames, `project` / `unproject`, rack front | 15 |
| `domain/types.ts`, `drawing.ts`, `shapes.ts` | The schema (ADRs 0001–0007) | 5 |
| `domain/make.ts` | Constructors (path, rect, box, text, wall, run) and conversion (line ⇄ wall / run) | in validate |
| `domain/validate.ts` | Per-entity and project checks: owners, geometry rules, device fit / overlap (PDUs are 0U), links and cords to real ports, label uniqueness | 11 |
| `domain/labels.ts` | Text labels: next label, port suffixes, **Renumber** (outlets carry it into their ports), natural sort, reading order | 9 |
| `domain/project.ts` | `ProjectIndex`: lookups, the link at a port, the label a port shows | in reports |
| `domain/reports.ts` | Outlet schedule, patch list, containment lengths (3D, vertical split out), BOM (quantities only) | 7 |
| `store/store.ts` | Immutable entity store: transactions, live gestures (one undo step, Esc rolls back), per-user undo that skips others' newer edits, frozen records | 9 |
| `persist/docs.ts`, `backend.ts`, `sync.ts` | Entity ⇄ doc, scopes, an in-memory server, store ⇄ backend sync (echo / pending rules) | 9 |
| `persist/firestore.ts` | The Firestore backend (`projects/{pid}/cadEntities`) | type-checked only, not run yet |
| `persist/file.ts` | Whole-project JSON export / import (O14) | 2 |
| `persist/import/*` | Legacy import: project, Frames, racks, patching, Outlets | 13 |

**Total: 80 tests, all passing.** `domain/` and `store/` have no Svelte or Firestore imports.

## Dry run on real data (read-only)

| Project | Entities | Outlets / ports | Racks / devices | Links / cords | Import + reports |
|---|---|---|---|---|---|
| Test Project | 327 | 55 / 162 | 27 / 44 | 138 / 44 | 10 ms |
| LR | 753 | 374 / 734 | 41 / 154 | 110 / 0 | 23 ms |
| Project Journey | 1,457 | 721 / ~2,100 | 27 / 214 | 396 / 0 | 78 ms |

## What the import found in the legacy data (worth knowing, not importer bugs)

1. **LR floor 10, server room A: the same labels on three racks.**
   - Room A has three racks (HR10-1-Rack1/2/3). The legacy allocation (`buildPortInfoMap` → `generateRacks`) gives all
     three the same labels at the same panel positions: `L10.A.097-A01` sits on U22 port 1 of every rack.
   - Elevations very likely shows it that way today. That looks like a legacy engine bug when a server room has
     several racks.
   - The import keeps the first rack's allocation and reports the other 160 panel ports (`location-port-twice`).
2. **Project Journey floor 33: every zone-A location number appears twice** in the Frames doc (ids `LA1` and `LA1_2`).
   That gives 82 duplicate outlet labels on the floor, flagged as `outlet-dup` errors.
3. **Project Journey floor 200: 34 drawn outlets were never linked** to their Frames locations, though they share the
   labels.
   - The import now matches them by label (`matched-by-label`).
   - Their port counts differ (3 drawn vs 2 in Frames). Frames is kept and the difference reported
     (`port-count-differs`).
4. **Rack placements for racks that no longer exist:** 3 in Test Project, 1 in Project Journey.
5. **11 drawn outlets with no label** (Project Journey floors 10 and 30). They are imported with a generated name and
   reported.
6. **One drawn outlet labelled `A002` whose Frames location gives `A.013`** (Test Project). The Frames label is kept.

## Importer bugs found and fixed by the dry run

- Legacy location ids are repaired from (zone, number), so they **repeat on every floor**. Keying locations by id
  alone merged floors 1 and 4 of Test Project. They are now keyed by floor; there is a regression test.
- "Outlet labels unique per project" was wrong. Formats like `A.001` carry no floor, so the rule is now **unique per
  level**. Port labels, which include the floor, stay project-unique.
- Vertical PDUs (rear 0U strips, 24 "U" long) showed as overlapping devices. **PDUs take no rack units** now.

## Not done in Phase 1 (by design)

- **Writing to Firestore.** The backend is type-checked but has never run. The first real write happens in Phase 2,
  on Test Project, with Dave's OK.
- **Port allocation** (the Frames engine as a pure cad function) moves to Phase 3, with the allocation UI.
- **Risers, Pages models / sheets and the Sheets tool** import in Phases 5 and 7.
- **Level heights** use risers' defaults until risers are imported.
