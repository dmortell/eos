<!-- The strip over a pane (split out of ViewCanvas, UX12): back / forward through the views this pane showed, a
     breadcrumb of where you are, then only the buttons that fit the view —
       · a building view (plan, elevations, section, riser): Plan · Front · Rear · Left · Right · Riser, Section…, Fill,
         To sheet…;
       · a rack view: its room, Racks front / rear, one row or all, To sheet…;
       · a sheet: its number, title and paper. -->
<script lang="ts" module>
	/** Back / forward for one pane: what each goes to (absent = nothing there), and the jump. */</script>

<script lang="ts">
	import type { CadProject } from '../app/project.svelte'
	import type { Workspace } from '../app/workspace.svelte'
	import type { RackRow } from '../domain/types'
	import type { Sheet, SectionCut } from '../domain/drawing'
	import { specKey, specLabel, PLAN, type ViewSpec } from '../views/space'
	import { FILL_LIMIT_PCT } from '../domain/fill'

	export interface PaneNav { back?: string; fwd?: string; go: (dir: -1 | 1) => void }

	let { project, ws, spec, levelId, sections, section, sheet, sheetsList, onspec, onfocus, toSheet, nav }: {
		project: CadProject; ws: Workspace; spec: ViewSpec; levelId: string
		sections: SectionCut[]; section?: SectionCut; sheet?: Sheet; sheetsList: Sheet[]
		onspec: (s: ViewSpec) => void; onfocus?: () => void; toSheet: (target: string) => void
		nav?: PaneNav
	} = $props()

	const FACES = ['front', 'rear'] as const
	const VIEWS: ViewSpec[] = [PLAN, { kind: 'elevation', dir: 'front' }, { kind: 'elevation', dir: 'rear' }, { kind: 'elevation', dir: 'left' }, { kind: 'elevation', dir: 'right' }, { kind: 'riser' }]
	const go = (s: ViewSpec) => { onfocus?.(); onspec(s) }
	/** Cords straight ⇄ along the cable channels (a project setting: one undo step). */
	function toggleCords() {
		const st = project.settings
		if (!st) return
		const on = st.cordRoute !== 'channels'
		project.store.transact(on ? 'Cords along channels' : 'Cords straight', (tx) => tx.put({ ...st, cordRoute: on ? 'channels' : 'straight' }))
	}
	const building = $derived(spec.kind !== 'row' && spec.kind !== 'sheet')
	/** Where you are: "1F", "1F › IDF1", "S001 New sheet" (the riser view is the building's, not a level's). */
	const crumbs = $derived.by((): { text: string; to?: ViewSpec }[] => {
		if (spec.kind === 'sheet') return [{ text: sheet ? `${sheet.number} ${sheet.title}` : 'Sheet' }]
		if (spec.kind === 'riser') return [{ text: 'Building' }]
		const lv = { text: project.index.nameOf(levelId), to: spec.kind === 'plan' ? undefined : PLAN }
		return spec.kind === 'row' ? [lv, { text: project.index.nameOf(spec.spaceId) }] : [lv]
	})
	const rowsOf = (spaceId: string) => [...project.index.byId.values()].filter((e): e is RackRow => e.type === 'rackRow' && e.spaceId === spaceId).sort((a, b) => a.order - b.order)
</script>

