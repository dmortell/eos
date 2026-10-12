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
