# Versioning & Drawing Packages — Implementation Plan

## Current State Analysis

Each tool stores its data in a **single Firestore document** per floor (or floor+room), keyed like `{pid}_F{floor}` or `{pid}_F{floor}_R{room}`. There are no versions, no revision history, and no concept of "drawings" as publishable artifacts. Saves are immediate merge-writes via `db.save()`.

## What We're Adding

1. **Versions** — save snapshots of a tool's state so users can view history and restore
2. **Revisions** — freeze a version as an issued milestone (A, B, C…), immutable
3. **Packages** — curate revision sets (Concept Design, Detailed Design, RFP, etc.) for publish/share
4. **Master Drawing List** — project-wide register of all drawings with revision history, exportable to Excel

This enables controlled design progression (Concept -> Schematic -> Detailed -> RFP -> Shop) without forcing each tool to reinvent revision logic.

## Key Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Storage model | **Full snapshot** | Simplest, reliable restore, fits Firestore well. Storage cost is low for these document sizes. |
| Revision codes | **Alphabetic** (A, B, C) | Industry standard for structured cabling drawings |
| Version storage | **Subcollection** under drawing doc | Avoids bloating the main doc, enables pagination |
| Package status | **Draft → Published → Superseded** | Simple 3-state model, no approval gate for first release |
| Sharing | **Authenticated only** for first release | Simpler security; signed public links can come later |
| Withdraw policy | **Supersede only** | Published issues stay immutable, new issues supersede |

## Firestore Data Model

### New Collections

```
projects/{pid}/drawings/{drawingId}          ← drawing metadata
projects/{pid}/drawings/{drawingId}/versions/{versionId}  ← snapshots
projects/{pid}/drawings/{drawingId}/revisions/{revisionId} ← frozen milestones
projects/{pid}/packages/{packageId}          ← package metadata
projects/{pid}/packages/{packageId}/items/{itemId}  ← revision references
projects/{pid}/issues/{issueId}              ← immutable publish manifests
```

### How Drawings Map to Existing Data

Each existing tool document becomes one or more "drawings". **Multiple drawings can share the same source document** — each with a different view preset (e.g. low-level outlets vs high-level outlets from the same floor data).

| Tool | Current Doc ID | Drawing Scope | toolType |
|---|---|---|---|
| Racks | `{pid}_F{fl}_R{rm}` | One drawing per floor+room | `racks` |
| Frames | `{pid}_F{fl}` | One drawing per floor | `frames` |
| Outlets | `{pid}_F{fl}` | Multiple drawings per floor (by view preset) | `outlets` |
| Patching | `{pid}_F{fl}_R{rm}` | One drawing per floor+room | `patching` |
| Fill Rate | `{pid}` | One drawing per project | `fillrate` |
| Surveys | `{surveyId}` | One drawing per survey | `survey` |

The **drawing doc** stores metadata, view preset, and pointers; the **existing tool doc** remains the live working copy. Versions snapshot that working copy into the subcollection.

### View Presets

Tools with multiple view modes (outlets, racks rear view, etc.) store a **view preset** on each drawing. This controls what's visible when rendering the drawing in a package or version history.

Example: Floor 1 outlets source doc (`proj_F01`) produces four separate drawings:

| Drawing title | viewPreset.layers |
|---|---|
| 1F Low Level IT Data Outlets | `{ lowOutlets: true, highOutlets: false, lowTrunks: false, highTrunks: false }` |
| 1F High Level Cable Routes and Outlets | `{ lowOutlets: false, highOutlets: true, lowTrunks: false, highTrunks: true }` |
| 1F Low Level IT Cable Routes | `{ lowOutlets: false, highOutlets: false, lowTrunks: true, highTrunks: false }` |
| 1F High Level Trunk Routes | `{ lowOutlets: false, highOutlets: false, lowTrunks: false, highTrunks: true }` |

Tools without meaningful view variants (frames, patching, fillrate) use a single default preset.

### Core Types

