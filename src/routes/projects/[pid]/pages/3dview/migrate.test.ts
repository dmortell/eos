import { describe, it, expect } from 'vitest'
import { polyToGraph, migrateModels, BACKGROUND_LAYER } from './migrate'
import type { Model, Wall, Conduit } from './types'

const P = (x: number, y: number, z = 0) => ({ x, y, z })

describe('polyToGraph', () => {
	it('an open polyline becomes n nodes and n−1 sequential segments', () => {
		const { nodes, segments } = polyToGraph([P(0, 0), P(100, 0), P(100, 100)])
		expect(nodes).toHaveLength(3)
		expect(segments).toHaveLength(2)
		expect(segments[0]).toMatchObject({ a: nodes[0].id, b: nodes[1].id })
		expect(segments[1]).toMatchObject({ a: nodes[1].id, b: nodes[2].id })
		expect(nodes.map((n) => [n.x, n.y, n.z])).toEqual([[0, 0, 0], [100, 0, 0], [100, 100, 0]])
	})
	it('a trailing point equal to the first closes the loop instead of duplicating the node', () => {
		const { nodes, segments } = polyToGraph([P(0, 0), P(100, 0), P(100, 100), P(0, 0)])
		expect(nodes).toHaveLength(3)
		expect(segments).toHaveLength(3)
		expect(segments[2]).toMatchObject({ a: nodes[2].id, b: nodes[0].id })
	})
	it('two coincident points do not count as closed (needs > 2 points)', () => {
		const { nodes, segments } = polyToGraph([P(5, 5), P(5, 5)])
		expect(nodes).toHaveLength(2)
		expect(segments).toHaveLength(1)
	})
	it('assigns unique node and segment ids', () => {
		const { nodes, segments } = polyToGraph([P(0, 0), P(1, 0), P(2, 0)])
		const ids = [...nodes.map((n) => n.id), ...segments.map((s) => s.id)]
		expect(new Set(ids).size).toBe(ids.length)
	})
})

describe('migrateModels', () => {
	const legacyWall = { type: 'wall', h: 2700, thickness: 150, z: 300, layer: 'walls', pts: [P(0, 0), P(1000, 0), P(1000, 500)] }
	const legacyConduit = { type: 'conduit', w: 100, h: 50, edges: 4, path: [P(0, 0, 100), P(0, 800, 100)] }

	it('converts legacy pts/path walls and conduits to the node/segment graph, carrying the wall z', () => {
		const [m] = migrateModels([{ id: 1, name: 'm', objects: [legacyWall as never, legacyConduit as never] }])
		const w = m.objects[0] as Wall, c = m.objects[1] as Conduit
		expect(w.type).toBe('wall'); expect(w.nodes).toHaveLength(3); expect(w.segments).toHaveLength(2)
		expect(w.nodes.every((n) => n.z === 300)).toBe(true)
		expect(w).toMatchObject({ h: 2700, thickness: 150, layer: 'walls' })
		expect('pts' in w).toBe(false)
		expect(c.type).toBe('conduit'); expect(c.nodes).toHaveLength(2); expect(c.segments).toHaveLength(1)
		expect(c.nodes[1]).toMatchObject({ x: 0, y: 800, z: 100 })
		expect('path' in c).toBe(false)
	})
	it('backfills a stable object id and appends the reserved background layer', () => {
		const [m] = migrateModels([{ id: 1, name: 'm', objects: [{ type: 'prism', x: 0, y: 0, z: 0, w: 1, h: 1, d: 1, edges: 4 }], layers: [{ id: 'L1', name: 'L1', color: '#000', visible: true, locked: false }] }])
		expect(typeof m.objects[0].id).toBe('string')
		expect(m.layers?.map((l) => l.id)).toEqual(['L1', 'background'])
		expect(m.layers?.[1]).toEqual(BACKGROUND_LAYER)
		expect(m.layers?.[1]).not.toBe(BACKGROUND_LAYER)   // a copy, not the shared constant
	})
	it('is idempotent — an already-migrated model array is returned by reference', () => {
		const once = migrateModels([{ id: 1, name: 'm', objects: [legacyWall as never] }])
		const twice = migrateModels(once)
		expect(twice).toBe(once)
		expect(twice[0]).toBe(once[0])
	})
	it('leaves an untouched model object identical when only a sibling changes', () => {
		const clean: Model = { id: 2, name: 'clean', objects: [{ type: 'prism', id: 'o1', x: 0, y: 0, z: 0, w: 1, h: 1, d: 1, edges: 4 }], layers: [{ ...BACKGROUND_LAYER }] }
		const dirty: Model = { id: 1, name: 'dirty', objects: [] }
		const out = migrateModels([clean, dirty])
		expect(out).not.toBe([clean, dirty])
		expect(out[0]).toBe(clean)
		expect(out[1]).not.toBe(dirty)
		expect(out[1].layers?.[0].id).toBe('background')
	})
})
