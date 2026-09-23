# Firestore data structure — reference

Surveyed 2026-09-23 from the code (read-only) plus a look at the live Hibiya project. Firebase project
`sunny-jetty-180208` (`src/lib/db.svelte.ts`). There are **no** `firestore.rules` / `firebase.json` /
`storage.rules` in the repo. `AGENTS.md` and `racks/firestore-collections.md` describe an OLDER layout
(`frames/{pid}` single doc, `racks/{pid}`) — trust this file / the code instead.

## Access layer — `src/lib/db.svelte.ts` (`Firestore` class)

| Method | Does |
|---|---|
| `getMany(path)` / `subscribeMany(path)` | whole collection |
| `subscribeWhere(path, field, value)` / `subscribeWhereContains` | `==` / `array-contains` query |
| `getOne(path, id)` / `subscribeOne(table, id)` | one doc; callback always gets `{...data, id}` even if the doc is missing |
| `create(path, data)` | auto id, set with merge |
| `save(path, data)` | `setDoc(merge:true)` on `data.id` (no id → `create`) |
| `saveFields(path, data)` | `mergeFields: keys` — each top-level field REPLACED (use when deleting map keys must stick) |
| `saveBatch(path, docs)` | batched merge + `updatedAt: serverTimestamp()`, missing id → `nanoid(8)` |
| `delete` / `deleteMany` / `runTransaction` | |

`sanitizeFirestoreData` strips `undefined`. Direct `firebase/firestore` use only in `src/lib/logger.ts`
(logs), `src/lib/presence/presence.svelte.ts` (`settings/presence`) and `Session.syncUserProfile`
(`users/{uid}`); the survey share route reads `surveys` with firebase-admin.

**Doc id conventions** (`src/lib/utils/floor.ts` `floorDocId` / `floorAreaDocId` / `roomDocId`):
`{pid}_F{NN}` (floor number padded to 2 — `F01`, `F33`, `F3307`, basement `F-1`), `_R{A-D}` (server room),
`__{areaId}` (tenant area).

## Collections

| Path | Shape / id | Main readers → writers | Key fields |
|---|---|---|---|
| `projects/{pid}` | one doc per project; new ids `{clientCode}-{projectCode}-{4 digits}` | almost every tool; `Projects.svelte`, `ProjectSettingsDialog.svelte`, `lib/utils/floor.ts`, risers FloorManager, Pages `OpenProjectDialog` | name, description, client, address, clientCode, projectCode, floors[], buildingFloors, skippedFloors, ownerId, members[], deleted/deletedAt/deletedBy, title-block fields, sheetLayers, annotationDefaults |
| `frames/{pid}_F{NN}` | one per floor (legacy `frames/{pid}` migrated on load) | frames, elevations, outlets, patching, workspace | floor, zoneLocations, rooms, customLocationTypes, floorFormat, labelFormat, portReservations, portAssignments, bakedLabels, structuredLinks |
| `racks/{pid}_F{NN}_R{X}` | one per floor + server room | racks, elevations, frames, outlets, patching, workspace | floor, room, rows[], racks[], devices[], settings, roomObjects[] |
| `racks/{pid}_library` | the project device library (same collection) | racks, elevations | templates[] |
| `patching/{pid}_F{NN}_R{X}` | one per floor + room | patching, elevations, workspace | floor, room, connections[], customCableTypes[], settings |
| `outlets/{pid}_F{NN}[__{areaId}]` | per floor, or per tenant AREA (the legacy area keeps the unsuffixed id) | outlets, elevations, workspace, drawings/sheets viewports | floor, outlets[], trunks[], routes[], rackPlacements[], selectedFileId, selectedPage, activeZone, legendPos, printSettings |
| `risers/{id}` | many per project (`where projectId == pid`); default id `{pid}`, extra "riser drawings" `randomUUID().slice(0,12)` | risers; workspace reads only `risers/{pid}` | projectId, name, fromFloor, toFloor, hiddenFloors, floorHeights, rooms[], ladders[], cables[], labels[], settings |
| `fillrate/{pid}` | one per project | fillrate, viewports | sections[], nextLabel |
| `files/{fileName}` | **global**; id = file name; membership `projectIds[]` (+ legacy `projectId`) | `lib/files.ts subscribeProjectFiles`, uploads (subscribes to ALL files), PdfViewer | name, url, key, path, type, provider, size, pageCount, projectIds, uploadedAt, pages{n: origin/scale/crop/masks}, hiddenLayers, hideMarkups |
| `projects/{pid}/drawings/{id}` | versioning REGISTRY, id `randomUUID().slice(0,12)` | `lib/versioning/service.ts`, `lib/pages/publish.ts`, drawings / packages | DrawingDoc (toolType, sourceDocId, title, status…) |
| `…/drawings/{id}/versions/v{n}` · `…/revisions/r{CODE}` | subcollections | versioning service | VersionDoc (full tool snapshot) · RevisionDoc (locked) |
| `projects/{pid}/packages/{pkg_x}` (+ `/items/{drawingId}_{revisionId}`) · `projects/{pid}/issues/iss_NNNN` | subcollections | packages, print, `publishPackage` | PackageDoc · PackageItemDoc · IssueDoc |
| `pages/{pid}_{pageId}` | **global**, `where projectId == pid` (drawings page editor) | `lib/pages/service.ts`, publish | Page (paper, titleBlock, viewports[], annotations[]) |
| `projects/{pid}/sheets/{id}` · `…/sheetPackages/{id}` | subcollections, id `nanoid(8)` | `sheets/data.ts`, sheet editor | SheetDoc · SheetPackage |
| `models3d/{pid}` | one per project (sheets model3d; Pages plans to use it) | `sheets/tools/model3d/models.svelte.ts` | models: Model[] |
| `drawings/{pid}` (+ `/sheets/{id}`) | **top-level**, edit3d (frozen tool) — NOT the versioning registry | `edit3d/parts/persist.svelte.ts` | models, schemaVersion |
| `logs/{pid}/{tool}/{autoId}` | per tool (frames, racks, patching, outlets, fillrate, risers) | `lib/logger.ts`, `frames/parts/LogsDialog.svelte` | timestamp (serverTimestamp), uid, tool, changes[], floor?, room? |
| `users/{uid}` | global, id = auth uid | several; written by `Session.syncUserProfile` | displayName, email, photoURL, providerIds, lastLoginAt, `role` (admin/manager/user — set by hand, never written by code) |
| `settings/presence` | one global doc | presence | users{uid: {displayName, lastActive…}} |
| `catalog/{maker-sku}` · `library/{lib-x}` · `labelFormats/{fmt-x}` | global | catalog service · sheets ShapeLibrary · AssignPortsDialog | CatalogProduct · LibraryShape · {name, template} |
| `surveys/{id}` (+ `/photos`, `/floorplans`) · `tasks/{id}` | global, linked by optional `projectId` | survey tool, drawings SurveyViewport · tasks, Dashboard | Survey… · Task |

