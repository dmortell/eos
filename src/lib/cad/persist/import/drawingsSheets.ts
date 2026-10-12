// Legacy drawings import, Sheets half: a Sheets-tool sheet (projects/{pid}/sheets/{id}) → a cad sheet, its viewport and
// the viewport's annotations as notes TIED to the cad viewport. Pure.
//
// Why no transform: a Sheets viewport draws its source in "real mm" — an Outlets plan in plan mm (y down), a model3d
// elevation in (u, −z) with u from the y-up model3d BASIS — and its annotations are stored in that space. Those are
// exactly cad's view mm (views/space.ts: plan = plan mm; elevation x = u, y = −z with the named frames of ADR 0004):
// model3d front u = x, left u = −y_m3 = y_cad, rear u = −x, right u = y_m3 = −y_cad — the same u cad's frames give.
// So annotation points copy across; only sizes in points become paper mm. The one exception: a model3d elevation
// clipped to a box comes across as a SECTION on that box (clipSection, so nothing in front of the box shows), whose
// view x is the elevation's shifted by a constant — its notes and its centre shift by that.
import type { Id, Pt } from '../../domain/types'
import type { Viewport } from '../../domain/drawing'
import type { Shape, Geometry, LineEnd } from '../../domain/shapes'
import { namedFrame, type ElevDir } from '../../domain/conventions'
import { SCALES } from '../../views/sheet'

/* eslint-disable @typescript-eslint/no-explicit-any -- legacy docs are untyped Firestore data */
export interface LegacyAnn {
	id: string; kind: string; x: number; y: number; x2?: number; y2?: number; w?: number; h?: number; rotation?: number
	text?: string; fontPt?: number; align?: 'left' | 'center' | 'right'; labelPos?: 'start' | 'mid' | 'end'; border?: unknown
	symbol?: string; flip?: boolean; start?: string; end?: string; dash?: string; color?: string; fill?: string
	link?: { ref?: string }; layerId?: string; arms?: Record<string, string | null | undefined>
	outlet?: { ports?: number; usage?: string; mount?: 'wall' | 'floor' | 'box' }; legend?: { title?: string }
}
export type LegacySource = { kind: string; outletsDocId?: string; showPdf?: boolean; modelId?: number; direction?: string; clip?: Clip; [k: string]: unknown }
export interface LegacyVp {
	id: string; x: number; y: number; w: number; h: number; label?: string; scale?: number | null; contentOffsetMm?: Pt | null
	border?: 'none' | 'thin'; layerOverrides?: Record<string, { hidden?: boolean }>; annotations?: LegacyAnn[]; source: LegacySource
}
export interface LegacySheetDoc {
	id: string; title?: string; drawingNumber?: string; sortOrder?: number
	paper?: { paperSize?: string; orientation?: string; margins?: number }
	titleBlock?: { fields?: Record<string, string | null> } | null
	revisions?: { code: string; date?: string; note?: string; by?: string }[]; currentRevision?: string
	viewports?: LegacyVp[]
}
/** A model3d clip box, model3d mm (y UP). */
export interface Clip { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number }

export const PT = 25.4 / 72
/** The Sheets tool drew an annotation with no colour in red. */
const RED = '#dc2626'
const DIRS: ElevDir[] = ['front', 'rear', 'left', 'right']
const r2 = (v: number) => Math.round(v * 100) / 100
const tidy = <T extends object>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T

/** What a Sheets viewport's source shows as a cad view, or why it can't come across. */
export function specOf(src: LegacySource): { spec: Viewport['view']['spec'] } | { skip: string } {
	if (src.kind === 'outlets') return { spec: { kind: 'plan' } }
	if (src.kind === 'model3d') {
		const d = src.direction ?? 'plan'
		if (d === 'plan') return { spec: { kind: 'plan' } }
		if ((DIRS as string[]).includes(d)) return { spec: { kind: 'elevation', dir: d as ElevDir } }
		return { skip: `a 3D (${d}) view — cad has no 3D viewport` }
	}
	return { skip: `a ${src.kind} viewport — not imported` }
}

