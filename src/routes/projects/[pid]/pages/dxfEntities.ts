// DXF entities @tarikjabiri/dxf doesn't write correctly, for the Pages DXF export (exportDxf.ts, O16 / O17 / O15):
//   ATTDEF / ATTRIB  the library's pair can't be INVISIBLE (70 is hard-coded 0), has no prompt, and its addAttrib
//                    writes a SEQEND after EVERY attribute (an insert with two attributes → a broken sequence) —
//                    AttEnt + addAttribs write one SEQEND after the last one.
//   DIMENSION        the library writes no geometry block (group 2), so a viewer that doesn't regenerate
//                    dimensions (most non-Autodesk ones) shows nothing — DimEnt references an anonymous *D block
//                    the exporter fills with the dimension as the viewport draws it (lines, heads, figure); a CAD
//                    app that recomputes it uses the PAGES dimstyle (sized at the viewport's 1:N).
//   IMAGE objects    every addImage adds another ACAD_IMAGE_DICT entry to the root dictionary (duplicate keys with
//                    2+ images), its IMAGEDEF_REACTORs have no owner, and the CLASSES section is empty (AutoCAD
//                    needs IMAGE / IMAGEDEF / … class records to read them) — fixImageObjects repairs them.
// Checked against ezdxf's recover + audit (no errors / fixes for blocks, attributes, dimensions, images).
//   STYLE            no entity lineweight option at all (group 370) and a hard-coded 0.00 mm on every LAYER —
//                    styleEntities / layerLineweights write them (colour: the entity's own ACI + true colour).
import { SeqEnd, BlockFlags, DxfRasterVariables, type CommonEntityOptions, type DxfWriter, type DxfBlock, type Dxfier, type Insert, type vec3_t, type EntitiesManager } from '@tarikjabiri/dxf'
import { hexToAci } from '../sheets/dxf/dxf'
import { ownLw, isByLayer } from './ui/lineweight'
import type { Ent } from './ui/geometry'

// The library doesn't export its Entity base class (neither the class nor its type) — every entity class extends
// it, so take it from one that is exported, typed by what addEntity accepts.
type Entity = Parameters<EntitiesManager['addEntity']>[0]
const EntityBase = Object.getPrototypeOf(SeqEnd) as abstract new (type: string, subclassMarker?: string, options?: CommonEntityOptions) => Entity

/** A DXF tag: no spaces, upper case (AutoCAD's ATTDEF rule). */
export const attTag = (t: string) => (t || 'TAG').trim().replace(/\s+/g, '_').toUpperCase()

type AttOpts = { layerName?: string; rotation?: number; center?: boolean; invisible?: boolean; prompt?: string }
/** ATTDEF (inside a BLOCK: the attribute's tag, default value, prompt) or ATTRIB (after an INSERT: its value). */
export class AttEnt extends EntityBase {
	constructor(readonly kind: 'ATTDEF' | 'ATTRIB', readonly at: vec3_t, readonly height: number, readonly tag: string, readonly value: string, readonly o: AttOpts = {}) {
		super(kind, 'AcDbText', { layerName: o.layerName })
	}
	protected dxfyChild(dx: Dxfier) {
		dx.point3d(this.at)
		dx.push(40, this.height)
		dx.primaryText(this.value)
		if (this.o.rotation) dx.push(50, this.o.rotation)
		dx.textStyle('STANDARD')
		if (this.o.center) { dx.push(72, 1); dx.point3d(this.at, 1) }   // centred on its baseline: 11 = the alignment point
		dx.subclassMarker(this.kind === 'ATTDEF' ? 'AcDbAttributeDefinition' : 'AcDbAttribute')
		dx.push(280, 0)
		if (this.kind === 'ATTDEF') dx.push(3, this.o.prompt ?? this.tag)
		dx.push(2, attTag(this.tag))
		dx.push(70, this.o.invisible ? 1 : 0)
	}
}

/** An INSERT's ATTRIBs, owned by it, then ONE SEQEND (flags the insert "attributes follow"). */
export function addAttribs(out: EntitiesManager, ins: Insert, atts: { at: vec3_t; height: number; tag: string; value: string; o?: AttOpts }[]) {
	if (!atts.length) return
	ins.attributesFollowFlag = 1
	for (const a of atts) out.addEntity(new AttEnt('ATTRIB', a.at, a.height, a.tag, a.value, a.o)).ownerBlockRecord = ins.handle
	out.addEntity(new SeqEnd()).ownerBlockRecord = ins.handle
}

/** An ALIGNED DIMENSION (type 1) measuring p1 → p2 (the extension-line origins), its dimension line through `defPt`,
 *  its figure at `textPt`; `block` = the anonymous *D block holding its drawn geometry (+32 "referenced by this
 *  dimension only", +128 "text at a user-defined position" — as AutoCAD writes a moved figure). `text` = the
 *  override ('<>' = the measured value); undefined = the measurement. */
