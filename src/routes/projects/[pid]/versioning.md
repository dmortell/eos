# Structured Cabling App --- Versioning & Drawing Packages

## Description & Implementation Plan

## Goals

Add: 1. Versioning & revisions for all drawings 2. Drawing Packages
(collections of drawings) 3. Publish/share packages with vendors/clients
4. Maintain performance and Firestore cost efficiency

------------------------------------------------------------------------

# Core Concepts

## 1. Drawing Versioning Model

Each drawing becomes:

    Project
     └── Drawings
          └── drawingId
               ├── metadata
               └── versions
                    └── versionId
                         └── data

### Drawing Metadata (Stable)

Stored at:

    projects/{projectId}/drawings/{drawingId}

Example:

``` json
{
  "name": "Rack Elevation - MDF",
  "type": "rack-elevation",
  "currentVersion": "v12",
  "createdBy": "userId",
  "createdAt": timestamp,
  "updatedAt": timestamp
}
```

------------------------------------------------------------------------

## Version Document

    projects/{projectId}/drawings/{drawingId}/versions/{versionId}

Example:

``` json
{
  "version": 12,
  "revision": "B",
  "status": "Draft",
  "comment": "Added new racks",
  "createdBy": "userId",
  "createdAt": timestamp,
  "dataRef": "...",
  "snapshot": {...}
}
```

------------------------------------------------------------------------

# Version Types

## Version vs Revision

### Version (Major)

-   Concept changes
-   Layout redesign
-   Major updates

Examples: - v1 - v2 - v3

### Revision (Minor)

Examples: - v3A - v3B - v3C

Structure:

    version: 3
    revision: "B"

------------------------------------------------------------------------

# Storage Options

## Option A --- Full Snapshot (Recommended)

Each version stores full drawing JSON

Pros: - Simple - Reliable - Fast restore - Firestore friendly

Cons: - More storage

Best for: - Most use cases

------------------------------------------------------------------------

## Option B --- Delta Storage

Only store changes between versions

Pros: - Smaller storage

Cons: - Complex - Slower load - Harder rollback

Recommendation: Use Option A first

------------------------------------------------------------------------

# Versioning Workflow

## Save New Version

User clicks:

    Save Version

Flow:

1.  Clone current drawing
2.  Increment version/revision
3.  Save new document
4.  Update drawing.currentVersion

------------------------------------------------------------------------

## Autosave Drafts (Optional)

Add:

    status: Draft

Draft versions not published

------------------------------------------------------------------------

# Drawing Packages

Packages are collections of drawing versions

Examples:

-   Concept Design
-   Schematic Design
-   Detailed Design
-   RFP
-   Shop Drawings
-   As-Built

------------------------------------------------------------------------

# Package Data Model

    projects/{projectId}/packages/{packageId}

Example:

``` json
{
  "name": "Detailed Design",
  "version": 1,
  "status": "Draft",
  "createdBy": "userId",
  "createdAt": timestamp,
  "publishedAt": timestamp
}
```

------------------------------------------------------------------------

# Package Items

    projects/{projectId}/packages/{packageId}/drawings/{id}

Example:

``` json
{
  "drawingId": "...",
  "versionId": "...",
  "order": 1,
  "title": "Rack Elevation"
}
```

------------------------------------------------------------------------

# Package Versioning

Packages also versioned

Option A:

    packages/{packageId}/versions/{versionId}

Recommended Structure:

    Package
     └── versions
          └── versionId
               └── drawings snapshot

------------------------------------------------------------------------

# Publishing Packages

Package status:

-   Draft
-   Review
-   Published
-   Archived

Example:

``` json
{
  "status": "Published",
  "publishedAt": timestamp,
  "publishedBy": "userId"
}
```

------------------------------------------------------------------------

# Sharing Options

## Option A --- Public Link

    /share/{token}

Firestore:

    sharedPackages/{token}

Example:

``` json
{
  "projectId": "...",
  "packageId": "...",
  "versionId": "...",
  "expires": timestamp
}
```

------------------------------------------------------------------------

## Option B --- Client Access

Add:

    permissions

Example:

``` json
{
  "viewerEmails": []
}
```

------------------------------------------------------------------------

# UI Design

## Drawing Version UI

    Drawing Name
     ├── Save Version
     ├── Save Revision
     ├── Version History

Version History:

    v3B - Added racks
    v3A - Patch changes
    v2 - Layout update

------------------------------------------------------------------------

# Package UI

    Packages
     ├── Create Package
     ├── Add Drawings
     ├── Publish
     ├── Share

------------------------------------------------------------------------

# Suggested Firestore Structure

    projects
     └── projectId
          ├── drawings
          │    └── drawingId
          │         └── versions
          ├── packages
          │    └── packageId
          │         └── versions
          └── sharedPackages

------------------------------------------------------------------------

# Permissions

Roles:

-   Owner
-   Editor
-   Reviewer
-   Viewer

------------------------------------------------------------------------

# Audit Trail

Add:

    activityLogs

Example:

    created version
    published package
    shared package

------------------------------------------------------------------------

# Performance Recommendations

Use:

-   Lazy loading versions
-   Load only metadata first
-   Load version data on demand

------------------------------------------------------------------------

# Future Extensions

-   Approval workflows
-   Digital signatures
-   Markups
-   Redlines
-   Compare versions
-   Diff viewer
-   Export to PDF

------------------------------------------------------------------------

# Implementation Phases

## Phase 1

-   Drawing versions
-   Version UI
-   Restore version

## Phase 2

-   Packages
-   Package UI
-   Package publish

## Phase 3

-   Sharing
-   Permissions

## Phase 4

-   Advanced workflows

------------------------------------------------------------------------

# Recommended Approach

Start With:

-   Snapshot versions
-   Package snapshot
-   Publish link

This is:

-   Fastest to implement
-   Most robust
-   Scales well

------------------------------------------------------------------------

# End
