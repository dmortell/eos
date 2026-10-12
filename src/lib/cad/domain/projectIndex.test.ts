import { describe, it, expect } from 'vitest'
import { ProjectIndex } from './project'
import { demoProject } from './fixtures'

describe('ProjectIndex.ofType (Q59)', () => {
	const ents = demoProject(), ix = new ProjectIndex(ents)
	it('is every entity of the type, in order — what filtering all of them gave', () => {
		for (const t of new Set(ents.map((e) => e.type))) expect(ix.ofType(t)).toEqual(ents.filter((e) => e.type === t))
	})
	it('is empty for a type the project has none of', () => expect(ix.ofType('issue')).toEqual([]))
})
