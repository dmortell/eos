// C1: DXF EXPORT of one viewport — its model objects (projected exactly as Model3d draws them: section clip,
// hidden / frozen layers, a riser drawing's collapsed floors) plus the view's 2D shapes, in REAL MILLIMETRES,
// one DXF layer per Pages layer (ACI colour from the layer colour). Built on the Sheets tool's DXF writer
// (sheets/dxf/dxf.ts, @tarikjabiri/dxf).
//   plan       X = model x, Y = −model y (DXF is y-up)
//   elevation  X = the drawing's horizontal, Y = height above the ground line (z = 0 → Y = 0), storey levels
//   iso        a wireframe of the model's edges (no hidden lines)
// Annotative sizes (text, dimension figures, arrow ticks) are drawn at the viewport's scale 1:N, as on paper.
// Not exported: images (a DXF can only reference an external file) — they're counted in `skipped`.
import { TextHorizontalAlignment, point3d } from '@tarikjabiri/dxf'
import { DxfDoc } from '../sheets/dxf/dxf'
import type { Model, Obj, Clip, Dir } from './3dview/types'
import { BASIS } from './3dview/types'
import { project, viewMap, isoBounds, trimToClip, objBounds } from './3dview/projection'
import { storeyMap } from './3dview/storeyMap'
import { GROUND, PLAN_CX, PLAN_CY, STYLE_DEFAULTS, textBox, type Ent, type Pt, type ElevDir } from './ui/geometry'
import { inThisView, rotCenter, rotatePt } from './ui/hit'
import { lineLabelAt, groundPts, tileLines } from './ui/annotations'
import { blockDef, byBlock, attrValue } from './ui/blocks'
import { PT_MM } from './constants'
import type { ViewCtx } from './ui/view'

export type DxfViewInput = {
	model: Model
	/** The shapes of the model (the export keeps the ones that belong to this view, like the viewport does). */
	ents: Ent[]
	dir: Dir
	clip?: Clip | null
	yaw?: number; pitch?: number
	/** VP Freeze: layer ids hidden in this viewport only. */
	frozen?: string[]
	/** A riser drawing's visible storeys (hidden floors collapse to a break). */
	storeys?: string[]
	/** The viewport's scale denominator N (1:N) — annotative sizes. */
	scaleN: number
	/** The sheet frame id (view-scoped shapes `space: 'view:<id>'`). */
	frameId?: string
}
export type DxfResult = { text: string; objects: number; shapes: number; skipped: number }

