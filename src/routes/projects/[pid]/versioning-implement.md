# Versioning & Drawing Packages — Implementation Plan

## Current State Analysis

Each tool stores its data in a **single Firestore document** per floor (or floor+room), keyed like `{pid}_F{floor}` or `{pid}_F{floor}_R{room}`. There are no versions, no revision history, and no concept of "drawings" as publishable artifacts. Saves are immediate merge-writes via `db.save()`.

## What We're Adding

1. **Versions** — save snapshots of a tool's state so users can view history and restore
2. **Revisions** — freeze a version as an issued milestone (A, B, C…), immutable
3. **Packages** — curate revision sets (Concept Design, Detailed Design, RFP, etc.) for publish/share

## Key Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Storage model | **Full snapshot** | Simplest, reliable restore, fits Firestore well. Storage cost is low for these document sizes. |
| Revision codes | **Alphabetic** (A, B, C) | Industry standard for structured cabling drawings |
| Version storage | **Subcollection** under drawing doc | Avoids bloating the main doc, enables pagination |
| Package status | **Draft → Published → Superseded** | Simple 3-state model, no approval gate for MVP |
| Sharing | **Authenticated only** for MVP | Simpler security; signed public links can come later |
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

Each existing tool document becomes one or more "drawings":

| Tool | Current Doc ID | Drawing Scope | toolType |
|---|---|---|---|
| Racks | `{pid}_F{fl}_R{rm}` | One drawing per floor+room | `racks` |
| Frames | `{pid}_F{fl}` | One drawing per floor | `frames` |
| Outlets | `{pid}_F{fl}` | One drawing per floor | `outlets` |
| Patching | `{pid}_F{fl}_R{rm}` | One drawing per floor+room | `patching` |
| Fill Rate | `{pid}` | One drawing per project | `fillrate` |
| Surveys | `{surveyId}` | One drawing per survey | `survey` |

The **drawing doc** stores metadata and pointers; the **existing tool doc** remains the live working copy. Versions snapshot that working copy into the subcollection.

### Core Types

```ts
// src/lib/types/versioning.ts

export type ToolType = 'racks' | 'frames' | 'outlets' | 'patching' | 'fillrate' | 'survey';
export type DrawingStatus = 'active' | 'archived';
export type PackageStatus = 'draft' | 'published' | 'superseded';
export type PackageType = 'concept' | 'schematic' | 'detailed' | 'rfp' | 'shop' | 'as-built' | 'custom';

export interface DrawingDoc {
  id: string;
  projectId: string;
  toolType: ToolType;
  title: string;
  sourceDocId: string;          // e.g. "{pid}_F01_RA" — link to live tool doc
  status: DrawingStatus;
  currentVersionNumber: number;
  latestRevisionCode?: string;  // e.g. "C"
  createdAt: string;
  createdBy: string;
  updatedAt: string;
}

export interface VersionDoc {
  id: string;                   // "v1", "v2", ...
  drawingId: string;
  number: number;
  snapshot: unknown;            // full tool state blob
  snapshotHash: string;         // SHA-256 for integrity
  notes?: string;
  createdAt: string;
  createdBy: string;
}

export interface RevisionDoc {
  id: string;                   // "rA", "rB", ...
  drawingId: string;
  code: string;                 // "A", "B", "C"
  fromVersionId: string;
  snapshotHash: string;
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
      drawingTitle: string;
      toolType: ToolType;
      revisionCode: string;
      snapshotHash: string;
      sheetOrder: number;
    }>;
  };
  supersedesIssueId?: string;
}
```

## Tool Adapter Contract

Each tool needs a small adapter (no changes to existing save/load logic):

```ts
// src/lib/versioning/adapters.ts

export interface SnapshotAdapter<T = unknown> {
  toolType: ToolType;
  serialize(state: T): unknown;       // strip ephemeral UI state
  validate(snapshot: unknown): boolean;
}
```

