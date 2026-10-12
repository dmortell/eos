// ESTIMATED CABLES (before allocation): every outlet port with no link yet gets an estimated cable to its server room,
// routed like a link (domain/routing.ts) — the same graph, the same outlet tap (its tier, its room's runs, 10 m reach)
// — so routes and fill show before any panel port is allocated (the legacy Outlets tool dropped every outlet onto the
// nearest trunk of its tier and room and summed fill). Never stored; a port's estimate goes when a link reaches it.
//   The room: the port's own server room, else another port's of the same outlet, else the one most of its zone's
//   ports go to, else its level's only server room, else the room the nearest run of its tier serves (one only).
//   The far end: the room's patch frames (every rack in it when none is marked), placed — joining the runs as a
//   link's rack does (rackTaps), the cheapest frame winning — else the centre of the room's outline.
// One search per room, shared by its estimates, over the graph the links are routed on. Pure; tested in
// estimates.test.ts.
import type { Id, Outlet, Rack, Space } from './types'
import type { ProjectIndex } from './project'
import { buildGraph, routeLinksOn, outletTap, rackTaps, fromTaps, bestEnd, bestSegs, DEFAULT_CABLE, MAX_OUTLET_DROP_MM, type Graph, type Route, type Stage, type Tap, type CableSettings } from './routing'

export interface Estimate {
	outletId: Id
	port: number
	cableType: string
	/** The server room it goes to (see the header for how it is chosen). */
	roomId?: Id
	/** The run segments walked, outlet end first (as a link's route). */
	segs: Route['segs']
	/** The route, mm: end drops + the path. */
	routeMm?: number
	/** Route + the outlet slack, rounded up to the metre. */
	lengthM?: number
	/** Why there is no estimate route. */
	problem?: string
}

export interface Routing { routes: Map<Id, Route>; estimates: Estimate[] }

/** Every link's route AND every unlinked outlet port's estimate, over one graph. */
export function routeAll(ix: ProjectIndex, cable: CableSettings = DEFAULT_CABLE): Routing {
	const g = buildGraph(ix)
	return { routes: routeLinksOn(g, ix, cable), estimates: estimateCables(g, ix, cable) }
}

const isRoom = (ix: ProjectIndex, id: Id | undefined): id is Id => !!id && ix.get(id)?.type === 'space'

/** The estimates over a graph already built. */
export function estimateCables(g: Graph, ix: ProjectIndex, cable: CableSettings = DEFAULT_CABLE): Estimate[] {
	const out: Estimate[] = []
	const todo = ix.outlets.filter((o) => o.usage !== 'N/A' && o.at && o.ports.some((p) => !ix.linkAt({ on: o.id, port: p.port })))
	if (!todo.length) return out
	const roomOf = roomPicker(g, ix)
	// one search per room: from every frame's taps at once (the cheapest frame wins), kept for the room's estimates
	const searches = new Map<Id, Stage | null>()
	const searchOf = (roomId: Id): Stage | null => {
		if (searches.has(roomId)) return searches.get(roomId)!
		const taps = endRacks(ix, roomId).flatMap((r) => rackTaps(g, ix, r, undefined))
		const s = taps.length ? { ...fromTaps(g, taps), taps } : null
		searches.set(roomId, s)
		return s
	}
	const taps = new Map<string, Tap | null>()   // per outlet and room: its ports share it
	for (const o of todo) for (const p of o.ports) {
		if (ix.linkAt({ on: o.id, port: p.port })) continue
		const roomId = roomOf(o, p.port)
		const est = (r: Partial<Estimate>): void => { out.push({ outletId: o.id, port: p.port, cableType: p.cableType, ...(roomId ? { roomId } : {}), segs: [], ...r }) }
		if (!roomId) { est({ problem: 'no server room' }); continue }
		const from = searchOf(roomId)
		if (!from) { est({ problem: `${ix.nameOf(roomId) || 'its room'} has no placed rack or outline near a run` }); continue }
		const k = `${o.id}|${roomId}`
		if (!taps.has(k)) taps.set(k, outletTap(g, ix, o, roomId))
		const t = taps.get(k)
		if (!t) { est({ problem: `no ${o.tier} run within ${MAX_OUTLET_DROP_MM / 1000} m of the outlet serving its room` }); continue }
		const best = bestEnd(g, from, [t])
		if (!best) { est({ problem: 'the runs at the two ends are not connected' }); continue }
		est({ segs: bestSegs(g, from, best), routeMm: best.cost, lengthM: Math.ceil(best.cost / 1000 + cable.slackM) })
	}
	return out
}

/** How an unlinked port's room is chosen (see the header), with the per-zone and per-level answers worked out once. */
function roomPicker(g: Graph, ix: ProjectIndex): (o: Outlet, port: number) => Id | undefined {
	const byZone = new Map<Id, Map<Id, number>>()
	for (const o of ix.outlets) if (o.zoneId) for (const p of o.ports) if (isRoom(ix, p.serverRoomId)) {
		const m = byZone.get(o.zoneId) ?? byZone.set(o.zoneId, new Map()).get(o.zoneId)!
		m.set(p.serverRoomId, (m.get(p.serverRoomId) ?? 0) + 1)
	}
	const zoneRoom = new Map([...byZone].map(([z, m]) => [z, [...m].sort((a, b) => b[1] - a[1])[0][0]]))
	const levelRoom = new Map<Id, Id | undefined>()
	return (o, port) => {
		const own = o.ports.find((p) => p.port === port)?.serverRoomId
		if (isRoom(ix, own)) return own
		const sibling = o.ports.find((p) => isRoom(ix, p.serverRoomId))?.serverRoomId
		if (sibling) return sibling
		if (o.zoneId && zoneRoom.has(o.zoneId)) return zoneRoom.get(o.zoneId)
		if (!levelRoom.has(o.levelId)) {
			const rooms = ix.spaces.filter((s) => s.levelId === o.levelId && s.kind === 'server room')
			levelRoom.set(o.levelId, rooms.length === 1 ? rooms[0].id : undefined)
		}
		if (levelRoom.get(o.levelId)) return levelRoom.get(o.levelId)
		const t = outletTap(g, ix, o, undefined), role = t ? g.segs[t.seg].shape.role : undefined
		return role?.kind === 'containment' && role.serves?.length === 1 && isRoom(ix, role.serves[0]) ? role.serves[0] : undefined
	}
}

/** Where a room's estimated cables end: its patch frames (every rack when none is marked) that are placed, else a
 *  stand-in at the centre of its outline. */
function endRacks(ix: ProjectIndex, roomId: Id): Rack[] {
	const inRoom = ix.racks.filter((r) => r.spaceId === roomId && r.at)
	const frames = inRoom.filter((r) => r.patchFrame)
	if (frames.length || inRoom.length) return frames.length ? frames : inRoom
	const sp = ix.get<Space>(roomId)
	if (sp?.type !== 'space' || !sp.boundary?.length) return []
	const c = sp.boundary.reduce((a, q) => ({ x: a.x + q.x / sp.boundary!.length, y: a.y + q.y / sp.boundary!.length }), { x: 0, y: 0 })
	return [{ type: 'rack', id: `${roomId}:centre`, levelId: sp.levelId, spaceId: roomId, order: 0, name: sp.name, kind: '4-post', heightU: 42, widthMm: 600, depthMm: 1000, at: c }]
}
