// E8 / E9: ALLOCATE outlet ports to a patch PANEL's ports (the simplified Frames flow): drop outlets onto a panel
// and their ports take the panel's ports in order. The allocation lives on the panel DEVICE of a rack-row model
// (Obj.device.alloc: panel port → outlet + its port + the label), so it is Pages data — the Frames / Elevations
// docs are not written (see parity-review E8). Pure; tested in allocate.test.ts.
import type { Model } from '../3dview/types'
import type { Ent } from '../ui/geometry'

/** One allocated panel port: the outlet (its shape id in `model`), which of its ports, and the port's label. */
export type PortAlloc = { outlet: string; model: string; port: number; label: string }
/** An outlet that can be allocated: a block insert with LABEL / PORTS (store/outletsImport.ts). */
export type OutletRef = { id: string; model: string; label: string; ports: number }

export const isOutletEnt = (e: Ent) => e.type === 'insert' && e.attrs?.PORTS != null
export const outletRef = (e: Ent, model: string): OutletRef => ({ id: e.id, model, label: e.attrs?.LABEL || e.id, ports: Math.max(1, parseInt(e.attrs?.PORTS ?? '1', 10) || 1) })
/** A port's label: the outlet's own for a 1-port outlet, else with a letter per port (4A013.A, 4A013.B …). */
export const portLabel = (label: string, port: number, ports: number) => (ports > 1 ? `${label}.${String.fromCharCode(64 + port)}` : label)

/** Allocate `outlets` (every port of each, in order) from panel port `start` onwards, skipping taken ports.
 *  Outlets already on this panel are moved (their old ports freed first). Returns the new map, and the outlets
 *  that didn't fit. */
export function allocate(alloc: Record<string, PortAlloc>, panelPorts: number, outlets: OutletRef[], start = 1): { alloc: Record<string, PortAlloc>; overflow: OutletRef[] } {
	const ids = new Set(outlets.map((o) => o.id))
	const next: Record<string, PortAlloc> = Object.fromEntries(Object.entries(alloc).filter(([, a]) => !ids.has(a.outlet)))
	const overflow: OutletRef[] = []
	let p = Math.max(1, start)
	for (const o of outlets) {
		const free: number[] = []
		for (let q = p; q <= panelPorts && free.length < o.ports; q++) if (!next[q]) free.push(q)
		if (free.length < o.ports) { overflow.push(o); continue }
		free.forEach((q, i) => (next[q] = { outlet: o.id, model: o.model, port: i + 1, label: portLabel(o.label, i + 1, o.ports) }))
		p = free[free.length - 1] + 1
	}
	return { alloc: next, overflow }
}
/** Free the ports of these outlets (or of the given panel ports). */
export function unallocate(alloc: Record<string, PortAlloc>, what: { outlets?: string[]; ports?: number[] }): Record<string, PortAlloc> {
	const o = new Set(what.outlets ?? []), ps = new Set((what.ports ?? []).map(String))
	return Object.fromEntries(Object.entries(alloc).filter(([k, a]) => !o.has(a.outlet) && !ps.has(k)))
}
/** Every allocated outlet → where ("R01 · PP-01 : 3-4"), across the rack-row models. */
export function allocatedOutlets(models: Model[]): Map<string, string> {
	const out = new Map<string, string>()
	for (const m of models) {
		if (m.archived) continue
		for (const o of m.objects) {
			const al = o.device?.alloc; if (!al) continue
			const rack = m.objects.find((r) => r.id === o.device!.rackId)?.label ?? ''
			const byOutlet = new Map<string, number[]>()
			for (const [k, a] of Object.entries(al)) byOutlet.set(a.outlet, [...(byOutlet.get(a.outlet) ?? []), Number(k)])
			for (const [id, ports] of byOutlet) { ports.sort((a, b) => a - b); out.set(id, `${rack ? rack + ' · ' : ''}${o.label ?? 'Panel'} : ${ports[0]}${ports.length > 1 ? `-${ports[ports.length - 1]}` : ''}`) }
		}
	}
	return out
}
