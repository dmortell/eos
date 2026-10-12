// Display list → DXF (analysis §6.6: one display list feeds screen, print and DXF, so the export is what you see).
// Plan mm in; DXF is y-UP, so y is negated. Banded prims (trunks, walls) become LWPOLYLINEs with their real constant
// width. Layers come from the prim's class. Images (PDF underlays) are not exported: each is kept as a frame + note on A-IMAGE and counted in the result.
// BLOCKS (backlog "DXF blocks as BLOCK + INSERT"): given the block library, every placed block (an outlet's symbol, an
// insert — prims carrying `ins`) goes out as ONE INSERT of a BLOCK written once, its {TAG} texts as ATTDEF / ATTRIB, so
// AutoCAD can count them. A hidden attribute is written empty (the writer can't set the invisible flag).
// LINEWEIGHTS: a shape's own lineweight (paper mm) is written as group 370 (hundredths of a mm, the nearest of DXF's
// standard weights), put in by wrapping the entity's `dxfy` since the writer has no option for it. FILLS: a region's
// fill (`shape-fill`) is a solid HATCH of its color.
import { DxfWriter, LWPolylineFlags, Units, point2d, point3d, TextHorizontalAlignment, TextVerticalAlignment, HatchBoundaryPaths, HatchPolylineBoundary, HatchEdgesTypeData, HatchPredefinedPatterns, TrueColor, vertex } from '@tarikjabiri/dxf'
import type { Prim, Dash, BlockInstance } from '../views/display'
import type { Block } from '../domain/blocks'
import { fillAttrs } from '../domain/blocks'
import { blockDefinition } from '../views/blocks'

/** DXF layer + color (ACI) for a prim class (its first word). */
const LAYERS: Record<string, { name: string; aci: number }> = {
	outlet: { name: 'E-OUTLETS', aci: 5 },
	run: { name: 'E-CONTAINMENT', aci: 4 },
	'run-body': { name: 'E-CONTAINMENT', aci: 4 },
	riser: { name: 'E-RISERS', aci: 6 },
	'riser-label': { name: 'E-RISERS', aci: 6 },
	rack: { name: 'E-RACKS', aci: 7 },
	'rack-x': { name: 'E-RACKS', aci: 8 },
	'port-mid': { name: 'E-RACKS', aci: 7 },
	'rack-back': { name: 'E-RACKS', aci: 7 },
	wall: { name: 'A-WALL', aci: 8 },
	shape: { name: 'A-DETAIL', aci: 7 },
	'tile-line': { name: 'A-FLOR-TILE', aci: 8 },
	label: { name: 'ANNO-LABELS', aci: 7 },
	note: { name: 'ANNO-TEXT', aci: 7 },
}
const HIGH = { name: 'E-CONTAINMENT-HIGH', aci: 30 }

export function layerOf(cls: string): { name: string; aci: number } {
	if (/\brun-high\b/.test(cls)) return HIGH
	return LAYERS[cls.split(/\s+/)[0]] ?? { name: '0', aci: 7 }
}

/** DXF's standard lineweights (group 370, hundredths of a mm). */
const LINEWEIGHTS = [0, 5, 9, 13, 15, 18, 20, 25, 30, 35, 40, 50, 53, 60, 70, 80, 90, 100, 106, 120, 140, 158, 200, 211]
/** The standard DXF lineweight (hundredths of a mm) nearest a paper lineweight in mm. */
export function dxfLineweight(mm: number): number {
	const h = mm * 100
	return LINEWEIGHTS.reduce((best, w) => (Math.abs(w - h) < Math.abs(best - h) ? w : best))
}
/** Gives an entity a lineweight: group 370 goes in the AcDbEntity part, just before its own subclass marker. */
function withLineweight<T extends object>(e: T, mm: number | undefined): T {
	if (!mm || mm <= 0) return e
	const code = dxfLineweight(mm), x = e as unknown as { dxfy(dx: { subclassMarker(n: string): void; push(code: number, v: unknown): void }): void }
	const base = x.dxfy.bind(x)
	x.dxfy = (dx) => {
		const marker = dx.subclassMarker.bind(dx)
		let done = false
		dx.subclassMarker = (n: string) => { if (!done && n !== 'AcDbEntity') { done = true; dx.push(370, code) } marker(n) }
		try { base(dx) } finally { dx.subclassMarker = marker }
	}
	return e
}