Firebase Storage: `projects/{pid}/uploads/{nanoid8}_{filename}` (else UploadThing, `provider: 'uploadthing'`).

## Key shapes

```ts
// projects/{pid}                                   src/lib/types/project.ts
floors: FloorConfig[]        // legacy number[] → migrateFloors()
buildingFloors?: { bottom: number; top: number }   // physical stack (risers FloorManager)
skippedFloors?: number[]
buildings?: string[]         // Pages only (2026-09-23): building names in tree order, incl. empty ones ("New building")
FloorConfig { number; serverRoomCount /*1–4 → A..D*/; roomNames?: {A?: string…}; label?: string; areas?: FloorArea[]
              building?: string   /* Pages only (2026-09-23): the building this floor is in — see below */ }
FloorArea   { id; label; legacy?: boolean /*owns the unsuffixed outlets doc*/; primary?: boolean }

// racks/{pid}_F{NN}_R{X}                            racks/parts/types.ts RackDocData
rows: { id; label; defaults?; plan?: { originMm; rotationDeg } }[]
racks: { id; label; rowId; order; heightU; type; frameId?; … }[]
devices: { id; rackId; label; heightU; positionU; portCount; … }[]

// risers/{id}                                        risers/parts/types.ts RiserDocData
{ projectId; name?; fromFloor; toFloor; hiddenFloors?; floorHeights: Record<floor, {slabMm; raisedFloorMm; clearHeightMm; plenumMm}>;
  rooms: { id; kind: 'server'|'eps'; floor; label; serverRoomKey?: 'A'..'D' }[]; ladders[]; cables[]; labels?; settings }

// projects/{pid}/drawings/{id}                       src/lib/types/versioning.ts DrawingDoc
{ projectId; toolType: 'racks'|'frames'|'outlets'|'patching'|'fillrate'|'survey'|'risers'|'page'; drawingNumber; title;
  sourceDocId; viewPreset; status: 'active'|'archived'; sortOrder; currentVersionNumber; latestRevisionCode?; … }
// sourceDocId: racks/patching `{pid}_F{NN}_R{X}` · frames/outlets `{pid}_F{NN}[__{area}]` · fillrate/survey/risers `{pid}` · page `{pid}_{pageId}`
```

Frames `LocationConfig`, outlets `OutletConfig`, patching `PatchConnection`, `files.pages[n]`, `Page` viewport
sources, `SheetDoc`, and the versioning `Version/Revision/Package/Issue` docs are in the tools' `types.ts`
files named in the table.

## Project structure — where the location hierarchy lives

