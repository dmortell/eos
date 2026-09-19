// Pure geometry for the Pages tool — no component state, so it's unit-testable and shared by
// Viewport.svelte and PropertiesPanel.svelte (see review.md §4.1/§5). The view-dependent helpers
// (hit-testing, grips, bbox per projection) stay in Viewport because they read the viewport `kind`.

export type Pt = [number, number]
// 'box' = a mock 3D cuboid: a,b = plan footprint · h = height · z0 = base elevation (height off the
// ground). In elevation the box is placed by x (from the footprint) + z0/h, so its plan DEPTH
// (footprint y) is independent of its elevation position.
export type Ent = { id: string; type: 'line' | 'rect' | 'circle' | 'ellipse' | 'dim' | 'text' | 'box' | 'polyline'; a?: Pt; b?: Pt; c?: Pt; r?: number; h?: number; z0?: number; text?: string; pts?: Pt[] }
export type View = { zoom: number; x: number; y: number }

export const DEFAULT_BOX_H = 45   // mock mm height for a freshly drawn cuboid
export const GROUND = 200         // elevation ground line (drawing units); a box with z0=0 stands on it
export const ISO = 0.6            // oblique (cabinet) projection offset factor for the model view

export const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1])

// Distance from point p to segment a–b.
export function segDist(p: Pt, a: Pt, b: Pt): number {
	const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy || 1
	let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L
	t = Math.max(0, Math.min(1, t))
	return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy))
}

// Translate every point of an entity by (dx,dy).
export function translate(e: Ent, dx: number, dy: number): Ent {
	const t = (p?: Pt): Pt | undefined => p ? [p[0] + dx, p[1] + dy] : p
	return { ...e, a: t(e.a), b: t(e.b), c: t(e.c), pts: e.pts?.map(p => [p[0] + dx, p[1] + dy] as Pt) }
}

// Text bounding box (drawing units): a[0]/a[1] is the first line's baseline-left; lines run down.
export function textBox(e: Ent): [number, number, number, number] {
	const lines = (e.text ?? '').split('\n')
	const w = Math.max(...lines.map(l => l.length), 1) * 11 * 0.6
	return [e.a![0], e.a![1] - 10, e.a![0] + w, e.a![1] + (lines.length - 1) * 13 + 3]
}

// Elevation FRONT face of a box: x0..x1 wide, top at GROUND-z0-h, bottom (baseline) at GROUND-z0.
export function boxElev(e: Ent) {
	const x0 = Math.min(e.a![0], e.b![0]), x1 = Math.max(e.a![0], e.b![0])
	const h = e.h ?? DEFAULT_BOX_H, base = GROUND - (e.z0 ?? 0)
	return { x0, x1, h, base, top: base - h }
}

// Apply an elevation-view edit to a box: width (x0/x1) keeps the footprint DEPTH (y) and only moves
// the x-edges; z0 = base elevation; h = height. Plan depth (y) is never touched here.
export function boxElevSet(e: Ent, ch: { x0?: number; x1?: number; z0?: number; h?: number }): Ent {
	const cx0 = Math.min(e.a![0], e.b![0]), cx1 = Math.max(e.a![0], e.b![0])
	const [ay, by] = [e.a![1], e.b![1]]
	const nx0 = ch.x0 ?? cx0, nx1 = ch.x1 ?? cx1
	return { ...e, a: [e.a![0] === cx0 ? nx0 : nx1, ay], b: [e.b![0] === cx0 ? nx0 : nx1, by], z0: Math.max(0, ch.z0 ?? e.z0 ?? 0), h: Math.max(1, ch.h ?? e.h ?? DEFAULT_BOX_H) }
}

// Model-view oblique (cabinet) cuboid faces: the top face is the footprint shifted up-right by h·ISO.
export function boxFaces(e: Ent) {
	const x0 = Math.min(e.a![0], e.b![0]), y0 = Math.min(e.a![1], e.b![1])
	const x1 = Math.max(e.a![0], e.b![0]), y1 = Math.max(e.a![1], e.b![1])
	const h = e.h ?? DEFAULT_BOX_H, ox = h * ISO, oy = -h * ISO
	const P = (x: number, y: number) => `${x},${y}`
	return {
		x0, y0, x1, y1, h,
		top: `${P(x0 + ox, y0 + oy)} ${P(x1 + ox, y0 + oy)} ${P(x1 + ox, y1 + oy)} ${P(x0 + ox, y1 + oy)}`,
		right: `${P(x1, y0)} ${P(x1, y1)} ${P(x1 + ox, y1 + oy)} ${P(x1 + ox, y0 + oy)}`,
		back: `${P(x0, y0)} ${P(x1, y0)} ${P(x1 + ox, y0 + oy)} ${P(x0 + ox, y0 + oy)}`,
	}
}
