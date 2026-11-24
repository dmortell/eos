import { describe, it, expect } from 'vitest'
import { menuCommands, matchScore, paletteHits, placeHits } from './palette'
import { navTree, findItems } from './navTree'
import { ProjectIndex } from './project'
import { demoProject } from './fixtures'

const noop = () => {}
const menus = [
	{ label: 'File', items: [{ label: 'Open project…', key: 'Ctrl+O', run: noop }, '-' as const, { label: 'Restore from file…', disabled: true, run: noop }] },
	{ label: 'Drawings', items: [{ label: 'Sheets', children: [{ label: 'New sheet', run: noop }] }, { label: 'Bill of materials…', run: noop }] },
	{ label: 'Cabling', items: [{ label: 'New server room…', run: noop }] },
]

describe('command palette (backlog 34)', () => {
	it('lists every enabled menu command by its path, with its key', () => {
		const c = menuCommands(menus)
		expect(c.map((x) => x.path)).toEqual(['File › Open project…', 'Drawings › Sheets › New sheet', 'Drawings › Bill of materials…', 'Cabling › New server room…'])
		expect(c[0].shortcut).toBe('Ctrl+O')
	})
	it('matches every word typed; a name starting with it ranks first', () => {
		expect(matchScore('New server room…', 'new room')).toBeGreaterThan(0)
		expect(matchScore('New server room…', 'new rack')).toBe(0)
		expect(matchScore('New sheet', 'new')).toBeGreaterThan(matchScore('Drawings › Sheets › New sheet', 'new'))
		const { cmds } = paletteHits('new', [], menuCommands(menus))
		expect(cmds.map((x) => x.label)).toEqual(['New sheet', 'New server room…'])
		expect(paletteHits('materials', [], menuCommands(menus)).cmds.map((x) => x.label)).toEqual(['Bill of materials…'])
		expect(paletteHits('  ', [], menuCommands(menus))).toEqual({ places: [], cmds: [] })
	})
	it('finds places as the Navigator does, each with where it sits', () => {
		const ix = new ProjectIndex(demoProject())
		const lv = ix.levels[0]
		const hits = placeHits(navTree(ix), findItems(ix, lv.name).items, lv.name)
		expect(hits.some((h) => h.n.kind === 'level' && h.n.label === lv.name)).toBe(true)
		// a row inside a branch says which (its parents' labels)
		const sec = placeHits(navTree(ix), [], 'section').find((h) => h.n.kind === 'section')
		// only rows that match: not the project row above them
		expect(placeHits(navTree(ix), [], 'section').every((h) => h.n.kind === 'section')).toBe(true)
		if (sec) expect(sec.where).toContain(lv.name)
	})
})
