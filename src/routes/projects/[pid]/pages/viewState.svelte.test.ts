import { describe, it, expect, beforeEach } from 'vitest'
import { viewKey, viewState } from './viewState.svelte'

beforeEach(() => {
	localStorage.clear()
	// Reset the singleton's persisted cache between tests (it's a module-level instance).
	viewState.drop(['p1', 'p2', 't1', 't2', 't3', 'f1'])
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

describe('getCanvas / setCanvas — coarse-grained + localStorage persistence', () => {
	it('defaults to zoom 1 at the origin when unset', () => {
		expect(viewState.getCanvas('p1', 't1')).toEqual({ x: 0, y: 0, zoom: 1 })
	})
	it('round-trips a live value and persists it to localStorage keyed by tab id alone', () => {
		viewState.setCanvas('p1', 't1', { x: 3, y: 4, zoom: 1.1 })
		expect(viewState.getCanvas('p1', 't1')).toEqual({ x: 3, y: 4, zoom: 1.1 })
		const raw = JSON.parse(localStorage.getItem('eos.pages.canvasView') || '{}')
		expect(raw.t1).toEqual({ x: 3, y: 4, zoom: 1.1 })
	})
	it('loadPersisted seeds the cache from localStorage, read as a fallback under the live value', () => {
		localStorage.setItem('eos.pages.canvasView', JSON.stringify({ t2: { x: 9, y: 9, zoom: 3 } }))
		viewState.loadPersisted()
		expect(viewState.getCanvas('p1', 't2')).toEqual({ x: 9, y: 9, zoom: 3 })   // no live entry yet → falls back to the cache
		viewState.setCanvas('p1', 't2', { x: 0, y: 0, zoom: 1 })
		expect(viewState.getCanvas('p1', 't2')).toEqual({ x: 0, y: 0, zoom: 1 })   // live entry now wins
	})
})

describe('drop', () => {
	it('removes every fine (pane:view:proj) and coarse (pane:tab) entry for the given ids', () => {
		viewState.setView('p1', 't1', 'plan', { x: 1, y: 1, zoom: 1 })
		viewState.setOrbit('p1', 't1', 'iso', 1, 1)
		viewState.setProj('p1', 't1', 'front')
		viewState.setView('p1', 'f1', 'plan', { x: 2, y: 2, zoom: 2 })   // a viewport frame id inside the tab
		viewState.setView('p1', 't2', 'plan', { x: 5, y: 5, zoom: 1 })   // a different tab — must survive
		viewState.drop(['t1', 'f1'])
		expect(viewState.getView('p1', 't1', 'plan')).toEqual({ x: 0, y: 0, zoom: 1 })
		expect(viewState.getOrbit('p1', 't1', 'iso')).toBeUndefined()
		expect(viewState.getProj('p1', 't1')).toBeUndefined()
		expect(viewState.getView('p1', 'f1', 'plan')).toEqual({ x: 0, y: 0, zoom: 1 })
		expect(viewState.getView('p1', 't2', 'plan')).toEqual({ x: 5, y: 5, zoom: 1 })   // untouched
	})
	it('does NOT clear the canvas view or its localStorage cache (matches dropDoc today)', () => {
		viewState.setCanvas('p1', 't1', { x: 7, y: 7, zoom: 2 })
		viewState.drop(['t1'])
		expect(viewState.getCanvas('p1', 't1')).toEqual({ x: 7, y: 7, zoom: 2 })
		const raw = JSON.parse(localStorage.getItem('eos.pages.canvasView') || '{}')
		expect(raw.t1).toEqual({ x: 7, y: 7, zoom: 2 })
	})
})