export function viewToDxf(inp: DxfViewInput): DxfResult {
	const { model, dir } = inp, yaw = inp.yaw ?? 0, pitch = inp.pitch ?? 0, N = inp.scaleN || 1
	const isPlan = dir === 'plan', isIso = dir === 'iso', isElev = !isPlan && !isIso
	const doc = new DxfDoc()
	const layers = model.layers ?? [], frozen = new Set(inp.frozen ?? [])
	const layerOf = (id?: string) => layers.find((l) => l.id === id)
	const shown = (id?: string) => { const l = layerOf(id); return (!l || l.visible) && !(id && frozen.has(id)) }
	const dxfLayer = (id?: string) => { const l = layerOf(id); return l ? doc.layer(l.name, l.color) : '0' }
	// drawing coords (y-down, the viewport's own) → DXF (y-up; an elevation's ground line at Y = 0)
	const baseY = isElev ? GROUND : 0
	const P = (p: Pt): [number, number] => [p[0], baseY - p[1]]
	const isoBox = isIso ? isoBounds(model.objects, yaw, pitch, PLAN_CX, PLAN_CY, (o) => shown(o.layer)) : null
	const vm = viewMap(dir, PLAN_CX, PLAN_CY, GROUND, yaw, pitch, isoBox)
	const sm = isElev && inp.storeys && model.storeys?.length ? storeyMap(model.storeys, inp.storeys) : null
	const vs = isElev ? BASIS[dir as ElevDir].vs : 1
	const uv = (q: { u: number; v: number }) => P(vm.uvToDraw(sm ? { u: q.u, v: vs * sm.map(vs * q.v) } : q))
	let objects = 0, shapes = 0, skipped = 0

	// ── model objects ──
	for (const o of model.objects) {
		if (!shown(o.layer)) continue
		if (sm) { const b = objBounds(o); if (sm.hidden(b.z0, b.z1)) continue }
		const to: Obj | null = inp.clip ? trimToClip(o, inp.clip) : o; if (!to) continue
		const layer = dxfLayer(o.layer)
		for (const s of project(to, dir, yaw, pitch, PLAN_CX, PLAN_CY)) doc.poly(s.pts.map(uv), { closed: s.closed, layer })
		if (o.label && !isIso) {   // a labelled object's name (a riser room "IDF01-A"), centred like the viewport draws it
			const b = objBounds(o), mid = { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2, z: (b.z0 + b.z1) / 2 }
			const [dx, dy] = vm.toDraw(mid)
			text(doc, P([dx, dy]), 2.2 * N, o.label, layer, 'center', 0)
		}
		objects++
	}
	// ── storey levels (an elevation of a building) ──
	if (isElev && model.storeys?.length) {
		const layer = doc.layer('Levels', '#94a3b8'), xs: number[] = []
		for (const o of model.objects) { const b = objBounds(o); xs.push(vm.toDraw({ x: b.x0, y: b.y0, z: 0 })[0], vm.toDraw({ x: b.x1, y: b.y1, z: 0 })[0]) }
		const x0 = xs.length ? Math.min(...xs) - 1500 : 0, x1 = xs.length ? Math.max(...xs) + 500 : 10000
		for (const st of sm ? sm.shown : model.storeys) {
			const y = sm ? sm.map(st.z) : st.z
			doc.line([x0, y], [x1, y], layer)
			text(doc, [x0, y + 1 * N], 2.2 * N, st.name, layer, 'left', 0)
		}
	}

	// ── 2D shapes that belong to this view ──
	if (!isIso) {
		const ctx: ViewCtx = { dir, isPlan, isElev, isIso, elevDir: (isElev ? dir : 'front') as ElevDir, cx: PLAN_CX, cy: PLAN_CY, ground: GROUND, frameId: inp.frameId, paperMm: N, mdl: model, yaw, pitch }
		for (const e of inp.ents) {
			if (!shown(e.layer) || !inThisView(ctx, e)) continue
			if (e.type === 'image') { skipped++; continue }
			// a plan shape seen in an elevation is an edge-on line — the viewport shows it at the ground; not exported
			if (isElev && e.plane !== dir) continue
			entToDxf(doc, e, ctx, P, dxfLayer(e.layer), N)
			shapes++
		}
	}
	return { text: doc.stringify(), objects, shapes, skipped }
}

type Align = 'left' | 'center' | 'right'
/** DXF TEXT at `at` (already in DXF coords), height `h`, aligned, rotated `rot` degrees (counter-clockwise). */
function text(doc: DxfDoc, at: [number, number], h: number, value: string, layer: string, align: Align, rot: number) {
	if (!value) return
	const ha = align === 'center' ? TextHorizontalAlignment.Center : align === 'right' ? TextHorizontalAlignment.Right : TextHorizontalAlignment.Left
	const p = point3d(at[0], at[1], 0)
	doc.w.addText(p, Math.max(0.5, h), value, { layerName: layer, rotation: rot || undefined, horizontalAlignment: ha, ...(ha !== TextHorizontalAlignment.Left ? { secondAlignmentPoint: p } : {}) })
}

