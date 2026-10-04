# cad: the domain-first drawing tool (new kernel)

This is the replacement for Pages and the per-tool editors (Outlets, Elevations, Sheets, Risers, Fill rate, Packages).
The analysis behind it is in `docs/pages-analysis.md` (repo root).

**Status (2026-10-03):** Phases 0–6 are done and Phase 7 (decommission) is part done; each phase's plan, decisions and
progress are in `docs/phases/`. What comes next is in `docs/plan/`.

## Docs

| Folder / file | What |
|---|---|
| `docs/plan/` | The plan from here on: `backlog.md` (decided, ready to build), `decisions.md` (open questions), `later.md` (postponed) |
| `docs/phases/` | `phase1.md` … `phase7.md`: each phase's plan, Dave's decisions and the build log; `phase8.md`: the backlog batches as they're built |
| `docs/adr/` | The architecture decisions (below) |
| `docs/glossary.md` | The terms, and their names in the old tools |
| `docs/archive/` | Inputs, frozen: `gap-analysis.md` (legacy tools vs cad, with Dave's ticks), `todo.md` (Dave's raw todo batches), `pages-features.md` (the Pages feature list from Phase 0), `plan-sources.md` (the plan's G / T / P ids → their source) |

## Phase 0 deliverables

| File | What |
|---|---|
| `docs/glossary.md` | The terms, and what each one was called in the old tools |
| `docs/adr/0001-domain-first.md` | Project data is the product; drawings are generated; tables are first-class editors |
| `docs/adr/0002-labels.md` | Labels are plain text stored once; Renumber (high priority), Relabel-from-pattern later |
| `docs/adr/0003-persistence-and-undo.md` | One Firestore doc per entity; edits are operations; per-user undo |
| `docs/adr/0004-geometry-conventions.md` | 2.5D; axes, angles, z datum, elevation frames, rack front; hosted openings |
| `docs/adr/0005-drafting-scope.md` | The command line and ~25 drafting commands that are in; what is out |
| `docs/adr/0006-work-planes-shapes-vertical-runs.md` | Work planes; 2.5D shapes drawn in plan and extended in z (or the reverse on an elevation); vertical trunks / conduits / risers |
| `docs/archive/pages-features.md` | Every Pages feature in use, and which phase rebuilds it (or that it is dropped) |
| `docs/adr/0007-one-shape-type.md` | One `Shape` type for everything drawn: 2D is 3D with no height; a line converts to a wall / trunk; groups, blocks, penetrations |
| `domain/types.ts` | Project-data entities (places, underlays, outlets, racks, devices, links, cords, settings) |
| `domain/shapes.ts` (+ test) | `Shape`, everything drawn: an owner (level / view / sheet), geometry (path, rect, circle, arc, polygon, text, dimension, leader, cloud, image, block insert), plane, section, extent, roles (wall, containment, object, penetration), hosted openings |
| `domain/drawing.ts` | Drawing records (views, sheets, viewports, layers, groups, blocks) |
| `domain/conventions.ts` (+ test) | The one implementation of the geometric conventions, tested as statements about what a viewer sees |

Phase 0 is done when Dave has signed off the ADRs. Their status lines record what is decided and what is still
assumed.

## Planned layout (later phases)

```
src/lib/cad/
  domain/     pure TS: types, conventions, derived data (labels, allocation, routing, fill, BOM, patch list)
  store/      entity store, operations, transactions, undo
  persist/    Firestore adapter (entity-per-doc), JSON import/export, legacy importers
  views/      generators: (data, ViewDef) → DisplayList
  render/     DisplayList → SVG (screen/print), DXF
  editor/     surface, camera, input router, tools, commands, selection, grips, snaps
src/routes/projects/[pid]/cad/   the shell (tree, tabs/panes, panels, bottom grid)
```

## Ground rules

- **Order of work.** `domain/` and `views/` import nothing from Svelte or Firestore, and are tested in Node. Data
  and tests come first, then the generator, then the tool and UI.
- **No module-level `$state`.** Stores are created per project and provided through context.
- **One way to do each thing:**
  - one mutation path (operations)
  - one undo
  - one selection model
  - one tool interface
  - one display list for screen, print and DXF
- **Size limit.** No file over ~500 lines. Split along a real seam before that.
- **Comments.** They say why. Ticket and review ids belong in commit messages, not code.
- **Tests state meaning.** Write "the front view sees the rack's front", not snapshots of today's numbers.
- **Old code is off limits.** Don't edit `src/routes/projects/[pid]/pages/` from cad work; another session
  maintains it. Port code by copying it here with its tests, then adapting it.