/** The view-mm box a model3d viewport framed to (its clip box seen from its direction, padded as the Sheets tool did). */
export function clipFrame(dir: string, c: Clip): { x: number; y: number; w: number; h: number } {
	const [u0, u1] = dir === 'front' ? [c.x0, c.x1] : dir === 'rear' ? [-c.x1, -c.x0] : dir === 'left' ? [-c.y1, -c.y0] : dir === 'right' ? [c.y0, c.y1] : [c.x0, c.x1]
	// plan: y_cad = −y_m3; elevations: view y = −z
	const [v0, v1] = dir === 'plan' ? [-c.y1, -c.y0] : [-c.z1, -c.z0]
	const pad = Math.max(2, (u1 - u0 + v1 - v0) * 0.01)
	return { x: u0 - pad, y: v0 - pad, w: u1 - u0 + 2 * pad, h: v1 - v0 + 2 * pad }
}

/** A model3d elevation's clip box as a cad SECTION cut: along the box's NEAR face as seen from `dir` (every view looks
 *  along −n of its frame, ADR 0004), across the box's width, `depth` = the box's depth that way — so the section shows
 *  what is inside the box and nothing in front of it. a → b runs the way the named elevation's u runs, so the section
 *  (looking to the line's left, no flip) looks the same way as the elevation did. `du` = what to add to a view x in the
 *  named elevation to get the section's (its u starts at a; view y = −z in both). */
export function clipSection(dir: ElevDir, c: Clip): { a: Pt; b: Pt; depth: number; du: number } {
	const f = namedFrame(dir)
	const dot = (p: Pt, v: Pt) => p.x * v.x + p.y * v.y
	// the box's footprint in cad plan mm (y_cad = −y_m3)
	const corners = [{ x: c.x0, y: -c.y0 }, { x: c.x1, y: -c.y0 }, { x: c.x1, y: -c.y1 }, { x: c.x0, y: -c.y1 }]
	const nearN = Math.max(...corners.map((p) => dot(p, f.n))), farN = Math.min(...corners.map((p) => dot(p, f.n)))
	const face = corners.filter((p) => Math.abs(dot(p, f.n) - nearN) < 1e-6).sort((p, q) => dot(p, f.t) - dot(q, f.t))
	const a = face[0], b = face.at(-1)!
	return { a, b, depth: nearN - farN, du: -dot(a, f.t) || 0 }
}

/** A section's name from its sheet's title: "Comms1 elevation" → "Comms1", "3303 Comms 2 Elevation" → "Comms 2" (the
 *  word "elevation" and a leading office number dropped), kept unique among `taken`. */
export function sectionNameFor(title: string, taken: Set<string>): string {
	const base = title.replace(/\belevations?\b/gi, '').replace(/^\s*\d{3,}\s+/, '').replace(/\s+/g, ' ').trim() || 'Section'
	let name = base
	for (let i = 2; taken.has(name); i++) name = `${base} (${i})`
	return name
}

/** The standard scale (views/sheet.ts SCALES) nearest an odd one, by ratio: 1:20.16 → 1:20, 1:35.74 → 1:50. */
export function nearestScale(n: number): number {
	return SCALES.reduce((best, s) => (Math.abs(Math.log(s / n)) < Math.abs(Math.log(best / n)) ? s : best), SCALES[0])
}

/** The cad viewport for a Sheets viewport:the same window on the paper, the same 1:N and the same part of the view.
 *  `fit` places one the Sheets tool fitted to its content (scale 0) — or, with a scale but no pan, centres it —
 *  using cad's content; without it, the annotations' middle at 1:100. `needsFit` says it was placed that way. */
