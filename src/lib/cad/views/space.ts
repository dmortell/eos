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
export const specKey = (s: ViewSpec) => (s.kind === 'plan' ? 'plan' : s.kind === 'riser' ? 'riser' : s.kind === 'row' ? `row:${s.spaceId}:${s.rowId ?? ''}:${s.face}` : s.kind === 'sheet' ? `sheet:${s.sheetId}` : s.dir)
export const specLabel = (s: ViewSpec) => (s.kind === 'plan' ? 'Plan' : s.kind === 'riser' ? 'Riser' : s.kind === 'row' ? `Racks ${s.face}` : s.kind === 'sheet' ? 'Sheet' : s.dir[0].toUpperCase() + s.dir.slice(1))

export function spaceOf(spec: ViewSpec, origin: Pt = { x: 0, y: 0 }): ViewSpace {
	if (spec.kind === 'row' || spec.kind === 'riser') {
		// A rack row is laid out along the view, not at plan positions: there is no model x / y to give back yet.
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
	const f = namedFrame(spec.dir, origin)
	return {
		spec, frame: f,
		toWorld: (p, w) => unproject(f, { u: p.x, v: -p.y }, w.depth),
		deltaToWorld: (d) => ({ x: f.t.x * d.x, y: f.t.y * d.x, z: -d.y }),
		fromWorld: (p) => { const e = project(f, p); return { x: e.u, y: -e.v } },
		depthOf: (p) => project(f, p).depth,
	}
}
