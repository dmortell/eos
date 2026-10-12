<!-- The strip over a pane (split out of ViewCanvas, UX12): back / forward through the views this pane showed (the tab
     names the view, so no breadcrumb — R57; "↑ 1F plan" in a rack view or port map), then only the buttons that fit —
       · a building view (plan, elevations, section, riser): Plan · Elevation… · Riser · Section…, Display ▾, To sheet…;
       · a rack view: its room, Racks front / rear, one row or all, Display ▾, To sheet…;
       · a port map: its devices, Excel (VLAN), To sheet…;
       · a sheet: its number, title and paper. -->

<script lang="ts">
	import { KEYS } from './shellKeys'
	import type { CadProject } from '../app/project.svelte'
	import type { Workspace } from '../app/workspace.svelte'
	import type { RackRow } from '../domain/types'
	import type { Sheet, SectionCut } from '../domain/drawing'
	import { specLabel, PLAN, isPaperSpec, type ViewSpec } from '../views/space'
	import { FILL_LIMIT_PCT } from '../domain/fill'
	import { exportPortMap } from '../render/exports'

	export interface PaneNav { back?: string; fwd?: string; go: (dir: -1 | 1) => void }

	let { project, ws, spec, levelId, sections, section, sheet, sheetsList, onspec, onfocus, toSheet, nav, routeKey }: {
		project: CadProject; ws: Workspace; spec: ViewSpec; levelId: string
		sections: SectionCut[]; section?: SectionCut; sheet?: Sheet; sheetsList: Sheet[]
		onspec: (s: ViewSpec) => void; onfocus?: () => void; toSheet: (target: string) => void
		nav?: PaneNav
		/** the Routes overlay's colors (its server rooms), when on */
		routeKey?: { id: string; name: string; color: string }[]
	} = $props()

	const FACES = ['front', 'rear'] as const
	const DIRS = ['front', 'rear', 'left', 'right'] as const
	type Dir = (typeof DIRS)[number]
	/** The Display ▾ menu: what this view shows on YOUR screen (review R43 — the strip overflowed). Placed fixed under
	 *  its button, so the strip (overflow hidden) doesn't cut it off. */
	let dispOpen = $state(false), dispAt = $state({ x: 0, y: 0 })
	function openDisplay(e: MouseEvent) {
		const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
		dispAt = { x: r.left, y: r.bottom + 2 }
		dispOpen = !dispOpen
	}
	const go = (s: ViewSpec) => { onfocus?.(); onspec(s) }
	/** The riser view's floor range (a project setting: one undo step); blank = the lowest / top floor. */
	const floorsUp = $derived.by(() => { void project.rev; return project.store.ofType('level').filter((l) => !l.area).sort((a, b) => a.number - b.number) })
	function setRiserRange(end: 'from' | 'to', v: string) {
		const st = project.settings
		if (!st) return
		const { [end]: _, ...rest } = st.riser ?? {}
		const riser = { ...rest, ...(v === '' ? {} : { [end]: Number(v) }) }
		project.store.transact(`Riser view ${end === 'from' ? 'from' : 'to'} ${v === '' ? (end === 'from' ? 'the lowest floor' : 'the top floor') : floorsUp.find((l) => l.number === Number(v))?.name ?? v}`, (tx) => tx.put({ ...st, riser }))
	}
	const building = $derived(spec.kind !== 'row' && spec.kind !== 'sheet' && !isPaperSpec(spec))
	/** The tab already names the view, so no breadcrumb (review R57); a rack view and a port map, which have no Plan
	 *  button in this strip, get one way up: "↑ 1F plan". */
	const up = $derived(spec.kind === 'row' || spec.kind === 'portmap' ? `↑ ${project.index.nameOf(levelId)} plan` : '')
	const rowsOf = (spaceId: string) => [...project.index.byId.values()].filter((e): e is RackRow => e.type === 'rackRow' && e.spaceId === spaceId).sort((a, b) => a.order - b.order)
