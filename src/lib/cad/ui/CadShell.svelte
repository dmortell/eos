<!-- The cad workspace for one project: levels on the left, the plan in the middle, Properties on the right, the
     outlets grid below. Owns the CadProject + Workspace for its lifetime (created here, destroyed on unmount). -->
<script lang="ts">
	import { onDestroy, tick, untrack } from 'svelte'
	import { page } from '$app/state'
	import { replaceState } from '$app/navigation'
	import { readViewState, writeViewState } from '../app/urlState'
	import { firestore } from '$lib/db.svelte'
	import { CadProject } from '../app/project.svelte'
	import { Workspace, toolWorksIn, type ToolId } from '../app/workspace.svelte'
	import { deleteSelected as deleteSelectedOf, orderKey as orderKeyOf, groupKey as groupKeyOf } from '../app/selectionActions'
	import { HINT, HINT_PLACE } from './toolHints'
	import ViewCanvas from './ViewCanvas.svelte'
	import { PLAN, specKey, specLabel, type ViewSpec } from '../views/space'
	import Properties from './Properties.svelte'
	import ImportNotes from './ImportNotes.svelte'
	import ImportPanel from './ImportPanel.svelte'
	import FloorManager from './FloorManager.svelte'
	import RackList from './RackList.svelte'
	import BlockManager from './BlockManager.svelte'
	import CableList from './CableList.svelte'
	import SettingsDialog from './SettingsDialog.svelte'
	import LayersPanel from './LayersPanel.svelte'
	import ResizeHandle from './ResizeHandle.svelte'
	import { Panels } from '../app/panels.svelte'
	import { Icon } from '$lib'
	import { clipboardEvents } from '../app/clipboardEvents'
	import ToolOptions from './ToolOptions.svelte'
	import Exports from './Exports.svelte'
	import TablesPanel from './TablesPanel.svelte'
	import TabStrip from './TabStrip.svelte'
	import { Tabs, viewKey as viewKeyOf, type TabView } from '../app/tabs.svelte'
	import Navigator from './Navigator.svelte'
	import type { NavNode } from '../domain/navTree'
	import CadWindow from './CadWindow.svelte'
	import MenuBar from './MenuBar.svelte'
	import HelpDialog from './HelpDialog.svelte'
	import TitleBlockDialog from './TitleBlockDialog.svelte'
	import { buildMenus, selectionMenu, tabMenuOf } from './cadMenus'
	import { labelKind } from '../domain/labelEdit'
	import ContextMenu from './ContextMenu.svelte'
	import { WindowLayout, type WinId } from '../app/windows.svelte'
	import { blankSheet } from '../views/sheet'
	import { newId } from '../domain/ids'
	import type { Sheet } from '../domain/drawing'
	import { downloadSheetsPdf, unsupportedNote } from '../app/sheetsPdf'
	import ToolStrip from './ToolStrip.svelte'
	import StatusBar from './StatusBar.svelte'
	import AskBox from './AskBox.svelte'

	let { pid, user, projectName }: { pid: string; user: string; projectName: string } = $props()

	// Created once per mount (the route keys this component by pid).
	// svelte-ignore state_referenced_locally
	const project = new CadProject(pid, firestore, user)
	$effect(() => { project.name = projectName })
	const ws = new Workspace()
	const panels = new Panels()
	/** The windows (UX review S2): Navigator, Properties, Layers, Blocks, Racks, Cables — docked, floating or closed. */
	const layout = new WindowLayout()
	let helpOpen = $state<false | 'help' | 'keys'>(false)
	let titleBlockOpen = $state(false)
	let exportsRef: Exports | undefined = $state()
	/** The drawing area: floating windows sit in it, its edges dock them. */
	let planEl: HTMLElement | undefined = $state()
	ws.openTitleBlock = () => (titleBlockOpen = true)
	// svelte-ignore state_referenced_locally
	ws.layers.load(pid)
	ws.applyLinks = (label, add, remove) => project.applyLinks(label, add, remove)
	ws.openView = (s) => setPane(activePane, s)
	ws.openInTab = (v) => { if (v.levelId && project.index.get(v.levelId)) ws.levelId = v.levelId; setPane(activePane, structuredClone(v.spec), 'keep') }
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

	/** Drag the bar between split views (backlog "Resizable split bar"): the left pane's share, 15–85 %, kept per browser. */
	let panesEl: HTMLDivElement | undefined = $state()
	function splitDown(e: PointerEvent) {
		if (e.button !== 0 || !panesEl) return
		e.preventDefault()
		const bar = e.currentTarget as HTMLElement, r = panesEl.getBoundingClientRect()
		try { bar.setPointerCapture(e.pointerId) } catch { /* a synthetic pointer */ }
		const move = (m: PointerEvent) => { panels.split = Math.min(0.85, Math.max(0.15, (m.clientX - r.left) / r.width)) }
		const up = () => { bar.removeEventListener('pointermove', move); bar.removeEventListener('pointerup', up); panels.save() }
		bar.addEventListener('pointermove', move)
		bar.addEventListener('pointerup', up)
	}

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
	/** A view's name for the back / forward titles. */
	function viewName(v: ViewSpec | undefined): string | undefined {
		if (!v) return undefined
		if (v.kind === 'sheet') { const sh = project.index.get(v.sheetId); return sh?.type === 'sheet' ? `${sh.number} ${sh.title}` : 'a sheet' }
		if (v.kind === 'row') return `${project.index.nameOf(v.spaceId)} rack view`
		if (v.kind === 'section') return `Section ${project.index.nameOf(v.sectionId)}`
		return specLabel(v)
	}
	const exists = (v: ViewSpec) => (v.kind === 'sheet' ? !!project.index.get(v.sheetId) : v.kind === 'section' ? !!project.index.get(v.sectionId) : true)
	/** Back / forward inside the pane's tab (UX12 → D1, Alt+← / Alt+→). */
	function navPane(i: number, dir: -1 | 1) {
		const v = tabs.nav(i, dir, (x) => exists(x.spec))
		if (!v) return
		if (v.levelId && project.index.get(v.levelId)) ws.levelId = v.levelId
		setPane(i, structuredClone(v.spec), 'nav')
	}
	const navOf = (i: number) => { const t = tabs.of(i); return { back: viewName(t?.back.at(-1)?.spec), fwd: viewName(t?.fwd.at(-1)?.spec), go: (d: -1 | 1) => navPane(i, d) } }
	/** Show a tab in a pane (its level first). */
	function showTab(id: string, i = activePane) {
		const t = tabs.get(id)
		if (!t) return
		tabs.paneTab[i] = id
		tabs.save()
		if (t.view.levelId && project.index.get(t.view.levelId)) ws.levelId = t.view.levelId
		setPane(i, structuredClone(t.view.spec), 'show')
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
	$effect(() => { if (!toolWorksIn(untrack(() => ws.toolId), activeKind)) untrack(() => setTool('select')) })

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
	 *  a tab yourself in that kind of view (remembered per kind for the session). */
	const bottomPicked: Partial<Record<ViewSpec['kind'], BottomTab>> = {}
	const BOTTOM_FOR: Partial<Record<ViewSpec['kind'], BottomTab>> = { sheet: 'sheets', row: 'patch' }
	$effect(() => { const k = activeKind; untrack(() => (bottom = bottomPicked[k] ?? BOTTOM_FOR[k] ?? 'outlets')) })
	function pickBottom(t: BottomTab) { bottom = t; bottomPicked[activeKind] = t }
	let floorsOpen = $state(false)
	let typesOpen = $state(false)

	// Blocks opens with the Insert tool, unless you closed it this session (Racks no longer opens by itself in a rack
	// view, UX review L1: the Navigator lists each room's racks; Window › Racks for its tools)
	$effect(() => { if (ws.toolId === 'insert') untrack(() => layout.open('blocks', false)) })
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
	const tablesRow = $derived(tablesDocked ? (panels.tables.folded ? 29 : panels.size.bottom) : 0)
	const dockW = (side: 'left' | 'right') => (layout.docked(side).length ? panels.size[side] : 0)
	const sheetsAll = $derived([...project.index.byId.values()].filter((e): e is Sheet => e.type === 'sheet' && e.status !== 'archived').sort((a, b) => a.order - b.order))
	/** A Navigator row: its view in the active pane (its level first); a rack zooms to itself; a sheet / rack / section is
	 *  selected. The spec is copied: the tree's comes from frozen store data. */
	function navOpen(n: NavNode, keep = false) {
		const o = n.open
		if (!o) return
		if (o.levelId && o.levelId !== ws.levelId) ws.levelId = o.levelId
		setPane(activePane, structuredClone(o.spec), keep ? 'keep' : 'open')
		if (n.kind === 'rack' && n.id) ws.focus = n.id
		if (n.select) ws.select([n.select])
	}
	function openTable(t: BottomTab) { panels.shown.bottom = true; panels.save(); pickBottom(t) }
	function newSheet() {
		const sh = blankSheet(sheetsAll, newId())
		project.store.transact(`New sheet ${sh.number}`, (tx) => tx.put(sh))
		setPane(activePane, { kind: 'sheet', sheetId: sh.id }, 'keep')
		ws.select([sh.id])
	}
	async function pdfAllSheets() {
		try { const r = await downloadSheetsPdf(project, sheetsAll); ws.say(`PDF: ${r.pages} pages${unsupportedNote(r.unsupported, r.rasterised)}`) }
		catch (e) { project.error = `PDF failed: ${(e as Error).message}` }
	}
	function toggleDrafting(k: 'snap' | 'osnap' | 'showGrid') {
		ws.drafting[k] = !ws.drafting[k]; ws.saveDrafting()
		ws.say(`${{ snap: 'SNAP', osnap: 'OSNAP', showGrid: 'GRID' }[k]} ${ws.drafting[k] ? 'on' : 'off'}`)
	}
	/** The menu bar (UX review S4): rebuilt when what it shows changes (ticks, what's possible). */
	const menus = $derived(buildMenus({
		outletSchedule: (all) => exportsRef?.outletSchedule(all), dxf: () => exportsRef?.dxf(), pdfAllSheets, hasSheets: sheetsAll.length > 0,
		undo: () => showHistory(project.undo()), redo: () => showHistory(project.redo()), canUndo: project.canUndo, canRedo: project.canRedo,
		copy: () => document.execCommand('copy'), cut: () => document.execCommand('cut'),
		paste: () => ws.say('Paste with Ctrl+V (the browser lets a page paste only from the keyboard)'),
		remove: deleteSelected, hasSelection: ws.selection.length > 0 || !!ws.portSel || !!ws.openingSel,
		selectAll: () => canvas?.selectAll(), selectSimilar: () => canvas?.selectSimilar(),
		group: () => groupKey(false), ungroup: () => groupKey(true), order: orderKey,
		find: () => { layout.open('navigator'); ws.navSearch++ }, fit: () => canvas?.zoomExtents(), split: panes.length === 2, toggleSplit,
		tables: tablesShown, toggleTables: () => panels.toggle('bottom'), hideAll: layout.allHidden, toggleHideAll: () => (layout.allHidden = !layout.allHidden),
		back: () => navPane(activePane, -1), forward: () => navPane(activePane, 1), canBack: (tabs.of(activePane)?.back.length ?? 0) > 0, canFwd: (tabs.of(activePane)?.fwd.length ?? 0) > 0,
		fill: ws.showFill, toggleFill: () => (ws.showFill = !ws.showFill), isPlan: activeKind === 'plan',
		drafting: ws.drafting, toggleDrafting,
		tool: setTool, toolOk: (id) => toolWorksIn(id, activeKind), openTable,
		cordBom: () => exportsRef?.openCordBom(), cableSchedule: () => exportsRef?.openCables(), bom: () => exportsRef?.openBom(),
		newSheet, sheetFromView: () => canvas?.toSheet('new'), canSheetFromView: activeKind !== 'sheet', titleBlock: () => (titleBlockOpen = true),
		floors: () => (floorsOpen = true), settings: () => (typesOpen = true),
		win: { shown: (id) => layout.shown(id), toggle: (id) => layout.toggle(id), reset: () => layout.reset() },
		help: (keys) => (helpOpen = keys ? 'keys' : 'help'),
	}))

	/** The right-click menu on the selection (UX21): its commands, with their keys. */
	const contextItems = $derived(ws.contextMenu ? selectionMenu(ws.selection.map((id) => project.index.get(id)), {
		editLabel: (id) => ws.editText(id), remove: deleteSelected, similar: () => canvas?.selectSimilar(),
		group: groupKey, order: orderKey, properties: () => layout.open('properties'),
	}) : [])

	/** The cord defaults start from the project's settings once, then stay as last chosen (sticky). */
	let cordDefaultsSet = false
	function setTool(id: ToolId) {
		canvas?.cancel()
		if (id === 'renumber') ws.select([])   // a fresh pick: the click order is the numbering order
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
	const clipboard = clipboardEvents({ project, ws, target: () => canvas?.pasteTarget(), inRow: () => activeKind === 'row' })

	/** Arrow keys nudge the selection (view directions: y down). */
	const ARROWS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
	function onKey(e: KeyboardEvent) {
		if (e.target instanceof Element && e.target.closest('input, select, textarea')) return
		const mod = e.ctrlKey || e.metaKey
		if (!mod && canvas?.key(e)) { e.preventDefault(); return }   // the active tool first (Enter, Backspace, R …)
		if (!mod && /^[0-9@.\-]$/.test(e.key) && canvas?.takesTyping()) { e.preventDefault(); typePoint(e.key); return }
		const k = e.key.toLowerCase(), arrow = ARROWS[e.key]
		if (mod && (k === 'z' || k === 'y')) canvas?.endNudge()   // a nudge burst is its own undo step
		if (mod && k === 'z' && !e.shiftKey) { e.preventDefault(); showHistory(project.undo()) }
		else if (mod && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); showHistory(project.redo()) }
		else if (mod && k === 'a') { e.preventDefault(); canvas?.selectAll() }
		else if (mod && k === 'g') { e.preventDefault(); groupKey(e.shiftKey) }
		else if (e.key === 'F2' && ws.selection.length === 1) {
			// F2: edit the selected thing's words in place (a text, a leader, an outlet's label, a rack's name, a run's label)
			if (labelKind(project.index.get(ws.selection[0]))) { e.preventDefault(); ws.editText(ws.selection[0]) }
		}
		else if (mod && (e.code === 'BracketRight' || e.code === 'BracketLeft')) { e.preventDefault(); orderKey(e.code === 'BracketRight' ? (e.shiftKey ? 'front' : 'forward') : e.shiftKey ? 'back' : 'backward') }
		else if (e.key === 'F1') { e.preventDefault(); helpOpen = 'help' }
		else if (mod && k === 'k') { e.preventDefault(); layout.open('navigator'); ws.navSearch++ }
		else if (e.key === '?' && !mod) { e.preventDefault(); helpOpen = 'keys' }
		else if (mod && e.key === '.') { e.preventDefault(); layout.allHidden = !layout.allHidden }
		else if (mod && e.key === ',') { e.preventDefault(); panels.toggle('bottom') }
		else if (e.altKey && !mod && (k === 'w' || e.code === 'KeyW')) { e.preventDefault(); const t = tabs.paneTab[activePane]; if (t) closeTab(t) }
		else if (e.altKey && !mod && (e.key === 'PageUp' || e.key === 'PageDown')) {
			e.preventDefault()
			const at = tabs.list.findIndex((t) => t.id === tabs.paneTab[activePane]), n = tabs.list.length
			if (n) showTab(tabs.list[(at + (e.key === 'PageDown' ? 1 : -1) + n) % n].id)
		}
		else if (e.altKey && !mod && /^Digit[1-9]$/.test(e.code)) { e.preventDefault(); const t = tabs.list[Number(e.code.slice(5)) - 1]; if (t) showTab(t.id) }
		else if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); navPane(activePane, e.key === 'ArrowLeft' ? -1 : 1) }
		else if (e.key === 'F9' || e.key === 'F3' || e.key === 'F7') {
			// the drafting switches (UX05): F9 SNAP, F3 OSNAP, F7 GRID
			e.preventDefault()
			toggleDrafting(e.key === 'F9' ? 'snap' : e.key === 'F3' ? 'osnap' : 'showGrid')
		}
		else if (arrow && !mod && ws.selection.length) { e.preventDefault(); canvas?.nudge(arrow[0], arrow[1], e.shiftKey) }
		else if (e.key === 'Delete' || e.key === 'Backspace') deleteSelected()
		else if (e.key === 'Escape') { if (ws.confirm) ws.confirm = null; else if (ws.prompt) ws.prompt = null; else if (ws.toolId !== 'select') setTool('select'); else if (ws.selection.length || !ws.vpEdit) ws.select([]); else canvas?.leaveViewport() }
		else if (e.key === 'Home') canvas?.zoomExtents()
		else if (e.key === 'PageDown' || e.key === 'PageUp') { e.preventDefault(); canvas?.page(e.key === 'PageDown' ? 1 : -1, e.shiftKey) }	}
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
		<ToolStrip tool={ws.toolId} kind={activeKind} onTool={setTool} />
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

	{#snippet tables()}
		<TablesPanel {project} {ws} {panels} {level} {projectName} roomId={patchRoom} inRoomView={panes[activePane]?.kind === 'row'}
			tab={bottom} onpick={pickBottom} onview={(s) => setPane(activePane, s)} area={planEl} />
	{/snippet}

	{#snippet winBody(id: WinId)}
		{#if id === 'navigator'}
			<Navigator {project} {ws} current={{ levelId: ws.levelId ?? undefined, spec: panes[activePane] }} onopen={navOpen} tabbed={new Set(tabs.list.map((t) => viewKeyOf(t.view)))} onfloors={() => (floorsOpen = true)} onsettings={() => (typesOpen = true)} onnewsheet={newSheet} onpdfall={pdfAllSheets} />
		{:else if id === 'properties'}
			<Properties {project} {ws} />
			<ImportNotes {project} {ws} />
		{:else if id === 'layers'}
			<div class="p-2"><LayersPanel {project} {ws} /></div>
		{:else if id === 'blocks'}
			<div class="p-2"><BlockManager {project} {ws} levelId={level?.id} onpick={(b) => { if (b) { ws.insertBlock = b; setTool('insert') } else setTool('select') }} /></div>
		{:else if id === 'racks'}
			<div class="p-2">{#if level}<RackList {project} {ws} {projectName} levelId={level.id} onview={(s) => setPane(activePane, s)} />{/if}</div>
		{:else if id === 'cables'}
			<div class="p-2"><CableList {project} {ws} /></div>
		{/if}
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
						<div class="split-bar" role="separator" aria-orientation="vertical" title="Drag to resize the two views · double-click: equal" onpointerdown={splitDown} ondblclick={() => { panels.split = 0.5; panels.save() }}></div>
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
	{#if typesOpen}<SettingsDialog {project} onclose={() => (typesOpen = false)} />{/if}
	{#if titleBlockOpen}<TitleBlockDialog {project} onclose={() => (titleBlockOpen = false)} />{/if}
	{#if helpOpen}<HelpDialog keys={helpOpen === 'keys'} hints={HINT} onclose={() => (helpOpen = false)} ontool={setTool} />{/if}
	{#if tabMenu}<ContextMenu x={tabMenu.x} y={tabMenu.y} items={tabMenuItems} onclose={() => (tabMenu = null)} />{/if}
	{#if ws.contextMenu}<ContextMenu x={ws.contextMenu.x} y={ws.contextMenu.y} items={contextItems} onclose={() => (ws.contextMenu = null)} />{/if}
	<Exports bind:this={exportsRef} {project} {ws} {level} {projectName} roomId={patchRoom} />

	<!-- the tables docked under the drawing (floating / maximised they sit in the drawing area, above) -->
	<section class="grid-panel relative border-t border-zinc-200 bg-white" class:gone={!tablesDocked}>
		<ResizeHandle orientation="horizontal" bind:value={panels.size.bottom} side="top" min={80} max={700} onend={panels.save} />
		{#if tablesDocked}{@render tables()}{/if}
	</section>

	<StatusBar {ws} {hint} onfit={() => canvas?.zoomExtents()} onanswer={() => canvas?.refresh()} />
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
		height: calc(100vh - 3rem);
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
	.split-bar { flex: 0 0 5px; cursor: col-resize; background: var(--cad-line); touch-action: none; }
	.split-bar:hover, .split-bar:active { background: #93c5fd; }
	.pane { flex: 1 1 0; min-width: 0; position: relative; }
</style>
