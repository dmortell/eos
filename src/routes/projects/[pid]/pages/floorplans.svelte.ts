// FLOORPLANS of place models (moved out of pagesProject.svelte.ts). A floor's floorplan is an image SHAPE (src
// `pdf:<fileId>#<page>`) on the model's Background "Floorplan" layer — selectable / croppable / recalibratable
// like any image, locked by default (clicking the plan mustn't grab it). Attached ONCE from the Outlets / Uploads
// data of the floor (or a zone's own Outlets doc), placed from the page's calibration; I6: a `live` one then
// follows that calibration as it changes in Uploads (ui/floorplanLink.ts). Attaches and live moves are
// asynchronous / out-of-band, so they are applied to every undo step too (undo must never drop or move them).
import { untrack } from 'svelte'
import type { Firestore } from '$lib'
import { newId } from './ids'
import type { Ent } from './ui/geometry'
import { models, modelById } from './3dview/models.svelte'
import type { Model, ModelId } from './3dview/types'
import { floorplanPlacement, pdfSrc, PDF_SRC, parsePdfSrc, renderPdfPage, placementFromCalib, type PageCalib } from './ui/render/pdfRaster.svelte'
import { liveFileIds, followCalib } from './ui/floorplanLink'
import type { OutletsDoc } from './store/outletsImport'
import type { ProjectSource } from './projectData.svelte'

export const FLOORPLAN_LAYER = { id: 'floorplan', name: 'Floorplan', group: 'Background', color: '#94a3b8', swatch: 'color' as const, visible: true, locked: true }
export const floorplanShapeOf = (m: Model) => m.shapes?.find((e) => e.type === 'image' && e.src?.startsWith(PDF_SRC))

type FileDoc = { pages?: Record<string, PageCalib> }
export type FloorplansHost = {
	db: () => Firestore | undefined | null
	/** The other tools' data (a floor's floorplan file). */
	src: () => ProjectSource | null
	/** An out-of-band model change applied to every undo step too. */
	amendModelHistory: (id: string, fn: (m: Model) => Model) => void
}

