// The workspace's KEYS (split out of CadShell): the active tool first, then typing a point, undo / redo, select all,
// group, F1 / F2 / F3 / F4 / F7 / F9, the windows, the drawing tabs (Alt+W, Alt+PgUp/PgDn, Alt+1…9, Alt+← / →), arrows
// nudge, Delete, Esc, Home / Shift+Home, PgUp / PgDn. Everything it acts on comes in `c` (like the menus' context).
import type { CadProject } from '../app/project.svelte'
import type { Workspace, ToolId } from '../app/workspace.svelte'
import type { WindowLayout } from '../app/windows.svelte'
import type { Panels } from '../app/panels.svelte'
import type { Tabs } from '../app/tabs.svelte'
import type ViewCanvas from './ViewCanvas.svelte'
import { labelKind } from '../domain/labelEdit'
import { composing, typingIn } from './keyGuards'
import type { Device } from '../domain/types'
import { duplicateViewports } from '../app/sheetActions'

/** Arrow keys nudge the selection (view directions: y down). */
export const ARROWS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }

export interface ShellKeyCtx {
	project: CadProject; ws: Workspace; layout: WindowLayout; panels: Panels; tabs: Tabs
	canvas: () => ViewCanvas | undefined
	activePane: () => number
	/** A cad dialog is open (ui/modals): its keys are its own. */
	dialogOpen(): boolean
	typePoint(first: string): void
	showHistory(ids: string[]): void
	groupKey(ungroup: boolean): void
	orderKey(how: 'forward' | 'backward' | 'front' | 'back'): void
	repeatDeviceEdit(): void
	help(keys: boolean): void
	closeTab(id: string): void
	showTab(id: string): void
	navPane(i: number, dir: -1 | 1): void
	toggleDrafting(k: 'snap' | 'osnap' | 'showGrid'): void
	deleteSelected(): void
	setTool(id: ToolId): void
	zoomSel(): void
	/** Ctrl+O: the Open project dialog. */
	openProject(): void
	/** Ctrl+P (User 2026-10-15): the open sheet as a PDF — else every sheet; the browser's own print never runs. */
	print(): void
	/** R / Shift+R: the selection turned 90° right / left (User 2026-10-15). */
	turn90(dir: 1 | -1): void
	/** F in a rack view: the other face (front ↔ rear); false = not a rack view. */
	flipFace(): boolean
}

/** Ctrl+] / Ctrl+[ by the CHARACTER typed (a JIS keyboard has "[" on the key US calls BracketRight), the key's place
 *  only when the character isn't known. */
function bracket(e: KeyboardEvent): ']' | '[' | null {
	if (e.key === ']' || e.key === '}') return ']'
	if (e.key === '[' || e.key === '{') return '['
	if (e.key.length === 1) return null
	return e.code === 'BracketRight' ? ']' : e.code === 'BracketLeft' ? '[' : null
}

/** Every key's label, once (review R85 step 2): the keyboard list below, the menus and the tooltips all show these. */
export const KEYS = {
	undo: 'Ctrl+Z', redo: 'Ctrl+Y', redoAlt: 'Ctrl+Shift+Z', cut: 'Ctrl+X', copy: 'Ctrl+C', paste: 'Ctrl+V', pasteAtCursor: 'Ctrl+Shift+V', duplicate: 'Ctrl+D',
	del: 'Delete', delAlt: 'Backspace', selectAll: 'Ctrl+A', group: 'Ctrl+G', ungroup: 'Ctrl+Shift+G',
	toFront: 'Ctrl+Shift+]', forward: 'Ctrl+]', backward: 'Ctrl+[', toBack: 'Ctrl+Shift+[',
	editLabel: 'F2', repeatDevice: 'F4', help: 'F1', keys: '?', osnap: 'F3', grid: 'F7', snap: 'F9',
	find: 'Ctrl+K', openProject: 'Ctrl+O', print: 'Ctrl+P', turnRight: 'R', turnLeft: 'Shift+R', hideAll: 'Ctrl+.', tables: 'Ctrl+,',
	closeTab: 'Alt+W', nextTab: 'Alt+PgDn', prevTab: 'Alt+PgUp', tabN: 'Alt+1…9', backView: 'Alt+←', fwdView: 'Alt+→',
	fit: 'Home', zoomSel: 'Shift+Home', zoomExt: 'Z E', zoomWin: 'Z W', zoomPrev: 'Z P', page: 'PgUp / PgDn', esc: 'Esc', flip: 'F', patch: 'P', link: 'L',
} as const

