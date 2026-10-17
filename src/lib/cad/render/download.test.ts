// File names for downloads: fileSafe, and (User 2026-10-15) the project's pattern, then the user's edit before saving.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { fileSafe, patternName, saveFile, setFileNamer, setFilePatterner, fileName } from './download'

describe('export file names', () => {
	afterEach(() => setFileNamer(null))
	it('the pattern fills {project} {what} {scope} {date}; an empty token takes its separator with it', () => {
		expect(patternName('{project} {what} {scope} {date}', 'Test Project', { what: 'Cable schedule', scope: 'L1' }, 'xlsx', '20261015')).toBe('Test_Project_Cable_schedule_L1_20261015.xlsx')
		expect(patternName('{project}-{what}-{scope}-{date}', 'Proj', { what: 'BOM' }, 'xlsx', '20261015')).toBe('Proj-BOM-20261015.xlsx')
		expect(patternName('', 'Proj', { what: 'BOM' }, 'xlsx')).toBeNull()   // no pattern: the export's own name
		// {revision} / {version}: the sheet's revision, the release number — left out (with their separator) when unknown
		expect(patternName('{project}-{what}-{revision}-R{version}', 'Proj', { what: 'S001', revision: 'C', version: '03' }, 'pdf')).toBe('Proj-S001-C-R03.pdf')
		expect(patternName('{project}-{what}-{revision}', 'Proj', { what: 'Cable schedule' }, 'xlsx')).toBe('Proj-Cable_schedule.xlsx')
	})
	it('saveFile asks the namer; its answer is saved (extension kept), a cancel saves nothing', async () => {
		const clicks: string[] = []
		vi.stubGlobal('URL', { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} })
		vi.stubGlobal('document', { createElement: () => ({ set download(n: string) { clicks.push(n) }, click: () => {} }) })
		setFileNamer(async (suggested) => `${suggested.replace('.xlsx', '')} edited`)
		expect(await saveFile('x', 'Patching.xlsx', 'type', { what: 'Patch schedule' })).toBe('Patching edited')
		expect(clicks).toEqual(['Patching edited.xlsx'])
		setFileNamer(async () => null)
		expect(await saveFile('x', 'Patching.xlsx', 'type')).toBeNull()
		expect(clicks).toHaveLength(1)
		vi.unstubAllGlobals()
	})
	it('removing an older pattern leaves the newer one in place (a hot reload: the old page unmounts after the new one mounted)', () => {
		const offOld = setFilePatterner(() => 'old.pdf'), offNew = setFilePatterner(() => 'new.pdf')
		offOld()
		expect(fileName('x.pdf')).toBe('new.pdf')
		offNew()
		expect(fileName('x.pdf')).toBe('x.pdf')
	})
})

describe('fileSafe', () => {
	it('keeps Japanese text and letters; replaces what Windows / macOS forbid (Q26)', () => {
		expect(fileSafe('東京オフィス 1F')).toBe('東京オフィス_1F')
		expect(fileSafe('Test Project: 1F/2F')).toBe('Test_Project_1F_2F')
		expect(fileSafe('a.b-c_d')).toBe('a.b-c_d')
		expect(fileSafe('///')).toBe('export')
	})
})
