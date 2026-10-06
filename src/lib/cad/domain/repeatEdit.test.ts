// F4: repeat the last device edit on the selected devices.
import { describe, it, expect } from 'vitest'
import { repeatableEdit, repeatOn } from './repeatEdit'
import { BUILTIN_DEVICE_TEMPLATES, deviceFromTemplate } from './devices'
import type { Device, Rack } from './types'

const rack: Rack = { type: 'rack', id: 'R', levelId: 'L', spaceId: 'S', order: 0, name: 'A01', kind: 'cabinet', heightU: 42, widthMm: 600, depthMm: 1000 }
const tpl = (id: string) => BUILTIN_DEVICE_TEMPLATES.find((t) => t.id === id)!
const at = (id: string, u: number, name: string): Device => ({ ...deviceFromTemplate(tpl(id), 'R', u, name), id: name })

describe('F4 repeat', () => {
	it('repeats a field change on other devices, not the name or the U', () => {
		const a = at('builtin:panel-24', 10, 'PP1'), b = at('builtin:panel-24', 20, 'PP2')
		expect(repeatableEdit(a, 'Rename device', { name: 'X' })).toBeNull()
		expect(repeatableEdit(a, 'Move device', { u: 5 })).toBeNull()
		const e = repeatableEdit(a, 'Device maker', { maker: 'Panduit' })!
		expect(e.apply(b)).toEqual({ maker: 'Panduit' })
	})
	it('a panel change carries only the changed sub-field (the other panel keeps its own labels)', () => {
		const a = { ...at('builtin:panel-24', 10, 'PP1'), panel: { tier: 'low' as const, labelsPrintedAt: 1 } }
		const b = { ...at('builtin:panel-24', 20, 'PP2'), panel: { tier: 'low' as const, labelsPrintedAt: 2 } }
		const e = repeatableEdit(a, 'Panel tier', { panel: { ...a.panel, tier: 'high' } })!
		expect(e.apply(b).panel).toEqual({ tier: 'high', labelsPrintedAt: 2 })
	})
	it('skips a device the change would make overlap, with why; one undo step for the rest', () => {
		const a = at('builtin:panel-24', 10, 'PP1'), b = at('builtin:panel-24', 20, 'PP2'), c = at('builtin:panel-24', 21, 'PP3')
		const e = repeatableEdit(a, 'Device height', { heightU: 2 })!
		const r = repeatOn(e, [a, b], [a, b, c], () => rack)
		expect(r.next.map((d) => d.id)).toEqual(['PP1'])
		expect(r.skipped[0]).toMatch(/^PP2: /)
	})
})
