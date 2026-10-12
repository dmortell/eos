// Copy / paste (backlog "Clipboard"): the selection goes to the SYSTEM clipboard as marked JSON, so it pastes across
// levels, sheets, tabs and projects. A paste is AS-IS (Dave): same coordinates, same labels — the user sorts out
// overlaps and duplicates. It gets new ids (references inside the copy follow), keeps each item's layer (bringing the
// project layers it uses) and drops references the target can't honour. Ctrl-drag copy is the same paste, moved.
import type { Id, Pt, Rack, Device, Space } from './types'
import type { Entity, Layer, Sheet, Group } from './drawing'
import { moveGeometry, outlineOf, type Shape } from './shapes'
import type { ProjectIndex } from './project'
import { newId } from './ids'
import { newServerRoom, placementProblem } from './devices'

export const CLIP_MARK = 'eos-cad-clip/1'

export interface Clip {
	mark: typeof CLIP_MARK
	pid: string
	/** Where it was copied from: a level's plan, a sheet's paper, or a rack (devices on their own). */
	from: { kind: 'level' | 'sheet' | 'rack'; id: Id }
	items: Entity[]
	/** The project layers the items are on (system layers need no record). */
	layers: Layer[]
}

/** Every {x, y} point inside a value (any geometry kind) mapped by `f` — to untie a note (moving uses moveGeometry,
 *  which knows each kind). */
function mapPts<T>(v: T, f: (p: Pt) => Pt): T {
	if (Array.isArray(v)) return v.map((x) => mapPts(x, f)) as T
	if (!v || typeof v !== 'object') return v
	const o = v as Record<string, unknown>
	const out: Record<string, unknown> = {}
	for (const k in o) out[k] = mapPts(o[k], f)
	if (typeof o.x === 'number' && typeof o.y === 'number') Object.assign(out, f({ x: o.x, y: o.y }))
	return out as T
}

/** A note drawn inside a viewport, as plain paper points (a copy isn't tied to a viewport). */
function untie(s: Shape, ix: ProjectIndex): Shape {
	if (!s.sheetId || !s.vpId) return s
	const vp = ix.get<Sheet>(s.sheetId)?.viewports.find((v) => v.id === s.vpId)
	const { vpId: _, ...rest } = s
	if (!vp) return rest as Shape
	const mx = vp.rect.x + vp.rect.w / 2, my = vp.rect.y + vp.rect.h / 2, k = 1 / vp.scale
	return { ...rest, geom: mapPts(s.geom, (p) => ({ x: mx + (p.x - vp.centre.x) * k, y: my + (p.y - vp.centre.y) * k })) } as Shape
}

/** The selection as a clip: plan items (shapes, outlets, racks with their devices), sheet notes, or devices on their
 *  own (from any racks). Null = nothing. */
export function makeClip(ix: ProjectIndex, ids: Id[], pid: string): Clip | null {
	const items: Entity[] = []
	let from: Clip['from'] | null = null
	for (const id of ids) {
		const e = ix.get(id)
		if (!e) continue
		const at: Clip['from'] | null = e.type === 'shape' ? (e.levelId ? { kind: 'level', id: e.levelId } : e.sheetId ? { kind: 'sheet', id: e.sheetId } : null)
			: e.type === 'outlet' || e.type === 'rack' ? { kind: 'level', id: e.levelId } : e.type === 'device' ? { kind: 'rack', id: e.rackId } : null
		if (!at || (from && (from.kind !== at.kind || (from.kind !== 'rack' && from.id !== at.id)))) continue
		from = at
		items.push(e.type === 'shape' ? untie(e, ix) : e)
		if (e.type === 'rack') items.push(...ix.devices.filter((d) => d.rackId === e.id))
	}
	if (!from || !items.length) return null
	const used = new Set(items.map((e) => (e as { layerId?: Id }).layerId).filter(Boolean))
	return { mark: CLIP_MARK, pid, from, items, layers: ix.layers.filter((l) => used.has(l.id) && !l.id.startsWith('sys:')) }
}

export function parseClip(text: string): Clip | null {
	try {
		const c = JSON.parse(text) as Clip
		return c?.mark === CLIP_MARK && Array.isArray(c.items) ? c : null
	} catch { return null }
}

