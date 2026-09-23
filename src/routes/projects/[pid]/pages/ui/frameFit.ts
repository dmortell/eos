// XP19 — "Fit": the drawing scale (1:N) at which a sheet viewport frame shows the whole model, and the view
// offset that centres it. Pure, so it's unit-tested; +page applies the result (frame scale + that frame's
// content view). Uses the SAME projection path the frame renders with (R7 `viewMap` + `project`), so what is
// fitted is exactly what is drawn — plan, any elevation, or iso.
import { project, viewMap, isoBounds, trimToClip, DEFAULT_YAW, DEFAULT_PITCH } from '../3dview/projection'
import type { Obj, Dir, Clip } from '../3dview/types'
import { PLAN_CX, PLAN_CY, GROUND } from './geometry'

/** Round a raw scale denominator UP to a tidy one: whole numbers to 10, then steps of 5 to 100, 10 to 500,
 *  50 above — so a fit reads like a scale someone would choose (1:7, 1:35, 1:140, 1:650). */
export function niceScale(n: number): number {
	const step = n <= 10 ? 1 : n <= 100 ? 5 : n <= 500 ? 10 : 50
	return Math.max(1, Math.ceil(n / step - 1e-9) * step)
}

/** The fit for a frame `frameMm` (paper mm) looking at `objects` in direction `dir`: `n` = the 1:N scale
 *  with a 10 % margin, `view` = the content offset (at zoom 1) that centres the objects' drawn bounds in
 *  the frame. A section `clip` trims objects first, like the render. null when nothing is visible. */
export function fitFrame(objects: Obj[], dir: Dir, frameMm: { w: number; h: number },
	opts: { yaw?: number; pitch?: number; visible?: (o: Obj) => boolean; clip?: Clip | null } = {}): { n: number; view: { zoom: number; x: number; y: number } } | null {
	const vis = objects.filter((o) => (opts.visible ? opts.visible(o) : true))
	const shown = opts.clip ? vis.map((o) => trimToClip(o, opts.clip!)).filter((o): o is Obj => !!o) : vis
	if (!shown.length || frameMm.w <= 0 || frameMm.h <= 0) return null
	const yaw = opts.yaw ?? DEFAULT_YAW, pitch = opts.pitch ?? DEFAULT_PITCH
	const isoBox = dir === 'iso' ? isoBounds(shown, yaw, pitch, PLAN_CX, PLAN_CY) : null
	const vm = viewMap(dir, PLAN_CX, PLAN_CY, GROUND, yaw, pitch, isoBox)
	let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
	for (const o of shown) for (const sh of project(o, dir, yaw, pitch, PLAN_CX, PLAN_CY)) for (const q of sh.pts) {
		const [x, y] = vm.uvToDraw(q)
		if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y
	}
	if (!isFinite(x0)) return null
	const n = niceScale(Math.max((x1 - x0) / frameMm.w, (y1 - y0) / frameMm.h, 1e-6) * 1.1)
	// The Viewport draws P at view + (C + (P − C) / N) about the plan centre C: centring the bounds' mid-point
	// means view = −(mid − C) / N.
	const mx = (x0 + x1) / 2, my = (y0 + y1) / 2
	return { n, view: { zoom: 1, x: -(mx - PLAN_CX) / n, y: -(my - PLAN_CY) / n } }
}
