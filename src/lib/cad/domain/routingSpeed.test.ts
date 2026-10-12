// Q56: the graph and the taps are found through hashes / grids; they must give what the plain scans gave.
import { describe, it, expect } from 'vitest'
import { buildGraph, outletTap, levelElevation, outletZ, JOIN_MM } from './routing'
import type { Level } from './types'
import { ProjectIndex } from './project'
import { bigRouteProject } from '../bench/genRoute'

const dist3 = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)

describe('routing speed (Q56): same graph, same taps', () => {
	const ix = new ProjectIndex(bigRouteProject(12, 10, 200, 100))
	const g = buildGraph(ix)

	it('graph nodes and pieces equal the full-scan construction', () => {
		// the original: first node within JOIN_MM; cut at every node lying on the segment, in node order
		const nodes: typeof g.nodes = []
		const nodeAt = (x: (typeof nodes)[0]) => { for (let i = 0; i < nodes.length; i++) if (dist3(nodes[i], x) <= JOIN_MM) return i; nodes.push(x); return nodes.length - 1 }
		const ends = g.segs.map((s) => [nodeAt(s.p), nodeAt(s.q)] as const)
		expect(g.nodes.length).toBe(nodes.length)
		const pieces: { a: number; b: number; t0: number; t1: number }[] = []
		g.segs.forEach((s, i) => {
			const cuts = [{ t: 0, n: ends[i][0] }, { t: 1, n: ends[i][1] }]
			nodes.forEach((x, n) => {
				if (n === ends[i][0] || n === ends[i][1]) return
				const dx = s.q.x - s.p.x, dy = s.q.y - s.p.y, dz = s.q.z - s.p.z, L2 = dx * dx + dy * dy + dz * dz
				const t = L2 ? Math.max(0, Math.min(1, ((x.x - s.p.x) * dx + (x.y - s.p.y) * dy + (x.z - s.p.z) * dz) / L2)) : 0
				if (dist3({ x: s.p.x + dx * t, y: s.p.y + dy * t, z: s.p.z + dz * t }, x) <= JOIN_MM && t > 0 && t < 1) cuts.push({ t, n })
			})
			cuts.sort((a, b) => a.t - b.t)
			for (let k = 0; k + 1 < cuts.length; k++) if (cuts[k].n !== cuts[k + 1].n) pieces.push({ a: cuts[k].n, b: cuts[k + 1].n, t0: cuts[k].t, t1: cuts[k + 1].t })
		})
		expect(g.pieces.map((p) => ({ a: p.a, b: p.b, t0: p.t0, t1: p.t1 }))).toEqual(pieces)
		expect(pieces.some((p) => p.t0 > 0 && p.t0 < 1)).toBe(true)   // there are tees
	})

	it('the nearest run for every outlet equals the scan over all segments', () => {
		for (const o of ix.outlets) {
			let best: { seg: number; drop: number } | null = null
			const oz = levelElevation(ix, o.levelId) + outletZ(o, ix.get<Level>(o.levelId))
			g.segs.forEach((s, i) => {
				const role = s.shape.role
				if (role?.kind !== 'containment' || (role.tier !== o.tier && role.tier !== 'wall') || !s.levelIds.has(o.levelId)) return
				if (Math.abs(s.p.x - s.q.x) < 0.5 && Math.abs(s.p.y - s.q.y) < 0.5) return
				if (!g.piecesOf.get(`${s.shape.id}:${s.seg}`)?.length) return
				const dx = s.q.x - s.p.x, dy = s.q.y - s.p.y, L2 = dx * dx + dy * dy
				const t = L2 ? Math.max(0, Math.min(1, ((o.at!.x - s.p.x) * dx + (o.at!.y - s.p.y) * dy) / L2)) : 0
				const plan = Math.hypot(s.p.x + dx * t - o.at!.x, s.p.y + dy * t - o.at!.y)
				const drop = plan + Math.abs(s.p.z + (s.q.z - s.p.z) * t - oz)
				if (drop <= 10_000 && (!best || drop < best.drop)) best = { seg: i, drop }
			})
			const got = outletTap(g, ix, o, 'SR-A')
			expect(got?.seg).toBe(best?.seg)
		}
	})
})
