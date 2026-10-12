// Paste: cad items go in as before; a picture on the clipboard (a screenshot) goes to the image hook (backlog "Paste a
// screenshot or picture").
import { describe, it, expect } from 'vitest'
import { clipboardEvents } from './clipboardEvents'
import type { CadProject } from './project.svelte'
import type { Workspace } from './workspace.svelte'

const pasteEvent = (text: string, files: File[]) => {
	let prevented = false
	const e = { target: null, clipboardData: { getData: () => text, files }, preventDefault: () => { prevented = true } } as unknown as ClipboardEvent
	return { e, prevented: () => prevented }
}

describe('paste', () => {
	const said: string[] = []
	const ws = { say: (t: string) => said.push(t), selection: [] } as unknown as Workspace
	it('a picture with no cad items: handed to the image hook (and the browser\'s own paste stopped)', () => {
		const got: File[] = []
		const { paste } = clipboardEvents({ project: {} as CadProject, ws, target: () => null, inRow: () => false, image: (f) => got.push(f) })
		const pic = new File([new Uint8Array([1, 2, 3])], 'image.png', { type: 'image/png' }), ev = pasteEvent('', [pic])
		paste(ev.e)
		expect(got).toEqual([pic])
		expect(ev.prevented()).toBe(true)
	})
	it('plain text or another file: left to the browser', () => {
		const got: File[] = []
		const { paste } = clipboardEvents({ project: {} as CadProject, ws, target: () => null, inRow: () => false, image: (f) => got.push(f) })
		const ev = pasteEvent('hello', [new File(['x'], 'a.txt', { type: 'text/plain' })])
		paste(ev.e)
		expect(got).toEqual([])
		expect(ev.prevented()).toBe(false)
	})
	it('a dialog open, or mid-drag: cut and paste leave the drawing behind alone (the browser keeps the key)', () => {
		const got: File[] = []
		const pic = new File([new Uint8Array([1])], 'image.png', { type: 'image/png' })
		const sel = { say: () => {}, selection: ['s1'] } as unknown as Workspace
		const open = clipboardEvents({ project: {} as CadProject, ws: sel, target: () => null, inRow: () => false, image: (f) => got.push(f), dialogOpen: () => true })
		const ev = pasteEvent('', [pic])
		open.paste(ev.e)
		const cutEv = pasteEvent('', [])
		open.cut(cutEv.e)   // would read the selection and delete it — it returns first
		expect(got).toEqual([])
		expect(ev.prevented() || cutEv.prevented()).toBe(false)
		const busy = clipboardEvents({ project: { store: { busy: true } } as unknown as CadProject, ws, target: () => null, inRow: () => false, image: (f) => got.push(f), dialogOpen: () => false })
		busy.paste(pasteEvent('', [pic]).e)
		expect(got).toEqual([])
	})
})
