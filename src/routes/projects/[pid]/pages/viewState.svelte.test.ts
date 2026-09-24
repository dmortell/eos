import { describe, it, expect, beforeEach } from 'vitest'
import { viewKey, viewState } from './viewState.svelte'

beforeEach(() => {
	localStorage.clear()
	// Reset the singleton's persisted cache between tests (it's a module-level instance).
	viewState.drop(['p1', 'p2', 't1', 't2', 't3', 'f1'], 'd-t1')
	viewState.drop([], 'd-t2')
	for (const d of ['t1', 't2', 't3', 'f1', 'model:m1']) viewState.drop([], d)   // the persisted view seed
})

describe('viewKey', () => {
	it('joins pane, view and projection with ":"', () => {
		expect(viewKey('p1', 't2', 'front')).toBe('p1:t2:front')
	})
})

describe('getView / setView — fine-grained, per pane+view+proj', () => {
	it('defaults to zoom 1 at the origin when unset', () => {
		expect(viewState.getView('p1', 't1', 'plan')).toEqual({ x: 0, y: 0, zoom: 1 })
	})
	it('round-trips a set value, keyed independently per projection', () => {
		viewState.setView('p1', 't1', 'plan', { x: 10, y: 20, zoom: 2 })
		viewState.setView('p1', 't1', 'front', { x: 5, y: 5, zoom: 1.5 })
		expect(viewState.getView('p1', 't1', 'plan')).toEqual({ x: 10, y: 20, zoom: 2 })
		expect(viewState.getView('p1', 't1', 'front')).toEqual({ x: 5, y: 5, zoom: 1.5 })
	})
	it('keeps the same view id independent across panes (a split pane)', () => {
		viewState.setView('p1', 't1', 'plan', { x: 1, y: 1, zoom: 1 })
		expect(viewState.getView('p2', 't1', 'plan')).toEqual({ x: 0, y: 0, zoom: 1 })
	})
})

describe('getOrbit / setOrbit', () => {
	it('is undefined until set, and round-trips independently of pan/zoom at the same key', () => {
		expect(viewState.getOrbit('p1', 't1', 'iso')).toBeUndefined()
		viewState.setView('p1', 't1', 'iso', { x: 0, y: 0, zoom: 1 })
		viewState.setOrbit('p1', 't1', 'iso', 0.5, 1.2)
		expect(viewState.getOrbit('p1', 't1', 'iso')).toEqual({ yaw: 0.5, pitch: 1.2 })
		expect(viewState.getView('p1', 't1', 'iso')).toEqual({ x: 0, y: 0, zoom: 1 })   // untouched by setOrbit
	})
})

describe('getProj / setProj — coarse-grained, per pane+tab (not per projection)', () => {
	it('is undefined until set; round-trips per pane+tab', () => {
		expect(viewState.getProj('p1', 't1')).toBeUndefined()
		viewState.setProj('p1', 't1', 'front')
		expect(viewState.getProj('p1', 't1')).toBe('front')
		expect(viewState.getProj('p2', 't1')).toBeUndefined()   // independent per pane
	})
})

describe('getCanvas / setCanvas — coarse-grained + localStorage persistence keyed by DRAWING id (B27)', () => {
	it('defaults to zoom 1 at the origin when unset', () => {
		expect(viewState.getCanvas('p1', 't1', 'd-t1')).toEqual({ x: 0, y: 0, zoom: 1 })
	})
	it('round-trips a live value and persists it to localStorage keyed by DRAWING id, not tab id', () => {
		viewState.setCanvas('p1', 't1', 'd-t1', { x: 3, y: 4, zoom: 1.1 })
		expect(viewState.getCanvas('p1', 't1', 'd-t1')).toEqual({ x: 3, y: 4, zoom: 1.1 })
		const raw = JSON.parse(localStorage.getItem('eos.pages.canvasView') || '{}')
		expect(raw['d-t1']).toEqual({ x: 3, y: 4, zoom: 1.1 })
		expect(raw.t1).toBeUndefined()
	})
	it('a REOPENED drawing (new random tab id, same drawing id) still finds its persisted position', () => {
		viewState.setCanvas('p1', 't1', 'd-t1', { x: 3, y: 4, zoom: 1.1 })
		// tab closes (t1 gone); the SAME drawing reopens as a fresh tab id, e.g. 't9' — drawing id unchanged
		expect(viewState.getCanvas('p1', 't9', 'd-t1')).toEqual({ x: 3, y: 4, zoom: 1.1 })
	})
	it('loadPersisted seeds the cache from localStorage, read as a fallback under the live value', () => {
		localStorage.setItem('eos.pages.canvasView', JSON.stringify({ 'd-t2': { x: 9, y: 9, zoom: 3 } }))
		viewState.loadPersisted()
		expect(viewState.getCanvas('p1', 't2', 'd-t2')).toEqual({ x: 9, y: 9, zoom: 3 })   // no live entry yet → falls back to the cache
		viewState.setCanvas('p1', 't2', 'd-t2', { x: 0, y: 0, zoom: 1 })
		expect(viewState.getCanvas('p1', 't2', 'd-t2')).toEqual({ x: 0, y: 0, zoom: 1 })   // live entry now wins
	})
})

