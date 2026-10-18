// The browser's copy / cut / paste events → domain/clipboard. Text fields and selected page text keep the browser's
// own behaviour; otherwise the selection goes to the SYSTEM clipboard, so it pastes in another tab or project.
import type { CadProject } from './project.svelte'
import type { Workspace } from './workspace.svelte'
import type { Pt } from '../domain/types'
import { makeClip, makeViewportClip, parseClip, pasteClip, clipCentre } from '../domain/clipboard'
import { pastedNote, readableClip } from '../domain/pasteText'
import { deleteEntities, deleteImpact, deleteViewports, impactText } from '../editor/commands'
import type { Sheet } from '../domain/drawing'
import { pickPasted } from './sheetActions'

export interface ClipboardDeps {
	project: CadProject
	ws: Workspace
	/** The active pane's paste target (ViewCanvas.pasteTarget). */
	target(): { kind: 'level' | 'sheet' | 'rack'; id: string } | null | undefined
	/** A picture on the clipboard (a screenshot; backlog "Paste a screenshot or picture"): upload it and place it. */
	image?(file: File): void
	/** Text from another app: a text note at the pointer (ViewCanvas.pasteNote). False = this view takes no notes. */
	note?(t: { text: string; markdown: boolean }): boolean
	/** The active pane is a rack row (a paste there needs a rack under the mouse). */
	inRow(): boolean
	/** The pointer in the active pane, in the paste target's own points (plan / paper mm); null = not over it. */
	cursor?(): Pt | null
	/** A cad dialog is open (ui/modals): a paste is its own. */
	dialogOpen(): boolean
}

const typing = (t: EventTarget | null) => typeof Element !== 'undefined' && t instanceof Element && !!t.closest('input, select, textarea, [contenteditable]')
const items = (n: number) => `${n} item${n === 1 ? '' : 's'}`

