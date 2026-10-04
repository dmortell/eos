// The CABLE SCHEDULE (backlog "Cable schedule Excel", Dave: on screen first, like the BOM): one row per permanent link —
// from (the panel end), to (the outlet port, or the other panel), its label, cable type, the route's length, the
// slack added at the outlet, the installed length, and the 90 m permanent-link flag. Pure; tested.
import type { Id } from './types'
import type { ProjectIndex } from './project'
import type { Route, CableSettings } from './routing'
import { naturalCompare } from './labels'

export interface CableRow {
	linkId: Id
	kind: 'horizontal' | 'tie' | 'backbone'
	label: string
	from: string
	to: string
	type: string
	/** The route itself, m (one decimal); absent = no route. */
	routeM?: number
	/** Added at the outlet (horizontal links), m. */
	slackM: number
	/** Installed length, m (route + slack, rounded up; or set by hand). */
	lengthM?: number
	over90: boolean
	handSet: boolean
	/** Why there is no route. */
	problem?: string
}

export function cableSchedule(ix: ProjectIndex, routes: Map<Id, Route>, cable: CableSettings): CableRow[] {
	const KIND = { horizontal: 0, tie: 1, backbone: 2 }
	return ix.links.map((l): CableRow => {
		const r = routes.get(l.id), horizontal = l.kind === 'horizontal'
		return {
			linkId: l.id, kind: l.kind, label: ix.portLabel(horizontal ? l.b : l.a) || ix.portLabel(l.b) || '',
			from: ix.portPlace(l.a), to: ix.portPlace(l.b), type: l.cableType ?? 'cable',
			...(r?.routeMm != null ? { routeM: Math.round(r.routeMm / 100) / 10 } : {}),
			slackM: horizontal ? cable.slackM : 0,
			...(r?.lengthM != null ? { lengthM: r.lengthM } : {}),
			over90: !!r?.over90, handSet: !!r?.handSet,
			...(r?.problem ? { problem: r.problem } : {}),
		}
	}).sort((a, b) => KIND[a.kind] - KIND[b.kind] || naturalCompare(a.from, b.from) || naturalCompare(a.label, b.label))
}

/** The schedule's totals: links, installed metres (routed only), how many have no route / are over 90 m. */
export function scheduleTotals(rows: CableRow[]): { links: number; metres: number; unrouted: number; over90: number } {
	return { links: rows.length, metres: rows.reduce((m, r) => m + (r.lengthM ?? 0), 0), unrouted: rows.filter((r) => r.lengthM == null).length, over90: rows.filter((r) => r.over90).length }
}
