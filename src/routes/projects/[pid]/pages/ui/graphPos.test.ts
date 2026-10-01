import { describe, it, expect } from 'vitest'
import { graphPos, setGraphPos, setNodePos } from './graphPos'
import type { GNode } from '../3dview/graph'

// a trunk running at 2800, dropping vertically to 300 at its end (attached to a box there)
const run: GNode[] = [{ id: 'a', x: 1000, y: 500, z: 2800 }, { id: 'b', x: 4000, y: 500, z: 2800 }, { id: 'c', x: 4000, y: 500, z: 300, conn: { obj: 'box' } }]

describe('wall / conduit position', () => {
	it('X / Y = the plan bounds\' low corner, Z = the lowest node', () => {
		expect(graphPos(run)).toEqual({ x: 1000, y: 500, z: 300 })
		expect(graphPos([])).toEqual({ x: 0, y: 0, z: 0 })
	})
	it('setting Z lifts the whole run (the drop keeps its shape), never below 0; attachments stay', () => {
		const up = setGraphPos(run, 'z', 500)
		expect(up.map((n) => n.z)).toEqual([3000, 3000, 500])
		expect(up[2].conn).toEqual({ obj: 'box' })
		expect(setGraphPos(run, 'z', -100).map((n) => n.z)).toEqual([2500, 2500, 0])
	})
	it('setting X / Y moves it in plan and detaches attached nodes', () => {
		const moved = setGraphPos(run, 'x', 0)
		expect(moved.map((n) => n.x)).toEqual([0, 3000, 3000])
		expect(moved[2].conn).toBeUndefined()
		expect(run[2].conn).toBeDefined()   // input untouched
	})
	it('one node: its own coordinate', () => {
		expect(setNodePos(run, 'b', 'z', 2400).map((n) => n.z)).toEqual([2800, 2400, 300])
		expect(setNodePos(run, 'c', 'y', 900)[2]).toEqual({ id: 'c', x: 4000, y: 900, z: 300 })
	})
})