export class Floorplans {
	#h: FloorplansHost
	#attaching = new Set<ModelId>()
	constructor(host: FloorplansHost) {
		this.#h = host
		// I6: one subscription per file some live floorplan follows; only shapes flagged `live` are touched, and only
		// when the calibration actually moved them (idempotent — safe on real projects)
		$effect(() => {
			const key = this.#liveFiles, db = this.#h.db()
			if (!db || !key) return
			const stops = key.split('|').map((fid) => db.subscribeOne('files', fid, (d) => untrack(() => void this.#syncCalib(fid, d as FileDoc))))
			return () => stops.forEach((s) => s())
		})
	}

	/** Give a model its floor's floorplan shape, once (no-op when it already has one). */
	attach(id: ModelId, floorNumber: number) {
		const src = this.#h.src(), m = modelById(id)
		if (!src || !m || floorplanShapeOf(m) || m.underlays?.length || this.#attaching.has(id)) return
		this.#attaching.add(id)
		src.floorplanOf(floorNumber).then((fp) => (fp ? this.#addShape(id, fp.fileId, fp.pageNum) : undefined))
			.catch(() => { /* no floorplan — the model stays empty */ }).finally(() => this.#attaching.delete(id))
	}
	/** A zone model's floorplan: the file its own Outlets-tool doc shows. */
	attachFromDoc(id: ModelId, docId: string) {
		const m = modelById(id), db = this.#h.db(); if (!db || !m || floorplanShapeOf(m) || this.#attaching.has(id)) return
		this.#attaching.add(id)
		db.getOne('outlets', docId).then((d) => { const od = d as OutletsDoc | null; return od?.selectedFileId ? this.#addShape(id, od.selectedFileId, od.selectedPage ?? 1) : undefined })
			.catch(() => {}).finally(() => this.#attaching.delete(id))
	}
	/** A stored model from before floorplans were shapes: turn its plan underlays into floorplan shapes (once). */
	convertUnderlays(id: ModelId) {
		const m = modelById(id), us = (m?.underlays ?? []).filter((u) => u.dir === 'plan' && u.fileId)
		if (!m || !us.length || this.#attaching.has(id)) return
		this.#attaching.add(id)
		Promise.all(us.map((u) => this.#addShape(id, u.fileId, u.pageNum ?? 1))).then(() => {
			const mm = modelById(id); if (!mm) return
			mm.underlays = []
			const l = mm.layers?.find((x) => x.id === FLOORPLAN_LAYER.id); if (l) l.locked = true
		}).catch(() => {}).finally(() => this.#attaching.delete(id))
	}
	/** A floorplan just switched to live (Properties): snap it to the calibration already seen. */
	resync = (src?: string) => {
		const ps = src ? parsePdfSrc(src) : null; if (!ps || !this.#calibDocs.has(ps.fileId)) return
		void this.#syncCalib(ps.fileId, this.#calibDocs.get(ps.fileId) ?? null)
	}

	async #addShape(id: ModelId, fileId: string, page: number) {
		const place = await floorplanPlacement(fileId, page)
		const mm = modelById(id)
		if (!place || !mm || floorplanShapeOf(mm)) return
		// the floorplan goes on its OWN Background layer (first in the list = drawn underneath), so the Layers
		// panel shows / hides / locks / VP-freezes it like any other layer
		const shape: Ent = { id: newId('e'), type: 'image', a: place.a, b: place.b, src: pdfSrc(fileId, page), layer: FLOORPLAN_LAYER.id, opacity: 0.6, lockAspect: true, live: true }
		if (place.crop) shape.crop = place.crop
		const attach = (m: Model): Model => (floorplanShapeOf(m) ? m : {
			...m, shapes: [shape, ...(m.shapes ?? [])],
			layers: m.layers?.some((l) => l.id === FLOORPLAN_LAYER.id) ? m.layers : [{ ...FLOORPLAN_LAYER }, ...(m.layers ?? [])],
		})
		const next = attach(mm); mm.layers = next.layers; mm.shapes = next.shapes
		this.#h.amendModelHistory(id, attach)   // attached asynchronously: every undo step gets it too, so undo can't drop it
	}

	#liveFiles = $derived(liveFileIds(models).join('|'))
	/** The last `files/{id}` doc seen per followed file — a shape switched to live snaps at once (no new callback). */
	#calibDocs = new Map<string, FileDoc | null>()
	async #syncCalib(fileId: string, d: FileDoc | null) {
		this.#calibDocs.set(fileId, d)
		const targets = models.flatMap((m) => (m.shapes ?? []).flatMap((e) => { const ps = e.live && e.src ? parsePdfSrc(e.src) : null; return ps?.fileId === fileId ? [{ mid: m.id, id: e.id, page: ps.page }] : [] }))
		for (const t of targets) {
			const r = await renderPdfPage(fileId, t.page).catch(() => null); if (!r) continue
			const pl = placementFromCalib(d?.pages?.[t.page], r.w, r.h)
			// re-read AFTER the render: an edit meanwhile (a move that unlinked it) wins
			const m = modelById(t.mid), cur = m?.shapes?.find((x) => x.id === t.id); if (!m || !cur?.live) continue
			const next = followCalib(cur, pl); if (!next) continue
			m.shapes = (m.shapes ?? []).map((x) => (x.id === t.id ? next : x))
			// …and in every undo step where it is still live, so an undo never puts back the old placement
			this.#h.amendModelHistory(t.mid, (sm) => { const s = sm.shapes?.find((x) => x.id === t.id); const n = s?.live ? followCalib(s, pl) : null; return n ? { ...sm, shapes: sm.shapes!.map((x) => (x.id === t.id ? n : x)) } : sm })
		}
	}
}
