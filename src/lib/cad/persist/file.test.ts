import { describe, it, expect } from 'vitest'
import { exportProject, readProjectFile } from './file'
import { demoProject } from '../domain/fixtures'

describe('project file', () => {
	it('round-trips a project through JSON', () => {
		const text = JSON.stringify(exportProject(demoProject(), { name: 'Demo' }))
		const { file, issues, error } = readProjectFile(text)
		expect(error).toBeUndefined()
		expect(issues).toEqual([])
		expect(file!.entities.length).toBe(demoProject().length)
	})
	it('refuses other JSON, newer versions and duplicate ids', () => {
		expect(readProjectFile('{"a":1}').error).toMatch(/Not an EOS/)
		expect(readProjectFile('nope').error).toMatch(/Not JSON/)
		expect(readProjectFile(JSON.stringify({ ...exportProject([]), version: 99 })).error).toMatch(/newer/)
		const [a] = demoProject()
		expect(readProjectFile(JSON.stringify(exportProject([a, a]))).issues.map((i) => i.code)).toContain('file-dup-id')
	})
})