```ts
// src/lib/types/versioning.ts

export type ToolType = 'racks' | 'frames' | 'outlets' | 'patching' | 'fillrate' | 'survey';
export type DrawingStatus = 'active' | 'archived';
export type PackageStatus = 'draft' | 'published' | 'superseded';
export type PackageType = 'concept' | 'schematic' | 'detailed' | 'rfp' | 'shop' | 'as-built' | 'custom';

export interface ViewPreset {
  name: string;                    // "Low Level Outlets", "High Level Trunk Routes"
  layers: Record<string, boolean>; // which layers are on/off
  filters?: Record<string, any>;  // tool-specific view filters (e.g. scale, paper size)
}

export interface DrawingDoc {
  id: string;
  projectId: string;
  toolType: ToolType;
  drawingNumber: string;           // e.g. "UBSLR-EIR-05-IT-DR-0001"
  title: string;                   // e.g. "Low level IT cable routes 5F"
  sourceDocId: string;             // e.g. "{pid}_F01" — link to live tool doc
  viewPreset: ViewPreset;          // controls what's visible in this drawing
  status: DrawingStatus;
  sheetSize?: string;              // e.g. "A1", "A3"
  scale?: string;                  // e.g. "1/150", "NTS"
  discipline?: string;             // e.g. "IT", "AV", "Security"
  sortOrder: number;               // position in master drawing list
  currentVersionNumber: number;
  latestRevisionCode?: string;     // e.g. "C"
  createdAt: string;
  createdBy: string;
  updatedAt: string;
}

export interface VersionDoc {
  id: string;                   // "v1", "v2", ...
  drawingId: string;
  number: number;
  snapshot: unknown;            // full tool state blob
  notes?: string;
  createdAt: string;
  createdBy: string;
}

export interface RevisionDoc {
  id: string;                   // "rA", "rB", ...
  drawingId: string;
  code: string;                 // "A", "B", "C"
  fromVersionId: string;
  title?: string;
  description?: string;
  issuedAt: string;
  issuedBy: string;
  locked: true;
}

export interface PackageDoc {
  id: string;
  projectId: string;
  name: string;
  type: PackageType;
  status: PackageStatus;
  description?: string;
  issueSequence: number;
  currentIssueId?: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
}

export interface PackageItemDoc {
  id: string;
  drawingId: string;
  revisionId: string;
  sheetOrder: number;
  include: boolean;
}

export interface IssueDoc {
  id: string;                   // "iss_001"
  projectId: string;
  packageId: string;
  issueCode: string;
  publishedAt: string;
  publishedBy: string;
  manifest: {
    packageName: string;
    packageType: PackageType;
    items: Array<{
      drawingId: string;
      drawingNumber: string;
      drawingTitle: string;
      toolType: ToolType;
      revisionCode: string;
      sheetOrder: number;
    }>;
  };
  supersedesIssueId?: string;
}
```

## Master Drawing List

A project-level register of all drawings — the standard deliverable clients and vendors expect.

### What It Contains

| Column | Source | Example |
|---|---|---|
| Drawing No. | `drawingNumber` | UBSLR-EIR-05-IT-DR-0001 |
| Title / Description | `title` | Low level IT cable routes 5F |
| Size | `sheetSize` | A1 |
| Scale | `scale` | 1/150 |
| Rev A date | `revisions[0].issuedAt` | 2026-02-15 |
| Rev B date | `revisions[1].issuedAt` | 2026-03-20 |
| Rev C date | `revisions[2].issuedAt` | 2026-04-10 |
| ... | (dynamic columns per revision) | |

### Drawing Number Format

Configurable per project. Default pattern: `{prefix}-{floor}-{discipline}-DR-{seq}` where:
- `{prefix}` — project code (e.g. `UBSLR-EIR`)
- `{floor}` — floor code (e.g. `05`, `GF`, `B1`)
- `{discipline}` — `IT`, `AV`, `SEC`, etc.
- `{seq}` — zero-padded sequence number within the project

Users can also enter drawing numbers manually for flexibility.

### Excel Export

Built client-side using a lightweight library (e.g. `xlsx` / SheetJS or `exceljs`). Reads all drawing docs + their revisions, assembles the table, and downloads an `.xlsx` file. Revision columns are generated dynamically based on the highest revision code in the project.

### UI

