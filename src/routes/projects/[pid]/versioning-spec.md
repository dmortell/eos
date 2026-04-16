# Versioning and Package System Technical Specification

## 1. Document Purpose

This specification defines the concrete implementation of drawing versioning, revision control, and package publishing for project tools stored in Firestore.

Scope:
- Rack elevations
- Patch frames
- Outlet and cable route floorplans
- Patching plans
- Containment fill-rate drawings
- Photo surveys

Goals:
- Add immutable revision history for all drawing tools.
- Support package creation and publishing for external/internal sharing.
- Keep implementation compatible with future storage optimization.

Non-goals (MVP):
- Branching/merge workflows.
- Real-time collaborative conflict resolution.
- Full PDF composition pipeline (optional post-MVP enhancement).

## 2. Architecture Overview

MVP model: full snapshot per version, immutable revisions, package issue manifests.

Logical layers:
1. Tool adapters: serialize/validate/load per tool.
2. Versioning services: create versions, promote revisions, restore states.
3. Package services: draft package assembly and issue publishing.
4. Authorization/audit: role checks and immutable publish trail.

Compatibility target:
- Schema fields reserved for future Hybrid Snapshot + Change Log model.

## 3. Firestore Data Model

All data is project-scoped under:
- projects/{pid}

### 3.1 Collections

- projects/{pid}/drawings/{drawingId}
- projects/{pid}/drawings/{drawingId}/versions/{versionId}
- projects/{pid}/drawings/{drawingId}/revisions/{revisionId}
- projects/{pid}/packages/{packageId}
- projects/{pid}/packages/{packageId}/items/{itemId}
- projects/{pid}/issues/{issueId}
- logs/{pid}/versioning/{eventId}

### 3.2 TypeScript Domain Types

```ts
export type ToolType =
  | 'racks'
  | 'frames'
  | 'floorplans'
  | 'patching'
  | 'containment'
  | 'survey';

export type DrawingStatus = 'active' | 'archived';
export type PackageType =
  | 'concept-design'
  | 'schematic-design'
  | 'detailed-design'
  | 'rfp'
  | 'shop-drawings'
  | 'as-built'
  | 'custom';

export type PackageStatus = 'draft' | 'published' | 'superseded' | 'withdrawn';

export interface DrawingDoc {
  id: string;
  projectId: string;
  toolType: ToolType;
  title: string;
  sheetCode?: string;
  discipline?: string;
  status: DrawingStatus;
  snapshotSchemaVersion: number;
  currentVersionId?: string;
  currentVersionNumber: number;
  latestRevisionId?: string;
  latestRevisionCode?: string;
  createdAt: string; // ISO
  createdBy: string; // uid
  updatedAt: string; // ISO
  updatedBy: string; // uid
  tags?: string[];
}

export interface DrawingVersionDoc {
  id: string;
  drawingId: string;
  projectId: string;
  number: number;
  snapshot: unknown; // tool-specific serialized data
  snapshotSizeBytes?: number;
  snapshotHash: string; // SHA-256 canonical hash
  baseVersionId?: string;
  isAutosave: boolean;
  notes?: string;
  createdAt: string; // ISO
  createdBy: string; // uid
}

export interface DrawingRevisionDoc {
  id: string;
  drawingId: string;
  projectId: string;
  code: string; // A, B, C or 0, 1, 2
  fromVersionId: string;
  snapshotHash: string;
  title?: string;
  description?: string;
  issuedAt: string; // ISO
  issuedBy: string; // uid
  locked: true;
  packageRefsCount: number;
}

export interface PackageDoc {
  id: string;
  projectId: string;
  name: string;
  type: PackageType;
  status: PackageStatus;
  audience: 'internal' | 'client' | 'vendor' | 'mixed';
  description?: string;
  issueSequence: number;
  currentIssueId?: string;
  publishedAt?: string; // ISO
  publishedBy?: string; // uid
  createdAt: string; // ISO
  createdBy: string; // uid
  updatedAt: string; // ISO
  updatedBy: string; // uid
}

export interface PackageItemDoc {
  id: string;
  projectId: string;
  packageId: string;
  drawingId: string;
  revisionId: string;
  sheetOrder: number;
  include: boolean;
  pinned: boolean;
  notes?: string;
  addedAt: string; // ISO
  addedBy: string; // uid
}

export interface PackageIssueManifestItem {
  drawingId: string;
  drawingTitle: string;
  toolType: ToolType;
  revisionId: string;
  revisionCode: string;
  snapshotHash: string;
  sheetOrder: number;
}

export interface IssueDoc {
  id: string;
  projectId: string;
  packageId: string;
  issueCode: string; // e.g. SD-001, RFP-003
  recipientType: 'internal' | 'client' | 'vendor' | 'mixed';
  recipientRefs?: string[];
  message?: string;
  publishedAt: string; // ISO
  publishedBy: string; // uid
  manifest: {
    packageId: string;
    packageName: string;
    packageType: PackageType;
    itemCount: number;
    snapshotSchemaVersion: number;
    items: PackageIssueManifestItem[];
  };
  supersedesIssueId?: string;
  withdrawnAt?: string;
  withdrawnBy?: string;
  withdrawnReason?: string;
}
```

