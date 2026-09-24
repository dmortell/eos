// One-off IMPORT of a Sheets-tool sheet (`projects/{pid}/sheets/{id}`) into a Pages sheet (drawings-plan §6,
// phase 8). Pure; tested in sheetsImport.test.ts. The page supplies ids and "which Pages model shows this
// outlets doc" (a place model); nothing here reads Firestore.
//   paper      size / orientation / margins map across (A3 / A4; landscape unless portrait)
//   viewports  → frames at the same paper-mm rect, number → seq, label kept, border, locked
//     outlets  → the place model for its outlets doc: plan, the same scale and the same model point at the
//                frame centre (Sheets' viewBox = contentOffsetMm + (w, h) × N, or the content bounds on Fit);
//                its ANNOTATIONS become shapes in that model scoped to the frame (`space: 'view:<frameId>'`)
//     risers   → the building model it was imported into (risersImport.ts), front elevation, fitted
//     anything else (racks, fill-rate, the old 3D models, text) — and an outlets / risers doc with no Pages
//                model yet — is NOT guessed: the frame keeps `source` (shown "Not mapped yet") + a note
// Outlets data and Sheets outlet annotations share one coordinate space with the Pages model (real mm from the
// floorplan origin, y down), so coordinates copy straight across.
import type { SheetDoc, SheetViewport, Annotation } from '../../sheets/types'
import type { SheetFrameDoc, SheetPaper } from './schema'
import type { Model } from '../3dview/types'
import type { Ent, Pt, Head, Dash } from '../ui/geometry'
import { PLAN_CX, PLAN_CY } from '../ui/geometry'
import { insertBounds } from '../ui/blocks'
import { niceScale, fitFrame } from '../ui/frameFit'
import { PT_MM, type PaperSize } from '../constants'
import { USAGE_COLORS } from '../../outlets/parts/constants'

export type ImportCtx = {
	newId: (prefix: string) => string
	/** The Pages model that shows this Outlets-tool doc (the place model), or null when there isn't one yet. */
	modelForOutlets: (outletsDocId: string) => Model | null
	/** The layer id a Sheets annotation layer maps to in `model` (e.g. its Annotations layer). */
	layerFor?: (model: Model, sheetsLayerId?: string) => string | undefined
	/** The Sheets project's default annotation colour (what an annotation without its own colour drew in). */
	defaultColor?: string
	/** The BUILDING model a Risers-tool doc was imported into (risersImport.ts), or null. */
	modelForRisers?: (risersDocId: string) => Model | null
}
export type SheetImportResult = {
	title: string; drawingNumber: string; paper: SheetPaper
	frames: SheetFrameDoc[]
	/** New shapes per model id (the annotations of the frames that show it). */
	shapes: Record<string, Ent[]>
	/** What didn't map, for the user. */
	notes: string[]
}

const MOUNT_BLOCK: Record<string, string> = { wall: 'outlet-wall', floor: 'outlet-floor', box: 'outlet-box' }

/** A Pages model's drawn extent in plan (the Sheets "Fit" bounds equivalent): its floorplan image (cropped),
 *  block inserts and conduit nodes, padded 2 %. null when empty. */
export function planBounds(m: Model): { x: number; y: number; w: number; h: number } | null {
	let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
	const ext = (x: number, y: number) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y) }
	for (const s of m.shapes ?? []) {
		if (s.type === 'image' && s.a && s.b) {
			const c = s.crop, w = s.b[0] - s.a[0], h = s.b[1] - s.a[1]
			if (c) { ext(s.a[0] + c.x * w, s.a[1] + c.y * h); ext(s.a[0] + (c.x + c.w) * w, s.a[1] + (c.y + c.h) * h) } else { ext(s.a[0], s.a[1]); ext(s.b[0], s.b[1]) }
		} else if (s.type === 'insert') { const [a, b, c, d] = insertBounds(s); ext(a, b); ext(c, d) }
	}
	for (const o of m.objects) if (o.type === 'conduit') for (const n of o.nodes) ext(n.x, n.y)
	if (!isFinite(x0)) return null
	const px = (x1 - x0) * 0.02 || 100, py = (y1 - y0) * 0.02 || 100
	return { x: x0 - px, y: y0 - py, w: x1 - x0 + 2 * px, h: y1 - y0 + 2 * py }
}

