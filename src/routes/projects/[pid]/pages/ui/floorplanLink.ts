// I6: a floorplan image LIVE-LINKED to its Uploads calibration. A PDF-page shape with `live` follows the file's
// calibration (files/{fileId}.pages[page]: origin / scale / crop) whenever it changes in the Uploads tool, instead
// of the one-off copy made when it was attached. Moving / scaling / cropping it in Pages unlinks it (Pages then
// owns the placement); Properties can link it again. Pure helpers; the subscription lives in pagesProject.
import type { Ent } from './geometry'
import type { Model } from '../3dview/types'
import { parsePdfSrc } from './render/pdfRaster.svelte'

type Placement = { a: [number, number]; b: [number, number]; crop?: { x: number; y: number; w: number; h: number } }

/** The files whose calibration some loaded live floorplan follows. */
export function liveFileIds(ms: Model[]): string[] {
	const ids = new Set<string>()
	for (const m of ms) for (const e of m.shapes ?? []) if (e.live && e.type === 'image' && e.src) { const p = parsePdfSrc(e.src); if (p) ids.add(p.fileId) }
	return [...ids].sort()
}

const r3 = (v: number) => Math.round(v * 1000) / 1000
const samePt = (p?: [number, number] | number[], q?: [number, number]) => !!p && !!q && r3(p[0]) === r3(q[0]) && r3(p[1]) === r3(q[1])
const sameCrop = (a?: Placement['crop'], b?: Placement['crop']) => (!a && !b) || (!!a && !!b && r3(a.x) === r3(b.x) && r3(a.y) === r3(b.y) && r3(a.w) === r3(b.w) && r3(a.h) === r3(b.h))

/** The shape moved onto `pl`, or null when it's already there (so a sync never writes when nothing changed). */
export function followCalib(e: Ent, pl: Placement | null): Ent | null {
	if (!pl || (samePt(e.a, pl.a) && samePt(e.b, pl.b) && sameCrop(e.crop, pl.crop))) return null
	const out: Ent = { ...e, a: pl.a, b: pl.b }
	if (pl.crop) out.crop = pl.crop; else delete out.crop
	return out
}

/** A user edit of a live shape's placement (a / b / crop) breaks the link — Pages owns it from then on. */
export function unlinkIfMoved(prev: Ent | undefined, next: Ent): Ent {
	if (!prev?.live || !next.live) return next
	if (samePt(prev.a, next.a as [number, number]) && samePt(prev.b, next.b as [number, number]) && sameCrop(prev.crop, next.crop)) return next
	const out = { ...next }; delete out.live
	return out
}