- Accessible from project dashboard as "Drawing List" tool
- Table view with sortable columns
- Inline edit for drawing number, title, size, scale, discipline, sort order
- "Export to Excel" button in titlebar
- Filter by tool type, discipline, floor

## Tool Adapter Contract

Each tool needs a small adapter (no changes to existing save/load logic):

```ts
// src/lib/versioning/adapters.ts

export interface SnapshotAdapter<T = unknown> {
  toolType: ToolType;
  serialize(state: T): unknown;       // strip ephemeral UI state
  validate(snapshot: unknown): boolean;
  defaultViewPresets(): ViewPreset[];  // available view presets for this tool
}
```

Adapters are thin — they mostly pass through the existing doc data, stripping UI-only fields (cursor positions, drag state, selection). The existing type definitions in each tool's `parts/types.ts` define the snapshot shape.

The `defaultViewPresets()` method returns the available view combinations for that tool. For outlets this returns presets for low/high outlets and low/high trunks. For tools without view modes it returns a single default preset.

## Service Layer

```ts
// src/lib/versioning/service.ts — uses db.save(), Firestore transactions

// Drawing operations
createDrawing(projectId, toolType, title, sourceDocId, viewPreset, opts?) → { drawingId }
listDrawings(projectId, filters?) → DrawingDoc[]
updateDrawing(projectId, drawingId, fields) → void

// Version operations
createVersion(projectId, drawingId, snapshot, notes?) → { versionId, number }
listVersions(projectId, drawingId, limit?) → VersionDoc[]
restoreVersion(projectId, drawingId, versionId) → creates new version from old snapshot

// Revision operations
createRevision(projectId, drawingId, fromVersionId, code, title?) → { revisionId }
listRevisions(projectId, drawingId) → RevisionDoc[]

// Package operations
createPackage(projectId, name, type, description?) → { packageId }
updatePackageItems(projectId, packageId, items[]) → void
publishPackage(projectId, packageId) → { issueId, issueCode }

// Master Drawing List
getDrawingListWithRevisions(projectId) → Array<DrawingDoc & { revisions: RevisionDoc[] }>
exportDrawingListToExcel(projectId) → Blob
```

All state-changing operations use **Firestore transactions** to ensure consistency (increment version numbers, validate revision code uniqueness, assemble immutable manifests).

## UI Components

### 1. Master Drawing List (project-level)
- Table showing all drawings with drawing number, title, size, scale, revision columns
- Inline editing for metadata fields
- Sort/filter by tool type, discipline, floor
- "Export to Excel" downloads `.xlsx` with dynamic revision date columns
- "Add Drawing" creates a new drawing doc with view preset selection

### 2. Version History Panel (per tool)
- Slide-out panel accessible from each tool's titlebar
- Lists versions (descending) with timestamp, author, notes
- "Restore" button creates a new version from the selected snapshot
- "Create Revision" promotes a version to immutable revision with code input

### 3. Package Builder (project-level)
- List/create packages with type selector (Concept, Schematic, Detailed, RFP, Shop, As-Built)
- Add drawings by browsing revisions, filter by tool type
- Drag-to-reorder sheet order
- Preview manifest before publish

### 4. Publish Dialog
- Confirm publish action
- Optional message/notes
- Shows immutable manifest summary
- Returns issue code on success

## File Placement

```
src/lib/types/versioning.ts              ← shared types
src/lib/versioning/service.ts            ← version/revision/package/drawing-list logic
src/lib/versioning/export.ts             ← Excel export for master drawing list
src/lib/versioning/adapters/
  ├── racks.ts
  ├── frames.ts
  ├── outlets.ts
  ├── patching.ts
  ├── fillrate.ts
  └── survey.ts
src/routes/projects/[pid]/
  ├── drawings/
  │   ├── +page.svelte                   ← master drawing list
  │   └── parts/
  │       ├── DrawingList.svelte
  │       ├── DrawingRow.svelte
  │       └── ExportButton.svelte
  ├── packages/
  │   ├── +page.svelte                   ← package list & builder
  │   └── parts/
  │       ├── PackageBuilder.svelte
  │       ├── PublishDialog.svelte
  │       └── types.ts
  └── parts/
      └── VersionPanel.svelte            ← shared history panel
```

