// Screen-facing callouts / legends in the iso view (ui/isoAnno.ts): anchors projected through the view map,
// the box upright at paper size, picked on the projected copy.
import { describe, it, expect } from 'vitest'
import { isoFacing, isoAnnoEnt, hitIsoAnno } from './isoAnno'
import { textBox, type Ent, type Pt } from './geometry'
import { viewMap, DEFAULT_YAW, DEFAULT_PITCH } from '../3dview/projection'
import { insertBounds } from './blocks'
import { PT_MM } from '../constants'
import type { ViewCtx } from './view'

const CX = 14000, CY = 8750, GROUND = 10250
const vm = viewMap('iso', CX, CY, GROUND, DEFAULT_YAW, DEFAULT_PITCH, { icx: 120, icy: -80 })
const proj = (x: number, y: number): Pt => vm.toDraw({ x, y, z: 0 })
const isoCtx: ViewCtx = { dir: 'iso', isPlan: false, isElev: false, isIso: true, elevDir: 'front', cx: CX, cy: CY, ground: GROUND, frameId: 'f', paperMm: 50, mdl: undefined, yaw: DEFAULT_YAW, pitch: DEFAULT_PITCH }
const planCtx: ViewCtx = { ...isoCtx, dir: 'plan', isPlan: true, isIso: false }

const callout: Ent = { id: 'c', type: 'text', text: 'PATCH\nPANEL', a: [3000, 2000], leader: [4200, 5100], callout: true, rot: 30 }
const legend: Ent = { id: 'lg', type: 'insert', block: 'legend', a: [9000, 1000] }
const plain: Ent = { id: 't', type: 'text', text: 'note', a: [0, 0] }

describe('isoFacing', () => {
	it('callout texts and legend inserts face the screen; plain text / other shapes stay on the ground', () => {
		expect(isoFacing(callout)).toBe(true)
		expect(isoFacing(legend)).toBe(true)
		expect(isoFacing(plain)).toBe(false)
		expect(isoFacing({ id: 'r', type: 'rect', a: [0, 0], b: [1, 1] })).toBe(false)
		expect(isoFacing({ id: 'i', type: 'insert', block: 'outlet-box', a: [0, 0] } as Ent)).toBe(false)
	})
})

describe('isoAnnoEnt', () => {
	it("projects a callout's text anchor AND its leader tip through the view map, and drops the rotation", () => {
		const q = isoAnnoEnt(callout, proj)
		expect(q.a).toEqual(proj(3000, 2000))
		expect(q.leader).toEqual(proj(4200, 5100))
		expect(q.rot).toBeUndefined()
		expect(q.text).toBe(callout.text)
		expect(callout.a).toEqual([3000, 2000])   // the source entity is untouched
		expect(callout.rot).toBe(30)
	})
	it('keeps the text box at its PAPER size (unskewed): same width / height as in plan, just moved', () => {
		const k = PT_MM * isoCtx.paperMm
		const [x0, y0, x1, y1] = textBox(callout, k), [u0, v0, u1, v1] = textBox(isoAnnoEnt(callout, proj), k)
		expect(u1 - u0).toBeCloseTo(x1 - x0, 9)
		expect(v1 - v0).toBeCloseTo(y1 - y0, 9)
	})
	it("a legend's top-left corner is projected; its frame keeps its paper size", () => {
		const q = isoAnnoEnt(legend, proj)
		expect(q.a).toEqual(proj(9000, 1000))
		const [x0, y0, x1, y1] = insertBounds(legend, 50), [u0, v0, u1, v1] = insertBounds(q, 50)
		expect([u1 - u0, v1 - v0]).toEqual([x1 - x0, y1 - y0])
	})
	it('a callout with no leader tip stays without one (the renderer places its default leader off the box)', () => {
		expect(isoAnnoEnt({ ...callout, leader: undefined }, proj).leader).toBeUndefined()
	})
})

describe('hitIsoAnno', () => {
	const inBox = (e: Ent): Pt => { const [x0, y0, x1, y1] = textBox(isoAnnoEnt(e, proj), PT_MM * isoCtx.paperMm); return [(x0 + x1) / 2, (y0 + y1) / 2] }
	it("picks a callout on its PROJECTED box, not where the plan box was", () => {
		expect(hitIsoAnno(isoCtx, [callout], proj, inBox(callout), 1)).toBe('c')
		const [x0, y0, x1, y1] = textBox(callout, PT_MM * isoCtx.paperMm)
		expect(hitIsoAnno(isoCtx, [callout], proj, [(x0 + x1) / 2, (y0 + y1) / 2], 1)).toBeNull()
	})
	it('picks a legend anywhere on its frame', () => {
		const [u0, v0, u1, v1] = insertBounds(isoAnnoEnt(legend, proj), 50)
		expect(hitIsoAnno(isoCtx, [legend], proj, [(u0 + u1) / 2, (v0 + v1) / 2], 1)).toBe('lg')
		expect(hitIsoAnno(isoCtx, [legend], proj, [u1 + 50, v1 + 50], 1)).toBeNull()
	})
	it('the top-most (last painted) wins; the layer gate, non-facing shapes and non-iso views are skipped', () => {
		const twin = { ...callout, id: 'c2' }
		const p = inBox(callout)
		expect(hitIsoAnno(isoCtx, [{ ...callout, plane: 'front' }], proj, p, 1)).toBeNull()   // an elevation-native one isn't in the iso view
		expect(hitIsoAnno(isoCtx, [callout, twin], proj, p, 1)).toBe('c2')
		expect(hitIsoAnno(isoCtx, [callout, twin], proj, p, 1, (e) => e.id !== 'c2')).toBe('c')
		expect(hitIsoAnno(isoCtx, [{ ...plain, a: callout.a }], proj, p, 1)).toBeNull()
		expect(hitIsoAnno(planCtx, [callout], proj, p, 1)).toBeNull()
		expect(hitIsoAnno(isoCtx, [callout], null, p, 1)).toBeNull()
	})
})