### 3.3 ID Strategy

- drawingId: stable UUID v7
- versionId: v{number} (example: v12)
- revisionId: r{code} (example: rA, r02)
- packageId: pkg_{uuid}
- issueId: iss_{issueSequence padded} (example: iss_0004)

## 4. Serialization Contract (Tool Adapters)

Each tool must implement:

```ts
export interface DrawingSnapshotAdapter<TState = unknown> {
  toolType: ToolType;
  snapshotSchemaVersion: number;
  serializeSnapshot(state: TState): unknown;
  loadSnapshot(snapshot: unknown): TState;
  validateSnapshot(snapshot: unknown): {
    valid: boolean;
    errors?: string[];
  };
}
```

Adapter requirements:
- Deterministic key ordering before hash generation.
- No ephemeral UI-only state in persisted snapshot (cursor, temporary drag state).
- Explicit schema version in snapshot root.
- Backward parser for previous snapshotSchemaVersion values (minimum 1 version behind).

## 5. Service Interfaces

```ts
export interface VersioningService {
  createVersion(input: {
    projectId: string;
    drawingId: string;
    snapshot: unknown;
    isAutosave: boolean;
    notes?: string;
    baseVersionId?: string;
  }): Promise<{ versionId: string; number: number }>;

  listVersions(input: {
    projectId: string;
    drawingId: string;
    limit?: number;
    cursor?: string;
  }): Promise<DrawingVersionDoc[]>;

  restoreVersion(input: {
    projectId: string;
    drawingId: string;
    versionId: string;
    createNewVersionFromRestore: boolean;
  }): Promise<{ restoredVersionId: string }>;
}

export interface RevisionService {
  createRevision(input: {
    projectId: string;
    drawingId: string;
    fromVersionId: string;
    code: string;
    title?: string;
    description?: string;
  }): Promise<{ revisionId: string; code: string }>;

  listRevisions(input: {
    projectId: string;
    drawingId: string;
  }): Promise<DrawingRevisionDoc[]>;
}

export interface PackageService {
  createPackage(input: {
    projectId: string;
    name: string;
    type: PackageType;
    audience: PackageDoc['audience'];
    description?: string;
  }): Promise<{ packageId: string }>;

  upsertPackageItems(input: {
    projectId: string;
    packageId: string;
    items: Array<{
      drawingId: string;
      revisionId: string;
      sheetOrder: number;
      include: boolean;
      pinned?: boolean;
      notes?: string;
    }>;
  }): Promise<{ itemCount: number }>;

  publishPackage(input: {
    projectId: string;
    packageId: string;
    message?: string;
    recipientType: IssueDoc['recipientType'];
    recipientRefs?: string[];
    allowWithdrawnPolicy: boolean;
  }): Promise<{ issueId: string; issueCode: string }>;
}
```

## 6. Transactional Rules

Use Firestore transactions for all state-changing operations below.

### 6.1 Create Version

- Read drawing doc.
- Increment drawing.currentVersionNumber.
- Write new version doc with number.
- Update drawing.currentVersionId and updated metadata.

Failure rules:
- Reject if drawing.status is archived.
- Reject if snapshot validation fails.

### 6.2 Create Revision

- Read drawing doc + version doc.
- Ensure revision code not already used on this drawing.
- Write immutable revision doc with locked=true.
- Update drawing.latestRevisionId/latestRevisionCode.

Failure rules:
- Reject if version not found.
- Reject if version snapshotHash differs from provided hash check (optional optimistic check).

### 6.3 Publish Package