## Implementation Phases

### Phase 1 — Foundation (types + service + adapters) ✅
1. ✅ Create `src/lib/types/versioning.ts` with all types
2. ✅ Add `runTransaction` support to `db.svelte.ts`
3. ✅ Create `src/lib/versioning/service.ts` with drawing, version, revision, and package CRUD
4. ✅ Create snapshot adapters for racks, frames, and outlets

### Phase 2 — Master Drawing List ✅
1. ✅ Build drawing list page at `/projects/[pid]/drawings/+page.svelte`
2. ✅ Build `DrawingList.svelte` — table with inline editing (double-click cells)
3. ✅ Implement drawing number assignment (manual entry via add form)
4. ✅ Add Excel export via `src/lib/versioning/export.ts` (exceljs, styled header, dynamic revision columns)
5. ✅ Add "Drawing List" entry to project dashboard tools list

### Phase 3 — Version History UI ✅
1. ✅ Build `VersionPanel.svelte` — slide-out panel with versions tab, revisions tab, save/restore/issue actions
2. ✅ Wire into Racks tool titlebar ("Versions" button, auto-creates drawing doc via `findOrCreateDrawing`)
3. ✅ Save Version — snapshots current tool state into Firestore subcollection
4. ✅ Restore Version — loads snapshot, applies to tool state, triggers save
5. ✅ Issue Revision — freeze version with code A/B/C, form overlay in panel
6. ✅ Integrated into Frames and Outlets tools (same pattern: +page resolves drawingId, passes to component)

### Phase 4 — Drawing Packages ✅
1. ✅ Drawing doc auto-registration already done via `findOrCreateDrawing` in each tool's +page
2. ✅ Build package list page at `/projects/[pid]/packages/+page.svelte`
3. ✅ Build `PackageList.svelte` — create packages, add/remove/reorder revisions, available revisions picker
4. ✅ Build `PublishDialog.svelte` — confirm publish, shows issue code on success, error handling
5. ✅ Add "Drawing Packages" entry to project dashboard tools list

### Post-Phase Improvements ✅
- ✅ Version deletion — delete button with confirm on each version in VersionPanel
- ✅ Drawing deletion — soft-delete (archive) from master drawing list with trash icon + confirm
- ✅ Auto-create drawings — `findOrCreateDrawing` now creates all view-preset drawings for a tool type on first encounter (e.g. outlets auto-creates low/high outlets + low/high trunks)
- ✅ Package editing — edit name and description via pencil icon in package builder header
- ✅ Click-to-open — row number in drawing list links to the tool page for that drawing
- ✅ Package item removal — `updatePackageItems` now diffs and deletes removed items from Firestore

### Phase 5 — Migration & Polish
1. Backfill script: create drawing docs + v1 version for all existing tool data
2. Add migration marker (`migratedToVersioningAt`) on source docs
3. Add audit logging for version/revision/publish events
4. Snapshot size warning (>500KB)

### Phase 6 (Future) — Sharing & Export
- Signed share links for published issues
- Read-only package viewer
- PDF export pipeline
- Hybrid delta storage for large floorplans
- Show revision history in drawing title block
- Show drawing type (SD, DD, for RFQ, Shop Drawing) in title blocks

## Out of Scope (First Release)

- No branching/merge workflows
- No real-time collaborative conflict resolution
- No approval gates (direct publish)
- No delta/incremental storage
- No PDF composition
- No external/public share links
- No autosave versions (manual save only for first release)

## Risk Mitigations

| Risk | Mitigation |
|---|---|
| Inconsistent serialization across tools | Common adapter contract + validation |
| Large snapshot sizes | Warning threshold at save time; defer blob storage to Phase 6 |
| Users confuse version vs revision | Clear UI labeling: "Save Working Copy" vs "Issue Revision A" |
| Existing data continuity | Live tool docs remain untouched; versioning is additive |
| Migration failures | Idempotent backfill with marker fields; legacy read fallback |
| Multiple drawings from same source | View presets stored on drawing doc; renderers apply preset when displaying |