export function viewportOf(v: LegacyVp, levelId: Id, id: Id, o: { frozen?: Id[]; fit?: (vp: Viewport) => Pick<Viewport, 'centre' | 'scale'> } = {}): { vp: Viewport; fitted: boolean } | { skip: string } {
	const sp = specOf(v.source)
	if ('skip' in sp) return sp
	const base: Viewport = tidy({
		id, view: { levelId, spec: sp.spec }, rect: { x: r2(v.x), y: r2(v.y), w: r2(v.w), h: r2(v.h) }, scale: 100, centre: { x: 0, y: 0 },
		label: v.label || undefined, border: v.border === 'none' ? false : undefined, frozen: o.frozen?.length ? o.frozen : undefined,
	})
	const s = v.scale && v.scale > 0 ? v.scale : 0
	const clip = v.source.kind === 'model3d' && v.source.clip ? clipFrame(v.source.direction ?? 'plan', v.source.clip) : null
	const at = (c: Pt, scale: number): Viewport => ({ ...base, scale: r2(scale), centre: { x: r2(c.x), y: r2(c.y) } })
	if (s) {
		// a set scale draws its window from the top-left (`contentOffsetMm`, else the content's corner)
		const off = v.contentOffsetMm ?? (clip ? { x: clip.x, y: clip.y } : null)
		if (off) return { vp: at({ x: off.x + (v.w * s) / 2, y: off.y + (v.h * s) / 2 }, s), fitted: false }
	} else if (clip && v.w > 0 && v.h > 0) {
		// fitted to the clip box, centred
		return { vp: at({ x: clip.x + clip.w / 2, y: clip.y + clip.h / 2 }, Math.max(clip.w / v.w, clip.h / v.h)), fitted: false }
	}
	if (o.fit) { const f = o.fit({ ...base, scale: s || 100 }); return { vp: at(f.centre, s || f.scale), fitted: true } }
	const pts = (v.annotations ?? []).flatMap((a) => [{ x: a.x, y: a.y }, ...(a.x2 !== undefined ? [{ x: a.x2, y: a.y2 ?? a.y }] : [])])
	const mid = pts.length ? { x: (Math.min(...pts.map((p) => p.x)) + Math.max(...pts.map((p) => p.x))) / 2, y: (Math.min(...pts.map((p) => p.y)) + Math.max(...pts.map((p) => p.y))) / 2 } : { x: 0, y: 0 }
	return { vp: at(mid, s || 100), fitted: true }
}

/** The Sheets-tool layer an annotation is on (an unknown id falls back to 'annotations', as there). */
export function annLayer(a: LegacyAnn, known: Set<string>): string {
	return a.layerId && known.has(a.layerId) ? a.layerId : 'annotations'
}

// ── annotations → notes tied to the viewport ─────────────────────────────────────────────────────────────────────────

type Box = { x: number; y: number; w: number; h: number }
const fontMm = (a: LegacyAnn, den: number) => (a.fontPt ?? 8) * PT * den

/** An annotation's box in view mm (text and callouts size to their words, as the Sheets tool measured them). */
export function annBox(a: LegacyAnn, den: number): Box {
	if (a.kind === 'text' || a.kind === 'callout') {
		const f = fontMm(a, den), lines = (a.text ?? '').split('\n')
		return { x: a.x, y: a.y, w: a.w ?? Math.max(1, ...lines.map((l) => l.length)) * f * 0.58, h: a.h ?? lines.length * f * 1.3 }
	}
	const d = a.kind === 'symbol' ? { w: 1000, h: 1000 } : { w: 3000, h: 2000 }
	return { x: a.x, y: a.y, w: a.w ?? d.w, h: a.h ?? d.h }
}

function turn(p: Pt, c: Pt, deg: number | undefined): Pt {
	if (!deg) return p
	const r = (deg * Math.PI) / 180, cs = Math.cos(r), sn = Math.sin(r), dx = p.x - c.x, dy = p.y - c.y
	return { x: c.x + dx * cs - dy * sn, y: c.y + dx * sn + dy * cs }
}

const ENDS = new Set(['arrow', 'dot', 'tick'])
const DASHES = new Set(['dashed', 'dotted', 'dashdot'])
const ARM_ROT: Record<string, number> = { n: 0, e: 90, s: 180, w: 270 }

/** One annotation as cad notes (most are one shape; a faceplate or a door is a few). `skip` = why it isn't brought
 *  across. Points stay in view mm; text sizes become paper mm. */