- Read package and included package items.
- Validate each item references existing revision.
- Resolve revision hashes and assemble manifest.
- Increment package.issueSequence.
- Write issue doc with immutable manifest.
- Update package.status=published, package.currentIssueId, published metadata.
- Increment revision.packageRefsCount for included revisions.

Failure rules:
- Reject if package has zero included items.
- Reject if any referenced revision is missing.

## 7. Firestore Security Rules (Example)

```txt
rules_version = '2';
service cloud.firestore {
  match /databases/{db}/documents {
    function isSignedIn() {
      return request.auth != null;
    }

    function role(projectId) {
      return get(/databases/$(db)/documents/projects/$(projectId)/members/$(request.auth.uid)).data.role;
    }

    function canEdit(projectId) {
      return isSignedIn() && role(projectId) in ['admin', 'editor', 'reviewer', 'publisher'];
    }

    function canPublish(projectId) {
      return isSignedIn() && role(projectId) in ['admin', 'publisher'];
    }

    match /projects/{pid}/drawings/{drawingId} {
      allow read: if canEdit(pid);
      allow create, update: if canEdit(pid);
      allow delete: if isSignedIn() && role(pid) == 'admin';

      match /versions/{versionId} {
        allow read: if canEdit(pid);
        allow create: if canEdit(pid);
        allow update: if false; // immutable version docs
        allow delete: if false;
      }

      match /revisions/{revisionId} {
        allow read: if canEdit(pid);
        allow create: if canEdit(pid);
        allow update, delete: if false; // immutable revisions
      }
    }

    match /projects/{pid}/packages/{packageId} {
      allow read: if canEdit(pid);
      allow create, update: if canEdit(pid);
      allow delete: if isSignedIn() && role(pid) == 'admin';

      match /items/{itemId} {
        allow read: if canEdit(pid);
        allow create, update, delete: if canEdit(pid);
      }
    }

    match /projects/{pid}/issues/{issueId} {
      allow read: if canEdit(pid);
      allow create: if canPublish(pid);
      allow update: if false; // issue manifests immutable
      allow delete: if false;
    }
  }
}
```

Note:
- Production rules should add stricter schema validation for required fields.
- Publish should be executed by callable backend for stronger validation and reduced rule complexity.

## 8. Indexes

Recommended Firestore composite indexes:

- drawings: (projectId asc, toolType asc, updatedAt desc)
- versions: (projectId asc, drawingId asc, number desc)
- revisions: (projectId asc, drawingId asc, issuedAt desc)
- packages: (projectId asc, status asc, updatedAt desc)
- package items: (projectId asc, packageId asc, sheetOrder asc)
- issues: (projectId asc, packageId asc, publishedAt desc)

## 9. API/Backend Endpoints (Suggested)

Use SvelteKit +server endpoints or callable backend handlers.

- POST /api/projects/{pid}/drawings/{drawingId}/versions
- GET /api/projects/{pid}/drawings/{drawingId}/versions
- POST /api/projects/{pid}/drawings/{drawingId}/revisions
- GET /api/projects/{pid}/drawings/{drawingId}/revisions
- POST /api/projects/{pid}/packages
- PATCH /api/projects/{pid}/packages/{packageId}/items
- POST /api/projects/{pid}/packages/{packageId}/publish
- GET /api/projects/{pid}/issues/{issueId}

Request/response validation:
- Use a runtime schema validator (example: zod).
- Reject unknown toolType, duplicate revision code, invalid sheetOrder.

## 10. Migration Plan

### 10.1 Existing Data Sources