- **Buildings — no entity in Firestore.** A project is implicitly one building; `buildingFloors` /
  `skippedFloors` are the only building-level data. The Pages tool (2026-09-23) adds `projects.buildings`
  (names + order; "New building" in the navigator) and groups floors into buildings by: an explicit
  `FloorConfig.building` (set by dragging a floor onto a building, or in the floor's Properties) →
  else floors inside any riser doc's `fromFloor..toFloor` range belong to the project's own building
  (named from `address` / `name`) → else "Other building".
- **Floors** — `projects.floors[]` is canonical; tool docs also carry `floor` and encode it in the id.
  Display format `floorFormat` is stored per FLOOR in `frames/{pid}_F{NN}` (`L01` / `01F` / `01`).
- **Tenant areas** — `FloorConfig.areas[]`; split ONLY the outlets docs (`__{areaId}`). The Pages "zone"
  (e.g. 3303 / 3307) = these areas.
- **Zones (frames sense)** — letters A–Z = keys of `frames.zoneLocations`; appear in port labels `FF.Z.NNN-SPP`.
  Not linked to tenant areas.
- **Server rooms / IDFs** — letters A–D, count `serverRoomCount`, names `roomNames[X]` (fallback "Room X"); each
  has its own `racks/…_R{X}` and `patching/…_R{X}` doc.
- **Office rooms** — `frames.rooms[]` {roomNumber, roomName} and `roomNumber` on locations / outlets.
- **Riser rooms** — `risers.rooms[]` (server / EPS, per floor, optional `serverRoomKey`); no id link to racks.
- **Rows / racks** — `racks/…_R{X}.rows[]`; racks → row via `rowId`; devices → rack via `rackId`.
- **Drawings** — `projects/{pid}/drawings` (toolType + sourceDocId → floor / area / room parsed from the id,
  `parseSourceDocId` in `lib/versioning/adapters/index.ts`); sheets reference tool docs via viewport sources.
- An older real-data tree exists in `workspace/parts/TreeNavigator.svelte` (Floor → Patch frames → sr:{X} → rows → racks).

**Inconsistencies:** outlets reads `floors` raw (others use `migrateFloors`); frames/racks/patching/elevations
append a missing floor to `projects.floors` on save; `deleteFloor` misses patching docs and area outlets docs;
room letters hard-coded A–D in many places; three meanings of "room" and two of "zone"; the workspace knows only
`risers/{pid}`; stray data exists (Hibiya has a floor numbered `3307` — an old stand-in for the 33F area 3307 —
and registry drawings pointing at floors 1 and 200 that aren't in `floors`).

## Conventions

- **Autosave:** legacy timer + `pauseSync` (racks, patching, fillrate, 500 ms); `$lib/autosave/AutoSave` (outlets
  300 ms, elevations; echo guard = don't apply while unsaved + skip snapshots equal to the last 8 saves); risers
  400 ms + `lastSyncJson`; sheets / models3d / edit3d `docSaver` 400–500 ms; drawings page editor 250 ms patches.
- **Writes:** merge by default; `saveFields` where map-key deletes must stick; tool pages inject `floor` / `room`.
- **Timestamps are mixed:** `serverTimestamp()` (logs, saveBatch, presence), `new Date()` (projects, files, tasks,
  surveys), `Date.now()` ms (pages, sheets), ISO strings (versioning).
- **Versioning:** tools call `findOrCreateDrawing` on load (one DrawingDoc per view preset per sourceDocId);
  versions = full snapshots; revisions locked, lettered A…Z, AA; publish creates an Issue and supersedes the last.
- **Soft delete:** projects only (`deleted`, `deletedAt`, `deletedBy`); drawings "archive" via `status`.
- **Ownership:** `ownerId` + `members[]` stored, not enforced in queries; `users.role` gates trash deletion.
- **Scope:** per-project subcollections (drawings, versions, revisions, packages, issues, sheets, sheetPackages,
  logs); pid-prefixed doc ids (frames, racks, patching, outlets, fillrate, models3d, edit3d drawings, pages, risers);
  global (users, settings, catalog, library, labelFormats, files, surveys, tasks).

## Open questions

1. Two "drawings": `projects/{pid}/drawings` (registry) vs top-level `drawings/{pid}` (edit3d models).
   Two page systems: `pages/{pid}_{pageId}` (drawings editor) vs `projects/{pid}/sheets` (sheets tool).
2. Two 3D stores: `models3d/{pid}` (sheets) vs `drawings/{pid}.models` (edit3d), different schemas.
3. `IssueDoc` has no `status` in its type but `publishPackage` writes one; nothing reads `issues`.
4. Basement ids `F-1` don't parse with `findOrCreateDrawing`'s `_F(\d+)` regex.
5. `uploads` subscribes to the entire global `files` collection (per-project query commented out).
6. Viewport editors (drawings / sheets) write tool docs directly and can race the tool pages' autosave guards.
