<script lang="ts">
	// Left-sidebar DRAWING NAVIGATOR (Pages mockup) — modelled on the reference design:
	// a tree organised by LOCATION (Floors / Server Rooms / Data Center / Racks) whose
	// leaves are the drawings / views. Clicking a leaf opens it as a canvas tab. Mock data.
	import { Icon } from '$lib'

	type Kind = 'plan' | 'sheet' | 'elevation'
	type Node = { id: string; label: string; folder?: string; drawing?: Kind; children?: Node[] }

	let { onopen, oncollapse, onselectnode, activeTitle = '', activeNode = '' }:
		{ onopen?: (d: { title: string; kind: Kind; preview: boolean }) => void; oncollapse?: () => void;
			onselectnode?: (n: { id: string; label: string; kind: string }) => void; activeTitle?: string; activeNode?: string } = $props()

	// Location hierarchy Project › Building › Floor › Zone › Room › Row, with drawing/view
	// leaves hung at the level they belong to. Folders expand; drawing leaves open a tab.
	// Buildings are the top level; the Project sits ABOVE the tree as a label (click → project props).
	const PROJECT = { id: 'project', label: 'Project Journey', kind: 'project' }
	const TREE: Node[] = [
		{ id: 'b-hibiya', label: 'Hibiya Midtown', folder: 'building', children: [
			{ id: 'f33', label: '33F', folder: 'floor', children: [
				{ id: 'f33-plan', label: '33F — Floorplan', drawing: 'plan' },
				{ id: 'f33-hlo', label: '33F — High Level Outlets', drawing: 'sheet' },
				{ id: 'f33-llo', label: '33F — Low Level Outlets', drawing: 'sheet' },
				{ id: 'f33-tr', label: '33F — Trunk Routes', drawing: 'sheet' },
				{ id: 'z3303', label: 'Zone 3303', folder: 'zone', children: [
					{ id: 'z3303-out', label: 'Zone 3303 — Outlets', drawing: 'sheet' },
					{ id: 'idf1', label: 'IDF1', folder: 'room', children: [
						{ id: 'idf1-elev', label: 'IDF1 — Rack Elevation', drawing: 'elevation' },
						{ id: 'idf1-ra', label: 'Row A', folder: 'row' },
						{ id: 'idf1-rb', label: 'Row B', folder: 'row' },
					] },
					{ id: 'idf2', label: 'IDF2', folder: 'room', children: [
						{ id: 'idf2-ra', label: 'Row A', folder: 'row' },
						{ id: 'idf2-rb', label: 'Row B', folder: 'row' },
					] },
				] },
				{ id: 'z3307', label: 'Zone 3307', folder: 'zone', children: [
					{ id: 'z3307-idf1', label: 'IDF1', folder: 'room', children: [
						{ id: 'z3307-ra', label: 'Row A', folder: 'row' },
					] },
				] },
			] },
			{ id: 'f30', label: '30F', folder: 'floor', children: [
				{ id: 'z3001', label: 'Zone 3001', folder: 'zone', children: [
					{ id: 'z3001-ra', label: 'Row A', folder: 'row' },
				] },
			] },
		] },
		{ id: 'b-shinmaru', label: 'Shinmaru', folder: 'building', children: [
			{ id: 'f18', label: '18F', folder: 'floor', children: [
				{ id: 'o1201', label: 'Office 1201', folder: 'zone', children: [
					{ id: 'o1201-ra', label: 'Row A', folder: 'row' },
				] },
			] },
		] },
	]
	const folderIcon: Record<string, string> = {
		project: 'folderOpen', building: 'home', floor: 'layers', zone: 'crop', room: 'server', row: 'rows',
	}
	const drawingIcon: Record<Kind, string> = { plan: 'mapPin', sheet: 'fileText', elevation: 'box' }

	let expanded = $state(new Set<string>(['b-hibiya', 'f33', 'z3303']))
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
	<button class="dn-project" class:active={activeNode === PROJECT.id} onclick={() => onselectnode?.(PROJECT)}
		title="Project properties">
		<Icon name="folderOpen" size={13} />
		<span class="dn-name">{PROJECT.label}</span>
	</button>
	<div class="dn-tree">
		{#each TREE as n (n.id)}{@render row(n, 0)}{/each}
	</div>
</div>

{#snippet row(n: Node, depth: number)}
	{#if !search || visible(n)}
		{@const isOpen = expanded.has(n.id) || (!!search && (n.children?.length ?? 0) > 0)}
		{#if n.drawing}
			<!-- drawing leaf: opens a tab -->
			<!-- single-click = preview tab (italic, reused); double-click promotes it to a kept tab -->
			<button class="dn-row leaf" class:active={activeTitle === n.label} style:padding-left="{depth * 12 + 8}px"
				onclick={() => onopen?.({ title: n.label, kind: n.drawing!, preview: true })}
				ondblclick={() => onopen?.({ title: n.label, kind: n.drawing!, preview: false })}>
				<span class="dn-chev spacer"></span>
				<Icon name={drawingIcon[n.drawing]} size={13} />
				<span class="dn-name">{n.label}</span>
			</button>
		{:else}
			<!-- location folder: chevron toggles expand; the row selects it (props in right panel) -->
			<div class="dn-row folder" class:active={activeNode === n.id} style:padding-left="{depth * 12 + 8}px"
				onclick={() => onselectnode?.({ id: n.id, label: n.label, kind: n.folder ?? 'folder' })}
				role="button" tabindex="0" onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onselectnode?.({ id: n.id, label: n.label, kind: n.folder ?? 'folder' }) } }}>
				{#if n.children?.length}
					<button class="dn-chev" title="Expand/collapse" aria-label="Expand/collapse"
						onclick={(e) => { e.stopPropagation(); toggle(n.id) }}><Icon name={isOpen ? 'chevronDown' : 'chevronRight'} size={12} /></button>
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

	.dn-project { display:flex; align-items:center; gap:6px; width:auto; margin:0 6px 2px; padding:6px 8px; border-radius:5px;
		color:var(--text); background:var(--panel2); border:1px solid var(--line); text-align:left; cursor:pointer; }
	.dn-project:hover { background:var(--hover); }
	.dn-project.active { background:var(--active); box-shadow:inset 2px 0 0 var(--accent); }
	.dn-project :global(svg) { color:var(--accent); flex:0 0 auto; }
	.dn-project .dn-name { font-weight:600; }
	.dn-tree { flex:1; overflow-y:auto; padding:2px 4px 6px; scrollbar-width:thin; scrollbar-color:var(--line) transparent; }
	.dn-row { display:flex; align-items:center; gap:5px; width:100%; padding-top:4px; padding-bottom:4px; padding-right:6px;
		border-radius:5px; color:var(--text); background:none; border:none; text-align:left; cursor:pointer; user-select:none; }
	.dn-row:hover { background:var(--hover); }
	.dn-row.active { background:var(--active); box-shadow:inset 2px 0 0 var(--accent); }
	.dn-row :global(svg) { color:var(--muted); flex:0 0 auto; }
	.dn-row.active :global(svg) { color:var(--accent); }
	.dn-row.folder .dn-name { font-weight:600; }
	.dn-name { flex:1; min-width:0; font-size:12px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
	.dn-chev { display:inline-flex; align-items:center; justify-content:center; width:14px; height:14px; flex:0 0 auto; color:var(--muted); padding:0; background:none; border:none; border-radius:3px; }
	button.dn-chev:hover { background:var(--line); color:var(--text); }
	.dn-chev.spacer { width:14px; }
</style>