/** One Pages shape → DXF entities. `P` maps drawing coords to DXF; `N` = the scale denominator. */
function entToDxf(doc: DxfDoc, e: Ent, ctx: ViewCtx, P: (p: Pt) => [number, number], layer: string, N: number, xf: (p: Pt) => Pt = (p) => p) {
	// the shape's own rotation (about its bbox centre, as the viewport's <g rotate>), then the caller's transform
	const c = e.rot ? rotCenter(ctx, e) : null
	const T = (p: Pt): [number, number] => P(xf(c ? rotatePt(p, c, e.rot!) : p))
	// DXF text angle: screen rotation is clockwise in y-down; DXF is counter-clockwise in y-up → −rot
	const tRot = -(e.rot ?? 0)
	switch (e.type) {
		case 'polyline': {
			const pts = e.pts ?? []
			doc.poly(pts.map(T), { layer })
			const lb = e.text ? lineLabelAt(pts, e.textPos, 1.2 * N) : null
			if (lb) text(doc, T(lb.p), 2.5 * N, e.text!, layer, lb.anchor === 'middle' ? 'center' : lb.anchor === 'end' ? 'right' : 'left', -lb.rot + tRot)
			return
		}
		case 'rect': case 'ellipse': {
			const g = groundPts(e)   // the outline points (a rect's 4 corners / an ellipse's 32)
			doc.poly(g.pts.map(T), { closed: true, layer })
			if (e.type === 'rect' && e.tile) for (const [p, q] of tileLines(e.a!, e.b!, e.tile, e.tileOff)) doc.poly([T(p), T(q)], { layer })   // D2
			return
		}
		case 'dim': {
			const A = e.a!, B = e.b!, len = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1
			const ux = (B[0] - A[0]) / len, uy = (B[1] - A[1]) / len, px = -uy, py = ux, tk = 1.5 * N
			doc.poly([T(A), T(B)], { layer })
			doc.poly([T([A[0] - px * tk, A[1] - py * tk]), T([A[0] + px * tk, A[1] + py * tk])], { layer })
			doc.poly([T([B[0] - px * tk, B[1] - py * tk]), T([B[0] + px * tk, B[1] + py * tk])], { layer })
			const off = e.dimOff ?? 2.5 * N, t = e.dimT ?? 0.5
			const m: Pt = [A[0] + ux * len * t + px * off, A[1] + uy * len * t + py * off]
			let ang = (Math.atan2(uy, ux) * 180) / Math.PI; if (ang > 90 || ang < -90) ang += 180
			text(doc, T(m), 2.5 * N, String(Math.round(len)), layer, 'center', -ang + tRot)
			return
		}
		case 'text': {
			const fs = (e.fontPt ?? STYLE_DEFAULTS.fontPt) * PT_MM * N, lh = fs * 1.18
			const lines = (e.text ?? '').split('\n')
			const oy = e.valign === 'middle' ? -((lines.length - 1) * lh) / 2 : e.valign === 'bottom' ? -((lines.length - 1) * lh) : 0
			lines.forEach((ln, i) => text(doc, T([e.a![0], e.a![1] + oy + i * lh]), fs, ln, layer, e.align ?? 'left', tRot))
			if (e.callout) {
				const bb = textBox(e, PT_MM * N), pad = fs * 0.4
				const x0 = bb[0] - pad, y0 = bb[1] - pad, x1 = bb[2] + pad, y1 = bb[3] + pad
				const lp = e.leader ?? [bb[0] - fs * 3, bb[3] + fs * 3], frame = e.calloutBorder ?? 'box'
				if (frame === 'box') doc.poly([T([x0, y0]), T([x1, y0]), T([x1, y1]), T([x0, y1])], { closed: true, layer })
				else if (frame === 'underline') doc.poly([T([x0, y1]), T([x1, y1])], { layer })
				const nx = lp[0] < (x0 + x1) / 2 ? x0 : x1, ny = frame === 'underline' ? y1 : lp[1] < (y0 + y1) / 2 ? y0 : y1
				doc.poly([T([nx, ny]), T(lp)], { layer })
			}
			return
		}
		case 'insert': {   // a block, exploded: its shapes and attribute texts at the insertion point, scaled
			const def = blockDef(e.block), k = e.scale ?? 1, a = e.a!
			const inner = (p: Pt): Pt => xf(c ? rotatePt([a[0] + p[0] * k, a[1] + p[1] * k], c, e.rot!) : [a[0] + p[0] * k, a[1] + p[1] * k])
			if (!def) { doc.poly([[-100, -100], [100, -100], [100, 100], [-100, 100]].map((p) => P(inner(p as Pt))), { closed: true, layer }); return }
			for (const bs of def.shapes) entToDxf(doc, { ...byBlock(bs, e), rot: undefined }, ctx, P, layer, N, inner)
			for (const ad of def.attributes) {
				const v = ad.visible !== false ? attrValue(e, ad) : ''
				if (v) text(doc, P(inner([ad.pos[0], ad.pos[1]])), ad.height * k, v, layer, 'center', tRot)
			}
			return
		}
	}
}
