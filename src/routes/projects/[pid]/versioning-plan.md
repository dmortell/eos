# Versioning Plan

## Proposed Direction

Add a first-class "Drawing Lifecycle" layer on top of existing Firestore tool data so each drawing can have:

- Versions (working states)
- Revisions (issued milestones)
- Packages (curated sets of issued drawings for a purpose/audience)

This enables controlled design progression (Concept -> Schematic -> Detailed -> RFP -> Shop) without forcing each tool to reinvent revision logic.

## Core Concepts

- Drawing: A single deliverable artifact tied to one tool and project context.
- Version: Frequent saves while designing, usually internal, mutable workflow.
- Revision: Frozen, auditable issue point (A, B, C, or 0, 1, 2), immutable.
- Package: A named bundle of drawing revisions intended for publish/share.
- Issue: A publish event for a package (to vendor/client/internal), with audit trail.

## Option 1: Simple Snapshot Model (Fastest to Ship)

- Store full snapshot per version in Firestore.
- Promote any version to immutable revision.
- Package stores a list of revision references.

Pros:

- Easiest implementation.
- Minimal cross-tool complexity.
- Clear audit/history behavior.

Cons:

- Higher storage usage for large drawings.
- Limited merge/branch capability.

Best for:

- Shipping quickly with predictable behavior and low engineering risk.

## Option 2: Hybrid Snapshot + Change Log (Balanced)

- Keep periodic full snapshots.
- Store incremental operations between snapshots.
- Revision points remain immutable snapshots.
- Packages still point to revisions.

Pros:

- Better storage efficiency.
- Enables richer history playback.
- Still practical for Firestore.

Cons:

- More complex restore logic.
- Tool adapters need operation serialization consistency.

Best for:

- Medium/large projects where file size and history depth matter.

## Option 3: Branching Design Streams (Most Powerful)

- Add branches (for example: concept, client-comments, construction).
- Versions live on branches.
- Revisions are issued from selected branch heads.
- Packages can combine revisions from multiple branches.

Pros:

- Strong workflow for parallel teams and alternatives.
- Handles "what-if" design paths cleanly.

Cons:

- Highest UX and logic complexity.
- Requires conflict and branch governance rules.

Best for:

- Enterprise-scale, multi-team design workflows.

## Recommended MVP

Start with Option 1 now, while designing schema compatible with Option 2 later.

Why:

- Unlocks revision control and package publishing immediately.
- Avoids overengineering before real usage patterns emerge.
- Preserves a path to evolve to hybrid storage with minimal breaking changes.

## Firestore Data Model (MVP)

- projects/{pid}/drawings/{drawingId}
- projects/{pid}/drawings/{drawingId}/versions/{versionId}
- projects/{pid}/drawings/{drawingId}/revisions/{revisionId}
- projects/{pid}/packages/{packageId}
- projects/{pid}/packages/{packageId}/items/{itemId}
- projects/{pid}/issues/{issueId}

Suggested key fields:

- Drawing: toolType, title, discipline, status, currentVersionId, latestRevisionId.
- Version: number, snapshot, createdBy, createdAt, baseVersionId, notes.
- Revision: code, fromVersionId, snapshotHash, issuedBy, issuedAt, locked=true.
- Package: name, type (Concept/Schematic/etc), status (Draft/Published/Superseded), audience.
- Package item: drawingId, revisionId, sheetOrder, include.
- Issue: packageId, issueCode, recipient, publishedAt, publishedBy, manifest.

## Workflow Design

- User edits drawing -> autosave creates/updates working version.
- User selects "Create Revision" -> freeze snapshot + metadata.
- User creates package -> picks revisions from many drawings/tools.
- User publishes package -> immutable issue manifest generated.
- Later changes -> new revisions + new package issue (previous remains auditable).

## Governance Rules

- Revisions are immutable after issue.
- Package publish creates immutable manifest copy.
- Deleting revisions allowed only before package issue (or never, depending policy).
- Role-based permissions: Editor, Reviewer, Publisher, Admin.
- Every promotion/publish action writes an audit log.

## Implementation Plan (Phased)

### 1. Domain and Schema

- Define shared types for Drawing/Version/Revision/Package/Issue.
- Add Firestore indexes and security rules.
- Add migration strategy for existing tool docs into drawings.

### 2. Backend/Service Layer

- Build versioning service (create version, list history, restore version).
- Build revision service (promote version, lock revision, validation).
- Build package service (create package, add items, publish manifest).
- Add hash/signature utility for revision integrity and comparison.

### 3. Tool Integration Adapters

For each tool (racks, frames, floorplans, patching, containment, survey), add:

- serializeSnapshot()
- loadSnapshot()
- validateSnapshot()

Connect existing save/load paths to version service.

### 4. UI/UX Rollout

- History panel per drawing.
- Revision modal (notes, revision code, reviewer).
- Package builder UI (filter by stage/tool/status, reorder sheets).
- Publish dialog (audience, issue code, watermark settings).

### 5. Sharing and Output

- Read-only share view by package issue.
- Export package manifest + optional PDF bundle.
- Vendor/client link with permission + expiry options.

### 6. Hardening

- Add tests for immutable revision and manifest consistency.
- Add migration/backfill scripts.
- Add telemetry for adoption and performance.

## Decision Options to Choose Now

- Revision code style: A/B/C vs 0/1/2.
- Package status model: simple Draft/Published vs full workflow Draft/Review/Approved/Published.
- Publish policy: published package can be superseded only, or also withdrawn.
- Storage strategy now: full snapshots only, or begin hybrid for large floorplan datasets.
- External sharing: authenticated users only vs signed public links.

## Risks and Mitigations

- Risk: inconsistent serialization across tools.
	Mitigation: enforce common adapter contract + snapshot schema versioning.
- Risk: Firestore cost growth from snapshots.
	Mitigation: compression, dedupe, or move large blobs to object storage later.
- Risk: users confuse versions vs revisions.
	Mitigation: explicit UI labeling and action guardrails.

If desired, this can be expanded into a concrete technical spec with exact TypeScript interfaces, Firestore rules examples, and MVP acceptance criteria.