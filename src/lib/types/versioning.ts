/**
 * @file src/lib/types/versioning.ts
 * @description Shared types for drawing versioning, revision control, and packages.
 */

export type ToolType = 'racks' | 'frames' | 'outlets' | 'patching' | 'fillrate' | 'survey'
export type DrawingStatus = 'active' | 'archived'
export type PackageStatus = 'draft' | 'published' | 'superseded'
export type PackageType = 'concept' | 'schematic' | 'detailed' | 'rfp' | 'shop' | 'as-built' | 'custom'

export interface ViewPreset {
  name: string                                // "Low Level Outlets", "High Level Trunk Routes"
  layers: Record<string, boolean | string>    // boolean layers (on/off) or enum values (e.g. view: 'plan')
  filters?: Record<string, any>               // tool-specific view filters
}

export interface DrawingDoc {
  id: string
  projectId: string
  toolType: ToolType
  drawingNumber: string            // e.g. "UBSLR-EIR-05-IT-DR-0001"
  title: string                    // e.g. "Low level IT cable routes 5F"
  sourceDocId: string              // e.g. "{pid}_F01" — link to live tool doc
  viewPreset: ViewPreset           // controls what's visible in this drawing
  status: DrawingStatus
  sheetSize?: string               // e.g. "A1", "A3"
  scale?: string                   // e.g. "1/150", "NTS"
  discipline?: string              // e.g. "IT", "AV", "Security"
  sortOrder: number                // position in master drawing list
  currentVersionNumber: number
  latestRevisionCode?: string      // e.g. "C"
  createdAt: string
  createdBy: string
  updatedAt: string
}

export interface VersionDoc {
  id: string                    // "v1", "v2", ...
  drawingId: string
  number: number
  snapshot: unknown             // full tool state blob
  notes?: string
  createdAt: string
  createdBy: string
}

export interface RevisionDoc {
  id: string                    // "rA", "rB", ...
  drawingId: string
  code: string                  // "A", "B", "C"
  fromVersionId: string
  title?: string
  description?: string
  issuedAt: string
  issuedBy: string
  locked: true
}

export interface PackageDoc {
  id: string
  projectId: string
  name: string
  type: PackageType
  status: PackageStatus
  description?: string
  issueSequence: number
  currentIssueId?: string
  publishedAt?: string
  publishedBy?: string
  createdAt: string
  createdBy: string
  updatedAt: string
}

export interface PackageItemDoc {
  id: string
  drawingId: string
  revisionId: string
  sheetOrder: number
  include: boolean
}

export interface PackageIssueManifestItem {
  drawingId: string
  drawingNumber: string
  drawingTitle: string
  toolType: ToolType
  revisionCode: string
  sheetOrder: number
}

export interface IssueDoc {
  id: string                    // "iss_001"
  projectId: string
  packageId: string
  issueCode: string
  publishedAt: string
  publishedBy: string
  manifest: {
    packageName: string
    packageType: PackageType
    items: PackageIssueManifestItem[]
  }
  supersedesIssueId?: string
}

/** Adapter contract — each tool implements this to support versioning */
export interface SnapshotAdapter<T = unknown> {
  toolType: ToolType
  serialize(state: T): unknown        // strip ephemeral UI state
  validate(snapshot: unknown): boolean
  defaultViewPresets(): ViewPreset[]   // available view presets for this tool
}
