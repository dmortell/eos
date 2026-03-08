import type { Point } from '../parts/types'
import type { TrunkConfig, TrunkNode, TrunkSegment } from './types'
import { trunkWidthMm } from './types'
import { MITER_LIMIT } from './constants'

// ── Grid snapping ──

/** Snap a point to the nearest grid intersection. gridMm=0 disables snapping. */
export function snapToGrid(pos: Point, gridMm: number): Point {
	if (gridMm <= 0) return pos
	return {
		x: Math.round(pos.x / gridMm) * gridMm,
		y: Math.round(pos.y / gridMm) * gridMm,
	}
}

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

// ── Polygon generation (miter algorithm adapted from Walls4.svelte) ──

interface AdjEntry {
	targetId: string
	thickness: number
	angle: number
}

interface NodeAdj {
	id: string
	x: number
	y: number
	adj: AdjEntry[]
}

export function generateTrunkPolygons(trunk: TrunkConfig): Point[][] {
	const width = trunkWidthMm(trunk)
	const nodes = trunk.nodes
	const segments = trunk.segments

	if (nodes.length < 2 || segments.length === 0) return []

	// Build adjacency list with angle-sorted neighbors
	const nodeMap = new Map<string, NodeAdj>()
	for (const n of nodes) {
		nodeMap.set(n.id, { id: n.id, x: n.position.x, y: n.position.y, adj: [] })
	}

	for (const seg of segments) {
		const u = nodeMap.get(seg.nodes[0])
		const v = nodeMap.get(seg.nodes[1])
		if (!u || !v) continue
		u.adj.push({ targetId: v.id, thickness: width, angle: 0 })
		v.adj.push({ targetId: u.id, thickness: width, angle: 0 })
	}

	// Sort neighbors by angle
	for (const node of nodeMap.values()) {
		for (const nb of node.adj) {
			const target = nodeMap.get(nb.targetId)!
			nb.angle = Math.atan2(target.y - node.y, target.x - node.x)
		}
		node.adj.sort((a, b) => a.angle - b.angle)
	}

	// Half-edge traversal to build polygon loops
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
				const curr = nodeMap.get(currId)!
				const next = nodeMap.get(nextId)!

				const arrivalIdx = next.adj.findIndex(n => n.targetId === currId)
				if (arrivalIdx < 0) break
				const nextIdx = (arrivalIdx - 1 + next.adj.length) % next.adj.length
				const nextEdge = next.adj[nextIdx]

				const prev = nodeMap.get(currId)!
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
					// Dead-end (180° turn)
					poly.push(add(next, scale(rightIn, r1)))
					poly.push(add(next, scale(rightOut, r2)))
				} else {
					const p1 = add(next, scale(rightIn, r1))
					const p2 = add(next, scale(rightOut, r2))
					const det = cross(dirIn, dirOut)
					if (Math.abs(det) < 1e-5) {
						poly.push(p1) // Parallel
					} else {
						const t = cross(sub(p2, p1), dirOut) / det
						const intersection = add(p1, scale(dirIn, t))
						const distToNode = Math.sqrt(distSq(intersection, next))
						const maxDist = Math.min(thIn, thOut) * MITER_LIMIT
						if (distToNode > maxDist) {
							poly.push(p1, p2) // Bevel
						} else {
							poly.push(intersection) // Miter
						}
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

/** Convert polygon points to SVG path string */
export function polygonToPath(polygon: Point[]): string {
	if (polygon.length === 0) return ''
	return polygon.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ') + ' Z'
}

interface RoundedCorner {
	start: Point
	end: Point
	radius: number
	sweep: 0 | 1
	rounded: boolean
}

interface RoundedPathOptions {
	/** Corners near these points (within skipRoundDistancePx) are kept sharp */
	skipRoundCenters?: Point[]
	skipRoundDistancePx?: number
	/** Per-node radius overrides: map of node center to custom radius in same units as polygon */
	nodeRadiusMap?: Map<string, number>
}

/**
 * Convert polygon points to SVG path string with rounded corners.
 * Radius is expressed in the same units as the polygon points.
 */
export function polygonToRoundedPath(
	polygon: Point[],
	radius: number,
	options: RoundedPathOptions = {},
): string {
	if (polygon.length === 0) return ''
	if (polygon.length < 3 || radius <= 0) return polygonToPath(polygon)

	const skipRoundCenters = options.skipRoundCenters ?? []
	const skipRoundDistancePx = options.skipRoundDistancePx ?? 0
	const nodeRadiusMap = options.nodeRadiusMap ?? new Map()

	const corners: RoundedCorner[] = []

	for (let i = 0; i < polygon.length; i++) {
		const prev = polygon[(i - 1 + polygon.length) % polygon.length]
		const curr = polygon[i]
		const next = polygon[(i + 1) % polygon.length]

		// Check for skip centers (straight corners)
		if (
			skipRoundDistancePx > 0
			&& skipRoundCenters.some(center => dist(center, curr) <= skipRoundDistancePx)
		) {
			corners.push({ start: curr, end: curr, radius: 0, sweep: 0, rounded: false })
			continue
		}

		// Check for per-node radius override
		let effectiveRadius = radius
		for (const [key, nodeRadius] of nodeRadiusMap) {
			const [x, y] = key.split(',').map(Number)
			const threshold = Math.max(skipRoundDistancePx, 10) // Use at least 10px threshold
			if (dist(curr, { x, y }) <= threshold) {
				effectiveRadius = nodeRadius
				break
			}
		}

		const inVec = sub(prev, curr)
		const outVec = sub(next, curr)
		const inLen = vlen(inVec)
		const outLen = vlen(outVec)

		if (inLen < 1e-6 || outLen < 1e-6) {
			corners.push({ start: curr, end: curr, radius: 0, sweep: 0, rounded: false })
			continue
		}

		const inDir = scale(inVec, 1 / inLen)
		const outDir = scale(outVec, 1 / outLen)
		const dot = Math.max(-1, Math.min(1, inDir.x * outDir.x + inDir.y * outDir.y))
		const angle = Math.acos(dot)

		// Straight-through / degenerate corners are not rounded.
		if (angle < 1e-3 || Math.abs(Math.PI - angle) < 1e-3) {
			corners.push({ start: curr, end: curr, radius: 0, sweep: 0, rounded: false })
			continue
		}

		const maxOffset = Math.min(inLen, outLen) * 0.5
		const idealOffset = effectiveRadius / Math.tan(angle / 2)
		const offset = Math.min(idealOffset, maxOffset)

		if (offset < 1e-6) {
			corners.push({ start: curr, end: curr, radius: 0, sweep: 0, rounded: false })
			continue
		}

		const actualRadius = offset * Math.tan(angle / 2)
		const start = add(curr, scale(inDir, offset))
		const end = add(curr, scale(outDir, offset))
		const sweep: 0 | 1 = cross(inDir, outDir) < 0 ? 1 : 0

		corners.push({ start, end, radius: actualRadius, sweep, rounded: true })
	}

	let path = `M${corners[0].start.x},${corners[0].start.y}`

	for (let i = 0; i < corners.length; i++) {
		const c = corners[i]
		if (c.rounded) {
			path += ` A${c.radius},${c.radius} 0 0 ${c.sweep} ${c.end.x},${c.end.y}`
		} else {
			path += ` L${c.end.x},${c.end.y}`
		}

		const next = corners[(i + 1) % corners.length]
		path += ` L${next.start.x},${next.start.y}`
	}

	return `${path} Z`
}

// ── Hit testing ──

export function hitTestNode(pos: Point, nodes: TrunkNode[], radiusMm: number): TrunkNode | null {
	for (let i = nodes.length - 1; i >= 0; i--) {
		if (dist(pos, nodes[i].position) <= radiusMm) return nodes[i]
	}
	return null
}

export function hitTestSegment(
	pos: Point,
	nodes: TrunkNode[],
	segments: TrunkSegment[],
	widthMm: number,
): { segment: TrunkSegment; t: number } | null {
	const nodeMap = new Map(nodes.map(n => [n.id, n]))
	const threshold = Math.max(widthMm / 2 + 50, 200) // at least 200mm hit area

	let best: { segment: TrunkSegment; t: number; d: number } | null = null

	for (const seg of segments) {
		const a = nodeMap.get(seg.nodes[0])
		const b = nodeMap.get(seg.nodes[1])
		if (!a || !b) continue

		const result = nearestPointOnSegment(pos, a.position, b.position)
		if (result.dist < threshold && (!best || result.dist < best.d)) {
			best = { segment: seg, t: result.t, d: result.dist }
		}
	}

	return best ? { segment: best.segment, t: best.t } : null
}

export function hitTestTrunkBody(pos: Point, polygons: Point[][]): boolean {
	return polygons.some(poly => pointInPolygon(pos, poly))
}

function pointInPolygon(p: Point, polygon: Point[]): boolean {
	let inside = false
	for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
		const xi = polygon[i].x, yi = polygon[i].y
		const xj = polygon[j].x, yj = polygon[j].y
		if (((yi > p.y) !== (yj > p.y)) && (p.x < (xj - xi) * (p.y - yi) / (yj - yi) + xi)) {
			inside = !inside
		}
	}
	return inside
}

// ── Snapping ──

export function constrainAngle(from: Point, to: Point, stepDeg: number = 15): Point {
	const dx = to.x - from.x
	const dy = to.y - from.y
	const d = Math.sqrt(dx * dx + dy * dy)
	if (d < 1) return to

	const angle = Math.atan2(dy, dx)
	const stepRad = (stepDeg * Math.PI) / 180
	const snapped = Math.round(angle / stepRad) * stepRad

	return {
		x: from.x + d * Math.cos(snapped),
		y: from.y + d * Math.sin(snapped),
	}
}

export interface SnapTarget {
	position: Point
	id: string
	type: 'node' | 'outlet' | 'rack'
	trunkId?: string  // which trunk this node belongs to (only for type 'node')
}

export function snapToNearby(
	pos: Point,
	targets: SnapTarget[],
	thresholdMm: number,
): { target: SnapTarget; snappedPos: Point } | null {
	let best: { target: SnapTarget; d: number } | null = null
	for (const t of targets) {
		const d = dist(pos, t.position)
		if (d <= thresholdMm && (!best || d < best.d)) {
			best = { target: t, d }
		}
	}
	return best ? { target: best.target, snappedPos: best.target.position } : null
}

// ── Graph operations ──

export function splitSegment(
	trunk: TrunkConfig,
	segmentId: string,
	point: Point,
): { trunk: TrunkConfig; newNodeId: string } {
	const seg = trunk.segments.find(s => s.id === segmentId)
	if (!seg) return { trunk, newNodeId: '' }

	const newNodeId = `tn-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
	const newNode: TrunkNode = { id: newNodeId, position: point, z: trunk.nodes[0]?.z ?? 0 }

	const seg1Id = `ts-${Date.now()}-a`
	const seg2Id = `ts-${Date.now()}-b`
	const seg1: TrunkSegment = { id: seg1Id, nodes: [seg.nodes[0], newNodeId] }
	const seg2: TrunkSegment = { id: seg2Id, nodes: [newNodeId, seg.nodes[1]] }

	return {
		trunk: {
			...trunk,
			nodes: [...trunk.nodes, newNode],
			segments: [...trunk.segments.filter(s => s.id !== segmentId), seg1, seg2],
		},
		newNodeId,
	}
}

export function computeTrunkLength(trunk: TrunkConfig): number {
	const nodeMap = new Map(trunk.nodes.map(n => [n.id, n]))
	let total = 0
	for (const seg of trunk.segments) {
		const a = nodeMap.get(seg.nodes[0])
		const b = nodeMap.get(seg.nodes[1])
		if (a && b) total += dist(a.position, b.position)
	}
	return total
}

// ── Utilities ──

export function nearestPointOnSegment(
	point: Point,
	a: Point,
	b: Point,
): { point: Point; t: number; dist: number } {
	const dx = b.x - a.x
	const dy = b.y - a.y
	const len2 = dx * dx + dy * dy
	if (len2 === 0) return { point: a, t: 0, dist: dist(point, a) }

	const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / len2))
	const closest = { x: a.x + dx * t, y: a.y + dy * t }
	return { point: closest, t, dist: dist(point, closest) }
}

export function genId(prefix: string = 'tn'): string {
	return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}
