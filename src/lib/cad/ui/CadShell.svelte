<!-- The cad workspace for one project: levels on the left, the plan in the middle, Properties on the right, the
     outlets grid below. Owns the CadProject + Workspace for its lifetime (created here, destroyed on unmount). -->
<script lang="ts">
	import { onDestroy, untrack } from 'svelte'
	import { page } from '$app/state'
	import { replaceState } from '$app/navigation'
	import { readViewState, writeViewState } from '../app/urlState'
	import { firestore } from '$lib/db.svelte'
	import { CadProject } from '../app/project.svelte'
	import { Workspace, toolWorksIn, type ToolId } from '../app/workspace.svelte'
	import { deleteEntities, deleteViewport, levelContents, racksWithDevices } from '../editor/commands'
	import { reservePorts } from '../domain/ports'
	import type { Level } from '../domain/types'
	import ViewCanvas from './ViewCanvas.svelte'
	import { PLAN, type ViewSpec } from '../views/space'
	import OutletGrid from './OutletGrid.svelte'
	import PatchList from './PatchList.svelte'
	import { exportBom } from '../render/exports'
	import Properties from './Properties.svelte'
	import ImportNotes from './ImportNotes.svelte'
	import SheetList from './SheetList.svelte'
	import SheetsTab from './SheetsTab.svelte'
	import ImportPanel from './ImportPanel.svelte'
	import RackList from './RackList.svelte'
	import Legend from './Legend.svelte'
	import { planDisplayList } from '../views/plan'
	import { displayListToDxf } from '../render/dxf'
	import { exportOutletSchedule } from '../render/outletSchedule'
	import { download, fileSafe } from '../render/download'

	let { pid, user, projectName }: { pid: string; user: string; projectName: string } = $props()

	// Created once per mount (the route keys this component by pid).
	// svelte-ignore state_referenced_locally
	const project = new CadProject(pid, firestore, user)
	$effect(() => { project.name = projectName })
	const ws = new Workspace()
	ws.applyLinks = (label, add, remove) => project.applyLinks(label, add, remove)
	ws.openView = (s) => setPane(activePane, s)
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

	function toggleSplit() {
		canvas?.cancel()
		if (panes.length === 2) { panes = [panes[activePane]]; activePane = 0 }
		else { panes = [panes[0], panes[0].kind === 'plan' ? { kind: 'elevation', dir: 'front' } : PLAN]; activePane = 0 }
	}
	function setPane(i: number, s: ViewSpec) { canvases[i]?.cancel(); panes[i] = s }
	/** A level from the list: its model. A pane showing something that isn't this level's (a sheet, the riser view,
	 *  another floor's racks) goes to the level's plan (Dave: clicking a level with S001 open did nothing visible). */
	function openLevel(id: string) {
		ws.levelId = id
		ws.select([])
		const p = panes[activePane]
		const elsewhere = p.kind === 'sheet' || p.kind === 'riser' || (p.kind === 'row' && project.index.get(p.spaceId)?.type === 'space' && (project.index.get(p.spaceId) as { levelId: string }).levelId !== id)
		if (elsewhere) setPane(activePane, PLAN)
	}
	const openSheet = $derived.by(() => { const p = panes[activePane]; return p?.kind === 'sheet' ? p.sheetId : undefined })
	/** The kind of view in the active pane — which tools can be used (TOOL_VIEWS). */
	const activeKind = $derived(panes[activePane]?.kind ?? 'plan')
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

	const TOOLS: { id: ToolId; label: string; key: string }[] = [
		{ id: 'select', label: 'Select', key: 'Esc' },
		{ id: 'outlet', label: 'Outlet', key: 'O' },
		{ id: 'line', label: 'Line', key: 'L' },
		{ id: 'trunk', label: 'Trunk', key: 'T' },
		{ id: 'conduit', label: 'Conduit', key: 'C' },
		{ id: 'wall', label: 'Wall', key: 'W' },
		{ id: 'opening', label: 'Opening', key: 'H' },
		{ id: 'section', label: 'Section', key: 'Q' },
		{ id: 'rack', label: 'Rack', key: 'K' },
		{ id: 'device', label: 'Device', key: 'D' },
		{ id: 'cord', label: 'Cord', key: 'P' },
		{ id: 'text', label: 'Text', key: 'X' },
		{ id: 'leader', label: 'Leader', key: 'E' },
		{ id: 'cloud', label: 'Cloud', key: 'U' },
	]
	const DRAWS = new Set<ToolId>(['line', 'trunk', 'conduit', 'wall'])
	const HINT: Partial<Record<ToolId, string>> = {
		select: 'Double-click a selected run to add a point · Ctrl-drag a point to branch',
		outlet: 'Click to place the next outlet · or type @1200,0 for the next one 1.2 m along',
		line: 'Click or type points (x,y · @dx,dy · @d<a · a distance) · Enter finishes · Esc / right-click ends it, again → Select · Backspace undoes a point',
		trunk: 'Click or type points · R = rise / drop · V = riser to another level · Enter finishes · Esc / right-click ends it, again → Select · snap onto an outlet or rack to attach',
		conduit: 'Click or type points · R = rise / drop · V = riser to another level · Enter finishes · Esc / right-click ends it, again → Select',
		wall: 'Click or type points · Enter finishes · Esc / right-click ends it, again → Select',
		section: 'Click (or type) the two ends of the cut line · it looks to the line\'s left as drawn · Flip, depth and Open in Properties',
		opening: 'Click a wall: a hole W wide from Z to Z + H, with the chosen swing · edit or delete it in the wall\'s Properties',
		rack: 'Click on the plan to draw a rack (like the last one: room, row, size, rotation) · Esc stops',
		device: 'In a rack elevation (Racks list → Elevation): click a rack at the U for the device · drag devices with Select to move them',
		assign: 'Click a panel port in a rack elevation — the chosen outlets go on from there (pinned) · Esc cancels',
		cord: 'In a rack elevation: click a port, then the port to patch it to · a panel port needs a label first · Esc cancels',
		text: 'On a sheet: click where the text goes, then type it',
		leader: 'On a sheet: click the tip, then the bend / end points · Enter → its text · Esc / right-click ends it, again → Select · Backspace undoes a point',
		cloud: 'On a sheet: click round the area to mark · Enter closes the cloud · Esc / right-click ends it, again → Select · Backspace undoes a point',
	}
	const HINT_PLACE = 'Click on the plan to place the rack (its centre) · Esc cancels'

	let notice = $state<string | null>(null)
	let exportMenu: HTMLDetailsElement

	async function exportExcel(all: boolean) {
		try { await exportOutletSchedule(project.index, projectName, all || !level ? undefined : { id: level.id, name: level.name }) }
		catch (e) { project.error = `Excel export failed: ${(e as Error).message}` }
	}
	async function exportBomXlsx() {
		try {
			const { PANDUIT_SEED } = await import('$lib/catalog/panduitSeed')
			const n = await exportBom(project.index, projectName, PANDUIT_SEED, project.routes)
			notice = `BOM: ${n} lines`
			setTimeout(() => (notice = null), 5000)
		} catch (e) { project.error = `BOM export failed: ${(e as Error).message}` }
	}
	/** The open plan as DXF — the same display list as the screen (floorplan images are left out). */
	function exportDxf() {
		if (!level) return
		const r = displayListToDxf(planDisplayList(project.index, level.id, { scale: 100, blocks: project.blockOf }))
		download(r.text, `${fileSafe(projectName)}_${fileSafe(level.name)}_plan.dxf`, 'application/dxf')
		notice = `DXF: ${r.entities} entities${r.skippedImages ? ' — the floorplan PDF is not included' : ''}`
		setTimeout(() => (notice = null), 5000)
	}

	let bottom = $state<'outlets' | 'patch' | 'sheets'>('outlets')

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
		if (id === 'rack') ws.rackTool.target = null   // the Rack button draws new racks; Place in the list sets a target
		if (id === 'device' && !ws.deviceTemplate) ws.deviceTemplate = project.deviceTemplates[0] ?? null
		if (id === 'cord' && !cordDefaultsSet && project.settings) {
			ws.cordDefaults = { cableType: project.settings.defaults.cordCableType, colour: project.settings.defaults.cordColour }
			cordDefaultsSet = true
		}
		ws.setTool(id, level)
	}

	let promptInput: HTMLInputElement | undefined = $state()
	/** Focus the prompt when it opens: a number is selected (type over it); typed text keeps its first character. */
	$effect(() => {
		if (!ws.prompt || !promptInput) return
		promptInput.focus()
		if (ws.prompt.text) promptInput.setSelectionRange(promptInput.value.length, promptInput.value.length)
		else promptInput.select()
	})
	function answer(e: KeyboardEvent) {
		if (e.key === 'Enter' && ws.prompt) { const t = (e.currentTarget as HTMLInputElement).value; const p = ws.prompt; ws.prompt = null; p.apply(t); canvas?.refresh() }
		else if (e.key === 'Escape') ws.prompt = null
	}

	/** Start typing a point while a drawing tool is active: the point box opens with what was typed. */
	function typePoint(first: string) {
		ws.askText('Point — x,y · @dx,dy · @d<angle · distance', first, (text) => {
			const err = canvas?.typed(text) ?? null
			if (err) { notice = err; setTimeout(() => (notice = null), 4000) }
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
		if (!ws.selection.length) return
		const ids = ws.selection, held = racksWithDevices(project.store, ids)
		const go = () => { deleteEntities(project.store, ids); ws.select([]) }
		if (!held.racks) return go()
		ws.ask2(`Delete ${held.racks === 1 ? 'a rack' : `${held.racks} racks`} with ${held.devices} device${held.devices === 1 ? '' : 's'} and their links and cords? Undo brings them back.`, 'Delete', go)
	}

	function onKey(e: KeyboardEvent) {
		if (e.target instanceof Element && e.target.closest('input, select, textarea')) return
		const mod = e.ctrlKey || e.metaKey
		if (!mod && canvas?.key(e)) { e.preventDefault(); return }   // the active tool first (Enter, Backspace, R …)
		if (!mod && /^[0-9@.\-]$/.test(e.key) && canvas?.takesTyping()) { e.preventDefault(); typePoint(e.key); return }
		const k = e.key.toLowerCase()
		if (mod && k === 'z' && !e.shiftKey) { e.preventDefault(); project.undo() }
		else if (mod && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); project.redo() }
		else if (e.key === 'Delete' || e.key === 'Backspace') deleteSelected()
		else if (e.key === 'Escape') { if (ws.confirm) ws.confirm = null; else if (ws.toolId !== 'select') setTool('select'); else ws.select([]) }
		else if (e.key === 'Home') canvas?.zoomExtents()
		else if (!mod) { const t = TOOLS.find((x) => x.key.toLowerCase() === k); if (t && toolWorksIn(t.id, activeKind)) setTool(t.id) }
	}
</script>

<svelte:window onkeydown={onKey} />

<div class="shell bg-zinc-50 text-sm">
	<!-- toolbar -->
	<div class="bar flex items-center gap-1 border-b border-zinc-200 bg-white px-2">
		<!-- only the tools that work in this view (Dave: the bar got too wide) -->
		{#each TOOLS as t (t.id)}
			{#if toolWorksIn(t.id, activeKind)}
				<button class="rounded px-2 py-0.5 {ws.toolId === t.id ? 'bg-blue-600 text-white' : 'hover:bg-zinc-100'}" title="{t.label} ({t.key})" onclick={() => setTool(t.id)}>{t.label}</button>
			{/if}
		{/each}
		{#if DRAWS.has(ws.toolId)}
			<span class="mx-2 h-5 w-px bg-zinc-200"></span>
			{#if panes[activePane]?.kind === 'elevation'}
				<label class="opt" title="Where clicks land in the elevation: distance along the view direction (blank = the middle of the floor)">Depth
					<input type="number" value={ws.depth ?? ''} placeholder="auto" onchange={(e) => (ws.depth = e.currentTarget.value === '' ? null : Number(e.currentTarget.value))} /></label>
			{/if}
			{#if ws.toolId !== 'line'}
				<label class="opt">Z <input type="number" bind:value={ws.opts.z} /></label>
				<label class="opt">{ws.toolId === 'conduit' ? 'Ø' : ws.toolId === 'wall' ? 'Thick' : 'W'} <input type="number" bind:value={ws.opts.w} /></label>
				{#if ws.toolId !== 'conduit'}<label class="opt">{ws.toolId === 'wall' ? 'Height' : 'H'} <input type="number" bind:value={ws.opts.h} /></label>{/if}
			{/if}
		{/if}
		{#if ws.toolId === 'opening'}
			<span class="mx-2 h-5 w-px bg-zinc-200"></span>
			<label class="opt" title="Width (mm)">W <input type="number" bind:value={ws.opts.w} /></label>
			<label class="opt" title="Bottom of the hole above FFL (mm)">Z <input type="number" bind:value={ws.opts.z} /></label>
			<label class="opt" title="Height of the hole (mm)">H <input type="number" bind:value={ws.opts.h} /></label>
			<label class="opt">Swing
				<select class="tpl" value={ws.openingSwing ?? ''} onchange={(e) => (ws.openingSwing = (e.currentTarget.value || undefined) as 'left' | 'right' | undefined)}>
					<option value="">none</option><option value="left">left</option><option value="right">right</option>
				</select></label>
		{/if}
		{#if ws.toolId === 'device'}
			<span class="mx-2 h-5 w-px bg-zinc-200"></span>
			<label class="opt">Template
				<select class="tpl" value={ws.deviceTemplate?.id ?? ''} onchange={(e) => (ws.deviceTemplate = project.deviceTemplates.find((t) => t.id === e.currentTarget.value) ?? null)}>
					{#each project.deviceTemplates as t (t.id)}<option value={t.id}>{t.name}{t.builtin ? '' : ' ★'}</option>{/each}
				</select></label>
		{/if}
		{#if ws.toolId === 'cord'}
			<span class="mx-2 h-5 w-px bg-zinc-200"></span>
			<label class="opt">Type
				<select class="tpl" bind:value={ws.cordDefaults.cableType}>
					{#each project.settings?.cableTypes ?? [] as t (t.id)}<option value={t.id}>{t.label}</option>{/each}
					{#if !(project.settings?.cableTypes ?? []).some((t) => t.id === ws.cordDefaults.cableType)}<option value={ws.cordDefaults.cableType}>{ws.cordDefaults.cableType}</option>{/if}
				</select></label>
			{#if ws.bulkFrom?.kind !== 'link'}<label class="opt">Colour <input type="color" class="colour" bind:value={ws.cordDefaults.colour} /></label>{/if}
			{#if ws.bulkFrom}<span class="ml-2 text-xs text-blue-700">{ws.bulkFrom.kind === 'link' ? `Interconnect ${ws.bulkFrom.ports.length} port(s) from ${project.index.nameOf(ws.bulkFrom.on)} — open the other room's rack elevation (any floor) and click the first port · Esc cancels` : `Bulk: ${ws.bulkFrom.ports.length} port(s) — click the first port to patch them to`}</span>{/if}
		{/if}
		{#if ws.confirm}
			{@const q = ws.confirm}
			<span class="ml-2 truncate text-xs text-amber-800">{q.msg}</span>
			<!-- take apply BEFORE clearing: q is a {@const} of ws.confirm and reads null once it's cleared -->
			<button class="ask yes" onclick={() => { const apply = q.apply; ws.confirm = null; apply() }}>{q.yes}</button>
			<button class="ask" onclick={() => (ws.confirm = null)}>Cancel</button>
		{:else if ws.prompt}
			<label class="opt prompt">{ws.prompt.label} <input bind:this={promptInput} class:wide={ws.prompt.text} type={ws.prompt.text ? 'text' : 'number'} value={ws.prompt.value} onkeydown={answer} /></label>
		{:else if ws.message}
			<span class="ml-2 truncate text-xs text-amber-700">{ws.message}</span>
		{:else if HINT[ws.toolId]}
			<span class="ml-2 truncate text-xs text-zinc-500">{ws.toolId === 'rack' && ws.rackTool.target ? HINT_PLACE : HINT[ws.toolId]}</span>
		{/if}
		<span class="mx-2 h-5 w-px bg-zinc-200"></span>
		<button class="rounded px-2 py-0.5 hover:bg-zinc-100 disabled:opacity-40" disabled={!project.canUndo} onclick={() => project.undo()} title="Undo (Ctrl+Z)">Undo</button>
		<button class="rounded px-2 py-0.5 hover:bg-zinc-100 disabled:opacity-40" disabled={!project.canRedo} onclick={() => project.redo()} title="Redo (Ctrl+Y)">Redo</button>
		<button class="rounded px-2 py-0.5 hover:bg-zinc-100" onclick={() => canvas?.zoomExtents()} title="Zoom to fit (Home)">Fit</button>
		<button class="rounded px-2 py-0.5 {panes.length === 2 ? 'bg-blue-100' : 'hover:bg-zinc-100'}" onclick={toggleSplit} title="Two views side by side (plan + elevation)">Split</button>
		<span class="mx-2 h-5 w-px bg-zinc-200"></span>
		<details class="menu" bind:this={exportMenu}>
			<summary class="rounded px-2 py-0.5 hover:bg-zinc-100">Export ▾</summary>
			<div class="menu-list">
				<button onclick={() => { exportMenu.open = false; exportExcel(false) }}>Outlet schedule — this level (Excel)</button>
				<button onclick={() => { exportMenu.open = false; exportExcel(true) }}>Outlet schedule — all levels (Excel)</button>
				<button onclick={() => { exportMenu.open = false; exportDxf() }}>This plan (DXF)</button>
				<button title="Material quantities for the whole project: outlets, panels, devices, racks + accessories (Panduit), cable (routed metres + waste), cords, containment" onclick={() => { exportMenu.open = false; exportBomXlsx() }}>Bill of materials (Excel)</button>
			</div>
		</details>
		{#if notice}<span class="ml-1 text-xs text-emerald-700">{notice}</span>{/if}
		<span class="ml-auto text-xs text-zinc-500">
			{#if project.error}<span class="text-red-600">{project.error}</span>
			{:else if !project.loaded}Loading…
			{:else if project.pendingWrites}Saving…{:else}Saved{/if}
		</span>
	</div>

	<!-- levels -->
	<nav class="levels overflow-auto border-r border-zinc-200 bg-white p-2">
		<p class="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Levels</p>
		{#each project.levels as l (l.id)}
			<div class="lvl flex items-center rounded {ws.levelId === l.id ? 'bg-blue-100 text-blue-900' : 'hover:bg-zinc-100'}">
				<button class="flex flex-1 justify-between px-2 py-0.5 text-left" title={l.area ? `A separate plan of floor ${l.number} (area ${l.area})` : ''}
					onclick={() => openLevel(l.id)}>
					<span>{l.name}</span><span class="text-xs text-zinc-400">{counts.get(l.id) ?? ''}</span>
				</button>
				<button class="act" title="Rename this level" onclick={() => renameLevel(l)}>✎</button>
				<button class="act" title="Delete this level and everything on it" onclick={() => deleteLevel(l)}>✕</button>
			</div>
		{/each}
		<SheetList {project} {ws} open={openSheet} onview={(s) => setPane(activePane, s)} />
		{#if level}<RackList {project} {ws} {projectName} levelId={level.id} onview={(s) => setPane(activePane, s)} /><Legend {project} levelId={level.id} />{/if}
	</nav>

	<!-- plan -->
	<main class="plan relative">
		{#if project.loaded && !project.levels.length}
			<ImportPanel {project} {projectName} />
		{:else if level}
			<div class="panes">
				{#each panes as spec, i (i)}
					<div class="pane">
						<ViewCanvas bind:this={canvases[i]} {project} {ws} levelId={level.id} {spec}
							other={panes.length === 2 ? panes[1 - i] : undefined} active={activePane === i}
							onspec={(s) => setPane(i, s)} onfocus={() => (activePane = i)} />
					</div>
				{/each}
			</div>
			<div class="pointer-events-none absolute right-2 top-1 text-xs font-semibold text-zinc-500">{level.name}</div>
		{/if}
	</main>

	<!-- properties -->
	<aside class="props border-l border-zinc-200 bg-white">
		<div class="props-body"><Properties {project} {ws} /></div>
		<ImportNotes {project} {ws} />
	</aside>

	<!-- tables: outlets (this level) | patch list (the project) -->
	<section class="grid-panel border-t border-zinc-200 bg-white">
		<div class="tabs">
			<button class:on={bottom === 'outlets'} onclick={() => (bottom = 'outlets')}>Outlets</button>
			<button class:on={bottom === 'patch'} onclick={() => (bottom = 'patch')}>Patch list</button>
			<button class:on={bottom === 'sheets'} onclick={() => (bottom = 'sheets')}>Sheets</button>
		</div>
		<div class="tab-body">
			{#if bottom === 'patch'}<PatchList {project} {ws} {projectName} />
			{:else if bottom === 'sheets'}<SheetsTab {project} {ws} onview={(s) => setPane(activePane, s)} />
			{:else if level}<OutletGrid {project} {ws} levelId={level.id} />{/if}
		</div>
	</section>
</div>

<style>
	/* Layout lives here, not in Tailwind arbitrary classes: the panel sizes belong to the component. */
	.shell {
		display: grid;
		height: calc(100vh - 3rem);
		grid-template-columns: 13rem minmax(0, 1fr) 17rem;
		grid-template-rows: 2.25rem minmax(0, 1fr) 14rem;
		grid-template-areas: 'bar bar bar' 'levels plan props' 'levels grid props';
	}
	.bar { grid-area: bar; }
	.levels { grid-area: levels; min-height: 0; }
	.plan { grid-area: plan; min-height: 0; min-width: 0; }
	.props { grid-area: props; min-height: 0; display: flex; flex-direction: column; }
	.props-body { flex: 1; min-height: 0; overflow: auto; }
	.grid-panel { grid-area: grid; min-height: 0; min-width: 0; display: flex; }
	.lvl .act { visibility: hidden; padding: 0 3px; font-size: 11px; color: #71717a; }
	.lvl:hover .act { visibility: visible; }
	.lvl .act:hover { color: #dc2626; }
	.tabs { display: flex; flex-direction: column; gap: 2px; padding: 4px 2px; border-right: 1px solid #e4e4e7; background: #fafafa; }
	.tabs button { writing-mode: vertical-rl; transform: rotate(180deg); font-size: 11px; padding: 6px 2px; border-radius: 4px; color: #52525b; }
	.tabs button.on { background: #2563eb; color: white; }
	.tab-body { flex: 1; min-width: 0; min-height: 0; }
	/* one or two views side by side */
	.panes { display: flex; height: 100%; gap: 2px; background: #e4e4e7; }
	.pane { flex: 1 1 0; min-width: 0; position: relative; }
	.menu { position: relative; }
	.menu summary { list-style: none; cursor: pointer; }
	.menu summary::-webkit-details-marker { display: none; }
	.menu-list { position: absolute; z-index: 30; top: 100%; left: 0; min-width: 16rem; display: flex; flex-direction: column; background: white; border: 1px solid #e4e4e7; border-radius: 6px; box-shadow: 0 4px 12px rgb(0 0 0 / 0.1); padding: 4px 0; }
	.menu-list button { text-align: left; padding: 3px 10px; white-space: nowrap; }
	.menu-list button:hover { background: #f4f4f5; }
	.opt { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; color: #52525b; margin-left: 6px; }
	.opt input { width: 4.5rem; border: 1px solid #d4d4d8; border-radius: 4px; padding: 0 4px; }
	.opt input.colour { width: 2rem; height: 1.25rem; padding: 0; }
	.ask { margin-left: 4px; border: 1px solid #d4d4d8; border-radius: 4px; padding: 0 6px; font-size: 12px; background: white; }
	.ask.yes { border-color: #d97706; color: #92400e; background: #fffbeb; }
	.opt select.tpl { max-width: 13rem; border: 1px solid #d4d4d8; border-radius: 4px; padding: 0 2px; font-size: 12px; }
	.prompt { background: #fef3c7; padding: 1px 6px; border-radius: 4px; color: #78350f; }
	.prompt input.wide { width: 9rem; font-family: ui-monospace, monospace; }
</style>
