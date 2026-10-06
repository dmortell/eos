// The PORT TIP in a rack view (backlog "Port hover tips"): the port under the pointer — its place and full label, the
// cable plugged into it (to an outlet port, or another panel's port: a tie / backbone) and the patch cords on it.
// Pure; tested in portTip.test.ts. Shown by PortTip.svelte.
import type { ProjectIndex } from '../domain/project'
import type { PortRef } from '../domain/types'
import type { Prim } from './display'
import { inPolygon } from '../editor/pick'

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
