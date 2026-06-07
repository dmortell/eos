// Pure trunk-polygon geometry for the read-only render, copied (render functions only) from
// the production outlets tool. No Svelte, no editing/hit-testing — just the miter polygon
// builder and SVG path helpers. Coordinates in mm.
import type { Point } from './types'
import type { TrunkConfig } from './types'
import { trunkWidthMm } from './types'

const MITER_LIMIT = 4.0

// ── Vector math ──
const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y })
const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y })
const scale = (v: Point, s: number): Point => ({ x: v.x * s, y: v.y * s })
const vlen = (v: Point): number => Math.sqrt(v.x * v.x + v.y * v.y)
const norm = (v: Point): Point => { const l = vlen(v); return l ? { x: v.x / l, y: v.y / l } : { x: 0, y: 0 } }
const perp = (v: Point): Point => ({ x: -v.y, y: v.x })  // 90° CCW
const cross = (a: Point, b: Point): number => a.x * b.y - a.y * b.x
const distSq = (a: Point, b: Point): number => (a.x - b.x) ** 2 + (a.y - b.y) ** 2
export const dist = (a: Point, b: Point): number => Math.sqrt(distSq(a, b))

interface AdjEntry { targetId: string; thickness: number; angle: number }
interface NodeAdj { id: string; x: number; y: number; adj: AdjEntry[] }

/** Build mitred outline polygon(s) for a trunk network (half-edge traversal). */
export function generateTrunkPolygons(trunk: TrunkConfig): Point[][] {
	const width = trunkWidthMm(trunk)
	const nodes = trunk.nodes
	const segments = trunk.segments
	if (nodes.length < 2 || segments.length === 0) return []

	const nodeMap = new Map<string, NodeAdj>()
	for (const n of nodes) nodeMap.set(n.id, { id: n.id, x: n.position.x, y: n.position.y, adj: [] })

	for (const seg of segments) {
		const u = nodeMap.get(seg.nodes[0])
		const v = nodeMap.get(seg.nodes[1])
		if (!u || !v) continue
		u.adj.push({ targetId: v.id, thickness: width, angle: 0 })
		v.adj.push({ targetId: u.id, thickness: width, angle: 0 })
	}

	for (const node of nodeMap.values()) {
		for (const nb of node.adj) {
			const target = nodeMap.get(nb.targetId)!
			nb.angle = Math.atan2(target.y - node.y, target.x - node.x)
		}
		node.adj.sort((a, b) => a.angle - b.angle)
	}

	const polygons: Point[][] = []
	const visited = new Set<string>()

	for (const startNode of nodeMap.values()) {
		for (const edgeInfo of startNode.adj) {
			const key = `${startNode.id}|${edgeInfo.targetId}`
			if (visited.has(key)) continue

			const poly: Point[] = []
			let currId = startNode.id
			let nextId = edgeInfo.targetId
			let steps = 0
			const maxSteps = nodes.length * segments.length * 4 + 10

			while (!visited.has(`${currId}|${nextId}`) && steps++ < maxSteps) {
				visited.add(`${currId}|${nextId}`)
				const next = nodeMap.get(nextId)!
				const prev = nodeMap.get(currId)!

				const arrivalIdx = next.adj.findIndex(n => n.targetId === currId)
				if (arrivalIdx < 0) break
				const nextIdx = (arrivalIdx - 1 + next.adj.length) % next.adj.length
				const nextEdge = next.adj[nextIdx]

				const upcoming = nodeMap.get(nextEdge.targetId)
				if (!upcoming) break

				const thIn = next.adj[arrivalIdx].thickness
				const thOut = nextEdge.thickness
				const dirIn = norm(sub(next, prev))
				const dirOut = norm(sub(upcoming, next))
				const rightIn = perp(dirIn)
				const rightOut = perp(dirOut)
				const r1 = thIn / 2
				const r2 = thOut / 2

				if (currId === nextEdge.targetId) {
					poly.push(add(next, scale(rightIn, r1)))
					poly.push(add(next, scale(rightOut, r2)))
				} else {
					const p1 = add(next, scale(rightIn, r1))
					const p2 = add(next, scale(rightOut, r2))
					const det = cross(dirIn, dirOut)
					if (Math.abs(det) < 1e-5) {
						poly.push(p1)
					} else {
						const t = cross(sub(p2, p1), dirOut) / det
						const intersection = add(p1, scale(dirIn, t))
						const distToNode = Math.sqrt(distSq(intersection, next))
						const maxDist = Math.min(thIn, thOut) * MITER_LIMIT
						if (distToNode > maxDist) poly.push(p1, p2)
						else poly.push(intersection)
					}
				}

				currId = next.id
				nextId = nextEdge.targetId
			}

			if (poly.length >= 3) polygons.push(poly)
		}
	}

	return polygons
}

/** Convert polygon points to an SVG path string. */
export function polygonToPath(polygon: Point[]): string {
	if (polygon.length === 0) return ''
	return polygon.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ') + ' Z'
}

interface RoundedCorner { start: Point; end: Point; radius: number; sweep: 0 | 1; rounded: boolean }

/** Convert polygon points to an SVG path with rounded corners (radius in polygon units = mm). */
export function polygonToRoundedPath(polygon: Point[], radius: number): string {
	if (polygon.length === 0) return ''
	if (polygon.length < 3 || radius <= 0) return polygonToPath(polygon)

	const corners: RoundedCorner[] = []
	for (let i = 0; i < polygon.length; i++) {
		const prev = polygon[(i - 1 + polygon.length) % polygon.length]
		const curr = polygon[i]
		const next = polygon[(i + 1) % polygon.length]

		const inVec = sub(prev, curr)
		const outVec = sub(next, curr)
		const inLen = vlen(inVec)
		const outLen = vlen(outVec)
		if (inLen < 1e-6 || outLen < 1e-6) { corners.push({ start: curr, end: curr, radius: 0, sweep: 0, rounded: false }); continue }

		const inDir = scale(inVec, 1 / inLen)
		const outDir = scale(outVec, 1 / outLen)
		const dot = Math.max(-1, Math.min(1, inDir.x * outDir.x + inDir.y * outDir.y))
		const angle = Math.acos(dot)
		if (angle < 1e-3 || Math.abs(Math.PI - angle) < 1e-3) { corners.push({ start: curr, end: curr, radius: 0, sweep: 0, rounded: false }); continue }

		const maxOffset = Math.min(inLen, outLen) * 0.5
		const idealOffset = radius / Math.tan(angle / 2)
		const offset = Math.min(idealOffset, maxOffset)
		if (offset < 1e-6) { corners.push({ start: curr, end: curr, radius: 0, sweep: 0, rounded: false }); continue }

		const actualRadius = offset * Math.tan(angle / 2)
		const start = add(curr, scale(inDir, offset))
		const end = add(curr, scale(outDir, offset))
		const sweep: 0 | 1 = cross(inDir, outDir) < 0 ? 1 : 0
		corners.push({ start, end, radius: actualRadius, sweep, rounded: true })
	}

	let path = `M${corners[0].start.x},${corners[0].start.y}`
	for (let i = 0; i < corners.length; i++) {
		const c = corners[i]
		if (c.rounded) path += ` A${c.radius},${c.radius} 0 0 ${c.sweep} ${c.end.x},${c.end.y}`
		else path += ` L${c.end.x},${c.end.y}`
		const next = corners[(i + 1) % corners.length]
		path += ` L${next.start.x},${next.start.y}`
	}
	return `${path} Z`
}