/** An outlets viewport's scale (1:N) and the model point at its centre, as Sheets drew it. */
export function outletsView(vp: SheetViewport, bounds: { x: number; y: number; w: number; h: number } | null): { n: number; centre: Pt } {
	const b = bounds ?? { x: 0, y: 0, w: 1000, h: 1000 }
	if (!vp.scale || vp.scale <= 0) {   // Fit: the bounds, centred ('xMidYMid meet')
		return { n: niceScale(Math.max(b.w / vp.w, b.h / vp.h)), centre: [b.x + b.w / 2, b.y + b.h / 2] }
	}
	const s = vp.scale, o = vp.contentOffsetMm ?? { x: b.x, y: b.y }   // the viewBox's top-left ('xMinYMin')
	return { n: s, centre: [o.x + (vp.w * s) / 2, o.y + (vp.h * s) / 2] }
}
/** The Pages frame content view that puts model point `c` at the frame centre at 1:n (frameFit.ts's rule). */
export const viewCentredOn = (c: Pt, n: number) => ({ zoom: 1, x: -(c[0] - PLAN_CX) / n, y: -(c[1] - PLAN_CY) / n })

const describeSource = (vp: SheetViewport): string => {
	const s = vp.source
	switch (s.kind) {
		case 'outlets': return `outlets · ${s.outletsDocId}`
		case 'racks': return `racks ${s.face} · ${s.racksDocId}`
		case 'risers': return `risers · ${s.risersDocId}`
		case 'fillrate': return `fill-rate section ${s.sectionId}`
		case 'model3d': return `old 3D model #${s.modelId} (${s.direction})`
		case 'text': return 'text viewport'
		default: return 'empty viewport'
	}
}

/** A Sheets annotation → a Pages shape in the frame's view (null = a kind Pages has no equivalent for). */
export function annotationToEnt(a: Annotation, frameId: string, n: number, id: string, layer?: string, defaultColor?: string): Ent | null {
	const base: Partial<Ent> = { id, space: `view:${frameId}` }
	if (layer) base.layer = layer
	if (a.color ?? defaultColor) base.color = a.color ?? defaultColor
	if (a.groupId) base.groupId = a.groupId
	if (a.dash && a.dash !== 'solid') base.dash = a.dash as Dash
	if (a.strokeWidth) base.weight = a.strokeWidth
	if (a.rotation) base.rot = a.rotation
	const head = (h?: string) => (h && h !== 'none' ? (h as Head) : undefined)
	const box = (): [Pt, Pt] => [[a.x, a.y], [a.x + (a.w ?? 0), a.y + (a.h ?? 0)]]
	const fontPt = a.fontPt ?? 10
	// a text box's first baseline: its top + ~0.8 of one line (Pages text is annotative: pt on paper × 1:n)
	const baseline = (): Pt => {
		const x = a.align === 'center' ? a.x + (a.w ?? 0) / 2 : a.align === 'right' ? a.x + (a.w ?? 0) : a.x
		return [x, a.y + fontPt * PT_MM * n * 0.8]
	}
	switch (a.kind) {
		case 'text':
			return { ...base, type: 'text', a: baseline(), text: a.text ?? '', fontPt, align: a.align } as Ent
		case 'callout':
			return { ...base, type: 'text', a: baseline(), text: a.text ?? '', fontPt, align: a.align, callout: true, ...(a.x2 != null ? { leader: [a.x2, a.y2 ?? a.y] as Pt } : {}) } as Ent
		case 'line': case 'arrow': {
			const e: Ent = { ...base, type: 'polyline', pts: [[a.x, a.y], [a.x2 ?? a.x, a.y2 ?? a.y]] } as Ent
			const hs = head(a.start), he = head(a.end) ?? (a.kind === 'arrow' ? 'arrow' : undefined)
			if (hs) e.headStart = hs; if (he) e.headEnd = he
			if (a.text) { /* a line label has no Pages equivalent yet — dropped (noted by the caller's kind count) */ }
			return e
		}
		case 'dimension': {
			const e: Ent = { ...base, type: 'dim', a: [a.x, a.y], b: [a.x2 ?? a.x, a.y2 ?? a.y] } as Ent
			const hs = head(a.start), he = head(a.end)
			if (hs) e.headStart = hs; if (he) e.headEnd = he
			return e
		}
		case 'rect': case 'cloud': {
			const [p, q] = box(), e: Ent = { ...base, type: 'rect', a: p, b: q } as Ent
			if (a.fill && a.fill !== 'none') e.fill = a.fill
			if (a.kind === 'cloud') e.cloud = true
			return e
		}
		case 'ellipse': {
			const [p, q] = box(), e: Ent = { ...base, type: 'ellipse', a: p, b: q } as Ent
			if (a.fill && a.fill !== 'none') e.fill = a.fill
			return e
		}
		case 'image':
			if (!a.src) return null
			return { ...base, type: 'image', a: box()[0], b: box()[1], src: a.src, lockAspect: true } as Ent
		case 'symbol': {
			if (a.symbol !== 'outlet') return null
			const o = a.outlet ?? {}, usage = o.usage ?? 'network', c = USAGE_COLORS[usage as keyof typeof USAGE_COLORS] ?? USAGE_COLORS.network
			const e: Ent = { ...base, type: 'insert', block: MOUNT_BLOCK[o.mount ?? 'box'] ?? 'outlet-box', a: [a.x + (a.w ?? 0) / 2, a.y + (a.h ?? 0) / 2],
				color: a.color ?? c.stroke, attrs: { LABEL: a.text ?? '', PORTS: String(o.ports ?? 1), TYPE: usage, NOTE: o.room ?? '' } } as Ent
			if (o.level !== 'high') e.fill = c.fill
			// Sheets sizes the symbol by its box (circle r ≈ 0.66 × half the box); the Pages rosette's circle is r 150 mm
			const s = a.w && a.h ? Math.round(((0.33 * Math.min(a.w, a.h)) / 150) * 100) / 100 : 1
			if (s > 0 && Math.abs(s - 1) > 0.01) e.scale = s
			return e
		}
		default:
			return null   // grid, legend, arrows-less symbols … (reported by kind)
	}
}

