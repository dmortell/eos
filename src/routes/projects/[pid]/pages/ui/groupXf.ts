// D13: the GROUP TRANSFORM box of a multi-selection — rotate every shape about the selection's barycentre,
// or scale them all (uniformly) about a pivot. Pure; the Viewport drags call these on the drag-start
// snapshots (`bases`) each move, so a gesture never accumulates rounding.
// Rotating: a polyline / dimension with no own rotation turns its POINTS (it stays node-editable); every other
// shape moves its rotation centre (the unrotated bbox centre — what render / hit rotate about) round the pivot
// and adds the angle to its `rot`, so a rotated rect / block / text / image turns rigidly with the group.
import type { Ent, Pt } from './geometry'
import { isLinearDim, dimDirDeg, dimModeFor } from './geometry'
import { rotatePt } from './hit'

/** A LINEAR dimension turned `deg`: it stays linear with its direction turned too — H ↔ V on a quarter turn, a ROTATED
 *  linear dim at any other angle (its frame follows its points, so the figure, dimExt and the text side carry over). */
function dimForTurn(e: Ent, deg: number): Ent {
	if (!isLinearDim(e)) return e
	const { dimAng: _a, ...rest } = e
	return { ...rest, ...dimModeFor(dimDirDeg(e) + deg) }
}

/** The group's pivot: the mean of the shapes' rotation centres (`centreOf` = rotCenter in the view). */
export function barycentre(ents: Ent[], centreOf: (e: Ent) => Pt): Pt {
	if (!ents.length) return [0, 0]
	let x = 0, y = 0
	for (const e of ents) { const c = centreOf(e); x += c[0]; y += c[1] }
	return [x / ents.length, y / ents.length]
}

/** The axis-aligned box around the shapes' ROTATED bboxes (`boxOf` = the view's unrotated bbox). */
export function groupBox(ents: Ent[], boxOf: (e: Ent) => [number, number, number, number]): [number, number, number, number] {
	let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
	for (const e of ents) {
		const [a, b, c, d] = boxOf(e), ctr: Pt = [(a + c) / 2, (b + d) / 2]
		for (const q of [[a, b], [c, b], [c, d], [a, d]] as Pt[]) {
			const r = e.rot ? rotatePt(q, ctr, e.rot) : q
			x0 = Math.min(x0, r[0]); y0 = Math.min(y0, r[1]); x1 = Math.max(x1, r[0]); y1 = Math.max(y1, r[1])
		}
	}
	return [x0, y0, x1, y1]
}

const normDeg = (d: number) => { const r = ((Math.round(d * 100) / 100) % 360 + 360) % 360; return r || undefined }

/** `e` turned `deg` (clockwise, y-down) about `c`. `centre` = its rotation centre in this view. */
export function rotateAbout(e: Ent, c: Pt, deg: number, centre: Pt): Ent {
	if (!deg) return e
	const R = (p: Pt) => rotatePt(p, c, deg)
	if ((e.type === 'polyline' || e.type === 'arc' || e.type === 'dim') && !e.rot) {
		if (e.type === 'dim') { const d = dimForTurn(e, deg); return { ...d, a: R(d.a!), b: R(d.b!) } }
		return { ...e, pts: e.pts?.map(R) }
	}
	const nc = R(centre), dx = nc[0] - centre[0], dy = nc[1] - centre[1]
	const t = (p?: Pt): Pt | undefined => (p ? [p[0] + dx, p[1] + dy] : p)
	return { ...e, a: t(e.a), b: t(e.b), pts: e.pts?.map((p) => t(p)!), leader: t(e.leader), rot: normDeg((e.rot ?? 0) + deg) }
}

