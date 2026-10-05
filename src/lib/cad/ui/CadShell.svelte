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
	import { deleteEntities, deleteViewport, levelContents, deleteImpact, impactText, sectionViewports, retargetSectionViewports, groupSelection, ungroupSelection } from '../editor/commands'
	import { deletePicked } from '../editor/pathSel'
	import { reservePorts } from '../domain/ports'
	import type { Level } from '../domain/types'
	import ViewCanvas from './ViewCanvas.svelte'
	import { PLAN, specKey, specLabel, type ViewSpec } from '../views/space'
	import OutletGrid from './OutletGrid.svelte'
	import PatchList from './PatchList.svelte'
	import Properties from './Properties.svelte'
	import ImportNotes from './ImportNotes.svelte'
	import SheetList from './SheetList.svelte'
	import SheetsTab from './SheetsTab.svelte'
	import ImportPanel from './ImportPanel.svelte'
	import FloorManager from './FloorManager.svelte'
	import RackList from './RackList.svelte'
	import BlockManager from './BlockManager.svelte'
	import SideSection from './SideSection.svelte'
	import CableList from './CableList.svelte'
	import SectionList from './SectionList.svelte'
	import SettingsDialog from './SettingsDialog.svelte'
	import { reorderShapes } from '../domain/shapes'
	import { labelKind } from '../domain/labelEdit'
	import LinksTable from './LinksTable.svelte'
	import LayersPanel from './LayersPanel.svelte'
	import ResizeHandle from './ResizeHandle.svelte'
	import { Panels } from '../app/panels.svelte'
	import { Icon } from '$lib'
	import { clipboardEvents } from '../app/clipboardEvents'
	import ExportMenu from './ExportMenu.svelte'
	import ToolOptions from './ToolOptions.svelte'
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
	// svelte-ignore state_referenced_locally
	ws.layers.load(pid)
	ws.applyLinks = (label, add, remove) => project.applyLinks(label, add, remove)
	ws.openView = (s) => setPane(activePane, s)
	ws.remove = () => deleteSelected()
	ws.selectSimilar = () => canvas?.selectSimilar()
	onDestroy(() => project.destroy())

	// the view state comes back from the URL on a refresh (Dave): level, the panes' views, the active pane
	const fromUrl = readViewState(page.url.searchParams)
	if (fromUrl.levelId) ws.levelId = fromUrl.levelId

	/** One or two panes side by side, each a plan or an elevation of the open level; the active one takes keys. */
	let panes = $state<ViewSpec[]>(fromUrl.panes ?? [PLAN])
	let activePane = $state(fromUrl.active ?? 0)
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
	function setPane(i: number, s: ViewSpec, how: 'go' | 'nav' = 'go') {
		canvases[i]?.cancel()
		const from = panes[i]
		if (how === 'go' && from && specKey(from) !== specKey(s)) { hist[i].back = [...hist[i].back.slice(-49), $state.snapshot(from) as ViewSpec]; hist[i].fwd = [] }
		panes[i] = s
		void tick().then(() => {
			const keep = ws.selection.filter((id) => canvases.some((c) => c?.draws(id)))
			if (keep.length !== ws.selection.length) ws.select(keep)
		})
	}
	/** Back / forward per pane (UX12, Alt+← / Alt+→): the views it showed before, and the ones gone back from. */
	let hist = $state<{ back: ViewSpec[]; fwd: ViewSpec[] }[]>([{ back: [], fwd: [] }, { back: [], fwd: [] }])
	const exists = (v: ViewSpec) => (v.kind === 'sheet' ? !!project.index.get(v.sheetId) : v.kind === 'section' ? !!project.index.get(v.sectionId) : true)
	function navPane(i: number, dir: -1 | 1) {
		const h = hist[i], list = dir < 0 ? h.back : h.fwd
		let to: ViewSpec | undefined
		while ((to = list.pop()) && !exists(to)) { /* a deleted sheet / section: skip it */ }
		if (!to) return
		const here = $state.snapshot(panes[i]) as ViewSpec
		if (dir < 0) h.fwd.push(here); else h.back.push(here)
		setPane(i, to, 'nav')
	}
	/** A view's name for the back / forward titles. */
	function viewName(v: ViewSpec | undefined): string | undefined {
		if (!v) return undefined
		if (v.kind === 'sheet') { const sh = project.index.get(v.sheetId); return sh?.type === 'sheet' ? `${sh.number} ${sh.title}` : 'a sheet' }
		if (v.kind === 'row') return `${project.index.nameOf(v.spaceId)} rack view`
		if (v.kind === 'section') return `Section ${project.index.nameOf(v.sectionId)}`
		return specLabel(v)
	}
	const navOf = (i: number) => ({ back: viewName(hist[i].back.at(-1)), fwd: viewName(hist[i].fwd.at(-1)), go: (d: -1 | 1) => navPane(i, d) })
	/** A pane showing a sheet (or section) that was deleted goes back to the plan. */
	$effect(() => {
		void project.rev
		panes.forEach((s, i) => {
			const gone = s.kind === 'sheet' ? !project.store.get(s.sheetId) : s.kind === 'section' ? !project.store.get(s.sectionId) : false
			if (gone && project.loaded) untrack(() => setPane(i, PLAN))
		})
	})
	/** A level from the list: its model. A pane showing something that isn't this level's (a sheet, the riser view,
	 *  another floor's racks) goes to the level's plan (Dave: clicking a level with S001 open did nothing visible). */
	function openLevel(id: string) {
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
	const openSheet = $derived.by(() => { const p = panes[activePane]; return p?.kind === 'sheet' ? p.sheetId : undefined })
	/** The kind of view in the active pane — which tools can be used (TOOL_VIEWS). */
	const activeKind = $derived(panes[activePane]?.kind ?? 'plan')
	/** The open level is what the active pane shows (a sheet or the riser view isn't one level's). */
	const levelShown = $derived(activeKind !== 'sheet' && activeKind !== 'riser')
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

	const counts = $derived.by(() => {
		const m = new Map<string, number>()
		for (const o of project.index.outlets) m.set(o.levelId, (m.get(o.levelId) ?? 0) + 1)
		return m
	})

	const HINT: Partial<Record<ToolId, string>> = {
		insert: 'Click to place the block (pick it in Blocks, left) · in an elevation / section it goes on the wall behind the click, at that height · Esc stops',
		move: 'Select first · click a base point, then where it goes (snaps · Shift 15° · type @dx,dy) · Esc stops',
		copy: 'Select first · click a base point, then each place for a copy (snaps · Shift 15° · type @dx,dy) · Enter / Esc ends',
		dimension: 'Click the two points to measure (they snap), then where the dimension line goes · Backspace drops a point · Esc stops',
		legend: 'Click where its top-left corner goes (plan: lists this level · sheet: the levels its viewports show) · rows, title, size in Properties',
		viewport: 'Drag a box on the paper (or click two corners) · it shows the other pane’s view, else the last plan / elevation / rack view, scaled to fit · at least 20 × 20 mm · Esc stops',
		box: 'A box / desk on the plan: its footprint corner to corner (or drag) · its height and Z in the tool bar (and Properties) · shows in elevations and sections · Esc stops',
		shape: 'Click two points (or drag) · on a plan, on an elevation (at the work depth), on a sheet or inside a viewport · Esc stops',
		select: 'Double-click (or F2) a label / text to edit it, Tab = the next one · double-click a selected run to add a point · Ctrl-drag a point to branch, an item to copy · Ctrl+G groups, Ctrl+Shift+G ungroups · Ctrl+] / Ctrl+[ draw order',
		outlet: 'Click to place the next outlet · or type @1200,0 for the next one 1.2 m along',
		line: 'Click or type points (x,y · @dx,dy · @d<a · a distance) · Shift = 15° steps · Enter finishes · C or a click on the first point closes it · Esc / right-click ends it, again → Select · Backspace undoes a point',
		trunk: 'Click or type points · Shift = 15° steps · R = rise / drop · V = riser to another level · Enter finishes · C closes it · Esc / right-click ends it, again → Select · snap onto an outlet or rack to attach',
		conduit: 'Click or type points · Shift = 15° steps · R = rise / drop · V = riser to another level · Enter finishes · C closes it · Esc / right-click ends it, again → Select',
		wall: 'Click or type points · Shift = 15° steps · Enter finishes · C or a click on the first point closes it (a room) · Esc / right-click ends it, again → Select',
		section: 'Click (or type) the two ends of the cut line · it looks to the line\'s left as drawn · Flip, depth and Open in Properties',
		opening: 'Click a wall: a hole W wide from Z to Z + H, with the chosen swing · edit or delete it in the wall\'s Properties',
		rack: 'Click on the plan to draw a rack (like the last one: room, row, size, rotation) · Esc stops',
		device: 'In a rack view (Racks list → Rack view): click a rack at the U for the device · drag devices with Select to move them',
		assign: 'Click a panel port in a rack view — the chosen outlets go on from there (pinned) · Esc cancels',
		cord: 'In a rack view: click a port, then the port to patch it to · a panel port needs a label first · Esc cancels',
		renumber: 'Click outlets, racks or labelled shapes in order · click a picked one to go back to it · Backspace drops the last · start / step in Properties, then Renumber · Esc / right-click ends',
		text: 'Click where the text goes and type over "Text" · click a text to edit it · Enter saves, Shift+Enter = new line',
		leader: 'Press at the tip and drag to where the words go (a callout) — or click the tip, then bends, Enter ends · then type its words on the drawing · border in Properties · Backspace undoes a point',
		cloud: 'On a sheet: click round the area to mark · Enter closes the cloud · Esc / right-click ends it, again → Select · Backspace undoes a point',
	}
	const HINT_PLACE = 'Click on the plan to place the rack (its centre) · Esc cancels'
	/** The status bar's hint: the tool's, or (Select) the selected viewport's ways of working. */
	const hint = $derived(ws.toolId === 'rack' && ws.rackTool.target ? HINT_PLACE : HINT[ws.toolId] ?? '')


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

	// ── levels: rename, delete (Dave: Journey's 1F and 3307F aren't needed) ──
	function renameLevel(l: Level) {
		ws.askText('Level name', l.name, (t) => { if (t.trim() && t.trim() !== l.name) project.store.transact(`Rename level ${l.name} → ${t.trim()}`, (tx) => tx.put({ ...l, name: t.trim() })) })
	}
	function deleteLevel(l: Level) {
		const on = levelContents(project.store.all(), l.id)
		ws.ask2(`Delete level ${l.name} and everything on it (${on.length} item${on.length === 1 ? '' : 's'}: outlets, racks + devices, links, cords, drawing, floorplan, rooms)? Undo brings it back.`, 'Delete level', () => {
			deleteEntities(project.store, [l.id, ...on])
			if (ws.levelId === l.id) ws.levelId = project.levels.find((x) => x.id !== l.id)?.id ?? null
		})
	}
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
		ws.askText('Point — x,y · @dx,dy · @d<angle · distance', first, (text) => {
			const err = canvas?.typed(text) ?? null
			if (err) ws.say(err)
		})
	}

	/** Delete acts on the smallest thing picked: a hole (the wall stays), a viewport (the sheet stays), ports (their
	 *  reservation; the device stays). Racks holding devices ask first — the devices, links and cords go too. */
	function deleteSelected() {
		const op = ws.openingSel, wall = op ? project.store.get(op.wallId) : undefined
		if (op && wall?.type === 'shape' && wall.role?.kind === 'wall') {
			const role = wall.role
			project.store.transact('Delete opening', (tx) => tx.put({ ...wall, role: { ...role, openings: role.openings.filter((o) => o.id !== op.openingId) } }))
			ws.selectOpening(op.wallId, null)
			return
		}
		const sheet = ws.viewportId && ws.selection.length === 1 ? project.store.get(ws.selection[0]) : undefined
		const vp = sheet?.type === 'sheet' ? sheet.viewports.find((v) => v.id === ws.viewportId) : undefined
		if (sheet?.type === 'sheet' && vp) { deleteViewport(project.store, sheet, vp); ws.selectViewport(null); return }
		const ps = ws.portSel, dev = ps ? project.store.get(ps.on) : undefined
		if (ps) {
			const next = dev?.type === 'device' ? reservePorts(dev, ps.ports, '', '') : null
			if (next) project.store.transact('Clear reservation', (tx) => tx.put(next))
			else ws.say('Delete on ports clears their reservation — none here. Click the device body to delete the device.')
			return
		}
		// picked nodes / segments of the selected run: just those (a node heals the run; segments may split it)
		const pth = ws.pathSel, run = pth ? project.store.get(pth.shape) : undefined
		if (pth && run?.type === 'shape') {
			const out = deletePicked(run, pth)
			project.store.transact(pth.nodes.length ? (pth.nodes.length === 1 ? 'Delete node' : `Delete ${pth.nodes.length} nodes`) : pth.segs.length === 1 ? 'Delete segment' : `Delete ${pth.segs.length} segments`, (tx) => { if (!out.length) tx.del(run.id); for (const p of out) tx.put(p) })
			ws.selectPath(null)
			ws.select(out.some((p) => p.id === run.id) ? [run.id] : [])
			if (out.length > 1) ws.say(`The run is now ${out.length} separate runs`)
			return
		}
		if (!ws.selection.length) return
		// a rack's devices, a device's links / cords, a sheet's viewports / notes go too: ask first, saying what
		const ids = ws.selection, also = impactText(deleteImpact(project.store, ids))
		// a section shown in viewports: keep them as plain elevations (same view direction), or take them off too
		const shown = sectionViewports(project.store, ids)
		if (shown.length) {
			const del = (keep: boolean) => () => { deleteEntities(project.store, ids, retargetSectionViewports(project.store, project.index, ids, keep)); ws.select([]) }
			const where = [...new Set(shown.map((h) => h.sheet.number))].join(', ')
			ws.ask2(`The section is shown in ${shown.length} viewport${shown.length === 1 ? '' : 's'} (${where})${also ? `; ${also} go too` : ''}.`, 'Delete, keep viewports as elevations', del(true), { label: 'Delete with its viewports', apply: del(false) })
			return
		}
		const go = () => { deleteEntities(project.store, ids); ws.select([]) }
		if (!also) return go()
		const one = ids.length === 1 ? project.store.get(ids[0]) : undefined
		const what = !one ? `${ids.length} items` : one.type === 'sheet' ? `sheet ${one.number}` : `${one.type} ${project.index.nameOf(one.id)}`.trim()
		ws.ask2(`Delete ${what} with ${also}? Undo brings them back.`, 'Delete', go)
	}
	const clipboard = clipboardEvents({ project, ws, target: () => canvas?.pasteTarget(), inRow: () => activeKind === 'row' })
	/** Ctrl+] / Ctrl+[ bring the selected shapes forward / send them back; with Shift to the front / back. */
	function orderKey(how: 'forward' | 'backward' | 'front' | 'back') {
		const moved = reorderShapes(project.index.shapes, ws.selection, how)
		const word = { forward: 'Bring forward', backward: 'Send backward', front: 'Bring to front', back: 'Send to back' }[how]
		if (!moved.length) { ws.say(ws.selection.length ? `${word}: already there` : 'Select drawn shapes first'); return }
		project.store.transact(word, (tx) => { for (const s of moved) tx.put(s) })
	}
	/** Ctrl+G groups the selected shapes, Ctrl+Shift+G ungroups them (backlog "Group / ungroup"). */
	function groupKey(ungroup: boolean) {
		if (ungroup) { const n = ungroupSelection(project.store, ws.selection); ws.say(n ? `Ungrouped ${n} shapes` : 'Nothing selected is in a group'); return }
		const r = groupSelection(project.store, ws.selection)
		ws.say('problem' in r ? r.problem : `Grouped ${r.n} shapes · a click on one selects them all · Ctrl+Shift+G ungroups`)
	}

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
		else if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); navPane(activePane, e.key === 'ArrowLeft' ? -1 : 1) }
		else if (e.key === 'F9' || e.key === 'F3' || e.key === 'F7') {
			// the drafting switches (UX05): F9 SNAP, F3 OSNAP, F7 GRID
			e.preventDefault()
			const k = e.key === 'F9' ? 'snap' : e.key === 'F3' ? 'osnap' : 'showGrid'
			ws.drafting[k] = !ws.drafting[k]; ws.saveDrafting()
			ws.say(`${{ snap: 'SNAP', osnap: 'OSNAP', showGrid: 'GRID' }[k]} ${ws.drafting[k] ? 'on' : 'off'}`)
		}
		else if (arrow && !mod && ws.selection.length) { e.preventDefault(); canvas?.nudge(arrow[0], arrow[1], e.shiftKey) }
		else if (e.key === 'Delete' || e.key === 'Backspace') deleteSelected()
		else if (e.key === 'Escape') { if (ws.confirm) ws.confirm = null; else if (ws.prompt) ws.prompt = null; else if (ws.toolId !== 'select') setTool('select'); else ws.select([]) }
		else if (e.key === 'Home') canvas?.zoomExtents()
		else if (e.key === 'PageDown' || e.key === 'PageUp') { e.preventDefault(); canvas?.page(e.key === 'PageDown' ? 1 : -1, e.shiftKey) }	}
