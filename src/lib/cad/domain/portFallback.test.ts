// Backlog 40: an unlabelled panel port is called by its rack, U and port ("R04-U33-P07") until it gets a label.
import { describe, it, expect } from 'vitest'
import { ProjectIndex } from './project'
import { demoProject } from './fixtures'
import type { Device, Rack } from './types'

describe('fallback labels for unlabelled panel ports (backlog 40)', () => {
	it('rack-U-port for an unlabelled panel port; nothing for a labelled one or a switch', () => {
		const ents = demoProject()
		const rack = ents.find((e): e is Rack => e.type === 'rack')!
		const panel: Device = { type: 'device', id: 'pX', name: 'PX', kind: 'panel', rackId: rack.id, u: 33, heightU: 1, portCount: 24, portLabels: { '1': 'A01' } } as Device
		const sw: Device = { ...panel, id: 'sX', kind: 'switch', u: 30, portLabels: {} }
		const ix = new ProjectIndex([...ents, panel, sw])
		expect(ix.portFallback({ on: 'pX', port: 7 })).toBe(`${rack.name}-U33-P07`)
		expect(ix.portFallback({ on: 'pX', port: 1 })).toBe('')
		expect(ix.portFallback({ on: 'sX', port: 7 })).toBe('')
		expect(ix.portLabel({ on: 'pX', port: 7 })).toBe('')   // never stored as its label
	})
})
