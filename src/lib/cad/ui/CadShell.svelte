<!-- The cad workspace for one project: levels on the left, the plan in the middle, Properties on the right, the
     outlets grid below. Owns the CadProject + Workspace for its lifetime (created here, destroyed on unmount). -->
<script lang="ts">
	import WindowBody from './WindowBody.svelte'
	import OpenProjectDialog from './OpenProjectDialog.svelte'
	import BackupDialog from './BackupDialog.svelte'
	import BackupsWindow from './BackupsWindow.svelte'
	import { backupsCol, loadBackup, type BackupHead } from '../app/backups'
	import { doc, getDoc } from 'firebase/firestore'
	import type { ProjectFile } from '../persist/file'
	import RestoreNotice from './RestoreNotice.svelte'
	import { canRestore } from '../domain/restorePlan'
	import { drawnOn, layersOf } from '../domain/layers'
	import SplitBar from './SplitBar.svelte'
	import { shellKey, ARROWS } from './shellKeys'
	import { newSheetIn, sheetsPdf, repeatDeviceEdit, selectedText as selectedTextOf, activeSheets, viewTitle, viewExists, toggleDrafting as toggleDraftingOf } from '../app/shellActions'
	import { onDestroy, setContext, tick, untrack } from 'svelte'
	import { page } from '$app/state'
	import { replaceState, goto } from '$app/navigation'
	import { readViewState, writeViewState } from '../app/urlState'
	import { firestore } from '$lib/db.svelte'
	import { CadProject } from '../app/project.svelte'
	import { Workspace, toolWorksIn, type ToolId } from '../app/workspace.svelte'
	import { deleteSelected as deleteSelectedOf, orderKey as orderKeyOf, groupKey as groupKeyOf } from '../app/selectionActions'
	import { HINT, HINT_PLACE } from './toolHints'
	import ViewCanvas from './ViewCanvas.svelte'
	import { PLAN, specKey, type ViewSpec } from '../views/space'
	import ImportPanel from './ImportPanel.svelte'
	import FloorManager from './FloorManager.svelte'
	import SettingsDialog from './SettingsDialog.svelte'
	import ResizeHandle from './ResizeHandle.svelte'
	import { Panels } from '../app/panels.svelte'
	import { Icon } from '$lib'
	import { clipboardEvents } from '../app/clipboardEvents'
	import ToolOptions from './ToolOptions.svelte'
	import Exports from './Exports.svelte'
	import TablesPanel from './TablesPanel.svelte'
	import TabStrip from './TabStrip.svelte'
	import { Tabs, viewKey as viewKeyOf, type TabView } from '../app/tabs.svelte'
	import type { NavNode } from '../domain/navTree'
	import CadWindow from './CadWindow.svelte'
	import MenuBar from './MenuBar.svelte'
	import HelpDialog from './HelpDialog.svelte'
	import TitleBlockDialog from './TitleBlockDialog.svelte'
	import ImagePickDialog from './ImagePickDialog.svelte'
	import { buildMenus, selectionMenu, tabMenuOf } from './cadMenus'
	import { renameLevel as renameLevelOf, deleteLevel as deleteLevelOf } from '../app/navActions'
	import ContextMenu from './ContextMenu.svelte'
	import { WindowLayout, type WinId } from '../app/windows.svelte'
	import ToolStrip from './ToolStrip.svelte'
	import StatusBar from './StatusBar.svelte'
	import AskBox from './AskBox.svelte'

	let { pid, user, userName = '', projectName, ownerId }: { pid: string; user: string; userName?: string; projectName: string; ownerId?: string } = $props()

	// Created once per mount (the route keys this component by pid).
	// svelte-ignore state_referenced_locally
	const project = new CadProject(pid, firestore, user)
	// image shapes' pictures, resolved for every canvas (ui/Prims.svelte)
	setContext('cad-picture', (ref: string) => project.pdf.picture(ref))
	$effect(() => { project.name = projectName; project.ownerId = ownerId; project.userName = userName })
	const ws = new Workspace()
	// a refused edit while someone else's restore runs says why
	project.store.onRefuse = (reason) => ws.say(reason)
	const panels = new Panels()
	/** The windows (UX review S2): Navigator, Properties, Layers, Blocks, Racks, Cables — docked, floating or closed. */
	const layout = new WindowLayout()
	let helpOpen = $state<false | 'help' | 'keys'>(false)
	let imagePickOpen = $state(false)
	let titleBlockOpen = $state(false), openProjectOpen = $state(false), backupOpen = $state<false | 'download' | 'restore'>(false), backupsOpen = $state(false)
	/** A stored backup to restore (Project › Backups… › Restore…). */
	let restoreSource = $state.raw<{ file: ProjectFile; name: string } | undefined>()
	let exportsRef: Exports | undefined = $state()
	/** The drawing area: floating windows sit in it, its edges dock them. */
	let planEl: HTMLElement | undefined = $state()
	ws.openTitleBlock = () => (titleBlockOpen = true)
	ws.restoreBackup = async (id) => {
		try {
			const head = (await getDoc(doc(backupsCol(project), id))).data() as BackupHead | undefined
			if (!head) { ws.say('That backup has been deleted'); return }
			restoreSource = { file: await loadBackup(project, head), name: head.name }
			backupOpen = 'restore'
		} catch (e) { ws.say(`Could not open the backup: ${(e as Error).message}`) }
	}
	// svelte-ignore state_referenced_locally
	ws.layers.load(pid)
	ws.applyLinks = (label, add, remove) => project.applyLinks(label, add, remove)
	ws.openView = (s) => setPane(activePane, s)
	ws.openInTab = (v) => { if (v.levelId && project.index.get(v.levelId)) ws.levelId = v.levelId; setPane(activePane, $state.snapshot(v.spec) as ViewSpec, 'keep') }
	ws.remove = () => deleteSelected()
	ws.selectSimilar = () => canvas?.selectSimilar()
	onDestroy(() => project.destroy())

	// the view state comes back from the URL on a refresh (Dave): level, the panes' views, the active pane
	const fromUrl = readViewState(page.url.searchParams)
	if (fromUrl.levelId) ws.levelId = fromUrl.levelId

	/** One or two panes side by side, each a plan or an elevation of the open level; the active one takes keys. */
	let panes = $state<ViewSpec[]>(fromUrl.panes ?? [PLAN])
	let activePane = $state(fromUrl.active ?? 0)
	/** The drawing tabs (UX review D1): one list for both panes; each pane shows one. */
	// svelte-ignore state_referenced_locally
	const tabs = new Tabs(pid)
	// svelte-ignore state_referenced_locally
	panes.forEach((v, i) => tabs.ensure(i, { levelId: ws.levelId ?? undefined, spec: v }))
	let canvases = $state<(ViewCanvas | undefined)[]>([])
	const canvas = $derived(canvases[activePane])
	const level = $derived(project.levels.find((l) => l.id === ws.levelId))
	let panesEl: HTMLDivElement | undefined = $state()


	function toggleSplit() {
		canvas?.cancel()
		if (panes.length === 2) { panes = [panes[activePane]]; activePane = 0 }
		else { panes = [panes[0], panes[0].kind === 'plan' ? { kind: 'elevation', dir: 'front' } : PLAN]; activePane = 0 }
	}
	/** Show a view in a pane. The selection follows (UX09): what neither pane draws any more is let go, so Properties
	 *  always describes something you can see. */
	/** `how`: 'go' = the pane's tab changes view (its old view goes on the tab's Back list); 'open' / 'keep' = the
	 *  Navigator / a link: the view's tab, else the preview tab (keep: a kept tab); 'nav' / 'show' = the tab is set. */
	function setPane(i: number, s: ViewSpec, how: 'go' | 'nav' | 'open' | 'keep' | 'show' = 'go') {
		canvases[i]?.cancel()
		ws.vpEdit = null   // another view: no longer editing inside a viewport
		const view: TabView = { levelId: ws.levelId ?? undefined, spec: $state.snapshot(s) as ViewSpec }
		if (how === 'go') tabs.go(i, view)
		else if (how === 'open' || how === 'keep') tabs.open(i, view, how === 'keep', project.rev)
		panes[i] = s
		void tick().then(() => {
			const keep = ws.selection.filter((id) => canvases.some((c) => c?.draws(id)))
			if (keep.length !== ws.selection.length) ws.select(keep)
		})
	}
	const viewName = (v: ViewSpec | undefined) => viewTitle(project, v), exists = (v: ViewSpec) => viewExists(project, v)
	/** Back / forward inside the pane's tab (UX12 → D1, Alt+← / Alt+→). */
	function navPane(i: number, dir: -1 | 1) {
		const v = tabs.nav(i, dir, (x) => exists(x.spec))
		if (!v) return
		if (v.levelId && project.index.get(v.levelId)) ws.levelId = v.levelId
		setPane(i, $state.snapshot(v.spec) as ViewSpec, 'nav')
	}
	const navOf = (i: number) => { const t = tabs.of(i); return { back: viewName(t?.back.at(-1)?.spec), fwd: viewName(t?.fwd.at(-1)?.spec), go: (d: -1 | 1) => navPane(i, d) } }
	/** Show a tab in a pane (its level first). */
	function showTab(id: string, i = activePane) {
		const t = tabs.get(id)
		if (!t) return
		tabs.paneTab[i] = id
		tabs.save()
		if (t.view.levelId && project.index.get(t.view.levelId)) ws.levelId = t.view.levelId
		setPane(i, $state.snapshot(t.view.spec) as ViewSpec, 'show')
	}
	/** Close a tab: the panes that showed it show the tab beside it, or (none left) the open level's plan. */
	function closeTab(id: string) {
		const before = [...tabs.paneTab]
		tabs.close(id)
		before.forEach((p, i) => { if (p === id && i < panes.length) { const next = tabs.paneTab[i]; if (next) showTab(next, i); else setPane(i, PLAN) } })
	}
	// what a pane shows is what its tab holds (a level picked elsewhere changes the tab's view, without history)
	$effect(() => {
		const lv = ws.levelId ?? undefined
		panes.forEach((v, i) => { const view = { levelId: lv, spec: $state.snapshot(v) as ViewSpec }; untrack(() => tabs.sync(i, view)) })
	})
	// an edit made while a preview tab is on show keeps that tab
	$effect(() => {
		const r = project.rev
		untrack(() => { const t = tabs.of(activePane); if (t?.preview && t.rev !== undefined && r > t.rev) tabs.keep(t.id) })
	})
	// a drawing tool's new shapes: say which layer they went on (Dave 2026-10-10) — not paste / copy, which keep theirs
	$effect(() => project.store.subscribe((c) => {
		if (!(c.source === 'local' || (c.source === 'gesture' && c.final)) || ['select', 'move', 'copy', 'match'].includes(ws.toolId)) return
		const msg = drawnOn(c.ops.filter((o) => !o.before && o.after).map((o) => o.after!), layersOf(project.index.layers))
		if (msg) ws.say(msg)
	}))
	/** The tab menu (a right-click on a tab). */
	let tabMenu = $state<{ id: string; x: number; y: number } | null>(null)
	const tabMenuItems = $derived(tabMenu ? tabMenuOf(tabMenu.id, {
		preview: !!tabs.get(tabMenu.id)?.preview, isSheet: tabs.get(tabMenu.id)?.view.spec.kind === 'sheet', split: panes.length === 2,
		keep: (id) => tabs.keep(id), close: closeTab,
		closeOthers: (id) => { tabs.closeOthers(id); panes.forEach((_, i) => showTab(id, i)) },
		closeRight: (id) => { tabs.closeRight(id); panes.forEach((_, i) => { const p = tabs.paneTab[i]; if (p) showTab(p, i) }) },
		otherPane: (id) => showTab(id, 1 - activePane),
		toSheet: (id) => { showTab(id); void tick().then(() => canvas?.toSheet('new')) },
	}) : [])
	/** A pane showing a sheet (or section) that was deleted goes back to the plan. */
	$effect(() => {
		void project.rev
		panes.forEach((s, i) => {
			const gone = s.kind === 'sheet' ? !project.store.get(s.sheetId) : s.kind === 'section' ? !project.store.get(s.sectionId) : false
			if (gone && project.loaded) untrack(() => setPane(i, PLAN))
		})
		if (project.loaded) untrack(() => tabs.prune((v) => exists(v.spec)))
	})
	/** A level from the list: its model. A pane showing something that isn't this level's (a sheet, the riser view,
	 *  another floor's racks) goes to the level's plan (Dave: clicking a level with S001 open did nothing visible). */
	function openLevel(id: string) {
		if (id !== ws.levelId && panes[activePane].kind === 'plan') tabs.go(activePane, { levelId: id, spec: PLAN })
		ws.levelId = id
		ws.select([])
		const p = panes[activePane]
		const elsewhere = p.kind === 'sheet' || p.kind === 'riser' || (p.kind === 'row' && project.index.get(p.spaceId)?.type === 'space' && (project.index.get(p.spaceId) as { levelId: string }).levelId !== id)
		if (elsewhere) setPane(activePane, PLAN)
	}
	/** After undo / redo: select what changed; an edit on another level opens that level first (Dave), unless a sheet
	 *  or the riser view (no one level) is showing. */
	function showHistory(ids: string[]) {
		const e = ids.length ? project.store.get(ids[0]) : undefined
		const on = e?.type === 'device' ? (project.store.get(e.rackId) as { levelId?: string } | undefined)?.levelId : (e as { levelId?: string } | undefined)?.levelId
		if (on && on !== ws.levelId && activeKind !== 'sheet' && activeKind !== 'riser' && project.levels.some((l) => l.id === on)) openLevel(on)
		ws.select(ids)
	}
	/** The room the patch list's "This room" means: the open rack view's, else the selected rack's / device's / cord's. */
	const patchRoom = $derived.by(() => {
		const p = panes[activePane]
		if (p?.kind === 'row') return p.spaceId
		const s = project.index.get(ws.selection[0]), e = s?.type === 'cord' ? project.index.get(s.a.on) : s   // a cord picked in the list keeps its room
		const r = e?.type === 'device' ? project.index.get(e.rackId) : e
		return r?.type === 'rack' ? r.spaceId : undefined
	})
	/** The kind of view in the active pane — which tools can be used (TOOL_VIEWS). */
	/** Editing inside a sheet viewport (UX review S5): the tools are its view's (plan, elevation, rack row …). */
	const vpEditKind = $derived.by(() => {
		const e = ws.vpEdit, sh = e ? project.index.get(e.sheetId) : undefined
		return sh?.type === 'sheet' ? (sh.viewports.find((v) => v.id === e!.vpId)?.view.spec.kind ?? null) : null
	})
	const activeKind = $derived(vpEditKind ?? panes[activePane]?.kind ?? 'plan')
	/** What a new viewport shows (the Viewport tool): the other pane's view, else the last plan / elevation / rack view
	 *  looked at. Snapshots: the store freezes what it's given, and a $state proxy can't be frozen. */
	let lastModel: Exclude<ViewSpec, { kind: 'sheet' }> | null = null
	$effect(() => { const p = panes[activePane]; if (p && p.kind !== 'sheet') lastModel = $state.snapshot(p) as typeof lastModel })
	ws.viewportView = () => {
		const other = panes.length === 2 ? panes[1 - activePane] : undefined
		const spec = other && other.kind !== 'sheet' ? ($state.snapshot(other) as typeof lastModel) : lastModel
		return spec && ws.levelId ? { levelId: ws.levelId, spec } : null
	}
	// switching to a view the current tool doesn't work in drops back to Select
	$effect(() => { if (!toolWorksIn(untrack(() => ws.toolId), activeKind, !!vpEditKind)) untrack(() => setTool('select')) })

	// ...and goes back into it on every change (replaceState: no history entries, SvelteKit's router stays in charge)
	// Compared with the ADDRESS BAR (location), not page.url: after a replaceState page.url can lag, and a switch back
	// to what the stale copy said was skipped (Dave: plan → sheet sometimes left v=plan).
	$effect(() => {
		const state = { levelId: ws.levelId, panes: $state.snapshot(panes) as ViewSpec[], active: activePane }
		const url = new URL(location.href)
		const next = writeViewState(url.searchParams, state)
		if (next.toString() === url.searchParams.toString()) return
		url.search = next.toString()
		try { replaceState(url, untrack(() => page.state)) } catch { /* the router isn't ready on the very first run */ }
	})

	// `?rack=<id>` (a link to one rack): once loaded, its room's rack view, zoomed to it and selected; the link's
	// param is then dropped so a refresh keeps whatever you did next
	let rackLink = page.url.searchParams.get('rack')
	$effect(() => {
		if (!rackLink || !project.loaded) return
		const r = project.store.get(rackLink)
		rackLink = null
		const url = new URL(location.href)
		url.searchParams.delete('rack')
		try { replaceState(url, untrack(() => page.state)) } catch { /* the router isn't ready */ }
		if (r?.type !== 'rack') { ws.say('The rack in that link is not in this project'); return }
		untrack(() => { ws.focus = r.id; ws.levelId = r.levelId; setPane(activePane, { kind: 'row', spaceId: r.spaceId, face: 'front' }); ws.select([r.id]) })
	})

	/** Open the first level once levels arrive (and if the open one disappears). */
	$effect(() => {
		const lv = project.levels
		if (lv.length && !lv.some((l) => l.id === ws.levelId)) ws.levelId = lv[0].id
	})


	/** The status bar's hint: the tool's, or (Select) the selected viewport's ways of working. */
	const hint = $derived((ws.vpEdit ? 'Editing inside the viewport — Esc or a double-click outside it leaves · ' : '') + (ws.toolId === 'rack' && ws.rackTool.target ? HINT_PLACE : HINT[ws.toolId] ?? ''))


	type BottomTab = 'outlets' | 'patch' | 'sheets' | 'links'
	let bottom = $state<BottomTab>('outlets')
	/** The bottom panel follows the view (UX10): sheet → Sheets, rack view → Patch list, else Outlets — unless you picked
	 *  a tab yourself in that kind of view (remembered per kind in this browser, over a refresh — Dave 2026-10-10). */
	const BOTTOM_FOR: Partial<Record<ViewSpec['kind'], BottomTab>> = { sheet: 'sheets', row: 'patch' }
	const TABLES: BottomTab[] = ['outlets', 'patch', 'sheets', 'links']
	const pickedFor = (k: ViewSpec['kind']) => { const t = panels.tableFor[k] as BottomTab | undefined; return t && TABLES.includes(t) ? t : undefined }
	$effect(() => { const k = activeKind; untrack(() => (bottom = pickedFor(k) ?? BOTTOM_FOR[k] ?? 'outlets')) })
	function pickBottom(t: BottomTab) { bottom = t; panels.tableFor[activeKind] = t; panels.save() }
	let floorsOpen = $state(false)
	let typesOpen = $state(false)

	// Blocks opens with the Insert tool, unless you closed it this session (Racks no longer opens by itself in a rack
	// view, UX review L1: the Navigator lists each room's racks; Window › Racks for its tools)
	$effect(() => { if (ws.toolId === 'insert') untrack(() => layout.open('blocks', false)) })
	$effect(() => { if (ws.toolId === 'device') untrack(() => layout.open('devices', false)) })
	// floating windows stay reachable when the browser window (or the drawing area) shrinks (Dave)
	$effect(() => {
		const el = planEl
		if (!el) return
		const ro = new ResizeObserver(() => layout.clampAll(el.clientWidth, el.clientHeight))
		ro.observe(el)
		return () => ro.disconnect()
	})
	const tablesShown = $derived(panels.shown.bottom && !layout.allHidden)
	/** The tables in the strip under the drawing (not floating or maximised); folded, the strip is just their bar. */
	const tablesDocked = $derived(tablesShown && !panels.tables.float && !panels.tables.max)
	/** Closed, their bar of tabs stays under the drawing (Dave 2026-10-10) — not when every window is hidden. */
	const tablesBar = $derived(!panels.shown.bottom && !layout.allHidden)
	const tablesRow = $derived(tablesDocked ? (panels.tables.folded ? 29 : panels.size.bottom) : tablesBar ? 29 : 0)
	const dockW = (side: 'left' | 'right') => (layout.docked(side).length ? panels.size[side] : 0)
	const sheetsAll = $derived(activeSheets(project))
	/** A Navigator row: its view in the active pane (its level first); a rack zooms to itself; a sheet / rack / section is
	 *  selected. The spec is copied: the tree's comes from frozen store data. */
	function navOpen(n: NavNode, keep = false) {
		const o = n.open
		if (!o) return
		if (o.levelId && o.levelId !== ws.levelId) ws.levelId = o.levelId
		setPane(activePane, $state.snapshot(o.spec) as ViewSpec, keep ? 'keep' : 'open')
		if (n.kind === 'rack' && n.id) ws.focus = n.id
		if (n.select) ws.select([n.select])
	}
	function openTable(t: BottomTab) { panels.shown.bottom = true; panels.save(); pickBottom(t) }
	// project actions (app/shellActions.ts)
	const newSheet = () => setPane(activePane, { kind: 'sheet', sheetId: newSheetIn(project, ws) }, 'keep')
	const pdfSheet = (id: string) => { const sh = project.index.get(id); if (sh?.type === 'sheet') void sheetsPdf(project, ws, [sh]) }
	const pdfAllSheets = () => void sheetsPdf(project, ws, sheetsAll)
	/** The sheet open in the active pane (File / Sheets › PDF of this sheet). */
	const openSheetId = $derived.by(() => { const p = panes[activePane]; return p?.kind === 'sheet' ? p.sheetId : undefined })
	const selectedText = $derived(selectedTextOf(project, ws))
	function zoomSel() { if (!canvas?.zoomToSelection()) ws.say('Nothing selected is drawn in this view') }
	const toggleDrafting = (k: 'snap' | 'osnap' | 'showGrid') => toggleDraftingOf(ws, k)
	/** The menu bar (UX review S4): rebuilt when what it shows changes (ticks, what's possible). */
	const menus = $derived(buildMenus({
		outletSchedule: (all) => exportsRef?.outletSchedule(all), dxf: () => exportsRef?.dxf(), pdfAllSheets, hasSheets: sheetsAll.length > 0, pdfThisSheet: () => openSheetId && pdfSheet(openSheetId), onSheet: !!openSheetId, uploads: () => window.open(`/projects/${pid}/uploads`, '_blank', 'noopener'), openProject: () => (openProjectOpen = true),
		backup: (m) => { restoreSource = undefined; backupOpen = m }, backups: () => (backupsOpen = true), canRestore: canRestore(project.ownerId, project.user),
		undo: () => showHistory(project.undo()), redo: () => showHistory(project.redo()), canUndo: project.canUndo, canRedo: project.canRedo,
		copy: () => document.execCommand('copy'), cut: () => document.execCommand('cut'),
		paste: () => ws.say('Paste with Ctrl+V (the browser lets a page paste only from the keyboard)'),
		remove: deleteSelected, hasSelection: ws.selection.length > 0 || !!ws.portSel || !!ws.openingSel,
		selectAll: () => canvas?.selectAll(), selectSimilar: () => canvas?.selectSimilar(),
		group: () => groupKey(false), ungroup: () => groupKey(true), order: orderKey,
		find: () => { layout.open('navigator'); ws.navSearch++ }, fit: () => canvas?.zoomExtents(), zoomSel, split: panes.length === 2, toggleSplit,
		tables: tablesShown, toggleTables: () => panels.toggle('bottom'), hideAll: layout.allHidden, toggleHideAll: () => (layout.allHidden = !layout.allHidden),
		back: () => navPane(activePane, -1), forward: () => navPane(activePane, 1), canBack: (tabs.of(activePane)?.back.length ?? 0) > 0, canFwd: (tabs.of(activePane)?.fwd.length ?? 0) > 0,
		fill: ws.showFill, toggleFill: () => (ws.showFill = !ws.showFill), isPlan: activeKind === 'plan',
		drafting: ws.drafting, toggleDrafting,
		tool: setTool, toolOk: (id) => toolWorksIn(id, activeKind, !!vpEditKind), openTable,
		cordBom: () => exportsRef?.openCordBom(), portMap: () => exportsRef?.portMap(), cableSchedule: () => exportsRef?.openCables(), bom: () => exportsRef?.openBom(),
		newSheet, sheetFromView: () => canvas?.toSheet('new'), canSheetFromView: activeKind !== 'sheet', titleBlock: () => (titleBlockOpen = true), image: () => (imagePickOpen = true),
		floors: () => (floorsOpen = true), settings: () => (typesOpen = true),
		hasLevel: !!level, renameLevel: () => level && renameLevelOf(project, ws, level.id), deleteLevel: () => level && deleteLevelOf(project, ws, level.id),
		win: { shown: (id) => layout.shown(id), toggle: (id) => layout.toggle(id), reset: () => layout.reset() },
		help: (keys) => (helpOpen = keys ? 'keys' : 'help'),
	}))

	/** The right-click menu on the selection (UX21): its commands, with their keys. */
	const contextItems = $derived(ws.contextMenu ? selectionMenu(ws.selection.map((id) => project.index.get(id)), {
		editLabel: (id) => ws.editText(id), remove: deleteSelected, similar: () => canvas?.selectSimilar(), match: () => setTool('match'),
		group: groupKey, order: orderKey, properties: () => layout.open('properties'),
		ports: portActions(),
	}) : [])
	/** Right-click on selected ports: Patch to… / Link to… (a panel's) at the top of the menu. */
	function portActions() {
		const s = ws.portSel, d = s ? project.index.get(s.on) : undefined
		if (!s || d?.type !== 'device') return undefined
		return { n: s.ports.length, patch: () => ws.patchFrom(s), ...(d.kind === 'panel' ? { interconnect: () => ws.interconnectFrom(s) } : {}) }
	}

	/** The cord defaults start from the project's settings once, then stay as last chosen (sticky). */
	let cordDefaultsSet = false
	// Planning / Surveying (a project setting): what the cord tool's new cords start as
	$effect(() => { ws.newCordStatus = project.settings?.newCordStatus ?? 'add' })
	function setTool(id: ToolId) {
		canvas?.cancel()
		if (id === 'renumber') ws.select([])   // a fresh pick: the click order is the numbering order
		if (id === 'match') { const one = ws.selection.length === 1 ? project.index.get(ws.selection[0]) : undefined; ws.matchTool.source = one?.type === 'shape' ? one.id : null }
		if (id === 'rack') ws.rackTool.target = null   // the Rack button draws new racks; Place in the list sets a target
		if (id === 'device' && !ws.deviceTemplate) ws.deviceTemplate = project.deviceTemplates[0] ?? null
		if (id === 'cord' && !cordDefaultsSet && project.settings) {
			ws.cordDefaults = { cableType: project.settings.defaults.cordCableType, colour: project.settings.defaults.cordColour }
			cordDefaultsSet = true
		}
		ws.setTool(id, level)
	}


	/** Start typing a point while a drawing tool is active: the point box opens with what was typed. */
	function typePoint(first: string) {
		ws.askText('Point — x,y · @dx,dy · a length, Tab, an angle', first, (text) => {
			const err = canvas?.typed(text) ?? null
			if (err) ws.say(err)
		})
	}

	function deleteSelected() { deleteSelectedOf(project, ws) }
	function orderKey(how: 'forward' | 'backward' | 'front' | 'back') { orderKeyOf(project, ws, how) }
	function groupKey(ungroup: boolean) { groupKeyOf(project, ws, ungroup) }
	/** The keys (ui/shellKeys.ts). */
	const onKey = (e: KeyboardEvent) => shellKey(e, {
		project, ws, layout, panels, tabs, canvas: () => canvas, activePane: () => activePane, typePoint, showHistory, groupKey, orderKey,
		repeatDeviceEdit: () => repeatDeviceEdit(project, ws), help: (keys) => (helpOpen = keys ? 'keys' : 'help'),
		closeTab, showTab: (id) => showTab(id), navPane, toggleDrafting, deleteSelected, setTool, zoomSel, openProject: () => (openProjectOpen = true),
	})
	const clipboard = clipboardEvents({ project, ws, target: () => canvas?.pasteTarget(), inRow: () => activeKind === 'row' })


