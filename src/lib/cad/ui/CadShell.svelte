<!-- The cad workspace for one project: levels on the left, the plan in the middle, Properties on the right, the
     outlets grid below. Owns the CadProject + Workspace for its lifetime (created here, destroyed on unmount). -->
<script lang="ts">
	import { onDestroy } from 'svelte'
	import { firestore } from '$lib/db.svelte'
	import { CadProject } from '../app/project.svelte'
	import { Workspace, type ToolId } from '../app/workspace.svelte'
	import { deleteEntities } from '../editor/commands'
	import ViewCanvas from './ViewCanvas.svelte'
	import { PLAN, type ViewSpec } from '../views/space'
	import OutletGrid from './OutletGrid.svelte'
	import Properties from './Properties.svelte'
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
	const ws = new Workspace()
	onDestroy(() => project.destroy())

	/** One or two panes side by side, each a plan or an elevation of the open level; the active one takes keys. */
	let panes = $state<ViewSpec[]>([PLAN])
	let activePane = $state(0)
	let canvases = $state<(ViewCanvas | undefined)[]>([])
	const canvas = $derived(canvases[activePane])
	const level = $derived(project.levels.find((l) => l.id === ws.levelId))

	function toggleSplit() {
		canvas?.cancel()
		if (panes.length === 2) { panes = [panes[activePane]]; activePane = 0 }
		else { panes = [panes[0], panes[0].kind === 'plan' ? { kind: 'elevation', dir: 'front' } : PLAN]; activePane = 0 }
	}
	function setPane(i: number, s: ViewSpec) { canvases[i]?.cancel(); panes[i] = s }

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
		{ id: 'rack', label: 'Rack', key: 'K' },
		{ id: 'device', label: 'Device', key: 'D' },
	]
	const DRAWS = new Set<ToolId>(['line', 'trunk', 'conduit', 'wall'])
	const HINT: Partial<Record<ToolId, string>> = {
		select: 'Double-click a selected run to add a point · Ctrl-drag a point to branch',
		outlet: 'Click to place the next outlet · or type @1200,0 for the next one 1.2 m along',
		line: 'Click or type points (x,y · @dx,dy · @d<a · a distance) · Enter / right-click finishes · Backspace undoes a point',
		trunk: 'Click or type points · R = rise / drop · V = riser to another level · Enter / right-click finishes · snap onto an outlet or rack to attach',
		conduit: 'Click or type points · R = rise / drop · V = riser to another level · Enter / right-click finishes',
		wall: 'Click or type points · Enter / right-click finishes',
		rack: 'Click on the plan to draw a rack (like the last one: room, row, size, rotation) · Esc stops',
		device: 'In a rack elevation (Racks list → Elevation): click a rack at the U for the device · drag devices with Select to move them',
	}
	const HINT_PLACE = 'Click on the plan to place the rack (its centre) · Esc cancels'

	let notice = $state<string | null>(null)

	async function exportExcel(all: boolean) {
		try { await exportOutletSchedule(project.index, projectName, all || !level ? undefined : { id: level.id, name: level.name }) }
		catch (e) { project.error = `Excel export failed: ${(e as Error).message}` }
	}
	/** The open plan as DXF — the same display list as the screen (floorplan images are left out). */
	function exportDxf() {
		if (!level) return
		const r = displayListToDxf(planDisplayList(project.index, level.id, { scale: 100, blocks: project.blockOf }))
		download(r.text, `${fileSafe(projectName)}_${fileSafe(level.name)}_plan.dxf`, 'application/dxf')
		notice = `DXF: ${r.entities} entities${r.skippedImages ? ' — the floorplan PDF is not included' : ''}`
		setTimeout(() => (notice = null), 5000)
	}

	function setTool(id: ToolId) {
		canvas?.cancel()
		if (id === 'rack') ws.rackTool.target = null   // the Rack button draws new racks; Place in the list sets a target
		if (id === 'device' && !ws.deviceTemplate) ws.deviceTemplate = project.deviceTemplates[0] ?? null
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

	function onKey(e: KeyboardEvent) {
		if (e.target instanceof Element && e.target.closest('input, select, textarea')) return
		const mod = e.ctrlKey || e.metaKey
		if (!mod && canvas?.key(e)) { e.preventDefault(); return }   // the active tool first (Enter, Backspace, R …)
		if (!mod && /^[0-9@.\-]$/.test(e.key) && canvas?.takesTyping()) { e.preventDefault(); typePoint(e.key); return }
		const k = e.key.toLowerCase()
		if (mod && k === 'z' && !e.shiftKey) { e.preventDefault(); project.undo() }
		else if (mod && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); project.redo() }
		else if (e.key === 'Delete' || e.key === 'Backspace') { if (ws.selection.length) { deleteEntities(project.store, ws.selection); ws.select([]) } }
		else if (e.key === 'Escape') { if (ws.confirm) ws.confirm = null; else if (ws.toolId !== 'select') setTool('select'); else ws.select([]) }
		else if (e.key === 'Home') canvas?.zoomExtents()
		else if (!mod) { const t = TOOLS.find((x) => x.key.toLowerCase() === k); if (t) setTool(t.id) }
	}