Adapters are thin — they mostly pass through the existing doc data, stripping UI-only fields (cursor positions, drag state, selection). The existing type definitions in each tool's `parts/types.ts` define the snapshot shape.

## Service Layer

```ts
// src/lib/versioning/service.ts — uses db.save(), Firestore transactions

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
```

All state-changing operations use **Firestore transactions** to ensure consistency (increment version numbers, validate revision code uniqueness, assemble immutable manifests).

## UI Components

### 1. Version History Panel (per tool)
- Slide-out panel accessible from each tool's titlebar
- Lists versions (descending) with timestamp, author, notes
- "Restore" button creates a new version from the selected snapshot
- "Create Revision" promotes a version to immutable revision with code input

### 2. Package Builder (project-level)
- New tool entry on project dashboard — "Drawing Packages"
- List/create packages with type selector (Concept, Schematic, Detailed, RFP, Shop, As-Built)
- Add drawings by browsing revisions, filter by tool type
- Drag-to-reorder sheet order
- Preview manifest before publish

### 3. Publish Dialog
- Confirm publish action
- Optional message/notes
- Shows immutable manifest summary
- Returns issue code on success

## File Placement

```
src/lib/types/versioning.ts              ← shared types
src/lib/versioning/service.ts            ← version/revision/package logic
src/lib/versioning/hash.ts               ← SHA-256 snapshot hashing
src/lib/versioning/adapters/
  ├── racks.ts
  ├── frames.ts
  ├── outlets.ts
  ├── patching.ts
  ├── fillrate.ts
  └── survey.ts
src/routes/projects/[pid]/
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

### Phase 1 — Foundation (types + service + adapters)
1. Create `src/lib/types/versioning.ts` with all types
2. Create `src/lib/versioning/hash.ts` (SHA-256 canonical JSON)
3. Create `src/lib/versioning/service.ts` with version CRUD using Firestore transactions
4. Create snapshot adapters for each tool (start with racks + frames)
5. Add Firestore composite indexes

### Phase 2 — Version History UI
1. Build `VersionPanel.svelte` — slide-out panel listing versions + revisions
2. Wire into racks tool titlebar as first integration
3. Add "Save Version" action (snapshots current state)
4. Add "Restore Version" action (loads snapshot → saves as new working state + new version)
5. Add "Create Revision" action (freeze version with code A/B/C)
6. Roll out to remaining tools (frames, outlets, patching, fillrate)

### Phase 3 — Drawing Packages
1. Create drawing doc auto-registration (when a tool saves, ensure a drawing doc exists)
2. Build package list page at `/projects/[pid]/packages/`
3. Build PackageBuilder — select revisions, order sheets
4. Build PublishDialog — confirm and generate immutable issue
5. Add "Packages" entry to project dashboard tools list

### Phase 4 — Migration & Polish
1. Backfill script: create drawing docs + v1 version for all existing tool data
2. Add migration marker (`migratedToVersioningAt`) on source docs
3. Add audit logging for version/revision/publish events
4. Snapshot size warning (>500KB)

### Phase 5 (Future) — Sharing & Export
- Signed share links for published issues
- Read-only package viewer
- PDF export pipeline
- Hybrid delta storage for large floorplans

## What We're NOT Doing (MVP)

- No branching/merge workflows
- No real-time collaborative conflict resolution
- No approval gates (direct publish)
- No delta/incremental storage
- No PDF composition
- No external/public share links
- No autosave versions (manual save only for MVP)

## Risk Mitigations

| Risk | Mitigation |
|---|---|
| Inconsistent serialization across tools | Common adapter contract + snapshot hash verification |
| Large snapshot sizes | Warning threshold at save time; defer blob storage to Phase 5 |
| Users confuse version vs revision | Clear UI labeling: "Save Working Copy" vs "Issue Revision A" |
| Existing data continuity | Live tool docs remain untouched; versioning is additive |
| Migration failures | Idempotent backfill with marker fields; legacy read fallback |