/** `e` scaled by `s` about `c`: its points, a text's size, a block's scale, a dimension's text offset. */
export function scaleAbout(e: Ent, c: Pt, s: number): Ent {
	if (s === 1 || !(s > 0)) return e
	const S = (p?: Pt): Pt | undefined => (p ? [c[0] + (p[0] - c[0]) * s, c[1] + (p[1] - c[1]) * s] : p)
	const out: Ent = { ...e, a: S(e.a), b: S(e.b), leader: S(e.leader) }
	if (e.pts) out.pts = e.pts.map((p) => S(p)!)
	if (e.type === 'text') out.fontPt = Math.max(1, Math.round((e.fontPt ?? 8) * s * 2) / 2)
	if (e.type === 'insert') out.scale = Math.round((e.scale ?? 1) * s * 1000) / 1000
	if (e.dimOff !== undefined) out.dimOff = e.dimOff * s   // (a paper-mm dimTextOff stays: it is annotative)
	if (e.dimExt !== undefined) out.dimExt = Math.round(e.dimExt * s)   // the measured points scale with the rest
	if (e.leader === undefined) delete out.leader
	return out
}

/** Reflect `p` across the line through a and b. */
export function reflectPt(p: Pt, a: Pt, b: Pt): Pt {
	const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1
	const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2, fx = a[0] + t * dx, fy = a[1] + t * dy
	return [2 * fx - p[0], 2 * fy - p[1]]
}

/** MIRROR: `e` reflected across the line a→b (drawing coords). Point shapes (polyline / arc / dimension) reflect
 *  their points (a rotated one is baked first); a rect / ellipse keeps its shape and mirrors its rotation; a block
 *  toggles `mirror` and mirrors its rotation; text only moves, staying readable (AutoCAD MIRRTEXT 0), and so does an
 *  image (it can't be flipped). Each
 *  lands centred on its reflected centre (`centreOf` = rotCenter in the view). */
export function mirrorAbout(e: Ent, a: Pt, b: Pt, centreOf: (e: Ent) => Pt): Ent {
	const F = (p: Pt) => reflectPt(p, a, b)
	if (e.type === 'polyline' || e.type === 'arc' || e.type === 'dim') {
		const c = centreOf(e), W = (p: Pt) => (e.rot ? rotatePt(p, c, e.rot) : p)
		// a LINEAR dim stays linear, its direction reflected too (2φ − θ for a mirror line at φ): H / V across an H / V
		// line, H ↔ V across a 45° one, a rotated linear dim otherwise
		let d = e
		if (isLinearDim(e)) {
			const phi = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI, { dimAng: _a, ...rest } = e
			d = { ...rest, ...dimModeFor(2 * phi - dimDirDeg(e)) }
		}
		const out: Ent = e.type === 'dim' ? { ...d, a: F(W(d.a!)), b: F(W(d.b!)) } : { ...e, pts: e.pts?.map((p) => F(W(p))) }
		// a reflection turns the dim line's perpendicular round: the text / measured points stay on the mirrored side
		if (e.type === 'dim') for (const k of ['dimOff', 'dimTextOff', 'dimExt'] as const) if (d[k] !== undefined) out[k] = -d[k]!
		delete out.rot
		return out
	}
	const th = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI
	let out: Ent = { ...e }
	if (e.type === 'insert') { out.mirror = !e.mirror || undefined; out.rot = normDeg(2 * th - (e.rot ?? 0) + 180) }
	else if (e.type === 'rect' || e.type === 'ellipse') out.rot = normDeg(2 * th - (e.rot ?? 0))   // symmetric: a reflection is a rotation
	if (e.leader) out.leader = F(e.leader)
	const c0 = centreOf(e), c1 = F(c0), cNow = centreOf(out), dx = c1[0] - cNow[0], dy = c1[1] - cNow[1]
	const t = (p?: Pt): Pt | undefined => (p ? [p[0] + dx, p[1] + dy] : p)
	out = { ...out, a: t(out.a), b: t(out.b) }
	if (!out.rot) delete out.rot
	if (!out.mirror) delete out.mirror
	return out
}

/** The uniform factor a corner drag gives: the pointer projected on the pivot→corner diagonal. */
export function cornerScale(pivot: Pt, corner: Pt, p: Pt): number {
	const dx = corner[0] - pivot[0], dy = corner[1] - pivot[1], L2 = dx * dx + dy * dy
	if (!L2) return 1
	return Math.max(0.02, ((p[0] - pivot[0]) * dx + (p[1] - pivot[1]) * dy) / L2)
}
