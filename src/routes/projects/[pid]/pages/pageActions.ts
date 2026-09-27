// File / Insert actions on the ACTIVE VIEW (moved out of +page.svelte): File › Export… (the view as DXF, C1 — a ZIP
// with its images, O15) and
// Insert › Image… (a background image, standing on the ground line when inserted in an elevation — I5). The
// "active view" is the focused pane's active sheet frame (else its first), or a model tab's own view.
import { toast } from 'svelte-sonner'
import { newId } from './ids'
import { GROUND, type Ent, type ElevDir } from './ui/geometry'
import { scaleDenom } from './constants'
import { DIR_LABEL as PROJ_LABEL, type Proj, type SheetFrame } from './types'
import { modelById } from './3dview/models.svelte'
import type { ModelId } from './3dview/types'
import { viewToDxfBundle, dxfImageEnts, type DxfViewInput } from './exportDxf'
import { rasterForDxf, zipDxf, downloadBytes } from './dxfImages'
import { downloadDxf } from '../sheets/dxf/dxf'
import { internImage } from './imageStore'
import { uploadShape, type UploadFile } from './ui/pdfFiles'

/** What the focused pane shows, resolved: the model + direction + the frame's view settings (a sheet) or the tab's. */
export type ActiveView = {
	tabId: string; title: string; paneId: string; viewId: string; mid: ModelId; dir: Proj; scale: string
	clip: SheetFrame['clip']; frozen?: string[]; storeys?: string[]; frameId?: string
	/** A section line / elevation marker frame's live oriented clip (its view, maybe oblique) + the frame's hidden lines. */
	oclip?: SheetFrame['oclip'] | null; hideHidden?: boolean
}
export type PageActionsHost = {
	/** null (with the reason toasted by the caller's wording) when no drawing is open / a sheet has no frame. */
	activeView: () => ActiveView | null | 'no-frame'
	orbitOf: (paneId: string, viewId: string, proj: Proj) => { yaw: number; pitch: number; persp?: boolean; wire?: boolean }
	entsForModel: (mid: ModelId) => Ent[]
	addEnt: (tabId: string, e: Ent) => boolean
	activeLayerName: (mid: ModelId) => string
}

const ELEV = new Set(['front', 'rear', 'left', 'right'])

