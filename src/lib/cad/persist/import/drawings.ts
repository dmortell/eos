// File › Import legacy drawings: a FEW chosen legacy drawings brought into cad once, by choice (not a bulk importer).
// Pure: the raw docs (persist/import/legacyDrawings.ts fetches them, read-only) + what the user ticked + the project's
// entities now → the entities to put, in ONE transaction, and notes on what didn't come across.
//  - a Pages model's boxes and walls → shapes on a level (./drawingsPages.ts), on the cad layer of the same name; its
//    opening boxes → holes / doors in the imported walls they sit in;
//  - a Sheets-tool sheet → a cad sheet with its viewport and the viewport's annotations as tied notes (./drawingsSheets.ts);
//    a model3d elevation clipped to a box → a section on that box, and the viewport shows the section. Odd scales snap
//    to the nearest standard one.
// Everything imported is stamped `importedFrom` (shapes, sheets, sections, openings), and a stamped item is skipped next
// time, so importing again adds only what's new.
import type { Id, Level } from '../../domain/types'
import type { Entity, Group, Layer, SectionCut, Sheet, Viewport } from '../../domain/drawing'
import { moveGeometry, type Shape } from '../../domain/shapes'
import { freezeInExisting } from '../../domain/layers'
import { newId } from '../../domain/ids'
import { blankSheet, PAPER, SCALES } from '../../views/sheet'
import { sectionFrame } from '../../views/section'
import { namedFrame, type ElevDir } from '../../domain/conventions'
import { floorOfDocId } from './ctx'
import { LayerPlan, layerName, openingIn, pagesKey, prismShape, wallShape, type PagesModel, type PagesPrism } from './drawingsPages'
import { annLayer, annotationShapes, clipSection, nearestScale, sectionNameFor, viewportOf, type Clip, type LegacySheetDoc, type LegacyVp } from './drawingsSheets'

export type { PagesModel } from './drawingsPages'
export type { LegacySheetDoc } from './drawingsSheets'

export interface DrawingsSource {
	pid: string
	/** Pages models (projects/{pid}/models). */
	models: PagesModel[]
	/** Sheets-tool sheets (projects/{pid}/sheets). */
	sheets: LegacySheetDoc[]
	/** The Sheets tool's model3d models (models3d/{pid}.models): a viewport's `modelId` → its name and layers. */
	models3d: { id: number; name: string; layers?: { id: string; name: string }[] }[]
	/** The Sheets tool's own layers (projects/{pid}.sheetLayers) — an annotation on an unknown layer is on 'annotations'. */
	sheetLayers: { id: string; name?: string }[]
}

/** What the user ticked: which models (and which of their kinds) and sheets, and the cad level each goes on. */
export interface DrawingsChoice {
	models: { id: string; levelId: Id; prism: boolean; wall: boolean }[]
	sheets: { id: string; levelId: Id }[]
}

export interface DrawingsPlan {
	entities: Entity[]
	/** What didn't come across, or came across differently — shown in the dialog. */
	notes: string[]
	counts: { boxes: number; walls: number; openings: number; sheets: number; sections: number; notes: number; layers: string[]; already: number }
}

/** The stamps of everything already imported: entities' `importedFrom`, and the openings inside walls. */
export function importedKeys(entities: Iterable<Entity>): Set<string> {
	const out = new Set<string>()
	for (const e of entities) {
		const k = (e as { importedFrom?: string }).importedFrom
		if (k) out.add(k)
		if (e.type === 'shape' && e.role?.kind === 'wall') for (const o of e.role.openings) if (o.importedFrom) out.add(o.importedFrom)
	}
	return out
}

const r2 = (v: number) => Math.round(v * 100) / 100

/** The Sheets tool's fixed layers. */
const SHEET_LAYERS = ['outlets', 'trunks', 'racks', 'devices', 'rooms', 'ladders', 'cables', 'annotations']
/** A Sheets viewport's hidden fixed layer → the cad layers to freeze in it. */
const FREEZE: Record<string, Id[]> = {
	outlets: ['sys:outlets-low', 'sys:outlets-high'], trunks: ['sys:cont-low', 'sys:cont-high'], racks: ['sys:racks'],
	ladders: ['sys:risers'], background: ['sys:background'],
}