</script>

<svelte:window onkeydown={onKey} onkeyup={(e) => { if (ARROWS[e.key]) canvas?.endNudge() }} oncopy={clipboard.copy} oncut={clipboard.cut} onpaste={clipboard.paste} />

<div class="shell bg-zinc-50 text-sm" style:grid-template-columns={panels.columns} style:grid-template-rows="{panels.rows} 1.6rem">
	<!-- toolbar -->
	<div class="bar flex items-center gap-1 border-b border-zinc-200 bg-white px-2">
		<ToolStrip tool={ws.toolId} kind={activeKind} onTool={setTool} />
		<ToolOptions {project} {ws} {level} kind={activeKind} />
		<span class="ml-auto"></span>
		<button class="ib" disabled={!project.canUndo} onclick={() => showHistory(project.undo())} title="Undo (Ctrl+Z) — selects what came back or changed (on its level)"><Icon name="undo" size={15} /></button>
		<button class="ib" disabled={!project.canRedo} onclick={() => showHistory(project.redo())} title="Redo (Ctrl+Y) — selects what it changed (on its level)"><Icon name="redo" size={15} /></button>
		<button class="ib" disabled={!ws.selection.length && !ws.portSel && !ws.openingSel} onclick={deleteSelected} title="Delete the selection (Delete key) — asks first when more goes with it; Undo brings it back"><Icon name="trash" size={15} /></button>
		<span class="mx-1 h-5 w-px bg-zinc-200"></span>
		<button class="ib {panes.length === 2 ? 'on' : ''}" onclick={toggleSplit} title="Two views side by side (plan + elevation)"><Icon name="panels" size={15} /></button>
		{#each [['left', 'panelLeft', 'the left panel (levels, sheets, racks, layers)'], ['bottom', 'panelBottom', 'the tables (outlets, patch list, sheets)'], ['right', 'sidebar', 'Properties']] as const as [side, icon, what] (side)}
			<button class="ib {panels.shown[side] ? '' : 'dim'}" onclick={() => panels.toggle(side)} title="{panels.shown[side] ? 'Hide' : 'Show'} {what} — drag a panel's edge to resize it"><Icon name={icon} size={15} /></button>
		{/each}
		<span class="mx-1 h-5 w-px bg-zinc-200"></span>
		<ExportMenu {project} {ws} {level} {projectName} />
		<span class="saved text-xs text-zinc-500">
			{#if project.error}<span class="text-red-600">{project.error}</span>
			{:else if !project.loaded}Loading…
			{:else if project.pendingWrites}Saving…{:else}Saved{/if}
		</span>
	</div>

	<!-- levels -->
	<nav class="levels relative overflow-auto border-r border-zinc-200 bg-white p-2" class:gone={!panels.shown.left}>
		<ResizeHandle bind:value={panels.size.left} side="right" min={150} max={480} onend={panels.save} />
		<SideSection key="levels" title="Levels" first>
			{#snippet actions()}<button title="The building's floors, their names and heights" onclick={() => (floorsOpen = true)}>Floors…</button><button title="The project's outlet usages and cable types" onclick={() => (typesOpen = true)}>Settings…</button>{/snippet}
			{#each project.levels as l (l.id)}
				<div class="lvl flex items-center rounded {ws.levelId === l.id ? (levelShown ? 'on' : 'on dim') : 'hover:bg-zinc-100'}" title={ws.levelId === l.id && !levelShown ? 'The open level — not showing now: a sheet or the riser view is open' : undefined}>
					<button class="flex flex-1 justify-between px-2 py-0.5 text-left" title={l.area ? `A separate plan of floor ${l.number} (area ${l.area})` : ''}
						onclick={() => openLevel(l.id)}>
						<span>{l.name}</span><span class="text-xs text-zinc-400">{counts.get(l.id) ?? ''}</span>
					</button>
					<button class="act" title="Rename this level" onclick={() => renameLevel(l)}>✎</button>
					<button class="act" title="Delete this level and everything on it" onclick={() => deleteLevel(l)}>✕</button>
				</div>
			{/each}
		</SideSection>
		<SheetList {project} {ws} open={openSheet} onview={(s) => setPane(activePane, s)} />
		<SectionList {project} {ws} onview={(s) => setPane(activePane, s)} />
		{#if level}<RackList {project} {ws} {projectName} levelId={level.id} onview={(s) => setPane(activePane, s)} />{/if}
		<BlockManager {project} {ws} levelId={level?.id} onpick={(b) => { if (b) { ws.insertBlock = b; setTool('insert') } else setTool('select') }} />
		<CableList {project} {ws} />
		<LayersPanel {project} {ws} />
	</nav>

	<!-- plan -->
	<main class="plan relative">
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
			<div class="pointer-events-none absolute right-2 top-1 text-xs font-semibold text-zinc-500">{level.name}</div>
		{/if}
	</main>

	<!-- properties -->
	<aside class="props relative border-l border-zinc-200 bg-white" class:gone={!panels.shown.right}>
		<ResizeHandle bind:value={panels.size.right} side="left" min={200} max={560} onend={panels.save} />
		<div class="props-body"><Properties {project} {ws} /></div>
		<ImportNotes {project} {ws} />
	</aside>

	{#if floorsOpen}<FloorManager {project} {ws} onclose={() => (floorsOpen = false)} />{/if}
	{#if typesOpen}<SettingsDialog {project} onclose={() => (typesOpen = false)} />{/if}

	<!-- tables: outlets (this level) | patch list (the project) -->
	<section class="grid-panel relative border-t border-zinc-200 bg-white" class:gone={!panels.shown.bottom}>
		<ResizeHandle orientation="horizontal" bind:value={panels.size.bottom} side="top" min={80} max={700} onend={panels.save} />
		<div class="tabs">
			<button class:on={bottom === 'outlets'} onclick={() => pickBottom('outlets')}>Outlets</button>
			<button class:on={bottom === 'patch'} onclick={() => pickBottom('patch')}>Patch list</button>
			<button class:on={bottom === 'sheets'} onclick={() => pickBottom('sheets')}>Sheets</button>
			<button class:on={bottom === 'links'} onclick={() => pickBottom('links')}>Links</button>
		</div>
		<div class="tab-body">
			{#if bottom === 'patch'}<PatchList {project} {ws} {projectName} roomId={patchRoom} />
			{:else if bottom === 'sheets'}<SheetsTab {project} {ws} onview={(s) => setPane(activePane, s)} />
			{:else if bottom === 'links'}<LinksTable {project} {ws} />
			{:else if level}<OutletGrid {project} {ws} levelId={level.id} />{/if}
		</div>
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
		grid-template-areas: 'bar bar bar' 'levels plan props' 'levels grid props' 'status status status';
	}
	.bar { grid-area: bar; }
	.levels { grid-area: levels; min-height: 0; }
	.plan { grid-area: plan; min-height: 0; min-width: 0; }
	.props { grid-area: props; min-height: 0; display: flex; flex-direction: column; }
	.props-body { flex: 1; min-height: 0; overflow: auto; }
	.grid-panel { grid-area: grid; min-height: 0; min-width: 0; display: flex; }
	/* a drag on a panel's blank space doesn't select its text (Dave) — tables still do, for copying (fields always do) */
	.levels, .props, .grid-panel { user-select: none; -webkit-user-select: none; }
	.levels :global(table), .props :global(table), .grid-panel :global(table) { user-select: text; -webkit-user-select: text; }
	.gone { display: none !important; }
	.lvl.on { background: var(--cad-sel); }
	.lvl.on.dim { background: none; box-shadow: inset 0 0 0 1px var(--cad-sel); color: var(--cad-muted); }
	.lvl .act { visibility: hidden; padding: 0 3px; font-size: 11px; color: var(--cad-muted); }
	.lvl:hover .act { visibility: visible; }
	.lvl .act:hover { color: #dc2626; }
	.tabs { display: flex; flex-direction: column; gap: 2px; padding: 4px 2px; border-right: 1px solid var(--cad-line); background: var(--cad-subtle); }
	.tabs button { writing-mode: vertical-rl; transform: rotate(180deg); font-size: 11px; padding: 6px 2px; border-radius: 4px; color: var(--cad-muted); }
	.tabs button.on { background: #2563eb; color: white; }
	.tab-body { flex: 1; min-width: 0; min-height: 0; }
	/* one or two views side by side */
	.panes { display: flex; height: 100%; background: var(--cad-line); }
	.ib { display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; border-radius: 5px; color: var(--cad-muted); }
	.ib:hover:not(:disabled) { background: var(--cad-hover); color: var(--cad-text); }
	.ib:disabled { opacity: 0.35; }
	.ib.on { background: #dbeafe; color: #1d4ed8; }
	.ib.dim { color: var(--cad-faint); }
	.saved { margin-left: 8px; min-width: 3.5rem; text-align: right; }
	.split-bar { flex: 0 0 5px; cursor: col-resize; background: var(--cad-line); touch-action: none; }
	.split-bar:hover, .split-bar:active { background: #93c5fd; }
	.pane { flex: 1 1 0; min-width: 0; position: relative; }
</style>
