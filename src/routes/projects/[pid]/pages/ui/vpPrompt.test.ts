import { describe, it, expect } from 'vitest'
import { toolPrompt, imgModeText, statusLine, type PromptArgs } from './vpPrompt'

const base: PromptArgs = { tool: 'Select', n: 0, isPlan: true, isElev: false, guideSpace: true, guideVert: false, guideDelta: null, graphSelected: false, depthGuide: false }

describe('Viewport prompt / status line', () => {
	it('prompts per tool and draft progress', () => {
		expect(toolPrompt(base)).toBe('Click an element')
		expect(toolPrompt({ ...base, graphSelected: true })).toMatch(/^Drag a node to reshape/)
		expect(toolPrompt({ ...base, tool: 'Line', n: 1 })).toBe('Specify next point (Enter / double-click to finish)')
		expect(toolPrompt({ ...base, tool: 'Furniture', isPlan: false })).toBe('Switch to the plan view to place furniture')
		expect(toolPrompt({ ...base, tool: 'Frob' })).toBe('Frob tool')
	})
	it('guide prompt: orientation, spacing readout, no guide space in iso', () => {
		expect(toolPrompt({ ...base, tool: 'Guide', guideVert: true })).toMatch(/^Click to drop a vertical guide/)
		expect(toolPrompt({ ...base, tool: 'Guide', guideDelta: 1234.4 })).toMatch(/· Δ 1234 mm$/)
		expect(toolPrompt({ ...base, tool: 'Guide', guideSpace: false })).toBe('Guides are placed on a plan or elevation view')
	})
	it('graph tools: elevation depth hint, iso refusal', () => {
		expect(toolPrompt({ ...base, tool: 'Wall', isPlan: false, isElev: true, n: 2, depthGuide: true })).toBe('Specify next wall point (Enter / double-click to finish) — depth from the selected plan guide')
		expect(toolPrompt({ ...base, tool: 'Pipe', isPlan: false, isElev: true })).toMatch(/^Specify pipe start — no depth guide/)
		expect(toolPrompt({ ...base, tool: 'Trunk', isPlan: false })).toBe('Switch to a plan or elevation view to draw trunks')
	})
	it('image modes and the status precedence (text edit > inactive > image mode > section > tool)', () => {
		expect(imgModeText('scale', false, 1)).toBe('Scale · click the SECOND point of a known distance')
		expect(imgModeText('scale', true, 2)).toMatch(/enter the real distance/)
		expect(imgModeText(null, false, 0)).toBeNull()
		const s = { editingText: false, active: true, imgText: null, sectionSelected: false, tool: 'Line', prompt: 'Specify first point' }
		expect(statusLine(s)).toBe('Line · Specify first point')
		expect(statusLine({ ...s, active: false })).toBe('')
		expect(statusLine({ ...s, active: false, editingText: true })).toMatch(/^Editing text/)
		expect(statusLine({ ...s, imgText: 'X', sectionSelected: true })).toBe('X')
		expect(statusLine({ ...s, tool: 'Select', sectionSelected: true })).toMatch(/^Section selected/)
	})
})
