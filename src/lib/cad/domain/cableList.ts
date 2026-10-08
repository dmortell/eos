// Lists of the PERMANENT cables (Dave, 2026-10-05): the backbone / tie cables grouped panel ↔ panel for the sidebar's
// "Cables (n)" (backlog "Backbone cable list"), and one row per link for the Links table (backlog "Links table").
// Pure.
import type { Id, Link, Device, Rack, Level, ProjectSettings } from './types'
import type { ProjectIndex } from './project'
import { naturalCompare } from './labels'
import { cableKey, coreLabels, coresOf } from './multicore'

/** A cable type's jacket colour, by the usual conventions (singlemode yellow, OM3 / OM4 aqua, OM5 lime, OM1 / OM2
 *  orange); copper and anything else grey-blue. */
export function cableColour(type = ''): string {
	const t = type.toUpperCase()
	if (/OS1|OS2|SM|SINGLE/.test(t)) return '#facc15'
	if (/OM5/.test(t)) return '#84cc16'
	if (/OM3|OM4/.test(t)) return '#22d3ee'
	if (/OM1|OM2|MM|MULTI/.test(t)) return '#f97316'
	return '#64748b'
}

export interface CableGroup {
	key: string
	kind: 'backbone' | 'tie'
	type: string
	colour: string
	links: Id[]
	/** Cables: a multi-core cable once (its cores are `links`). */
	cables: number
	/** "4F IDF2 R311 · PP01" — the panel ends, in level order. */
	a: string
	b: string
	/** "1F → 4F (2 transit)", or "1F" for a tie / a backbone within a floor. */
	floors: string
}

/** The backbone and tie cables, one group per panel pair and cable type, lowest level first. */
export function cableGroups(ix: ProjectIndex): CableGroup[] {
	const levels = [...ix.levels].sort((x, y) => x.order - y.order)
	const at = (on: Id) => {
		const d = ix.get<Device>(on), r = d?.type === 'device' ? ix.get<Rack>(d.rackId) : undefined, lv = r ? ix.get<Level>(r.levelId) : undefined
		return d?.type === 'device' && r ? { d, r, lv, i: lv ? levels.indexOf(lv) : -1 } : null
	}
	const groups = new Map<string, CableGroup & { lo: number; keys: Set<Id> }>()
	for (const l of ix.links) {
		if (l.kind === 'horizontal') continue
		let A = at(l.a.on), B = at(l.b.on)
		if (!A || !B) continue
		if (A.i > B.i || (A.i === B.i && naturalCompare(`${A.r.name}${A.d.name}`, `${B.r.name}${B.d.name}`) > 0)) [A, B] = [B, A]
		const type = l.cableType ?? '', key = `${A.d.id}|${B.d.id}|${type}`
		let g = groups.get(key)
		if (!g) {
			const transit = Math.max(0, B.i - A.i - 1), fa = A.lv?.name ?? '?', fb = B.lv?.name ?? '?'
			const end = (x: NonNullable<typeof A>) => `${x.lv?.name ?? ''} ${ix.nameOf(x.r.spaceId)} ${x.r.name} · ${x.d.name}`.trim()
			g = { key, kind: l.kind, type, colour: cableColour(type), links: [], cables: 0, keys: new Set(), a: end(A), b: end(B), lo: A.i,
				floors: fa === fb ? fa : `${fa} → ${fb}${transit ? ` (${transit} transit)` : ''}` }
			groups.set(key, g)
		}
		g.links.push(l.id)
		g.keys.add(cableKey(l))
		g.cables = g.keys.size
	}
	return [...groups.values()].sort((x, y) => x.lo - y.lo || naturalCompare(x.a, y.a) || naturalCompare(x.b, y.b)).map(({ lo: _lo, keys: _k, ...g }) => g)
}

export interface LinkRow {
	id: Id
	kind: 'run' | 'tie' | 'backbone'
	a: string
	b: string
	/** The port label it carries (the outlet's, or a tie's). */
	label: string
	cableType: string
	status: Link['status']
	lengthM?: number
	/** A core of a multi-core cable: "core 3 of 24". */
	core?: string
}

/** Every permanent link as a table row: a horizontal one shows as a "run" (panel → outlet). Panel end first. */
export function linkRows(ix: ProjectIndex, lengthOf: (id: Id) => number | undefined = () => undefined): LinkRow[] {
	const st = ix.get<ProjectSettings>('settings'), cores = coreLabels(ix.links, (t) => coresOf(st?.type === 'settings' ? st : undefined, t))
	return ix.links.map((l) => ({
		id: l.id, kind: l.kind === 'horizontal' ? 'run' : l.kind,
		a: ix.portPlace(l.a), b: ix.portPlace(l.b), label: ix.portLabel(l.b) || ix.portLabel(l.a),
		cableType: l.cableType ?? '', status: l.status, lengthM: l.lengthM ?? lengthOf(l.id),
		...(cores.has(l.id) ? { core: cores.get(l.id) } : {}),
	} satisfies LinkRow)).sort((x, y) => naturalCompare(x.a, y.a))
}
