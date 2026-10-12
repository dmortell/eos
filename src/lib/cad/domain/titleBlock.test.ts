// Ported from Pages' titleBlock.test.ts, with the model (domain/titleBlock.ts); the logo images, logo text and company
// block are fields since 2026-10-05 (Dave: placed and dragged like the others).
import { describe, it, expect } from 'vitest'
import { fillTitleBlock, initialsOf, DEFAULT_TITLE_BLOCK, shownTitleBlock, withLogoFields, isFixedField, withDetails } from './titleBlock'

const keys = (fs: ReturnType<typeof withLogoFields>) => fs.map((f) => (f.key === 'logo' ? `logo:${f.logo}` : f.key))

describe('title block', () => {
	it('fills the template from the sheet context; empty values show a dash', () => {
		const cells = fillTitleBlock(DEFAULT_TITLE_BLOCK, { project: 'Hibiya', title: '33F Outlets', scale: '1:100', size: 'A3 L', number: 'E-101' })
		expect(cells[0]).toMatchObject({ kind: 'logoText', value: 'J', wide: true })   // the default's logo text, first
		expect(cells[1]).toEqual({ label: 'Project', value: 'Hibiya', wide: true })
		expect(cells.find((c) => c.label === 'Dwg №')!.value).toBe('E-101')
		expect(cells.find((c) => c.label === 'Rev')!.value).toBe('—')
	})
	it('relabels, orders and adds custom fixed text per project; no template → the default', () => {
		const cells = fillTitleBlock({ fields: [{ key: 'custom', label: 'Client', value: 'Mitsui', wide: true }, { key: 'number', label: 'Drawing' }] }, { number: '7' })
		expect(cells).toEqual([{ label: 'Client', value: 'Mitsui', wide: true }, { label: 'Drawing', value: '7', wide: false }])   // no logo text, company, images: nothing for them
		expect(fillTitleBlock(undefined, {}).length).toBe(DEFAULT_TITLE_BLOCK.fields.length + 1)   // + the default logo text
	})
	it('the logo text and company block are cells; switched-off sections drop them; the revisions', () => {
		const t = { fields: [], logo: 'ACME', company: { name: 'Acme Ltd', address: ' ', contact: '03-1234' }, border: true }
		const cells = fillTitleBlock(t, {})
		expect(cells.slice(0, 2).map((c) => [c.kind, c.value, c.lines])).toEqual([['logoText', 'ACME', undefined], ['company', '', ['Acme Ltd', '03-1234']]])   // (no fields of its own: the default ones follow)
		expect(shownTitleBlock(t, cells)).toEqual({ cells, border: true })
		expect(fillTitleBlock({ ...t, hidden: ['logo', 'company'] }, {}).filter((c) => c.kind)).toEqual([])
		// "Fields" off keeps the block's own items
		const all = fillTitleBlock({ ...t, fields: [{ key: 'title', label: 'Title' }] }, { title: 'Plan' })
		expect(shownTitleBlock({ ...t, hidden: ['fields'] }, all).cells.map((c) => c.kind)).toEqual(['logoText', 'company'])
		// the last 5 revisions; none when the template hides the table
		const revs = ['A', 'B', 'C', 'D', 'E', 'F'].map((code) => ({ code, date: '2026-09-25' }))
		expect(shownTitleBlock(undefined, cells, revs).revisions?.map((r) => r.code)).toEqual(['B', 'C', 'D', 'E', 'F'])
		expect(shownTitleBlock({ fields: [], hidden: ['revisions'] }, cells, revs).revisions).toBeUndefined()
		expect(shownTitleBlock({ fields: [], layout: 'horizontal' }, cells)).toMatchObject({ layout: 'horizontal' })
		expect(shownTitleBlock({ fields: [], layout: 'vertical' }, cells)).not.toHaveProperty('layout')
	})
	it('the block\'s own items are always in the list (an old template: first, in the old order); placed ones stay put', () => {
		const lg = { company: { src: 'data:c' }, client: { src: 'data:k', h: 12 } }
		const old = { fields: [{ key: 'title' as const, label: 'Title', wide: true }], logos: lg }
		expect(keys(withLogoFields(old))).toEqual(['logo:company', 'logo:client', 'logoText', 'company', 'title'])
		const placed = { fields: [{ key: 'title' as const, label: 'Title', wide: true }, { key: 'company' as const, label: 'Company', wide: true }, { key: 'logo' as const, logo: 'client' as const, label: 'Client logo' }], logos: lg }
		expect(keys(withLogoFields(placed))).toEqual(['logo:company', 'logoText', 'title', 'company', 'logo:client'])
		expect(withLogoFields(placed).filter(isFixedField)).toHaveLength(4)
		// filled: an image cell (no label printed), a half-width logo where it was put; one with no image shows nothing
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

describe('approvals and site (backlog)', () => {
	it('Checked / Approved fill from the sheet, Site from the template; a template without them is unchanged', () => {
		const t = { ...DEFAULT_TITLE_BLOCK, site: '1-2-3 Chiyoda, Tokyo', fields: [...DEFAULT_TITLE_BLOCK.fields, { key: 'checked' as const, label: 'Checked' }, { key: 'approved' as const, label: 'Approved' }, { key: 'site' as const, label: 'Site', wide: true }] }
		const cells = fillTitleBlock(t, { checked: 'AB', site: t.site })
		expect(cells.find((c) => c.label === 'Checked')?.value).toBe('AB')
		expect(cells.find((c) => c.label === 'Approved')?.value).toBe('—')
		expect(cells.find((c) => c.label === 'Site')).toMatchObject({ value: '1-2-3 Chiyoda, Tokyo', wide: true })
		expect(fillTitleBlock(DEFAULT_TITLE_BLOCK, { checked: 'AB', site: 'x' })).toEqual(fillTitleBlock(DEFAULT_TITLE_BLOCK, {}))
	})
})

describe('logos from the Project details (Q68)', () => {
	it('fills a logo the template has no image for, keeps one it has', () => {
		const d = { logoUrl: 'client.png', companyLogoUrl: 'co.png', companyLogoHeightMm: 14 }
		const t = withDetails(undefined, d)!
		expect(t.logos?.company).toEqual({ src: 'co.png', h: 14 })
		expect(t.logos?.client?.src).toBe('client.png')
		const own = withDetails({ ...DEFAULT_TITLE_BLOCK, logos: { company: { src: 'own.png', h: 8 } } }, d)!
		expect(own.logos?.company).toEqual({ src: 'own.png', h: 8 })
		expect(own.logos?.client?.src).toBe('client.png')
	})
	it('no logos in the details changes nothing', () => {
		expect(withDetails(DEFAULT_TITLE_BLOCK, { client: 'A' })).toBe(DEFAULT_TITLE_BLOCK)
	})
})
