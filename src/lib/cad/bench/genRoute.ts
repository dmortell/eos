// A generated big routing project (review 2 phase C, Q56): a spine with `rows` cross runs of `perRow` segments each,
// `outlets` 2-port outlets on the floor between them, one rack with a panel linked to `linked` of the outlets' ports.
import type { Entity } from '../domain/drawing'
import type { Outlet, Device, Link } from '../domain/types'
import { makeRun } from '../domain/make'
import { demoProject } from '../domain/fixtures'

/** A run with ids that are the same every time (makeRun's are random), so two routings can be compared. */
function fixedRun(id: string, ...args: Parameters<typeof makeRun>): Entity {
	const s = makeRun(...args)
	if (s.geom.kind !== 'path') throw new Error('a run is a path')
	const nodeId = new Map(s.geom.nodes.map((n, i) => [n.id, `${id}-n${i}`]))
	const geom = { ...s.geom, nodes: s.geom.nodes.map((n) => ({ ...n, id: nodeId.get(n.id)! })), segs: s.geom.segs.map((g, i) => ({ ...g, id: `${id}-s${i}`, a: nodeId.get(g.a)!, b: nodeId.get(g.b)! })) }
	return { ...s, id, label: id, geom } as Entity
}

export function bigRouteProject(rows = 40, perRow = 20, outlets = 1000, linked = 700): Entity[] {
	const base = demoProject().filter((e) => e.type === 'building' || e.type === 'level' || e.type === 'space')
	const out: Entity[] = [...base]
	out.push({ type: 'rack', id: 'R1', levelId: 'L33', spaceId: 'SR-A', order: 0, name: 'A01', kind: 'cabinet', heightU: 42, widthMm: 600, depthMm: 1000, at: { x: -1000, y: 0 } } as Entity)
	const section = { w: 100, h: 50 }
	const pitch = 2000, gap = 2500
	const spine = Array.from({ length: rows + 1 }, (_, i) => ({ x: 0, y: i * gap, z: 2900 }))
	out.push(fixedRun('SP', 'L33', spine, section, { tier: 'low', form: 'trunk' }))
	for (let r = 0; r < rows; r++) {
		const pts = Array.from({ length: perRow + 1 }, (_, i) => ({ x: i * pitch, y: r * gap, z: 2900 }))
		out.push(fixedRun(`RUN${r}`, 'L33', pts, section, { tier: 'low', form: 'trunk' }))
	}
	// a cross run whose nodes land mid-segment on every row: tees, which cut the rows
	if (rows > 1) out.push(fixedRun('TEE', 'L33', Array.from({ length: rows }, (_, i) => ({ x: pitch / 2, y: i * gap, z: 2900 })), section, { tier: 'low', form: 'trunk' }))
	for (let p = 0; p < 24; p++) { /* panels */
		out.push({ type: 'device', id: `P${p}`, rackId: 'R1', name: `Panel ${p}`, kind: 'panel', u: 1 + p, heightU: 1, face: 'both', portCount: 48, portType: 'RJ45', panel: { tier: 'low', serverRoomId: 'SR-A' } } as Device)
	}
	let n = 0
	for (let i = 0; i < outlets; i++) {
		const x = (i % 50) * 800 + 300, y = Math.floor(i / 50) * 1000 + 700
		out.push({
			type: 'outlet', id: `O${i}`, levelId: 'L33', zoneId: 'Z3', label: `33-${i}`, tier: 'low', usage: 'desk', mount: 'floor', at: { x, y }, z: 0,
			ports: [1, 2].map((k) => ({ port: k, label: `33-${i}.${'AB'[k - 1]}`, serverRoomId: 'SR-A', cableType: 'cat6a' })),
		} as Outlet)
		for (const k of [1, 2]) if (n < linked) {
			out.push({ type: 'link', id: `K${n}`, kind: 'horizontal', a: { on: `P${Math.floor(n / 48)}`, port: (n % 48) + 1, face: 'rear' }, b: { on: `O${i}`, port: k }, cableType: 'cat6a', status: 'design' } as Link)
			n++
		}
	}
	return out
}
