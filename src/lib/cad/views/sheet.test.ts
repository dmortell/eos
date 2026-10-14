// Sheets (Phase 4.1): paper at true size, viewports drawing their view at 1:N into a clipped window.
import { describe, it, expect } from 'vitest'
import { sheetDisplayList, sheetLook, paperSize, toPaper, defaultViewport, sheetTitleBlock, drawingArea, sectionViewport, paperViewport, fitViewport, viewportContent, viewportLayers } from './sheet'
import { PAPER_PAD } from './paper'
import { DEFAULT_TITLE_BLOCK, type ProjectDetails } from '../domain/titleBlock'
import { BUILTIN_BLOCKS } from '../domain/blocks'
import { ProjectIndex } from '../domain/project'
import { demoProject } from '../domain/fixtures'
import type { Entity, Sheet } from '../domain/drawing'
import type { Shape } from '../domain/shapes'

const sheet = (extra: Partial<Sheet> = {}): Sheet => ({ type: 'sheet', id: 'SH', number: 'S-001', title: 'Plan', order: 1, paper: { size: 'A3', orientation: 'landscape', marginMm: 10 }, viewports: [], status: 'active', ...extra })
const ix = () => new ProjectIndex(demoProject())

describe('revision clouds on a sheet (W20)', () => {
	const cloud = (id: string, rev?: string) => ({ type: 'shape', id, sheetId: 'SH', geom: { kind: 'cloud', pts: [{ x: 50, y: 50 }, { x: 90, y: 50 }, { x: 90, y: 80 }], ...(rev ? { rev } : {}) } }) as Shape
	const drawn = (s: Sheet) => sheetDisplayList(new ProjectIndex([...demoProject(), cloud('A1', 'A'), cloud('B1', 'B'), cloud('N')]), s).filter((p) => p.src && ['A1', 'B1', 'N'].includes(p.src))
	it('each tagged cloud has its delta: a triangle and its code; an older revision’s cloud hides once a later one is issued', () => {
		const onB = drawn(sheet({ revisions: [{ code: 'A', date: '2026-10-01' }] }))
		expect([...new Set(onB.map((p) => p.src))].sort()).toEqual(['A1', 'B1', 'N'])   // A is the last issued, B the draft
		expect(onB.filter((p) => p.k === 'text').map((p) => p.k === 'text' && p.text).sort()).toEqual(['A', 'B'])
		const afterB = drawn(sheet({ revisions: [{ code: 'A', date: '2026-10-01' }, { code: 'B', date: '2026-10-15' }] }))
		expect([...new Set(afterB.map((p) => p.src))].sort()).toEqual(['B1', 'N'])
	})
})