export class DimEnt extends EntityBase {
	/** `o.rotated` (degrees): a ROTATED / linear dimension (type 0 — horizontal 0°, vertical 90°) measuring along that
	 *  angle instead of an aligned one. */
	constructor(readonly p1: vec3_t, readonly p2: vec3_t, readonly defPt: vec3_t, readonly textPt: vec3_t,
		readonly o: { block?: string; text?: string; style?: string; measured?: number; layerName?: string; rotated?: number } = {}) {
		super('DIMENSION', 'AcDbDimension', { layerName: o.layerName })
	}
	protected dxfyChild(dx: Dxfier) {
		const rotated = this.o.rotated != null
		dx.push(2, this.o.block)
		dx.point3d(this.defPt)
		dx.point3d(this.textPt, 1)
		dx.push(70, (rotated ? 0 : 1) | (this.o.block ? 32 : 0) | 128)
		dx.push(71, 5)   // attachment: middle-centre
		dx.push(42, this.o.measured)
		dx.push(1, this.o.text)
		dx.push(3, this.o.style ?? 'Standard')
		dx.subclassMarker('AcDbAlignedDimension')
		dx.point3d(this.p1, 3)
		dx.point3d(this.p2, 4)
		// the measured direction: AutoCAD ignores 50 on an aligned dim, but readers that measure every linear dim
		// along 50 (ezdxf) would otherwise read a vertical one as 0
		dx.push(50, rotated ? this.o.rotated : (Math.atan2(this.p2.y - this.p1.y, this.p2.x - this.p1.x) * 180) / Math.PI)
		if (rotated) dx.subclassMarker('AcDbRotatedDimension')
	}
}

/** A fresh anonymous block (`*D1`, `*U2`, …) — AutoCAD's convention for a dimension's / a group's geometry. */
export function anonBlock(w: DxfWriter, kind: 'D' | 'U', n: number): DxfBlock {
	const b = w.document.blocks.addBlock(`*${kind}${n}`, w.document.objects, false)   // (w.addBlock strips the '*')
	b.flags = BlockFlags.AnonymousBlock
	return b
}

/** The dimstyle for a viewport at 1:N — sizes in PAPER mm (× DIMSCALE N), like the viewport draws them; figures in
 *  whole mm, aligned with the line, above it. `tick` = architectural ticks instead of arrows. Idempotent. */
export function pagesDimStyle(w: DxfWriter, N: number, tick: boolean): string {
	const name = `PAGES_1_${Math.round(N)}${tick ? '_TICK' : ''}`
	if (w.tables.dimStyleTable.records.some((r) => r.name === name)) return name
	const s = w.addDimStyle(name)
	Object.assign(s, { DIMSCALE: N, DIMTXT: 2.5, DIMASZ: 3.5, DIMTSZ: tick ? 1.75 : 0, DIMEXO: 1, DIMEXE: 1.5, DIMGAP: 1, DIMTAD: 1, DIMTIH: 0, DIMTOH: 0, DIMDEC: 0, DIMLUNIT: 2, DIMZIN: 8 })
	return name
}

// CLASS records for the raster-image objects (DXF name, C++ class, app, proxy flags, was-a-proxy, is-an-entity) —
// the values AutoCAD / ezdxf write.
const IMAGE_CLASSES: [string, string, number, number][] = [
	['IMAGE', 'AcDbRasterImage', 2175, 1],
	['IMAGEDEF', 'AcDbRasterImageDef', 0, 0],
	['IMAGEDEF_REACTOR', 'AcDbRasterImageDefReactor', 1, 0],
	['RASTERVARIABLES', 'AcDbRasterVariables', 0, 0],
]
type Dict = { handle: string; ownerObjecthandle: string; entries: { name: string; entryObjectHandle: string }[] }
type ImgDef = { type: string; handle: string; ownerObjecthandle: string; acadImageDictHandle: string; imageHandle?: string }
/** Repairs the library's image bookkeeping (see the file header): ONE ACAD_IMAGE_DICT holding every IMAGEDEF, an
 *  ACAD_IMAGE_VARS RASTERVARIABLES object, and the CLASSES records. Call once, after the last addImage. */
