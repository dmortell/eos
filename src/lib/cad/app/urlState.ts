// What the cad page shows, in its URL, so a refresh (or a shared link) opens the same place (Dave): the level, each
// pane's view and the active pane. `?level=<id>&v=plan,front&a=1` — views: plan | front | rear | left | right |
// row.<spaceId>.<face>[.<rowId>] | sheet.<sheetId>. Cameras (pan / zoom) stay per session.
import type { ViewSpec } from '../views/space'
import type { ElevDir } from '../domain/conventions'

const DIRS = new Set(['front', 'rear', 'left', 'right'])

export function encodeSpec(s: ViewSpec): string {
	switch (s.kind) {
		case 'plan': return 'plan'
		case 'elevation': return s.dir
		case 'row': return ['row', s.spaceId, s.face, ...(s.rowId ? [s.rowId] : [])].join('.')
		case 'sheet': return `sheet.${s.sheetId}`
		case 'riser': return 'riser'
	}
}

export function decodeSpec(t: string): ViewSpec | null {
	if (t === 'plan') return { kind: 'plan' }
	if (t === 'riser') return { kind: 'riser' }
	if (DIRS.has(t)) return { kind: 'elevation', dir: t as ElevDir }
	const [k, a, b, c] = t.split('.')
	if (k === 'row' && a && (b === 'front' || b === 'rear')) return { kind: 'row', spaceId: a, face: b, ...(c ? { rowId: c } : {}) }
	if (k === 'sheet' && a) return { kind: 'sheet', sheetId: a }
	return null
}

export interface ViewState { levelId: string | null; panes: ViewSpec[]; active: number }

export function readViewState(params: URLSearchParams): Partial<ViewState> {
	const panes = (params.get('v') ?? '').split(',').map(decodeSpec).filter((s): s is ViewSpec => !!s).slice(0, 2)
	const active = Number(params.get('a') ?? 0)
	return {
		...(params.get('level') ? { levelId: params.get('level') } : {}),
		...(panes.length ? { panes, active: active >= 0 && active < panes.length ? active : 0 } : {}),
	}
}

/** The URL's search params with the view state written in (other params kept). */
export function writeViewState(params: URLSearchParams, s: ViewState): URLSearchParams {
	const out = new URLSearchParams(params)
	if (s.levelId) out.set('level', s.levelId); else out.delete('level')
	out.set('v', s.panes.map(encodeSpec).join(','))
	if (s.active) out.set('a', String(s.active)); else out.delete('a')
	return out
}
