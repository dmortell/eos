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
import type { Device } from '../domain/types'

/** Arrow keys nudge the selection (view directions: y down). */
export const ARROWS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }

export interface ShellKeyCtx {
	project: CadProject; ws: Workspace; layout: WindowLayout; panels: Panels; tabs: Tabs
	canvas: () => ViewCanvas | undefined
	activePane: () => number
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

export const KEY_COMMANDS: KeyCommand[] = [
	{ label: 'Undo', keys: 'Ctrl+Z', group: 'Edit', when: (e, _c, k, mod) => mod && k === 'z' && !e.shiftKey, run: (e, c) => { pd(e); c.showHistory(c.project.undo()) } },
	{ label: 'Redo', keys: 'Ctrl+Y · Ctrl+Shift+Z', group: 'Edit', when: (e, _c, k, mod) => mod && (k === 'y' || (k === 'z' && e.shiftKey)), run: (e, c) => { pd(e); c.showHistory(c.project.redo()) } },
	{ label: 'Select all in this view', keys: 'Ctrl+A', group: 'Edit', when: (_e, _c, k, mod) => mod && k === 'a', run: (e, c) => { pd(e); c.canvas()?.selectAll() } },
	{ label: 'Group / Ungroup', keys: 'Ctrl+G / Ctrl+Shift+G', group: 'Edit', when: (_e, _c, k, mod) => mod && k === 'g', run: (e, c) => { pd(e); c.groupKey(e.shiftKey) } },
	// F2: edit the selected thing's words in place (a text, a leader, an outlet's label, a rack's name, a run's label)
	{ label: 'Edit the selected label in place (Tab / Shift+Tab: save, then the next / previous)', keys: 'F2 · double-click', group: 'Function keys', when: (e, c) => e.key === 'F2' && c.ws.selection.length === 1,
		run: (e, c) => { if (labelKind(c.project.index.get(c.ws.selection[0]))) { pd(e); c.ws.editText(c.ws.selection[0]) } } },
	{ label: 'Draw order: forward / to front · backward / to back', keys: 'Ctrl+] / Ctrl+Shift+] · Ctrl+[ / Ctrl+Shift+[', group: 'Edit', when: (e, _c, _k, mod) => mod && !!bracket(e),
		run: (e, c) => { pd(e); c.orderKey(bracket(e) === ']' ? (e.shiftKey ? 'front' : 'forward') : e.shiftKey ? 'back' : 'backward') } },
	{ label: 'Repeat the last device edit on the selected devices', keys: 'F4', group: 'Function keys', when: (e) => e.key === 'F4', run: (e, c) => { pd(e); c.repeatDeviceEdit() } },
	// L with several panels selected: link all their ports, the top panel first — as Properties shows, even when the
	// click that started the selection also picked a port
	{ label: 'Link the selected panels’ ports (the top panel first)', keys: 'L', group: 'Racks', when: (e, c, k, mod) => !mod && !e.altKey && k === 'l' && c.ws.selection.length > 1 && c.ws.selection.every((id) => isPanel(c, id)),
		run: (e, c) => { pd(e); c.ws.interconnectPanels(c.ws.selection.map((id) => c.project.index.get(id) as Device)) } },
	// P / L with ports selected: Patch to… / Link to… (a panel's) — then click the other device's first port
	{ label: 'Patch the selected ports to… (then click the first port on the other device)', keys: 'P', group: 'Racks', when: (e, c, k, mod) => !mod && !e.altKey && k === 'p' && !!c.ws.portSel, run: (e, c) => { pd(e); c.ws.patchFrom(c.ws.portSel!) } },
	{ label: 'Link the selected panel ports to… (then click the first port on the other panel)', keys: 'L', group: 'Racks', when: (e, c, k, mod) => !mod && !e.altKey && k === 'l' && !!c.ws.portSel && isPanel(c, c.ws.portSel.on), run: (e, c) => { pd(e); c.ws.interconnectFrom(c.ws.portSel!) } },
	{ label: 'Rack view: the other face (front ↔ rear)', keys: 'F', group: 'Racks', when: (e, c, k, mod) => !mod && !e.altKey && !e.shiftKey && k === 'f' && c.flipFace(), run: (e) => pd(e) },
	{ label: 'Help', keys: 'F1', group: 'Function keys', when: (e) => e.key === 'F1', run: (e, c) => { pd(e); c.help(false) } },
	{ label: 'Find a level, view, sheet, room, rack, device, outlet', keys: 'Ctrl+K', group: 'View', when: (_e, _c, k, mod) => mod && k === 'k', run: (e, c) => { pd(e); c.layout.open('navigator'); c.ws.navSearch++ } },
	{ label: 'Open another project', keys: 'Ctrl+O', group: 'View', when: (_e, _c, k, mod) => mod && k === 'o', run: (e, c) => { pd(e); c.openProject() } },
	{ label: 'Keys and mouse (this list)', keys: '?', group: 'Help', when: (e, _c, _k, mod) => e.key === '?' && !mod, run: (e, c) => { pd(e); c.help(true) } },
	{ label: 'Hide / show every window', keys: 'Ctrl+.', group: 'View', when: (e, _c, _k, mod) => mod && e.key === '.', run: (e, c) => { pd(e); c.layout.allHidden = !c.layout.allHidden } },
	{ label: 'Show / hide the tables', keys: 'Ctrl+,', group: 'View', when: (e, _c, _k, mod) => mod && e.key === ',', run: (e, c) => { pd(e); c.panels.toggle('bottom') } },
	{ label: 'Close the tab', keys: 'Alt+W', group: 'Tabs', when: (e, _c, k, mod) => e.altKey && !mod && (k === 'w' || e.code === 'KeyW'), run: (e, c) => { pd(e); const t = c.tabs.paneTab[c.activePane()]; if (t) c.closeTab(t) } },
	{ label: 'Next / previous tab', keys: 'Alt+PgDn / Alt+PgUp', group: 'Tabs', when: (e, _c, _k, mod) => e.altKey && !mod && (e.key === 'PageUp' || e.key === 'PageDown'),
		run: (e, c) => { pd(e); const tabs = c.tabs, at = tabs.list.findIndex((t) => t.id === tabs.paneTab[c.activePane()]), n = tabs.list.length; if (n) c.showTab(tabs.list[(at + (e.key === 'PageDown' ? 1 : -1) + n) % n].id) } },
	{ label: 'Tab 1…9', keys: 'Alt+1…9', group: 'Tabs', when: (e, _c, _k, mod) => e.altKey && !mod && /^Digit[1-9]$/.test(e.code), run: (e, c) => { pd(e); const t = c.tabs.list[Number(e.code.slice(5)) - 1]; if (t) c.showTab(t.id) } },
	{ label: 'Back / forward (views in this pane)', keys: 'Alt+← / Alt+→', group: 'Tabs', when: (e) => e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight'), run: (e, c) => { pd(e); c.navPane(c.activePane(), e.key === 'ArrowLeft' ? -1 : 1) } },
	// the drafting switches (UX05)
	{ label: 'OSNAP: object snaps on / off', keys: 'F3', group: 'Function keys', when: (e) => e.key === 'F3', run: (e, c) => { pd(e); c.toggleDrafting('osnap') } },
	{ label: 'GRID: draw the grid', keys: 'F7', group: 'Function keys', when: (e) => e.key === 'F7', run: (e, c) => { pd(e); c.toggleDrafting('showGrid') } },
	{ label: 'SNAP: grid snap on / off', keys: 'F9', group: 'Function keys', when: (e) => e.key === 'F9', run: (e, c) => { pd(e); c.toggleDrafting('snap') } },
	{ label: 'Nudge the selection (× 10 with Shift)', keys: 'Arrow keys', group: 'Drawing', when: (e, c, _k, mod) => !!ARROWS[e.key] && !mod && c.ws.selection.length > 0,
		run: (e, c) => { pd(e); const a = ARROWS[e.key]; c.canvas()?.nudge(a[0], a[1], e.shiftKey) } },
	{ label: 'Delete the selection', keys: 'Delete · Backspace', group: 'Edit', when: (e) => e.key === 'Delete' || e.key === 'Backspace', run: (_e, c) => c.deleteSelected() },
	{ label: 'Cancel · back to Select · deselect · leave a viewport', keys: 'Esc (repeat)', group: 'Drawing', when: (e) => e.key === 'Escape',
		run: (_e, c) => { const ws = c.ws; if (ws.confirm) ws.confirm = null; else if (ws.prompt) ws.prompt = null; else if (ws.toolId !== 'select') c.setTool('select'); else if (ws.selection.length || !ws.vpEdit) ws.select([]); else c.canvas()?.leaveViewport() } },
	{ label: 'Zoom to the selection', keys: 'Shift+Home', group: 'View', when: (e) => e.key === 'Home' && e.shiftKey, run: (_e, c) => c.zoomSel() },
	{ label: 'Zoom to fit', keys: 'Home', group: 'View', when: (e) => e.key === 'Home', run: (_e, c) => c.canvas()?.zoomExtents() },
	{ label: 'Page up / down (sideways: Shift)', keys: 'PgUp / PgDn', group: 'View', when: (e) => e.key === 'PageDown' || e.key === 'PageUp', run: (e, c) => { pd(e); c.canvas()?.page(e.key === 'PageDown' ? 1 : -1, e.shiftKey) } },
]

export function shellKey(e: KeyboardEvent, c: ShellKeyCtx): void {
	if (e.target instanceof Element && e.target.closest('input, select, textarea')) return
	// a dialog open: its keys are its own (Esc closes it); the drawing behind it gets none (Delete, Ctrl+Z, arrows …)
	if (document.querySelector('[role=dialog]')) return
	const { project } = c, canvas = c.canvas()
	const mod = e.ctrlKey || e.metaKey
	// mid-drag: Esc puts it back where it started; undo / redo / Delete wait for the drag to end (a nudge burst ends first)
	if (e.key === 'Escape' || e.key === 'Delete' || e.key === 'Backspace' || (mod && (e.key.toLowerCase() === 'z' || e.key.toLowerCase() === 'y'))) {
		canvas?.endNudge()
		if (project.store.busy) { e.preventDefault(); if (e.key === 'Escape') canvas?.cancel(); return }
	}
	if (!mod && canvas?.key(e)) { e.preventDefault(); return }   // the active tool first (Enter, Backspace, R …)
	if (!mod && /^[0-9@.\-]$/.test(e.key) && canvas?.takesTyping()) { e.preventDefault(); c.typePoint(e.key); return }
	const k = e.key.toLowerCase()
	for (const cmd of KEY_COMMANDS) if (cmd.when(e, c, k, mod)) { cmd.run(e, c, k); return }
}
