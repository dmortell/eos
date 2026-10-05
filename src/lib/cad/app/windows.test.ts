// Window layout (UX review S2): open / close / dock / float, no two copies, kept on screen when the browser shrinks.
import { describe, it, expect, beforeEach } from 'vitest'
import { WindowLayout, clampWin } from './windows.svelte'

beforeEach(() => { try { localStorage.clear() } catch { /* node: no storage */ } })

describe('windows', () => {
	it('starts with the Navigator docked left and Properties docked right; the rest closed', () => {
		const l = new WindowLayout()
		expect(l.docked('left')).toEqual(['navigator'])
		expect(l.docked('right')).toEqual(['properties'])
		expect(l.floating()).toEqual([])
	})
	it('opens a window once (it comes to the front), docks it under the others, floats it again', () => {
		const l = new WindowLayout()
		l.open('layers')
		l.open('layers')
		expect(l.floating()).toEqual(['layers'])
		l.dock('layers', 'left')
		expect(l.docked('left')).toEqual(['navigator', 'layers'])
		l.float('layers', 100, 50)
		expect(l.floating()).toEqual(['layers'])
		expect(l.wins.layers.x).toBe(100)
	})
	it('a window the user closed is not re-opened by a view or tool, only by the user', () => {
		const l = new WindowLayout()
		l.open('racks', false)
		expect(l.shown('racks')).toBe(true)
		l.close('racks')
		l.open('racks', false)
		expect(l.shown('racks')).toBe(false)
		l.toggle('racks')
		expect(l.shown('racks')).toBe(true)
	})
	it('hide all hides every window; Reset puts the defaults back', () => {
		const l = new WindowLayout()
		l.allHidden = true
		expect(l.docked('left')).toEqual([])
		l.open('cables')
		expect(l.allHidden).toBe(false)
		l.reset()
		expect(l.shown('cables')).toBe(false)
		expect(l.docked('left')).toEqual(['navigator'])
	})
	it('a floating window off the right / bottom edge comes back so its title can be reached; a big one is cut to fit', () => {
		const s = { open: true, dock: null, order: 0, x: 1500, y: 900, w: 300, h: 400, folded: false, z: 1 }
		const c = clampWin(s, 1000, 600)
		expect(c.x).toBe(880)
		expect(c.y).toBe(572)
		expect(clampWin({ ...s, x: 10, y: 10, w: 2000, h: 900 }, 1000, 600)).toMatchObject({ w: 1000, h: 600 })
		const on = { ...s, x: 10, y: 10 }
		expect(clampWin(on, 1000, 600)).toBe(on)   // already on screen: the same object (nothing saved)
	})
})
