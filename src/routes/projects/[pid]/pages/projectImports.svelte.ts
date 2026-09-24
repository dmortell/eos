// Phase 8 IMPORTS, moved out of pagesProject.svelte.ts: a Sheets-tool sheet → a Pages sheet (store/sheetsImport.ts),
// another tool's register drawing → a one-frame Pages sheet, and a Risers-tool doc → the building model
// (store/risersImport.ts). Plus the lookups they share — which Pages model shows an Outlets doc / holds a
// riser's geometry, and the layer imported annotations go on. Reaches the project through PagesProject and the
// workspace through the same ProjectHost.
import { newId } from './ids'
import { viewState } from './viewState.svelte'
import { models, modelById, modelForPlace } from './3dview/models.svelte'
import type { Model, Storey } from './3dview/types'
import { outletsDocIdFor } from './store/outletsImport'
import { normFloors, findNodePath } from './projectTree'
import { importSheetDoc, type SheetImportResult } from './store/sheetsImport'
import { risersToBuilding, mergeRisers, riserFloors, floorLabel, stackFloors, riserPrefix, type RisersDocIn } from './store/risersImport'
import type { SheetDoc, SheetViewport } from '../sheets/types'
import { PAPER_SIZES } from './constants'
import { commonAncestor } from './store/placeTree'
import type { PagesProject, ProjectHost, LegacySheetRow } from './pagesProject.svelte'

export type RiserDoc = RisersDocIn & { id: string }
/** The legacy (pre per-riser-id) riser object ids. */
const LEGACY_RISER_ID = /^rsr-(room|lad|cab)-/

