// Ported unchanged from Pages' titleBlock.test.ts, with the model (domain/titleBlock.ts).
import { describe, it, expect } from 'vitest'
import { fillTitleBlock, initialsOf, DEFAULT_TITLE_BLOCK, shownTitleBlock, withLogoFields } from './titleBlock'

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
	it('shows the company lines and drops sections the template hides', () => {
		const cells = fillTitleBlock(undefined, {})
		const tb = shownTitleBlock({ fields: [], logo: 'ACME', company: { name: 'Acme Ltd', address: ' ', contact: '03-1234' }, border: true }, cells)
		expect(tb).toEqual({ logo: 'ACME', company: ['Acme Ltd', '03-1234'], cells, border: true })
		expect(shownTitleBlock({ fields: [], logo: 'A', company: { name: 'X' }, hidden: ['logo', 'company', 'fields'] }, cells)).toEqual({ logo: undefined, company: undefined, cells: [], border: false })
		expect(shownTitleBlock(undefined, cells).logo).toBe(DEFAULT_TITLE_BLOCK.logo)
		// the last 5 revisions; none when the template hides the table
		const revs = ['A', 'B', 'C', 'D', 'E', 'F'].map((code) => ({ code, date: '2026-09-25' }))
		expect(shownTitleBlock(undefined, cells, revs).revisions?.map((r) => r.code)).toEqual(['B', 'C', 'D', 'E', 'F'])
		expect(shownTitleBlock({ fields: [], hidden: ['revisions'] }, cells, revs).revisions).toBeUndefined()
		// logo images are FIELDS now: not in the logo section; the layout when not the default
		const lg = { company: { src: 'data:c' }, client: { src: 'data:k', h: 12 } }
		expect(shownTitleBlock({ fields: [], logos: lg, layout: 'horizontal' }, cells)).toMatchObject({ layout: 'horizontal' })
		expect(shownTitleBlock({ fields: [], logos: lg, layout: 'horizontal' }, cells)).not.toHaveProperty('logos')
		expect(shownTitleBlock({ fields: [], layout: 'vertical' }, cells)).not.toHaveProperty('layout')
	})
	it('logos are fields (Dave): an old template\'s logos come first, full width; placed ones stay where they are', () => {
		const lg = { company: { src: 'data:c' }, client: { src: 'data:k', h: 12 } }
		const old = { fields: [{ key: 'title' as const, label: 'Title', wide: true }], logos: lg }
		expect(withLogoFields(old).map((f) => f.key === 'logo' ? `logo:${f.logo}` : f.key)).toEqual(['logo:company', 'logo:client', 'title'])
		const placed = { fields: [{ key: 'title' as const, label: 'Title', wide: true }, { key: 'logo' as const, logo: 'client' as const, label: 'Client logo' }], logos: lg }
		expect(withLogoFields(placed).map((f) => f.key === 'logo' ? `logo:${f.logo}` : f.key)).toEqual(['logo:company', 'title', 'logo:client'])
		// filled: an image cell (no label printed), a half-width one where it was put; a logo with no image shows nothing
		const cells = fillTitleBlock(placed, { title: 'Plan' })
		expect(cells.map((c) => c.image?.src ?? c.value)).toEqual(['data:c', 'Plan', 'data:k'])
		expect(cells[2]).toMatchObject({ wide: false, image: { h: 12 } })
		expect(fillTitleBlock({ ...placed, logos: { company: { src: '' } } }, {}).some((c) => c.image)).toBe(false)
	})
	it('initials from a name or an email', () => {
		expect(initialsOf('David Mortell')).toBe('DM')
		expect(initialsOf('dmortell@gmail.com')).toBe('DMO')
		expect(initialsOf('')).toBe('')
	})
})