describe('sheets', () => {
	it('a faceplate put in an elevation viewport shows its front there, at the viewport’s scale (70 mm wide at 1:20 = 3.5 mm)', () => {
		const vp = { id: 'V', view: { levelId: 'L33', spec: { kind: 'elevation' as const, dir: 'front' as const } }, rect: { x: 20, y: 20, w: 200, h: 150 }, scale: 20, centre: { x: 0, y: 0 } }
		const ins = { type: 'shape', id: 'F', sheetId: 'SH', vpId: 'V', geom: { kind: 'insert', blockId: 'builtin:faceplate-power-2', at: { x: 0, y: -1200 } } } as Shape
		const blocks = (id: string) => BUILTIN_BLOCKS.find((b) => b.id === id)
		const plate = sheetDisplayList(new ProjectIndex([...demoProject(), ins]), sheet({ viewports: [vp] }), { blocks }).filter((p) => p.src === 'F' && p.k === 'line' && p.closed)
		const w = (p: (typeof plate)[number]) => (p.k === 'line' ? Math.max(...p.pts.map((q) => q.x)) - Math.min(...p.pts.map((q) => q.x)) : 0)
		expect(plate.map(w).map((x) => Math.round(x * 10) / 10)).toEqual([3.5, 2.5])   // the plate, its frame
	})
	it('a numbered viewport shows its number in a small circle above its top-left corner; an unnumbered one shows none', () => {
		const vp = { id: 'V', view: { levelId: 'L33', spec: { kind: 'plan' as const } }, rect: { x: 40, y: 50, w: 200, h: 150 }, scale: 100, centre: { x: 0, y: 0 } }
		const tag = (v: typeof vp & { number?: string }) => sheetDisplayList(ix(), sheet({ viewports: [v] })).filter((p) => (p.k !== 'image' && p.cls === 'viewport-no') || (p.k === 'text' && p.text === '3'))
		expect(tag(vp)).toEqual([])
		const t = tag({ ...vp, number: ' 3 ' })
		expect(t.map((p) => p.k)).toEqual(['circle', 'text'])
		expect(t[0]).toMatchObject({ c: { x: 44, y: 46 } })
	})
	it('A3 landscape is 420 × 297 mm; the paper and its margin are drawn', () => {
		expect(paperSize(sheet())).toEqual({ w: 420, h: 297 })
		expect(paperSize(sheet({ paper: { size: 'A1', orientation: 'portrait', marginMm: 10 } }))).toEqual({ w: 594, h: 841 })
		expect(sheetDisplayList(ix(), sheet()).slice(0, 2).map((p) => p.k === 'line' && p.cls)).toEqual(['paper', 'paper-margin'])
	})
	it('a section viewport is titled "SECTION A-A" by itself (plain hyphen); a typed label wins', () => {
		const cut = { type: 'section', id: 'X', levelId: 'L33', name: 'B', a: { x: 0, y: 0 }, b: { x: 5000, y: 0 }, depth: 3000 } as const
		const i = new ProjectIndex([...demoProject(), cut])
		const vp = { id: 'V', view: { levelId: 'L33', spec: { kind: 'section' as const, sectionId: 'X' } }, rect: { x: 20, y: 20, w: 200, h: 150 }, scale: 50, centre: { x: 0, y: 0 } }
		const label = (v: typeof vp & { label?: string }) => sheetDisplayList(i, sheet({ viewports: [v] })).find((p) => p.k === 'text' && p.cls === 'viewport-label')
		expect(label(vp)).toMatchObject({ text: 'SECTION B-B  1:50' })
		expect(label({ ...vp, label: 'Riser cut' })).toMatchObject({ text: 'Riser cut  1:50' })
	})
	it('a section dropped on a sheet: the largest scale that fits the drawing area, sized to the cut, centred on it', () => {
		const cut = { type: 'section', id: 'X', levelId: 'L33', name: 'B', a: { x: 0, y: 0 }, b: { x: 5000, y: 0 }, depth: 3000 } as const
		const i = new ProjectIndex([...demoProject(), cut])
		const s = sheet(), a = drawingArea(i, s)
		const vp = sectionViewport(i, s, 'X', 'L33', 'V')
		expect(vp.view.spec).toEqual({ kind: 'section', sectionId: 'X' })
		expect(vp.scale).toBeGreaterThanOrEqual(20)
		expect(vp.rect.w).toBeLessThanOrEqual(a.w - 10)
		expect(vp.rect.h).toBeLessThanOrEqual(a.h - 10)
		// one step closer in would not fit (else it would have been taken)
		const closer = [20, 25, 50, 100, 200].filter((n) => n < vp.scale).at(-1)
		if (closer) expect(vp.rect.w * vp.scale / closer > a.w - 10 || vp.rect.h * vp.scale / closer > a.h - 10).toBe(true)
	})
	it('a cloud tied to a viewport scales with its content (Alt+wheel); its bumps stay paper-sized', () => {
		const vp = (scale: number) => ({ id: 'V', view: { levelId: 'L33', spec: { kind: 'plan' as const } }, rect: { x: 20, y: 20, w: 200, h: 150 }, scale, centre: { x: 3000, y: 4000 } })
		const cloud: Shape = { type: 'shape', id: 'C', sheetId: 'SH', vpId: 'V', geom: { kind: 'cloud', pts: [{ x: 3000, y: 4000 }, { x: 5000, y: 4000 }, { x: 5000, y: 6000 }, { x: 3000, y: 6000 }] } }
		const box = (scale: number) => {
			const sh = sheet({ viewports: [vp(scale)] })
			const pts = sheetDisplayList(new ProjectIndex([...demoProject(), sh, cloud]), sh).flatMap((p) => (p.src === 'C' && p.k === 'line' ? p.pts : []))
			const xs = pts.map((q) => q.x)
			return { w: Math.max(...xs) - Math.min(...xs), n: pts.length }
		}
		const a = box(100), b = box(200)
		expect(a.w).toBeCloseTo(20 + 2 * 3, 0)         // 2 m at 1:100 = 20 mm, + 3 mm bumps each side
		expect(b.w).toBeLessThan(a.w * 0.6)            // at 1:200 about half
		expect(b.n).toBeLessThan(a.n)                  // fewer 6 mm bumps round a smaller outline
		// and it's clipped to the viewport's window like the view (zoomed in, it mustn't fly off the page)
		const sh = sheet({ viewports: [vp(10)] })
		const c = sheetDisplayList(new ProjectIndex([...demoProject(), sh, cloud]), sh).find((p) => p.src === 'C')
		expect(c?.clip).toEqual({ x0: 20, y0: 20, x1: 220, y1: 170 })
	})
})