<div class="views">
	{#if nav}
		<button class="nav" disabled={!nav.back} title={nav.back ? `Back to ${nav.back} (Alt+←)` : 'Back (Alt+←)'} onclick={() => { onfocus?.(); nav.go(-1) }}>‹</button>
		<button class="nav" disabled={!nav.fwd} title={nav.fwd ? `Forward to ${nav.fwd} (Alt+→)` : 'Forward (Alt+→)'} onclick={() => { onfocus?.(); nav.go(1) }}>›</button>
	{/if}
	{#each crumbs as c, i (i)}
		{#if i}<span class="crumb-sep">›</span>{/if}
		{#if c.to}{@const to = c.to}<button class="crumb link" title="Open {c.text}'s plan" onclick={() => go(to)}>{c.text}</button>
		{:else}<span class="crumb">{c.text}</span>{/if}
	{/each}
	<span class="sep"></span>
	{#if building}
		{#each VIEWS as v (specKey(v))}
			<button class:on={specKey(v) === specKey(spec)} onclick={() => go(v)}>{specLabel(v)}</button>
		{/each}
		{#if sections.length || section}
			<select class="secs" class:on={!!section} value={section?.id ?? ''} title="Sections on this level (draw one with the Section tool on the plan)"
				onchange={(e) => { if (e.currentTarget.value) go({ kind: 'section', sectionId: e.currentTarget.value }) }}>
				<option value="">Section…</option>
				{#each sections as s (s.id)}<option value={s.id}>Section {s.name}</option>{/each}
			</select>
		{/if}
		{#if spec.kind === 'elevation'}
			<!-- the depth band (UX14, a test): around the work depth; nearer is left out, further fades; the plan shows it in Split -->
			<button class:on={ws.band.on} title="Depth band: show only what's near the work depth — nearer is left out, further is faded (Split with the plan to see the band)" onclick={() => (ws.band.on = !ws.band.on)}>Band</button>
			{#if ws.band.on}
				<label class="num" title="Where the band is: the work depth (mm along the view; blank = the middle of the floor)">at <input type="number" step="100" value={ws.depth ?? ''} placeholder="auto" onchange={(e) => (ws.depth = e.currentTarget.value === '' ? null : Number(e.currentTarget.value))} /></label>
				<label class="num" title="How far the band reaches towards you (mm)">front <input type="number" min="0" step="100" bind:value={ws.band.front} /></label>
				<label class="num" title="How far the band reaches away from you (mm); beyond it is faded">back <input type="number" min="0" step="100" bind:value={ws.band.back} /></label>
			{/if}
		{/if}
		{#if spec.kind === 'riser'}
			<button class:on={!!spec.hideEmpty} title="Squeeze the floors that have no server room into break marks" onclick={() => go({ kind: 'riser', ...(spec.hideEmpty ? {} : { hideEmpty: true }) })}>Hide empty floors</button>
		{/if}
		{#if spec.kind === 'plan'}
			<button class:on={!!ws.drafting.grayPlan} title="The floorplan in black and white, so coloured markup stands out (this browser)" onclick={() => { ws.drafting.grayPlan = !ws.drafting.grayPlan; ws.saveDrafting() }}>B/W</button>
			<button class:on={ws.showFill} title="Color runs by how full they are from the cables routed through them (limit {FILL_LIMIT_PCT}%: amber from {FILL_LIMIT_PCT * 0.75}%, red over)" onclick={() => (ws.showFill = !ws.showFill)}>Fill</button>
		{/if}
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
		<!-- how cords are drawn, for the whole project (screen, sheets, PDFs): straight, or along the cable channels -->
		<button class:on={project.settings?.cordRoute === 'channels'} title="Cords along the cable channels: down to the side channel, across through the nearest horizontal manager (off = straight lines). For the whole project, sheets and PDFs too." onclick={toggleCords}>Cord channels</button>
	{:else if sheet}
		<span class="room">{sheet.paper.size} {sheet.paper.orientation}</span>
	{/if}
	{#if spec.kind !== 'sheet'}
		<!-- this view as it is (centred where you're looking) onto a sheet: a new one, or one that's there -->
		<select class="secs" value="" title="Put this view on a sheet, centred where you're looking, at a scale that fits" onchange={(e) => { onfocus?.(); toSheet(e.currentTarget.value); e.currentTarget.value = '' }}>
			<option value="">To sheet…</option>
			<option value="new">New sheet from this view</option>
			{#each sheetsList as s (s.id)}<option value={s.id}>On {s.number} {s.title}</option>{/each}
		</select>
	{/if}
</div>

<style>
	/* a strip over the top of the pane, above the drawing (Dave: rack labels showed through the buttons) */
	.views { position: absolute; top: 0; left: 0; right: 0; z-index: 2; display: flex; align-items: center; gap: 2px; padding: 4px 6px; background: var(--cad-subtle, #fafafa); border-bottom: 1px solid var(--cad-line, #e4e4e7); white-space: nowrap; overflow: hidden; }
	.views button { font-size: 11px; padding: 0 6px; border-radius: 4px; background: rgba(255, 255, 255, 0.85); border: 1px solid #e4e4e7; color: #52525b; }
	.views button.on { background: #2563eb; border-color: #2563eb; color: white; }
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
	.crumb { font-size: 11px; font-weight: 600; color: #3f3f46; padding: 0 2px; }
	.views button.crumb.link { border: 0; background: none; color: #1d4ed8; font-weight: 600; padding: 0 2px; }
	.views button.crumb.link:hover { text-decoration: underline; }
	.crumb-sep { font-size: 11px; color: #a1a1aa; }
</style>