Current tool documents likely include:
- frames/{pid}
- racks/{pid}
- files/* metadata and page state
- related tool-specific docs under projects/{pid}

### 10.2 Backfill Strategy

Phase 1 backfill:
1. For each project and supported tool:
2. Create drawing doc per current drawing/sheet entity.
3. Serialize current state as snapshotSchemaVersion=1.
4. Create version v1 (isAutosave=false, notes="Imported baseline").
5. Optionally create revision r0 or A based on selected policy.
6. Record migration audit event.

Idempotency:
- Add migration marker field migratedToVersioningAt on source docs.
- Safe re-run checks for existing drawingId mapping.

Rollback:
- Keep source docs unchanged for first release.
- Add feature flag to disable new reads and fallback to legacy source if needed.

## 11. UI/UX Specification

### 11.1 Drawing History Panel

Features:
- Show versions sorted desc by number.
- Show revisions with badge and lock icon.
- Actions: restore version, create revision, compare metadata.

Guardrails:
- Restore creates new version by default (no destructive rollback).
- Creating revision requires title/description and revision code.

### 11.2 Package Builder

Features:
- Filter drawings by tool type, tags, latest revision state.
- Add revision to package with sheet order.
- Reorder via drag and drop.
- Preview package manifest before publish.

### 11.3 Publish Dialog

Required fields:
- Recipient type
- Optional recipient refs
- Optional message

Output:
- Generated issue code
- Immutable issue snapshot confirmation

## 12. Observability and Audit

Audit event shape:

```ts
interface VersioningAuditEvent {
  id: string;
  projectId: string;
  actorUid: string;
  action:
    | 'version.created'
    | 'version.restored'
    | 'revision.created'
    | 'package.created'
    | 'package.items.updated'
    | 'package.published'
    | 'issue.withdrawn';
  resourceType: 'drawing' | 'package' | 'issue';
  resourceId: string;
  at: string;
  metadata?: Record<string, unknown>;
}
```

Operational metrics:
- Version create latency p95.
- Revision create error rate.
- Package publish success rate.
- Average snapshot size by tool.

## 13. Performance and Cost Controls

MVP controls:
- Optional gzip compression for large snapshots.
- Snapshot size warning threshold (example: 900KB pre-write).
- Autosave debounce (example: 2-5 seconds).

Future controls:
- Move large snapshots to object storage with pointer in Firestore.
- Hybrid delta chain with periodic checkpoints.

## 14. Testing Strategy

Unit tests:
- Revision immutability.
- Duplicate revision code rejection.
- Package publish with missing revision fails.
- Restore creates new version when configured.

Integration tests:
- Full flow: create version -> create revision -> package -> publish -> read issue manifest.
- Role permission matrix for editor/reviewer/publisher/admin.

Load tests:
- Publish package with 200+ items.
- Autosave burst behavior for large floorplan snapshots.

## 15. MVP Acceptance Criteria

Functional:
- User can create, list, and restore drawing versions for each supported tool.
- User can create immutable revisions from existing versions.
- User can create package drafts and add ordered drawing revisions.
- User can publish package and receive immutable issue manifest.
- Superseding publish creates new issue without mutating prior issue manifest.

Security:
- Non-publisher roles cannot publish.
- Revision and issue docs are immutable post-create.

Data integrity:
- Every issue manifest includes snapshotHash for each item.
- packageRefsCount increments for included revisions on publish.

Migration:
- Existing project data is available in versioned model after backfill.
- Legacy read fallback can be enabled by feature flag.

UX:
- History panel and package builder are available from each tool context.
- Revision versus version distinction is explicit in labels and actions.

## 16. Rollout Plan

Phase A (internal):
- Enable for admin users only.
- Backfill sample projects.
- Verify metrics and permission logs.

Phase B (pilot projects):
- Enable for selected projects.
- Collect user feedback on revision/package workflows.

Phase C (general availability):
- Migrate all active projects.
- Enable default create/read through versioning services.

## 17. Open Decisions (Product + Engineering)

- Revision code policy: alphabetic (A/B/C) or numeric (0/1/2), and per-package vs per-drawing sequence.
- Withdraw policy: allow withdrawn status for published issues or supersede-only.
- Share links: authenticated-only first or signed external links in MVP.
- Package approval workflow: direct publish or review gate.

## 18. Suggested File Placement in This Repo

- src/lib/types/versioning.ts
- src/lib/server/versioning/service.ts
- src/lib/server/versioning/hash.ts
- src/lib/server/versioning/adapters/*.ts
- src/routes/api/projects/[pid]/drawings/[drawingId]/versions/+server.ts
- src/routes/api/projects/[pid]/drawings/[drawingId]/revisions/+server.ts
- src/routes/api/projects/[pid]/packages/+server.ts
- src/routes/api/projects/[pid]/packages/[packageId]/publish/+server.ts
- src/routes/projects/[pid]/parts/VersionHistoryPanel.svelte
- src/routes/projects/[pid]/parts/PackageBuilderDialog.svelte
- src/routes/projects/[pid]/parts/PublishPackageDialog.svelte

## 19. Implementation Checklist

- Define shared versioning types.
- Implement adapters for each tool.
- Implement version/revision/package services with transactions.
- Add Firestore indexes and rules.
- Build history/package/publish UI.
- Add migration script and idempotency markers.
- Add unit/integration tests.
- Roll out behind feature flag.