describe('hasCanvas (B27) — whether a drawing already has a remembered position', () => {
	it('false when nothing is set; true once live or persisted', () => {
		expect(viewState.hasCanvas('p1', 't1', 'd-t1')).toBe(false)
		viewState.setCanvas('p1', 't1', 'd-t1', { x: 1, y: 1, zoom: 1 })
		expect(viewState.hasCanvas('p1', 't1', 'd-t1')).toBe(true)
	})
	it('true from the persisted cache alone, even with no live entry for this pane+tab', () => {
		localStorage.setItem('eos.pages.canvasView', JSON.stringify({ 'd-t2': { x: 1, y: 1, zoom: 1 } }))
		viewState.loadPersisted()
		expect(viewState.hasCanvas('p1', 't2', 'd-t2')).toBe(true)
		expect(viewState.hasCanvas('p1', 't3', 'd-other')).toBe(false)
	})
})

describe('drop', () => {
	it('removes every fine (pane:view:proj) and coarse (pane:tab) entry for the given ids — live, then (by drawing id) persisted', () => {
		viewState.setView('p1', 't1', 'plan', { x: 1, y: 1, zoom: 1 })
		viewState.setOrbit('p1', 't1', 'iso', 1, 1)
		viewState.setProj('p1', 't1', 'front')
		viewState.setView('p1', 'f1', 'plan', { x: 2, y: 2, zoom: 2 })   // a viewport frame id inside the tab
		viewState.setView('p1', 't2', 'plan', { x: 5, y: 5, zoom: 1 })   // a different tab — must survive
		viewState.drop(['t1', 'f1'])   // live only: the persisted seed still restores them (a closed tab reopened)
		expect(viewState.getView('p1', 't1', 'plan')).toEqual({ x: 1, y: 1, zoom: 1 })
		viewState.drop([], 't1'); viewState.drop([], 'f1')
		expect(viewState.getView('p1', 't1', 'plan')).toEqual({ x: 0, y: 0, zoom: 1 })
		expect(viewState.getOrbit('p1', 't1', 'iso')).toBeUndefined()
		expect(viewState.getProj('p1', 't1')).toBeUndefined()
		expect(viewState.getView('p1', 'f1', 'plan')).toEqual({ x: 0, y: 0, zoom: 1 })
		expect(viewState.getView('p1', 't2', 'plan')).toEqual({ x: 5, y: 5, zoom: 1 })   // untouched
	})
	it('without a drawingId, does NOT touch the persisted canvas seed', () => {
		viewState.setCanvas('p1', 't1', 'd-t1', { x: 7, y: 7, zoom: 2 })
		viewState.drop(['t1'])
		expect(viewState.getCanvas('p1', 't1', 'd-t1')).toEqual({ x: 7, y: 7, zoom: 2 })
		const raw = JSON.parse(localStorage.getItem('eos.pages.canvasView') || '{}')
		expect(raw['d-t1']).toEqual({ x: 7, y: 7, zoom: 2 })
	})
	it('WITH a drawingId (B27: prune on close), removes that drawing\'s persisted canvas seed too', () => {
		viewState.setCanvas('p1', 't1', 'd-t1', { x: 7, y: 7, zoom: 2 })
		viewState.drop(['t1'], 'd-t1')
		expect(viewState.getCanvas('p1', 't1', 'd-t1')).toEqual({ x: 0, y: 0, zoom: 1 })   // back to default — pruned
		const raw = JSON.parse(localStorage.getItem('eos.pages.canvasView') || '{}')
		expect(raw['d-t1']).toBeUndefined()
	})
})

describe('persisted views (a reload restores a model tab)', () => {
	it('view / orbit / projection outlive the live map and are saved to localStorage (debounced)', async () => {
		viewState.setView('p1', 'model:m1', 'plan', { x: 3, y: 4, zoom: 7 })
		viewState.setOrbit('p1', 'model:m1', 'iso', 30, 20)
		viewState.setProj('p1', 'model:m1', 'plan')
		viewState.drop(['model:m1'])   // a tab close / the live map gone
		expect(viewState.getView('p1', 'model:m1', 'plan')).toEqual({ x: 3, y: 4, zoom: 7 })
		expect(viewState.hasView('p1', 'model:m1', 'plan')).toBe(true)
		expect(viewState.getOrbit('p1', 'model:m1', 'iso')).toEqual({ yaw: 30, pitch: 20 })
		expect(viewState.getProj('p1', 'model:m1')).toBe('plan')
		await new Promise((r) => setTimeout(r, 350))
		const raw = JSON.parse(localStorage.getItem('eos.pages.views') || '{}')
		expect(raw['p1:model:m1:plan']).toMatchObject({ pan: { x: 3, y: 4 }, zoom: 7 })
	})
	it('dropping with the drawing id forgets its persisted views', () => {
		viewState.setView('p1', 'model:m1', 'plan', { x: 3, y: 4, zoom: 7 })
		viewState.drop(['model:m1'], 'model:m1')
		expect(viewState.hasView('p1', 'model:m1', 'plan')).toBe(false)
	})
})
