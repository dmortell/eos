// The PAPER views (space.ts isPaperSpec): drawn in paper mm at 1:1 with no model behind them — a port map, a port
// grid, a patch schedule, a fill section. One switch for a pane and a sheet's viewport alike.
import type { ProjectIndex } from '../domain/project'
import type { Id } from '../domain/types'
import type { ViewSpec } from '../domain/drawing'
import type { Prim } from './display'
import type { Route } from '../domain/routing'
import { routeAll } from '../domain/estimates'
import { fillBySegment, type SegFill } from '../domain/fill'
import { portMapDisplayList } from './portMap'
import { portGridDisplayList } from './panelSheets'
import { patchScheduleDisplayList } from './schedule'
import { fillSectionDisplayList } from './fillSection'

/** The paper left round a paper view inside its viewport's window (mm). */
export const PAPER_PAD = 4

export type PaperSpec = Extract<ViewSpec, { kind: 'portmap' | 'ports' | 'schedule' | 'fill' }>

export interface PaperOpts {
	/** The project's fills (else worked out from `routes`, else routed here — estimated cables included). */
	fills?: Map<string, SegFill>
	routes?: Map<Id, Route>
	/** The height (mm) a schedule may take: its viewport's window less the padding; none = every row. */
	fit?: number
	/** The first cord a schedule shows, when it isn't the spec's own `start` (a viewport continued from another). */
	start?: number
}

export function paperDisplayList(ix: ProjectIndex, spec: PaperSpec, o: PaperOpts = {}): Prim[] {
	switch (spec.kind) {
		case 'portmap': return portMapDisplayList(ix, spec.deviceIds)
		case 'ports': return portGridDisplayList(ix, spec.rackId, spec.deviceId)
		case 'schedule': return patchScheduleDisplayList(ix, spec.spaceId, o.start ?? spec.start, { fit: o.fit })
		case 'fill': return fillSectionDisplayList(ix, spec.shapeId, spec.segId, o.fills ?? fillsHere(ix, o.routes))
	}
}

/** Fills without the project's: from the routes given, else from a routing pass here (links and estimates). */
function fillsHere(ix: ProjectIndex, routes: Map<Id, Route> | undefined): Map<string, SegFill> {
	if (routes) return fillBySegment(ix, routes)
	const r = routeAll(ix)
	return fillBySegment(ix, r.routes, undefined, r.estimates)
}