/** One keyboard command: what Help lists (`label`, `keys`, `group`) and what the shell does (`when` / `run`) — ONE list
 *  (review R85 step 1: the keys were defined in the handler and again, drifting, in Help). Order matters: the first
 *  whose `when` holds runs (as the old else-if chain did). `when` may do the job itself when it can only tell by
 *  trying (F flips only in a rack view). */
export interface KeyCommand {
	label: string
	keys: string
	group: 'Edit' | 'Drawing' | 'View' | 'Tabs' | 'Racks' | 'Function keys' | 'Help'
	when: (e: KeyboardEvent, c: ShellKeyCtx, k: string, mod: boolean) => boolean
	run: (e: KeyboardEvent, c: ShellKeyCtx, k: string) => void
}
const isPanel = (c: ShellKeyCtx, id: string) => { const d = c.project.index.get(id); return d?.type === 'device' && d.kind === 'panel' }
const pd = (e: KeyboardEvent) => e.preventDefault()
const patchable = (c: ShellKeyCtx, id: string) => { const d = c.project.index.get(id); return d?.type === 'device' && d.portCount > 0 && d.kind !== 'pdu' }

export const KEY_COMMANDS: KeyCommand[] = [
	{ label: 'Undo', keys: KEYS.undo, group: 'Edit', when: (e, _c, k, mod) => mod && k === 'z' && !e.shiftKey, run: (e, c) => { pd(e); c.showHistory(c.project.undo()) } },
	{ label: 'Redo', keys: `${KEYS.redo} · ${KEYS.redoAlt}`, group: 'Edit', when: (e, _c, k, mod) => mod && (k === 'y' || (k === 'z' && e.shiftKey)), run: (e, c) => { pd(e); c.showHistory(c.project.redo()) } },
	{ label: 'Select all in this view', keys: KEYS.selectAll, group: 'Edit', when: (_e, _c, k, mod) => mod && k === 'a', run: (e, c) => { pd(e); c.canvas()?.selectAll() } },
	{ label: 'Duplicate the picked viewports (with their views and notes)', keys: KEYS.duplicate, group: 'Edit', when: (_e, c, k, mod) => mod && k === 'd' && c.ws.pickedViewports.length > 0, run: (e, c) => { pd(e); duplicateViewports(c.project, c.ws) } },
	{ label: 'Group / Ungroup', keys: `${KEYS.group} / ${KEYS.ungroup}`, group: 'Edit', when: (_e, _c, k, mod) => mod && k === 'g', run: (e, c) => { pd(e); c.groupKey(e.shiftKey) } },
	// F2: edit the selected thing's words in place (a text, a leader, an outlet's label, a rack's name, a run's label)
	{ label: 'Edit the selected label in place (Tab / Shift+Tab: save, then the next / previous)', keys: `${KEYS.editLabel} · double-click`, group: 'Function keys', when: (e, c) => e.key === 'F2' && c.ws.selection.length === 1,
		run: (e, c) => { if (labelKind(c.project.index.get(c.ws.selection[0]))) { pd(e); c.ws.editText(c.ws.selection[0]) } } },
	{ label: 'Draw order: forward / to front · backward / to back', keys: `${KEYS.forward} / ${KEYS.toFront} · ${KEYS.backward} / ${KEYS.toBack}`, group: 'Edit', when: (e, _c, _k, mod) => mod && !!bracket(e),
		run: (e, c) => { pd(e); c.orderKey(bracket(e) === ']' ? (e.shiftKey ? 'front' : 'forward') : e.shiftKey ? 'back' : 'backward') } },
	{ label: 'Repeat the last device edit on the selected devices', keys: KEYS.repeatDevice, group: 'Function keys', when: (e) => e.key === 'F4', run: (e, c) => { pd(e); c.repeatDeviceEdit() } },
	// L with several panels selected: link all their ports, the top panel first — as Properties shows, even when the
	// click that started the selection also picked a port
	{ label: 'Link the selected panels’ ports (the top panel first)', keys: KEYS.link, group: 'Racks', when: (e, c, k, mod) => !mod && !e.altKey && k === 'l' && c.ws.selection.length > 1 && c.ws.selection.every((id) => isPanel(c, id)),
		run: (e, c) => { pd(e); c.ws.interconnectPanels(c.ws.selection.map((id) => c.project.index.get(id) as Device)) } },
	// P / L with ports selected: Patch to… / Link to… (a panel's) — then click the other device's first port
	{ label: 'Patch the selected ports to… (then click the first port on the other device)', keys: KEYS.patch, group: 'Racks', when: (e, c, k, mod) => !mod && !e.altKey && k === 'p' && !!c.ws.portSel, run: (e, c) => { pd(e); c.ws.patchFrom(c.ws.portSel!) } },
	{ label: 'Patch all the selected device’s ports to… (then click the first port on the other device; the cords are listed to OK first)', keys: KEYS.patch, group: 'Racks', when: (e, c, k, mod) => !mod && !e.altKey && k === 'p' && !c.ws.portSel && c.ws.selection.length === 1 && patchable(c, c.ws.selection[0]),
		run: (e, c) => { pd(e); c.ws.patchDevice(c.project.index.get(c.ws.selection[0]) as Device) } },
	{ label: 'Link the selected panel ports to… (then click the first port on the other panel)', keys: KEYS.link, group: 'Racks', when: (e, c, k, mod) => !mod && !e.altKey && k === 'l' && !!c.ws.portSel && isPanel(c, c.ws.portSel.on), run: (e, c) => { pd(e); c.ws.interconnectFrom(c.ws.portSel!) } },
	{ label: 'Rack view: the other face (front ↔ rear)', keys: KEYS.flip, group: 'Racks', when: (e, c, k, mod) => !mod && !e.altKey && !e.shiftKey && k === 'f' && c.flipFace(), run: (e) => pd(e) },
	{ label: 'Turn the selection 90° right (clockwise) / left', keys: `${KEYS.turnRight} / ${KEYS.turnLeft}`, group: 'Edit', when: (e, c, k, mod) => !mod && !e.altKey && k === 'r' && c.ws.toolId === 'select' && c.ws.selection.length > 0, run: (e, c) => { pd(e); c.turn90(e.shiftKey ? -1 : 1) } },
	{ label: 'Help', keys: KEYS.help, group: 'Function keys', when: (e) => e.key === 'F1', run: (e, c) => { pd(e); c.help(false) } },
	{ label: 'Find a level, view, sheet, room, rack, device, outlet', keys: KEYS.find, group: 'View', when: (_e, _c, k, mod) => mod && k === 'k', run: (e, c) => { pd(e); c.layout.open('navigator'); c.ws.navSearch++ } },
	{ label: 'Open another project', keys: KEYS.openProject, group: 'View', when: (_e, _c, k, mod) => mod && k === 'o', run: (e, c) => { pd(e); c.openProject() } },
	{ label: 'Print: the open sheet (else all sheets) as a PDF in a new browser tab', keys: KEYS.print, group: 'View', when: (_e, _c, k, mod) => mod && k === 'p', run: (e, c) => { pd(e); c.print() } },
	{ label: 'Keys and mouse (this list)', keys: KEYS.keys, group: 'Help', when: (e, _c, _k, mod) => e.key === '?' && !mod, run: (e, c) => { pd(e); c.help(true) } },
	{ label: 'Hide / show every window', keys: KEYS.hideAll, group: 'View', when: (e, _c, _k, mod) => mod && e.key === '.', run: (e, c) => { pd(e); c.layout.allHidden = !c.layout.allHidden } },
	{ label: 'Show / hide the tables', keys: KEYS.tables, group: 'View', when: (e, _c, _k, mod) => mod && e.key === ',', run: (e, c) => { pd(e); c.panels.toggle('bottom') } },
	{ label: 'Close the tab', keys: KEYS.closeTab, group: 'Tabs', when: (e, _c, k, mod) => e.altKey && !mod && (k === 'w' || e.code === 'KeyW'), run: (e, c) => { pd(e); const t = c.tabs.paneTab[c.activePane()]; if (t) c.closeTab(t) } },
	{ label: 'Next / previous tab', keys: `${KEYS.nextTab} / ${KEYS.prevTab}`, group: 'Tabs', when: (e, _c, _k, mod) => e.altKey && !mod && (e.key === 'PageUp' || e.key === 'PageDown'),
		run: (e, c) => { pd(e); const tabs = c.tabs, at = tabs.list.findIndex((t) => t.id === tabs.paneTab[c.activePane()]), n = tabs.list.length; if (n) c.showTab(tabs.list[(at + (e.key === 'PageDown' ? 1 : -1) + n) % n].id) } },
	{ label: 'Tab 1…9', keys: KEYS.tabN, group: 'Tabs', when: (e, _c, _k, mod) => e.altKey && !mod && /^Digit[1-9]$/.test(e.code), run: (e, c) => { pd(e); const t = c.tabs.list[Number(e.code.slice(5)) - 1]; if (t) c.showTab(t.id) } },
	{ label: 'Back / forward (views in this pane)', keys: `${KEYS.backView} / ${KEYS.fwdView}`, group: 'Tabs', when: (e) => e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight'), run: (e, c) => { pd(e); c.navPane(c.activePane(), e.key === 'ArrowLeft' ? -1 : 1) } },
	// the drafting switches (UX05)
	{ label: 'OSNAP: object snaps on / off', keys: KEYS.osnap, group: 'Function keys', when: (e) => e.key === 'F3', run: (e, c) => { pd(e); c.toggleDrafting('osnap') } },
	{ label: 'GRID: draw the grid', keys: KEYS.grid, group: 'Function keys', when: (e) => e.key === 'F7', run: (e, c) => { pd(e); c.toggleDrafting('showGrid') } },
	{ label: 'SNAP: grid snap on / off', keys: KEYS.snap, group: 'Function keys', when: (e) => e.key === 'F9', run: (e, c) => { pd(e); c.toggleDrafting('snap') } },
	{ label: 'Nudge the selection (× 10 with Shift)', keys: 'Arrow keys', group: 'Drawing', when: (e, c, _k, mod) => !!ARROWS[e.key] && !mod && c.ws.selection.length > 0,
		run: (e, c) => { pd(e); const a = ARROWS[e.key]; c.canvas()?.nudge(a[0], a[1], e.shiftKey) } },
	{ label: 'Delete the selection', keys: `${KEYS.del} · ${KEYS.delAlt}`, group: 'Edit', when: (e) => e.key === 'Delete' || e.key === 'Backspace', run: (_e, c) => c.deleteSelected() },
	{ label: 'Cancel · back to Select · deselect · leave a viewport', keys: `${KEYS.esc} (repeat)`, group: 'Drawing', when: (e) => e.key === 'Escape',
		run: (_e, c) => { const ws = c.ws; if (ws.confirm) ws.confirm = null; else if (ws.prompt) ws.prompt = null; else if (ws.toolId !== 'select') c.setTool('select'); else if (ws.selection.length || !ws.vpEdit) ws.select([]); else c.canvas()?.leaveViewport() } },
	{ label: 'Zoom to the selection', keys: KEYS.zoomSel, group: 'View', when: (e) => e.key === 'Home' && e.shiftKey, run: (_e, c) => c.zoomSel() },
	{ label: 'Zoom to fit', keys: `${KEYS.fit} · ${KEYS.zoomExt}`, group: 'View', when: (e) => e.key === 'Home', run: (_e, c) => c.canvas()?.zoomExtents() },
	// AutoCAD's ZOOM (User 2026-10-14): Z, then E / W / P — the second key is read in shellKey (ws.zoomChordAt)
	{ label: 'Zoom: Z, then E extents (fit) · W window (two clicks; EOS input: drag a box) · P previous (back through each zoom and pan)', keys: `${KEYS.zoomWin} · ${KEYS.zoomPrev}`, group: 'View',
		when: (e, _c, k, mod) => !mod && !e.altKey && k === 'z', run: (e, c) => { pd(e); c.ws.zoomChordAt = Date.now(); c.ws.say('Zoom: E extents · W window · P previous') } },
	{ label: 'Page up / down (sideways: Shift)', keys: KEYS.page, group: 'View', when: (e) => e.key === 'PageDown' || e.key === 'PageUp', run: (e, c) => { pd(e); c.canvas()?.page(e.key === 'PageDown' ? 1 : -1, e.shiftKey) } },
]

export function shellKey(e: KeyboardEvent, c: ShellKeyCtx): void {
	if (composing(e) || typingIn(e.target)) return
	// a dialog open: its keys are its own (Esc closes it); the drawing behind it gets none (Delete, Ctrl+Z, arrows …)
	if (c.dialogOpen()) return
	const { project } = c, canvas = c.canvas()
	const mod = e.ctrlKey || e.metaKey
	if (c.ws.zoomChordAt && !['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) {
		const fresh = Date.now() - c.ws.zoomChordAt < 5000, z = e.key.toLowerCase()
		c.ws.zoomChordAt = 0
		if (fresh && !mod && !e.altKey && (z === 'e' || z === 'w' || z === 'p' || e.key === 'Escape')) {
			e.preventDefault()
			if (z === 'e') canvas?.zoomExtents()
			else if (z === 'w') canvas?.zoomWindow()
			else if (z === 'p' && !canvas?.zoomPrevious()) c.ws.say('Zoom previous: nothing to go back to in this view')
			return
		}
	}
	if (e.key === 'Escape' && canvas?.cancelZoomWindow()) { e.preventDefault(); c.ws.say('Zoom window cancelled'); return }
	// mid-drag: Esc puts it back where it started; undo / redo / Delete wait for the drag to end (a nudge burst ends first)
	if (e.key === 'Escape' || e.key === 'Delete' || e.key === 'Backspace' || (mod && (e.key.toLowerCase() === 'z' || e.key.toLowerCase() === 'y'))) {
		canvas?.endNudge()
		if (project.store.busy) { e.preventDefault(); if (e.key === 'Escape') canvas?.cancel(); return }
	}
	if (project.store.busy && ARROWS[e.key]) { e.preventDefault(); return }   // a nudge mid-drag would fight the drag (Q40)
	if (!mod && canvas?.key(e)) { e.preventDefault(); return }   // the active tool first (Enter, Backspace, R …)
	if (!mod && /^[0-9@.\-]$/.test(e.key) && canvas?.takesTyping()) { e.preventDefault(); c.typePoint(e.key); return }
	// a cord half made: letters start its other end too ("SW2:10" — the S and W were shortcuts, User 2026-10-17)
	if (!mod && !e.altKey && /^[a-z]$/i.test(e.key) && c.ws.toolId === 'cord' && c.ws.patchFirst && canvas?.takesTyping()) { e.preventDefault(); c.typePoint(e.key); return }
	const k = e.key.toLowerCase()
	for (const cmd of KEY_COMMANDS) if (cmd.when(e, c, k, mod)) { cmd.run(e, c, k); return }
}
