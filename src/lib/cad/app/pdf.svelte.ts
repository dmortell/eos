// PDF floorplan underlays: each file page is rasterised once and placed in plan mm from its Uploads calibration
// (`files/{id}.pages[page]`: origin in rendered px, `scale.scale` = mm per rendered px). One cache per open project
// (no module state). Placement maths from pages/ui/render/pdfRaster (`placementFromCalib`).
import { doc, getDoc, onSnapshot, type Firestore } from 'firebase/firestore'
import { PdfState } from '$lib/pdf/PdfState.svelte'
import type { Underlay } from '../domain/types'
import { parsePictureRef, parseUnderlayRef, pageLook } from '../domain/issue'

const RENDER_SCALE = 2
/** `clip` = the crop set in Uploads, in plan mm (the image is drawn only inside it). */
export interface Placed { url: string; x: number; y: number; w: number; h: number; clip?: { x0: number; y0: number; x1: number; y1: number } }
type PageCalib = { origin?: { x: number; y: number }; scale?: { scale?: number }; crop?: { x: number; y: number; width: number; height: number } }
/** A page's calibration as placed: `origin` (page points) lands on plan (0, 0), `sf` = mm per page point; `page` = its size in points. */
export interface PageCalibUsed { origin: { x: number; y: number }; sf: number; crop?: PageCalib['crop']; provisional: boolean; page?: { w: number; h: number } }
/** An uncalibrated page is shown as if drawn at 1:100: a PDF point (1/72 in = 0.3528 mm) × 100. */
export const PROVISIONAL_SF = (25.4 / 72) * 100

/** Where a rendered page (w × h px) sits in plan mm: the calibration origin lands on plan (0, 0). The page's crop
 *  (rendered px, the same space as the origin — as the outlets / model3d tools read it) becomes a clip. */
/** What an issued sheet keeps of a floorplan file, to reprint it as it was: its url and the settings that change its
 *  picture (masks are in `pages`; PDF layers; markups). */