/** The middle of what a clip holds (its points' box) — Ctrl+Shift+V puts it at the cursor. Null = no points (devices). */
export function clipCentre(clip: Clip): Pt | null {
	const pts: Pt[] = []
	for (const e of clip.items) {
		if ((e.type === 'outlet' || e.type === 'rack') && e.at) pts.push(e.at)
		if (e.type !== 'shape') continue
		const g = e.geom
		switch (g.kind) {
			case 'path': pts.push(...g.nodes); break
			case 'polygon': case 'leader': case 'cloud': pts.push(...g.pts); break
			case 'dimension': pts.push(g.a, g.b); break
			case 'text': case 'insert': case 'legend': pts.push(g.at); break
			case 'circle': case 'arc': pts.push({ x: g.centre.x - g.r, y: g.centre.y - g.r }, { x: g.centre.x + g.r, y: g.centre.y + g.r }); break
			default: pts.push(...(outlineOf(g) ?? []))
		}
	}
	if (!pts.length) return null
	const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y)
	return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 }
}

export interface PasteTarget {
	pid: string
	ix: ProjectIndex
	/** A plan pastes plan items; a sheet pastes notes; a rack (in a rack view) pastes devices. */
	to: { kind: 'level' | 'sheet' | 'rack'; id: Id }
	/** Moved by this much (Ctrl-drag copy); a paste is in place. */
	d?: { x: number; y: number; z?: number }
}

/** `problem` = why nothing was pasted (devices that don't fit the rack). */
export interface Pasted { put: Entity[]; select: Id[]; skipped: number; problem?: string }

