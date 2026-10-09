// CONTAINMENT FILL (Phase 5.3): how full each run segment is from the cables ROUTED through it (domain/routing.ts),
// plus the cables added to a run by hand (`ContainmentRole.extra`).
// A cable counts as a SQUARE of its outer diameter (d², Dave) against the section's inside area (`inner`, else the
// section; a round conduit: πr²). The limit is 40 % (Dave). The packed-cable picture is the legacy Fill rate tool's
// greedy "gravity" packing (fillrate/parts/packing.ts), in mm, with a coarser search step for big bundles. Pure;
// tested in fill.test.ts.
import type { Id, ProjectSettings } from './types'
import type { Section, Shape } from './shapes'
import type { ProjectIndex } from './project'
import type { Route } from './routing'
import { cableKey } from './multicore'

export const FILL_LIMIT_PCT = 40
/** Outer diameters (mm) when a cable type has none set (the Pages fill table). */
export const DEFAULT_OD: Record<string, number> = { cat6a: 9, cat6: 7, cat5e: 6, os2: 3, om3: 3, om4: 3, fibre: 3, 'mpo-12': 4 }

export function cableOd(settings: ProjectSettings | undefined, type: string): number {
	const t = settings?.cableTypes.find((c) => c.id === type)
	return t?.diameterMm ?? DEFAULT_OD[type.toLowerCase()] ?? (t?.media === 'fibre' ? 3 : 7)
}

/** The inside area of a section, mm². */
export function sectionArea(s: Section | undefined): number {
	if (!s) return 0
	const w = s.inner?.w ?? s.w, h = s.inner?.h ?? s.h
	return s.round ? Math.PI * (w / 2) ** 2 : w * h
}

export interface SegFill {
	shape: Id; seg: Id
	/** Cables per type through it. */
	cables: Record<string, number>
	/** Of those, the ones added by hand, per type. */
	hand?: Record<string, number>
	/** Outer Ø (mm) per type where a hand-added row set its own. */
	od?: Record<string, number>
	cableMm2: number; areaMm2: number
	pct: number
	over: boolean
}
export const segKey = (shape: Id, seg: Id) => `${shape}:${seg}`

/** The fill of every run segment that has cables routed through it or added by hand. */
export function fillBySegment(ix: ProjectIndex, routes: Map<Id, Route>, limitPct = FILL_LIMIT_PCT): Map<string, SegFill> {
	const st = ix.get<ProjectSettings>('settings'), settings = st?.type === 'settings' ? st : undefined
	const out = new Map<string, SegFill>()
	const entry = (shape: Id, seg: Id, s = ix.get<Shape>(shape)): SegFill => {
		const k = segKey(shape, seg)
		let f = out.get(k)
		if (!f) {
			const sec = s?.type === 'shape' && s.geom.kind === 'path' ? (s.geom.segs.find((x) => x.id === seg)?.section ?? s.section) : undefined
			f = { shape, seg, cables: {}, cableMm2: 0, areaMm2: sectionArea(sec), pct: 0, over: false }
			out.set(k, f)
		}
		return f
	}
	// a multi-core cable counts once: its first routed core (the others share its route)
	const counted = new Set<Id>()
	for (const l of ix.links) {
		const r = routes.get(l.id)
		if (!r || r.problem || counted.has(cableKey(l))) continue
		counted.add(cableKey(l))
		const type = l.cableType ?? 'cable', d = cableOd(settings, type)
		for (const { shape, seg } of r.segs) {
			const f = entry(shape, seg)
			f.cables[type] = (f.cables[type] ?? 0) + 1
			f.cableMm2 += d * d
		}
	}
	// cables added by hand: on one segment, or on every segment of the run
	for (const s of ix.shapes) {
		if (s.role?.kind !== 'containment' || !s.role.extra?.length || s.geom.kind !== 'path') continue
		for (const h of s.role.extra) {
			const n = Math.max(0, Math.round(h.n)), type = h.type.trim() || 'cable', d = h.d && h.d > 0 ? h.d : cableOd(settings, type)
			if (!n) continue
			for (const g of s.geom.segs) {
				if (h.seg && h.seg !== g.id) continue
				const f = entry(s.id, g.id, s)
				f.cables[type] = (f.cables[type] ?? 0) + n
				f.hand = { ...f.hand, [type]: (f.hand?.[type] ?? 0) + n }
				if (h.d && h.d > 0) f.od = { ...f.od, [type]: h.d }
				f.cableMm2 += n * d * d
			}
		}
	}
	for (const f of out.values()) {
		f.pct = f.areaMm2 ? (f.cableMm2 / f.areaMm2) * 100 : Infinity
		f.over = f.pct > limitPct
	}
	return out
}

/** The fullest segment of each run. */
export function fillByRun(fills: Map<string, SegFill>): Map<Id, SegFill> {
	const out = new Map<Id, SegFill>()
	for (const f of fills.values()) { const cur = out.get(f.shape); if (!cur || f.pct > cur.pct) out.set(f.shape, f) }
	return out
}

/** green / amber (from ¾ of the limit) / red (over it). */
export const fillTone = (pct: number, limit = FILL_LIMIT_PCT): 'ok' | 'warn' | 'over' => (pct > limit ? 'over' : pct >= limit * 0.75 ? 'warn' : 'ok')

export interface Packed { round: boolean; w: number; h: number; cables: { x: number; y: number; r: number; type: string }[]; dropped: number }

/** Cables laid in the section, largest first, each settling as low as it fits (+y = down), centred on the origin. */
export function packCables(s: Section, cables: Record<string, number>, od: (type: string) => number, max = 400): Packed {
	const round = !!s.round, w = s.inner?.w ?? s.w, h = round ? w : (s.inner?.h ?? s.h), R = w / 2
	const all = Object.entries(cables).flatMap(([type, n]) => Array.from({ length: n }, () => ({ type, r: od(type) / 2 }))).sort((a, b) => b.r - a.r)
	const take = all.slice(0, max)
	const placed: Packed['cables'] = []
	const hits = (x: number, y: number, r: number) => placed.some((p) => Math.hypot(x - p.x, y - p.y) < r + p.r - 0.05)
	let dropped = all.length - take.length
	for (const c of take) {
		const r = c.r, step = Math.max(0.5, r / 2)
		let at: { x: number; y: number } | null = null
		for (let y = (round ? R : h / 2) - r; !at && y >= -(round ? R : h / 2) + r; y -= step) {
			const half = round ? Math.sqrt(Math.max(0, R * R - y * y)) : w / 2
			for (let x = -half + r; x <= half - r; x += step) {
				if (round && Math.hypot(x, y) + r > R + 0.05) continue
				if (!hits(x, y, r)) { at = { x, y }; break }
			}
		}
		if (at) placed.push({ ...at, r, type: c.type })
		else dropped++
	}
	return { round, w, h, cables: placed, dropped }
}
