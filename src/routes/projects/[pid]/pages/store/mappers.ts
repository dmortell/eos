// Pure conversions between the editor's in-memory state and the persisted schema (./schema.ts). No
// Firestore, no Svelte — unit-tested in mappers.test.ts.
import { PAPER_PX_PER_MM, DEFAULT_MARGIN_MM, type PaperSize } from '../constants'
import { migrateModels } from '../3dview/migrate'
import type { Model } from '../3dview/types'
import type { SheetFrame } from '../types'
import type { PageDoc } from '../doc.svelte'
import type { View } from '../ui/geometry'
import type { ModelDoc, PagesSheetDoc, SheetFrameDoc, SheetPaper } from './schema'

/** Paper px → paper mm, rounded to 0.1 mm (the editor lays frames out in paper px). */
const toMm = (px: number) => Math.round((px / PAPER_PX_PER_MM) * 10) / 10
const toPx = (mm: number) => mm * PAPER_PX_PER_MM

/** The per-frame view state the editor keeps outside the frame (viewState: pan/zoom + orbit). */
export type FrameViewState = { view?: View; yaw?: number; pitch?: number }

/** An editor frame (+ its view state) → the stored frame. `seq` = the frame's printable number. */
export function frameToDoc(f: SheetFrame, seq: number, vs: FrameViewState = {}): SheetFrameDoc {
	const d: SheetFrameDoc = {
		id: f.id, seq, x: toMm(f.x), y: toMm(f.y), w: toMm(f.w), h: toMm(f.h),
		direction: f.proj, scale: f.scale, clip: f.clip, border: f.border,
	}
	if (f.label && f.label !== String(seq)) d.label = f.label
	if (f.modelId != null) d.modelId = f.modelId
	if (f.frozen?.length) d.frozen = [...f.frozen]
	if (f.locked) d.locked = true
	if (vs.view) d.view = { ...vs.view }
	if (vs.yaw != null) d.yaw = vs.yaw
	if (vs.pitch != null) d.pitch = vs.pitch
	return d
}

/** A stored frame → the editor frame (paper px) + its view state. The label falls back to the sequence. */
export function docToFrame(d: SheetFrameDoc): { frame: SheetFrame; view: FrameViewState } {
	const frame: SheetFrame = {
		id: d.id, x: toPx(d.x), y: toPx(d.y), w: toPx(d.w), h: toPx(d.h), border: d.border ?? 'dashed',
		proj: d.direction, scale: d.scale, clip: d.clip ?? null, label: d.label || String(d.seq), seq: d.seq,
	}
	if (d.modelId != null) frame.modelId = d.modelId
	if (d.frozen?.length) frame.frozen = [...d.frozen]
	if (d.locked) frame.locked = true
	return { frame, view: { view: d.view, yaw: d.yaw, pitch: d.pitch } }
}

/** The next free frame sequence number on a sheet. */
export const nextFrameSeq = (frames: { seq?: number }[]) => frames.reduce((m, f) => Math.max(m, f.seq ?? 0), 0) + 1

/** A stored sheet → the editor's page doc (paper, sheet scale, frames in paper px). */
export function sheetToPage(s: PagesSheetDoc): Omit<PageDoc, 'id'> {
	return {
		title: s.title, kind: 'sheet', scale: s.scale || '1:100',
		paper: { size: s.paper.size, landscape: s.paper.landscape, margin: s.paper.marginMm },
		frames: s.frames.map((f) => docToFrame(f).frame),
	}
}
/** The editor's page doc folded back into its stored sheet (registry fields kept from `s`). */
export function pageToSheet(s: PagesSheetDoc, d: Pick<PageDoc, 'paper' | 'scale' | 'frames'>): PagesSheetDoc {
	return {
		...s, scale: d.scale, sheetSize: d.paper.size,
		paper: { size: d.paper.size, landscape: d.paper.landscape, marginMm: d.paper.margin ?? DEFAULT_MARGIN_MM },
		frames: d.frames.map((f, i) => frameToDoc(f, f.seq ?? i + 1)),
	}
}

/** A brand-new Pages sheet registry entry. Its number starts empty (drawings-plan §2.2). */
export function newSheetDoc(a: { pid: string; id: string; title: string; placeId: string | null; sortOrder: number; user: string; now: string
	paper?: Partial<SheetPaper>; scale?: string }): PagesSheetDoc {
	const paper: SheetPaper = { size: (a.paper?.size ?? 'A3') as PaperSize, landscape: a.paper?.landscape ?? true, marginMm: a.paper?.marginMm ?? DEFAULT_MARGIN_MM }
	return {
		id: a.id, projectId: a.pid, toolType: 'pages', title: a.title, drawingNumber: '', status: 'active',
		sortOrder: a.sortOrder, placeId: a.placeId, tags: [], sheetSize: paper.size, scale: a.scale,
		currentVersionNumber: 0, sourceDocId: `${a.pid}_${a.id}`, viewPreset: { name: 'Sheet', layers: {} },
		createdAt: a.now, createdBy: a.user, updatedAt: a.now, paper, frames: [],
	}
}

/** A stored sheet with any missing content fields defaulted (a doc written by an older version). */
export function normSheet(d: Partial<PagesSheetDoc> & { id: string }): PagesSheetDoc {
	const paper: SheetPaper = { size: (d.paper?.size ?? 'A3') as PaperSize, landscape: d.paper?.landscape ?? true, marginMm: d.paper?.marginMm ?? DEFAULT_MARGIN_MM }
	return {
		projectId: '', toolType: 'pages', title: d.id, drawingNumber: '', status: 'active', sortOrder: 0, placeId: null, tags: [],
		currentVersionNumber: 0, sourceDocId: '', viewPreset: { name: 'Sheet', layers: {} }, createdAt: '', createdBy: '', updatedAt: '',
		...d, paper, frames: d.frames ?? [],
	} as PagesSheetDoc
}

/** An in-memory model → its stored doc. Pass PLAIN data (`$state.snapshot` first): Firestore can't store
 *  the proxies, and undefined fields are stripped by the db layer. */
export function modelToDoc(m: Model, now: string): ModelDoc {
	return { ...m, updatedAt: now }
}

/** A stored model doc → an in-memory model: defaults filled, migrations applied (legacy `ents` → `shapes`,
 *  line → polyline, …). `id` always comes from the Firestore doc id. */
export function docToModel(d: Partial<ModelDoc> & { id: string }): Model {
	const { updatedAt: _u, ...rest } = d
	const m: Model = { ...rest, id: d.id, name: d.name ?? d.id, objects: d.objects ?? [] }
	return migrateModels([m])[0]
}