export function importSheetDoc(src: SheetDoc, ctx: ImportCtx): SheetImportResult {
	const notes: string[] = [], shapes: Record<string, Ent[]> = {}
	const size = (['A4', 'A3', 'A2'] as PaperSize[]).includes(src.paper?.paperSize as PaperSize) ? (src.paper.paperSize as PaperSize) : 'A3'
	const paper: SheetPaper = { size, landscape: src.paper?.orientation !== 'portrait', marginMm: src.paper?.margins ?? 10 }
	const frames: SheetFrameDoc[] = []
	// frame numbers: a viewport's manual number is kept (the first to claim it); the rest get the lowest free ones
	const used = new Set<number>(), seqs = src.viewports.map((vp) => (vp.number && !used.has(vp.number) ? (used.add(vp.number), vp.number) : 0))
	let next = 1
	src.viewports.forEach((vp, i) => {
		let seq = seqs[i]
		if (!seq) { while (used.has(next)) next++; seq = next; used.add(seq) }
		const f: SheetFrameDoc = { id: ctx.newId('f'), seq, x: vp.x, y: vp.y, w: vp.w, h: vp.h, direction: 'plan', scale: '1:100', clip: null, border: vp.border === 'none' ? 'none' : 'solid' }
		if (vp.label && vp.label !== String(seq)) f.label = vp.label
		if (vp.locked) f.locked = true
		const where = `Viewport ${seq}${vp.label ? ` “${vp.label}”` : ''}`
		const s = vp.source
		const m = s.kind === 'outlets' ? ctx.modelForOutlets(s.outletsDocId) : null
		const bm = s.kind === 'risers' ? ctx.modelForRisers?.(s.risersDocId) ?? null : null
		if (bm) {   // a riser elevation → the building model's front elevation, fitted to it
			const fit = fitFrame(bm.objects, 'front', { w: vp.w, h: vp.h })
			f.modelId = bm.id; f.direction = 'front'
			if (fit) { f.scale = `1:${fit.n}`; f.view = fit.view }
			if (vp.annotations?.length) notes.push(`${where}: its ${vp.annotations.length} annotation${vp.annotations.length === 1 ? '' : 's'} were not imported (elevation annotations aren't mapped yet)`)
		} else if (m) {
			const { n: raw, centre } = outletsView(vp, planBounds(m)), n = Math.max(1, Math.round(raw))   // the frame renders at the rounded 1:N
			f.modelId = m.id; f.scale = `1:${n}`; f.view = viewCentredOn(centre, n)
			const skipped: Record<string, number> = {}
			for (const a of vp.annotations ?? []) {
				const e = annotationToEnt(a, f.id, n, ctx.newId('e'), ctx.layerFor?.(m, a.layerId), ctx.defaultColor)
				const what = a.kind === 'symbol' ? `${a.symbol ?? ''} symbol`.trim() : a.kind
				if (e) (shapes[m.id] ??= []).push(e); else skipped[what] = (skipped[what] ?? 0) + 1
			}
			const sk = Object.entries(skipped).map(([k, c]) => `${c} ${k}`).join(', ')
			if (sk) notes.push(`${where}: not imported — ${sk} (no Pages equivalent yet)`)
		} else {
			f.source = describeSource(vp)
			if (s.kind === 'model3d') f.direction = s.direction
			const why = s.kind === 'outlets' ? `no Pages model shows ${s.outletsDocId} yet — import that place's outlets first` : 'no Pages model for it yet'
			const ann = vp.annotations?.length ? `; its ${vp.annotations.length} annotation${vp.annotations.length === 1 ? '' : 's'} were not imported` : ''
			notes.push(`${where} (${f.source}): not mapped — ${why}${ann}`)
		}
		frames.push(f)
	})
	return { title: src.title || 'Imported sheet', drawingNumber: src.drawingNumber ?? '', paper, frames, shapes, notes }
}
