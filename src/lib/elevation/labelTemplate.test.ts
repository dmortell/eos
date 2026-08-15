import { describe, it, expect } from 'vitest'
import { renderLabel, templateIssues, templateForLegacyFormat, portAlpha, templateExample } from './labelTemplate'
import type { LabelTemplateData } from './labelTemplate'

const d: LabelTemplateData = { floor: 1, zone: 'A', locationNumber: 23, serverRoom: 'B', port: 4, roomNumber: '1201', isHighLevel: false }

describe('renderLabel', () => {
	it('renders tokens with repetition padding and literals', () => {
		expect(renderLabel('"L"FF.Z.NNN-SPP', d)).toBe('L01.A.023-B04')
		expect(renderLabel('N', d)).toBe('23')
		expect(renderLabel('NNNNN', d)).toBe('00023')
	})

	it('quoted literals escape token letters', () => {
		expect(renderLabel('"PORT "PP', d)).toBe('PORT 04')
		expect(renderLabel('"FAN"-N', d)).toBe('FAN-23')
	})

	it('alpha port token', () => {
		expect(renderLabel('Z.NNN"."A', d)).toBe('A.023.D')
		expect(portAlpha(1)).toBe('A')
		expect(portAlpha(26)).toBe('Z')
		expect(portAlpha(27)).toBe('AA')
	})

	it('conditional groups drop when a token inside is empty', () => {
		expect(renderLabel('NNN[-H]', d)).toBe('023')
		expect(renderLabel('NNN[-H]', { ...d, isHighLevel: true })).toBe('023-H')
		expect(renderLabel('NNN[.R]', { ...d, roomNumber: undefined })).toBe('023')
		expect(renderLabel('NNN[.R]', d)).toBe('023.1201')
	})

	it('templateExample previews both variants', () => {
		const ex = templateExample('NNN[-H]')
		expect(ex.normal).toBe('023')
		expect(ex.highLevel).toBe('023-H')
	})
})

describe('templateIssues', () => {
	it('flags unclosed quotes/groups and token-free templates', () => {
		expect(templateIssues('"L"FF.Z.NNN-SPP')).toEqual([])
		expect(templateIssues('"abc')).toContain('Unclosed quote')
		expect(templateIssues('[NN')).toContain('Unclosed [ group')
		expect(templateIssues('NN]')).toContain('Unmatched ]')
		expect(templateIssues('"static"')).toContain('No tokens — every label would be identical')
	})
})

describe('templateForLegacyFormat', () => {
	// Byte-identical to engine.buildLabel for each separator preset
	it('legacy separator', () => {
		const t = templateForLegacyFormat({ separator: 'legacy', includeZone: true, includeRoom: false }, 'L01')
		expect(renderLabel(t, d)).toBe('L01.A.023-B04')
		expect(renderLabel(t, { ...d, isHighLevel: true })).toBe('L01.A.023-B04-H')
	})
	it('period separator with room', () => {
		const t = templateForLegacyFormat({ separator: 'period', includeZone: true, includeRoom: true }, 'L01')
		expect(renderLabel(t, d)).toBe('L01.A.1201.023.B04')
		expect(renderLabel(t, { ...d, roomNumber: undefined })).toBe('L01.A.023.B04')
	})
	it('hyphen separator without zone', () => {
		const t = templateForLegacyFormat({ separator: 'hyphen', includeZone: false, includeRoom: false }, 'L01')
		expect(renderLabel(t, d)).toBe('L01-023-B04')
		expect(renderLabel(t, { ...d, isHighLevel: true })).toBe('L01-023-B04-H')
	})
	it('floor format variants', () => {
		expect(renderLabel(templateForLegacyFormat({ separator: 'legacy', includeZone: true, includeRoom: false }, '01F'), d)).toBe('01F.A.023-B04')
		expect(renderLabel(templateForLegacyFormat({ separator: 'legacy', includeZone: true, includeRoom: false }, '01'), d)).toBe('01.A.023-B04')
	})
})
