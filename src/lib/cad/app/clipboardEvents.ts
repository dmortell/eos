// The browser's copy / cut / paste events → domain/clipboard. Text fields and selected page text keep the browser's
// own behaviour; otherwise the selection goes to the SYSTEM clipboard, so it pastes in another tab or project.
import type { CadProject } from './project.svelte'
import type { Workspace } from './workspace.svelte'
import { makeClip, parseClip, pasteClip } from '../domain/clipboard'
import { deleteEntities, deleteImpact, impactText } from '../editor/commands'

export interface ClipboardDeps {
	project: CadProject
	ws: Workspace
	/** The active pane's paste target (ViewCanvas.pasteTarget). */
	target(): { kind: 'level' | 'sheet'; id: string } | null | undefined
}

const typing = (t: EventTarget | null) => t instanceof Element && !!t.closest('input, select, textarea, [contenteditable]')
const items = (n: number) => `${n} item${n === 1 ? '' : 's'}`

/** Cut never asks (Dave): Undo brings it all back; the message says what a paste won't (links, cords). */
function cutNow(project: CadProject, ws: Workspace, ids: string[]): void {
	const i = deleteImpact(project.store, ids), lost = impactText({ ...i, devices: 0 })
	deleteEntities(project.store, ids)
	ws.select([])
	ws.say(`Cut ${items(ids.length)} — Ctrl+V pastes${lost ? `; their ${lost} don't come back with a paste (Undo does)` : ''}`)
}

export function clipboardEvents({ project, ws, target }: ClipboardDeps) {
	function copy(e: ClipboardEvent, cut: boolean): void {
		if (typing(e.target) || window.getSelection()?.toString() || !ws.selection.length) return
		const clip = makeClip(project.index, ws.selection, project.pid)
		if (!clip) { ws.say('Copy takes plan items (shapes, outlets, racks) or notes on a sheet'); return }
		const ids = clip.items.filter((x) => x.type !== 'device').map((x) => x.id)
		e.preventDefault()
		e.clipboardData?.setData('text/plain', JSON.stringify(clip))
		if (cut) cutNow(project, ws, ids)
		else ws.say(`Copied ${items(ids.length)} — Ctrl+V pastes (here, another level, sheet, tab or project)`)
	}
	function paste(e: ClipboardEvent): void {
		if (typing(e.target)) return
		const clip = parseClip(e.clipboardData?.getData('text/plain') ?? '')
		if (!clip) return
		e.preventDefault()
		const to = target()
		if (!to) { ws.say('Paste into a plan, or onto a sheet (notes)'); return }
		const r = pasteClip(clip, { pid: project.pid, ix: project.index, to })   // as-is: same place, same labels (Dave)
		const elsewhere = to.kind === 'sheet' ? 'plan items paste into a plan' : 'notes paste onto a sheet'
		if (!r.put.length) { ws.say(`Nothing here takes these — ${elsewhere}`); return }
		project.store.transact(`Paste ${items(r.select.length)}`, (tx) => r.put.forEach((x) => tx.put(x)))
		ws.select(r.select)
		if (r.skipped) ws.say(`${items(r.skipped)} left out — ${elsewhere}`)
	}
	return { copy: (e: ClipboardEvent) => copy(e, false), cut: (e: ClipboardEvent) => copy(e, true), paste }
}
