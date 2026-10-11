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

export function shellKey(e: KeyboardEvent, c: ShellKeyCtx): void {
	if (e.target instanceof Element && e.target.closest('input, select, textarea')) return
	const { project, ws, layout, panels, tabs } = c, canvas = c.canvas(), pane = c.activePane()
	const mod = e.ctrlKey || e.metaKey
	if (!mod && canvas?.key(e)) { e.preventDefault(); return }   // the active tool first (Enter, Backspace, R …)
	if (!mod && /^[0-9@.\-]$/.test(e.key) && canvas?.takesTyping()) { e.preventDefault(); c.typePoint(e.key); return }
	const k = e.key.toLowerCase(), arrow = ARROWS[e.key]
	if (mod && (k === 'z' || k === 'y')) canvas?.endNudge()   // a nudge burst is its own undo step
	if (mod && k === 'z' && !e.shiftKey) { e.preventDefault(); c.showHistory(project.undo()) }
	else if (mod && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); c.showHistory(project.redo()) }
	else if (mod && k === 'a') { e.preventDefault(); canvas?.selectAll() }
	else if (mod && k === 'g') { e.preventDefault(); c.groupKey(e.shiftKey) }
	else if (e.key === 'F2' && ws.selection.length === 1) {
		// F2: edit the selected thing's words in place (a text, a leader, an outlet's label, a rack's name, a run's label)
		if (labelKind(project.index.get(ws.selection[0]))) { e.preventDefault(); ws.editText(ws.selection[0]) }
	}
	else if (mod && (e.code === 'BracketRight' || e.code === 'BracketLeft')) { e.preventDefault(); c.orderKey(e.code === 'BracketRight' ? (e.shiftKey ? 'front' : 'forward') : e.shiftKey ? 'back' : 'backward') }
	else if (e.key === 'F4') { e.preventDefault(); c.repeatDeviceEdit() }
	// P / L with ports selected: Patch to… / Link to… (a panel's) — then click the other device's first port
	// L with several panels selected: link all their ports, the top panel first — as Properties shows, even when the
	// click that started the selection also picked a port
	else if (!mod && !e.altKey && k === 'l' && ws.selection.length > 1 && ws.selection.every((id) => { const d = project.index.get(id); return d?.type === 'device' && d.kind === 'panel' })) {
		e.preventDefault(); ws.interconnectPanels(ws.selection.map((id) => project.index.get(id) as Device))
	}
	else if (!mod && !e.altKey && k === 'p' && ws.portSel) { e.preventDefault(); ws.patchFrom(ws.portSel) }
	else if (!mod && !e.altKey && k === 'l' && ws.portSel && project.index.get(ws.portSel.on)?.type === 'device' && (project.index.get(ws.portSel.on) as { kind?: string }).kind === 'panel') { e.preventDefault(); ws.interconnectFrom(ws.portSel) }
	else if (!mod && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'f' && c.flipFace()) e.preventDefault()   // rack view: front ↔ rear
	else if (e.key === 'F1') { e.preventDefault(); c.help(false) }
	else if (mod && k === 'k') { e.preventDefault(); layout.open('navigator'); ws.navSearch++ }
	else if (mod && k === 'o') { e.preventDefault(); c.openProject() }
	else if (e.key === '?' && !mod) { e.preventDefault(); c.help(true) }
	else if (mod && e.key === '.') { e.preventDefault(); layout.allHidden = !layout.allHidden }
	else if (mod && e.key === ',') { e.preventDefault(); panels.toggle('bottom') }
	else if (e.altKey && !mod && (k === 'w' || e.code === 'KeyW')) { e.preventDefault(); const t = tabs.paneTab[pane]; if (t) c.closeTab(t) }
	else if (e.altKey && !mod && (e.key === 'PageUp' || e.key === 'PageDown')) {
		e.preventDefault()
		const at = tabs.list.findIndex((t) => t.id === tabs.paneTab[pane]), n = tabs.list.length
		if (n) c.showTab(tabs.list[(at + (e.key === 'PageDown' ? 1 : -1) + n) % n].id)
	}
	else if (e.altKey && !mod && /^Digit[1-9]$/.test(e.code)) { e.preventDefault(); const t = tabs.list[Number(e.code.slice(5)) - 1]; if (t) c.showTab(t.id) }
	else if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); c.navPane(pane, e.key === 'ArrowLeft' ? -1 : 1) }
	else if (e.key === 'F9' || e.key === 'F3' || e.key === 'F7') {
		// the drafting switches (UX05): F9 SNAP, F3 OSNAP, F7 GRID
		e.preventDefault()
		c.toggleDrafting(e.key === 'F9' ? 'snap' : e.key === 'F3' ? 'osnap' : 'showGrid')
	}
	else if (arrow && !mod && ws.selection.length) { e.preventDefault(); canvas?.nudge(arrow[0], arrow[1], e.shiftKey) }
	else if (e.key === 'Delete' || e.key === 'Backspace') c.deleteSelected()
	else if (e.key === 'Escape') { if (ws.confirm) ws.confirm = null; else if (ws.prompt) ws.prompt = null; else if (ws.toolId !== 'select') c.setTool('select'); else if (ws.selection.length || !ws.vpEdit) ws.select([]); else canvas?.leaveViewport() }
	else if (e.key === 'Home' && e.shiftKey) c.zoomSel()
	else if (e.key === 'Home') canvas?.zoomExtents()
	else if (e.key === 'PageDown' || e.key === 'PageUp') { e.preventDefault(); canvas?.page(e.key === 'PageDown' ? 1 : -1, e.shiftKey) }
}