export interface FileSnapshot { url: string; pages?: Record<string, unknown>; hiddenLayers?: string[]; hideMarkups?: boolean }
export const fileSnapshot = (fd: Record<string, unknown>): FileSnapshot => ({ url: String(fd.url), ...(fd.pages ? { pages: fd.pages as Record<string, unknown> } : {}), ...(Array.isArray(fd.hiddenLayers) ? { hiddenLayers: fd.hiddenLayers as string[] } : {}), ...(fd.hideMarkups ? { hideMarkups: true } : {}) })

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
	/** Files whose page could not be placed (no url, render failed) or isn't calibrated yet: key → reason. */
	problems = $state<Record<string, string>>({})
	/** Each placed page's calibration as used (`fileId#page` → origin in page points, mm per point, crop) — what the
	 *  Calibrate tool turns plan points back into page points with. */
	calib = $state<Record<string, PageCalibUsed>>({})
	/** Each placed page's look (`fileId#page` → `pageLook`, missing = none), and a count bumped when one changes (the
	 *  register's "Changed since" re-checks then: a mask edit isn't a project edit). */
	looks: Record<string, string> = {}
	lookRev = $state(0)
	/** The look of a floorplan reference in a frozen list (domain/issue.ts `sheetPrint`). */
	lookOfRef = (ref: string): string => { const r = parseUnderlayRef(ref); return r ? this.looks[`${r.fileId}#${r.page}`] ?? '' : '' }

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

	// ── an image shape's picture (backlog "Markup kinds" part 4): no calibration, just the picture ──
	#pics = $state<Record<string, string>>({})
	#picJobs = new Map<string, Promise<void>>()
	/** Reactive: the url to show for a `picture:` reference — an image file as it is, a PDF page rasterised —
	 *  undefined while it loads (or when it can't: `problems`). */
	picture = (ref: string): string | undefined => {
		const r = parsePictureRef(ref)
		if (!r) return undefined
		const key = `${r.fileId}#${r.page}`, url = this.#pics[key]
		if (!url && !this.#picJobs.has(key)) this.#picJobs.set(key, this.#renderPicture(r.fileId, r.page, key))
		return url
	}
	/** Show this url for an image file's picture (a pasted picture, from its own bytes while it uploads). */
	showPicture = (fileId: string, url: string): void => { this.#pics[`${fileId}#1`] = url }
	/** The same, waiting for it (PDFs). */
	pictureReady = async (ref: string): Promise<string | undefined> => {
		const r = parsePictureRef(ref)
		if (!r) return undefined
		this.picture(ref)
		await this.#picJobs.get(`${r.fileId}#${r.page}`)
		return this.#pics[`${r.fileId}#${r.page}`]
	}
	async #renderPicture(fileId: string, page: number, key: string): Promise<void> {
		try {
			const fd = (await getDoc(doc(this.db, 'files', fileId))).data()
			if (!fd?.url) throw new Error('the file has no url')
			const isPdf = fd.type === 'application/pdf' || /\.pdf$/i.test(String(fd.name ?? ''))
			if (!isPdf) { this.#pics[key] = fd.url; return }
			const pdf = new PdfState()
			pdf.applyFileSettings(fd)
			try { await pdf.load(fd.url); this.#pics[key] = (await pdf.renderToObjectUrl(page, RENDER_SCALE)).objectUrl } finally { pdf.destroy() }
		} catch (e) {
			this.problems[`picture:${key}`] = (e as Error).message
		}
	}

	/** Each file is watched once it's used: a new origin / scale / crop / layers in Uploads redraws its pages at once
	 *  (the old image stays up until the new one is ready). */
	#watching = new Map<string, () => void>()
	#seen = new Map<string, string>()
	#watch(fileId: string): void {
		if (this.#watching.has(fileId)) return
		this.#watching.set(fileId, onSnapshot(doc(this.db, 'files', fileId), (s) => {
			const fd = s.data(), sig = JSON.stringify([fd?.url, fd?.pages, fd?.hiddenLayers, fd?.hideMarkups])
			const was = this.#seen.get(fileId)
			this.#seen.set(fileId, sig)
			if (was === undefined || was === sig) return
			// redraw its pages — also the ones that failed (no url yet, not calibrated …): the change may have fixed them
			for (const key of new Set([...Object.keys(this.#ready), ...this.#jobs.keys()])) if (key.startsWith(`${fileId}#`)) this.#jobs.set(key, this.#render(fileId, Number(key.split('#')[1]), key))
		}, (e) => {
			// the live check for a changed origin / scale / layers has stopped: the pages already drawn stay as they are
			this.problems[`watch:${fileId}`] = `lost the live connection to this file (${(e as Error)?.message ?? e}) — reload the page to see changes made in Uploads`
			this.#watching.delete(fileId)
		}))
	}
	/** A floorplan page drawn with the file's settings AS THEY WERE (`fd`: a snapshot kept with an issued sheet — its
	 *  masks / PDF layers / markups then), for reprinting it as issued (review R24c). Cached per snapshot. */
	#asWas = new Map<string, Promise<string | undefined>>()
	imageAsWas = (fileId: string, page: number, fd: FileSnapshot): Promise<string | undefined> => {
		const k = `${fileId}#${page}@${JSON.stringify(fd)}`
		let job = this.#asWas.get(k)
		if (!job) {
			job = (async () => {
				const pdf = new PdfState()
				pdf.applyFileSettings(fd)
				try { await pdf.load(fd.url); return (await pdf.renderToObjectUrl(page, RENDER_SCALE)).objectUrl } catch { return undefined } finally { pdf.destroy() }
			})()
			this.#asWas.set(k, job)
		}
		return job
	}

	destroy(): void {
		for (const off of this.#watching.values()) off()
		this.#watching.clear()
		for (const r of Object.values(this.#ready)) if (r.url.startsWith('blob:')) URL.revokeObjectURL(r.url)
		for (const u of Object.values(this.#pics)) if (u.startsWith('blob:')) URL.revokeObjectURL(u)
	}

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
				const c = (fd.pages?.[page] ?? fd.pages?.[String(page)]) as PageCalib | undefined
				const calibrated = !!Number(c?.scale?.scale)
				// not scaled yet: shown as if drawn at 1:100 (a PDF point = 0.3528 mm on paper), so it can be calibrated in
				// place (Project settings › Plans & floorplans › Origin / Scale / Crop, backlog "Calibrate an image in place")
				const use: PageCalib = calibrated ? c! : { ...c, scale: { scale: PROVISIONAL_SF } }
				const pl = placementFromCalib(use, r.width, r.height)
				if (!pl) throw new Error('the page could not be placed')
				this.calib[key] = { origin: use.origin ?? { x: 0, y: 0 }, sf: Number(use.scale!.scale), crop: use.crop, provisional: !calibrated, page: { w: r.width, h: r.height } }
				const look = pageLook(fd, page)
				if (look !== (this.looks[key] ?? '')) { if (look) this.looks[key] = look; else delete this.looks[key]; this.lookRev++ }
				if (calibrated) delete this.problems[key]
				else this.problems[key] = 'the page is not calibrated — shown as if 1:100: Project › Floors… › Plans & floorplans › Scale (or Uploads)'
				const old = this.#ready[key]?.url
				this.#ready[key] = { url: r.objectUrl, ...pl }
				if (old?.startsWith('blob:')) URL.revokeObjectURL(old)   // the re-rendered page replaces it (multi-MB)
			} finally { pdf.destroy() }
		} catch (e) {
			this.problems[key] = (e as Error).message
		}
	}
}