describe('notes follow the layer rules (Q41)', () => {
	const vp = (frozen?: string[]) => ({ id: 'V', view: { levelId: 'L33', spec: { kind: 'plan' as const } }, rect: { x: 20, y: 20, w: 200, h: 150 }, scale: 100, centre: { x: 3000, y: 4000 }, ...(frozen ? { frozen } : {}) })
	const text = (id: string, vpId?: string): Shape => ({ type: 'shape', id, sheetId: 'SH', ...(vpId ? { vpId } : {}), geom: { kind: 'text', at: { x: 3000, y: 4000 }, text: 'Hi', sizeMm: 2.5 } } as Shape)
	const has = (sh: Sheet, t: Shape, o = {}) => sheetDisplayList(new ProjectIndex([...demoProject(), sh, t]), sh, o).some((p) => p.src === t.id)
	it('a paper note hides with the sheet’s own layers; a tied note with its viewport’s only (Dave 2026-10-13)', () => {
		const sh = sheet({ viewports: [vp()] }), paper = text('N1'), tied = text('N2', 'V')
		expect(has(sh, paper)).toBe(true)
		expect(has({ ...sh, frozen: ['sys:notes'] }, paper)).toBe(false)
		expect(has(sh, tied)).toBe(true)
		expect(has({ ...sh, frozen: ['sys:notes'] }, tied)).toBe(true)   // the paper's list doesn't reach a viewport
		expect(has(sheet({ viewports: [vp(['sys:notes'])] }), tied)).toBe(false)
		expect(has(sheet({ viewports: [vp(['sys:notes'])] }), paper)).toBe(true)   // frozen in the viewport only: paper notes are not in it
	})
	it('viewportLayers: what a viewport draws on, hidden or not, and its tied notes (Dave 2026-10-14)', () => {
		const v = vp(['sys:outlets-low'])
		const sh = sheet({ viewports: [v] }), tied = { ...text('N2', 'V'), layerId: 'MINE' } as Shape
		const got = viewportLayers(new ProjectIndex([...demoProject(), sh, tied, { type: 'layer', id: 'MINE', name: 'Mine', order: 500 }]), sh, v)
		expect(got.has('sys:outlets-low')).toBe(true)    // hidden in it, still one of its layers
		expect(got.has('MINE')).toBe(true)
		expect(got.has('sys:port-labels')).toBe(false)   // a plan draws no rack port labels
	})
	it('a viewport’s content follows its own layers, not the model’s eye (Dave 2026-10-13)', () => {
		const shown = (v: ReturnType<typeof vp>) => { const sh = sheet({ viewports: [v] }); return viewportContent(new ProjectIndex([...demoProject(), sh]), v).length }
		const n = shown(vp())
		expect(n).toBeGreaterThan(0)
		expect(shown(vp(['sys:walls', 'sys:outlets-low']))).toBeLessThan(n)
		// and the PDF draws the same list as the screen: a layer hidden in the viewport doesn't print
		const sh = sheet({ viewports: [vp(['sys:sections'])] }), sec = { type: 'section', id: 'SEC', levelId: 'L33', name: 'A', a: { x: 1000, y: 4000 }, b: { x: 5000, y: 4000 }, depth: 2000 } as unknown as Entity
		const list = (s: Sheet) => sheetDisplayList(new ProjectIndex([...demoProject(), s, sec]), s)
		expect(list(sheet({ viewports: [vp()] })).some((p) => 'cls' in p && p.cls === 'section-line')).toBe(true)
		expect(list(sh).some((p) => 'cls' in p && p.cls === 'section-line')).toBe(false)
	})
	it('By-layer color: a note with no color of its own takes its layer’s', () => {
		const sh = sheet({ viewports: [vp()] }), n = { ...text('N1'), layerId: 'RED' } as Shape, tied = { ...text('N2', 'V'), layerId: 'RED' } as Shape
		const all = new ProjectIndex([...demoProject(), sh, n, tied, { type: 'layer', id: 'RED', name: 'Red', order: 500, color: '#dc2626' }])
		const list = sheetDisplayList(all, sh)
		expect(list.find((x) => x.src === 'N1')?.color).toBe('#dc2626')
		expect(list.find((x) => x.src === 'N2')?.color).toBe('#dc2626')
	})
})

