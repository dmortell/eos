// The browser's copy / cut / paste events → domain/clipboard. Text fields and selected page text keep the browser's
// own behaviour; otherwise the selection goes to the SYSTEM clipboard, so it pastes in another tab or project.
import type { CadProject } from './project.svelte'
import type { Workspace } from './workspace.svelte'
import type { Pt } from '../domain/types'
import { makeClip, parseClip, pasteClip, clipCentre } from '../domain/clipboard'
import { deleteEntities, deleteImpact, impactText } from '../editor/commands'

export interface ClipboardDeps {
	project: CadProject
	ws: Workspace
	/** The active pane's paste target (ViewCanvas.pasteTarget). */
	target(): { kind: 'level' | 'sheet' | 'rack'; id: string } | null | undefined
	/** A picture on the clipboard (a screenshot; backlog "Paste a screenshot or picture"): upload it and place it. */
	image?(file: File): void
	/** The active pane is a rack row (a paste there needs a rack under the mouse). */
	inRow(): boolean
	/** The pointer in the active pane, in the paste target's own points (plan / paper mm); null = not over it. */
	cursor?(): Pt | null
	/** A dialog is open (default: a [role=dialog] in the page). */
	dialogOpen?(): boolean
}

const typing = (t: EventTarget | null) => typeof Element !== 'undefined' && t instanceof Element && !!t.closest('input, select, textarea, [contenteditable]')
const anyDialog = () => typeof document !== 'undefined' && !!document.querySelector('[role=dialog]')
const items = (n: number) => `${n} item${n === 1 ? '' : 's'}`

/** Cut never asks (Dave): Undo brings it all back; the message says what a paste won't (links, cords). */
function cutNow(project: CadProject, ws: Workspace, ids: string[]): void {
	const i = deleteImpact(project.store, ids), lost = impactText({ ...i, devices: 0 })
	deleteEntities(project.store, ids)
	ws.select([])
	ws.say(`Cut ${items(ids.length)} — Ctrl+V pastes${lost ? `; their ${lost} don't come back with a paste (Undo does)` : ''}`)
}

export function clipboardEvents({ project, ws, target, inRow, image, cursor, dialogOpen = anyDialog }: ClipboardDeps) {
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
		const clip = makeClip(project.index, ws.selection, project.pid)
		if (!clip) { ws.say('Copy takes plan items (shapes, outlets, racks), notes on a sheet, or devices'); return }
		// what was picked (a copied rack's devices come along with it)
		const racks = new Set(clip.items.filter((x) => x.type === 'rack').map((x) => x.id))
		const ids = clip.items.filter((x) => x.type !== 'device' || !racks.has(x.rackId)).map((x) => x.id)
		e.preventDefault()
		e.clipboardData?.setData('text/plain', JSON.stringify(clip))
		if (cut) cutNow(project, ws, ids)
		else ws.say(`Copied ${items(ids.length)} — Ctrl+V pastes (here, another level, sheet, tab or project)`)
	}
	function paste(e: ClipboardEvent): void {
		if (notMine(e)) return
		const clip = parseClip(e.clipboardData?.getData('text/plain') ?? '')
		// no cad items, but a picture (a screenshot, an image copied in a browser): it goes in as an image
		const pic = clip ? undefined : [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'))
		if (pic && image) { e.preventDefault(); image(pic); return }
		if (!clip) return
		e.preventDefault()
		pasteClipHere(clip)
	}
	/** Edit › Paste (no key, so no paste event): the clipboard's text read on request. False = no cad items in it. */
	function pasteText(text: string): boolean {
		const clip = parseClip(text)
		if (!clip) return false
		pasteClipHere(clip)
		return true
	}
	function pasteClipHere(clip: NonNullable<ReturnType<typeof parseClip>>): void {
		const to = target()
		if (!to) { ws.say(inRow() ? 'Point at a rack, then paste: devices go into the rack under the mouse' : 'Paste into a plan, onto a sheet (notes), or into a rack (devices)'); return }
		// as-is: same place, same labels (Dave); Ctrl+Shift+V: its middle at the cursor
		const shifted = Date.now() < atCursorUntil
		atCursorUntil = 0
		const p = shifted && to.kind !== 'rack' ? cursor?.() : null, c = p ? clipCentre(clip) : null
		const d = p && c ? { x: Math.round(p.x - c.x), y: Math.round(p.y - c.y) } : undefined
		if (shifted && to.kind !== 'rack' && !d) ws.say('Point at where it goes, then Ctrl+Shift+V — pasted in place')
		const r = pasteClip(clip, { pid: project.pid, ix: project.index, to, d })
		if (r.problem) { ws.say(r.problem); return }
		const elsewhere = to.kind === 'sheet' ? 'only notes paste onto a sheet' : to.kind === 'rack' ? 'only devices paste into a rack' : 'notes paste onto a sheet, devices into a rack'
		if (!r.put.length) { ws.say(`Nothing here takes these — ${elsewhere}`); return }
		project.store.transact(`Paste ${items(r.select.length)}`, (tx) => r.put.forEach((x) => tx.put(x)), ws.selection)
		ws.select(r.select)
		if (r.skipped) ws.say(`${items(r.skipped)} left out — ${elsewhere}`)
	}
	return { copy: (e: ClipboardEvent) => copy(e, false), cut: (e: ClipboardEvent) => copy(e, true), paste, pasteText, key }
}
