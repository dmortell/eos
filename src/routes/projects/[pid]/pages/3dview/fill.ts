// F10: CABLE FILL of a conduit — the cables it carries (Conduit.cables: type × qty) against its cross-section,
// with the Outlets tool's cable diameters and thresholds (amber > 40 %, red > 60 %). The packing + % maths are
// the Fill Rate tool's own (fillrate/parts: calcFillRate / packSection), fed a Section built from the conduit.
// Also: "count from outlets" — the ports of the outlets whose NEAREST conduit (in plan) is this one.
import type { Conduit, CableRun, Obj } from './types'
import type { Ent } from '../ui/geometry'
import { segDist } from '../ui/geometry'
import { calcFillRate, type Section } from '../../fillrate/parts/constants'
import { packSection, type PackedSection } from '../../fillrate/parts/packing'

/** Cable types by outer diameter (mm) — the Outlets tool's table. */
export const CABLE_TYPES: Record<string, { label: string; short: string; d: number }> = {
	cat6a: { label: 'Cat6A', short: 'C6A', d: 9 },
	cat6: { label: 'Cat6', short: 'C6', d: 7 },
	cat5e: { label: 'Cat5e', short: 'C5e', d: 6 },
	'fiber-sm': { label: 'Fibre SM', short: 'SM', d: 3 },
	'fiber-mm': { label: 'Fibre MM', short: 'MM', d: 3 },
}
export const DEFAULT_CABLE = 'cat6a'
export const cableDia = (c: CableRun) => (c.type === 'custom' ? c.d ?? 7 : CABLE_TYPES[c.type]?.d ?? 7)

/** The conduit (or one of its segments, which may override the size) as a Fill Rate section. Round when it has
 *  more than 4 edges (diameter = w); rectangular otherwise, no wall deducted (the Outlets tool's convention). */
export function conduitSection(c: Conduit, segIdx?: number, label = ''): Section {
	const s = segIdx != null ? c.segments[segIdx] : undefined
	const w = s?.w ?? c.w, h = s?.h ?? c.h, edges = s?.edges ?? c.edges
	return {
		id: 'c', label, containmentType: edges > 4 ? 'round' : 'rectangular', diameter: w, width: w, height: h, thickness: 0, calcMethod: 'circular',
		cables: (c.cables ?? []).filter((r) => r.qty > 0).map((r, i) => ({ id: String(i), diameter: cableDia(r), quantity: r.qty })),
	}
}
/** Fill % of the conduit's smallest cross-section (the tightest segment governs). */
export function conduitFill(c: Conduit): number {
	if (!c.cables?.some((r) => r.qty > 0)) return 0
	const idx = c.segments.length ? c.segments.map((_, i) => i) : [undefined]
	return Math.max(...idx.map((i) => calcFillRate(conduitSection(c, i))))
}
export const packConduit = (c: Conduit, segIdx?: number): PackedSection => packSection(conduitSection(c, segIdx))
/** Green / amber (> 40 %) / red (> 60 %). */
export const fillTone = (pct: number) => (pct > 60 ? '#ef4444' : pct > 40 ? '#f59e0b' : '#16a34a')
/** "12 C6A · 4 SM · 37%" (empty when it carries nothing). */
export function fillLabel(c: Conduit): string {
	const runs = (c.cables ?? []).filter((r) => r.qty > 0); if (!runs.length) return ''
	const by = new Map<string, number>()
	for (const r of runs) { const k = r.type === 'custom' ? `Ø${r.d ?? 7}` : CABLE_TYPES[r.type]?.short ?? r.type; by.set(k, (by.get(k) ?? 0) + r.qty) }
	return `${[...by].map(([k, n]) => `${n} ${k}`).join(' · ')} · ${Math.round(conduitFill(c))}%`
}

/** An outlet on the plan: a block insert with a PORTS attribute (store/outletsImport.ts). */
const isOutlet = (e: Ent) => e.type === 'insert' && !!e.attrs?.PORTS && (!e.plane || e.plane === 'plan')
/** Plan distance from a point to a conduit's centreline. */
function distToConduit(p: [number, number], c: Conduit): number {
	const at = new Map(c.nodes.map((n) => [n.id, [n.x, n.y] as [number, number]]))
	let best = Infinity
	for (const s of c.segments) { const a = at.get(s.a), b = at.get(s.b); if (a && b) best = Math.min(best, segDist(p, a, b)) }
	return best
}
/** Ports of the outlets whose nearest conduit is `conduitId` (within `maxMm`, default 10 m) — the cables it
 *  would carry if every outlet runs to its nearest trunk. */
export function portsNearest(conduitId: string, objects: Obj[], ents: Ent[], maxMm = 10000): { outlets: number; ports: number } {
	const conduits = objects.filter((o): o is Conduit & Obj => o.type === 'conduit' && !!o.id)
	let outlets = 0, ports = 0
	for (const e of ents) {
		if (!isOutlet(e) || !e.a) continue
		let bestId = '', bestD = Infinity
		for (const c of conduits) { const d = distToConduit(e.a, c); if (d < bestD) { bestD = d; bestId = c.id! } }
		if (bestId === conduitId && bestD <= maxMm) { outlets++; ports += Math.max(0, parseInt(e.attrs!.PORTS, 10) || 0) }
	}
	return { outlets, ports }
}
