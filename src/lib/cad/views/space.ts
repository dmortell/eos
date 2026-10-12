// A view's 2D drawing space and its link to the model (ADR 0004 / 0006). Tools work in view coordinates and ask the
// space for model points, so the SAME tool draws in a plan or an elevation:
//  - plan:      view (x, y) = plan (x, y); clicks land at the work Z.
//  - elevation: view x = u along the frame, view y = −z (y down on screen, z up in the model); clicks land on the
//               work plane at the work depth (conventions.unproject).
import type { Pt, Pt3 } from '../domain/types'
import type { ViewSpec } from '../domain/drawing'
import { namedFrame, project, unproject, type ElevFrame } from '../domain/conventions'

export type { ViewSpec }

/** Where clicks land: the plan's work Z, an elevation's work depth (along the frame's n, from its origin). */
export interface WorkPlane { z: number; depth: number }

export interface ViewSpace {
	readonly spec: ViewSpec
	readonly frame?: ElevFrame
	/** A view point on the work plane → a model point. */
	toWorld(p: Pt, work: WorkPlane): Pt3
	/** A drag in view mm → a model displacement (plan: x / y; elevation: along u and up / down). */
	deltaToWorld(d: Pt): Pt3
	/** A model point → its view point. */
	fromWorld(p: Pt3): Pt
	/** How near the viewer a model point is (elevations; 0 in plan). */
	depthOf(p: Pt3): number
}

export const PLAN: ViewSpec = { kind: 'plan' }
export function specKey(s: ViewSpec): string {
	switch (s.kind) {
		case 'plan': return 'plan'
		case 'riser': return 'riser'
		case 'portmap': return `portmap:${s.deviceIds.join('~')}`
		case 'ports': return `ports:${s.rackId}:${s.deviceId ?? ''}`
		case 'schedule': return `schedule:${s.table}:${s.spaceId ?? ''}:${s.start ?? 1}`
		case 'fill': return `fill:${s.shapeId}:${s.segId}`
		case 'section': return `section:${s.sectionId}`
		case 'row': return `row:${s.spaceId}:${s.rowId ?? ''}:${s.face}`
		case 'sheet': return `sheet:${s.sheetId}`
		case 'elevation': return s.dir
	}
}
export function specLabel(s: ViewSpec): string {
	switch (s.kind) {
		case 'plan': return 'Plan'
		case 'riser': return 'Riser'
		case 'portmap': return 'Port map'
		case 'ports': return 'Port grid'
		case 'schedule': return 'Patch schedule'
		case 'fill': return 'Fill section'
		case 'section': return 'Section'
		case 'row': return `Racks ${s.face}`
		case 'sheet': return 'Sheet'
		case 'elevation': return s.dir[0].toUpperCase() + s.dir.slice(1)
	}
}

/** The views drawn in paper mm at 1:1 with no model behind them (a port map, a port grid, a schedule, a fill
 *  section): no level of their own to follow, no model to edit, no scale to print. */
export const isPaperKind = (k: ViewSpec['kind']): k is 'portmap' | 'ports' | 'schedule' | 'fill' => k === 'portmap' || k === 'ports' || k === 'schedule' || k === 'fill'
export const isPaperSpec = (s: ViewSpec): s is Extract<ViewSpec, { kind: 'portmap' | 'ports' | 'schedule' | 'fill' }> => isPaperKind(s.kind)

export function spaceOf(spec: ViewSpec, origin: Pt = { x: 0, y: 0 }): ViewSpace {
	if (spec.kind === 'row' || spec.kind === 'riser' || isPaperSpec(spec)) {
		// A rack row is laid out along the view, not at plan positions: there is no model x / y to give back yet (the
		// riser and port map views neither).
		// Dragging maps to no model movement (devices move by U in the device tool, slice 3.2).
		return {
			spec,
			toWorld: (p) => ({ x: p.x, y: 0, z: -p.y }),
			deltaToWorld: () => ({ x: 0, y: 0, z: 0 }),
			fromWorld: (p) => ({ x: p.x, y: -p.z }),
			depthOf: () => 0,
		}
	}
	// a sheet's paper: view mm = paper mm from its top-left, y down — plan-like, no model behind it
	if (spec.kind === 'plan' || spec.kind === 'sheet') {
		return {
			spec,
			toWorld: (p, w) => ({ x: p.x, y: p.y, z: w.z }),
			deltaToWorld: (d) => ({ x: d.x, y: d.y, z: 0 }),
			fromWorld: (p) => ({ x: p.x, y: p.y }),
			depthOf: () => 0,
		}
	}
	// a section's frame comes from its record (views/section.ts sectionSpace); without it, look like the Front
	const f = namedFrame(spec.kind === 'section' ? 'front' : spec.dir, origin)
	return {
		spec, frame: f,
		toWorld: (p, w) => unproject(f, { u: p.x, v: -p.y }, w.depth),
		deltaToWorld: (d) => ({ x: f.t.x * d.x, y: f.t.y * d.x, z: -d.y }),
		fromWorld: (p) => { const e = project(f, p); return { x: e.u, y: -e.v } },
		depthOf: (p) => project(f, p).depth,
	}
}
