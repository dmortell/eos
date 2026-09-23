// Grip definitions + grip-pick for the Pages tool (review.md §R1, step 4). Extracted from
// Viewport.svelte so the grip geometry is testable and shared. Grip-pick takes a Mapper (built ONCE per
// press) and reuses m.toClient per corner, so an N-grip object costs one layout read, not N (the P1 fix).
// The entity/model grip builders (gripsFor/modelGrips/…) move here in later slices; this first slice is
// the self-contained section-marker grips.
import type { Pt, Ent } from './geometry'
import type { Clip, Obj } from '../3dview/types'
import type { Mapper } from './mapper'
import type { ViewCtx } from './view'
import { sectionCorners, prismRect, prismTilted, graphNodeDraw, rotatePt, bbox, rotCenter, isFlatElev, flatXSpan, type GN } from './hit'
import { ELEV_BASIS, elevU, elevUInv, textBox, STYLE_DEFAULTS } from './geometry'
import { doorGeom } from '../3dview/projection'

const PT_MM = 0.352778   // mm per typographic point (matches hit.ts/geometry; shared constants.PT_MM later)

/** What the entity-grip builders need beyond the ViewCtx: the screen-constant grip length (model mm), a
 *  live Shift getter (so a re-constrain re-reads it), and the id of the image being CROP-edited (or null). */
export type GripOpts = { gripMm: number; shift: () => boolean; imgCropId: string | null }

/** Resize a section clip by dragging a corner to p, holding `anchor` (the opposite corner, captured at
 *  grip-down) fixed — x/y only, z stays the section's cut band. Returns the new clip. */
export function resizeSectionClip(c: Clip, p: Pt, anchor: Pt): Clip {
	return { ...c, x0: Math.round(Math.min(p[0], anchor[0])), x1: Math.round(Math.max(p[0], anchor[0])), y0: Math.round(Math.min(p[1], anchor[1])), y1: Math.round(Math.max(p[1], anchor[1])) }
}

/** Which corner grip of the selected section a press grabs (14px screen tolerance), with a resize apply
 *  about the fixed opposite corner. One getBoundingClientRect for the whole 4-corner pass (P1). null =
 *  no grip under the cursor. */
export function pickSectionGrip(m: Mapper, sel: { id: string; clip: Clip }, clientX: number, clientY: number): { id: string; apply: (p: Pt) => Clip } | null {
	const cs = sectionCorners(sel.clip), c0 = { ...sel.clip }
	for (let gi = 0; gi < 4; gi++) {
		const sp = m.toClient(cs[gi][0], cs[gi][1])
		if (Math.hypot(sp.x - clientX, sp.y - clientY) < 14) return { id: sel.id, apply: (p: Pt) => resizeSectionClip(c0, p, cs[(gi + 2) % 4]) }
	}
	return null
}

// ── the ONE rotate-handle rule (entities AND model objects) ──
/** Shift constrains every rotate handle to 15° steps. */
export const ROT_SNAP_DEG = 15
export const snapAngle = (deg: number, shift: boolean): number => (shift ? Math.round(deg / ROT_SNAP_DEG) * ROT_SNAP_DEG : deg)
/** The angle a rotate handle sets, from the pointer `p` about the centre `c`: 0° = the handle straight
 *  above the centre (where every rotate handle is drawn), clockwise in y-down drawing space, whole degrees,
 *  Shift → 15° steps. `signed` gives −180..180 (a tilt) instead of 0..359. Used by the entity rotate handle
 *  (`rotGripLocal`), the prism rotate handle (plan) and the prism tilt handle (elevation). */
export function handleAngle(c: Pt, p: Pt, shift: boolean, signed = false): number {
	let deg = snapAngle(Math.round((Math.atan2(p[1] - c[1], p[0] - c[0]) * 180) / Math.PI + 90), shift)
	deg = ((deg % 360) + 360) % 360
	return signed && deg > 180 ? deg - 360 : deg
}

// ── model-object grips (prism resize/rotate/tilt/swing + wall/conduit node handles) ──
// The grip `apply` closures MUTATE the store object in place — that is the existing contract with the
// snapModels undo step (the caller opens/closes the history step around the drag).

/** A model-object grip. `apply(p, origin)` mutates the store object; `node`/`obj` ride wall/conduit node
 *  grips so an Alt-press can branch a new segment. */
export type MGrip = { x: number; y: number; apply: (p: Pt, origin?: Pt) => void; node?: GN; obj?: Obj }

