// The agent guide (/cad/agent) lists every tool, key and how-to, so it can't fall behind the app.
import { describe, it, expect } from 'vitest'
import { agentGuide } from './agentGuide'
import { TOOL_GROUPS } from './toolGroups'
import { SHORTCUTS, FKEYS, HOWTO } from './helpContent'

describe('agentGuide', () => {
	const g = agentGuide()
	it('names every tool, key and how-to', () => {
		for (const t of TOOL_GROUPS.flatMap((x) => x.tools)) expect(g, t.label).toContain(`**${t.label}**`)
		for (const [l] of [...SHORTCUTS, ...FKEYS.map(([k, l]) => [l, k])]) expect(g, l).toContain(l.replace(/\|/g, '\|'))
		for (const h of HOWTO) expect(g, h.q).toContain(`**${h.q}**`)
	})
	it('explains the URL, typed points and the ground rules', () => {
		expect(g).toMatch(/\/projects\/<projectId>\/cad\?level=/)
		expect(g).toMatch(/y goes DOWN/)
		expect(g).toMatch(/Ask the user before/)
	})
})
