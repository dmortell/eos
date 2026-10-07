// Display list → DXF (analysis §6.6: one display list feeds screen, print and DXF, so the export is what you see).
// Plan mm in; DXF is y-UP, so y is negated. Banded prims (trunks, walls) become LWPOLYLINEs with their real constant
// width. Layers come from the prim's class. Images (PDF underlays) are not exported — the result lists them.
// BLOCKS (backlog "DXF blocks as BLOCK + INSERT"): given the block library, every placed block (an outlet's symbol, an
// insert — prims carrying `ins`) goes out as ONE INSERT of a BLOCK written once, its {TAG} texts as ATTDEF / ATTRIB, so
// AutoCAD can count them. A hidden attribute is written empty (the writer can't set the invisible flag).
import { DxfWriter, LWPolylineFlags, Units, point2d, point3d, TextHorizontalAlignment, TextVerticalAlignment } from '@tarikjabiri/dxf'
import type { Prim, Dash, BlockInstance } from '../views/display'
import type { Block } from '../domain/blocks'
import { fillAttrs } from '../domain/blocks'
import { blockDefinition } from '../views/blocks'

/** DXF layer + colour (ACI) for a prim class (its first word). */
const LAYERS: Record<string, { name: string; aci: number }> = {
	outlet: { name: 'E-OUTLETS', aci: 5 },
	run: { name: 'E-CONTAINMENT', aci: 4 },
	riser: { name: 'E-RISERS', aci: 6 },
	'riser-label': { name: 'E-RISERS', aci: 6 },
	rack: { name: 'E-RACKS', aci: 7 },
	'rack-x': { name: 'E-RACKS', aci: 8 },
	'rack-back': { name: 'E-RACKS', aci: 7 },
	wall: { name: 'A-WALL', aci: 8 },
	shape: { name: 'A-DETAIL', aci: 7 },
	label: { name: 'ANNO-LABELS', aci: 7 },
	note: { name: 'ANNO-TEXT', aci: 7 },
}
const HIGH = { name: 'E-CONTAINMENT-HIGH', aci: 30 }

export function layerOf(cls: string): { name: string; aci: number } {
	if (/\brun-high\b/.test(cls)) return HIGH
	return LAYERS[cls.split(/\s+/)[0]] ?? { name: '0', aci: 7 }
}

export interface DxfResult { text: string; entities: number; skippedImages: number }

/** `names` = the project's own layers (id → name): their items go on a DXF layer of that name; everything else keeps
 *  the discipline layer of its class. */
