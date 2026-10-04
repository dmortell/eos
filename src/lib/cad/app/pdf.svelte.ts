// PDF floorplan underlays: each file page is rasterised once and placed in plan mm from its Uploads calibration
// (`files/{id}.pages[page]`: origin in rendered px, `scale.scale` = mm per rendered px). One cache per open project
// (no module state). Placement maths from pages/ui/render/pdfRaster (`placementFromCalib`).
import { doc, getDoc, onSnapshot, type Firestore } from 'firebase/firestore'
import { PdfState } from '../../../routes/projects/[pid]/uploads/parts/PdfState.svelte'
import type { Underlay } from '../domain/types'

const RENDER_SCALE = 2
/** `clip` = the crop set in Uploads, in plan mm (the image is drawn only inside it). */
export interface Placed { url: string; x: number; y: number; w: number; h: number; clip?: { x0: number; y0: number; x1: number; y1: number } }
type PageCalib = { origin?: { x: number; y: number }; scale?: { scale?: number }; crop?: { x: number; y: number; width: number; height: number } }

/** Where a rendered page (w × h px) sits in plan mm: the calibration origin lands on plan (0, 0). The page's crop
 *  (rendered px, the same space as the origin — as the outlets / model3d tools read it) becomes a clip. */
export function placementFromCalib(c: PageCalib | undefined, w: number, h: number): Omit<Placed, 'url'> | null {
	const sf = Number(c?.scale?.scale)
	if (!sf || !w || !h) return null
	const o = c?.origin ?? { x: 0, y: 0 }, x = 0 - o.x * sf, y = 0 - o.y * sf
	const cr = c?.crop && c.crop.width > 0 && c.crop.height > 0 ? c.crop : undefined
	return { x, y, w: w * sf, h: h * sf, ...(cr ? { clip: { x0: x + cr.x * sf, y0: y + cr.y * sf, x1: x + (cr.x + cr.width) * sf, y1: y + (cr.y + cr.height) * sf } } : {}) }
}

export class PdfCache {
	#ready = $state<Record<string, Placed>>({})
	#jobs = new Map<string, Promise<void>>()
	/** Files whose page could not be placed (no url, not calibrated, render failed): key → reason. */
	problems = $state<Record<string, string>>({})

	constructor(private db: Firestore) {}

	/** Reactive: the placed image for an underlay, or undefined while it renders / when it can't be placed. */
	placement = (u: Pick<Underlay, 'fileId' | 'page'>): Placed | undefined => {
		const page = u.page ?? 1, key = `${u.fileId}#${page}`
		const r = this.#ready[key]
		if (!r && !this.#jobs.has(key)) this.#jobs.set(key, this.#render(u.fileId, page, key))
		return r
	}
	/** The same, waiting for the render (PDFs of sheets that aren't on screen; reprints of issued sheets). */
	placed = async (u: Pick<Underlay, 'fileId' | 'page'>): Promise<Placed | undefined> => {
		this.placement(u)
		const key = `${u.fileId}#${u.page ?? 1}`
		await this.#jobs.get(key)
		return this.#ready[key]
	}

	/** Each file is watched once it's used: a new origin / scale / crop / layers in Uploads redraws its pages at once
	 *  (the old image stays up until the new one is ready). */
	#watching = new Map<string, () => void>()
	#seen = new Map<string, string>()
	#watch(fileId: string): void {
		if (this.#watching.has(fileId)) return
		this.#watching.set(fileId, onSnapshot(doc(this.db, 'files', fileId), (s) => {
			const fd = s.data(), sig = JSON.stringify([fd?.url, fd?.pages, fd?.hiddenLayers])
			const was = this.#seen.get(fileId)
			this.#seen.set(fileId, sig)
			if (was === undefined || was === sig) return
			for (const key of Object.keys(this.#ready)) if (key.startsWith(`${fileId}#`)) this.#jobs.set(key, this.#render(fileId, Number(key.split('#')[1]), key))
		}))
	}
	destroy(): void { for (const off of this.#watching.values()) off(); this.#watching.clear() }

	async #render(fileId: string, page: number, key: string): Promise<void> {
		this.#watch(fileId)
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
