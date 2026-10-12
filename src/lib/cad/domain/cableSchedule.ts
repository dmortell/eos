// The CABLE SCHEDULE (backlog "Cable schedule Excel", Dave: on screen first, like the BOM): one row per permanent cable
// (a link, or a multi-core cable's cores together) —
// from (the panel end), to (the outlet port, or the other panel), its label, cable type, the route's length, the
// slack added at the outlet, the installed length, and the 90 m permanent-link flag. Pure; tested.
import type { Id, ProjectSettings } from './types'
import { cablesOf, coresOf } from './multicore'
import { portRanges } from './ports'
import type { ProjectIndex } from './project'
import { MAX_PERMANENT_LINK_M, type Route, type CableSettings } from './routing'
import { naturalCompare } from './labels'
import type { Estimate } from './estimates'

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
	/** An ESTIMATED cable: an outlet port with no link yet (domain/estimates.ts). */
	estimated?: boolean
}

export function cableSchedule(ix: ProjectIndex, routes: Map<Id, Route>, cable: CableSettings, estimates: readonly Estimate[] = []): CableRow[] {
	const KIND = { horizontal: 0, tie: 1, backbone: 2 }
	// a multi-core cable is ONE row: its ports as ranges, its cores counted (domain/multicore.ts)
	const real = cablesOf(ix.links).map((cores): CableRow => {
		const l = cores[0], horizontal = l.kind === 'horizontal'
		const r = cores.map((c) => routes.get(c.id)).find((x) => x && !x.problem) ?? routes.get(l.id)
		// a cable's cores can end on two panels: each panel named with its own ports
		const place = (end: 'a' | 'b') => {
			if (cores.length === 1) return ix.portPlace(l[end])
			const by = new Map<Id, typeof cores>()
			for (const c of cores) by.set(c[end].on, [...(by.get(c[end].on) ?? []), c])
			return [...by.values()].map((g) => ix.portPlace(g[0][end]).replace(/ : \d+/, ` : ${portRanges(g.map((c) => c[end].port))}`)).join(', ')
		}
		const n = Math.max(coresOf(ix.get<ProjectSettings>('settings'), l.cableType), cores.length)
		return {
			linkId: l.id, kind: l.kind, label: ix.portLabel(horizontal ? l.b : l.a) || ix.portLabel(l.b) || '',
			from: place('a'), to: place('b'), type: `${l.cableType ?? 'cable'}${l.cable ? ` (${cores.length} of ${n} cores)` : ''}`,
			...(r?.routeMm != null ? { routeM: Math.round(r.routeMm / 100) / 10 } : {}),
			slackM: horizontal ? cable.slackM : 0,
			...(r?.lengthM != null ? { lengthM: r.lengthM } : {}),
			over90: !!r?.over90, handSet: !!r?.handSet,
			...(r?.problem ? { problem: r.problem } : {}),
		}
	// by label (Dave 2026-10-11), unlabelled last; then the kind and the panel end
	}).sort((a, b) => +!a.label - +!b.label || naturalCompare(a.label, b.label) || KIND[a.kind] - KIND[b.kind] || naturalCompare(a.from, b.from))
	// the estimated cables after the real ones, by label: from = its room, to = the outlet port
	const est = estimates.map((e): CableRow => {
		const ref = { on: e.outletId, port: e.port }
		return {
			linkId: `est:${e.outletId}:${e.port}`, kind: 'horizontal', estimated: true, label: ix.portLabel(ref) || '',
			from: e.roomId ? ix.nameOf(e.roomId) || 'server room' : '', to: ix.portPlace(ref), type: e.cableType || 'cable',
			...(e.routeMm != null ? { routeM: Math.round(e.routeMm / 100) / 10 } : {}), slackM: cable.slackM,
			...(e.lengthM != null ? { lengthM: e.lengthM } : {}), over90: e.lengthM != null && e.lengthM > MAX_PERMANENT_LINK_M, handSet: false,
			...(e.problem ? { problem: e.problem } : {}),
		}
	}).sort((a, b) => +!a.label - +!b.label || naturalCompare(a.label, b.label) || naturalCompare(a.to, b.to))
	return [...real, ...est]
}

/** The schedule's totals (real cables; estimated ones are counted by estimatedTotals): links, installed metres (routed only), how many have no route / are over 90 m. */
export function scheduleTotals(rows: CableRow[]): { links: number; metres: number; unrouted: number; over90: number } {
	rows = rows.filter((r) => !r.estimated)
	return { links: rows.length, metres: rows.reduce((m, r) => m + (r.lengthM ?? 0), 0), unrouted: rows.filter((r) => r.lengthM == null).length, over90: rows.filter((r) => r.over90).length }
}

/** The ESTIMATED rows' totals, apart from the real cables': how many, their metres (routed only), how many have no route. */
export function estimatedTotals(rows: CableRow[]): { cables: number; metres: number; unrouted: number } {
	rows = rows.filter((r) => r.estimated)
	return { cables: rows.length, metres: rows.reduce((m, r) => m + (r.lengthM ?? 0), 0), unrouted: rows.filter((r) => r.lengthM == null).length }
}