export class PageActions {
	#h: PageActionsHost
	constructor(host: PageActionsHost) { this.#h = host }

	/** C1: the active view as a DXF in real mm (exportDxf.ts), named after the drawing and the view. O15: with images
	 *  it downloads a ZIP — the .dxf + the rasterised images it references (dxfImages.ts); without, the bare .dxf. */
	exportActiveDxf = async () => {
		const v = this.#h.activeView()
		if (v === 'no-frame') { toast('This sheet has no viewport to export'); return }
		if (!v) { toast('Open a drawing first'); return }
		const m = modelById(v.mid); if (!m) { toast('The model this view shows is missing'); return }
		const orb = this.#h.orbitOf(v.paneId, v.viewId, v.dir)
		const inp: DxfViewInput = { model: m, ents: this.#h.entsForModel(v.mid), dir: v.dir, clip: v.clip, oclip: v.oclip, hideHidden: v.hideHidden, yaw: orb.yaw, pitch: orb.pitch, frozen: v.frozen, storeys: v.storeys, scaleN: scaleDenom(v.scale), frameId: v.frameId }
		const name = `${v.title} - ${PROJ_LABEL[v.dir]}`, stem = name.replace(/[^\w.-]+/g, '_')
		const busy = dxfImageEnts(inp).length ? toast.loading(`Exporting ${name} — rendering its images…`) : undefined
		try {
			const r = await viewToDxfBundle(inp, stem, rasterForDxf)
			if (r.files.length) downloadBytes(await zipDxf(`${stem}.dxf`, r.text, r.files), `${stem}.zip`, 'application/zip')
			else downloadDxf(r.text, name)
			const n = (k: number, w: string) => `${k} ${w}${k === 1 ? '' : 's'}`
			toast(`Exported ${v.title} (${PROJ_LABEL[v.dir]}): ${n(r.objects, 'object')}, ${n(r.shapes, 'shape')}${r.images ? `, ${n(r.images, 'image')} (zipped with the .dxf — keep them in one folder)` : ''}${r.skipped ? ` — ${n(r.skipped, 'image')} couldn't be read and ${r.skipped === 1 ? 'was' : 'were'} left out` : ''}`, { id: busy })
		} catch (err) {
			console.error('DXF export failed', err)
			toast.error(`DXF export failed: ${err instanceof Error ? err.message : err}`, { id: busy })
		}
	}

	/** Insert › From Uploads…: an uploaded PDF page / picture (stored by reference, so it survives a reload) on the
	 *  active layer — in plan placed by its Uploads calibration (a PDF then follows it live), else centred like
	 *  addImage; in an elevation on that plane, standing on the ground line. */
	addUpload = async (f: UploadFile, page: number, at?: [number, number] | null): Promise<boolean> => {
		const v = this.#h.activeView()
		if (!v || v === 'no-frame') { toast('Open a drawing first, then Insert › From Uploads…'); return false }
		const elev = ELEV.has(v.dir), w = elev ? 4000 : 9000, cx = at?.[0] ?? 14000, cy = at?.[1] ?? (elev ? GROUND - w * 0.35 : 8750)   // `at`: a drop / the cursor (drawing coords)
		const base: Ent = { id: newId(), type: 'image', a: [cx - w / 2, cy - w * 0.35], b: [cx + w / 2, cy + w * 0.35], src: '', plane: elev ? (v.dir as ElevDir) : 'plan',
			lockAspect: true, opacity: f.kind === 'pdf' ? 0.6 : 1, live: f.kind === 'pdf' && !elev ? true : undefined }
		let e = await uploadShape(base, f, page, !elev && !at).catch(() => null)
		if (!e) { toast(`Couldn't load ${f.name}`); return false }
		if (at) {   // dropped / pasted at a point: centred there (a fresh upload has no calibration to follow)
			const hw = Math.abs(e.b![0] - e.a![0]) / 2, hh = Math.abs(e.b![1] - e.a![1]) / 2
			e = { ...e, a: [at[0] - hw, at[1] - hh], b: [at[0] + hw, at[1] + hh] }; delete e.live
		} else if (elev) { const h = Math.abs(e.b![1] - e.a![1]); e = { ...e, a: [e.a![0], GROUND - h], b: [e.b![0], GROUND] } }   // stand it on the ground line
		if (!this.#h.addEnt(v.tabId, e)) return false
		toast(`${f.name} added to ${modelById(v.mid)?.name ?? 'the model'} on layer “${this.#h.activeLayerName(v.mid)}”.`)
		return true
	}

	/** Place an image (a data-URL or URL) on the active layer, sized to its aspect ratio, aspect-locked. The data-URL
	 *  is interned (imageStore.ts) so the bytes never enter the model / undo snapshots. I5: in an ELEVATION it lives
	 *  on that elevation's plane, standing on the ground line; otherwise on the plan, centred. */
	addImage = (src: string): boolean => {
		const v = this.#h.activeView()
		if (!v || v === 'no-frame') { toast('Open a drawing first, then Insert › Image…'); return false }
		const elev = ELEV.has(v.dir), img = new Image()
		const place = (aspect: number) => {
			const w = elev ? 4000 : 9000, h = w * aspect, cx = 14000, cy = elev ? GROUND - h / 2 : 8750
			if (!this.#h.addEnt(v.tabId, { id: newId(), type: 'image', a: [Math.round(cx - w / 2), Math.round(cy - h / 2)], b: [Math.round(cx + w / 2), Math.round(cy + h / 2)], src: internImage(src), plane: elev ? (v.dir as ElevDir) : 'plan', lockAspect: true })) return
			toast(`Image added to ${modelById(v.mid)?.name ?? 'the model'} on layer “${this.#h.activeLayerName(v.mid)}”. Set its scale/crop in Properties.`)
		}
		img.onload = () => place((img.naturalHeight || 700) / (img.naturalWidth || 1000))
		img.onerror = () => place(0.7)
		img.src = src
		return true
	}
	/** Insert › Image…: pick picture / PDF files from this computer — each is uploaded to the project's Uploads (so it
	 *  is saved and listed there) and inserted on the active layer (`insertFiles`, +page). */
	importImage = (insertFiles: (fs: File[]) => void) => {
		if (!this.#h.activeView()) { toast('Open a drawing first, then Insert › Image…'); return }
		const input = document.createElement('input')
		input.type = 'file'; input.accept = 'image/*,.pdf'; input.multiple = true
		input.onchange = () => { const fs = [...(input.files ?? [])]; if (fs.length) insertFiles(fs) }
		input.click()
	}
}
