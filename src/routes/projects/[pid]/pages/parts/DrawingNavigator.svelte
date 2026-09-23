<script lang="ts">
	// Left-sidebar DRAWING NAVIGATOR (Pages mockup) — modelled on the reference design:
	// a tree organised by LOCATION (Floors / Server Rooms / Data Center / Racks) whose
	// leaves are the drawings / views. Clicking a leaf opens it as a canvas tab. Mock data.
	import { Icon, DragReorder } from '$lib'
	import { tick } from 'svelte'
	import { type NavKind as Kind, type NavNode as Node, NAV_TREE as TREE, NAV_PROJECT as PROJECT } from '../mock/data'

	let { onopen, onopenfloor, oncollapse, onselectnode, activeDoc = '', activeNode = '', tree = null, project = null, status = '', onaddbuilding, onmovefloor, onmovebuilding }:
		{ onopen?: (d: { title: string; kind: Kind; preview: boolean; floor?: string; docId?: string }) => void; oncollapse?: () => void;
			/** A FLOOR row was clicked (preview) or double-clicked (kept): open that floor's model tab. */
			onopenfloor?: (floor: string, preview: boolean) => void;
			onselectnode?: (n: { id: string; label: string; kind: string; floorNumber?: number; building?: string }) => void;
			/** B18: the active tab's drawing id — a drawing row is highlighted by id, not by label */ activeDoc?: string; activeNode?: string;
			/** The REAL project tree (projectTree.ts, from Firestore) + its project label; null → the mock tree. */
			tree?: Node[] | null; project?: { id: string; label: string } | null;
			/** A line under the project label while the real tree loads / when the project isn't in Firestore. */
			status?: string;
			/** Real tree only: create a building (resolves false if the name is empty / taken), drag a floor into a
			 *  building, drag a building to reorder. Absent → no New-building button, no dragging (the mock tree). */
			onaddbuilding?: (name: string) => Promise<boolean>; onmovefloor?: (floorNumber: number, building: string) => void;
			onmovebuilding?: (name: string, target: string, after: boolean) => void } = $props()
	const TREE_NODES = $derived(tree ?? TREE)
	const PROJ = $derived(project ? { ...project, kind: 'project' } : PROJECT)
	// A floor row's model / tab name: the real tree carries it (`floor`, e.g. '33F'); the mock's label is it.
	const floorOf = (n: Node) => n.floor ?? n.label

	// ── buildings (real tree): New building + drag floors between buildings / reorder buildings ──
	// One DragReorder over the building + floor rows ($lib, the Layers panel's helper): dropping a FLOOR on a
	// building moves it there, on another floor moves it into THAT floor's building; dropping a BUILDING on a
	// building reorders. Anything else is ignored. Index = position in the flattened tree (drop direction).
	const canDrag = $derived(!!tree && !!onmovefloor)
	const flat = $derived.by(() => { const out: Node[] = []; const walk = (ns: Node[]) => { for (const n of ns) { out.push(n); if (n.children) walk(n.children) } }; walk(TREE_NODES); return out })
	const nodeById = (id: string) => flat.find((n) => n.id === id)
	const buildingOfNode = (n: Node): string | undefined => n.folder === 'building' ? n.label : TREE_NODES.find((b) => b.folder === 'building' && b.children?.some((c) => c.id === n.id))?.label
	const dr = new DragReorder((id, targetId, after) => {
		const a = nodeById(id), t = nodeById(targetId); if (!a || !t) return
		if (a.folder === 'floor' && a.floorNumber != null) { const b = buildingOfNode(t); if (b && b !== buildingOfNode(a)) onmovefloor?.(a.floorNumber, b) }
		else if (a.folder === 'building' && t.folder === 'building') onmovebuilding?.(a.label, t.label, after)
	}, (id) => flat.findIndex((n) => n.id === id))
	const dragProps = (n: Node) => (canDrag && (n.folder === 'building' || (n.folder === 'floor' && n.floorNumber != null)) ? dr.row(n.id) : {})
	// the drop target highlights as a whole row (a floor goes INTO a building, not between rows)
	const dropInto = (n: Node) => dr.dragId != null && (dr.isBefore(n.id) || dr.isAfter(n.id)) && nodeById(dr.dragId)?.folder === 'floor'

	let naming = $state(false), newName = $state(''), nameErr = $state('')
	function focusSel(node: HTMLInputElement) { tick().then(() => { node.focus(); node.select() }) }
	async function commitBuilding() {
		const n = newName.trim(); if (!n) { naming = false; return }
		if (await onaddbuilding?.(n)) { naming = false; newName = ''; nameErr = '' } else nameErr = 'That name is empty or already used'
	}

	// Location hierarchy Project › Building › Floor › Zone › Room › Row, with drawing/view
	// leaves hung at the level they belong to. Folders expand; drawing leaves open a tab.
	// Buildings are the top level; the Project sits ABOVE the tree as a label (click → project props).
	const folderIcon: Record<string, string> = {
		project: 'folderOpen', building: 'home', floor: 'layers', zone: 'crop', room: 'server', row: 'rows', group: 'folder',
	}
	const drawingIcon: Record<Kind, string> = { plan: 'mapPin', sheet: 'fileText', elevation: 'box' }

	let expanded = $state(new Set<string>(['b-hibiya', 'f33', 'z3303']))
	// Real tree: BUILDINGS start open (tracked as `collapsed` instead), so a building that appears later —
	// e.g. once the risers load and floors regroup — is open too. Everything else starts closed.
	let collapsed = $state(new Set<string>())
	const openOf = (n: Node) => (tree && n.folder === 'building' ? !collapsed.has(n.id) : expanded.has(n.id))
	let search = $state('')
	function toggle(id: string) {
		if (tree && id.startsWith('b:')) { const c = new Set(collapsed); c.has(id) ? c.delete(id) : c.add(id); collapsed = c; return }
		const s = new Set(expanded); s.has(id) ? s.delete(id) : s.add(id); expanded = s
	}
	const hit = (s: string) => !search || s.toLowerCase().includes(search.toLowerCase())
	// a node is shown if it (or any descendant) matches the search
	function visible(n: Node): boolean { return hit(n.label) || (n.children?.some(visible) ?? false) }