/** The cad level for an Outlets doc id (`{pid}_F33`, `{pid}_F33__3307`): the floor's plan (or that area's); else a
 *  level named for it (`_F3307` → "33F 3307"). */
export function levelForDocId(pid: string, docId: string, levels: Level[]): Id | undefined {
	const f = floorOfDocId(pid, docId)
	if (!f) return undefined
	const exact = levels.find((l) => l.number === f.floor && (l.area ?? undefined) === f.area)
	return exact?.id ?? levelForName(String(f.area ?? f.floor), levels)
}

/** The cad level a legacy name points at: a 3+ digit number in it ("Zone 3303", "3303 office") → the level whose name
 *  or area has it; a shorter one ("33F") → that floor's main plan. */
export function levelForName(name: string, levels: Level[]): Id | undefined {
	const toks = name.match(/\d+/g) ?? []
	for (const t of toks.filter((t) => t.length >= 3)) {
		const l = levels.find((l) => (l.area ?? '').includes(t) || l.name.includes(t))
		if (l) return l.id
	}
	for (const t of toks.filter((t) => t.length < 3)) {
		const l = levels.find((l) => l.number === Number(t) && !l.area)
		if (l) return l.id
	}
	return undefined
}

/** The level a Sheets viewport shows, if it can be told: its Outlets doc's floor, or its model3d model's name. */
export function levelForViewport(src: DrawingsSource, v: LegacyVp, levels: Level[]): Id | undefined {
	if (v.source.kind === 'outlets' && v.source.outletsDocId) return levelForDocId(src.pid, v.source.outletsDocId, levels)
	if (v.source.kind === 'model3d') { const m = src.models3d.find((x) => x.id === v.source.modelId); return m ? levelForName(m.name, levels) : undefined }
	return undefined
}

/** The level a whole sheet suggests: its first viewport that tells, else its title ("3307 Sensaphone", whose viewport
 *  shows an old floor doc, → the 3307 area's plan). */
export function levelForSheet(src: DrawingsSource, s: LegacySheetDoc, levels: Level[]): Id | undefined {
	for (const v of s.viewports ?? []) { const l = levelForViewport(src, v, levels); if (l) return l }
	return s.title ? levelForName(s.title, levels) : undefined
}

/** Build the import (nothing is written). `fit` places a viewport the Sheets tool fitted to its content (cad's own fit);
 *  without it one is centred on its annotations. */