</script>

<div class="views">
	{#if nav}
		<button class="nav" disabled={!nav.back} title={nav.back ? `Back to ${nav.back} (${KEYS.backView})` : `Back (${KEYS.backView})`} onclick={() => { onfocus?.(); nav.go(-1) }}>‹</button>
		<button class="nav" disabled={!nav.fwd} title={nav.fwd ? `Forward to ${nav.fwd} (${KEYS.fwdView})` : `Forward (${KEYS.fwdView})`} onclick={() => { onfocus?.(); nav.go(1) }}>›</button>
	{/if}
	{#if up}<button class="crumb link" title="Open this level’s plan" onclick={() => go(PLAN)}>{up}</button>{/if}
	<span class="sep"></span>
	{#if building}
		<button class:on={spec.kind === 'plan'} onclick={() => go(PLAN)}>Plan</button>
		<select class="secs" class:on={spec.kind === 'elevation'} value={spec.kind === 'elevation' ? spec.dir : ''} title="This level seen from the front, rear, left or right"
			onchange={(e) => { const d = e.currentTarget.value; if (d) go({ kind: 'elevation', dir: d as Dir }) }}>
			<option value="">Elevation…</option>
			{#each DIRS as d (d)}<option value={d}>{specLabel({ kind: 'elevation', dir: d })}</option>{/each}
		</select>
		<button class:on={spec.kind === 'riser'} title="The building's risers and backbone, floor by floor" onclick={() => { if (spec.kind !== 'riser') go({ kind: 'riser' }) }}>Riser</button>
		{#if sections.length || section}
			<select class="secs" class:on={!!section} value={section?.id ?? ''} title="Sections on this level (draw one with the Section tool on the plan)"
				onchange={(e) => { if (e.currentTarget.value) go({ kind: 'section', sectionId: e.currentTarget.value }) }}>
				<option value="">Section…</option>
				{#each sections as s (s.id)}<option value={s.id}>Section {s.name}</option>{/each}
			</select>
		{/if}
		<button class="disp" class:on={dispOpen} title="What this view shows on your screen" onclick={openDisplay}>Display ▾</button>
	{:else if spec.kind === 'row'}
		{@const row = spec}
		{#each FACES as f (f)}
			<button class:on={row.face === f} onclick={() => go({ ...row, face: f })}>Racks {f}</button>
		{/each}
		{@const rows = rowsOf(row.spaceId)}
		{#if rows.length}
			<select class="secs" class:on={!!row.rowId} title="Show one row of racks, or the whole room" value={row.rowId ?? ''} onchange={(e) => { const { rowId: _, ...rest } = row; go(e.currentTarget.value ? { ...rest, rowId: e.currentTarget.value } : rest) }}>
				<option value="">All rows</option>
				{#each rows as r (r.id)}<option value={r.id}>{r.name}</option>{/each}
			</select>
		{/if}
		<button class="disp" class:on={dispOpen} title="What this rack view shows on your screen" onclick={openDisplay}>Display ▾</button>
	{:else if spec.kind === 'portmap'}
		{@const ids = spec.deviceIds}
		<button title="The same ports as Excel for the network engineers: the outlet(s), what each port is patched to, the cord, and an empty VLAN column" onclick={() => exportPortMap(project.index, project.name, ids).then((n) => ws.say(`Port map: ${n} ports — fill in the VLAN column`), (e) => (project.error = `Excel export failed: ${(e as Error).message}`))}>Excel (VLAN)</button>
	{:else if sheet}
		<span class="room">{sheet.paper.size} {sheet.paper.orientation}</span>
	{/if}
	{#if spec.kind !== 'sheet'}
		<!-- this view as it is (centred where you're looking) onto a sheet: a new one, or one that's there -->
		<select class="secs tosheet" value="" title="Put this view on a sheet, centred where you're looking, at a scale that fits" onchange={(e) => { onfocus?.(); toSheet(e.currentTarget.value); e.currentTarget.value = '' }}>
			<option value="">To sheet…</option>
			<option value="new">New sheet from this view</option>
			{#each sheetsList as s (s.id)}<option value={s.id}>On {s.number} {s.title}</option>{/each}
		</select>
	{/if}
</div>

{#if dispOpen}
	<button class="dback" aria-label="Close the Display menu" onclick={() => (dispOpen = false)}></button>
	<div class="dpop" style:left="{dispAt.x}px" style:top="{dispAt.y}px" role="menu" tabindex="-1" onkeydown={(e) => { if (e.key === 'Escape') dispOpen = false }}>
		{#if spec.kind === 'plan'}
			<label title="Floorplans in black and white, so colored markup stands out — your screen only (a sheet has its own: Properties › Display)"><input type="checkbox" checked={ws.screen.gray} onchange={() => ws.toggleScreen('gray')} /> B/W floorplans</label>
			<label title="Outlets in their usage's color (on) or their layer's (off) — your screen only (a sheet has its own)"><input type="checkbox" checked={ws.screen.byUsage} onchange={() => ws.toggleScreen('byUsage')} /> Usage colors</label>
			<label title="Color runs by how full they are from the cables routed through them (limit {FILL_LIMIT_PCT}%: amber from {FILL_LIMIT_PCT * 0.75}%, red over)"><input type="checkbox" checked={ws.showFill} onchange={() => (ws.showFill = !ws.showFill)} /> Fill</label>
			<label title="Every cable's route along the containment, colored by its server room"><input type="checkbox" checked={ws.showRoutes} onchange={() => (ws.showRoutes = !ws.showRoutes)} /> Routes</label>
			{#if ws.showRoutes && routeKey}
				<div class="keys">{#each routeKey as r (r.id)}<span class="rkey" title="Cables to {r.name}"><i style:background={r.color}></i>{r.name}</span>{:else}<span class="rkey">no routed cables here</span>{/each}</div>
			{/if}
		{:else if spec.kind === 'elevation'}
			<!-- the depth band (UX14): around the work depth; nearer is left out, further fades; the plan shows it in Split -->
			<label title="Show only what's near the work depth — nearer is left out, further is faded (Split with the plan to see the band)"><input type="checkbox" checked={ws.band.on} onchange={() => (ws.band.on = !ws.band.on)} /> Depth band</label>
			{#if ws.band.on}
				<label class="num" title="Where the band is: the work depth (mm along the view; blank = the middle of the floor)">at <input type="number" step="100" value={ws.depth ?? ''} placeholder="auto" onchange={(e) => (ws.depth = e.currentTarget.value === '' ? null : Number(e.currentTarget.value))} /></label>
				<label class="num" title="How far the band reaches towards you (mm)">front <input type="number" min="0" step="100" bind:value={ws.band.front} /></label>
				<label class="num" title="How far the band reaches away from you (mm); beyond it is faded">back <input type="number" min="0" step="100" bind:value={ws.band.back} /></label>
			{/if}
		{:else if spec.kind === 'riser'}
			{@const rr = project.settings?.riser}
			{@const hide = !!spec.hideEmpty}
			<label title="Squeeze the floors that have no server room into break marks"><input type="checkbox" checked={hide} onchange={() => go({ kind: 'riser', ...(hide ? {} : { hideEmpty: true }) })} /> Hide empty floors</label>
			<label class="num" title="The riser view's floors, for the whole project (sheets too)">Floors
				<select value={rr?.from ?? ''} onchange={(e) => setRiserRange('from', e.currentTarget.value)}><option value="">lowest</option>{#each floorsUp as l (l.id)}<option value={l.number}>{l.name}</option>{/each}</select>
				–
				<select value={rr?.to ?? ''} onchange={(e) => setRiserRange('to', e.currentTarget.value)}><option value="">top</option>{#each floorsUp as l (l.id)}<option value={l.number}>{l.name}</option>{/each}</select>
			</label>
		{:else if spec.kind === 'row'}
			<label title="Cords along the cable channels: down to the side channel, across through the nearest horizontal manager (off = straight lines). Your screen only (a sheet has its own: Properties › Display)."><input type="checkbox" checked={ws.screen.cordChannels} onchange={() => ws.toggleScreen('cordChannels')} /> Cord channels</label>
			<label title="Floor, ceiling and slab lines — the server room's own floor / ceiling where set. The Room lines layer."><input type="checkbox" checked={!ws.layers.hidden.has('sys:room-lines')} onchange={() => ws.layers.toggleHidden('sys:room-lines')} /> Room lines</label>
			<label title="Devices on the other face, drawn faint with (rear) / (front). The Other face layer."><input type="checkbox" checked={!ws.layers.hidden.has('sys:other-face')} onchange={() => ws.layers.toggleHidden('sys:other-face')} /> Other face</label>
		{/if}
	</div>
{/if}

<style>
	/* a strip over the top of the pane, above the drawing (Dave: rack labels showed through the buttons) */
	.views { position: absolute; top: 0; left: 0; right: 0; z-index: 2; display: flex; align-items: center; gap: 2px; padding: 4px 6px; background: var(--cad-subtle, #fafafa); border-bottom: 1px solid var(--cad-line, #e4e4e7); white-space: nowrap; overflow: hidden; }
	.views button { font-size: 11px; padding: 0 6px; border-radius: 4px; background: rgba(255, 255, 255, 0.85); border: 1px solid #e4e4e7; color: #52525b; }
	.views button.on { background: #2563eb; border-color: #2563eb; color: white; }
	.rkey { display: inline-flex; align-items: center; gap: 3px; font-size: 11px; color: var(--cad-muted); margin-left: 4px; }
	.rkey i { width: 10px; height: 4px; border-radius: 2px; }
	.views button.nav { padding: 0 5px; font-weight: 600; }
	.views button.nav:disabled { opacity: 0.35; }
	.views .secs { font-size: 11px; padding: 0 2px; border-radius: 4px; background: rgba(255, 255, 255, 0.85); border: 1px solid #e4e4e7; color: #52525b; }
	.views .secs.on { background: #2563eb; border-color: #2563eb; color: white; }
	/* the open list keeps plain options (they inherited the blue "on" look: every row looked picked) */
	.views .secs option { background: white; color: #18181b; }
	.views .sep { width: 1px; align-self: stretch; background: #d4d4d8; margin: 0 4px; }
	.views .room { font-size: 11px; color: #52525b; padding: 0 2px; }
	.num { display: inline-flex; align-items: center; gap: 2px; font-size: 11px; color: #52525b; }
	.num input { width: 4.2rem; font-size: 11px; border: 1px solid #e4e4e7; border-radius: 4px; padding: 0 3px; background: white; }
	.views button.crumb.link { border: 0; background: none; color: #1d4ed8; font-weight: 600; padding: 0 2px; }
	.views button.crumb.link:hover { text-decoration: underline; }
	.views .tosheet { margin-left: auto; max-width: 9rem; }
	.dback { position: fixed; inset: 0; z-index: 40; background: transparent; cursor: default; }
	.dpop { position: fixed; z-index: 41; display: flex; flex-direction: column; gap: 4px; min-width: 11rem; padding: 6px 8px; font-size: 12px; color: var(--cad-text); background: var(--cad-panel, white); border: 1px solid var(--cad-line, #e4e4e7); border-radius: 6px; box-shadow: 0 4px 14px rgb(0 0 0 / 0.15); }
	.dpop label { display: flex; align-items: center; gap: 6px; white-space: nowrap; }
	.dpop .keys { display: flex; flex-wrap: wrap; gap: 2px 6px; padding-left: 20px; }
	.dpop select { font-size: 11px; }
</style>
