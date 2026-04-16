/**
 * @file src/lib/versioning/service.ts
 * @description Drawing versioning, revision, and package services.
 * All state-changing operations use Firestore transactions for consistency.
 */

import { Firestore } from '$lib'
import type {
  DrawingDoc, VersionDoc, RevisionDoc,
  PackageDoc, PackageItemDoc, IssueDoc, PackageIssueManifestItem,
  ToolType, PackageType, ViewPreset,
} from '$lib/types/versioning'

// ── Paths ──

const drawingsPath = (pid: string) => `projects/${pid}/drawings`
const versionsPath = (pid: string, drawingId: string) => `projects/${pid}/drawings/${drawingId}/versions`
const revisionsPath = (pid: string, drawingId: string) => `projects/${pid}/drawings/${drawingId}/revisions`
const packagesPath = (pid: string) => `projects/${pid}/packages`
const packageItemsPath = (pid: string, packageId: string) => `projects/${pid}/packages/${packageId}/items`
const issuesPath = (pid: string) => `projects/${pid}/issues`

// ── Drawing Service ──

export async function createDrawing(
  db: Firestore,
  input: {
    projectId: string
    toolType: ToolType
    drawingNumber: string
    title: string
    sourceDocId: string
    viewPreset: ViewPreset
    uid: string
    sheetSize?: string
    scale?: string
    discipline?: string
    sortOrder?: number
  },
): Promise<{ drawingId: string }> {
  const now = new Date().toISOString()
  const path = drawingsPath(input.projectId)
  const drawings = await db.getMany(path)
  const maxOrder = drawings.reduce((max, d: any) => Math.max(max, d.sortOrder ?? 0), 0)

  const drawing: Omit<DrawingDoc, 'id'> = {
    projectId: input.projectId,
    toolType: input.toolType,
    drawingNumber: input.drawingNumber,
    title: input.title,
    sourceDocId: input.sourceDocId,
    viewPreset: input.viewPreset,
    status: 'active',
    sheetSize: input.sheetSize,
    scale: input.scale,
    discipline: input.discipline,
    sortOrder: input.sortOrder ?? maxOrder + 1,
    currentVersionNumber: 0,
    createdAt: now,
    createdBy: input.uid,
    updatedAt: now,
  }

  // Use save with a generated id
  const id = crypto.randomUUID().slice(0, 12)
  await db.save(path, { id, ...drawing })
  return { drawingId: id }
}

export function subscribeDrawings(
  db: Firestore,
  projectId: string,
  callback: (drawings: DrawingDoc[]) => void,
): () => void {
  return db.subscribeMany(drawingsPath(projectId), (docs) => {
    const drawings = (docs as unknown as DrawingDoc[])
      .filter(d => d.status === 'active')
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    callback(drawings)
  })
}

export async function updateDrawing(
  db: Firestore,
  projectId: string,
  drawingId: string,
  fields: Partial<Pick<DrawingDoc, 'drawingNumber' | 'title' | 'sheetSize' | 'scale' | 'discipline' | 'sortOrder' | 'status' | 'viewPreset'>>,
): Promise<void> {
  await db.save(drawingsPath(projectId), {
    id: drawingId,
    ...fields,
    updatedAt: new Date().toISOString(),
  })
}

/** Find an existing drawing for a source doc, or create one on demand. */
export async function findOrCreateDrawing(
  db: Firestore,
  input: {
    projectId: string
    toolType: ToolType
    sourceDocId: string
    title: string
    uid: string
    viewPreset?: ViewPreset
  },
): Promise<string> {
  const path = drawingsPath(input.projectId)
  const all = await db.getMany(path) as unknown as DrawingDoc[]
  const existing = all.find(d => d.sourceDocId === input.sourceDocId && d.status === 'active')
  if (existing) return existing.id

  const { drawingId } = await createDrawing(db, {
    projectId: input.projectId,
    toolType: input.toolType,
    drawingNumber: '',
    title: input.title,
    sourceDocId: input.sourceDocId,
    viewPreset: input.viewPreset ?? { name: 'Default', layers: { default: true } },
    uid: input.uid,
  })
  return drawingId
}