describe('title block on a sheet (Pages model)', () => {
	const texts = (prims: ReturnType<typeof sheetDisplayList>) => prims.flatMap((p) => (p.k === 'text' ? [p.text] : []))
	it('a strip down the right, filled from the project and the sheet', () => {
		const s = sheet({ viewports: [{ id: 'V', view: { levelId: 'L33', spec: { kind: 'plan' } }, rect: { x: 20, y: 20, w: 200, h: 150 }, scale: 100, centre: { x: 0, y: 0 } }], titleBlock: { fields: { drawn: 'DM' } } })
		const tb = sheetTitleBlock(ix(), s, { projectName: 'Tower' })
		expect(tb.cells.map((c) => [c.label, c.value])).toContainEqual(['Scale', '1:100'])
		expect(tb.cells.map((c) => [c.label, c.value])).toContainEqual(['Drawn', 'DM'])
		const prims = sheetDisplayList(ix(), s, { projectName: 'Tower' })
		expect(texts(prims)).toEqual(expect.arrayContaining(['Tower', 'Plan', 'S-001', 'A3 L', '1:100']))
		const frame = prims.find((p) => p.k === 'line' && p.cls === 'tb-frame')
		expect(frame && frame.k === 'line' && Math.max(...frame.pts.map((q) => q.x))).toBe(410)   // up to the right margin
	})
	it('an imported date field shows until the sheet has a dated revision — then the revision’s date (Review 2 Q20)', () => {
		const date = (s: Sheet) => sheetTitleBlock(ix(), s).cells.find((c) => c.label === 'Date')?.value
		const old = { titleBlock: { fields: { date: '2025-03-01' } } }
		expect(date(sheet(old))).toBe('2025-03-01')
		expect(date(sheet({ ...old, revisions: [{ code: 'A', date: '' }] }))).toBe('2025-03-01')
		expect(date(sheet({ ...old, revisions: [{ code: 'A', date: '' }, { code: 'B', date: '2026-10-12' }] }))).toBe('2026-10-12')
	})
	it('fills in from the Project details: client, site address, company, and the author on a blank Drawn (Review 2 Q42)', () => {
		const details = { client: 'ACME Corp', address: '1-2-3 Shibuya', author: 'David Mortell', companyName: 'Journey', companyAddress: 'Tokyo' }
		const template = { fields: [...DEFAULT_TITLE_BLOCK.fields, { key: 'client' as const, label: 'Client' }, { key: 'site' as const, label: 'Site' }] }
		const cells = (s: Sheet, d: ProjectDetails = details, t: typeof template & { site?: string; company?: { name: string } } = template) =>
			Object.fromEntries(sheetTitleBlock(ix(), s, { template: t, details: d }).cells.map((c) => [c.label, c.kind === 'company' ? c.lines?.join(' / ') : c.value]))
		expect(cells(sheet())).toMatchObject({ Client: 'ACME Corp', Site: '1-2-3 Shibuya', Company: 'Journey / Tokyo', Drawn: 'DM' })
		// the sheet's / template's own win
		expect(cells(sheet({ titleBlock: { fields: { drawn: 'KT' } } }), details, { ...template, site: 'Site B', company: { name: 'Us' } })).toMatchObject({ Site: 'Site B', Company: 'Us', Drawn: 'KT' })
		// no author: who issued the latest revision; initials typed as the author stay as they are
		expect(cells(sheet({ revisions: [{ code: 'A', date: '2026-10-01', by: 'YS' }] }), { ...details, author: '' }).Drawn).toBe('YS')
		expect(cells(sheet(), { ...details, author: 'DM' }).Drawn).toBe('DM')
		expect(cells(sheet(), {}).Drawn).toBe('—')
	})
	it('a band along the bottom, or hidden on this sheet; new viewports stay clear of it', () => {
		const band = { fields: DEFAULT_TITLE_BLOCK.fields, layout: 'horizontal' as const }
		const a = drawingArea(ix(), sheet(), { template: band })
		expect(a.w).toBe(400)                                  // full width …
		expect(a.y + a.h).toBeLessThan(287)                    // … above the band
		const strip = drawingArea(ix(), sheet())
		expect(strip.x + strip.w).toBeLessThan(410)            // left of the strip
		expect(defaultViewport(ix(), sheet(), 'L33', 'V').rect.x + defaultViewport(ix(), sheet(), 'L33', 'V').rect.w).toBeLessThan(strip.x + strip.w)
		expect(texts(sheetDisplayList(ix(), sheet({ titleBlock: { hidden: true } })))).not.toContain('S-001')
	})
	it('the compact box sits in the bottom-right corner', () => {
		const prims = sheetDisplayList(ix(), sheet(), { template: { fields: DEFAULT_TITLE_BLOCK.fields, layout: 'compact' } })
		const f = prims.find((p) => p.k === 'line' && p.cls === 'tb-frame')!
		expect(f.k === 'line' && Math.min(...f.pts.map((q) => q.y))).toBeGreaterThan(150)
	})
	it('a viewport draws its view at 1:N into its window: model mm / N, centred, clipped', () => {
		const vp = { id: 'V', view: { levelId: 'L33', spec: { kind: 'plan' as const } }, rect: { x: 20, y: 20, w: 200, h: 150 }, scale: 100, centre: { x: 1000, y: 4000 } }
		const t = toPaper(vp)
		expect(t({ x: 1000, y: 4000 })).toEqual({ x: 120, y: 95 })          // the centre lands mid-window
		expect(t({ x: 2000, y: 4000 })).toEqual({ x: 130, y: 95 })          // 1000 mm of model = 10 mm of paper at 1:100
		const prims = sheetDisplayList(ix(), sheet({ viewports: [vp] }))
		const content = prims.filter((p) => p.clip)
		expect(content.length).toBeGreaterThan(3)
		expect(prims.findIndex((p) => p.k === 'line' && p.cls === 'viewport-bg')).toBeLessThan(prims.findIndex((p) => p.clip))   // background first
		expect(content.every((p) => !p.src)).toBe(true)                      // content isn't picked on the sheet …
		expect(prims.find((p) => p.k === 'line' && p.cls === 'viewport')).toMatchObject({ src: 'SH', sub: 'V' })   // … its window is
		expect(content[0].clip).toEqual({ x0: 20, y0: 20, x1: 220, y1: 170 })
	})
	it('a new viewport looks at the level’s content', () => {
		const vp = defaultViewport(ix(), sheet(), 'L33', 'V')
		expect(vp.scale).toBe(100)
		expect(Math.abs(vp.centre.x - 0)).toBeGreaterThan(100)              // not the origin: the demo outlets sit around x 1000–6000
	})
})

