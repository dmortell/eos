// Outlet symbols: the port count sits in the middle — white on a filled symbol, a halo on an outline one.
import { describe, it, expect } from 'vitest'
import { BUILTIN_BLOCKS } from '../domain/blocks'
import { blockPrims } from './blocks'

const count = (id: string, ports = '2') => {
	const b = BUILTIN_BLOCKS.find((x) => x.id === id)!
	const prims = blockPrims(b, { at: { x: 100, y: 200 } }, 1, { LABEL: 'A01', PORTS: ports, USAGE: '' }, 'o', 'outlet')
	return { t: prims.find((p) => p.k === 'text' && p.text === ports) as Extract<(typeof prims)[number], { k: 'text' }>, prims }
}

describe('outlet port counts', () => {
	it('are centred in the symbol', () => {
		for (const id of ['builtin:outlet-floor', 'builtin:outlet-box', 'builtin:outlet-ceiling', 'builtin:ap']) {
			const { t } = count(id)
			expect(t.anchor).toBe('middle')
			expect(t.at.x).toBe(100)
			expect(Math.abs(t.at.y - 200)).toBeLessThan(t.size * 0.5)
		}
	})
	it('are white on a filled symbol, two digits too; haloed on an outline one', () => {
		expect(count('builtin:outlet-floor', '12').t.cls).toContain('on-fill')
		expect(count('builtin:outlet-box').t.cls).toContain('on-fill')
		expect(count('builtin:outlet-wall').t.cls).toContain('on-fill')
		expect(count('builtin:outlet-ceiling').t.cls).toContain('port-count')
		expect(count('builtin:ap').t.cls).toContain('on-fill')
	})
	it('a cleared usage draws nothing', () => {
		expect(count('builtin:outlet-box').prims.filter((p) => p.k === 'text').map((p) => p.k === 'text' && p.text)).toEqual(['A01', '2'])
	})
})
