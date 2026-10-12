import { describe, it, expect } from 'vitest'
import { Workspace } from './workspace.svelte'

describe('each pane has its own level', () => {
	it('the open level is the active pane’s; setting it changes only that pane', () => {
		const ws = new Workspace()
		ws.paneLevels = ['2F', '3F']
		expect(ws.levelId).toBe('2F')
		ws.pane = 1
		expect(ws.levelId).toBe('3F')
		ws.levelId = '4F'   // the Navigator, Floors, Find … pick a level: the pane you're in
		expect(ws.paneLevels).toEqual(['2F', '4F'])
	})
	it('split: the new pane starts on the same level; unsplit keeps the active pane’s', () => {
		const ws = new Workspace()
		ws.paneLevels = ['2F', null]
		ws.setPaneCount(2)
		expect(ws.paneLevels).toEqual(['2F', '2F'])
		ws.pane = 1
		ws.levelId = '3F'
		ws.setPaneCount(1)
		expect(ws.pane).toBe(0)
		expect(ws.levelId).toBe('3F')
	})
})

describe('cord defaults (Review 2 Q35)', () => {
	it('come from the project on load — before the Cord tool is ever picked — and again when the project changes them; a choice in between stays', () => {
		const ws = new Workspace()
		ws.seedCordDefaults(undefined)   // settings not loaded yet
		expect(ws.cordDefaults).toEqual({ cableType: 'cat6a', colour: '#3b82f6' })
		ws.seedCordDefaults({ cordCableType: 'om4', cordColour: '#ff0000' })
		expect(ws.cordDefaults).toEqual({ cableType: 'om4', colour: '#ff0000' })
		ws.cordDefaults.colour = '#00ff00'   // picked in the cord bar: sticky
		ws.seedCordDefaults({ cordCableType: 'om4', cordColour: '#ff0000' })   // the same settings again (another edit)
		expect(ws.cordDefaults.colour).toBe('#00ff00')
		ws.seedCordDefaults({ cordCableType: 'cat6', cordColour: '#ff0000' })   // changed in Settings
		expect(ws.cordDefaults).toEqual({ cableType: 'cat6', colour: '#ff0000' })
	})
})
