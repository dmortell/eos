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
/** Is key `k` (either shape) one of view / drawing `id`'s? Ids may contain ':' (`model:<id>`), so match the
 *  text after the pane segment rather than splitting. */
const ofView = (k: string, id: string): boolean => { const rest = k.slice(k.indexOf(':') + 1); return rest === id || rest.startsWith(`${id}:`) }

const CV_LS = 'eos.pages.canvasView'
/** The per-view pan/zoom/orbit + per-tab projection, persisted so a reload restores a model tab's view.
 *  Same keys as the live map (pane × DRAWING id / frame id × proj — all stable across reloads). */
const VIEW_LS = 'eos.pages.views'
const VIEW_LS_MAX = 400
const DEFAULT_VIEW = { x: 0, y: 0, zoom: 1 }

class ViewStateStore {
	#map = $state<Record<string, ViewState>>({})
	// Per-DRAWING (not per-tab, not per-pane) localStorage SEED for canvas view — today's `cvCache`,
	// loaded once, client only. B27: was keyed by tab id, which is random (B13) and never survives a
	// tab close/reopen or a page reload creating a fresh tab for the same drawing, so the seed could
	// never actually be found again — rekeyed by the stable DRAWING id.
	#canvasCache = $state<Record<string, Pt2 & { zoom: number }>>({})

	// The persisted view / orbit / projection SEED (live entries win) — like the canvas seed, it outlives a
	// tab close (only `drop(…, drawingId)` prunes it), so reopening a drawing restores its view too.
	#viewCache = $state<Record<string, ViewState>>({})
	#saveTimer: ReturnType<typeof setTimeout> | undefined

	/** Load the persisted canvas-view + view caches. Call once, client-side (today's `+page` `$effect`). */
	loadPersisted() {
		try { this.#canvasCache = JSON.parse(localStorage.getItem(CV_LS) || '{}') } catch { /* private mode */ }
		try { this.#viewCache = JSON.parse(localStorage.getItem(VIEW_LS) || '{}') } catch { /* private mode */ }
	}
	#at(k: string): ViewState | undefined { return this.#map[k] ?? this.#viewCache[k] }
	/** Merge `patch` into key `k` (live map + persisted seed); the seed is written debounced (pan/zoom
	 *  fire per pointer move), newest last and capped at VIEW_LS_MAX entries. */
	#put(k: string, patch: ViewState) {
		this.#map = { ...this.#map, [k]: { ...this.#at(k), ...patch } }
		const { [k]: old, ...rest } = this.#viewCache
		const next = { ...rest, [k]: { ...old, ...patch } }, keys = Object.keys(next)
		for (const x of keys.slice(0, Math.max(0, keys.length - VIEW_LS_MAX))) delete next[x]
		this.#viewCache = next
		clearTimeout(this.#saveTimer)
		this.#saveTimer = setTimeout(() => { try { localStorage.setItem(VIEW_LS, JSON.stringify(this.#viewCache)) } catch { /* private mode */ } }, 300)
	}

	// ── fine-grained: pan/zoom + orbit, per pane+view+proj ──
	getView(paneId: string, viewId: string, proj: string): Pt2 & { zoom: number } {
		const v = this.#at(viewKey(paneId, viewId, proj))
		return v?.pan && v.zoom != null ? { ...v.pan, zoom: v.zoom } : DEFAULT_VIEW
	}
	setView(paneId: string, viewId: string, proj: string, v: Pt2 & { zoom: number }) {
		this.#put(viewKey(paneId, viewId, proj), { pan: { x: v.x, y: v.y }, zoom: v.zoom })
	}
	/** Has this view a remembered (live or persisted) pan/zoom? — a mount-time fit skips it (B27 for models). */
	hasView(paneId: string, viewId: string, proj: string): boolean { return this.#at(viewKey(paneId, viewId, proj))?.zoom != null }
	getOrbit(paneId: string, viewId: string, proj: string): { yaw: number; pitch: number } | undefined {
		return this.#at(viewKey(paneId, viewId, proj))?.orbit
	}
	setOrbit(paneId: string, viewId: string, proj: string, yaw: number, pitch: number) {
		this.#put(viewKey(paneId, viewId, proj), { orbit: { yaw, pitch } })
	}

	// ── coarse-grained: projection choice + canvas position, per pane+tab ──
	getProj(paneId: string, tabId: string): Proj | undefined {
		return this.#at(paneTabKey(paneId, tabId))?.proj
	}
	setProj(paneId: string, tabId: string, proj: Proj) {
		this.#put(paneTabKey(paneId, tabId), { proj })
	}
	/** `drawingId` (B27) — the persisted SEED is keyed by the stable DRAWING id, not the tab id: tab ids
	 *  are random (B13), so a reopened drawing's tab never matched its old localStorage entry and the
	 *  cache only ever grew. The LIVE (in-session) value stays keyed by pane+tab, unaffected. */
	getCanvas(paneId: string, tabId: string, drawingId: string): Pt2 & { zoom: number } {
		return this.#map[paneTabKey(paneId, tabId)]?.canvas ?? this.#canvasCache[drawingId] ?? DEFAULT_VIEW
	}
	setCanvas(paneId: string, tabId: string, drawingId: string, v: Pt2 & { zoom: number }) {
		const k = paneTabKey(paneId, tabId)
		this.#map = { ...this.#map, [k]: { ...this.#map[k], canvas: v } }
		this.#canvasCache = { ...this.#canvasCache, [drawingId]: v }
		try { localStorage.setItem(CV_LS, JSON.stringify(this.#canvasCache)) } catch { /* private mode */ }
	}
	/** B27: has this drawing got a persisted (or live-this-session) canvas position already? — a caller
	 *  doing an initial "fit to paper" should skip it and let the persisted value show instead. */
	hasCanvas(paneId: string, tabId: string, drawingId: string): boolean {
		return this.#map[paneTabKey(paneId, tabId)]?.canvas != null || drawingId in this.#canvasCache
	}

	/** Drop every fine (pane:viewId:proj) and coarse (pane:tabId) entry belonging to one of `ids` — a tab
	 *  closing/being reused, or its viewport frames. Matches `dropDoc`'s behaviour today for the LIVE
	 *  map (view/orbit/proj are dropped). The persisted canvas SEED is keyed by drawing id, not tab id,
	 *  so it can't be swept by `ids`; pass `drawingId` (B27: "prune on close") to remove that drawing's
	 *  seed too — omit it to leave the seed alone (matches the pre-B27 behaviour of never clearing it). */
	drop(ids: string[], drawingId?: string) {
		const idSet = new Set(ids)
		const mine = (k: string) => [...idSet].some((id) => ofView(k, id))
		const next: Record<string, ViewState> = {}
		for (const k of Object.keys(this.#map)) if (!mine(k)) next[k] = this.#map[k]
		this.#map = next
		if (drawingId != null) {
			const vc: Record<string, ViewState> = {}
			for (const k of Object.keys(this.#viewCache)) if (!ofView(k, drawingId)) vc[k] = this.#viewCache[k]
			this.#viewCache = vc
			try { localStorage.setItem(VIEW_LS, JSON.stringify(vc)) } catch { /* private mode */ }
		}
		if (drawingId != null && drawingId in this.#canvasCache) {
			const cache = { ...this.#canvasCache }; delete cache[drawingId]; this.#canvasCache = cache
			try { localStorage.setItem(CV_LS, JSON.stringify(this.#canvasCache)) } catch { /* private mode */ }
		}
	}
}

export const viewState = new ViewStateStore()
