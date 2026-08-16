import { describe, it, expect } from 'vitest'
import { bootstrapLinks, linkIdFor, isLocationEnd, type StructuredLink } from './links'

const devices = [{ id: 'dev-1' }, { id: 'dev-2' }]
const baked = {
	'dev-1:1': { label: 'L01.A.001-A01', locationId: 'LA1', port: 1 },
	'dev-1:2': { label: 'L01.A.001-A02', locationId: 'LA1', port: 2 },
	'dev-9:1': { label: 'GHOST', locationId: 'LA2', port: 1 }, // unknown device
	'dev-2:5': { label: 'custom' }, // baked string without a structural link
}

describe('bootstrapLinks', () => {
	it('creates outlet-run links from baked assignments with deterministic ids', () => {
		const { links, changed } = bootstrapLinks(baked as any, null, devices)
		expect(changed).toBe(true)
		expect(Object.keys(links).sort()).toEqual(['SL-dev-1-1', 'SL-dev-1-2'])
		const l = links[linkIdFor('dev-1', 1)]
		expect(l.kind).toBe('outlet-run')
		expect(l.a).toEqual({ deviceId: 'dev-1', portIndex: 1 })
		expect(isLocationEnd(l.b) && l.b.locationId).toBe('LA1')
		expect(l.status).toBe('design')
	})

	it('is idempotent and never overwrites existing links', () => {
		const existing: Record<string, StructuredLink> = {
			'SL-dev-1-1': {
				id: 'SL-dev-1-1', kind: 'outlet-run',
				a: { deviceId: 'dev-1', portIndex: 1 },
				b: { locationId: 'DIFFERENT', port: 9 },
				status: 'installed', cableType: 'cat6a',
			},
		}
		const r1 = bootstrapLinks(baked as any, existing, devices)
		expect(isLocationEnd(r1.links['SL-dev-1-1'].b) && (r1.links['SL-dev-1-1'].b as any).locationId).toBe('DIFFERENT')
		expect(r1.links['SL-dev-1-1'].status).toBe('installed')
		// second run over its own output changes nothing
		const r2 = bootstrapLinks(baked as any, r1.links, devices)
		expect(r2.changed).toBe(false)
		expect(r2.links).toEqual(r1.links)
	})

	it('a manually-covered endpoint (e.g. a tie) is not re-linked', () => {
		const existing: Record<string, StructuredLink> = {
			'tie-1': {
				id: 'tie-1', kind: 'tie',
				a: { deviceId: 'dev-1', portIndex: 2 },
				b: { deviceId: 'dev-2', portIndex: 7 },
				status: 'design',
			},
		}
		const { links } = bootstrapLinks(baked as any, existing, devices)
		expect(links['SL-dev-1-2']).toBeUndefined() // dev-1:2 already covered by the tie
		expect(links['SL-dev-1-1']).toBeDefined()
	})
})
