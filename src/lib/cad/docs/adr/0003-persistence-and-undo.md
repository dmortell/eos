# ADR 0003: One Firestore doc per entity; edits are operations; undo is per user

**Status:** Proposed.
- **Q6:** stay on Firestore (User, 2026-10-02: "stay with Firestore for now"). Decided.
- **Q1:** assumed that several people occasionally edit the same floor.
- **Q5:** quotes don't need prices (User, 2026-10-02), so the catalogue holds SKUs and quantities only.

## Context

Pages saves each model as one Firestore document, replaced whole on every edit. Every edit re-saves every model.
That causes four problems:
- Two people editing different outlets on one floor overwrite each other.
- The 1 MiB limit covers the whole floor and every sheet's annotations.
- Undo snapshots every model in the project (up to 100 copies), and undoes colleagues' edits.
- Layer visibility is stored on the model, so hiding a layer hides it for everyone.

## Decision

### Storage

- **One doc per entity:** `projects/{pid}/cadEntities/{id}`. The doc holds the entity's fields plus `type`,
  `levelId` (when it has one), `sheetId` / `viewId` (shapes owned by a sheet or view, ADR 0007), `rev` (a counter),
  `updatedAt` and `updatedBy`.
  - Ports are embedded in their outlet or device; graph nodes and segments are embedded in their wall or containment
    run. No nested arrays.
  - The `cadEntities` name is checked against the existing subcollections (`drawings`, `packages`, `sheets`,
    `sheetPackages`, `models`, `issues`). It is free.
- **Listeners:**
  - one query per open level (`where('levelId', '==', L)`)
  - one for project-wide types (levels, spaces, racks, devices, links, cords, settings, views, sheets, layers)

  Measure the cost on the largest real floor (33F, ~3,300 items) in Phase 1. If project-wide racks / devices / links
  are too many, scope them by level too.
- **Writes:** a committed transaction becomes one `writeBatch` of its changed docs. Batches are capped at 500 writes,
  so larger operations (imports, bulk renumber) are split into several batches and labelled as one undo step locally.
- **The drawing register:** each sheet also gets an entry in `projects/{pid}/drawings/{id}` with `toolType: 'cad'`,
  so the cross-tool register, packages and revisions keep working.
  - **Issuing** a sheet stores a snapshot of the entities its views depend on, scoped by level, in the existing
    `versions` / `revisions` subcollections, and reuses the Pages content-hash logic.
- **Files** (PDF underlays, images, logos) are always `files/{id}` via UploadThing, never data URLs.
- **Global symbols** stay outside projects (like `blocks/{id}` today). Project symbols are entities.

### In memory

- **The store:** `Map<Id, Entity>` per type, holding immutable records in `$state.raw`. Records are replaced, never
  mutated.
- **The only mutation path:**
  ```ts
  store.transact('Move 3 outlets', tx => { tx.put({ ...o, at }) })
  ```
  This produces `Op[] = { type, id, before, after }[]`.
  - **Gestures** open a transaction on press, update it while moving, and commit on release. Esc rolls back.
  - **Persistence** writes the ops; the UI never writes Firestore directly.
- **Remote changes** arrive through the listener callbacks, never through an `$effect`. They replace records whose
  `rev` is newer. Our own echoes are recognised by `rev` + `updatedBy`, reusing `DocSaver`'s rules.
- **Conflicts:** last write wins *per entity*. Two people editing the same outlet at once is rare and acceptable.

### Undo

- **Per user.** Each step is the ops of one transaction; undo applies the inverses.
- **Undo never overwrites other people's work.** If an op's entity was changed by someone else since (the `rev`
  differs from the op's `after`), that op is skipped and a toast says so.
- **History is in memory**, up to ~200 steps; ops are small. Persisting recent steps across reloads is a later
  option.

### View and user state

- **Kept out of entities:** tabs, panes, cameras, tool options and per-user layer toggles live in a per-project
  `Workspace` store (localStorage), created per project. No module singletons.
- **The exception is a view's `hiddenLayers`.** It is stored on the `ViewDef`, because it changes what prints and
  everyone must get the same sheet. Per-user toggles sit on top as session state.

## Consequences

- **Every importer** writes entities through the same transaction path, so imports are undoable and auditable.
- **Firestore read cost scales with the entities on screen.** That is fine at the sizes seen so far; confirm in
  Phase 1.
- **The adapter interface is small:**
  - `subscribe(scope, cb)`
  - `write(ops)`
  - `snapshot(scope)`

  That keeps a later move (e.g. to the Turso idea in Pages todo §12) contained.
