// Conventions stated as what a person SEES (ADR 0004). If one of these fails, fix the code, not the expectation.
import { describe, it, expect } from 'vitest'
import {
	namedFrame, frameLooking, project, unproject, frameRot, rackFrontNormal, rackFrontFrame, dirOf, rotate,
	screenCcwToPlan, planToScreenCcw, type ElevDir,
} from './conventions'

const near = (f: ElevDir, a: { x: number; y: number }, b: { x: number; y: number }) =>
	project(namedFrame(f), { ...a, z: 0 }).depth > project(namedFrame(f), { ...b, z: 0 }).depth
const rightOf = (f: ElevDir, a: { x: number; y: number }, b: { x: number; y: number }) =>
	project(namedFrame(f), { ...a, z: 0 }).u > project(namedFrame(f), { ...b, z: 0 }).u

describe('plan axes', () => {
	it('y grows DOWN the sheet, angles turn clockwise on screen', () => {
		expect(dirOf(90)).toEqual({ x: 0, y: 1 })          // 90° points down the sheet
		expect(rotate({ x: 1, y: 0 }, 90)).toEqual({ x: 0, y: 1 })
	})
	it('a typed CAD angle of 90° (counter-clockwise) points UP the sheet', () => {
		expect(dirOf(screenCcwToPlan(90))).toEqual({ x: 0, y: -1 })
		expect(planToScreenCcw(screenCcwToPlan(37))).toBeCloseTo(37)
	})
})

describe('named elevations: where the viewer stands', () => {
	it('FRONT stands at the bottom of the sheet: lower on the sheet is nearer, plan-right is view-right', () => {
		expect(near('front', { x: 0, y: 100 }, { x: 0, y: 0 })).toBe(true)
		expect(rightOf('front', { x: 100, y: 0 }, { x: 0, y: 0 })).toBe(true)
	})
	it('REAR stands at the top of the sheet: plan-left is view-right', () => {
		expect(near('rear', { x: 0, y: 0 }, { x: 0, y: 100 })).toBe(true)
		expect(rightOf('rear', { x: 0, y: 0 }, { x: 100, y: 0 })).toBe(true)
	})
	it('RIGHT stands at the right of the sheet looking left: the top of the sheet is view-right', () => {
		expect(near('right', { x: 100, y: 0 }, { x: 0, y: 0 })).toBe(true)
		expect(rightOf('right', { x: 0, y: 0 }, { x: 0, y: 100 })).toBe(true)
	})
	it('LEFT stands at the left of the sheet looking right: the bottom of the sheet is view-right', () => {
		expect(near('left', { x: 0, y: 0 }, { x: 100, y: 0 })).toBe(true)
		expect(rightOf('left', { x: 0, y: 100 }, { x: 0, y: 0 })).toBe(true)
	})
	it('height is drawn as-is in every elevation (z up, from FFL)', () => {
		for (const d of ['front', 'rear', 'left', 'right'] as const) expect(project(namedFrame(d), { x: 5, y: 7, z: 300 }).v).toBe(300)
	})
	it('frameLooking(270) — looking up the sheet — is the front view', () => {
		expect(frameLooking(270)).toEqual(namedFrame('front'))
		expect(frameLooking(180)).toEqual(namedFrame('right'))
	})
})

describe('drawing on an elevation', () => {
	it('a point picked on the work plane comes back where it was picked, in any view', () => {
		for (const f of [namedFrame('front'), namedFrame('left'), frameLooking(222, { x: 500, y: -300 })]) {
			const p = unproject(f, { u: 1200, v: 2700 }, -450)
			const back = project(f, p)
			expect(back.u).toBeCloseTo(1200); expect(back.v).toBeCloseTo(2700); expect(back.depth).toBeCloseTo(-450)
		}
	})
	it('in the FRONT view, a deeper work plane (further from the viewer) is further UP the sheet', () => {
		const near = unproject(namedFrame('front'), { u: 0, v: 0 }, 0), far = unproject(namedFrame('front'), { u: 0, v: 0 }, -1000)
		expect(far.y).toBeLessThan(near.y)
	})
	it('a box drawn on an elevation runs its width along the view: rot 0 in FRONT, 270 in RIGHT', () => {
		expect(frameRot(namedFrame('front'))).toBe(0)
		expect(frameRot(namedFrame('right'))).toBe(270)    // width runs up the sheet
	})
	it('a vertical run drawn in an elevation keeps one plan position', () => {
		const f = frameLooking(300), a = unproject(f, { u: 50, v: -200 }, 120), b = unproject(f, { u: 50, v: 2900 }, 120)
		expect(b.x).toBeCloseTo(a.x); expect(b.y).toBeCloseTo(a.y); expect(b.z - a.z).toBe(3100)
	})
})

describe('racks', () => {
	it('an unrotated rack faces the FRONT elevation', () => {
		expect(rackFrontNormal({})).toEqual(namedFrame('front').n)
	})
	it('a rack rotated 90° (clockwise on screen) faces the LEFT of the sheet, so the LEFT elevation sees its front', () => {
		expect(rackFrontNormal({ rot: 90 })).toEqual(namedFrame('left').n)
	})
	it('rackFrontFrame sees a front-mounted device nearer than the rack body behind it', () => {
		const rack = { at: { x: 1000, y: 1000 }, rot: 30 }
		const f = rackFrontFrame(rack)
		const front = rotate({ x: 0, y: 400 }, 30), back = rotate({ x: 0, y: -400 }, 30)
		const at = (d: { x: number; y: number }) => ({ x: rack.at.x + d.x, y: rack.at.y + d.y, z: 0 })
		expect(project(f, at(front)).depth).toBeGreaterThan(project(f, at(back)).depth)
	})
})
