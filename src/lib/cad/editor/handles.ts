// HANDLES: grips that edit a property of the selected thing on the plan, not a node (Dave, Phase 6):
//   · a wall's openings — the middle square slides the hole along its segment, the end squares resize it (the other
//     end stays put), the round grip steps the swing: none → left → right → left (other face) → right (other face) → none;
//   · a section — the end squares move the cut line's ends, the round grip on the far edge sets how deep it sees.
// Each handle gives the edited entity for a plan point (`drag`) or for a click (`click`). Pure; tested in
// handles.test.ts.
import type { Pt } from '../domain/types'
import type { Entity, SectionCut } from '../domain/drawing'
import type { Opening, Shape } from '../domain/shapes'
import type { Prim } from '../views/display'
import { segEnds } from '../domain/openings'
import { sectionFrame } from '../views/section'

/** square = moves / stretches a position; round = sets a property (swing, depth); bar = a whole hole (drag slides it,
 *  click selects it); grip = resizes a drawn shape, drawn like its resize grips on the plan (a box's edges in elevations). */
export interface Handle {
	at: Pt
	shape: 'square' | 'round' | 'bar' | 'grip'
	/** A bar's two ends (it's picked anywhere along them). */
	span?: [Pt, Pt]
	drag?: (p: Pt, free: boolean) => Entity
	click?: () => Entity
	/** The undo step's name (default: Edit opening / Edit section). */
	label?: string
	/** The opening a click selects (a bar). */
	selects?: string
}

/** How far `p` is from a handle (along a bar, from its point otherwise). */
export function handleDistance(h: Handle, p: Pt): number {
	if (!h.span) return Math.hypot(h.at.x - p.x, h.at.y - p.y)
	const [a, b] = h.span, dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy
	const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0
	return Math.hypot(a.x + dx * t - p.x, a.y + dy * t - p.y)
}
/** The handle under `p`: points (squares / rounds) before bars, so a hole's end squares win over its bar. */
export function handleAt(hs: Handle[], p: Pt, tol: number): Handle | null {
	let best: Handle | null = null, bd = Infinity
	for (const h of hs) {
		const d = handleDistance(h, p)
		if (d > tol) continue
		const score = d + (h.shape === 'bar' ? tol : 0)
		if (score < bd) { best = h; bd = score }
	}
	return best
}

const r10 = (v: number, free: boolean) => (free ? v : Math.round(v / 10) * 10)
const SWINGS: Pick<Opening, 'swing' | 'flip'>[] = [{}, { swing: 'left' }, { swing: 'right' }, { swing: 'left', flip: true }, { swing: 'right', flip: true }]

export function handlesFor(e: Entity): { handles: Handle[]; decor: Prim[] } {
	if (e.type === 'shape' && e.role?.kind === 'wall') return { handles: openingHandles(e), decor: [] }
	if (e.type === 'section') return sectionHandles(e)
	return { handles: [], decor: [] }
}

function openingHandles(s: Shape): Handle[] {
	if (s.role?.kind !== 'wall') return []
	const role = s.role
	const out: Handle[] = []
	const withOp = (o: Opening, patch: Partial<Opening>): Shape => ({ ...s, role: { ...role, openings: role.openings.map((x) => (x.id === o.id ? { ...x, ...patch } : x)) } })
	for (const o of role.openings) {
		const e = segEnds(s, o.segId)
		if (!e) continue
		const w = s.geom.kind === 'path' ? ((s.geom.segs.find((x) => x.id === o.segId)?.section ?? s.section)?.w ?? 100) : 100
		const pt = (d: number, off = 0): Pt => ({ x: e.a.x + e.t.x * d + e.n.x * off, y: e.a.y + e.t.y * d + e.n.y * off })
		const along = (p: Pt) => (p.x - e.a.x) * e.t.x + (p.y - e.a.y) * e.t.y
		// the whole hole: drag anywhere along it to slide it, click to select it; the press point keeps its offset
		out.push({ at: pt(o.at), shape: 'bar', span: [pt(o.at - o.width / 2), pt(o.at + o.width / 2)], selects: o.id,
			drag: (p, free) => withOp(o, { at: Math.min(Math.max(r10(along(p), free), o.width / 2), e.len - o.width / 2) }) })
		// resize from either end, the other end fixed
		for (const side of [-1, 1]) {
			const fixed = o.at - (side * o.width) / 2
			out.push({ at: pt(o.at + (side * o.width) / 2), shape: 'square', drag: (p, free) => {
				const end = Math.min(Math.max(r10(along(p), free), 0), e.len)
				const width = Math.max(100, Math.abs(end - fixed))
				const lo = side > 0 ? fixed : fixed - width
				return withOp(o, { width, at: Math.min(Math.max(lo + width / 2, width / 2), e.len - width / 2) })
			} })
		}
		// swing: a round grip off the face it opens to. Click = the next swing; DRAG it to where the door leaf should be:
		// the side of the wall picks the face, the half of the hole picks the hinge (back over the wall = no swing)
		const i = SWINGS.findIndex((x) => x.swing === o.swing && !!x.flip === !!o.flip)
		const next = SWINGS[(i + 1) % SWINGS.length]
		out.push({ at: pt(o.at, (o.flip ? -1 : 1) * (w / 2 + Math.min(o.width / 2, 450))), shape: 'round',
			click: () => withOp(o, { swing: next.swing, flip: next.flip }),
			drag: (p) => {
				const off = (p.x - e.a.x) * e.n.x + (p.y - e.a.y) * e.n.y
				if (Math.abs(off) <= w / 2) return withOp(o, { swing: undefined, flip: undefined })
				return withOp(o, { swing: along(p) < o.at ? 'left' : 'right', flip: off < 0 || undefined })
			} })
	}
	return out
}

function sectionHandles(sec: SectionCut): { handles: Handle[]; decor: Prim[] } {
	const { f } = sectionFrame(sec)
	const look = { x: -f.n.x, y: -f.n.y }
	const mid = { x: (sec.a.x + sec.b.x) / 2, y: (sec.a.y + sec.b.y) / 2 }
	const far = (p: Pt) => ({ x: p.x + look.x * sec.depth, y: p.y + look.y * sec.depth })
	const snap = (p: Pt, free: boolean) => ({ x: r10(p.x, free), y: r10(p.y, free) })
	return {
		handles: [
			{ at: sec.a, shape: 'square', drag: (p, free) => ({ ...sec, a: snap(p, free) }) },
			{ at: sec.b, shape: 'square', drag: (p, free) => ({ ...sec, b: snap(p, free) }) },
			{ at: far(mid), shape: 'round', drag: (p, free) => {
				const d = (p.x - mid.x) * look.x + (p.y - mid.y) * look.y
				return { ...sec, depth: Math.max(100, free ? Math.round(d) : Math.round(d / 100) * 100) }
			} },
		],
		// what it sees, outlined while selected
		decor: [{ k: 'line', pts: [sec.a, sec.b, far(sec.b), far(sec.a)], closed: true, cls: 'section-extent' }],
	}
}
