import { describe, it, expect } from 'vitest'
import { hash32, modelHash, sheetHash, nextVersion, isMajor, modelVersionState, issueProblems, sheetModels, sheetEditedSinceIssue, nextRevisionCode } from './versions'
import { newSheetDoc } from './mappers'
import type { Model } from '../3dview/types'
import type { PagesSheetDoc } from './schema'

const model = (over: Partial<Model> = {}): Model => ({ id: 'm1', name: '33F', objects: [], shapes: [{ id: 'r', type: 'rect', a: [0, 0], b: [1, 1] }], ...over })
const stamped = (v: string, over: Partial<Model> = {}) => { const m = model(over); return { ...m, version: v, versionHash: modelHash(m) } }
const frame = (seq: number, modelId?: string) => ({ id: `f${seq}`, seq, x: 0, y: 0, w: 1, h: 1, modelId, direction: 'plan', scale: '1:100', clip: null, border: 'solid' }) as PagesSheetDoc['frames'][number]
const sheet = (over: Partial<PagesSheetDoc> = {}): PagesSheetDoc => ({ ...newSheetDoc({ pid: 'P', id: 's', title: 'S', placeId: null, sortOrder: 0, user: 'u', now: 'n' }), ...over })

describe('versions', () => {
	it('numbers: the first save is 1.0; majors bump the whole number, minors the fraction', () => {
		expect(nextVersion(undefined, false)).toBe('1.0')
		expect(nextVersion('1.0', false)).toBe('1.1')
		expect(nextVersion('1.2', false)).toBe('1.3')
		expect(nextVersion('1.2', true)).toBe('2.0')
		expect([isMajor('2.0'), isMajor('2.1'), isMajor(undefined)]).toEqual([true, false, false])
		expect([nextRevisionCode(), nextRevisionCode('A'), nextRevisionCode('Z'), nextRevisionCode('AZ'), nextRevisionCode('ZZ')]).toEqual(['A', 'B', 'AA', 'BA', 'AAA'])
	})
	it('the content hash ignores management stamps + save time, and sees content edits', () => {
		expect(hash32('a')).toMatch(/^[0-9a-f]{8}$/)
		const m = model()
		expect(modelHash({ ...m, version: '3.0', archived: true, updatedAt: 'x' } as Model)).toBe(modelHash(m))
		expect(modelHash({ ...m, shapes: [] })).not.toBe(modelHash(m))
	})
	it('a model is ready to issue only at an unedited MAJOR version', () => {
		expect(modelVersionState(model())).toBe('unversioned')
		expect(modelVersionState(stamped('1.0'))).toBe('ready')
		expect(modelVersionState(stamped('1.1'))).toBe('minor')
		expect(modelVersionState({ ...stamped('1.0'), shapes: [] })).toBe('edited')
	})
	it('issuing lists every blocking model once; a ready sheet records each model version', () => {
		const s = sheet({ frames: [frame(1, 'm1'), frame(2, 'm1'), frame(3, 'm2'), frame(4)] })
		const zone = stamped('2.0', { id: 'm2', name: 'Zone' })
		const probs = issueProblems(s, [model(), zone])
		expect(probs).toEqual([{ modelId: 'm1', name: '33F', state: 'unversioned', version: undefined }])
		expect(issueProblems(s, [stamped('1.0')]).map((p) => [p.modelId, p.state])).toEqual([['m2', 'missing']])
		const ok = [stamped('1.0'), zone]
		expect(issueProblems(s, ok)).toEqual([])
		expect(sheetModels(s, ok)).toEqual([{ modelId: 'm1', name: '33F', version: '1.0' }, { modelId: 'm2', name: 'Zone', version: '2.0' }])
	})
	it('a sheet is "edited since issue" when its paper / frames changed after the last revision', () => {
		const s = sheet({ frames: [frame(1, 'm1')] })
		expect(sheetEditedSinceIssue(s)).toBe(false)   // never issued
		const issued = { ...s, latestRevisionCode: 'A', issuedHash: sheetHash(s) }
		expect(sheetEditedSinceIssue(issued)).toBe(false)
		expect(sheetEditedSinceIssue({ ...issued, frames: [frame(1, 'm2')] })).toBe(true)
	})
})
