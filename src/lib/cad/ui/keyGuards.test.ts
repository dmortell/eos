// The guards the key handlers share.
import { describe, it, expect } from 'vitest'
import { askKey, typingIn } from './keyGuards'

/** A stand-in element: its tag, and the selectors `closest` finds it (or an ancestor) by. */
const el = (tagName: string, ...matches: string[]) => ({ tagName, closest: (sel: string) => (matches.some((m) => sel.includes(m)) ? {} : null) })
const field = el('INPUT', 'input'), box = el('DIV', 'alertdialog'), answerBtn = el('BUTTON', 'alertdialog'), body = el('BODY'), cell = el('DIV')

describe('key guards', () => {
	it('a field is being typed in: an input, a select, a text area, editable text', () => {
		expect(typingIn(field)).toBe(true)
		expect(typingIn(el('DIV', 'contenteditable'))).toBe(true)
		expect(typingIn(body)).toBe(false)
		expect(typingIn(null)).toBe(false)
	})
	it('Enter typed in a search, a cell or a field doesn’t say yes to the open question', () => {
		expect(askKey({ key: 'Enter', target: field })).toBe(null)
		expect(askKey({ key: 'Enter', target: cell })).toBe(null)   // a table, a tree row: their own Enter
	})
	it('Enter answers yes from the box or the page; on a focused answer the browser presses it', () => {
		expect(askKey({ key: 'Enter', target: body })).toBe('yes')
		expect(askKey({ key: 'Enter', target: box })).toBe('yes')
		expect(askKey({ key: 'Enter', target: answerBtn })).toBe(null)
	})
	it('Esc cancels the question unless a field is being typed in', () => {
		expect(askKey({ key: 'Escape', target: body })).toBe('cancel')
		expect(askKey({ key: 'Escape', target: answerBtn })).toBe('cancel')
		expect(askKey({ key: 'Escape', target: field })).toBe(null)
		expect(askKey({ key: 'x', target: body })).toBe(null)
	})
})
