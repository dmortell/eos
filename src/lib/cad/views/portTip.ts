// The PORT TIP in a rack view (backlog "Port hover tips"): the port under the pointer — its place and full label, the
// cable plugged into it (to an outlet port, or another panel's port: a tie / backbone) and the patch cords on it.
// Pure; tested in portTip.test.ts. Shown by PortTip.svelte.
import type { ProjectIndex } from '../domain/project'
import type { Outlet, PortRef, ProjectSettings } from '../domain/types'
import type { Prim } from './display'
import { inPolygon, primDist } from '../editor/pick'

/** The port cell under `p` in a rack-view display list (a `port…` box with the device as src and the port as sub). */
export function portUnder(prims: Prim[], p: { x: number; y: number }, face: 'front' | 'rear'): PortRef | null {
	for (let i = prims.length - 1; i >= 0; i--) {
		const q = prims[i]
		if (q.k === 'line' && q.closed && q.src && q.sub && q.cls.startsWith('port') && inPolygon(p, q.pts)) return { on: q.src, port: Number(q.sub), face }
	}
	return null
}

/** The tip's lines: where the port is and its label, then what it connects to. */
export function portTip(ix: ProjectIndex, r: PortRef): string[] {
	const out = [ix.portPlace(r)], label = ix.portLabel(r)
	if (label) out.push(label)
	const l = ix.linkAt(r), far = ix.farEnd(r)
	if (l && far) {
		const fe = ix.get(far.on)
		out.push(fe?.type === 'outlet'
			? `cable → outlet ${fe.label} port ${far.port}${ix.nameOf(fe.levelId) ? ` (${ix.nameOf(fe.levelId)})` : ''}`
			: `${l.kind === 'tie' ? 'tie' : l.kind} → ${ix.portPlace(far)}`)
	}
	const same = (a: PortRef) => a.on === r.on && a.port === r.port && (!a.face || !r.face || a.face === r.face)
	for (const c of ix.cords) {
		const other = same(c.a) ? c.b : same(c.b) ? c.a : null
		if (other) out.push(`cord → ${ix.portPlace(other)} · ${c.lengthM} m${c.status !== 'installed' ? ` · ${c.status}` : ''}`)
	}
	if (out.length === 1 && !label) out.push('not connected')
	return out
}

/** The OUTLET under `p` on a plan (backlog "Usage colours and outlet tips"): the topmost prim of an outlet within
 *  `tol` mm. */
export function outletUnder(ix: ProjectIndex, prims: Prim[], p: { x: number; y: number }, tol: number): Outlet | null {
	for (let i = prims.length - 1; i >= 0; i--) {
		const q = prims[i]
		if (!q.src || primDist(q, p) > tol) continue
		const o = ix.get(q.src)
		if (o?.type === 'outlet') return o
	}
	return null
}

/** The outlet tip's lines: its label, its usage · tier · mount, then each port's label and the panel port it's on. */
export function outletTip(ix: ProjectIndex, o: Outlet): string[] {
	const st = ix.get('settings') as ProjectSettings | undefined
	const usage = st?.usages?.find((u) => u.id === o.usage)?.label ?? o.usage
	const out = [o.label, [usage, o.tier, o.mount].filter(Boolean).join(' · ')]
	for (const pt of o.ports) {
		const far = ix.farEnd({ on: o.id, port: pt.port })
		out.push(`${pt.label} → ${far ? ix.portPlace(far) : 'not allocated'}`)
	}
	return out
}