describe('a sheet draws with its own look (Dave 2026-10-12: per sheet, not the project)', () => {
	const base = { type: 'sheet', id: 'S', number: '1', title: 'T', order: 1, paper: { size: 'A3', orientation: 'landscape', marginMm: 5 }, viewports: [], status: 'active' } as Sheet
	it('its own B/W, usage colors and cord route win; absent = the project setting it was made under', () => {
		const project = { gray: true, byUsage: true, cords: 'channels' as const }
		expect(sheetLook(base, project)).toMatchObject(project)
		expect(sheetLook({ ...base, gray: false, outletColour: 'layer', cordRoute: 'straight' }, project)).toMatchObject({ gray: false, byUsage: false, cords: 'straight' })
	})
})

describe('paper viewports: a port grid, a patch schedule, a fill section (review R95)', () => {
	const texts = (prims: ReturnType<typeof sheetDisplayList>) => prims.flatMap((p) => (p.k === 'text' ? [p.text] : []))
	it('a patch schedule goes on at 1:1 in the drawing area’s corner, its rows on the paper, titled without a scale', () => {
		const s = sheet(), a = drawingArea(ix(), s)
		const vp = paperViewport(ix(), s, { levelId: 'L33', spec: { kind: 'schedule', table: 'patch', spaceId: 'SR-A' } }, 'V')
		expect(vp.scale).toBe(1)
		expect(vp.rect).toMatchObject({ x: a.x + 5, y: a.y + 5 })
		expect(fitViewport(ix(), vp)).toEqual({ scale: 1, centre: vp.centre })
		expect(toPaper(vp)({ x: 0, y: 0 })).toEqual({ x: vp.rect.x + PAPER_PAD, y: vp.rect.y + PAPER_PAD })   // its top-left just inside the window
		const prims = sheetDisplayList(ix(), sheet({ viewports: [vp] }))
		expect(texts(prims)).toEqual(expect.arrayContaining(['33-001.A', 'SW1-01', 'Patch schedule · IDF-A']))
		expect(prims.find((p) => p.k === 'text' && p.cls === 'viewport-label')).toMatchObject({ text: 'Patch schedule · IDF-A' })
		// every row fits the window it was sized to
		expect(viewportContent(ix(), vp).some((p) => p.k === 'text' && p.text.startsWith('…'))).toBe(false)
	})
	it('a schedule viewport continued from another starts where that one stops, however tall it is (Q67)', () => {
		const cords = Array.from({ length: 30 }, (_, i) => ({ type: 'cord', id: `CX${i}`, kind: 'patch', a: { on: 'P1', port: 5 + i, face: 'front' }, b: { on: 'SW1', port: 5 + i }, cableType: 'cat6a', colour: '#000', lengthM: 2, lengthLocked: false, status: 'installed' }))
		const i = new ProjectIndex([...demoProject(), ...cords] as never)
		const spec = { kind: 'schedule' as const, table: 'patch' as const, spaceId: 'SR-A' }
		const mk = (h: number) => {
			const a = { id: 'A', view: { levelId: 'L33', spec }, rect: { x: 10, y: 10, w: 300, h }, scale: 1, centre: { x: 0, y: 0 } }
			const b = { id: 'B', view: { levelId: 'L33', spec: { ...spec, after: 'A' } }, rect: { x: 10, y: 150, w: 300, h: 100 }, scale: 1, centre: { x: 0, y: 0 } }
			return [a, b]
		}
		const nums = (vps: ReturnType<typeof mk>, id: string) => viewportContent(i, vps.find((v) => v.id === id)!, { vps }).flatMap((p) => (p.k === 'text' && p.cls === 'legend-text' && p.at.x < 2 && /^\d+$/.test(p.text) ? [Number(p.text)] : []))
		for (const h of [60, 90]) {
			const vps = mk(h), a = nums(vps, 'A'), b = nums(vps, 'B')
			expect(a.length).toBeGreaterThan(0)
			expect(b[0]).toBe(a.at(-1)! + 1)   // no cord dropped or repeated, whatever the first one's height
		}
	})
	it('a rack’s port grid shows its panels’ port labels; it adds no scale to the title block', () => {
		const vp = { id: 'V', view: { levelId: 'L33', spec: { kind: 'ports' as const, rackId: 'R1' } }, rect: { x: 20, y: 20, w: 300, h: 100 }, scale: 1, centre: { x: 146, y: 46 } }
		const plan = { id: 'P', view: { levelId: 'L33', spec: { kind: 'plan' as const } }, rect: { x: 20, y: 130, w: 100, h: 100 }, scale: 100, centre: { x: 0, y: 0 } }
		const s = sheet({ viewports: [vp, plan] })
		expect(texts(sheetDisplayList(ix(), s))).toEqual(expect.arrayContaining(['A01 · Panel 1 · U40 · 24 ports', '33', '001', 'A01 port grid']))
		expect(sheetTitleBlock(ix(), s).cells.find((c) => c.label === 'Scale')?.value).toBe('1:100')
	})
	it('a {DATE} note reads fieldDate when given (issued sheets keep their issue date), else today (Q21)', () => {
		const note = { type: 'shape', id: 'N', sheetId: 'SH', geom: { kind: 'text', at: { x: 50, y: 50 }, text: 'Printed {DATE}', sizeMm: 3 } } as unknown as Shape
		const i = new ProjectIndex([...demoProject(), note])
		const txt = (o: object) => sheetDisplayList(i, sheet(), o).filter((p) => p.k === 'text').map((p) => (p.k === 'text' ? p.text : ''))
		expect(txt({ fieldDate: '2026-01-02' })).toContain('Printed 2026-01-02')
		expect(txt({})).not.toContain('Printed 2026-01-02')
	})
})