</script>

<svelte:window onkeydown={onKey} onkeyup={(e) => { if (ARROWS[e.key]) canvas?.endNudge() }} oncopy={clipboard.copy} oncut={clipboard.cut} onpaste={clipboard.paste} />

<div class="shell bg-zinc-50 text-sm" style:grid-template-columns="{dockW('left')}px minmax(0, 1fr) {dockW('right')}px"
	style:grid-template-rows="1.75rem 2.25rem minmax(0, 1fr) {tablesRow}px 1.6rem">
	<MenuBar {menus}>
		{#snippet right()}
			<span class="saved text-xs">
				{#if project.error}<span class="text-red-600">{project.error}</span>
				{:else if !project.loaded}Loading…
				{:else if project.pendingWrites}Saving…{:else}Saved{/if}
			</span>
		{/snippet}
	</MenuBar>

	<!-- tools and their options -->
	<div class="bar flex items-center gap-1 border-b border-zinc-200 bg-white px-2">
		<ToolStrip tool={ws.toolId} kind={activeKind} onSheet={!!vpEditKind} onTool={setTool} />
		<ToolOptions {project} {ws} {level} kind={activeKind} />
		<span class="ml-auto"></span>
		<button class="ib" disabled={!project.canUndo} onclick={() => showHistory(project.undo())} title="Undo (Ctrl+Z) — selects what came back or changed (on its level)"><Icon name="undo" size={15} /></button>
		<button class="ib" disabled={!project.canRedo} onclick={() => showHistory(project.redo())} title="Redo (Ctrl+Y) — selects what it changed (on its level)"><Icon name="redo" size={15} /></button>
		<button class="ib" disabled={!ws.selection.length && !ws.portSel && !ws.openingSel} onclick={deleteSelected} title="Delete the selection (Delete key) — asks first when more goes with it; Undo brings it back"><Icon name="trash" size={15} /></button>
		<span class="mx-1 h-5 w-px bg-zinc-200"></span>
		<button class="ib {panes.length === 2 ? 'on' : ''}" onclick={toggleSplit} title="Two views side by side (plan + elevation)"><Icon name="panels" size={15} /></button>
		<button class="ib {tablesShown ? '' : 'dim'}" onclick={() => panels.toggle('bottom')} title="{tablesShown ? 'Hide' : 'Show'} the tables (outlets, patch list, sheets, links) — Ctrl+,"><Icon name="panelBottom" size={15} /></button>
		<button class="ib {layout.allHidden ? 'on' : ''}" onclick={() => (layout.allHidden = !layout.allHidden)} title="{layout.allHidden ? 'Show' : 'Hide'} every window and the tables — Ctrl+."><Icon name="expand" size={15} /></button>
	</div>

	{#snippet winBody(id: WinId)}
		<WindowBody {id} {project} {ws} {level} {projectName} current={{ levelId: ws.levelId ?? undefined, spec: panes[activePane] }} tabbed={new Set(tabs.list.map((t) => viewKeyOf(t.view)))}
			on={{ navOpen, floors: () => (floorsOpen = true), settings: () => (typesOpen = true), newSheet, pdfAll: pdfAllSheets, pdf: pdfSheet,
				insert: (b) => { if (b) { ws.insertBlock = b; setTool('insert') } else setTool('select') }, view: (s) => setPane(activePane, s) }} />
	{/snippet}

	{#snippet tables(closed = false)}
		<TablesPanel {project} {ws} {panels} {level} {projectName} roomId={patchRoom} inRoomView={panes[activePane]?.kind === 'row'}
			tab={bottom} onpick={pickBottom} onview={(s) => setPane(activePane, s)} area={planEl} {closed} />
	{/snippet}


	<!-- docked windows: the left and right columns (today's side panels), stacked -->
	{#each ['left', 'right'] as const as side (side)}
		<aside class="dock dock-{side}" class:gone={!layout.docked(side).length}>
			<ResizeHandle bind:value={panels.size[side]} side={side === 'left' ? 'right' : 'left'} min={170} max={560} onend={panels.save} />
			{#each layout.docked(side) as id (id)}<CadWindow {layout} {id} area={planEl}>{@render winBody(id)}</CadWindow>{/each}
		</aside>
	{/each}

	<!-- the drawing: one or two panes, floating windows over it -->
	<main class="plan relative" bind:this={planEl}>
		<TabStrip {tabs} {project} panes={panes.length} {activePane} onshow={(id) => showTab(id)} onclose={closeTab} onmenu={(id, x, y) => (tabMenu = { id, x, y })} />
		<AskBox {ws} />
		{#if project.loaded && !project.levels.length}
			<ImportPanel {project} {projectName} />
		{:else if level}
			<div class="panes" bind:this={panesEl}>
				{#each panes as spec, i (i)}
					{#if i === 1}
						<!-- the bar between split views: drag to share the width (double-click: half and half) -->
						<SplitBar {panels} container={panesEl} />
					{/if}
					<div class="pane" style:flex={panes.length === 2 ? `${i === 0 ? panels.split : 1 - panels.split} 1 0` : undefined}>
						<ViewCanvas bind:this={canvases[i]} {project} {ws} levelId={level.id} {spec}
							other={panes.length === 2 ? panes[1 - i] : undefined} active={activePane === i}
							onspec={(s) => setPane(i, s)} onfocus={() => (activePane = i)} nav={navOf(i)} />
					</div>
				{/each}
			</div>
		{/if}
		{#each layout.floating() as id (id)}<CadWindow {layout} {id} area={planEl}>{@render winBody(id)}</CadWindow>{/each}
		{#if tablesShown && (panels.tables.float || panels.tables.max)}{@render tables()}{/if}
		<!-- a window dragged to an edge docks there on release -->
		{#if layout.dropSide}<div class="drop drop-{layout.dropSide}"></div>{/if}
	</main>

	{#if floorsOpen}<FloorManager {project} {ws} onclose={() => (floorsOpen = false)} />{/if}
	{#if typesOpen}<SettingsDialog {project} {ws} onclose={() => (typesOpen = false)} />{/if}
	{#if titleBlockOpen}<TitleBlockDialog {project} onclose={() => (titleBlockOpen = false)} />{/if}
	{#if imagePickOpen}<ImagePickDialog {project} onclose={() => (imagePickOpen = false)} onpick={(p) => { imagePickOpen = false; ws.imagePick = p; setTool('image'); ws.say(`${p.name}: drag its box on the ${activeKind === 'sheet' ? 'sheet' : 'plan'}`) }} />{/if}
	{#if openProjectOpen}<OpenProjectDialog currentId={pid} onpick={(id) => { if (id !== pid) void goto(`/projects/${id}/cad`) }} onclose={() => (openProjectOpen = false)} />{/if}
	<RestoreNotice {project} />
	{#if backupsOpen}<BackupsWindow {project} onclose={() => (backupsOpen = false)} say={(m) => ws.say(m)} onrestore={(src) => { restoreSource = src; backupOpen = 'restore' }} />{/if}
	{#if backupOpen}<BackupDialog {project} mode={backupOpen} source={backupOpen === 'restore' ? restoreSource : undefined} onclose={() => { backupOpen = false; restoreSource = undefined }} say={(m) => ws.say(m)} />{/if}
	{#if helpOpen}<HelpDialog keys={helpOpen === 'keys'} hints={HINT} onclose={() => (helpOpen = false)} ontool={setTool} />{/if}
	{#if tabMenu}<ContextMenu x={tabMenu.x} y={tabMenu.y} items={tabMenuItems} onclose={() => (tabMenu = null)} />{/if}
	{#if ws.contextMenu}<ContextMenu x={ws.contextMenu.x} y={ws.contextMenu.y} items={contextItems} onclose={() => (ws.contextMenu = null)} />{/if}
	<Exports bind:this={exportsRef} {project} {ws} {level} {projectName} roomId={patchRoom} />

	<!-- the tables docked under the drawing (floating / maximised they sit in the drawing area, above) -->
	<section class="grid-panel relative border-t border-zinc-200 bg-white" class:gone={!tablesDocked && !tablesBar}>
		{#if tablesDocked}
			<ResizeHandle orientation="horizontal" bind:value={panels.size.bottom} side="top" min={80} max={700} onend={panels.save} />
			{@render tables()}
		{:else if tablesBar}{@render tables(true)}{/if}
	</section>

	<StatusBar {ws} {hint} onfit={() => canvas?.zoomExtents()} onanswer={() => canvas?.refresh()} selected={selectedText} onzoomsel={zoomSel} />
</div>

<style>
	/* Colour tokens for cad's panels, lists and dialogs: today's light colors, or the app theme's when one is set
	   (kestrel.css --t-*), so Kestrel Dark stays readable. The drawing canvas keeps its own (white, like paper). */
	.shell {
		--cad-panel: var(--t-surface, white);
		--cad-subtle: var(--t-surface2, #fafafa);
		--cad-hover: var(--t-hover, #f4f4f5);
		--cad-strong: var(--t-surface3, #e4e4e7);
		--cad-line: var(--t-edge, #e4e4e7);
		--cad-input: var(--t-input, white);
		--cad-text: var(--t-ink, #18181b);
		--cad-muted: var(--t-ink2, #71717a);
		--cad-faint: var(--t-ink3, #a1a1aa);
		--cad-sel: var(--t-sel, #dbeafe);
		--cad-pick: #fef3c7;
		--cad-link: #1d4ed8;
	}
	:global(:root[data-theme='kestrel-dark']) .shell { --cad-pick: #3a3320; --cad-link: #79b8ff; }
	/* Layout lives here, not in Tailwind arbitrary classes: the panel sizes belong to the component. */
	.shell {
		display: grid;
		height: calc(100dvh - 28px);   /* the page's title bar is 28px: no gap under the status bar (Dave) */
		/* column / row sizes come from Panels (resizable, hideable) */
		grid-template-areas: 'menu menu menu' 'bar bar bar' 'dleft plan dright' 'dleft grid dright' 'status status status';
	}
	.bar { grid-area: bar; }
	.dock { position: relative; min-height: 0; display: flex; flex-direction: column; background: var(--cad-panel); overflow: hidden; }
	.dock-left { grid-area: dleft; border-right: 1px solid var(--cad-line); }
	.dock-right { grid-area: dright; border-left: 1px solid var(--cad-line); }
	.plan { grid-area: plan; min-height: 0; min-width: 0; display: flex; flex-direction: column; }
	.grid-panel { grid-area: grid; min-height: 0; min-width: 0; display: flex; }
	/* a drag on a panel's blank space doesn't select its text (Dave) — tables still do, for copying (fields always do) */
	.dock, .grid-panel { user-select: none; -webkit-user-select: none; }
	/* a selected row, the same in every table (UX review V2): the drawing's selection blue, a bar on its left */
	.shell :global(tr.row-sel) { background: #dbeafe !important; box-shadow: inset 3px 0 0 #2563eb; }
	.dock :global(table), .grid-panel :global(table) { user-select: text; -webkit-user-select: text; }
	.gone { display: none !important; }
	/* one or two views side by side */
	.panes { display: flex; flex: 1; min-height: 0; background: var(--cad-line); }
	.ib { display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; border-radius: 5px; color: var(--cad-muted); }
	.ib:hover:not(:disabled) { background: var(--cad-hover); color: var(--cad-text); }
	.ib:disabled { opacity: 0.35; }
	.ib.on { background: #dbeafe; color: #1d4ed8; }
	.ib.dim { color: var(--cad-faint); }
	.saved { margin-left: 8px; min-width: 3.5rem; text-align: right; }
	.drop { position: absolute; top: 0; bottom: 0; width: 6px; background: #3b82f6; opacity: 0.6; z-index: 60; pointer-events: none; }
	.drop-left { left: 0; }
	.drop-right { right: 0; }
	.pane { flex: 1 1 0; min-width: 0; position: relative; }
</style>
