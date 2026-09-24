// VERSIONS + REVISIONS (drawings-plan §3, phase 7). Pure; tested in versions.test.ts.
//   Models have VERSIONS: the first save is 1.0; a MAJOR (x.0) stores a full model copy in
//   `projects/{pid}/models/{id}/versions/{v}`, a MINOR (x.y) is a dated note. The model records the version it's
//   at + a hash of its content then (`versionHash`), so "edited since the version" needs no read.
//   Sheets have REVISIONS (the registry's A, B, C…): issuing stores a sheet VERSION (paper + frames + the version
//   of every model a frame shows) and a revision pointing at it. Issuing needs every model at an UNEDITED
//   MAJOR version; a sheet edited since its last issue offers "issue the next revision" or "overwrite".
import type { Model } from '../3dview/types'
import type { PagesSheetDoc, SheetPaper, SheetFrameDoc } from './schema'
import { stableJson } from './saver'

/** 32-bit FNV-1a of a string, as 8 hex chars (change detection, not security). */
export function hash32(s: string): string {
	let h = 0x811c9dc5
	for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) }
	return (h >>> 0).toString(16).padStart(8, '0')
}
/** A model's CONTENT hash — everything but its management stamps (version, archived, save time). */
export function modelHash(m: Model): string {
	const { version: _v, versionHash: _h, archived: _a, ...content } = m as Model & { updatedAt?: string }
	return hash32(stableJson(content))
}
/** A sheet's content hash — its paper + frames (what a revision captures besides the models). */
export const sheetHash = (s: Pick<PagesSheetDoc, 'paper' | 'frames'>): string => hash32(stableJson({ paper: s.paper, frames: s.frames }))

/** The next version: none yet → 1.0 (always a major); major → (M+1).0; minor → M.(m+1). */
export function nextVersion(cur: string | undefined, major: boolean): string {
	if (!cur) return '1.0'
	const [M, m] = cur.split('.').map((x) => parseInt(x, 10) || 0)
	return major ? `${M + 1}.0` : `${M}.${m + 1}`
}
export const isMajor = (v?: string) => !!v && /^\d+\.0$/.test(v)

/** Where a model stands for issuing: `ready` = at a major version, unedited since. */
export type ModelVersionState = 'unversioned' | 'edited' | 'minor' | 'ready'
export function modelVersionState(m: Model): ModelVersionState {
	if (!m.version) return 'unversioned'
	if (m.versionHash !== modelHash(m)) return 'edited'
	return isMajor(m.version) ? 'ready' : 'minor'
}

/** `projects/{pid}/models/{id}/versions/{version}` */
export type ModelVersionDoc = {
	id: string; version: string; major: boolean; note: string
	createdAt: string; createdBy: string; hash: string
	/** Majors only: the whole model (stored-doc encoding, mappers.modelToDoc). */
	snapshot?: unknown
}

/** A sheet version's snapshot (the registry VersionDoc `snapshot`): its paper + frames, and the version of
 *  every model a frame shows — so a revision reproduces the models as they were when it was issued. */
export type SheetSnapshot = { paper: SheetPaper; frames: SheetFrameDoc[]; models: { modelId: string; name: string; version: string }[] }

/** A model that blocks issuing, with why. */
export type IssueProblem = { modelId: string; name: string; state: ModelVersionState | 'missing'; version?: string }
/** Every model the sheet's frames show must be at an unedited MAJOR version (drawings-plan §3). */
export function issueProblems(sheet: Pick<PagesSheetDoc, 'frames'>, models: Model[]): IssueProblem[] {
	const ids = [...new Set(sheet.frames.map((f) => f.modelId).filter((x): x is string => !!x))]
	const out: IssueProblem[] = []
	for (const id of ids) {
		const m = models.find((x) => x.id === id)
		if (!m || m.archived) { out.push({ modelId: id, name: m?.name ?? id, state: 'missing' }); continue }
		const state = modelVersionState(m)
		if (state !== 'ready') out.push({ modelId: id, name: m.name, state, version: m.version })
	}
	return out
}
/** The models a sheet shows, with the versions to record on its revision (call when issueProblems is empty). */
export function sheetModels(sheet: Pick<PagesSheetDoc, 'frames'>, models: Model[]): SheetSnapshot['models'] {
	const ids = [...new Set(sheet.frames.map((f) => f.modelId).filter((x): x is string => !!x))]
	return ids.map((id) => { const m = models.find((x) => x.id === id)!; return { modelId: id, name: m.name, version: m.version! } })
}
/** The next revision code: A … Z, AA, AB … (same rule as $lib/versioning/service nextRevisionCode — copied so this
 *  module stays free of the Firebase-initialising $lib import). */
export function nextRevisionCode(cur?: string): string {
	if (!cur) return 'A'
	const num = /^(.*?)(\d+)$/.exec(cur)   // B6: a numbered code counts on — P1 → P2, C09 → C10
	if (num) return num[1] + String(Number(num[2]) + 1).padStart(num[2].length, '0')
	const c = cur.split('')
	for (let i = c.length - 1; i >= 0; i--) {
		if (c[i] !== 'Z') { c[i] = String.fromCharCode(c[i].charCodeAt(0) + 1); return c.join('') }
		c[i] = 'A'
	}
	return 'A' + c.join('')
}
/** The sheet changed since its last issue (false if it was never issued). */
export const sheetEditedSinceIssue = (s: PagesSheetDoc) => !!s.latestRevisionCode && sheetHash(s) !== s.issuedHash