</script>

<div class="dn">
	<div class="dn-head">
		<span class="dn-title">DRAWINGS</span>
		<div class="dn-acts">
			{#if onaddbuilding && tree}
				<button title="New building" aria-label="New building" onclick={() => { naming = true; newName = ''; nameErr = '' }}><Icon name="home" size={14} /></button>
			{/if}
			<button title="New drawing" aria-label="New drawing"><Icon name="plus" size={14} /></button>
			<button title="Filter" aria-label="Filter"><Icon name="settings" size={14} /></button>
			<button title="Collapse" aria-label="Collapse panel" onclick={() => oncollapse?.()}><Icon name="chevronLeft" size={14} /></button>
		</div>
	</div>
	<div class="dn-search">
		<Icon name="search" size={12} />
		<input placeholder="Search drawings…" bind:value={search} />
	</div>
	<button class="dn-project" class:active={activeNode === PROJ.id} onclick={() => onselectnode?.(PROJ)}
		title="Project properties">
		<Icon name="folderOpen" size={13} />
		<span class="dn-name">{PROJ.label}</span>
	</button>
	{#if status}<div class="dn-status">{status}</div>{/if}
	{#if naming}
		<div class="dn-newb">
			<Icon name="home" size={13} />
			<input placeholder="Building name…" bind:value={newName} use:focusSel
				onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitBuilding() } else if (e.key === 'Escape') { naming = false } }}
				onblur={() => { if (!newName.trim()) naming = false }} />
		</div>
		{#if nameErr}<div class="dn-status err">{nameErr}</div>{/if}
	{/if}
	<div class="dn-tree">
		{#each TREE_NODES as n (n.id)}{@render row(n, 0, undefined)}{/each}
	</div>
</div>

<!-- `floor` = the nearest floor ancestor's label: a drawing under it views that floor's model -->
{#snippet row(n: Node, depth: number, floor: string | undefined)}
	{#if !search || visible(n)}
		{@const isOpen = openOf(n) || (!!search && (n.children?.length ?? 0) > 0)}
		{#if n.drawing}
			<!-- drawing leaf: opens a tab -->
			<!-- single-click = preview tab (italic, reused); double-click promotes it to a kept tab -->
			<button class="dn-row leaf" class:active={activeDoc === (n.docId ?? n.id)} style:padding-left="{depth * 12 + 8}px"
				onclick={() => onopen?.({ title: n.label, kind: n.drawing!, preview: true, floor, docId: n.docId ?? n.id })}
				ondblclick={() => onopen?.({ title: n.label, kind: n.drawing!, preview: false, floor, docId: n.docId ?? n.id })}>
				<span class="dn-chev spacer"></span>
				<Icon name={drawingIcon[n.drawing]} size={13} />
				<span class="dn-name">{n.label}</span>
			</button>
		{:else}
			<!-- location folder: chevron toggles expand; the row selects it (props in right panel). A FLOOR row
			     also opens the floor's model tab — single click previews, double click keeps (like a drawing). -->
			<div class="dn-row folder" class:active={activeNode === n.id} style:padding-left="{depth * 12 + 8}px"
				{...dragProps(n)} class:drop-into={dropInto(n)} class:drag-before={!dropInto(n) && dr.isBefore(n.id)} class:drag-after={!dropInto(n) && dr.isAfter(n.id)}
				onclick={() => { onselectnode?.({ id: n.id, label: n.label, kind: n.folder ?? 'folder', floorNumber: n.floorNumber, building: n.building }); if (n.folder === 'floor') onopenfloor?.(floorOf(n), true) }}
				ondblclick={() => { if (n.folder === 'floor') onopenfloor?.(floorOf(n), false) }}
				role="button" tabindex="0" onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onselectnode?.({ id: n.id, label: n.label, kind: n.folder ?? 'folder' }) } }}>
				{#if n.children?.length}
					<button class="dn-chev" title="Expand/collapse" aria-label="Expand/collapse"
						onclick={(e) => { e.stopPropagation(); toggle(n.id) }}><Icon name={isOpen ? 'chevronDown' : 'chevronRight'} size={12} /></button>
				{:else}
					<span class="dn-chev spacer"></span>
				{/if}
				<Icon name={folderIcon[n.folder ?? ''] ?? 'folder'} size={13} />
				<span class="dn-name">{n.label}</span>
				{#if n.meta}<span class="dn-meta">{n.meta}</span>{/if}
			</div>
			{#if isOpen && n.children}
				{#each n.children as c (c.id)}{@render row(c, depth + 1, n.folder === 'floor' ? floorOf(n) : floor)}{/each}
			{/if}
		{/if}
	{/if}
{/snippet}

<style>
	.dn { flex:1; display:flex; flex-direction:column; min-height:0; }
	.dn-status { font-size:10px; color:var(--faint); padding:2px 12px 4px; }
	.dn-status.err { color:#f87171; }
	.dn-newb { display:flex; align-items:center; gap:6px; margin:2px 6px 4px; padding:3px 6px; border:1px solid var(--accent); border-radius:5px; color:var(--muted); }
	.dn-newb input { flex:1; min-width:0; background:none; border:none; color:var(--text); font-size:12px; }
	.dn-newb input:focus { outline:none; }
	/* drag a floor INTO a building (whole-row highlight) / a building before / after another (a line) */
	.dn-row.drop-into { background:var(--active); outline:1px dashed var(--accent); outline-offset:-1px; }
	.dn-row.drag-before { box-shadow:inset 0 2px 0 var(--accent); }
	.dn-row.drag-after { box-shadow:inset 0 -2px 0 var(--accent); }
	.dn-meta { margin-left:auto; padding-left:6px; font-size:10px; color:var(--faint); white-space:nowrap; }
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
