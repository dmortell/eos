// What the cad page shows, in its URL, so a refresh (or a shared link) opens the same place (User): the active pane's
// level, each pane's view, the active pane and — split on two levels — each pane's level.
// `?level=<id>&v=plan,front&a=1[&levels=<id0>,<id1>]` — views: plan | front | rear | left | right | riser[.compact][.b~<buildingId>] |
// row.<spaceId>.<face>[.<rowId>] | sheet.<sheetId> | portmap.<deviceId>~<deviceId>… | ports.<rackId>[.<deviceId>] |
// schedule.patch.<spaceId|all>[.<start>] | fill.<shapeId>.<segId>. Cameras (pan / zoom) stay per session.
import type { ViewSpec } from '../views/space'
import type { ElevDir } from '../domain/conventions'

const DIRS = new Set(['front', 'rear', 'left', 'right'])

export function encodeSpec(s: ViewSpec): string {
	switch (s.kind) {
		case 'plan': return 'plan'
		case 'elevation': return s.dir
		case 'row': return ['row', s.spaceId, s.face, ...(s.rowId ? [s.rowId] : [])].join('.')
		case 'sheet': return `sheet.${s.sheetId}`
		case 'riser': return ['riser', ...(s.hideEmpty ? ['compact'] : []), ...(s.buildingId ? [`b~${s.buildingId}`] : [])].join('.')
		case 'section': return `section.${s.sectionId}`
		case 'portmap': return `portmap.${s.deviceIds.join('~')}`
		case 'ports': return ['ports', s.rackId, ...(s.deviceId ? [s.deviceId] : [])].join('.')
		case 'schedule': return ['schedule', s.table, s.spaceId ?? 'all', ...(s.start && s.start > 1 ? [s.start] : [])].join('.')
		case 'fill': return `fill.${s.shapeId}.${s.segId}`
	}
}

export function decodeSpec(t: string): ViewSpec | null {
	if (t === 'plan') return { kind: 'plan' }
	if (DIRS.has(t)) return { kind: 'elevation', dir: t as ElevDir }
	const [k, a, b, c] = t.split('.')
	// riser[.compact][.b~<buildingId>] (an id may hold a '.': nanoid's alphabet doesn't, but keep the rest whole)
	if (k === 'riser') {
		const rest = t.split('.').slice(1), compact = rest[0] === 'compact', bld = rest.slice(compact ? 1 : 0).join('.')
		return { kind: 'riser', ...(compact ? { hideEmpty: true } : {}), ...(bld.startsWith('b~') && bld.length > 2 ? { buildingId: bld.slice(2) } : {}) }
	}
	if (k === 'row' && a && (b === 'front' || b === 'rear')) return { kind: 'row', spaceId: a, face: b, ...(c ? { rowId: c } : {}) }
	if (k === 'sheet' && a) return { kind: 'sheet', sheetId: a }
	if (k === 'section' && a) return { kind: 'section', sectionId: a }
	if (k === 'portmap' && a) return { kind: 'portmap', deviceIds: a.split('~') }
	if (k === 'ports' && a) return { kind: 'ports', rackId: a, ...(b ? { deviceId: b } : {}) }
	if (k === 'schedule' && a === 'patch' && b) return { kind: 'schedule', table: 'patch', ...(b === 'all' ? {} : { spaceId: b }), ...(Number(c) > 1 ? { start: Number(c) } : {}) }
	if (k === 'fill' && a && b) return { kind: 'fill', shapeId: a, segId: b }
	return null
}

/** `levelId` = the active pane's level; `paneLevels` = each pane's (written only when two panes show two levels). */
export interface ViewState { levelId: string | null; panes: ViewSpec[]; active: number; paneLevels?: (string | null)[] }

export function readViewState(params: URLSearchParams): Partial<ViewState> {
	const panes = (params.get('v') ?? '').split(',').map(decodeSpec).filter((s): s is ViewSpec => !!s).slice(0, 2)
	const active = Number(params.get('a') ?? 0)
	const levels = (params.get('levels') ?? '').split(',').map((l) => l || null)
	return {
		...(params.get('level') ? { levelId: params.get('level') } : {}),
		...(panes.length ? { panes, active: active >= 0 && active < panes.length ? active : 0 } : {}),
		...(panes.length === 2 && levels.length === 2 && levels.some((l) => l) ? { paneLevels: levels } : {}),
	}
}

/** The URL's search params with the view state written in (other params kept). */
export function writeViewState(params: URLSearchParams, s: ViewState): URLSearchParams {
	const out = new URLSearchParams(params)
	if (s.levelId) out.set('level', s.levelId); else out.delete('level')
	out.set('v', s.panes.map(encodeSpec).join(','))
	if (s.active) out.set('a', String(s.active)); else out.delete('a')
	const lv = s.paneLevels
	if (s.panes.length === 2 && lv && (lv[0] ?? null) !== (lv[1] ?? null)) out.set('levels', [lv[0] ?? '', lv[1] ?? ''].join(','))
	else out.delete('levels')
	return out
}

/** Each pane's level on load: its own from `levels`, else the one `level` (a link from before panes had their own). */
export const paneLevelsOf = (s: Partial<ViewState>): (string | null)[] => [0, 1].map((k) => s.paneLevels?.[k] ?? s.levelId ?? null)
