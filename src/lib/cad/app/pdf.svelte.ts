// PDF floorplan underlays: each file page is rasterised once and placed in plan mm from its Uploads calibration
// (`files/{id}.pages[page]`: origin in rendered px, `scale.scale` = mm per rendered px). One cache per open project
// (no module state). Placement maths from pages/ui/render/pdfRaster (`placementFromCalib`).
import { doc, getDoc, type Firestore } from 'firebase/firestore'
import { PdfState } from '../../../routes/projects/[pid]/uploads/parts/PdfState.svelte'
import type { Underlay } from '../domain/types'

const RENDER_SCALE = 2
export interface Placed { url: string; x: number; y: number; w: number; h: number }
type PageCalib = { origin?: { x: number; y: number }; scale?: { scale?: number } }

/** Where a rendered page (w × h px) sits in plan mm: the calibration origin lands on plan (0, 0). */
export function placementFromCalib(c: PageCalib | undefined, w: number, h: number): Omit<Placed, 'url'> | null {
	const sf = Number(c?.scale?.scale)
	if (!sf || !w || !h) return null
	const o = c?.origin ?? { x: 0, y: 0 }
	return { x: 0 - o.x * sf, y: 0 - o.y * sf, w: w * sf, h: h * sf }
}

export class PdfCache {
	#ready = $state<Record<string, Placed>>({})
	#jobs = new Set<string>()
	/** Files whose page could not be placed (no url, not calibrated, render failed): key → reason. */
	problems = $state<Record<string, string>>({})

	constructor(private db: Firestore) {}

	/** Reactive: the placed image for an underlay, or undefined while it renders / when it can't be placed. */
	placement = (u: Underlay): Placed | undefined => {
		const page = u.page ?? 1, key = `${u.fileId}#${page}`
		const r = this.#ready[key]
		if (!r && !this.#jobs.has(key)) { this.#jobs.add(key); void this.#render(u.fileId, page, key) }
		return r
	}

	async #render(fileId: string, page: number, key: string): Promise<void> {
		try {
			const fd = (await getDoc(doc(this.db, 'files', fileId))).data()
			if (!fd?.url) throw new Error('the file has no url')
			const pdf = new PdfState()
			pdf.applyFileSettings(fd)
			try {
				await pdf.load(fd.url)
				const r = await pdf.renderToObjectUrl(page, RENDER_SCALE)
				const pl = placementFromCalib(fd.pages?.[page] ?? fd.pages?.[String(page)], r.width, r.height)
				if (!pl) throw new Error('the page is not calibrated in Uploads')
				this.#ready[key] = { url: r.objectUrl, ...pl }
			} finally { pdf.destroy() }
		} catch (e) {
			this.problems[key] = (e as Error).message
		}
	}
}