export function fixImageObjects(w: DxfWriter) {
	const objs = w.document.objects, root = objs.root as unknown as Dict, list = objs.objects as unknown as (Dict & ImgDef)[]
	const dictRefs = root.entries.filter((e) => e.name === 'ACAD_IMAGE_DICT')
	if (!dictRefs.length) return
	const dicts = dictRefs.map((r) => list.find((o) => o.handle === r.entryObjectHandle)).filter((d): d is Dict & ImgDef => !!d)
	const [keep, ...rest] = dicts
	for (const d of rest) {
		keep.entries.push(...d.entries)
		list.splice(list.indexOf(d), 1)
	}
	root.entries.splice(0, root.entries.length, ...root.entries.filter((e) => e.name !== 'ACAD_IMAGE_DICT'), { name: 'ACAD_IMAGE_DICT', entryObjectHandle: keep.handle })
	for (const o of list) {
		if (o.type === 'IMAGEDEF') { o.ownerObjecthandle = keep.handle; o.acadImageDictHandle = keep.handle }
		if (o.type === 'IMAGEDEF_REACTOR' && o.imageHandle) o.ownerObjecthandle = o.imageHandle   // owned by its IMAGE (the lib leaves 0 — ezdxf's audit deletes it)
	}
	if (!root.entries.some((e) => e.name === 'ACAD_IMAGE_VARS')) {
		const rv = objs.addObject(new DxfRasterVariables())
		rv.ownerObjecthandle = root.handle
		root.entries.push({ name: 'ACAD_IMAGE_VARS', entryObjectHandle: rv.handle })
	}
	w.document.classes.dxfy = (dx: Dxfier) => {
		dx.start('CLASSES')
		for (const [name, cpp, flags, ent] of IMAGE_CLASSES) {
			dx.type('CLASS'); dx.push(1, name); dx.push(2, cpp); dx.push(3, 'ISM'); dx.push(90, flags); dx.push(91, 0); dx.push(280, 0); dx.push(281, ent)
		}
		dx.end()
	}
}

// ── OBJECT STYLE (ui/lineweight.ts): colour + lineweight per entity, lineweight per layer ──
/** DXF group 370 codes: hundredths of a mm, or these. */
export const DXF_LW = { byLayer: -1, byBlock: -2, default: -3 } as const
/** A lineweight (mm) as a 370 value. */
export const dxfLw = (mm: number) => Math.round(mm * 100)
/** An entity's DXF colour / lineweight: `aci` (62; 0 = BYBLOCK, absent = BYLAYER), `rgb` (420, the exact colour), `lw` (370). */
export type EntStyleDxf = { aci?: number; rgb?: number; lw: number }

const hex6 = (c: string): string | null => {
	const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c.trim()); if (!m) return null
	return '#' + (m[1].length === 3 ? [...m[1]].map((x) => x + x).join('') : m[1]).toLowerCase()
}
/** A Pages shape's DXF style: an own colour → its nearest ACI + its exact RGB; ByLayer → none (BYLAYER, the default).
 *  Lineweight: its own (`lw` / a legacy `weight`, mm) or BYLAYER. `inBlock` = a BLOCK definition's shape: 'byblock'
 *  colour → BYBLOCK, no lineweight → BYBLOCK (it takes the insert's, as blocks.ts byBlock draws it). */
export function dxfEntStyle(e: Pick<Ent, 'color' | 'lw' | 'weight'>, inBlock = false): EntStyleDxf {
	const out: EntStyleDxf = { lw: DXF_LW.byLayer }
	const c = e.color, hex = c && !isByLayer(c) ? hex6(c) : null
	if (inBlock && c?.toLowerCase() === 'byblock') out.aci = 0
	else if (hex) { out.aci = hexToAci(hex); out.rgb = parseInt(hex.slice(1), 16) }
	const lw = ownLw(e)
	out.lw = lw !== undefined ? dxfLw(lw) : inBlock ? DXF_LW.byBlock : DXF_LW.byLayer
	return out
}

/** Run `body` with one Dxfier method swapped (restored after, even on a throw). */
function withDx<K extends 'push' | 'visibilty'>(dx: Dxfier, k: K, fn: Dxfier[K], body: () => void) {
	const own = Object.prototype.hasOwnProperty.call(dx, k), orig = dx[k]
	dx[k] = fn
	try { body() } finally { if (own) dx[k] = orig; else delete (dx as Partial<Dxfier>)[k] }
}
/** Colour + lineweight onto the entities `out` gained since index `from` (the writers only set their layer). 370 is
 *  written in the entity's AcDbEntity section, right after its visibility (60) — the library has no field for it. */
export function styleEntities(out: EntitiesManager, from: number, s: EntStyleDxf) {
	for (const ent of out.entities.slice(from)) {
		if (s.aci !== undefined) ent.colorNumber = s.aci
		if (s.rgb !== undefined) ent.trueColor = String(s.rgb)
		const dxfy = ent.dxfy.bind(ent), lw = s.lw
		ent.dxfy = (dx: Dxfier) => {
			const vis = dx.visibilty
			let done = false
			withDx(dx, 'visibilty', (v?: boolean) => { vis.call(dx, v); if (!done) { done = true; dx.push(370, lw) } }, () => dxfy(dx))
		}
	}
}
/** Every LAYER's lineweight (370): `lw` by layer name (mm), else DEFAULT — the library writes 0.00 mm on all. */
export function layerLineweights(w: DxfWriter, lw: Map<string, number>) {
	for (const r of w.tables.layerTable.records) {
		const v = lw.has(r.name) ? dxfLw(lw.get(r.name)!) : DXF_LW.default, dxfy = r.dxfy.bind(r)
		r.dxfy = (dx: Dxfier) => {
			const push = dx.push
			withDx(dx, 'push', (code: number, value?: unknown) => push.call(dx, code, (code === 370 ? v : value) as never), () => dxfy(dx))
		}
	}
}