/** The prism's 4 corner grips in drawing coords, order tl,tr,br,bl (matches prismRect's face/footprint;
 *  in a rotated plan view they follow the rotation). */
export function prismCorners(ctx: ViewCtx, o: Obj): Pt[] {
	const r = prismRect(ctx, o); if (!r) return []
	let cs: Pt[] = [[r.x0, r.y0], [r.x1, r.y0], [r.x1, r.y1], [r.x0, r.y1]]
	if (ctx.isPlan && o.type === 'prism' && o.rot) { const c: Pt = [(r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2]; cs = cs.map((p) => rotatePt(p, c, o.rot!)) }
	return cs
}

/** Resize a prism by dragging corner `gi` to p, holding `anchor` (opposite corner, captured at grip-down)
 *  fixed. Plan edits footprint x/y/w/d; elevation edits the on-axis size (via elevUInv) + z/h. `rnd`
 *  grid-snaps. Mutates `o`. */
export function applyPrismGrip(ctx: ViewCtx, o: Extract<Obj, { type: 'prism' }>, gi: number, p: Pt, anchor: Pt, rnd: (v: number) => number) {
	void gi
	if (ctx.isElev) {
		const ax = ELEV_BASIS[ctx.elevDir].axis
		const c1 = elevUInv(ctx.elevDir, p[0], ctx.cx, ctx.cy), c2 = elevUInv(ctx.elevDir, anchor[0], ctx.cx, ctx.cy)
		const lo = rnd(Math.min(c1, c2)), size = Math.max(1, rnd(Math.abs(c1 - c2)))
		if (ax === 0) { o.x = lo; o.w = size } else { o.y = lo; o.d = size }
		const baseY = Math.max(p[1], anchor[1]), topY = Math.min(p[1], anchor[1])
		o.z = Math.max(0, rnd(ctx.ground - baseY)); o.h = Math.max(1, rnd(baseY - topY))
	} else {
		o.x = rnd(Math.min(p[0], anchor[0])); o.w = Math.max(1, rnd(Math.abs(p[0] - anchor[0])))
		o.y = rnd(Math.min(p[1], anchor[1])); o.d = Math.max(1, rnd(Math.abs(p[1] - anchor[1])))
	}
}

/** Grips of the selected model object. prism = 4 resize corners (dropped when tilted) + a rotate handle
 *  (plan) / tilt handle (elevation) / door-swing handle; wall/conduit = one node handle each (drag =
 *  reshape via `opts.applyNode`, i.e. the caller's graphNodeApply). `opts.rnd` grid-snaps prism edits;
 *  `opts.shift` is the live Shift getter — every angle handle snaps to 15° with it (`handleAngle`), the
 *  same rule as an entity's rotate handle. */
export function modelGrips(ctx: ViewCtx, o: Obj, opts: { rnd: (v: number) => number; applyNode: (n: GN, p: Pt, origin?: Pt) => void; shift?: () => boolean }): MGrip[] {
	const shift = () => !!opts.shift?.()
	if (o.type === 'prism') {
		const cs = prismTilted(o) ? [] : prismCorners(ctx, o)   // a tilted prism drops its axis-aligned corners (B10)
		const grips: MGrip[] = cs.map((c, gi) => ({ x: c[0], y: c[1], apply: (p: Pt) => applyPrismGrip(ctx, o, gi, p, cs[(gi + 2) % 4], opts.rnd) }))
		if (ctx.isPlan && o.open !== 'door') {   // rotate handle above the top-centre, following the rotation
			const cx = o.x + o.w / 2, cy = o.y + o.d / 2, off = o.d / 2 + Math.max(o.w, o.d) * 0.35
			const hp = o.rot ? rotatePt([cx, cy - off], [cx, cy], o.rot) : [cx, cy - off] as Pt
			grips.push({ x: hp[0], y: hp[1], apply: (p: Pt) => { o.rot = handleAngle([cx, cy], p, shift()) } })
		}
		if (ctx.isElev && !o.open) {   // elevation rotate handle → in-plane tilt (front/rear → rotY, left/right → rotX)
			const r = prismRect(ctx, o)!
			const C: Pt = [(r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2]
			const off = (r.y1 - r.y0) / 2 + Math.max(r.x1 - r.x0, r.y1 - r.y0) * 0.35
			const ax = ELEV_BASIS[ctx.elevDir].axis, cur = ax === 0 ? (o.rotY ?? 0) : (o.rotX ?? 0)
			const hp = cur ? rotatePt([C[0], C[1] - off], C, cur) : [C[0], C[1] - off] as Pt
			grips.push({ x: hp[0], y: hp[1], apply: (p: Pt) => {
				const a = handleAngle(C, p, shift(), true)   // −180..180: a natural tilt range
				if (ax === 0) o.rotY = a || undefined; else o.rotX = a || undefined
			} })
		}
		if (ctx.isPlan && o.open === 'door') {   // door SWING handle at the leaf tip — drag to set the swing angle
			const g = doorGeom(o), a = (o.swing ?? 90) * Math.PI / 180
			const tx = g.hx + g.L * (Math.cos(a) * g.ux + Math.sin(a) * g.vx), ty = g.hy + g.L * (Math.cos(a) * g.uy + Math.sin(a) * g.vy)
			grips.push({ x: tx, y: ty, apply: (p: Pt) => {
				const ang = Math.atan2((p[0] - g.hx) * g.vx + (p[1] - g.hy) * g.vy, (p[0] - g.hx) * g.ux + (p[1] - g.hy) * g.uy) * 180 / Math.PI
				o.swing = Math.max(0, Math.min(180, snapAngle(Math.round(ang), shift())))   // Shift → 15° like every angle handle
			} })
		}
		return grips
	}
	if (o.type === 'wall' || o.type === 'conduit') {
		return (o.nodes as GN[]).map((n) => { const d = graphNodeDraw(ctx, n); return { x: d[0], y: d[1], node: n, obj: o, apply: (p: Pt, origin?: Pt) => opts.applyNode(n, p, origin) } })
	}
	return []
}

/** Which grip of the selected object a press grabs (14px screen tol). One layout read for the whole pass
 *  (P1): the caller builds the grip list + mapper once. null = no grip. */
export function pickModelGrip(m: Mapper, grips: MGrip[], clientX: number, clientY: number): MGrip | null {
	for (const g of grips) { const sp = m.toClient(g.x, g.y); if (Math.hypot(sp.x - clientX, sp.y - clientY) < 14) return g }
	return null
}

// ── entity grips (Kestrel-style handles on the selected annotation entity) ──
// `apply(p)` returns the edited Ent (immutable, unlike model grips). For a ROTATED shape, `anchor` (the
// world-fixed opposite corner) + `resize(dragged, anchor)` drive a world-anchored resize; `square` opts
// the shift-constrain into the shape's own frame; `rotate` marks the rotate handle.
export type Grip = { x: number; y: number; apply: (p: Pt) => Ent; rotate?: boolean; anchor?: Pt; resize?: (d: Pt, f: Pt) => Ent; square?: boolean }

// R4 (review.md §R4): `'line'` is retired — a straight 2-point entity is now a 'polyline' with `pts.length
// === 2` (a migrated line, or a 2-click Line-tool polyline). It keeps every grip behaviour the old 'line'
// type had (endpoint drag with a world-anchored resize, a rotate handle, Shift-15°) — a 3+-point polyline
// (a Wall/Trunk/Pipe outline drawn via the multi-click Line tool) has no such "line" semantics: no rotate
// handle, no anchored resize, just a plain per-vertex drag grip (unchanged from before this commit).
const is2PtPolyline = (e: Ent): boolean => e.type === 'polyline' && (e.pts?.length ?? 0) === 2

// Which entity kinds get a rotate HANDLE. Excluded: flat-elev floor projections and an image mid-CROP.
const ROTATABLE = new Set(['rect', 'ellipse', 'image'])
export const canRotate = (ctx: ViewCtx, e: Ent, imgCropId: string | null): boolean =>
	(ROTATABLE.has(e.type) || is2PtPolyline(e)) && !isFlatElev(ctx, e) && !(e.type === 'image' && imgCropId === e.id)

/** The rotate handle in the entity's LOCAL (un-rotated) frame; gripsFor rotates its POSITION with the
 *  shape but leaves apply on the RAW pointer. `gripMm` = the screen-constant handle length; `shift` is a
 *  live getter so a re-constrain re-reads Shift. */
export function rotGripLocal(ctx: ViewCtx, e: Ent, gripMm: number, shift: () => boolean): Grip {
	const [x0, y0, x1, y1] = bbox(ctx, e)
	const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2
	return { x: cx, y: y0 - gripMm * 6, rotate: true, apply: (p: Pt) => ({ ...e, rot: handleAngle([cx, cy], p, shift()) }) }
}

/** A flat object in elevation is a ground line; drag its min/max x-edge end (via elevU/elevUInv), keeping
 *  it flat. A 3+-point polyline has no simple edge (left as-is); a 2-point one uses `pts` like `a`/`b`. */
export function setFlatX(ctx: ViewCtx, e: Ent, edge: 'min' | 'max', u: number): Ent {
	if (e.type === 'polyline' && !is2PtPolyline(e)) return e
	const [pa, pb]: [Pt, Pt] = e.type === 'polyline' ? [e.pts![0], e.pts![1]] : [e.a!, e.b!]
	const ax = ELEV_BASIS[ctx.elevDir].axis
	const ua = elevU(ctx.elevDir, pa[ax], ctx.cx, ctx.cy), ub = elevU(ctx.elevDir, pb[ax], ctx.cx, ctx.cy)
	const aIsMin = ua <= ub, moveA = (edge === 'min') === aIsMin
	const m = elevUInv(ctx.elevDir, u, ctx.cx, ctx.cy)
	const setPt = (pt: Pt): Pt => ax === 0 ? [m, pt[1]] : [pt[0], m]
	if (e.type === 'polyline') return { ...e, pts: moveA ? [setPt(pa), pb] : [pa, setPt(pb)] }
	return moveA ? { ...e, a: setPt(e.a!) } : { ...e, b: setPt(e.b!) }
}

/** The entity's grips in its LOCAL (un-rotated) frame; gripsFor then rotates them for a rotated shape. */
export function gripsLocal(ctx: ViewCtx, e: Ent, opts: GripOpts): Grip[] {
	if (isFlatElev(ctx, e)) { const [x0, x1] = flatXSpan(ctx, e); return [{ x: x0, y: ctx.ground, apply: (p) => setFlatX(ctx, e, 'min', p[0]) }, { x: x1, y: ctx.ground, apply: (p) => setFlatX(ctx, e, 'max', p[0]) }] }
	if (is2PtPolyline(e)) {   // a migrated 'line' (or a 2-click Line-tool polyline): the SAME endpoint grips 'line' used to get
		const [p0, p1] = e.pts!
		return [
			{ x: p0[0], y: p0[1], anchor: p1, resize: (D, F) => ({ ...e, pts: [D, F] }), apply: (p) => ({ ...e, pts: [p, p1] }) },
			{ x: p1[0], y: p1[1], anchor: p0, resize: (D, F) => ({ ...e, pts: [F, D] }), apply: (p) => ({ ...e, pts: [p0, p] }) },
		]
	}
	if (e.type === 'polyline') return (e.pts ?? []).map((v, i) => ({ x: v[0], y: v[1], apply: (p: Pt) => ({ ...e, pts: (e.pts ?? []).map((q, j) => j === i ? p : q) }) }))
	if (e.type === 'dim') {
		const gs: Grip[] = [
			{ x: e.a![0], y: e.a![1], anchor: e.b!, resize: (D, F) => ({ ...e, a: D, b: F }), apply: (p) => ({ ...e, a: p }) },
			{ x: e.b![0], y: e.b![1], anchor: e.a!, resize: (D, F) => ({ ...e, b: D, a: F }), apply: (p) => ({ ...e, b: p }) },
		]
		{   // a grip on the measured-text: drag it ALONG the line (dimT) + perpendicular (dimOff)
			const a = e.a!, b = e.b!, len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
			const ux = (b[0] - a[0]) / len, uy = (b[1] - a[1]) / len, px = -uy, py = ux
			const off = e.dimOff ?? 2.5 * ctx.paperMm, t = e.dimT ?? 0.5
			gs.push({ x: a[0] + ux * len * t + px * off, y: a[1] + uy * len * t + py * off, apply: (p: Pt) => {
				const along = (p[0] - a[0]) * ux + (p[1] - a[1]) * uy, perp = (p[0] - a[0]) * px + (p[1] - a[1]) * py
				const nt = Math.max(0, Math.min(1, Math.round((along / len) * 100) / 100))
				return { ...e, dimT: nt === 0.5 ? undefined : nt, dimOff: Math.round(perp) }
			} })
		}
		return gs
	}
	if (e.type === 'image' && opts.imgCropId === e.id) {   // CROP mode: corner grips move the crop WINDOW, not the placement rect
		const rx = Math.min(e.a![0], e.b![0]), ry = Math.min(e.a![1], e.b![1]), rw = Math.abs(e.b![0] - e.a![0]) || 1, rh = Math.abs(e.b![1] - e.a![1]) || 1
		const cr = e.crop ?? { x: 0, y: 0, w: 1, h: 1 }, x0 = cr.x, y0 = cr.y, x1 = cr.x + cr.w, y1 = cr.y + cr.h
		const cl = (v: number) => Math.max(0, Math.min(1, v)), nX = (p: Pt) => cl((p[0] - rx) / rw), nY = (p: Pt) => cl((p[1] - ry) / rh)
		const set = (nx0: number, ny0: number, nx1: number, ny1: number): Ent => { const ax0 = Math.min(nx0, nx1), ay0 = Math.min(ny0, ny1); return { ...e, crop: { x: ax0, y: ay0, w: Math.max(0.03, Math.abs(nx1 - nx0)), h: Math.max(0.03, Math.abs(ny1 - ny0)) } } }
		return [
			{ x: rx + x0 * rw, y: ry + y0 * rh, apply: (p: Pt) => set(nX(p), nY(p), x1, y1) },   // TL
			{ x: rx + x1 * rw, y: ry + y0 * rh, apply: (p: Pt) => set(x0, nY(p), nX(p), y1) },   // TR
			{ x: rx + x1 * rw, y: ry + y1 * rh, apply: (p: Pt) => set(x0, y0, nX(p), nY(p)) },   // BR
			{ x: rx + x0 * rw, y: ry + y1 * rh, apply: (p: Pt) => set(nX(p), y0, x1, nY(p)) },   // BL
		]
	}
	if (e.type === 'image') {   // resize grips at the VISIBLE (crop-window) corners; drag scales the full placement so that corner follows (opposite fixed)
		const rx = Math.min(e.a![0], e.b![0]), ry = Math.min(e.a![1], e.b![1]), rw = Math.abs(e.b![0] - e.a![0]) || 1, rh = Math.abs(e.b![1] - e.a![1]) || 1
		const cr = e.crop ?? { x: 0, y: 0, w: 1, h: 1 }, aspect = rh / rw, lock = e.lockAspect !== false
		const wres = (dnx: number, dny: number, fnx: number, fny: number) => (p: Pt): Ent => {
			const fx = rx + fnx * rw, fy = ry + fny * rh
			let RW = dnx - fnx !== 0 ? (p[0] - fx) / (dnx - fnx) : rw
			let RH = dny - fny !== 0 ? (p[1] - fy) / (dny - fny) : rh
			if (lock && !opts.shift()) RH = (Math.sign(RH) || 1) * Math.abs(RW) * aspect   // keep source aspect (Shift = free stretch)
			const Ax = fx - fnx * RW, Ay = fy - fny * RH
			return { ...e, a: [Math.round(Ax), Math.round(Ay)], b: [Math.round(Ax + RW), Math.round(Ay + RH)] }
		}
		const x0 = cr.x, y0 = cr.y, x1 = cr.x + cr.w, y1 = cr.y + cr.h
		return [
			{ x: rx + x0 * rw, y: ry + y0 * rh, apply: wres(x0, y0, x1, y1) },   // TL — keep BR fixed
			{ x: rx + x1 * rw, y: ry + y0 * rh, apply: wres(x1, y0, x0, y1) },   // TR — keep BL fixed
			{ x: rx + x1 * rw, y: ry + y1 * rh, apply: wres(x1, y1, x0, y0) },   // BR — keep TL fixed
			{ x: rx + x0 * rw, y: ry + y1 * rh, apply: wres(x0, y1, x1, y0) },   // BL — keep TR fixed
		]
	}
	if (e.type === 'rect' || e.type === 'ellipse') {   // 4 corner grips on the footprint/bbox
		const [ax, ay] = e.a!, [bx, by] = e.b!
		const box = (D: Pt, F: Pt): Ent => ({ ...e, a: [Math.min(D[0], F[0]), Math.min(D[1], F[1])] as Pt, b: [Math.max(D[0], F[0]), Math.max(D[1], F[1])] as Pt })
		return [
			{ x: ax, y: ay, anchor: [bx, by], square: true, resize: box, apply: (p) => ({ ...e, a: p }) },
			{ x: bx, y: by, anchor: [ax, ay], square: true, resize: box, apply: (p) => ({ ...e, b: p }) },
			{ x: ax, y: by, anchor: [bx, ay], square: true, resize: box, apply: (p) => ({ ...e, a: [p[0], e.a![1]] as Pt, b: [e.b![0], p[1]] as Pt }) },
			{ x: bx, y: ay, anchor: [ax, by], square: true, resize: box, apply: (p) => ({ ...e, a: [e.a![0], p[1]] as Pt, b: [p[0], e.b![1]] as Pt }) },
		]
	}
	if (e.type === 'text') {
		const gs: Grip[] = [{ x: e.a![0], y: e.a![1], apply: (p) => ({ ...e, a: p }) }]
		if (e.callout) {   // leader-tip grip (drag where the callout points)
			const bb = textBox(e, PT_MM * ctx.paperMm), tfs = (e.fontPt ?? STYLE_DEFAULTS.fontPt) * PT_MM * ctx.paperMm, lp = e.leader ?? ([bb[0] - tfs * 3, bb[3] + tfs * 3] as Pt)
			gs.push({ x: lp[0], y: lp[1], apply: (p) => ({ ...e, leader: p }) })
		}
		return gs
	}
	return []
}

/** Grips honour rotation: positions rotate into the view; a grip drag un-rotates the pointer first. */
export function gripsFor(ctx: ViewCtx, e: Ent, opts: GripOpts): Grip[] {
	let gs = gripsLocal(ctx, e, opts)
	if (canRotate(ctx, e, opts.imgCropId)) gs = [...gs, rotGripLocal(ctx, e, opts.gripMm, opts.shift)]
	if (!e.rot) return gs
	const c = rotCenter(ctx, e), rot = e.rot!
	return gs.map((g) => {
		const rp = rotatePt([g.x, g.y], c, rot)
		if (g.rotate) return { ...g, x: rp[0], y: rp[1] }
		if (g.anchor && g.resize) {   // world-anchored resize: keep the anchor world-fixed, do the box math in local axes
			const Aw = rotatePt(g.anchor, c, rot), resize = g.resize, square = g.square
			return { x: rp[0], y: rp[1], apply: (P: Pt): Ent => {
				let Pw = P
				if (square && opts.shift()) {   // shift → square about the anchor, in LOCAL axes
					const rel = rotatePt(P, Aw, -rot), dx = rel[0] - Aw[0], dy = rel[1] - Aw[1]
					const s = Math.max(Math.abs(dx), Math.abs(dy)), sq = rotatePt([(dx < 0 ? -s : s), (dy < 0 ? -s : s)], [0, 0], rot)
					Pw = [Aw[0] + sq[0], Aw[1] + sq[1]]
				}
				const cn: Pt = [(Aw[0] + Pw[0]) / 2, (Aw[1] + Pw[1]) / 2]   // new centre = midpoint(anchor, pointer)
				const D = rotatePt(Pw, cn, -rot)                             // dragged corner, un-rotated
				const F: Pt = [2 * cn[0] - D[0], 2 * cn[1] - D[1]]           // opposite corner → anchor stays world-fixed
				return resize(D, F)
			} }
		}
		return { x: rp[0], y: rp[1], apply: (p: Pt) => g.apply(rotatePt(p, c, -rot)) }
	})
}

/** Shift-constrain a grip drag: rect/ellipse corner → square about the opposite corner; dim / 2-point
 *  polyline endpoint → 15° about the other end. `opts` is only needed for the rotate-handle check. */
export function constrainGrip(ctx: ViewCtx, base: Ent, gi: number, p: Pt, shift: boolean, opts: GripOpts): Pt {
	if (!shift) return p
	if (gripsFor(ctx, base, opts)[gi]?.rotate) return p   // rotate handle: no square/ortho constrain
	if (base.rot) return p   // rotated shape: the world-anchored resize does its own local-frame square
	if (base.type === 'rect' || base.type === 'ellipse') {
		const [ax, ay] = base.a!, [bx, by] = base.b!
		const an: Pt = gi === 0 ? [bx, by] : gi === 1 ? [ax, ay] : gi === 2 ? [bx, ay] : [ax, by]
		const s = Math.max(Math.abs(p[0] - an[0]), Math.abs(p[1] - an[1]))
		return [an[0] + (p[0] < an[0] ? -s : s), an[1] + (p[1] < an[1] ? -s : s)]
	}
	if (base.type === 'dim' || is2PtPolyline(base)) {
		const an = base.type === 'dim' ? (gi === 0 ? base.b! : base.a!) : (gi === 0 ? base.pts![1] : base.pts![0])
		const dx = p[0] - an[0], dy = p[1] - an[1], len = Math.hypot(dx, dy), step = Math.PI / 12
		const ang = Math.round(Math.atan2(dy, dx) / step) * step
		return [an[0] + len * Math.cos(ang), an[1] + len * Math.sin(ang)]
	}
	return p
}
