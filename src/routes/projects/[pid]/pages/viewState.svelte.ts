// ViewState (review.md §R2): one store for a pane's VIEW-side state — pan/zoom, 3D orbit, active
// projection, and paper-space canvas position — replacing five parallel maps in +page.svelte
// (docCanvasView, cvCache, docProj, docOrbit, docView). Document content (frames/paper/scale, doc.ts)
// and session (tabs/panes/selection) are separate concerns; this module is VIEW only.
//
// The four legacy maps actually have TWO different key granularities, not one:
//   - docView / docOrbit are keyed by pane × VIEW (a tab id, or inside a sheet a FRAME id) × projection
//     — `viewKey(paneId, viewId, proj)`, today's `vkey`. A tab can show several projections (plan,
//     front, iso, …) and each remembers its own pan/zoom/orbit independently.
//   - docProj / docCanvasView are keyed by pane × TAB only — one active projection choice, and one
//     paper-space canvas position, per pane+tab, independent of which projection is showing.
// One `Map`-backed store still holds both: `ViewState`'s fields are all optional, and which ones are
// populated at a given key depends on which key SHAPE it is (fine per-view, or coarse per-tab) — see
// the two key helpers below. `pan`/`zoom` only exist at fine keys; `proj`/`canvas` only at coarse keys.
import type { Proj } from './types'

export type Pt2 = { x: number; y: number }
export type ViewState = { pan?: Pt2; zoom?: number; orbit?: { yaw: number; pitch: number }; proj?: Proj; canvas?: Pt2 & { zoom: number } }

/** Today's `vkey`: one entry per pane × view (tab or frame id) × projection. */
export const viewKey = (paneId: string, viewId: string, proj: string): string => `${paneId}:${viewId}:${proj}`
/** Today's `cvKey`/`projKey`: one entry per pane × tab, independent of projection. */
const paneTabKey = (paneId: string, tabId: string): string => `${paneId}:${tabId}`

const CV_LS = 'eos.pages.canvasView'
const DEFAULT_VIEW = { x: 0, y: 0, zoom: 1 }

class ViewStateStore {
	#map = $state<Record<string, ViewState>>({})
	// Per-tab (not per-pane) localStorage SEED for canvas view — today's `cvCache`, loaded once,
	// client only, keyed by tab id ALONE (a canvas position is a per-user convenience that follows the
	// tab regardless of which pane last showed it).
	#canvasCache = $state<Record<string, Pt2 & { zoom: number }>>({})

	/** Load the persisted canvas-view cache. Call once, client-side (today's `+page` `$effect`). */
	loadPersisted() {
		try { this.#canvasCache = JSON.parse(localStorage.getItem(CV_LS) || '{}') } catch { /* private mode */ }
	}

	// ── fine-grained: pan/zoom + orbit, per pane+view+proj ──
	getView(paneId: string, viewId: string, proj: string): Pt2 & { zoom: number } {
		const v = this.#map[viewKey(paneId, viewId, proj)]
		return v?.pan && v.zoom != null ? { ...v.pan, zoom: v.zoom } : DEFAULT_VIEW
	}
	setView(paneId: string, viewId: string, proj: string, v: Pt2 & { zoom: number }) {
		const k = viewKey(paneId, viewId, proj)
		this.#map = { ...this.#map, [k]: { ...this.#map[k], pan: { x: v.x, y: v.y }, zoom: v.zoom } }
	}
	getOrbit(paneId: string, viewId: string, proj: string): { yaw: number; pitch: number } | undefined {
		return this.#map[viewKey(paneId, viewId, proj)]?.orbit
	}
	setOrbit(paneId: string, viewId: string, proj: string, yaw: number, pitch: number) {
		const k = viewKey(paneId, viewId, proj)
		this.#map = { ...this.#map, [k]: { ...this.#map[k], orbit: { yaw, pitch } } }
	}

	// ── coarse-grained: projection choice + canvas position, per pane+tab ──
	getProj(paneId: string, tabId: string): Proj | undefined {
		return this.#map[paneTabKey(paneId, tabId)]?.proj
	}
	setProj(paneId: string, tabId: string, proj: Proj) {
		const k = paneTabKey(paneId, tabId)
		this.#map = { ...this.#map, [k]: { ...this.#map[k], proj } }
	}
	getCanvas(paneId: string, tabId: string): Pt2 & { zoom: number } {
		return this.#map[paneTabKey(paneId, tabId)]?.canvas ?? this.#canvasCache[tabId] ?? DEFAULT_VIEW
	}
	setCanvas(paneId: string, tabId: string, v: Pt2 & { zoom: number }) {
		const k = paneTabKey(paneId, tabId)
		this.#map = { ...this.#map, [k]: { ...this.#map[k], canvas: v } }
		this.#canvasCache = { ...this.#canvasCache, [tabId]: v }
		try { localStorage.setItem(CV_LS, JSON.stringify(this.#canvasCache)) } catch { /* private mode */ }
	}

	/** Drop every fine (pane:viewId:proj) and coarse (pane:tabId) entry belonging to one of `ids` — a tab
	 *  closing/being reused, or its viewport frames. Matches `dropDoc`'s behaviour today EXACTLY,
	 *  including that the canvas-view cache is NOT cleared here: `dropDoc` never cleared
	 *  `docCanvasView`/`cvCache` either — a canvas position is orphaned (not cleaned up) when its tab
	 *  closes, since tab ids are random (B13) and a reopened drawing gets a fresh one. Preserved as-is,
	 *  not a new gap introduced by this refactor. */
	drop(ids: string[]) {
		const idSet = new Set(ids)
		const mine = (k: string) => idSet.has(k) || idSet.has(k.split(':')[1])   // bare-key check kept for parity with dropDoc's `k === id` (never actually matches: every key here has a ':')
		const next: Record<string, ViewState> = {}
		for (const k of Object.keys(this.#map)) if (!mine(k)) next[k] = this.#map[k]
		this.#map = next
	}
}

export const viewState = new ViewStateStore()
