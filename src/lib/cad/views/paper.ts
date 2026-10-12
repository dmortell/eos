// The PAPER views (space.ts isPaperSpec): drawn in paper mm at 1:1 with no model behind them — a port map, a port
// grid, a patch schedule, a fill section. One switch for a pane and a sheet's viewport alike.
import type { ProjectIndex } from '../domain/project'
import type { Id } from '../domain/types'
import type { ViewSpec } from '../domain/drawing'
import type { Prim } from './display'
import type { Route } from '../domain/routing'
import { routeLinks } from '../domain/routing'
import { fillBySegment, type SegFill } from '../domain/fill'
import { portMapDisplayList } from './portMap'
import { portGridDisplayList } from './panelSheets'
import { patchScheduleDisplayList } from './schedule'
import { fillSectionDisplayList } from './fillSection'

/** The paper left round a paper view inside its viewport's window (mm). */
export const PAPER_PAD = 4

export type PaperSpec = Extract<ViewSpec, { kind: 'portmap' | 'ports' | 'schedule' | 'fill' }>

export interface PaperOpts {
	/** The project's fills (else worked out from `routes`, else routed here). */
	fills?: Map<string, SegFill>
	routes?: Map<Id, Route>
	/** The height (mm) a schedule may take: its viewport's window less the padding; none = every row. */
	fit?: number
}

export function paperDisplayList(ix: ProjectIndex, spec: PaperSpec, o: PaperOpts = {}): Prim[] {
	switch (spec.kind) {
		case 'portmap': return portMapDisplayList(ix, spec.deviceIds)
		case 'ports': return portGridDisplayList(ix, spec.rackId, spec.deviceId)
		case 'schedule': return patchScheduleDisplayList(ix, spec.spaceId, spec.start, { fit: o.fit })
		case 'fill': return fillSectionDisplayList(ix, spec.shapeId, spec.segId, o.fills ?? fillBySegment(ix, o.routes ?? routeLinks(ix)))
	}
}
