// B2: the sheet-FRAME clipboard — copy / cut / paste / duplicate viewport frames on paper (Ctrl+C/X/V/D with a
// frame selected). Kept in localStorage, so it survives a reload and works across sheets (and projects: a frame
// whose model isn't in the target project shows "Missing model"). A frame's VIEW-SCOPED annotations
// (`space: 'view:<frame>'`) travel with it. Pure apart from the storage accessors; tested in frameClip.test.ts.
import type { SheetFrame } from '../types'
import type { Ent } from './geometry'

export type FrameClip = { frames: SheetFrame[]; shapes: { modelId: string; ent: Ent }[] }
const KEY = 'eos.pages.frameClip'

/** The frames + the annotations scoped to them (`shapesOf(modelId)` = a model's shapes). */
export function clipOf(frames: SheetFrame[], shapesOf: (mid: string) => Ent[], defaultModel: string): FrameClip {
	const ids = new Set(frames.map((f) => f.id)), shapes: FrameClip['shapes'] = []
	for (const mid of new Set(frames.map((f) => f.modelId ?? defaultModel)))
		for (const e of shapesOf(mid)) if (e.space?.startsWith('view:') && ids.has(e.space.slice(5))) shapes.push({ modelId: mid, ent: e })
	return { frames, shapes }
}
/** The clip's copies for a sheet: new frame ids, numbered on from `nextSeq`, offset by `off` paper px; each
 *  annotation re-scoped to its frame's copy with a new id (groups kept together under new group ids). */
export function pasteClip(clip: FrameClip, newId: (p?: string) => string, nextSeq: number, off: number): FrameClip {
	const fid = new Map(clip.frames.map((f) => [f.id, newId('vf')]))
	const frames = clip.frames.map((f, i) => {
		const seq = nextSeq + i, numbered = f.seq != null && (!f.label || f.label === String(f.seq))
		return { ...f, id: fid.get(f.id)!, x: f.x + off, y: f.y + off, seq, label: numbered ? String(seq) : f.label, locked: undefined }
	})
	const gids = new Map<string, string>()
	const shapes = clip.shapes.map(({ modelId, ent }) => ({ modelId, ent: { ...ent, id: newId(), space: `view:${fid.get(ent.space!.slice(5))}`,
		groupId: ent.groupId ? gids.get(ent.groupId) ?? (gids.set(ent.groupId, newId()), gids.get(ent.groupId)) : undefined } }))
	return { frames, shapes }
}

export function saveClip(c: FrameClip) { try { localStorage.setItem(KEY, JSON.stringify(c)) } catch { /* private mode / full */ } }
export function loadClip(): FrameClip | null {
	try { const s = localStorage.getItem(KEY); const c = s ? (JSON.parse(s) as FrameClip) : null; return c?.frames?.length ? c : null } catch { return null }
}