// ── Version Service ──

export async function createVersion(
  db: Firestore,
  input: {
    projectId: string
    drawingId: string
    snapshot: unknown
    uid: string
    notes?: string
  },
): Promise<{ versionId: string; number: number }> {
  return db.runTransaction(async (txn) => {
    const drawing = await txn.get(drawingsPath(input.projectId), input.drawingId)
    if (!drawing) throw new Error(`Drawing ${input.drawingId} not found`)
    if ((drawing as any).status === 'archived') throw new Error('Cannot version an archived drawing')

    const nextNumber = ((drawing as any).currentVersionNumber ?? 0) + 1
    const versionId = `v${nextNumber}`
    const now = new Date().toISOString()

    const version: VersionDoc = {
      id: versionId,
      drawingId: input.drawingId,
      number: nextNumber,
      snapshot: input.snapshot,
      notes: input.notes,
      createdAt: now,
      createdBy: input.uid,
    }

    // Write version doc
    txn.set(versionsPath(input.projectId, input.drawingId), versionId, version as any)

    // Update drawing metadata
    txn.set(drawingsPath(input.projectId), input.drawingId, {
      currentVersionNumber: nextNumber,
      updatedAt: now,
    })

    return { versionId, number: nextNumber }
  })
}

export function subscribeVersions(
  db: Firestore,
  projectId: string,
  drawingId: string,
  callback: (versions: VersionDoc[]) => void,
): () => void {
  return db.subscribeMany(versionsPath(projectId, drawingId), (docs) => {
    const versions = (docs as unknown as VersionDoc[])
      .sort((a, b) => b.number - a.number)
    callback(versions)
  })
}

export async function getVersion(
  db: Firestore,
  projectId: string,
  drawingId: string,
  versionId: string,
): Promise<VersionDoc | null> {
  return db.getOne(versionsPath(projectId, drawingId), versionId) as Promise<VersionDoc | null>
}

export async function restoreVersion(
  db: Firestore,
  input: {
    projectId: string
    drawingId: string
    versionId: string
    uid: string
  },
): Promise<{ versionId: string; number: number }> {
  const old = await getVersion(db, input.projectId, input.drawingId, input.versionId)
  if (!old) throw new Error(`Version ${input.versionId} not found`)

  return createVersion(db, {
    projectId: input.projectId,
    drawingId: input.drawingId,
    snapshot: old.snapshot,
    uid: input.uid,
    notes: `Restored from ${input.versionId}`,
  })
}

// ── Revision Service ──

export async function createRevision(
  db: Firestore,
  input: {
    projectId: string
    drawingId: string
    fromVersionId: string
    code: string
    uid: string
    title?: string
    description?: string
  },
): Promise<{ revisionId: string; code: string }> {
  const revisionId = `r${input.code}`
  const now = new Date().toISOString()

  return db.runTransaction(async (txn) => {
    // Verify drawing exists
    const drawing = await txn.get(drawingsPath(input.projectId), input.drawingId)
    if (!drawing) throw new Error(`Drawing ${input.drawingId} not found`)

    // Verify version exists
    const version = await txn.get(versionsPath(input.projectId, input.drawingId), input.fromVersionId)
    if (!version) throw new Error(`Version ${input.fromVersionId} not found`)

    // Check revision code not already used (by convention, revisionId = r{code})
    const existing = await txn.get(revisionsPath(input.projectId, input.drawingId), revisionId)
    if (existing) throw new Error(`Revision ${input.code} already exists for this drawing`)

    const revision: RevisionDoc = {
      id: revisionId,
      drawingId: input.drawingId,
      code: input.code,
      fromVersionId: input.fromVersionId,
      title: input.title,
      description: input.description,
      issuedAt: now,
      issuedBy: input.uid,
      locked: true,
    }

    txn.set(revisionsPath(input.projectId, input.drawingId), revisionId, revision as any)

    // Update drawing metadata
    txn.set(drawingsPath(input.projectId), input.drawingId, {
      latestRevisionCode: input.code,
      updatedAt: now,
    })

    return { revisionId, code: input.code }
  })
}

