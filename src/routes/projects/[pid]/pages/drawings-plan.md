# Pages — managing drawings, models and places (plan)

Decisions agreed with Dave on 2026-09-24. This covers how Pages stores and organises its sheets, models and
places, how versions and revisions work, and how existing Sheets / tool data comes in. The Pages tool will
replace the Sheets tool, and over time the other tools' drawings, by rebuilding their features on Pages' code.

## 1. Concepts

| Term | What it is | Where it lives |
|---|---|---|
| **Place** | A node of the building fabric: building › floor › zone › room › row. Pages owns its own copy; it's seeded once from project data and edited only in Pages. | `pages.places` on `projects/{pid}` (§2.1) |
| **Model** | 3D geometry: walls, openings, furniture, outlets, trunks, conduits, plus its annotations. Models keep two lists, objects (3D) and shapes (2D). Models are **independent**: no model references another. One per floor. Zones or rooms may get their own model when a floor model would get too detailed (rack and desktop devices). A **building model** holds riser geometry and is the source of truth for levels. | `projects/{pid}/models/{modelId}` (§2.3) |
| **Sheet** | An issued drawing: paper + title block + viewport frames. It has exactly **one place**; that's filing only. | a `projects/{pid}/drawings/{id}` entry with its content stored on it (§2.2) |
| **Frame (view)** | A rectangle on a sheet showing one model: direction, scale, clip, pan/zoom, orbit, frozen layers. A frame isn't a drawing and has no registry entry. | inside its sheet |
| **Shape** (annotation) | 2D markup: lines, rects, text, dims, clouds, images. It lives **in the model**, tagged with the view it belongs to, and only ever appears through a frame. Nothing is drawn directly on the paper. | model `shapes` (was `ents`; the TS type is still `Ent` for now) |

Floor nodes in the tree open that floor's model (a model tab). Model tabs are for editing geometry, not for
issuing. Models are reached through their place in the tree. For admin (every model, archived ones, versions,
which sheets use a model) there's a **Models tab in the drawing management dialog** (§5). There's no sidebar tab.

**Places are generic** (noted for later, no plan change yet): every node is the same object apart from its
label (and an optional icon). The user can nest them any way they like, even where it doesn't make sense (a
building inside a room), and can invent new ones (country, city, …). The aim is code simplicity, so nothing
in the code should depend on a node's kind beyond display.

## 2. Storage (Firestore)

### 2.1 Pages project data — a `pages` map field on `projects/{pid}`
The other tools already keep floor details on the project doc, and write it with merge, so a `pages` field
sits beside them safely. One map keeps Pages' data together: `pages: { places, titleBlock, settings }`.
Arrays (`places`) are replaced whole on save; that's fine because Pages owns them.
- `places`: the Pages place tree (replaces the interim `buildings[]` / `FloorConfig.building` fields). Each node has a **stable id** (nanoid), `kind` ('building' | 'floor' | 'zone' |
  'room' | 'row'), `name`, `parentId` and `order`. Floors also carry `number`.
- Seeding: done once from `projects.floors`/`areas`, the per-room racks docs and the risers ranges, with the
  building logic used by today's tree (`projectTree.ts`). From then on Pages reads and writes only this field,
  and changes in the old tools are ignored.
- `titleBlock`: the one per-project title-block template. Its fields are filled automatically from the project
  and the sheet's drawing entry (number, title, revision, date, scale, drawn by).
- Settings: default paper size and scale, the tag list for the management dialog.

