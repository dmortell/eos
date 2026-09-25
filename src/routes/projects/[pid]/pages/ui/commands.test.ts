import { describe, it, expect } from 'vitest'
import { ALIASES, COMMANDS, matchCommands, parseCoord, readToken, tokenize, resolvePoint } from './commands'

describe('command line (Kestrel port)', () => {
	it('every name maps to one command; names are unique', () => {
		const seen = new Map<string, string>()
		for (const c of COMMANDS) for (const n of c.names.split('·').map((x) => x.trim().toUpperCase())) {
			expect(seen.get(n) ?? c.id, `${n} is used twice`).toBe(c.id); seen.set(n, c.id)
		}
		expect(ALIASES.get('L')).toBe('line'); expect(ALIASES.get('REC')).toBe('rect'); expect(ALIASES.get('Z')).toBe('fit')
	})
	it('suggests the exact alias first, then prefixes', () => {
		expect(matchCommands('re')[0].id).toBe('rect')
		expect(matchCommands('L')[0].id).toBe('line')
		expect(matchCommands('12,3')).toEqual([])
	})
	it('parses absolute, relative and polar coordinates', () => {
		expect(parseCoord('100,50')).toEqual({ p: [100, 50], rel: false, polar: false })
		expect(parseCoord('@25,-5')).toEqual({ p: [25, -5], rel: true, polar: false })
		const p = parseCoord('@100<90')!; expect(p.rel).toBe(true); expect(p.p[0]).toBeCloseTo(0); expect(p.p[1]).toBeCloseTo(100)
		expect(parseCoord('1,2,3')).toBeNull(); expect(parseCoord('abc')).toBeNull()
		expect(resolvePoint({ p: [10, 0], rel: true }, [100, 100])).toEqual([110, 100])
	})
	it('reads tokens in context; splits parts by ; and spaces', () => {
		expect(readToken('C', true)).toEqual({ kind: 'close' })
		expect(readToken('C', false)).toEqual({ kind: 'cmd', id: 'ellipse' })
		expect(readToken('2500', true)).toEqual({ kind: 'number', n: 2500 })
		expect(readToken('nope', false).kind).toBe('error')
		expect(tokenize('LINE 0,0 1000,0;  @0,500 ENTER')).toEqual(['LINE', '0,0', '1000,0', '@0,500', 'ENTER'])
	})
})