export function subscribeRevisions(
  db: Firestore,
  projectId: string,
  drawingId: string,
  callback: (revisions: RevisionDoc[]) => void,
): () => void {
  return db.subscribeMany(revisionsPath(projectId, drawingId), (docs) => {
    const revisions = (docs as unknown as RevisionDoc[])
      .sort((a, b) => a.code.localeCompare(b.code))
    callback(revisions)
  })
}

/** Get the next revision code (A, B, C, ..., Z, AA, AB, ...) */
export function nextRevisionCode(current?: string): string {
  if (!current) return 'A'
  // Single letter: A->B, ..., Z->AA
  if (current.length === 1) {
    if (current === 'Z') return 'AA'
    return String.fromCharCode(current.charCodeAt(0) + 1)
  }
  // Multi-letter: increment last char, carry if needed
  const chars = current.split('')
  let i = chars.length - 1
  while (i >= 0) {
    if (chars[i] === 'Z') {
      chars[i] = 'A'
      i--
    } else {
      chars[i] = String.fromCharCode(chars[i].charCodeAt(0) + 1)
      return chars.join('')
    }
  }
  return 'A' + chars.join('')
}

// ── Package Service ──

export async function createPackage(
  db: Firestore,
  input: {
    projectId: string
    name: string
    type: PackageType
    uid: string
    description?: string
  },
): Promise<{ packageId: string }> {
  const now = new Date().toISOString()
  const id = `pkg_${crypto.randomUUID().slice(0, 8)}`

  const pkg: PackageDoc = {
    id,
    projectId: input.projectId,
    name: input.name,
    type: input.type,
    status: 'draft',
    description: input.description,
    issueSequence: 0,
    createdAt: now,
    createdBy: input.uid,
    updatedAt: now,
  }

  await db.save(packagesPath(input.projectId), pkg as any)
  return { packageId: id }
}

export function subscribePackages(
  db: Firestore,
  projectId: string,
  callback: (packages: PackageDoc[]) => void,
): () => void {
  return db.subscribeMany(packagesPath(projectId), (docs) => {
    const packages = (docs as unknown as PackageDoc[])
      .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
    callback(packages)
  })
}

export async function updatePackageItems(
  db: Firestore,
  projectId: string,
  packageId: string,
  items: Array<{
    drawingId: string
    revisionId: string
    sheetOrder: number
    include: boolean
  }>,
): Promise<void> {
  const path = packageItemsPath(projectId, packageId)

  // Read current items so we can delete removed ones
  const existing = await db.getMany(path)
  const newIds = new Set(items.map(i => `${i.drawingId}_${i.revisionId}`))
  const toDelete = existing.filter(d => !newIds.has(d.id))
  if (toDelete.length) await db.deleteMany(path, toDelete)

  // Write remaining items
  if (items.length) {
    const docs = items.map((item) => ({
      id: `${item.drawingId}_${item.revisionId}`,
      drawingId: item.drawingId,
      revisionId: item.revisionId,
      sheetOrder: item.sheetOrder,
      include: item.include,
    }))
    await db.saveBatch(path, docs)
  }

  await db.save(packagesPath(projectId), {
    id: packageId,
    updatedAt: new Date().toISOString(),
  })
}

export function subscribePackageItems(
  db: Firestore,
  projectId: string,
  packageId: string,
  callback: (items: PackageItemDoc[]) => void,
): () => void {
  return db.subscribeMany(packageItemsPath(projectId, packageId), (docs) => {
    const items = (docs as unknown as PackageItemDoc[])
      .sort((a, b) => a.sheetOrder - b.sheetOrder)
    callback(items)
  })
}

