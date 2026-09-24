// CANVAS NAVIGATION — pan / zoom / Fit for the panes (moved out of +page.svelte). Each pane has a paper CANVAS view
// (a CSS transform over the sheet) and, while a viewport is active, that viewport's CONTENT view; the nav bar /
// keys / status zoom act on the content only when a viewport is active AND "Pan content" is on (always, in a
// model-layout tab), else on the canvas. +page owns the session / docs / view state and hands them in as a host.
import { tick } from 'svelte'
import { clampCanvasZoom, clampViewZoom } from './constants'
import { DEFAULT_YAW, DEFAULT_PITCH } from './3dview/projection'
import type { Proj, SheetFrame, Tab, View, WorkPane } from './types'

type PaneRef = { id: string; activeId: string }
export type CanvasNavHost = {
	panes: () => WorkPane[]
	focused: () => number
	tabs: () => Tab[]
	/** "Pan content": wheel / nav act on the active viewport's content. */
	navContent: () => boolean
	isModelLayout: (p: PaneRef) => boolean
	/** The ACTIVE viewport of a tab: a sheet's active frame id, a model-layout tab's own id, or null. */
	activeVpOf: (tabId: string) => string | null
	framesOf: (tabId: string) => SheetFrame[]
	projOf: (pane: { id: string }, a: Tab | null) => Proj
	canvasViewOf: (p: PaneRef) => View
	setCanvasView: (p: PaneRef, v: View) => void
	viewOf: (paneId: string, viewId: string, proj: Proj) => View
	setView: (paneId: string, viewId: string, proj: Proj, v: View) => void
	setOrbit: (paneId: string, viewId: string, proj: Proj, yaw: number, pitch: number) => void
	/** viewState: is a view / canvas remembered (localStorage) for this pane + drawing? */
	hasView: (paneId: string, viewId: string, proj: Proj) => boolean
	hasCanvas: (paneId: string, tabId: string) => boolean
	paperDims: (tabId: string) => { w: number; h: number }
	/** Each pane's .canvas element (for Fit). */
	canvasEl: (idx: number) => HTMLElement | undefined
}

export class CanvasNav {
	#h: CanvasNavHost
	constructor(host: CanvasNavHost) { this.#h = host }

	canvasPan = (pane: PaneRef, dx: number, dy: number) => {
		const v = this.#h.canvasViewOf(pane); this.#h.setCanvasView(pane, { ...v, x: v.x + dx, y: v.y + dy })
	}
	canvasZoom = (pane: PaneRef, el: HTMLElement, f: number, clientX: number, clientY: number) => {
		const r = el.getBoundingClientRect(), mx = clientX - r.left, my = clientY - r.top
		const v = this.#h.canvasViewOf(pane), nz = clampCanvasZoom(v.zoom * f), ratio = nz / v.zoom   // up to 2000%
		this.#h.setCanvasView(pane, { x: mx - (mx - v.x) * ratio, y: my - (my - v.y) * ratio, zoom: nz })
	}
	// B28: the ACTIVE viewport id, keyed the way `activeVps` / viewState use it — a sheet's active FRAME id, or a
	// model-layout tab's own id (the TAB id is never in `activeVps` for a sheet).
	activeViewportId = (p: PaneRef) => this.#h.activeVpOf(p.activeId)
	zoomsContent = (p: PaneRef) => (this.#h.navContent() || this.#h.isModelLayout(p)) && !!this.activeViewportId(p)   // B31: model space always zooms its content
	/** The projection of whatever's ACTIVE in the pane: a sheet's active FRAME's own proj (B28), else the tab's. */
	activeProj = (p: PaneRef): Proj => {
		const t = this.#h.tabs().find((x) => x.id === p.activeId) ?? null
		if (t?.kind === 'sheet') { const av = this.activeViewportId(p); const f = av ? this.#h.framesOf(p.activeId).find((x) => x.id === av) : null; if (f) return f.proj as Proj }
		return this.#h.projOf(p, t)
	}
	/** The status bar's zoom % (content or canvas, as above). */
	dispZoom = $derived.by(() => {
		const p = this.#h.panes()[this.#h.focused()]; if (!p) return 100
		const av = this.activeViewportId(p)
		return Math.round((this.zoomsContent(p) && av ? this.#h.viewOf(p.id, av, this.activeProj(p)).zoom : this.#h.canvasViewOf(p).zoom) * 100)
	})
	navZoom = (f: number) => {
		const p = this.#h.panes()[this.#h.focused()]; if (!p) return
		const av = this.activeViewportId(p)
		if (this.zoomsContent(p) && av) { const pr = this.activeProj(p), v = this.#h.viewOf(p.id, av, pr); this.#h.setView(p.id, av, pr, { ...v, zoom: clampViewZoom(v.zoom * f) }) }
		else { const v = this.#h.canvasViewOf(p); this.#h.setCanvasView(p, { ...v, zoom: clampCanvasZoom(v.zoom * f) }) }
	}
	/** Fit a pane: frame its sheet paper (centred, with margin) or reset a model view. An EXPLICIT Fit (button /
	 *  menu) may reset an active sheet frame's own content (with "Pan content" on); automatic refits (mount,
	 *  split, layout toggle) never do (B28). A mount refit (`skipIfPersisted`) leaves a remembered view /
	 *  canvas alone (B27). Fit resets the 3D orbit of the same viewport whose content it resets (B30). */
	fitPane = (idx: number, opts: { skipIfPersisted?: boolean; explicit?: boolean } = {}) => {
		const h = this.#h, p = h.panes()[idx]; if (!p) return
		const pr = this.activeProj(p), av = this.activeViewportId(p)
		if (av && av === p.activeId && opts.skipIfPersisted && h.hasView(p.id, av, pr)) return
		if (av && (av === p.activeId || (opts.explicit && this.zoomsContent(p)))) { h.setOrbit(p.id, av, pr, DEFAULT_YAW, DEFAULT_PITCH); h.setView(p.id, av, pr, { zoom: 1, x: 0, y: 0 }); return }
		if (opts.skipIfPersisted && p.activeId && h.hasCanvas(p.id, p.activeId)) return
		const a2 = h.tabs().find((t) => t.id === p.activeId), canvas = h.canvasEl(idx)
		if (a2?.kind === 'sheet' && p.layout === 'sheet' && canvas && canvas.clientWidth > 50) {
			const r = canvas.getBoundingClientRect(), pd = h.paperDims(p.activeId)
			const z = Math.min(r.width / pd.w, r.height / pd.h) * 0.9
			h.setCanvasView(p, { zoom: z, x: (r.width - pd.w * z) / 2, y: (r.height - pd.h * z) / 2 })
		} else h.setCanvasView(p, { zoom: 1, x: 0, y: 0 })
	}
	navFit = () => this.fitPane(this.#h.focused(), { explicit: true })
	/** Refit every pane (after a tick). The mount caller passes `skipIfPersisted` (B27); nothing passes `explicit`. */
	refitAll = (opts: { skipIfPersisted?: boolean } = {}) => { tick().then(() => this.#h.panes().forEach((_, i) => this.fitPane(i, opts))) }
}