export function planDrawings(src: DrawingsSource, choice: DrawingsChoice, existing: Entity[], o: { makeId?: () => Id; fit?: (vp: Viewport) => Pick<Viewport, 'centre' | 'scale'> } = {}): DrawingsPlan {
	const makeId = o.makeId ?? newId
	const done = importedKeys(existing)
	const levels = existing.filter((e): e is Level => e.type === 'level')
	const layers = new LayerPlan(existing.filter((e): e is Layer => e.type === 'layer'), makeId)
	const out: Entity[] = [], notes: string[] = []
	const counts: DrawingsPlan['counts'] = { boxes: 0, walls: 0, openings: 0, sheets: 0, sections: 0, notes: 0, layers: [], already: 0 }

	// ── Pages models: boxes and walls ──
	for (const c of choice.models) {
		const m = src.models.find((x) => x.id === c.id)
		if (!m || (!c.prism && !c.wall)) continue
		const groups = new Map<string, Group>()
		const left: Record<string, number> = {}
		const leave = (why: string) => { left[why] = (left[why] ?? 0) + 1 }
		// the walls this model's openings can sit in: imported now, or by an earlier import onto this level
		const prefix = `pages:${m.id}:`
		const hosts = new Map<Id, Shape>()
		for (const e of existing) if (e.type === 'shape' && e.role?.kind === 'wall' && e.levelId === c.levelId && e.importedFrom?.startsWith(prefix)) hosts.set(e.id, e)
		const holes: { ob: PagesPrism; key: string; box: () => Shape }[] = []
		;(m.objects ?? []).forEach((ob, i) => {
			if (ob.type !== 'prism' && ob.type !== 'wall') return
			if (!(ob.type === 'prism' ? c.prism : c.wall)) return
			const key = pagesKey(m.id, ob, i)
			if (done.has(key)) { counts.already++; return }
			if (ob.type === 'prism' && (ob.rack || ob.device)) { leave(`${ob.rack ? 'rack' : 'rack device'} box "${ob.label ?? ob.id ?? ''}" (cad has its racks)`); return }
			const lname = layerName(m, ob.layer), color = m.layers?.find((l) => l.id === ob.layer)?.color
			let groupId: Id | undefined
			if (ob.groupId) {
				if (!groups.has(ob.groupId)) groups.set(ob.groupId, { type: 'group', id: makeId(), name: `${m.name} group` })
				groupId = groups.get(ob.groupId)!.id
			}
			const x = () => ({ layerId: layers.resolve(lname, color), groupId, importedFrom: key })
			// an opening waits for every wall to be made, then goes into the one it sits in (else it stays a box)
			if (ob.type === 'prism' && (ob.open || m.layers?.some((l) => l.id === ob.layer && l.opening))) { holes.push({ ob, key, box: () => prismShape(ob, c.levelId, x(), makeId) }); return }
			const s = ob.type === 'prism' ? prismShape(ob, c.levelId, x(), makeId) : wallShape(ob, c.levelId, x(), makeId)
			if (!s) { leave('wall with no segments'); return }
			if (ob.type === 'prism') {
				counts.boxes++
				if (ob.rotX || ob.rotY) leave('tilt (cad boxes stand upright; the box came across upright)')
				if (Math.round(ob.edges ?? 4) !== 4) leave(`${ob.edges}-sided prism (came across as a polygon box)`)
			} else { counts.walls++; hosts.set(s.id, s) }
			out.push(s)
			done.add(key)
		})
		const changed = new Set<Id>()
		let loose = 0
		for (const h of holes) {
			const r = openingIn(h.ob, [...hosts.values()], h.key, makeId)
			if (r) { hosts.set(r.wall.id, r.wall); changed.add(r.wall.id); counts.openings++ }
			else { out.push(h.box()); counts.boxes++; loose++ }
			done.add(h.key)
		}
		// a wall given openings: the one made above, or (from an earlier import) put again with them
		for (const wid of changed) { const k = out.findIndex((e) => e.id === wid); if (k >= 0) out[k] = hosts.get(wid)!; else out.push(hosts.get(wid)!) }
		out.push(...[...groups.values()].filter((g) => out.some((e) => (e as Shape).groupId === g.id)))
		if (loose) notes.push(`${m.name}: ${loose} opening box${loose === 1 ? '' : 'es'} not in an imported wall — came across as plain box${loose === 1 ? '' : 'es'} (tick its walls too, or add the opening with the Opening tool)`)
		for (const [why, n] of Object.entries(left)) notes.push(`${m.name}: ${n} × ${why}`)
	}
	counts.layers = layers.created.map((l) => l.name)

	// a new layer starts frozen in the sheets that already exist (User: issued sheets don't change)
	const sheetsNow = new Map(existing.filter((e): e is Sheet => e.type === 'sheet').map((s) => [s.id, s]))
	const touched = new Set<Id>()
	for (const l of layers.created) for (const s of freezeInExisting([...sheetsNow.values()], l.id)) { sheetsNow.set(s.id, s); touched.add(s.id) }
	if (touched.size && layers.created.length) notes.push(`New layer${layers.created.length > 1 ? 's' : ''} ${counts.layers.join(', ')} — frozen in the viewports of the ${touched.size} existing sheet${touched.size > 1 ? 's' : ''} (thaw per viewport)`)

	// ── Sheets-tool sheets ──
	const known = new Set([...SHEET_LAYERS, ...src.sheetLayers.map((l) => l.id)])
	const allSheets = [...sheetsNow.values()]
	const sections = existing.filter((e): e is SectionCut => e.type === 'section')
	/** The section a clipped model3d elevation becomes: the one an earlier import made for it, else a new one named from
	 *  its sheet. `du` = named-elevation view x → the section's. */
	const sectionFor = (dir: ElevDir, clip: Clip, levelId: Id, skey: string, title: string): { sec: SectionCut; du: number; reused: boolean; turned: boolean } => {
		const had = sections.find((s) => s.importedFrom === skey)
		if (had) {
			// its u starts at its frame's origin; that is a plain shift of the elevation's only while it runs the same way
			const { f } = sectionFrame(had), t = namedFrame(dir).t
			return { sec: had, du: -(f.o.x * f.t.x + f.o.y * f.t.y) || 0, reused: true, turned: Math.abs(f.t.x - t.x) > 1e-9 || Math.abs(f.t.y - t.y) > 1e-9 }
		}
		const cs = clipSection(dir, clip)
		const taken = new Set(sections.filter((s) => s.levelId === levelId).map((s) => s.name))
		const sec: SectionCut = { type: 'section', id: makeId(), levelId, name: sectionNameFor(title, taken), a: cs.a, b: cs.b, depth: cs.depth, importedFrom: skey }
		sections.push(sec)
		out.push(sec)
		counts.sections++
		return { sec, du: cs.du, reused: false, turned: false }
	}
	for (const c of choice.sheets) {
		const d = src.sheets.find((x) => x.id === c.id)
		if (!d) continue
		const key = `sheets:${d.id}`, name = d.title || d.drawingNumber || d.id
		if (done.has(key)) { counts.already++; continue }
		const blank = blankSheet(allSheets, makeId())
		const number = d.drawingNumber?.trim() || blank.number
		if (d.drawingNumber?.trim() && allSheets.some((s) => s.number === number)) notes.push(`${name}: sheet number ${number} is already used — renumber one of them`)
		const size = d.paper?.paperSize && d.paper.paperSize in PAPER ? (d.paper.paperSize as Sheet['paper']['size']) : 'A3'
		const sheet: Sheet = {
			...blank, title: d.title || 'Imported sheet', number, importedFrom: key, placeId: c.levelId,
			paper: { size, orientation: d.paper?.orientation === 'portrait' ? 'portrait' : 'landscape', marginMm: d.paper?.margins ?? blank.paper.marginMm },
			...titleBlockOf(d), ...revisionsOf(d),
		}
		const skipped: Record<string, number> = {}
		const skip = (why: string, n = 1) => { skipped[why] = (skipped[why] ?? 0) + n }
		const vps = d.viewports ?? []
		const clipped = vps.filter((v) => v.source.kind === 'model3d' && v.source.clip).length
		for (const v of vps) {
			const levelId = vps.length > 1 ? levelForViewport(src, v, levels) ?? c.levelId : c.levelId
			const r = viewportOf(v, levelId, makeId(), { frozen: frozenOf(src, v, layers), fit: o.fit })
			if ('skip' in r) { skip(r.skip); continue }
			// the notes keep the sizes they were drawn at (the Sheets tool's 1:N), whatever scale the viewport ends at
			const den = r.vp.scale
			let vp = r.vp, du = 0
			const spec = vp.view.spec
			if (v.source.kind === 'model3d' && v.source.clip && spec.kind === 'elevation') {
				// a clipped elevation → a section on its clip box; the view (and so its notes) shifts by du along u
				const title = clipped > 1 ? `${d.title || name} ${spec.dir}` : d.title || name
				const cut = sectionFor(spec.dir, v.source.clip, levelId, `${key}:${v.id}`, title)
				du = cut.du
				vp = { ...vp, view: { levelId: cut.sec.levelId, spec: { kind: 'section', sectionId: cut.sec.id } }, centre: { x: r2(vp.centre.x + du), y: vp.centre.y } }
				if (cut.reused) notes.push(`${name}: uses section ${cut.sec.name}, made by an earlier import${cut.turned ? ' and changed since — check the notes still line up' : ''}`)
			}
			if (!SCALES.includes(vp.scale)) {
				const s = nearestScale(vp.scale)
				notes.push(`${name}: scale 1:${vp.scale} → 1:${s}, the nearest standard scale (centred on the same point)`)
				vp = { ...vp, scale: s }
			}
			sheet.viewports.push(vp)
			if (r.fitted) notes.push(`${name}: the viewport was fitted to its content in the Sheets tool — placed by cad's fit (1:${vp.scale}); check the annotations still line up`)
			const lyrMeta = v.source.kind === 'model3d' ? new Set((src.models3d.find((m) => m.id === v.source.modelId)?.layers ?? []).map((l) => l.id)) : new Set<string>()
			for (const a of v.annotations ?? []) {
				const lyr = lyrMeta.has(a.layerId ?? '') ? a.layerId! : annLayer(a, known)
				if (v.layerOverrides?.[lyr]?.hidden) { skip('annotation on a layer hidden in the viewport'); continue }
				const res = annotationShapes(a, { sheetId: sheet.id, vpId: vp.id }, den, `${key}:${a.id}`, makeId)
				if (res.skip) skip(res.skip)
				out.push(...(du ? res.shapes.map((s) => ({ ...s, geom: moveGeometry(s.geom, { x: du, y: 0 }) })) : res.shapes))
				counts.notes += res.shapes.length
			}
		}
		if (!sheet.viewports.length) notes.push(`${name}: no viewport could come across — the sheet is empty`)
		for (const [why, n] of Object.entries(skipped)) notes.push(`${name}: left out ${n} × ${why}`)
		out.push(sheet)
		allSheets.push(sheet)
		counts.sheets++
		done.add(key)
	}

	const entities = [...layers.created, ...[...touched].map((id) => sheetsNow.get(id)!), ...out]
	return { entities, notes, counts }
}