/** What a paste writes (new records only) and selects. */
export function pasteClip(clip: Clip, t: PasteTarget): Pasted {
	const { ix, to } = t, toLevel = to.kind === 'level'
	if (to.kind === 'rack') return pasteDevices(clip, ix, to.id)
	const racks = new Set(clip.items.filter((e) => e.type === 'rack').map((e) => e.id))
	const fits = (e: Entity) => (toLevel ? e.type === 'outlet' || e.type === 'rack' || (e.type === 'device' && racks.has(e.rackId)) || (e.type === 'shape' && !!e.levelId) : e.type === 'shape' && !!e.sheetId)
	const kept = clip.items.filter(fits)
	const skipped = clip.items.length - kept.length
	if (!kept.length) return { put: [], select: [], skipped }

	// new ids; every reference to a copied item (a device's rack, a run attached to a copied outlet) follows
	const ids = new Map(kept.map((e) => [e.id, newId()]))
	const re = new RegExp(`"(${[...ids.keys()].map((s) => s.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&')).join('|')})"`, 'g')
	let items = JSON.parse(JSON.stringify(kept).replace(re, (_, id: string) => `"${ids.get(id)}"`)) as Entity[]

	const d = t.d ?? { x: 0, y: 0 }, dz = d.z ?? 0
	const move = (p: Pt) => ({ x: p.x + d.x, y: p.y + d.y })

	// layers: same id here → keep; same name → that one; else the copied record comes too
	const layerIds = new Map<Id, Id>(), extra: Layer[] = []
	let order = Math.max(0, ...ix.layers.map((l) => l.order))
	for (const l of clip.layers) {
		const here = ix.get(l.id)?.type === 'layer' ? l.id : ix.layers.find((x) => x.name === l.name)?.id
		if (here) layerIds.set(l.id, here)
		else { order += 10; extra.push({ ...l, order }); layerIds.set(l.id, l.id) }
	}

	const onLevel = (id: Id | undefined) => !!id && (ix.get(id) as { levelId?: Id } | undefined)?.levelId === to.id
	const copied = new Set(ids.values())
	const ok = (id: Id | undefined) => !!id && (copied.has(id) || onLevel(id))
	const rooms = new Map<Id, Id>(), made: Space[] = []
	const roomFor = (old: Id): Id => {
		if (onLevel(old)) return old
		if (!rooms.has(old)) {
			const name = (ix.get(old) as Space | undefined)?.name ?? 'Server room'
			let room = ix.spaces.find((s) => s.levelId === to.id && s.kind === 'server room' && s.name === name) ?? made.find((s) => s.name === name)
			if (!room) { room = { ...newServerRoom(ix, to.id, name), code: String.fromCharCode(65 + ix.spaces.filter((s) => s.levelId === to.id && s.kind === 'server room').length + made.length), order: ix.spaces.filter((s) => s.levelId === to.id).length + made.length + 1 }; made.push(room) }
			rooms.set(old, room.id)
		}
		return rooms.get(old)!
	}
	const layer = (e: Entity) => { const l = (e as { layerId?: Id }).layerId; return l && layerIds.has(l) ? { layerId: layerIds.get(l) } : {} }
	const sourceLevel = clip.from.kind === 'level' ? clip.from.id : undefined

	items = items.map((e): Entity => {
		if (e.type === 'outlet') {
			const { zoneId, roomId, hostShapeId, ...rest } = e
			return {
				...rest, levelId: to.id, ...layer(e), ...(e.at ? { at: move(e.at) } : {}), ...(dz ? { z: (e.z ?? 0) + dz } : {}),
				...(ok(zoneId) ? { zoneId } : {}), ...(ok(roomId) ? { roomId } : {}), ...(hostShapeId && copied.has(hostShapeId) ? { hostShapeId } : {}),
				ports: e.ports.map((p) => { const { serverRoomId, ...q } = p; return { ...q, ...(ok(serverRoomId) ? { serverRoomId } : {}) } }),
			}
		}
		if (e.type === 'rack') {
			const r = e as Rack, spaceId = roomFor(r.spaceId)
			const { rowId, ...rest } = r
			return { ...rest, levelId: to.id, spaceId, ...layer(r), ...(ok(rowId) && spaceId === r.spaceId ? { rowId } : {}),
				order: ix.racks.filter((x) => x.spaceId === spaceId).length + r.order, ...(r.at ? { at: move(r.at) } : {}) }
		}
		if (e.type === 'device') {
			const dv = e as Device
			if (!dv.panel?.serverRoomId || ok(dv.panel.serverRoomId)) return dv
			const { serverRoomId, ...panel } = dv.panel, room = rooms.get(serverRoomId)
			return { ...dv, panel: { ...panel, ...(room ? { serverRoomId: room } : {}) } }
		}
		const s = e as Shape
		let geom = moveGeometry(s.geom, d)
		if (geom.kind === 'path') geom = { ...geom, nodes: geom.nodes.map((n) => {
			const { attach, levelId, ...m } = n
			return { ...m, ...(ok(attach) ? { attach } : {}), ...(levelId && levelId !== sourceLevel ? { levelId } : {}) }
		}) }
		if (geom.kind === 'leader' && geom.attach && !ok(geom.attach)) { const { attach: _, ...g } = geom; geom = g }
		const role = s.role?.kind === 'containment' && s.role.serves ? { role: { ...s.role, serves: s.role.serves.filter(onLevel) } } : {}
		const owner = toLevel ? { levelId: to.id } : { sheetId: to.id }
		const { levelId: _l, sheetId: _s, layerId: _y, ...rest } = s
		const plane = dz && s.plane?.kind === 'plan' ? { plane: { ...s.plane, z: s.plane.z + dz } } : {}
		return { ...rest, ...owner, geom, ...role, ...plane, ...layer(s) } as Shape
	})
	// copies of a group's shapes make a NEW group (they don't join the original's)
	const groups = new Map<Id, Id>()
	items = items.map((e) => {
		if (e.type !== 'shape' || !e.groupId) return e
		if (!groups.has(e.groupId)) groups.set(e.groupId, newId())
		return { ...e, groupId: groups.get(e.groupId)! }
	})
	const newGroups = [...groups.values()].map((id): Group => ({ type: 'group', id }))
	const select = items.filter((e) => e.type !== 'device').map((e) => e.id)
	return { put: [...extra, ...made, ...newGroups, ...items], select, skipped }
}

/** Devices into a rack, each at its own U (as-is); refused if any would overlap or not fit. A copied rack's devices
 *  come too (its contents into this rack). Links / cords never come. */
function pasteDevices(clip: Clip, ix: ProjectIndex, rackId: Id): Pasted {
	const rack = ix.get<Rack>(rackId)
	const devs = clip.items.filter((e): e is Device => e.type === 'device')
	const skipped = clip.items.length - devs.length
	if (!rack || !devs.length) return { put: [], select: [], skipped }
	const put = devs.map((dv): Device => {
		const { panel, ...rest } = dv
		const room = panel?.serverRoomId === undefined || ix.get(panel.serverRoomId) ? panel : { ...panel, serverRoomId: rack.spaceId }
		return { ...rest, id: newId(), rackId, ...(room ? { panel: room } : {}) }
	})
	const others = ix.devices.filter((x) => x.rackId === rackId)
	const problem = put.map((n) => placementProblem(n, rack, [...others, ...put.filter((p) => p.id !== n.id)])).find(Boolean)
	return problem ? { put: [], select: [], skipped, problem } : { put, select: put.map((n) => n.id), skipped }
}