export async function publishPackage(
  db: Firestore,
  input: {
    projectId: string
    packageId: string
    uid: string
    message?: string
  },
): Promise<{ issueId: string; issueCode: string }> {
  return db.runTransaction(async (txn) => {
    const pkg = await txn.get(packagesPath(input.projectId), input.packageId)
    if (!pkg) throw new Error(`Package ${input.packageId} not found`)

    const pkgData = pkg as unknown as PackageDoc

    // Read package items (outside transaction — items are read-only reference data)
    const itemDocs = await db.getMany(packageItemsPath(input.projectId, input.packageId))
    const includedItems = (itemDocs as unknown as PackageItemDoc[]).filter(i => i.include)
    if (includedItems.length === 0) throw new Error('Cannot publish a package with no included items')

    // Build manifest by resolving each item's drawing metadata
    const manifestItems: PackageIssueManifestItem[] = []
    for (const item of includedItems) {
      const drawing = await txn.get(drawingsPath(input.projectId), item.drawingId)
      if (!drawing) throw new Error(`Drawing ${item.drawingId} not found`)
      const drawingData = drawing as unknown as DrawingDoc

      const revision = await txn.get(revisionsPath(input.projectId, item.drawingId), item.revisionId)
      if (!revision) throw new Error(`Revision ${item.revisionId} not found for drawing ${item.drawingId}`)
      const revisionData = revision as unknown as RevisionDoc

      manifestItems.push({
        drawingId: item.drawingId,
        drawingNumber: drawingData.drawingNumber,
        drawingTitle: drawingData.title,
        toolType: drawingData.toolType,
        revisionCode: revisionData.code,
        sheetOrder: item.sheetOrder,
      })
    }
    manifestItems.sort((a, b) => a.sheetOrder - b.sheetOrder)

    // Generate issue
    const nextSeq = (pkgData.issueSequence ?? 0) + 1
    const issueCode = `${pkgData.type.toUpperCase()}-${String(nextSeq).padStart(3, '0')}`
    const issueId = `iss_${String(nextSeq).padStart(4, '0')}`
    const now = new Date().toISOString()

    const previousIssueId = pkgData.currentIssueId

    const issue: IssueDoc = {
      id: issueId,
      projectId: input.projectId,
      packageId: input.packageId,
      issueCode,
      publishedAt: now,
      publishedBy: input.uid,
      manifest: {
        packageName: pkgData.name,
        packageType: pkgData.type,
        items: manifestItems,
      },
      supersedesIssueId: previousIssueId,
    }

    txn.set(issuesPath(input.projectId), issueId, issue as any)

    // Mark previous issue as superseded if exists
    if (previousIssueId) {
      txn.set(issuesPath(input.projectId), previousIssueId, {
        status: 'superseded',
      })
    }

    // Update package
    txn.set(packagesPath(input.projectId), input.packageId, {
      status: 'published',
      issueSequence: nextSeq,
      currentIssueId: issueId,
      publishedAt: now,
      publishedBy: input.uid,
      updatedAt: now,
    })

    return { issueId, issueCode }
  })
}

// ── Master Drawing List ──

export async function getDrawingListWithRevisions(
  db: Firestore,
  projectId: string,
): Promise<Array<DrawingDoc & { revisions: RevisionDoc[] }>> {
  const drawings = await db.getMany(drawingsPath(projectId)) as unknown as DrawingDoc[]
  const active = drawings.filter(d => d.status === 'active').sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))

  const results: Array<DrawingDoc & { revisions: RevisionDoc[] }> = []
  for (const drawing of active) {
    const revDocs = await db.getMany(revisionsPath(projectId, drawing.id)) as unknown as RevisionDoc[]
    const revisions = revDocs.sort((a, b) => a.code.localeCompare(b.code))
    results.push({ ...drawing, revisions })
  }
  return results
}
