import { describe, it, expect } from 'vitest'
import { copiesDrawing } from './issueGuard'
import { underlayRef } from '../domain/issue'
import { splitChunks } from '../persist/chunks'

/** A frozen copy as cadIssued holds it: the head, then its list's JSON cut into parts of `size` characters. */
function frozen(head: string, fileIds: string[], size: number) {
	const prims = [{ k: 'line', pts: [] }, ...fileIds.map((f) => ({ k: 'image', url: underlayRef(f, 2), x: 0, y: 0, w: 1, h: 1 }))]
	return [{ id: head, json: undefined }, ...splitChunks(JSON.stringify(prims), size).map((json, i) => ({ id: `${head}~p${i}`, json }))]
}

describe('copiesDrawing: which frozen copies draw a file as a floorplan', () => {
	it('finds a reference cut between two parts (it was searched part by part)', () => {
		for (let size = 5; size < 40; size++) expect([...copiesDrawing(frozen('s1@A', ['plan.pdf'], size), 'plan.pdf')], `size ${size}`).toEqual(['s1@A'])
	})
	it('an id that only starts or ends the same is another file', () => {
		const docs = [...frozen('s1@A', ['plan.pdf2'], 7), ...frozen('s2@A', ['old-plan.pdf'], 7)]
		expect(copiesDrawing(docs, 'plan.pdf').size).toBe(0)
	})
	it('parts out of order are joined in order; a copy that can\'t be read keeps the file', () => {
		const docs = frozen('s1@A', ['plan.pdf'], 9).reverse()
		expect([...copiesDrawing(docs, 'plan.pdf')]).toEqual(['s1@A'])
		expect([...copiesDrawing([{ id: 's3@B~p0', json: '[{"k":' }], 'plan.pdf')]).toEqual(['s3@B'])
	})
})
