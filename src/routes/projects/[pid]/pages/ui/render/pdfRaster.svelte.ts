// PDF pages as images (drawings-plan: floorplans are `image` SHAPES whose src is `pdf:<fileId>#<page>`).
// Each page is rasterised ONCE per session (file url + page + the file's layer settings) and its object URL
// kept; `pdfImageUrl(src)` is a reactive read for EntRender (starts the render on first use, re-renders the
// image when it arrives). The placement of a floorplan shape is computed ONCE, at creation, from the
// Outlets / Uploads calibration of the page (`floorplanPlacement`) — later edits in Pages aren't synced back.
import { Firestore } from '$lib'
import { PdfState } from '../../../uploads/parts/PdfState.svelte'

const RENDER_SCALE = 2
export const PDF_SRC = 'pdf:'
/** The image-shape src for a PDF page. */
export const pdfSrc = (fileId: string, page = 1) => `${PDF_SRC}${fileId}#${page}`
export function parsePdfSrc(src: string): { fileId: string; page: number } | null {
	if (!src.startsWith(PDF_SRC)) return null
	const [fileId, page] = src.slice(PDF_SRC.length).split('#')
	return fileId ? { fileId, page: Number(page) || 1 } : null
}

export type PageCalib = { origin?: { x: number; y: number }; scale?: { scale?: number }; crop?: { x: number; y: number; width: number; height: number } }
type FileDoc = { url?: string; pageCount?: number; hiddenLayers?: string[]; hideMarkups?: boolean; pages?: Record<string, PageCalib> }
export type Raster = { url: string; w: number; h: number }

let db: Firestore | null = null
const fileDocs = new Map<string, Promise<FileDoc | null>>()
const jobs = new Map<string, Promise<Raster>>()
const ready = $state<Record<string, Raster>>({})

function fileDoc(fileId: string): Promise<FileDoc | null> {
	let p = fileDocs.get(fileId)
	if (!p) { p = (db ??= new Firestore()).getOne('files', fileId).then((d) => (d as FileDoc | null) ?? null); fileDocs.set(fileId, p); p.catch(() => fileDocs.delete(fileId)) }
	return p
}

/** Render (once) a PDF page; resolves its object URL and pixel size. */
export function renderPdfPage(fileId: string, page: number): Promise<Raster> {
	const key = pdfSrc(fileId, page)
	let job = jobs.get(key)
	if (!job) {
		job = (async () => {
			const fd = await fileDoc(fileId)
			if (!fd?.url) throw new Error(`files/${fileId} has no url`)
			const pdf = new PdfState()
			pdf.applyFileSettings(fd)   // the file's hidden OCG layers / markups, like every other tool
			try { await pdf.load(fd.url); const r = await pdf.renderToObjectUrl(page, RENDER_SCALE); return { url: r.objectUrl, w: r.width, h: r.height } }
			finally { pdf.destroy() }
		})()
		jobs.set(key, job)
		job.then((r) => { ready[key] = r }, () => jobs.delete(key))   // a failed render may be retried later
	}
	return job
}

/** Reactive: the rendered page's URL for an image shape's `pdf:` src ('' until it's ready). */
export function pdfImageUrl(src: string): string {
	const r = ready[src]; if (r) return r.url
	const p = parsePdfSrc(src); if (p) void renderPdfPage(p.fileId, p.page).catch(() => {})
	return ''
}

/** A calibrated page's placement in model mm: the calibration origin sits at model (0,0); `scale` = mm per
 *  rendered px (a page with a scale but no origin is placed with its top-left at (0,0)); the crop becomes the
 *  image shape's normalized crop. null when the page has no scale. Pure. */
export function placementFromCalib(c: PageCalib | undefined, w: number, h: number): { a: [number, number]; b: [number, number]; crop?: { x: number; y: number; w: number; h: number } } | null {
	const sf = Number(c?.scale?.scale); if (!sf || !w || !h) return null
	const o = c?.origin ?? { x: 0, y: 0 }
	const x0 = 0 - o.x * sf, y0 = 0 - o.y * sf   // (0 - …: no -0 for a zero origin)
	const out: { a: [number, number]; b: [number, number]; crop?: { x: number; y: number; w: number; h: number } } = { a: [x0, y0], b: [x0 + w * sf, y0 + h * sf] }
	const k = c?.crop
	if (k && k.width > 0 && k.height > 0) out.crop = { x: k.x / w, y: k.y / h, w: k.width / w, h: k.height / h }
	return out
}

/** Where a floorplan page goes (render + calibration, computed once). null if the page isn't calibrated. */
export async function floorplanPlacement(fileId: string, page: number) {
	const [fd, r] = await Promise.all([fileDoc(fileId), renderPdfPage(fileId, page)])
	return placementFromCalib(fd?.pages?.[page], r.w, r.h)
}
