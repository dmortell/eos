// What a backup holds (ADR 0008 §2): the whole project, or a set of MODELS (levels — Tourney's 33F is two of them,
// "33F 3303" and "33F 3307"). A model holds the level, what stands on it (spaces, outlets, underlays, plan shapes,
// sections, racks with their rows, devices and cords) and the links / cords with an end on it. A link with only one
// end inside CROSSES the edge: it is kept with the backup, marked with the end that is outside.
import type { Entity } from './drawing'
import type { Id, Level, Building } from './types'

export type Parts = 'all' | Id[]

export interface PartsContent {
	/** Every entity the parts hold. */
	inside: Set<Id>
	/** Links and cords with one end inside → the end that is OUTSIDE. Also in `inside`. */
	crossing: Map<Id, 'a' | 'b'>
}

/** The entities `parts` hold out of `entities` (a live project or a backup's list). */
export function inParts(entities: Iterable<Entity>, parts: Parts): PartsContent {
	const all = [...entities]
	if (parts === 'all') return { inside: new Set(all.map((e) => e.id)), crossing: new Map() }
	const levels = new Set(parts), inside = new Set<Id>()
	const on = (levelId: Id | undefined) => !!levelId && levels.has(levelId)
	for (const e of all) {
		if (e.type === 'level' ? levels.has(e.id)
			: e.type === 'space' || e.type === 'outlet' || e.type === 'underlay' || e.type === 'section' || e.type === 'rack' ? on(e.levelId)
			: e.type === 'shape' ? on(e.levelId) : false) inside.add(e.id)
	}
	// what hangs off those: rows in its rooms, devices in its racks, the groups its shapes are in
	const groups = new Map(all.filter((e) => e.type === 'group').map((g) => [g.id, g]))
	for (const e of all) {
		if (e.type === 'rackRow' && inside.has(e.spaceId)) inside.add(e.id)
		else if (e.type === 'device' && inside.has(e.rackId)) inside.add(e.id)
		else if (e.type === 'shape' && inside.has(e.id) && e.groupId) {
			for (let g = groups.get(e.groupId); g && !inside.has(g.id); g = g.parentId ? groups.get(g.parentId) : undefined) inside.add(g.id)
		}
	}
	const crossing = new Map<Id, 'a' | 'b'>()
	for (const e of all) {
		if (e.type !== 'link' && e.type !== 'cord') continue
		const a = inside.has(e.a.on), b = inside.has(e.b.on)
		if (a || b) inside.add(e.id)
		if (a !== b) crossing.set(e.id, a ? 'b' : 'a')
	}
	return { inside, crossing }
}

export interface Floor {
	/** `buildingId:number`. */
	key: string
	name: string
	/** The floor's main plan first, then its area plans. */
	models: { id: Id; name: string }[]
}

/** The parts picker's tree: floors (top first, building by building) with their models. */
export function floorsOf(entities: Iterable<Entity>): Floor[] {
	const all = [...entities]
	const levels = all.filter((e): e is Level => e.type === 'level')
	const buildings = new Map(all.filter((e): e is Building => e.type === 'building').map((b) => [b.id, b]))
	const many = new Set(levels.map((l) => l.buildingId)).size > 1
	const byKey = new Map<string, Level[]>()
	for (const l of levels) {
		const k = `${l.buildingId}:${l.number}`
		byKey.set(k, [...(byKey.get(k) ?? []), l])
	}
	const floors = [...byKey].map(([key, ls]) => {
		ls.sort((a, b) => Number(!!a.area) - Number(!!b.area) || a.order - b.order)
		const main = ls.find((l) => !l.area), first = ls[0]
		const name = main?.name ?? (first.area && first.name.endsWith(` ${first.area}`) ? first.name.slice(0, -first.area.length - 1) : first.name)
		const b = buildings.get(first.buildingId)
		return { key, name: many && b ? `${b.name} ${name}` : name, models: ls.map((l) => ({ id: l.id, name: l.name })), order: [b?.order ?? 0, -first.number] }
	})
	floors.sort((a, b) => a.order[0] - b.order[0] || a.order[1] - b.order[1])
	return floors.map(({ order: _, ...f }) => f)
}

/** "33F 3303 + 32F" — a whole floor reads as the floor, otherwise its chosen models; 'all' reads "Whole project". */
export function partsLabel(entities: Iterable<Entity>, parts: Parts): string {
	if (parts === 'all') return 'Whole project'
	const chosen = new Set(parts), out: string[] = []
	for (const f of floorsOf(entities)) {
		const picked = f.models.filter((m) => chosen.has(m.id))
		if (!picked.length) continue
		if (picked.length === f.models.length) out.push(f.name)
		else out.push(...picked.map((m) => m.name))
	}
	return out.join(' + ') || 'Nothing'
}
