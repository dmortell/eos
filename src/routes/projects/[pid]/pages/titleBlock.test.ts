import { describe, it, expect } from 'vitest'
import { fillTitleBlock, initialsOf, DEFAULT_TITLE_BLOCK } from './titleBlock'

describe('title block', () => {
	it('fills the template from the sheet context; empty values show a dash', () => {
		const cells = fillTitleBlock(DEFAULT_TITLE_BLOCK, { project: 'Hibiya', title: '33F Outlets', scale: '1:100', size: 'A3 L', number: 'E-101' })
		expect(cells[0]).toEqual({ label: 'Project', value: 'Hibiya', wide: true })
		expect(cells.find((c) => c.label === 'Dwg №')!.value).toBe('E-101')
		expect(cells.find((c) => c.label === 'Rev')!.value).toBe('—')
	})
	it('relabels, orders and adds custom fixed text per project; no template → the default', () => {
		const cells = fillTitleBlock({ fields: [{ key: 'custom', label: 'Client', value: 'Mitsui', wide: true }, { key: 'number', label: 'Drawing' }] }, { number: '7' })
		expect(cells).toEqual([{ label: 'Client', value: 'Mitsui', wide: true }, { label: 'Drawing', value: '7', wide: false }])
		expect(fillTitleBlock(undefined, {}).length).toBe(DEFAULT_TITLE_BLOCK.fields.length)
	})
	it('initials from a name or an email', () => {
		expect(initialsOf('David Mortell')).toBe('DM')
		expect(initialsOf('dmortell@gmail.com')).toBe('DMO')
		expect(initialsOf('')).toBe('')
	})
})