/** Cut never asks (User): Undo brings it all back; the message says what a paste won't (links, cords). */
function cutNow(project: CadProject, ws: Workspace, ids: string[]): void {
	const i = deleteImpact(project.store, ids), lost = impactText({ ...i, devices: 0 })
	deleteEntities(project.store, ids)
	ws.select([])
	ws.say(`Cut ${items(ids.length)} — Ctrl+V pastes${lost ? `; their ${lost} don't come back with a paste (Undo does)` : ''}`)
}

/** cad's own copy beside the readable words that went to the clipboard (browsers share localStorage between tabs, so a
 *  paste in another tab or project still finds it). Used only while the clipboard still holds exactly those words. */
const STASH = 'cad.clip'
const same = (a: string, b: string) => a.replace(/\r\n?/g, '\n').trim() === b.replace(/\r\n?/g, '\n').trim()
type Stash = { words: string; json: string }
let kept: Stash | null = null   // this tab's copy, when localStorage is blocked
function stash(words: string, json: string): void {
	kept = words ? { words, json } : null
	try { if (words) localStorage.setItem(STASH, JSON.stringify(kept)); else localStorage.removeItem(STASH) } catch { /* private window: this tab only */ }
}
export function fromText(text: string): ReturnType<typeof parseClip> {
	const own = parseClip(text)
	if (own) return own
	let s = kept
	try { s = (JSON.parse(localStorage.getItem(STASH) ?? 'null') as Stash | null) ?? kept } catch { /* none */ }
	return s && text.trim() && same(s.words, text) ? parseClip(s.json) : null
}

export function clipboardEvents({ project, ws, target, inRow, image, note, cursor, dialogOpen }: ClipboardDeps) {
	// Ctrl+Shift+V (backlog "Paste at the cursor"): the paste event doesn't say Shift, so the key down before it does
	let atCursorUntil = 0
	function key(e: KeyboardEvent): void {
		if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') atCursorUntil = e.shiftKey ? Date.now() + 1000 : 0
	}
	/** Not the drawing's: a dialog open (as the shell keys, the drawing behind it is left alone — a cut or paste there
	 *  changed it unseen), or mid-drag (the store's gesture is open). */
	const notMine = (e: ClipboardEvent) => typing(e.target) || dialogOpen() || !!project.store?.busy
	function copy(e: ClipboardEvent, cut: boolean): void {
		if (notMine(e) || window.getSelection()?.toString() || !ws.selection.length) return
		// viewports picked on the selected sheet: they go with their views and tied notes
		const sheet = ws.selection.length === 1 && ws.viewportId ? project.index.getOf('sheet', ws.selection[0]) : undefined
		const vclip = sheet?.type === 'sheet' ? makeViewportClip(project.index, sheet.id, ws.pickedViewports, project.pid) : null
		if (sheet?.type === 'sheet' && vclip) {
			e.preventDefault()
			e.clipboardData?.setData('text/plain', JSON.stringify(vclip))
			const n = vclip.viewports!.length, what = n === 1 ? 'viewport' : `${n} viewports`
			if (cut) {
				deleteViewports(project.store, sheet, vclip.viewports!, true)
				ws.selectViewport(null)
				ws.say(`Cut ${what} — Ctrl+V pastes (Undo brings ${n === 1 ? 'it' : 'them'} back)`)
			}
			else ws.say(`Copied ${what} — Ctrl+V pastes (on a sheet: here, another sheet, tab or project)`)
			return
		}
		const clip = makeClip(project.index, ws.selection, project.pid)
		if (!clip) { ws.say('Copy takes plan items (shapes, outlets, racks), notes on a sheet, or devices'); return }
		// what was picked (a copied rack's devices come along with it)
		const racks = new Set(clip.items.filter((x) => x.type === 'rack').map((x) => x.id))
		const ids = clip.items.filter((x) => x.type !== 'device' || !racks.has(x.rackId)).map((x) => x.id)
		e.preventDefault()
		// other apps get the words (one per line); cad's own format waits beside it for a paste back in cad (see stash)
		const words = readableClip(clip.items), json = JSON.stringify(clip)
		e.clipboardData?.setData('text/plain', words || json)
		stash(words, json)
		if (cut) cutNow(project, ws, ids)
		else ws.say(`Copied ${items(ids.length)} — Ctrl+V pastes (here, another level, sheet, tab or project)`)
	}
	function paste(e: ClipboardEvent): void {
		if (notMine(e)) return
		const text = e.clipboardData?.getData('text/plain') ?? ''
		const clip = fromText(text)
		// no cad items, but a picture (a screenshot, an image copied in a browser): it goes in as an image
		const pic = clip ? undefined : [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'))
		if (pic && image) { e.preventDefault(); image(pic); return }
		if (!clip) {
			// text from another app (Word, Excel, a browser): a text note at the pointer; a table makes a markdown table
			if (!note) return
			const t = pastedNote(text, e.clipboardData?.getData('text/html') ?? '')
			if (!t) return
			e.preventDefault()
			putNote(t)
			return
		}
		e.preventDefault()
		pasteClipHere(clip)
	}
	function putNote(t: NonNullable<ReturnType<typeof pastedNote>>): void {
		if (note?.(t)) ws.say(t.markdown ? 'Pasted a table as a markdown note' : 'Pasted text as a note')
		else ws.say('Text pastes into a plan, an elevation, a section or a sheet')
	}
	/** Edit › Paste (no key, so no paste event): the clipboard's text read on request. False = nothing in it to paste. */
	function pasteText(text: string): boolean {
		const clip = fromText(text)
		if (clip) { pasteClipHere(clip); return true }
		const t = note ? pastedNote(text) : null
		if (!t) return false
		putNote(t)
		return true
	}
	function pasteClipHere(clip: NonNullable<ReturnType<typeof parseClip>>): void {
		const to = target()
		if (!to) { ws.say(inRow() ? 'Point at a rack, then paste: devices go into the rack under the mouse' : 'Paste into a plan, onto a sheet (notes), or into a rack (devices)'); return }
		// as-is: same place, same labels (User); Ctrl+Shift+V: its middle at the cursor
		const shifted = Date.now() < atCursorUntil
		atCursorUntil = 0
		const p = shifted && to.kind !== 'rack' ? cursor?.() : null, c = p ? clipCentre(clip) : null
		const d = p && c ? { x: Math.round(p.x - c.x), y: Math.round(p.y - c.y) } : undefined
		if (shifted && to.kind !== 'rack' && !d) ws.say('Point at where it goes, then Ctrl+Shift+V — pasted in place')
		const r = pasteClip(clip, { pid: project.pid, ix: project.index, to, d })
		if (r.problem) { ws.say(r.problem); return }
		const elsewhere = to.kind === 'sheet' ? 'only notes paste onto a sheet' : to.kind === 'rack' ? 'only devices paste into a rack' : 'notes and viewports paste onto a sheet, devices into a rack'
		if (!r.put.length) { ws.say(`Nothing here takes these — ${elsewhere}`); return }
		project.store.transact(r.viewports ? `Paste ${r.viewports.length === 1 ? 'viewport' : `${r.viewports.length} viewports`}` : `Paste ${items(r.select.length)}`, (tx) => r.put.forEach((x) => tx.put(x)), ws.selection)
		pickPasted(ws, r)
		if (r.skipped) ws.say(`${items(r.skipped)} left out — ${elsewhere}`)
	}
	return { copy: (e: ClipboardEvent) => copy(e, false), cut: (e: ClipboardEvent) => copy(e, true), paste, pasteText, key }
}