</script>

<svelte:window onkeydown={onKey} />

<div class="shell bg-zinc-50 text-sm">
	<!-- toolbar -->
	<div class="bar flex items-center gap-1 border-b border-zinc-200 bg-white px-2">
		{#each TOOLS as t (t.id)}
			<button class="rounded px-2 py-0.5 {ws.toolId === t.id ? 'bg-blue-600 text-white' : 'hover:bg-zinc-100'}" title="{t.label} ({t.key})" onclick={() => setTool(t.id)}>{t.label}</button>
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
		{#if ws.toolId === 'device'}
			<span class="mx-2 h-5 w-px bg-zinc-200"></span>
			<label class="opt">Template
				<select class="tpl" value={ws.deviceTemplate?.id ?? ''} onchange={(e) => (ws.deviceTemplate = project.deviceTemplates.find((t) => t.id === e.currentTarget.value) ?? null)}>
					{#each project.deviceTemplates as t (t.id)}<option value={t.id}>{t.name}{t.builtin ? '' : ' ★'}</option>{/each}
				</select></label>
		{/if}
		{#if ws.confirm}
			{@const q = ws.confirm}
			<span class="ml-2 truncate text-xs text-amber-800">{q.msg}</span>
			<button class="ask yes" onclick={() => { ws.confirm = null; q.apply() }}>{q.yes}</button>
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
		<button class="rounded px-2 py-0.5 hover:bg-zinc-100" onclick={() => exportExcel(false)} title="Outlet schedule of this level (Excel)">Schedule</button>
		<button class="rounded px-2 py-0.5 hover:bg-zinc-100" onclick={() => exportExcel(true)} title="Outlet schedule of every level (Excel)">All levels</button>
		<button class="rounded px-2 py-0.5 hover:bg-zinc-100" onclick={exportDxf} title="This plan as DXF">DXF</button>
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
			<button class="flex w-full justify-between rounded px-2 py-0.5 text-left {ws.levelId === l.id ? 'bg-blue-100 text-blue-900' : 'hover:bg-zinc-100'}"
				onclick={() => { ws.levelId = l.id; ws.select([]) }}>
				<span>{l.name}</span><span class="text-xs text-zinc-400">{counts.get(l.id) ?? ''}</span>
			</button>
		{/each}
		{#if level}<RackList {project} {ws} levelId={level.id} onview={(s) => setPane(activePane, s)} /><Legend {project} levelId={level.id} />{/if}
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
	<aside class="props overflow-auto border-l border-zinc-200 bg-white">
		<Properties {project} {ws} />
	</aside>

	<!-- outlets grid -->
	<section class="grid-panel border-t border-zinc-200 bg-white">
		{#if level}<OutletGrid {project} {ws} levelId={level.id} />{/if}
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
	.props { grid-area: props; min-height: 0; }
	.grid-panel { grid-area: grid; min-height: 0; min-width: 0; }
	/* one or two views side by side */
	.panes { display: flex; height: 100%; gap: 2px; background: #e4e4e7; }
	.pane { flex: 1 1 0; min-width: 0; position: relative; }
	.opt { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; color: #52525b; margin-left: 6px; }
	.opt input { width: 4.5rem; border: 1px solid #d4d4d8; border-radius: 4px; padding: 0 4px; }
	.ask { margin-left: 4px; border: 1px solid #d4d4d8; border-radius: 4px; padding: 0 6px; font-size: 12px; background: white; }
	.ask.yes { border-color: #d97706; color: #92400e; background: #fffbeb; }
	.opt select.tpl { max-width: 13rem; border: 1px solid #d4d4d8; border-radius: 4px; padding: 0 2px; font-size: 12px; }
	.prompt { background: #fef3c7; padding: 1px 6px; border-radius: 4px; color: #78350f; }
	.prompt input.wide { width: 9rem; font-family: ui-monospace, monospace; }
</style>
