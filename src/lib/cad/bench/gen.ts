// A generated big project for the performance checks (review 2 phase C): panels with linked outlets, switches with cords.
import type { Entity } from '../domain/drawing'
import type { Outlet, Device, Link, Cord } from '../domain/types'
import { demoProject } from '../domain/fixtures'

/** `panels` panels of 48 ports, each port linked to one outlet port; `switches` switches of 48 ports; the first
 *  `cords` panel ports patched to switch ports. */
export function bigPortProject(panels = 138, switches = 42, cords = 2000): Entity[] {
	const base = demoProject().filter((e) => e.type === 'building' || e.type === 'level' || e.type === 'space' || e.type === 'rack')
	const out: Entity[] = [...base]
	const swPorts: { on: string; port: number }[] = []
	for (let s = 0; s < switches; s++) {
		const d: Device = { type: 'device', id: `S${s}`, rackId: 'R1', name: `Switch ${s}`, kind: 'switch', u: 1 + (s % 40), heightU: 1, face: 'front', portCount: 48 }
		out.push(d)
		for (let p = 1; p <= 48; p++) swPorts.push({ on: d.id, port: p })
	}
	let n = 0, c = 0
	for (let p = 0; p < panels; p++) {
		out.push({ type: 'device', id: `P${p}`, rackId: 'R1', name: `Panel ${p}`, kind: 'panel', u: 1 + (p % 40), heightU: 1, face: 'both', portCount: 48, portType: 'RJ45', panel: { tier: 'low', serverRoomId: 'SR-A' } } as Device)
		for (let port = 1; port <= 48; port += 2) {
			const oid = `O${n++}`
			const o: Outlet = {
				type: 'outlet', id: oid, levelId: 'L33', zoneId: 'Z3', label: `33-${n}`, tier: 'low', usage: 'desk', mount: 'floor', at: { x: (n % 60) * 500, y: Math.floor(n / 60) * 500 }, z: 0,
				ports: [1, 2].map((i) => ({ port: i, label: `33-${n}.${'AB'[i - 1]}`, serverRoomId: 'SR-A', cableType: 'cat6a' })),
			}
			out.push(o)
			for (const i of [0, 1]) {
				out.push({ type: 'link', id: `K${p}-${port + i}`, kind: 'horizontal', a: { on: `P${p}`, port: port + i, face: 'rear' }, b: { on: oid, port: i + 1 }, cableType: 'cat6a', status: 'design' } as Link)
				if (c < cords && c < swPorts.length) {
					const sp = swPorts[c]
					out.push({ type: 'cord', id: `C${c++}`, kind: 'patch', a: { on: `P${p}`, port: port + i, face: 'front' }, b: sp, cableType: 'cat6a', colour: '#3b82f6', lengthM: 1, lengthLocked: false, status: 'add' } as Cord)
				}
			}
		}
	}
	return out
}
