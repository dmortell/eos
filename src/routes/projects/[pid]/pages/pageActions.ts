// File / Insert actions on the ACTIVE VIEW (moved out of +page.svelte): File › Export… (the view as DXF, C1) and
// Insert › Image… (a background image, standing on the ground line when inserted in an elevation — I5). The
// "active view" is the focused pane's active sheet frame (else its first), or a model tab's own view.
import { toast } from 'svelte-sonner'
import { newId } from './ids'
import { GROUND, type Ent, type ElevDir } from './ui/geometry'
import { scaleDenom } from './constants'
import { DIR_LABEL as PROJ_LABEL, type Proj, type SheetFrame } from './types'
import { modelById } from './3dview/models.svelte'
import type { ModelId } from './3dview/types'
import { viewToDxf } from './exportDxf'
import { downloadDxf } from '../sheets/dxf/dxf'
import { internImage } from './imageStore'

/** What the focused pane shows, resolved: the model + direction + the frame's view settings (a sheet) or the tab's. */
export type ActiveView = {
	tabId: string; title: string; paneId: string; viewId: string; mid: ModelId; dir: Proj; scale: string
	clip: SheetFrame['clip']; frozen?: string[]; storeys?: string[]; frameId?: string
}
export type PageActionsHost = {
	/** null (with the reason toasted by the caller's wording) when no drawing is open / a sheet has no frame. */
	activeView: () => ActiveView | null | 'no-frame'
	orbitOf: (paneId: string, viewId: string, proj: Proj) => { yaw: number; pitch: number }
	entsForModel: (mid: ModelId) => Ent[]
	addEnt: (tabId: string, e: Ent) => boolean
	activeLayerName: (mid: ModelId) => string
}

const ELEV = new Set(['front', 'rear', 'left', 'right'])

export class PageActions {
	#h: PageActionsHost
	constructor(host: PageActionsHost) { this.#h = host }

	/** C1: the active view as a DXF in real mm (exportDxf.ts), named after the drawing and the view. */
	exportActiveDxf = () => {
		const v = this.#h.activeView()
		if (v === 'no-frame') { toast('This sheet has no viewport to export'); return }
		if (!v) { toast('Open a drawing first'); return }
		const m = modelById(v.mid); if (!m) { toast('The model this view shows is missing'); return }
		const orb = this.#h.orbitOf(v.paneId, v.viewId, v.dir)
		const r = viewToDxf({ model: m, ents: this.#h.entsForModel(v.mid), dir: v.dir, clip: v.clip, yaw: orb.yaw, pitch: orb.pitch, frozen: v.frozen, storeys: v.storeys, scaleN: scaleDenom(v.scale), frameId: v.frameId })
		downloadDxf(r.text, `${v.title} - ${PROJ_LABEL[v.dir]}`)
		toast(`Exported ${v.title} (${PROJ_LABEL[v.dir]}): ${r.objects} object${r.objects === 1 ? '' : 's'}, ${r.shapes} shape${r.shapes === 1 ? '' : 's'}${r.skipped ? ` — ${r.skipped} image${r.skipped === 1 ? '' : 's'} left out` : ''}`)
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
	/** Insert › Image…: pick a file, then addImage. */
	importImage = () => {
		if (!this.#h.activeView()) { toast('Open a drawing first, then Insert › Image…'); return }
		const input = document.createElement('input')
		input.type = 'file'; input.accept = 'image/*'
		input.onchange = () => {
			const file = input.files?.[0]; if (!file) return
			const reader = new FileReader()
			reader.onload = () => this.addImage(String(reader.result))
			reader.readAsDataURL(file)
		}
		input.click()
	}
}
