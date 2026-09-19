<script lang="ts">
	// Left-sidebar DRAWING NAVIGATOR (Pages mockup) — modelled on the reference design:
	// a tree organised by LOCATION (Floors / Server Rooms / Data Center / Racks) whose
	// leaves are the drawings / views. Clicking a leaf opens it as a canvas tab. Mock data.
	import { Icon } from '$lib'

	type Kind = 'plan' | 'sheet' | 'elevation'
	type Node = { id: string; label: string; folder?: string; drawing?: Kind; children?: Node[] }

	let { onopen, oncollapse, activeTitle = '' }:
		{ onopen?: (d: { title: string; kind: Kind }) => void; oncollapse?: () => void; activeTitle?: string } = $props()

	// folder = a location group (icon by kind); drawing = a leaf that opens a tab.
	const TREE: Node[] = [
		{ id: 'floors', label: 'Floors', folder: 'floors', children: [
			{ id: 'f1', label: 'Floor 1', folder: 'floor', children: [] },
			{ id: 'f2', label: 'Floor 2', folder: 'floor', children: [] },
			{ id: 'f3', label: 'Floor 3', folder: 'floor', children: [
				{ id: 'f3-hlo', label: 'F3 — High Level Outlets', drawing: 'sheet' },
				{ id: 'f3-llo', label: 'F3 — Low Level Outlets', drawing: 'sheet' },
				{ id: 'f3-tr', label: 'F3 — Trunk Routes', drawing: 'sheet' },
				{ id: 'f3-fill', label: 'F3 — Containment Fill Rate', drawing: 'sheet' },
			] },
			{ id: 'f4', label: 'Floor 4', folder: 'floor', children: [] },
			{ id: 'roof', label: 'Roof', folder: 'floor', children: [] },
		] },
		{ id: 'srv', label: 'Server Rooms', folder: 'server', children: [
			{ id: 'sr1', label: 'SR-01', folder: 'room', children: [
				{ id: 'sr1-plan', label: 'SR-01 — Plan', drawing: 'plan' },
				{ id: 'sr1-elev', label: 'SR-01 — Wall Elevation', drawing: 'elevation' },
			] },
			{ id: 'sr2', label: 'SR-02', folder: 'room', children: [] },
			{ id: 'sr3', label: 'SR-03', folder: 'room', children: [] },
		] },
		{ id: 'dc', label: 'Data Center', folder: 'dc', children: [
			{ id: 'rowa', label: 'Row A', folder: 'row', children: [
				{ id: 'rowa-fr', label: 'Row A — Front Elevation', drawing: 'elevation' },
				{ id: 'rowa-re', label: 'Row A — Rear Elevation', drawing: 'elevation' },
				{ id: 'rowa-tv', label: 'Row A — Top View', drawing: 'plan' },
			] },
			{ id: 'rowb', label: 'Row B', folder: 'row', children: [] },
		] },
		{ id: 'racks', label: 'Racks', folder: 'racks', children: [
			{ id: 'r1', label: 'R-01', folder: 'rack', children: [] },
			{ id: 'r2', label: 'R-02', folder: 'rack', children: [] },
			{ id: 'r3', label: 'R-03', folder: 'rack', children: [] },
		] },
	]
	const folderIcon: Record<string, string> = {
		floors: 'layers', floor: 'mapPin', server: 'server', room: 'server',
		dc: 'home', row: 'rows', racks: 'server', rack: 'server',
	}
	const drawingIcon: Record<Kind, string> = { plan: 'mapPin', sheet: 'fileText', elevation: 'box' }

	let expanded = $state(new Set<string>(['floors', 'f3', 'dc', 'rowa']))
	let search = $state('')
	function toggle(id: string) { const s = new Set(expanded); s.has(id) ? s.delete(id) : s.add(id); expanded = s }
	const hit = (s: string) => !search || s.toLowerCase().includes(search.toLowerCase())
	// a node is shown if it (or any descendant) matches the search
	function visible(n: Node): boolean { return hit(n.label) || (n.children?.some(visible) ?? false) }
</script>