### 2.2 Sheets — `projects/{pid}/drawings/{id}` (the existing registry)
- A new `toolType: 'pages'`. The existing `'page'` value belongs to the old drawings editor (its 4 test docs
  in `pages/`, which Pages won't use).
- Registry fields used as they are: `title`, `drawingNumber` (starts **empty**, editable, not a key,
  duplicates ignored), `status` ('active' | 'archived'), `sortOrder` (manual drag order in the tree),
  `sheetSize`, `scale`, `discipline`, `latestRevisionCode`.
- New fields:
  - `placeId`: the sheet's one place; dragging it in the tree rewrites this.
  - `tags: string[]`
  - `kind`: plan / elevation / schematic / detail / schedule, for the dialog's categories.
- **Content stored on the entry (Option A):**
  - `paper { size, orientation, marginMm }`
  - `frames[]`, each with:
    - `id` and `seq` (the printable default label, e.g. "1"), plus an optional `label`
    - `x/y/w/h` in paper mm
    - `modelId`, `direction`, `scale`, `clip`, `view { zoom, x, y }`, `yaw/pitch`, `frozen[]`
    - `locked`, `border`

  A new frame defaults to the model of the sheet's place. A sheet with a few frames stays far below 1 MiB.
- Schema note: define the frame type once in `pages/types.ts` and use it everywhere (today's `SheetFrame`
  grows into it). This is the "better defined schema" the Sheets viewports lack.

### 2.3 Models — `projects/{pid}/models/{modelId}`
- One doc per model: `{ id, name, placeId, kind: 'floor' | 'zone' | 'room' | 'building', objects, ents, guides,
  sections, layers, underlays, levels?, version: '1.2', updatedAt }`. This is today's `Model` shape
  (`3dview/types.ts`) plus `placeId`/`kind`/`version`. One doc per model means the 1 MiB limit applies per
  model, not per project, unlike the old single `models3d/{pid}` idea.
- The building model is the source of truth for levels: `storeys: [{ id, name, z, floorSlab?, raisedFloor?,
  ceilingTile?, ceilingSlab? }]`, one per storey (heights in mm).
- A floor model stores `levelRef: { modelId, storeyId }` pointing at its building model's storey. It uses ids,
  not names, because names are editable. Heights are read live from the building model. The floor model
  keeps a cached copy in its own `levels` field so it still works when the building model is missing or archived.
- Model ids are strings (the Firestore doc id), replacing today's numeric in-memory ids.
- Model objects keep **stable ids**. Outlets use them; outlet labels are editable, and patch-frame ports
  (their own collection, later) link to outlet ids.
- **Archiving a model** is allowed even while sheets reference it. Their frames then show **"Missing model"**
  (a placeholder with the model name and an unarchive hint).

### 2.4 Saving
- Last write wins (like the other tools' autosave). Each edit writes the whole doc (debounced). A
  one-row-per-shape database would be ideal but Firestore doesn't need it at this size.
- The saving pattern follows the Outlets/Elevations tools, not Sheets (X4): subscription callbacks apply
  remote changes (never a `$effect` applier, see the project memory), and a `lastSyncJson` check stops the
  app re-saving what it just received.

## 3. Versions (models) and revisions (sheets)

- **Models have versions.** In the History tab:
  - **"Save version"** creates the next version; the first save is **1.0**.
  - A **major** bump (1.x → 2.0) stores a full model copy in `projects/{pid}/models/{id}/versions/{v}`.
  - **Minor** versions (1.1, 1.2) are entries with a date and a description of what changed.
- **Sheets have revisions** (issue codes, the registry's existing `revisions/` subcollection). Issuing a sheet
  records, for each frame, the model id + version it shows, so a revision reproduces the models **as they were
  when it was issued**.
- **Re-issuing after edits:** if a sheet or one of its models was edited after the last save or issue, issuing
  asks the user to either **overwrite** the current version/revision, or open History to save and bump the
  number first.
- **Issuing requires a major version** (decided 2026-09-24): every model a sheet shows must be at a major
  version (x.0) with a stored copy. If it isn't, the issue prompt sends the user to History to save one.

## 4. Project tree (sidebar)

- Shows **places** (from §2.1) with **sheets** filed under them, in manual drag order (`sortOrder`); dragging
  a sheet onto another place changes its `placeId`.
- **Places can be added, renamed, moved and deleted in Pages** (no sync back to the other tools).
  - A place that still has sheets or a model can't be deleted without moving or archiving them first.
- Context menu (or action button) on a place:
  - New sheet (place filled in; its first frame shows the place's model)
  - New zone / room / row
  - Rename / Delete
- Floor (and zone/room/building) nodes open their model.
- Archived sheets are hidden (a "Show archived" filter brings them back).

## 5. Drawing management dialog

The sidebar is too narrow for a register, so this is a dialog (File › Drawings…, or a button on the navigator).

- **Table:** number, title, place, kind, discipline, tags, status, current revision, packages, sheet size,
  scale, updated.
- **Grouping and filtering:** by place / floor, kind, discipline, status, package, sheet size, and user
  **tags**; search box.
- **Bulk actions:**
  - edit status / discipline / tags / kind
  - **renumber** the selection in sequence (a start number and a pattern)
  - **archive**
  - **export to Excel**
  - **save the selection as a package** (the existing `projects/{pid}/packages`)
- **Archived list:** unarchive, or **hard delete** (the only place a sheet can be deleted for good; confirm
  first).
- **Models tab:** every model (name, place, kind, version, archived), the sheets and frames that use each one,
  frames showing "Missing model", archive / unarchive, and a link to its History.

## 6. Importing existing data (one-off, no ongoing sync)

The old tools keep running on their own collections. Pages imports once and never syncs back.

- **Sheets tool → Pages:** import **one manually selected sheet at a time** (from the dialog), into a new
  Pages sheet. Paper and frame geometry map across; each Sheets viewport maps to a Pages frame. The Sheets
  viewport data is loosely structured (annotations, shapes and viewport props mixed), so it has to be mapped
  field by field into the new schema.
  - A viewport whose source has **no Pages model yet** isn't guessed at: the import shows a **message** naming
    the viewport and its source, and leaves that frame for a decision later.
  - The original Sheets docs are left untouched.
- **Risers → building model:** import levels and riser geometry from the risers docs for the one or two
  projects that need it (Hibiya, LR).
- **Outlets → floor model:** later. The open question is how zone docs merge into their floor model (e.g.
  `outlets/{pid}_F33__3303` and `__3307` into the 33F model).
- **Places:** seeded once (§2.1).

## 7. Suggested phases

Each phase ships on its own and gets live-checked in the browser.

1. **Schema + stores** (DONE 2026-09-24: `store/schema.ts`, `mappers.ts`, `places.ts`, `saver.ts`,
   `pagesStore.svelte.ts`; string model ids; `ents` → `shapes`): shared types (`Place`, `SheetDoc` content, `Frame`, the `Model` additions); Firestore
   services for the `pages` field on the project doc, sheets (registry `toolType: 'pages'`) and models, with debounced
   saving. Unit tests for the mappers.
2. **Places** (DONE 2026-09-24: `store/placeTree.ts`, `placeProps.ts`, place helpers in `places.ts`, `parts/treeDrag.svelte.ts`, navigator places mode): seed from project data (writing to a real project needs Dave's OK per project; start on Test
   Project). The tree reads Pages places; add / rename / move / delete places.
3. **Models persisted** (DONE 2026-09-24: registry <-> `projects/{pid}/models`, place models, Missing model, undo by id): floor and building models load and save; a floor node opens its stored model;
   "Missing model" placeholder; the in-memory mock models go.
4. **Sheets persisted:** new sheet from a place; sheet content saved on the registry entry; drag between
   places; manual order; archive. Numbered, printable frame labels; new frames default to the place's model.
5. **Title block template** per project, auto-filled.
6. **Drawing management dialog:** table, grouping and filters, tags, bulk actions, Excel export, packages,
   archived list + hard delete.
7. **History:** model versions (major copy / minor notes), sheet revisions, and the issue flow with the
   overwrite-or-bump prompt.
8. **Imports:** Sheets sheet → Pages sheet (one at a time); risers → building model (Hibiya, LR).

## 8. Deferred / to think about

- Importing outlets for zones (3303, 3307) into their floor model (33F).
- How much detail a floor model should hold vs separate zone/room models (rack and desktop devices).
- Rack elevations and patching drawings as Pages sheets; patch frames and patching in their own collection,
  linked to outlet ids.
- Fill Rate drawings.
- Versioned storage behind the top-bar Package / Version selectors (browse an issued package's sheets at
  their issued revisions).
- Deleting the old tools' duplicate automatic registry entries (e.g. the two "Riser Diagram" entries), and
  whether the tree shows the old tools' drawings at all once their features are rebuilt in Pages.
