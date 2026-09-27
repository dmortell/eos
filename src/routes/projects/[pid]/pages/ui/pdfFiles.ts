// Insert / replace an image shape from the UPLOADS tool's files (Insert › From Uploads…, Properties › IMAGE ›
// Replace…): PDFs (a page) and pictures — this project's first, then other projects' (a floor's plan can sit in
// another project's Uploads; the shape only REFERENCES the file, nothing is written there). An uploaded file keeps
// working after a reload (its URL / `pdf:` source is stored), unlike Insert › Image… from this computer, whose
// data lives only in the browser session (imageStore).
import type { Ent } from './geometry'
import { pdfSrc, parsePdfSrc, placementFromCalib, renderPdfPage, type PageCalib } from './render/pdfRaster.svelte'

export type UploadFile = { id: string; name: string; kind: 'pdf' | 'image'; url: string; pages: number; projectId: string; projectName: string; mine: boolean }
type FileDoc = { id: string; name?: string; pageCount?: number; projectId?: string; url?: string; pages?: Record<string, PageCalib> }
const firestore = async () => new (await import('$lib/db.svelte')).Firestore()   // lazy: the pure part below stays unit-testable
const IMG = /\.(png|jpe?g|gif|webp|bmp|svg)$/i

/** Every uploaded PDF and picture, this project's first (then by project, name). */
export async function listUploadFiles(pid: string): Promise<UploadFile[]> {
	const db = await firestore()
	const docs = ((await db.getMany('files')) as unknown as FileDoc[]).filter((f) => f.url && (/\.pdf$/i.test(f.name ?? f.id) || IMG.test(f.name ?? f.id)))
	const names = new Map<string, string>()
	await Promise.all([...new Set(docs.map((f) => f.projectId ?? ''))].filter(Boolean).map(async (id) => {
		const p = (await db.getOne('projects', id).catch(() => null)) as { name?: string; title?: string } | null
		names.set(id, p?.name ?? p?.title ?? id)
	}))
	return docs.map((f): UploadFile => ({ id: f.id, name: f.name ?? f.id, kind: /\.pdf$/i.test(f.name ?? f.id) ? 'pdf' : 'image', url: f.url!, pages: f.pageCount ?? 1,
		projectId: f.projectId ?? '', projectName: names.get(f.projectId ?? '') ?? '—', mine: f.projectId === pid }))
		.sort((a, b) => Number(b.mine) - Number(a.mine) || a.projectName.localeCompare(b.projectName) || a.name.localeCompare(b.name))
}

/** The image shape showing `src` (w × h px) instead: placed from the file's Uploads calibration when it has one;
 *  else it keeps its left / top and width, taking the new aspect (and no crop). Layer, opacity, greyscale and the
 *  live / fixed choice stay. */
export function replacedImage(e: Ent, src: string, calib: PageCalib | undefined, w: number, h: number): Ent {
	const out: Ent = { ...e, src }
	delete out.crop
	const pl = placementFromCalib(calib, w, h)
	if (pl) { out.a = pl.a; out.b = pl.b; if (pl.crop) out.crop = pl.crop; return out }
	const a = e.a ?? [0, 0], b = e.b ?? [a[0] + 10000, a[1] + 7000], x0 = Math.min(a[0], b[0]), y0 = Math.min(a[1], b[1]), wd = Math.abs(b[0] - a[0])
	out.a = [x0, y0]; out.b = [x0 + wd, y0 + (w ? (wd * h) / w : Math.abs(b[1] - a[1]))]
	return out
}
/** `replacedImage` for a PDF page. */
export const replacedPdf = (e: Ent, fileId: string, page: number, calib: PageCalib | undefined, w: number, h: number): Ent =>
	replacedImage(e, pdfSrc(fileId, page), calib, w, h)

const pictureSize = (url: string) => new Promise<{ w: number; h: number }>((ok) => {
	const img = new Image(); img.onload = () => ok({ w: img.naturalWidth, h: img.naturalHeight }); img.onerror = () => ok({ w: 0, h: 0 }); img.src = url
})
/** Load what `replacedImage` needs (the file's calibration + the page / picture size) and build the new shape. A
 *  `live` flag only makes sense for a PDF page (it follows that page's Uploads calibration). */
export async function uploadShape(e: Ent, f: UploadFile, page: number, calibrated = true): Promise<Ent> {
	const db = await firestore()
	const fd = calibrated ? ((await db.getOne('files', f.id).catch(() => null)) as FileDoc | null) : null   // an elevation: plan calibration doesn't apply
	if (f.kind === 'pdf') { const r = await renderPdfPage(f.id, page); return replacedImage(e, pdfSrc(f.id, page), fd?.pages?.[page], r.w, r.h) }
	const s = await pictureSize(f.url), out = replacedImage(e, f.url, fd?.pages?.[1], s.w, s.h)
	delete out.live
	return out
}

/** The file + page an image shape shows, or null (not a PDF). */
export const pdfOf = (e: Ent) => (e.src ? parsePdfSrc(e.src) : null)
