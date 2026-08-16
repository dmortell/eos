import { describe, it, expect } from 'vitest'
import { walkCircuit } from './trace'
import type { StructuredLink } from './links'

const cord = (id: string, a: [string, number], b: [string, number]) => ({
	id,
	fromPortRef: { deviceId: a[0], portIndex: a[1] },
	toPortRef: { deviceId: b[0], portIndex: b[1] },
})
const tie = (id: string, a: [string, number], b: [string, number]): StructuredLink => ({
	id, kind: 'tie', a: { deviceId: a[0], portIndex: a[1] }, b: { deviceId: b[0], portIndex: b[1] }, status: 'design',
})
const run = (id: string, a: [string, number], loc: [string, number]): StructuredLink => ({
	id, kind: 'outlet-run', a: { deviceId: a[0], portIndex: a[1] }, b: { locationId: loc[0], port: loc[1] }, status: 'design',
})

describe('walkCircuit', () => {
	it('traces the user example: server → tie → far switch', () => {
		// server1-p3 —cord→ tieA-p17 —tie→ tieB-p17 —cord→ switch02-p21
		const conns = [cord('c1', ['server1', 3], ['tieA', 17]), cord('c2', ['tieB', 17], ['switch02', 21])]
		const links = { t1: tie('t1', ['tieA', 17], ['tieB', 17]) }
		const c = walkCircuit({ deviceId: 'server1', portIndex: 3 }, conns, links)
		expect(c.nodes.map(n => n.type === 'port' ? `${n.deviceId}:${n.portIndex}` : 'loc')).toEqual([
			'server1:3', 'tieA:17', 'tieB:17', 'switch02:21',
		])
		expect(c.edges.map(e => e.kind)).toEqual(['cord', 'tie', 'cord'])
	})

	it('starting mid-circuit yields the same path in order', () => {
		const conns = [cord('c1', ['server1', 3], ['tieA', 17]), cord('c2', ['tieB', 17], ['switch02', 21])]
		const links = { t1: tie('t1', ['tieA', 17], ['tieB', 17]) }
		const c = walkCircuit({ deviceId: 'tieB', portIndex: 17 }, conns, links)
		expect(c.nodes.map(n => n.type === 'port' ? `${n.deviceId}:${n.portIndex}` : 'loc')).toEqual([
			'server1:3', 'tieA:17', 'tieB:17', 'switch02:21',
		])
	})

	it('ends at a location on outlet runs', () => {
		const conns = [cord('c1', ['sw', 1], ['panel', 5])]
		const links = { r1: run('r1', ['panel', 5], ['LA1', 2]) }
		const c = walkCircuit({ deviceId: 'sw', portIndex: 1 }, conns, links)
		expect(c.nodes.at(-1)).toEqual({ type: 'location', locationId: 'LA1', port: 2 })
		expect(c.edges.map(e => e.kind)).toEqual(['cord', 'run'])
	})

	it('a lone port is just itself; removed cords are ignored', () => {
		const c = walkCircuit({ deviceId: 'x', portIndex: 1 }, [{ ...cord('c', ['x', 1], ['y', 1]), status: 'remove' }], {})
		expect(c.nodes).toHaveLength(1)
		expect(c.edges).toHaveLength(0)
	})

	it('cycles terminate', () => {
		// x1 —cord→ y1 —tie→ x1 (degenerate loop)
		const conns = [cord('c1', ['x', 1], ['y', 1])]
		const links = { t1: tie('t1', ['y', 1], ['x', 1]) }
		const c = walkCircuit({ deviceId: 'x', portIndex: 1 }, conns, links)
		expect(c.nodes.length).toBeLessThan(10)
	})
})
