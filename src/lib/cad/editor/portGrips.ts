// Grips in a rack view (Dave 2026-10-10): a selected patch cord's two ends — drag one onto another port to re-patch
// it — and a "+" on the selected port(s): a click starts a patch cord from them (they carry a link but no cord) or a
// link (they have none), as Port Properties › Patch to… / Link to… do. Pure: read from the drawn prims and the index.
import type { Prim } from '../views/display'
import type { Id, Pt } from '../domain/types'
import type { ProjectIndex } from '../domain/project'
import type { PortSel } from './tools'
import { cordAt } from '../domain/cords'

export interface CordEndGrip { cord: Id; end: 'a' | 'b'; at: Pt; other: Pt }

/** The ends of a cord as drawn in this view (its line runs from end a to end b); none when it isn't drawn here. */
export function cordEndGrips(prims: Prim[], cordId: Id): CordEndGrip[] {
	const line = prims.find((p) => p.k === 'line' && p.src === cordId && p.cls.startsWith('cord'))
	if (line?.k !== 'line' || line.pts.length < 2) return []
	const a = line.pts[0], b = line.pts[line.pts.length - 1]
	return [{ cord: cordId, end: 'a', at: a, other: b }, { cord: cordId, end: 'b', at: b, other: a }]
}

export interface PortPlus { at: Pt; kind: 'cord' | 'link' }

/** The + on the selected ports, at the top-right corner of the clicked one's cell, when none has a cord: on a panel a
 *  patch when every one has a link, a link when none has; on a switch (any other device) a patch — links run panel to
 *  panel (Port Properties offers Link to… on panels only). Null otherwise (mixed, patched) or on the other face. */
export function portPlus(ix: ProjectIndex, sel: PortSel | null, face: 'front' | 'rear', prims: Prim[]): PortPlus | null {
	if (!sel?.ports.length || sel.face !== face) return null
	if (sel.ports.some((n) => cordAt(ix, { on: sel.on, port: n }))) return null
	const d = ix.get(sel.on), linked = sel.ports.filter((n) => ix.linkAt({ on: sel.on, port: n, face })).length
	const kind = d?.type === 'device' && d.kind !== 'panel' ? 'cord' : linked === sel.ports.length ? 'cord' : linked === 0 ? 'link' : null
	if (!kind) return null
	const n = sel.ports.includes(sel.anchor) ? sel.anchor : sel.ports[0]
	const cell = prims.find((p) => p.k === 'line' && p.src === sel.on && p.sub === String(n) && p.cls.startsWith('port'))
	if (cell?.k !== 'line') return null
	return { at: { x: Math.max(...cell.pts.map((p) => p.x)), y: Math.min(...cell.pts.map((p) => p.y)) }, kind }
}