export function displayListToDxf(prims: Prim[], names?: ReadonlyMap<string, string>, paperScale = 100, blocks?: (id: string) => Block | undefined): DxfResult {
	const w = new DxfWriter()
	w.setUnits(Units.Millimeters)
	const made = new Set<string>()
	// a shape's own line type (backlog "Shape style"): DXF linetypes made on first use, dash lengths as on paper (mm) ×
	// the drawing's scale. (DXF lineweights aren't written: this writer has no field for them.)
	const LTYPE: Record<Dash, { name: string; text: string; el: number[] }> = {
		dashed: { name: 'DASHED', text: '__ __ __', el: [2, -1] }, dotted: { name: 'DOTTED', text: '. . . .', el: [0.3, -0.8] },
		dashdot: { name: 'DASHDOT', text: '__ . __ .', el: [3, -1, 0.3, -1] },
	}
	const lineType = (p: Exclude<Prim, { k: 'image' }>) => {
		if (!p.dash) return {}
		const t = LTYPE[p.dash]
		if (!made.has(`lt:${t.name}`)) { made.add(`lt:${t.name}`); w.addLType(t.name, t.text, t.el.map((n) => n * paperScale)) }
		return { lineType: t.name }
	}
	const layer = (p: Exclude<Prim, { k: 'image' }>) => {
		const own = p.layer ? names?.get(p.layer) : undefined
		const l = own ? { name: own, aci: 7 } : layerOf(p.cls)
		if (l.name !== '0' && !made.has(l.name)) { made.add(l.name); w.addLayer(l.name, l.aci, 'CONTINUOUS') }
		return l.name
	}
	let entities = 0, skippedImages = 0
	// ── blocks: each defined once (local mm, y up), each placement one INSERT with its attributes ──
	const defined = new Map<string, { name: string; attdefs: ReturnType<typeof blockDefinition>['attdefs'] }>()
	const taken = new Set<string>()
	const define = (b: Block) => {
		let d = defined.get(b.id)
		if (d) return d
		let name = (b.name || 'BLOCK').toUpperCase().replace(/[^A-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'BLOCK'
		for (let n = 2; taken.has(name); n++) name = `${name.replace(/_\d+$/, '')}_${n}`
		taken.add(name)
		const def = blockDefinition(b), blk = w.addBlock(name)
		for (const q of def.prims) {
			if (q.k === 'line' && q.pts.length >= 2) blk.addLWPolyline(q.pts.map((v) => ({ point: point2d(v.x, -v.y) })), { layerName: '0', ...(q.closed ? { flags: LWPolylineFlags.Closed } : {}) })
			else if (q.k === 'circle') blk.addCircle(point3d(q.c.x, -q.c.y, 0), Math.max(0.01, q.r), { layerName: '0' })
			else if (q.k === 'text' && q.text) blk.addText(point3d(q.at.x, -q.at.y, 0), Math.max(0.1, q.size), q.text, { layerName: '0', ...textAlign(q.anchor, point3d(q.at.x, -q.at.y, 0)), ...(q.rot ? { rotation: -q.rot } : {}) })
		}
		for (const a of def.attdefs) blk.addAttdef(point3d(a.at.x, -a.at.y, 0), Math.max(0.1, a.size), a.tag, '', { layerName: '0', ...textAlign(a.anchor, point3d(a.at.x, -a.at.y, 0)), ...(a.rot ? { rotation: -a.rot } : {}) })
		d = { name, attdefs: def.attdefs }
		defined.set(b.id, d)
		return d
	}
	const written = new Set<BlockInstance>()
	const insertOf = (p: Exclude<Prim, { k: 'image' }>, ins: BlockInstance): boolean => {
		const b = blocks?.(ins.blockId)
		if (!b) return false
		if (written.has(ins)) return true
		written.add(ins)
		const d = define(b), at = point3d(ins.at.x, -ins.at.y, 0)
		const ref = w.addInsert(d.name, at, { layerName: layer(p), scaleFactor: { x: ins.scale, y: ins.scale, z: ins.scale }, ...(ins.rot ? { rotationAngle: -ins.rot } : {}) })
		// each attribute where its definition sits, placed like the block (scaled, turned), with this insert's value
		const r = (-ins.rot * Math.PI) / 180, cos = Math.cos(r), sin = Math.sin(r)
		for (const a of d.attdefs) {
			const lx = a.at.x * ins.scale, ly = -a.at.y * ins.scale
			const pos = point3d(at.x + lx * cos - ly * sin, at.y + lx * sin + ly * cos, 0)
			w.addAttrib(pos, Math.max(0.1, a.size * ins.scale), a.tag, fillAttrs(a.template, ins.attrs), ref, { layerName: layer(p), ...textAlign(a.anchor, pos), ...((a.rot ?? 0) + ins.rot ? { rotation: -((a.rot ?? 0) + ins.rot) } : {}) })
		}
		entities++
		return true
	}
	for (const p of prims) {
		if (p.k !== 'image' && p.cls === 'shape-fill') continue   // a region's fill: DXF gets the outline only (no hatch yet)
		if (p.k !== 'image' && p.ins && insertOf(p, p.ins)) continue
		switch (p.k) {
			case 'line': {
				if (p.pts.length < 2) break
				w.addLWPolyline(p.pts.map((q) => ({ point: point2d(q.x, -q.y) })), {
					layerName: layer(p), ...lineType(p),
					...(p.closed ? { flags: LWPolylineFlags.Closed } : {}),
					...(p.w ? { constantWidth: p.w } : {}),
				})
				entities++
				break
			}
			case 'circle':
				w.addCircle(point3d(p.c.x, -p.c.y, 0), Math.max(0.01, p.r), { layerName: layer(p), ...lineType(p) })
				entities++
				break
			case 'text': {
				if (!p.text) break
				const at = point3d(p.at.x, -p.at.y, 0)
				const centred = p.anchor === 'middle' || p.anchor === 'end'
				w.addText(at, Math.max(1, p.size), p.text, {
					layerName: layer(p), ...lineType(p),
					...(p.rot ? { rotation: -p.rot } : {}),
					...(centred ? {
						horizontalAlignment: p.anchor === 'middle' ? TextHorizontalAlignment.Center : TextHorizontalAlignment.Right,
						verticalAlignment: TextVerticalAlignment.BaseLine, secondAlignmentPoint: at,
					} : {}),
				})
				entities++
				break
			}
			case 'image':
				skippedImages++
				break
		}
	}
	return { text: w.stringify(), entities, skippedImages }
}

/** A text's DXF alignment from its anchor (centred / right texts align on their point). */
function textAlign(anchor: 'start' | 'middle' | 'end' | undefined, at: ReturnType<typeof point3d>) {
	return anchor === 'middle' || anchor === 'end'
		? { horizontalAlignment: anchor === 'middle' ? TextHorizontalAlignment.Center : TextHorizontalAlignment.Right, verticalAlignment: TextVerticalAlignment.BaseLine, secondAlignmentPoint: at }
		: {}
}
