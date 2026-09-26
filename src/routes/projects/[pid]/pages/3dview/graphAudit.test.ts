import { describe, it, expect } from 'vitest'
import { auditGraph, fixGraph } from './graphAudit'
import type { Obj } from './types'
import type { Ent } from '../ui/geometry'

const n = (id: string, x: number, y = 0, z = 0) => ({ id, x, y, z })
const conduit = (o: Partial<Extract<Obj, { type: 'conduit' }>>): Obj => ({ type: 'conduit', id: 'c1', w: 100, h: 50, edges: 4, nodes: [], segments: [], ...o }) as Obj

describe('graph AUDIT', () => {
	it('a clean run has no issues and is left as it is', () => {
		const m = { id: 'm', objects: [conduit({ nodes: [n('a', 0), n('b', 1000)], segments: [{ id: 's', a: 'a', b: 'b' }] })] }
		expect(auditGraph(m)).toEqual([])
		expect(fixGraph(m)).toEqual(m.objects)
	})
	it('drops dangling / zero-length / duplicate segments, merges coincident nodes, removes orphans', () => {
		const m = { id: 'm', objects: [conduit({
			nodes: [n('a', 0), n('b', 1000), n('b2', 1000), n('c', 2000), n('lone', 5000)],
			segments: [{ id: 's1', a: 'a', b: 'b' }, { id: 's2', a: 'b2', b: 'c' }, { id: 's3', a: 'a', b: 'zz' }, { id: 's4', a: 'b', b: 'b2' }, { id: 's5', a: 'b', b: 'a' }],
		})] }
		const kinds = auditGraph(m).map((i) => i.kind).sort()
		expect(kinds).toEqual(['dangling', 'duplicate-node', 'duplicate-seg', 'orphan', 'zero'])
		const f = fixGraph(m)[0] as Extract<Obj, { type: 'conduit' }>
		expect(f.nodes.map((x) => x.id)).toEqual(['a', 'b', 'c'])
		expect(f.segments).toEqual([{ id: 's1', a: 'a', b: 'b' }, { id: 's2', a: 'b', b: 'c' }])
	})
	it('detaches ends attached to a gone box / outlet; keeps a live outlet link', () => {
		const out: Ent = { id: 'o1', type: 'insert', a: [0, 0], attrs: { PORTS: '2' } }
		const m = { id: 'm', shapes: [out], objects: [conduit({
			nodes: [{ ...n('a', 0), conn: { ent: 'o1' } }, { ...n('b', 1000), conn: { obj: 'gone', pt: 'c' } }],
			segments: [{ id: 's', a: 'a', b: 'b' }],
		})] }
		expect(auditGraph(m).map((i) => i.kind)).toEqual(['conn'])
		const f = fixGraph(m)[0] as Extract<Obj, { type: 'conduit' }>
		expect(f.nodes[0].conn).toEqual({ ent: 'o1' }); expect(f.nodes[1].conn).toBeUndefined()
	})
	it('deletes an empty run, reports an orphan device, clears a stale allocation', () => {
		const dev = { type: 'prism', id: 'd1', x: 0, y: 0, z: 0, w: 1, d: 1, h: 1, device: { rackId: 'rk', u: 1, hU: 1, alloc: { '1': { outlet: 'gone', model: 'm', port: 1, label: 'X' } } } } as unknown as Obj
		const m = { id: 'm', objects: [conduit({ nodes: [n('a', 0)], segments: [] }), dev] }
		expect(auditGraph(m).map((i) => i.kind).sort()).toEqual(['alloc', 'empty', 'rack'])
		const f = fixGraph(m)
		expect(f.length).toBe(1); expect(f[0].device?.alloc).toEqual({})
	})
})