<div class="dn">
	<div class="dn-head">
		<span class="dn-title">DRAWINGS</span>
		<div class="dn-acts">
			<button title="New drawing" aria-label="New drawing"><Icon name="plus" size={14} /></button>
			<button title="Filter" aria-label="Filter"><Icon name="settings" size={14} /></button>
			<button title="Collapse" aria-label="Collapse panel" onclick={() => oncollapse?.()}><Icon name="chevronLeft" size={14} /></button>
		</div>
	</div>
	<div class="dn-search">
		<Icon name="search" size={12} />
		<input placeholder="Search drawings…" bind:value={search} />
	</div>
	<div class="dn-tree">
		{#each TREE as n (n.id)}{@render row(n, 0)}{/each}
	</div>
</div>

{#snippet row(n: Node, depth: number)}
	{#if !search || visible(n)}
		{@const isOpen = expanded.has(n.id) || (!!search && (n.children?.length ?? 0) > 0)}
		{#if n.drawing}
			<!-- drawing leaf: opens a tab -->
			<button class="dn-row leaf" class:active={activeTitle === n.label} style:padding-left="{depth * 12 + 8}px"
				onclick={() => onopen?.({ title: n.label, kind: n.drawing! })}>
				<span class="dn-chev spacer"></span>
				<Icon name={drawingIcon[n.drawing]} size={13} />
				<span class="dn-name">{n.label}</span>
			</button>
		{:else}
			<!-- location folder: expand/collapse -->
			<!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
			<div class="dn-row folder" style:padding-left="{depth * 12 + 8}px" onclick={() => toggle(n.id)}>
				{#if n.children?.length}
					<span class="dn-chev"><Icon name={isOpen ? 'chevronDown' : 'chevronRight'} size={12} /></span>
				{:else}
					<span class="dn-chev spacer"></span>
				{/if}
				<Icon name={folderIcon[n.folder ?? ''] ?? 'folder'} size={13} />
				<span class="dn-name">{n.label}</span>
			</div>
			{#if isOpen && n.children}
				{#each n.children as c (c.id)}{@render row(c, depth + 1)}{/each}
			{/if}
		{/if}
	{/if}
{/snippet}

<style>
	.dn { flex:1; display:flex; flex-direction:column; min-height:0; }
	.dn-head { display:flex; align-items:center; justify-content:space-between; height:30px; padding:0 6px; border-bottom:1px solid var(--line-soft); }
	.dn-title { font-size:11px; text-transform:uppercase; letter-spacing:.08em; color:var(--muted); font-weight:600; }
	.dn-acts { display:flex; gap:1px; }
	.dn-acts button { display:inline-flex; align-items:center; justify-content:center; width:24px; height:22px; border-radius:4px; color:var(--muted); background:none; border:none; }
	.dn-acts button:hover { background:var(--hover); color:var(--text); }
	.dn-search { display:flex; align-items:center; gap:5px; margin:6px; background:var(--input); border:1px solid var(--line); border-radius:5px; padding:0 7px; }
	.dn-search :global(svg) { color:var(--faint); flex:0 0 auto; }
	.dn-search input { flex:1; min-width:0; background:none; border:none; color:var(--text); font-size:12px; padding:5px 0; }
	.dn-search input:focus { outline:none; }

	.dn-tree { flex:1; overflow-y:auto; padding:2px 4px 6px; scrollbar-width:thin; scrollbar-color:var(--line) transparent; }
	.dn-row { display:flex; align-items:center; gap:5px; width:100%; padding-top:4px; padding-bottom:4px; padding-right:6px;
		border-radius:5px; color:var(--text); background:none; border:none; text-align:left; cursor:pointer; user-select:none; }
	.dn-row:hover { background:var(--hover); }
	.dn-row.active { background:var(--active); box-shadow:inset 2px 0 0 var(--accent); }
	.dn-row :global(svg) { color:var(--muted); flex:0 0 auto; }
	.dn-row.active :global(svg) { color:var(--accent); }
	.dn-row.folder .dn-name { font-weight:600; }
	.dn-name { flex:1; min-width:0; font-size:12px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
	.dn-chev { display:inline-flex; align-items:center; justify-content:center; width:14px; height:14px; flex:0 0 auto; color:var(--muted); }
	.dn-chev.spacer { width:14px; }
</style>