export interface DxfResult { text: string; entities: number; skippedImages: number }

/** `names` = the project's own layers (id → name): their items go on a DXF layer of that name; everything else keeps
 *  the discipline layer of its class. */
export function displayListToDxf(prims: Prim[], names?: ReadonlyMap<string, string>, paperScale = 100, blocks?: (id: string) => Block | undefined): DxfResult {
	const w = new DxfWriter()
	w.setUnits(Units.Millimeters)
	const made = new Set<string>()
	// a shape's own line type (backlog "Shape style"): DXF linetypes made on first use, dash lengths as on paper (mm) ×
	// the drawing's scale.
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
	// a project layer's name as DXF takes it: no < > / \ " : ; ? * | = ` (AutoCAD refuses the file), and unique ignoring
	// case (DXF names are case-insensitive: "Walls" and "WALLS" would merge)
	const dxfName = new Map<string, string>(), usedUpper = new Set(Object.values(LAYERS).map((l) => l.name).concat(HIGH.name, '0'))
	const ownName = (id: string, name: string): string => {
		let n = dxfName.get(id)
		if (n) return n
		const base = name.replace(/[<>/\\":;?*|=`,]/g, '_').trim() || 'LAYER'
		n = base
		for (let i = 2; usedUpper.has(n.toUpperCase()); i++) n = `${base}_${i}`
		usedUpper.add(n.toUpperCase()); dxfName.set(id, n)
		return n
	}
	const layer = (p: Exclude<Prim, { k: 'image' }>) => {
		const own = p.layer ? names?.get(p.layer) : undefined
		const l = own ? { name: ownName(p.layer!, own), aci: 7 } : layerOf(p.cls)
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
			else if (q.k === 'text' && q.text) blk.addText(point3d(q.at.x, -q.at.y, 0), Math.max(0.1, q.size), oneLine(q.text), { layerName: '0', ...textAlign(q.anchor, point3d(q.at.x, -q.at.y, 0)), ...(q.rot ? { rotation: -q.rot } : {}) })
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
			w.addAttrib(pos, Math.max(0.1, a.size * ins.scale), a.tag, oneLine(fillAttrs(a.template, ins.attrs)), ref, { layerName: layer(p), ...textAlign(a.anchor, pos), ...((a.rot ?? 0) + ins.rot ? { rotation: -((a.rot ?? 0) + ins.rot) } : {}) })
		}
		entities++
		return true
	}
	// a region's fill as a solid HATCH of its color: its outline (a polygon or a circle) is the boundary
	const fillOf = (p: Exclude<Prim, { k: 'image' | 'text' }>): boolean => {
		const paths = new HatchBoundaryPaths()
		if (p.k === 'line') {
			if (p.pts.length < 3) return false
			const b = new HatchPolylineBoundary()
			for (const q of p.pts) b.add(vertex(q.x, -q.y))
			paths.addPolylineBoundary(b)
		} else {
			const e = new HatchEdgesTypeData()
			e.addArcEdgeData(point2d(p.c.x, -p.c.y), Math.max(0.01, p.r), 0, 360, true)
			paths.addEdgesTypeData(e)
		}
		w.addHatch(paths, { name: HatchPredefinedPatterns.SOLID }, { layerName: layer(p), ...(p.color ? { trueColor: String(TrueColor.fromHex(p.color)) } : {}) })
		return true
	}
	for (const p of prims) {
		if ((p.k === 'line' || p.k === 'circle') && p.cls === 'shape-fill') { if (fillOf(p)) entities++; continue }
		if (p.k !== 'image' && p.cls === 'shape-fill') continue   // a region's fill: a solid hatch under its outline
		if (p.k !== 'image' && p.cls.split(' ').includes('run-hit')) continue   // a run's pick bands: DXF gets its outline (run-body)
		if (p.k !== 'image' && p.ins && insertOf(p, p.ins)) continue
		switch (p.k) {
			case 'line': {
				if (p.pts.length < 2) break
				withLineweight(w.addLWPolyline(p.pts.map((q) => ({ point: point2d(q.x, -q.y) })), {
					layerName: layer(p), ...lineType(p),
					...(p.closed ? { flags: LWPolylineFlags.Closed } : {}),
					...(p.w ? { constantWidth: p.w } : {}),
				}), p.weight)
				entities++
				// holes (a ring of runs): their own closed outlines
				for (const h of p.holes ?? []) { w.addLWPolyline(h.map((q) => ({ point: point2d(q.x, -q.y) })), { layerName: layer(p), ...lineType(p), flags: LWPolylineFlags.Closed }); entities++ }
				break
			}
			case 'circle':
				withLineweight(w.addCircle(point3d(p.c.x, -p.c.y, 0), Math.max(0.01, p.r), { layerName: layer(p), ...lineType(p) }), p.weight)
				entities++
				break
			case 'text': {
				if (!p.text) break
				// a TEXT is one line (a newline inside a value breaks the file): several lines → one TEXT each, 1.4 × size apart
				const lines = p.text.split(/\r?\n/), size = Math.max(1, p.size), r = ((p.rot ?? 0) * Math.PI) / 180
				const centred = p.anchor === 'middle' || p.anchor === 'end'
				lines.forEach((line, i) => {
					if (!line) return
					const dy = i * size * 1.4   // down the text's own lines (y down), turned with it
					const at = point3d(p.at.x - dy * Math.sin(r), -(p.at.y + dy * Math.cos(r)), 0)
					w.addText(at, size, line, {
						layerName: layer(p), ...lineType(p),
						...(p.rot ? { rotation: -p.rot } : {}),
						...(centred ? {
							horizontalAlignment: p.anchor === 'middle' ? TextHorizontalAlignment.Center : TextHorizontalAlignment.Right,
							verticalAlignment: TextVerticalAlignment.BaseLine, secondAlignmentPoint: at,
						} : {}),
					})
					entities++
				})
				break
			}
			case 'image': {
				// DXF can only point at an image FILE, and this one is a rendered page in the browser: so its place is kept as a
				// frame and a note on its own layer, and the export says the picture is not in it
				skippedImages++
				if (!made.has('A-IMAGE')) { made.add('A-IMAGE'); w.addLayer('A-IMAGE', 8, 'CONTINUOUS') }
				const x1 = p.x + p.w, y1 = p.y + p.h
				w.addLWPolyline([[p.x, p.y], [x1, p.y], [x1, y1], [p.x, y1]].map(([x, y]) => ({ point: point2d(x, -y) })), { layerName: 'A-IMAGE', flags: LWPolylineFlags.Closed })
				w.addText(point3d(p.x + 20, -(p.y + 60), 0), Math.max(1, Math.min(60, p.w / 40)), 'Image (underlay) — not included in the DXF', { layerName: 'A-IMAGE' })
				entities += 2
				break
			}
		}
	}
	return { text: w.stringify(), entities, skippedImages }
}

/** A DXF group value can't hold a newline. */
const oneLine = (t: string) => t.replace(/\s*\r?\n\s*/g, ' ')

/** A text's DXF alignment from its anchor (centred / right texts align on their point). */
function textAlign(anchor: 'start' | 'middle' | 'end' | undefined, at: ReturnType<typeof point3d>) {
	return anchor === 'middle' || anchor === 'end'
		? { horizontalAlignment: anchor === 'middle' ? TextHorizontalAlignment.Center : TextHorizontalAlignment.Right, verticalAlignment: TextVerticalAlignment.BaseLine, secondAlignmentPoint: at }
		: {}
}