export class ProjectImports {
	#p: PagesProject
	#h: ProjectHost
	constructor(project: PagesProject, host: ProjectHost) { this.#p = project; this.#h = host }

	/** The Pages model showing an Outlets-tool doc: the model of a place whose outlets doc it is (the fullest one
	 *  when several places share it, e.g. a floor and its legacy zone); null = none yet. */
	modelForOutlets = (docId: string): Model | null => {
		const ps = this.#p.store; if (!ps) return null
		const floors = normFloors(this.#p.src?.project?.floors)
		const cands = ps.places.filter((p) => outletsDocIdFor(ps.pid, p.legacy, floors) === docId)
			.map((p) => modelForPlace(p.id)).filter((m): m is Model => !!m && !m.archived)
		return cands.sort((a, b) => (b.shapes?.length ?? 0) - (a.shapes?.length ?? 0))[0] ?? null
	}
	/** The layer imported annotations / text go on: the model's Annotations layer (`anno` in the default stack),
	 *  else its first non-background layer. (Sheets' own annotation layer ids aren't carried over.) */
	layerFor = (m: Model, _sheetsLayerId?: string) => {
		const ls = m.layers ?? [], has = (x: string) => ls.some((l) => l.id === x)
		return has('anno') ? 'anno' : has('annotations') ? 'annotations' : ls.find((l) => l.group !== 'Background')?.id
	}
	/** The colour a Sheets annotation without its own drew in: the project's annotation default, else Sheets'
	 *  built-in red (sheets/annotations/AnnotationLayer.svelte). */
	#annColor = () => (this.#p.src?.project as { annotationDefaults?: { color?: string } } | null)?.annotationDefaults?.color ?? '#dc2626'
	/** The building model holding this riser's imported geometry (its `rsr-<id>-` objects; or, imported before
	 *  per-riser ids, any `rsr-` objects), or null. */
	modelForRisers = (docId: string): Model | null => {
		const stored = (m: Model) => !m.archived && m.kind === 'building' && !!this.#p.store?.models.some((x) => x.id === m.id)
		return models.find((m) => stored(m) && m.objects.some((o) => o.id?.startsWith(riserPrefix(docId))))
			?? models.find((m) => stored(m) && m.objects.some((o) => LEGACY_RISER_ID.test(o.id ?? ''))) ?? null
	}
	/** A riser doc as loaded (for its hidden floors / range), or null. */
	riserDoc = (id: string) => ((this.#p.src?.risers ?? []) as unknown as RiserDoc[]).find((d) => d.id === id) ?? null
	#ctx = () => ({ newId, modelForOutlets: this.modelForOutlets, modelForRisers: this.modelForRisers, riserDoc: this.riserDoc, layerFor: this.layerFor, defaultColor: this.#annColor() })

	// ── Sheets-tool sheets + register drawings → Pages sheets ──
	/** The Sheets tool's sheets (for the dialog's Import tab), with the Pages sheet each was imported as. */
	legacySheets = async (): Promise<LegacySheetRow[]> => {
		const db = this.#h.db, ps = this.#p.store; if (!db || !ps) return []
		const docs = (await db.getMany(`projects/${ps.pid}/sheets`)) as unknown as SheetDoc[]
		const floors = normFloors(this.#p.src?.project?.floors)
		// the place a sheet most likely belongs to: the one whose outlets doc its first outlets viewport shows
		const guess = (s: SheetDoc) => {
			const v = s.viewports?.find((x) => x.source.kind === 'outlets'), doc = v?.source.kind === 'outlets' ? v.source.outletsDocId : null
			const m = doc ? this.modelForOutlets(doc) : null
			return m?.placeId ?? (doc ? ps.places.find((p) => outletsDocIdFor(ps.pid, p.legacy, floors) === doc)?.id : undefined) ?? null
		}
		return docs.filter((s) => !s.link).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)).map((s) => ({
			id: s.id, title: s.title, number: s.drawingNumber ?? '',
			viewports: (s.viewports ?? []).map((v) => v.source.kind),
			importedAs: ps.sheets.find((x) => x.importedFrom === `sheets/${s.id}` && x.status !== 'archived')?.title,
			placeId: guess(s),
		}))
	}
	/** Import one Sheets-tool sheet into a new Pages sheet filed under `placeId` (drawings-plan §6): frames on the
	 *  place models of their outlets docs, annotations as frame-scoped shapes (one undo step), the rest unmapped.
	 *  Returns the notes about what didn't map (empty = everything did). */
	importLegacySheet = async (legacyId: string, placeId: string | null): Promise<string[]> => {
		const db = this.#h.db, ps = this.#p.store; if (!db || !ps || ps.status !== 'ready') return ['Still loading — try again in a moment']
		const src = (await db.getOne(`projects/${ps.pid}/sheets`, legacyId)) as unknown as SheetDoc | null
		if (!src) return [`Sheet ${legacyId} not found`]
		return this.#createImported(importSheetDoc(src, this.#ctx()), placeId, `sheets/${legacyId}`)
	}
	/** A register drawing of another tool (a tree leaf, `d:<id>`) → a Pages sheet in its place with ONE full-page
	 *  frame of the place model (an outlets view), else an unmapped frame. */
	importRegisterDrawing = async (leafId: string): Promise<string[]> => {
		const ps = this.#p.store, d = this.#p.src?.drawings.find((x) => `d:${x.id}` === leafId); if (!ps || !d) return ['Drawing not found']
		const tree = this.#p.realTree, hit = tree ? findNodePath(tree.tree, { id: leafId }) : null
		const placeId = [...(hit?.ancestors ?? [])].reverse().find((a) => a.place)?.id ?? null
		const size = ps.project?.settings?.paperSize ?? 'A3', [pw, ph] = PAPER_SIZES[size], m = 10
		const source: SheetViewport['source'] = d.toolType === 'outlets' ? { kind: 'outlets', outletsDocId: d.sourceDocId ?? '' }
			: d.toolType === 'racks' ? { kind: 'racks', racksDocId: d.sourceDocId ?? '', face: 'front' }
			: d.toolType === 'risers' ? { kind: 'risers', risersDocId: d.sourceDocId ?? '' } : { kind: 'empty' }
		// one Fit viewport filling the paper left of the title-block strip (16 % of the width)
		const doc: SheetDoc = { id: d.id, projectId: ps.pid, title: d.title ?? d.id, drawingNumber: d.drawingNumber, sortOrder: 0,
			paper: { paperSize: size as 'A3', orientation: 'landscape', drawingOffset: { x: 0, y: 0 }, scale: 100, showPaper: false, margins: m },
			viewports: [{ id: 'v1', x: m, y: m, w: Math.round(pw * 0.84 - 2 * m), h: ph - 2 * m, source }] }
		const r = importSheetDoc(doc, this.#ctx())
		if (source.kind === 'empty') {   // a tool Pages has no model kind for (frames, patching, …): name it
			const what = `${d.toolType ?? 'drawing'} · ${d.sourceDocId ?? d.id}`
			r.frames[0].source = what
			r.notes = [`The frame shows ${what} — not mapped: no Pages model for it yet`]
		}
		return this.#createImported(r, placeId, `drawings/${d.id}`)
	}
	#createImported(r: SheetImportResult, placeId: string | null, from: string): string[] {
		const ps = this.#p.store!
		const shapeCount = Object.values(r.shapes).reduce((n, a) => n + a.length, 0)
		if (shapeCount) {
			this.#h.ensureHist()
			for (const [mid, ents] of Object.entries(r.shapes)) { const m = modelById(mid); if (m) m.shapes = [...(m.shapes ?? []), ...ents] }
			this.#h.pushStep(this.#h.activeTabId() ?? '', `Import “${r.title}”`)
		}
		const d = ps.createSheet({ title: r.title, placeId })
		ps.saveSheet({ ...d, drawingNumber: r.drawingNumber, paper: r.paper, sheetSize: r.paper.size, frames: r.frames, importedFrom: from })
		// open it behind the dialog (which stays open to show the notes)
		this.#p.loadSheet(d.id); this.#h.session.treeNode = null
		this.#h.openDrawing({ title: r.title, kind: 'sheet', preview: false, docId: 'sheet:' + d.id })
		this.#h.toast(`Imported “${r.title}”: ${r.frames.length} frame${r.frames.length === 1 ? '' : 's'}, ${shapeCount} annotation${shapeCount === 1 ? '' : 's'}${r.notes.length ? ` — ${r.notes.length} note${r.notes.length === 1 ? '' : 's'}` : ''}`)
		return r.notes
	}

	// ── Risers-tool docs → the building model ──
	/** A Risers-tool doc → the BUILDING model of the place that holds its floors (created if needed): storeys +
	 *  rooms / ladders / cables (store/risersImport.ts), one undo step; each floor place's model then references
	 *  its storey (`levelRef` + a cached copy of its `levels`). Re-importing replaces what was imported. */
	importRisers = async (riserId: string): Promise<string[]> => {
		const db = this.#h.db, ps = this.#p.store; if (!db || !ps || ps.status !== 'ready') return ['Still loading — try again in a moment']
		const d = (await db.getOne('risers', riserId)) as unknown as (RiserDoc & { name?: string }) | null
		if (!d) return [`Riser ${riserId} not found`]
		const floors = riserFloors(d, this.#p.projectStack()?.skipped ?? [])
		const floorPlaces = ps.places.filter((p) => p.legacy?.floor != null && p.legacy.area == null && p.legacy.room == null && p.legacy.row == null && floors.includes(p.legacy.floor))
		const home = floorPlaces.length > 1 ? commonAncestor(ps.places, floorPlaces) : floorPlaces[0]?.parentId ? ps.places.find((p) => p.id === floorPlaces[0].parentId) ?? null : null
		if (!home) return ['No place holds these floors — set up places first (the building model needs one)']
		const mid = this.#p.ensurePlaceModel(home.id), m = mid ? modelById(mid) : undefined
		if (!m) return ["Couldn't create the building model"]
		this.#h.ensureHist()
		const r = this.applyRisers(d, m, home.id)
		// the floor models take their levels from the building (drawings-plan: building = source of truth)
		const linked = this.#p.linkFloorModels(m)
		this.#h.pushStep(this.#h.activeTabId() ?? '', `Import risers into ${m.name}`)
		this.#p.openPlaceModel(home.id, false)
		const s = this.#h.session, p = s.panes[s.focused]
		if (p) viewState.setProj(p.id, this.#h.didOf(p.activeId), 'front')   // a riser reads as an elevation
		this.#h.toast(`Risers → ${m.name}: ${r.storeys.length} storeys, ${r.objects.length} objects${linked ? `; ${linked} floor model${linked === 1 ? '' : 's'} now take their levels from it` : ''}`)
		return r.notes
	}
	/** Merge a riser doc into building model `m` with storeys for the building's WHOLE stack (its place's floors,
	 *  else the project's) plus the riser's own floors if outside it. No history step (the caller's). */
	applyRisers(d: RiserDoc, m: Model, homeId: string, keepLabels = false, storeys?: Storey[]) {
		const st = this.#p.stackOf(homeId), skip = new Set(st?.skipped ?? [])
		const own = riserFloors(d, [...skip])
		const all = [...new Set([...(st ? stackFloors(st) : []), ...own])].sort((a, b) => a - b)
		// `storeys` = build on the building's own (edited) heights; none = the riser's heights (an explicit import)
		const r = risersToBuilding(d, all, { riserId: d.id, layerIds: (m.layers ?? []).map((l) => l.id), storeys, textLayer: this.layerFor(m) })
		const merged = mergeRisers($state.snapshot(m) as Model, r, d.id, { keepLabels })
		m.objects = merged.objects; m.shapes = merged.shapes; m.storeys = merged.storeys; m.layers = merged.layers; m.kind = 'building'
		return r
	}
	/** The loaded riser docs (ProjectSource keeps the whole docs) whose geometry a building holds — by the
	 *  per-riser id prefix, or (imported before that) any riser with content overlapping its storeys. */
	risersOf(m: Model): RiserDoc[] {
		const docs = (this.#p.src?.risers ?? []) as unknown as RiserDoc[]
		const ids = m.objects.map((o) => o.id ?? '')
		const keyed = docs.filter((d) => ids.some((i) => i.startsWith(riserPrefix(d.id))))
		if (keyed.length || !ids.some((i) => LEGACY_RISER_ID.test(i))) return keyed
		const names = new Set((m.storeys ?? []).map((s) => s.name))
		return docs.filter((d) => (d.rooms?.length || d.ladders?.length) && riserFloors(d).some((n) => names.has(floorLabel(n)))).slice(0, 1)
	}
}