/** A Sheets viewport's hidden layers → the cad layers frozen in it (the Outlets tool's fixed ones; a model3d model's
 *  by name; the floorplan when its PDF was off). */
function frozenOf(src: DrawingsSource, v: LegacyVp, layers: LayerPlan): Id[] {
	const out = new Set<Id>()
	const meta = v.source.kind === 'model3d' ? src.models3d.find((m) => m.id === v.source.modelId)?.layers ?? [] : []
	for (const [id, ov] of Object.entries(v.layerOverrides ?? {})) {
		if (!ov?.hidden) continue
		for (const f of FREEZE[id] ?? []) out.add(f)
		const own = layers.find(meta.find((l) => l.id === id)?.name)
		if (own) out.add(own)
	}
	if (v.source.kind === 'outlets' && v.source.showPdf === false) out.add('sys:background')
	return [...out]
}

/** The Sheets title block's per-sheet fields → cad's (null = "use the project's" → left out); hidden stays hidden.
 *  Its date is the current revision's (revisionsOf) — a stored date field would print over every later revision's
 *  date; only a sheet with no revisions keeps it as a field. */
function titleBlockOf(d: LegacySheetDoc): Pick<Sheet, 'titleBlock'> {
	if (d.titleBlock === null) return { titleBlock: { hidden: true } }
	const map: Record<string, string> = { drawnBy: 'drawn', checkedBy: 'checked', approvedBy: 'approved', ...(hasRevisions(d) ? {} : { date: 'date' }) }
	const fields = Object.fromEntries(Object.entries(d.titleBlock?.fields ?? {}).filter(([k, v]) => map[k] && v).map(([k, v]) => [map[k], v as string]))
	return Object.keys(fields).length ? { titleBlock: { fields } } : {}
}

const hasRevisions = (d: LegacySheetDoc) => (d.revisions ?? []).some((r) => r?.code) || !!d.currentRevision?.trim()

function revisionsOf(d: LegacySheetDoc): Pick<Sheet, 'revisions'> {
	const revs = (d.revisions ?? []).filter((r) => r?.code).map((r) => ({ code: r.code, date: r.date ?? '', ...(r.note ? { note: r.note } : {}), ...(r.by ? { by: r.by } : {}) }))
	if (!revs.length && d.currentRevision?.trim()) revs.push({ code: d.currentRevision.trim(), date: '' })
	// the title block's date belongs to the current revision when that has none
	const date = d.titleBlock?.fields?.date?.trim(), last = revs.at(-1)
	if (date && last && !last.date) last.date = date
	return revs.length ? { revisions: revs } : {}
}
