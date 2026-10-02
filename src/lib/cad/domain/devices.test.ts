import { describe, it, expect } from 'vitest'
import { BUILTIN_DEVICE_TEMPLATES, deviceFromTemplate, templateFromDevice, placementProblem, firstFreeU } from './devices'
import type { Device, Rack } from './types'

const rack: Rack = { type: 'rack', id: 'R', levelId: 'L', spaceId: 'S', order: 0, name: 'A01', kind: 'cabinet', heightU: 42, widthMm: 600, depthMm: 1000 }
const tpl = (id: string) => BUILTIN_DEVICE_TEMPLATES.find((t) => t.id === id)!
const at = (id: string, u: number, face?: Device['face']) => ({ ...deviceFromTemplate(tpl(id), 'R', u, id, face), id })

describe('device templates', () => {
	it('a panel from a template is a 24-port panel on both faces with panel info', () => {
		const d = deviceFromTemplate(tpl('builtin:panel-24'), 'R', 40, 'PP1')
		expect(d).toMatchObject({ kind: 'panel', portCount: 24, face: 'both', heightU: 1, panel: { tier: 'low' } })
	})
	it('a switch numbers its ports column-major', () => {
		expect(deviceFromTemplate(tpl('builtin:switch-48'), 'R', 1, 'SW').portNumbering).toBe('column')
	})
	it('placing while looking at the rear mounts it at the rear', () => {
		expect(deviceFromTemplate(tpl('builtin:manager-1u'), 'R', 1, 'M', 'rear').face).toBe('rear')
	})
	it('save as template keeps the shape of the device, not its place', () => {
		const t = templateFromDevice(at('builtin:panel-48', 10), 'My 48')
		expect(t).toMatchObject({ name: 'My 48', kind: 'panel', portCount: 48, heightU: 1 })
		expect(t).not.toHaveProperty('u')
	})
})

describe('rack placement rules', () => {
	it('refuses a device that runs off the top of the rack', () => {
		expect(placementProblem(at('builtin:panel-48-2u', 42), rack, [])).toMatch(/does not fit/)
	})
	it('refuses an overlap on the same face, allows front-only + rear-only at one U', () => {
		const sw = at('builtin:switch-48', 20)
		expect(placementProblem(at('builtin:panel-24', 20), rack, [sw])).toMatch(/overlap/)
		expect(placementProblem(at('builtin:manager-1u', 20, 'rear'), rack, [sw])).toBeNull()
	})
	it('a vertical PDU never collides', () => {
		expect(placementProblem(at('builtin:pdu-v', 1), rack, [at('builtin:switch-48', 5)])).toBeNull()
	})
	it('the first free U is found from the top down', () => {
		const top = at('builtin:panel-24', 42)
		expect(firstFreeU(rack, [top], 1, 'front')).toBe(41)
		expect(firstFreeU(rack, [], 2, 'front')).toBe(41)
	})
})