export function annotationShapes(a: LegacyAnn, owner: { sheetId: Id; vpId: Id }, den: number, key: string, makeId: () => Id): { shapes: Shape[]; skip?: string } {
	const color = a.color ?? RED
	const fill = a.fill && a.fill !== 'none' ? a.fill : undefined
	const dash = a.dash && DASHES.has(a.dash) ? a.dash : undefined
	const shape = (geom: Geometry, style: Shape['style'] = { stroke: color }): Shape => tidy({ type: 'shape', id: makeId(), ...owner, geom, style: style && tidy(style), importedFrom: key }) as Shape
	const line = (pts: Pt[], ends?: { a?: LineEnd; b?: LineEnd }): Shape => {
		const nodes = pts.map((p) => ({ id: makeId(), x: p.x, y: p.y, z: 0 }))
		const segs = nodes.slice(1).map((n, i) => ({ id: makeId(), a: nodes[i].id, b: n.id }))
		return shape({ kind: 'path', nodes, segs }, { stroke: color, dash, ends: ends && (ends.a || ends.b) ? tidy(ends) : undefined })
	}
	const text = (at: Pt, t: string, sizeMm: number, align?: 'centre' | 'right', rot?: number): Shape =>
		shape(tidy({ kind: 'text' as const, at, text: t, sizeMm: r2(sizeMm), align, rot: rot || undefined }))
	const insert = (blockId: string, at: Pt, scale: number, attrs: Record<string, string>, rot?: number): Shape =>
		shape(tidy({ kind: 'insert' as const, blockId, at, scale: r2(scale) || 1, attrs, rot: rot || undefined }))
	const b = annBox(a, den), c = { x: b.x + b.w / 2, y: b.y + b.h / 2 }
	const end = (e: string | undefined, dflt: string) => { const v = e ?? dflt; return ENDS.has(v) ? (v as LineEnd) : undefined }

	switch (a.kind) {
		case 'text': {
			if (!a.text?.trim()) return { shapes: [], skip: 'empty text' }
			const ax = a.align === 'center' ? b.x + b.w / 2 : a.align === 'right' ? b.x + b.w : b.x
			const at = turn({ x: ax, y: b.y + fontMm(a, den) }, c, a.rotation)
			return { shapes: [text(at, a.text, (a.fontPt ?? 8) * PT, a.align === 'center' ? 'centre' : a.align === 'right' ? 'right' : undefined, a.rotation)] }
		}
		case 'rect': return { shapes: [shape(tidy({ kind: 'rect' as const, centre: c, size: { x: b.w, y: b.h }, rot: a.rotation || undefined }), { stroke: color, fill, dash })] }
		case 'ellipse': return { shapes: [shape(tidy({ kind: 'ellipse' as const, centre: c, rx: b.w / 2, ry: b.h / 2, rot: a.rotation || undefined }), { stroke: color, fill, dash })] }
		case 'cloud': {
			const pts = [{ x: b.x, y: b.y }, { x: b.x + b.w, y: b.y }, { x: b.x + b.w, y: b.y + b.h }, { x: b.x, y: b.y + b.h }].map((p) => turn(p, c, a.rotation))
			return { shapes: [shape({ kind: 'cloud', pts, arcMm: r2(Math.max(150, Math.min(b.w, b.h) / 6) / den) }, { stroke: color, fill })] }
		}
		case 'line': case 'arrow': {
			const p2 = { x: a.x2 ?? a.x, y: a.y2 ?? a.y }
			if (p2.x === a.x && p2.y === a.y) return { shapes: [], skip: 'a line of no length' }
			const out = [line([{ x: a.x, y: a.y }, p2], { a: end(a.start, 'none'), b: end(a.end, 'none') })]
			if (a.text?.trim()) {
				// its label along the line (Sheets: just above it, at the start / middle / end)
				const t = a.labelPos === 'start' ? 0.15 : a.labelPos === 'end' ? 0.85 : 0.5, ang = (Math.atan2(p2.y - a.y, p2.x - a.x) * 180) / Math.PI
				const f = fontMm(a, den), at = { x: a.x + (p2.x - a.x) * t + Math.sin((ang * Math.PI) / 180) * f * 0.4, y: a.y + (p2.y - a.y) * t - Math.cos((ang * Math.PI) / 180) * f * 0.4 }
				out.push(text(at, a.text, (a.fontPt ?? 8) * PT, 'centre', ang))
			}
			return { shapes: out }
		}
		case 'dimension': {
			const p2 = { x: a.x2 ?? a.x, y: a.y2 ?? a.y }
			if (p2.x === a.x && p2.y === a.y) return { shapes: [], skip: 'a dimension of no length' }
			// the Sheets dimension is its own line (no offset, no extension lines) labelled with its length
			return { shapes: [shape({ kind: 'dimension', a: { x: a.x, y: a.y }, b: p2, offset: 0, mode: 'aligned' }, { stroke: color })] }
		}
		case 'callout': {
			const words = a.text ?? ''
			if (a.x2 === undefined || a.x2 === null) return words.trim() ? annotationShapes({ ...a, kind: 'text' }, owner, den, key, makeId) : { shapes: [], skip: 'empty callout' }
			const tip = { x: a.x2, y: a.y2 ?? a.y }, y = b.y + 1.6 * den
			// cad puts a leader's words beside its last point, going the way its last leg goes: end it at the box's edge
			const pts = tip.x > b.x + b.w + den ? [tip, { x: b.x + b.w + den, y }]
				: tip.x <= b.x - den ? [tip, { x: b.x - den, y }]
				: [tip, { x: b.x - 2 * den, y }, { x: b.x - den, y }]
			const bd = a.border === true || a.border === 'box' ? 'box' : a.border === 'underline' ? 'underline' : undefined
			return { shapes: [shape(tidy({ kind: 'leader' as const, pts, text: words || undefined, border: bd }))] }
		}
		case 'legend': return { shapes: [shape(tidy({ kind: 'legend' as const, at: { x: a.x, y: a.y }, title: a.legend?.title || undefined, sizeMm: r2((a.fontPt ?? 8) * PT) }))] }
		case 'symbol': {
			const R = Math.min(b.w, b.h) / 2
			switch (a.symbol) {
				case 'elevation': {
					// one tag per arm the Sheets tag showed (none set = its single south arm), its pointer turned that way
					const arms = a.arms ?? (a.text ? { s: a.text } : { s: '' })
					const out = Object.entries(arms).filter(([d, t]) => t !== null && t !== undefined && d in ARM_ROT)
						.map(([d, t]) => insert('builtin:elevation-tag', c, (R * 0.5) / den / 4, { NUMBER: t ?? '', ON_SHEET: a.link?.ref ?? '' }, ARM_ROT[d]))
					return out.length ? { shapes: out } : { shapes: [], skip: 'an elevation tag with no arm' }
				}
				case 'section': case 'detail':
					return { shapes: [insert('builtin:detail', c, R / den / 5, { NUMBER: a.link?.ref ?? '?', ON_SHEET: '' })] }
				case 'outlet': {
					const o = a.outlet ?? {}, id = o.mount === 'wall' ? 'builtin:outlet-wall' : o.mount === 'floor' ? 'builtin:outlet-floor' : 'builtin:outlet-box'
					return { shapes: [insert(id, c, (R * 0.52) / den / 1.5, { LABEL: a.text ?? '', PORTS: String(o.ports ?? 2), USAGE: o.usage ?? '' })] }
				}
				case 'faceplate': {
					// a plate seen face on (an elevation), two data ports
					const pw = b.w * 0.6, ph = b.h * 0.85, ps = pw * 0.32
					const port = (y: number) => shape({ kind: 'rect', centre: { x: c.x, y }, size: { x: ps, y: ps } }, { stroke: color, fill: color })
					return { shapes: [shape({ kind: 'rect', centre: c, size: { x: pw, y: ph } }, { stroke: color, fill: fill ?? '#ffffff' }), port(c.y - ph * 0.3 + ps / 2), port(c.y + ph * 0.3 - ps / 2)] }
				}
				case 'door': {
					// the leaf (up from the hinge) and its swing to the floor line
					const dir = a.flip ? -1 : 1, hx = a.flip ? b.x + b.w : b.x, hy = b.y + b.h
					return { shapes: [line([{ x: hx, y: hy }, { x: hx, y: b.y }]), shape({ kind: 'arc', centre: { x: hx, y: hy }, r: b.h, start: dir > 0 ? 270 : 180, end: dir > 0 ? 0 : 270 })] }
				}
				case 'north': return { shapes: [line([{ x: c.x, y: c.y + R }, { x: c.x, y: c.y - R }], { b: 'arrow' }), text({ x: c.x, y: c.y - R }, 'N', R / den, 'centre')] }
				default: return { shapes: [], skip: `a ${a.symbol ?? 'unknown'} symbol` }
			}
		}
		default: return { shapes: [], skip: `a ${a.kind}` }
	}
}
