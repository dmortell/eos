import { describe, it, expect } from 'vitest'
import { exportProject, readProjectFile, makeBackup } from './file'
import { demoProject } from '../domain/fixtures'

describe('project file', () => {
	it('round-trips a project through JSON', () => {
		const text = JSON.stringify(exportProject(demoProject(), { name: 'Demo' }))
		const { file, issues, error } = readProjectFile(text)
		expect(error).toBeUndefined()
		expect(issues).toEqual([])
		expect(file!.entities.length).toBe(demoProject().length)
	})
	it('backs up one model: its entities and the blocks they draw, with a crossing link kept as it is', () => {
		const all = demoProject().concat([
			{ type: 'level', id: 'L2', buildingId: 'B', number: 2, name: '2F', order: 2, elevationMm: 8000, heights: { slabMm: 200, raisedFloorMm: 300, clearHeightMm: 2700, plenumMm: 800 } },
			{ type: 'outlet', id: 'O7', levelId: 'L2', label: '02-001', tier: 'low', usage: 'desk', mount: 'floor', blockId: 'blk-mine', ports: [{ port: 1, label: '02-001.A', cableType: 'cat6a' }] },
			{ type: 'link', id: 'K7', kind: 'horizontal', a: { on: 'P1', port: 7, face: 'rear' }, b: { on: 'O7', port: 1 }, status: 'design' },
		])
		const blk = { type: 'block' as const, id: 'blk-mine', name: 'Mine', scope: 'global' as const, shapes: [] }
		const f = makeBackup(all, ['L2'], { project: { id: 'p', name: 'P' }, by: { uid: 'u', name: 'Dave' }, blockOf: (id) => (id === 'blk-mine' ? blk : undefined) })
		expect(f.entities.map((e) => e.id).sort()).toEqual(['K7', 'L2', 'O7'])
		expect(f.parts).toEqual(['L2'])
		expect(f.library?.blocks.map((b) => b.id)).toEqual(['blk-mine'])
		const back = readProjectFile(JSON.stringify(f))
		expect(back.error).toBeUndefined()
		expect(back.issues).toEqual([])   // K7's panel end is outside the file: not an error
		expect(makeBackup(all, 'all').parts).toBeUndefined()
	})
	it('refuses a damaged list of models', () => {
		expect(readProjectFile(JSON.stringify({ ...exportProject([]), parts: [1] })).error).toMatch(/models/)
	})
	it('refuses other JSON, newer versions and duplicate ids', () => {
		expect(readProjectFile('{"a":1}').error).toMatch(/Not an EOS/)
		expect(readProjectFile('nope').error).toMatch(/Not JSON/)
		expect(readProjectFile(JSON.stringify({ ...exportProject([]), version: 99 })).error).toMatch(/newer/)
		const [a] = demoProject()
		expect(readProjectFile(JSON.stringify(exportProject([a, a]))).issues.map((i) => i.code)).toContain('file-dup-id')
	})
})
