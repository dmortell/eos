<script lang="ts">
	// Left-sidebar DRAWING NAVIGATOR (Pages mockup) — modelled on the reference design:
	// a tree organised by LOCATION (Floors / Server Rooms / Data Center / Racks) whose
	// leaves are the drawings / views. Clicking a leaf opens it as a canvas tab. Mock data.
	import { Icon, DragReorder } from '$lib'
	import { TreeDrag, type DropZone } from './treeDrag.svelte'
	import { tick, untrack } from 'svelte'
	import { type NavKind as Kind, type NavNode as Node, NAV_TREE as TREE, NAV_PROJECT as PROJECT } from '../mock/data'

	let { onopen, onopenfloor, oncollapse, onselectnode, activeDoc = '', activeNode = '', tree = null, project = null, status = '', onaddbuilding, onmovefloor, onmovebuilding, reveal = [],
		placesMode = false, onseedplaces, onplaceadd, onplacerename, onplacemove, onplacedelete, onopenplace, onsheetadd, onsheetrename, onsheetarchive, onplaceimport }:
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
			onmovebuilding?: (name: string, target: string, after: boolean) => void;
			/** Node ids to open (e.g. the restored item's ancestors) — expanded once when they change. */
			reveal?: string[]
			/** drawings-plan phase 2: the tree is built from the project's PAGES places (store/placeTree.ts) — rows
			 *  marked `place` can be added / renamed / dragged anywhere / deleted. */
			placesMode?: boolean
			/** No places yet: offer to create them once from the project data (store/places.ts seedPlaces). */
			onseedplaces?: () => void
			/** New place under `parentId` (null = top level); returns its id so the row opens for renaming. */
			onplaceadd?: (parentId: string | null) => string | undefined
			onplacerename?: (id: string, name: string) => void
			onplacemove?: (id: string, targetId: string, zone: DropZone) => void
			/** Delete a place; returns an error message when it can't be deleted (it holds things). */
			onplacedelete?: (id: string) => string | null
			/** Places mode: open a place's MODEL tab (creating the model if it has none) — a floor place previews it
			 *  on click, any place opens it (kept) on double-click (drawings-plan phase 3). */
			onopenplace?: (id: string, preview: boolean) => void
			/** Places mode (drawings-plan phase 4): a new Pages sheet filed under a place — returns its tree row id
			 *  so it opens for renaming; rename / archive a sheet leaf. Sheets drag like places (`onplacemove`). */
			onsheetadd?: (placeId: string) => string | undefined
			onsheetrename?: (rowId: string, title: string) => void
			onsheetarchive?: (rowId: string) => void
			/** Import the place's outlets + trunks from the Outlets tool into its model (places with `outletsDoc`). */
			onplaceimport?: (placeId: string) => void } = $props()
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
	const td = new TreeDrag((id, target, zone) => onplacemove?.(id, target, zone))
	const dragProps = (n: Node) => placesMode ? ((n.place || n.sheet) && onplacemove ? td.row(n.id) : {})
		: (canDrag && (n.folder === 'building' || (n.folder === 'floor' && n.floorNumber != null)) ? dr.row(n.id) : {})
	// the drop target highlights as a whole row (a floor goes INTO a building, not between rows; a place INTO a place)
	const dropInto = (n: Node) => placesMode ? td.zoneOf(n.id) === 'into' : dr.dragId != null && (dr.isBefore(n.id) || dr.isAfter(n.id)) && nodeById(dr.dragId)?.folder === 'floor'
	const dropBefore = (n: Node) => placesMode ? td.zoneOf(n.id) === 'before' : !dropInto(n) && dr.isBefore(n.id)
	const dropAfter = (n: Node) => placesMode ? td.zoneOf(n.id) === 'after' : !dropInto(n) && dr.isAfter(n.id)
	// Which floor model a row opens: places carry it (`modelFloor`, null = none); the old trees open a 'floor' folder.
	const modelFloorOf = (n: Node): string | null => (n.modelFloor !== undefined ? n.modelFloor : n.folder === 'floor' ? floorOf(n) : null)

	// ── places: add / rename (inline) / delete (two-step) / seed (two-step) ──
	let renamingId = $state<string | null>(null), renameText = $state('')
	let confirmDel = $state<string | null>(null), delErr = $state<{ id: string; msg: string } | null>(null)
	let confirmSeed = $state(false)
	function addPlace(parentId: string | null) {
		const id = onplaceadd?.(parentId); if (!id) return
		if (parentId) { const s2 = new Set(expanded); s2.add(parentId); expanded = s2; const c = new Set(collapsed); c.delete(parentId); collapsed = c }
		renamingId = id; renameText = 'New place'
	}
	function startRename(n: Node) { renamingId = n.id; renameText = n.label }
	function commitRename() { const id = renamingId; renamingId = null; if (id && renameText.trim()) onplacerename?.(id, renameText.trim()) }
	function addSheet(placeId: string) {
		const id = onsheetadd?.(placeId); if (!id) return
		const s2 = new Set(expanded); s2.add(placeId); expanded = s2; const c = new Set(collapsed); c.delete(placeId); collapsed = c
		renamingId = id; renameText = 'New sheet'
	}
	// the inline rename box serves places and sheet leaves; commit routes by row kind
	function commitAnyRename() {
		const id = renamingId; if (!id) return
		if (nodeById(id)?.sheet) { renamingId = null; if (renameText.trim()) onsheetrename?.(id, renameText.trim()) }
		else commitRename()
	}
	let confirmImport = $state<string | null>(null)
	function importPlace(id: string) {
		if (confirmImport !== id) { confirmImport = id; setTimeout(() => { if (confirmImport === id) confirmImport = null }, 3000); return }
		confirmImport = null; onplaceimport?.(id)
	}
	let confirmArchive = $state<string | null>(null)
	function archiveSheet(id: string) {
		if (confirmArchive !== id) { confirmArchive = id; setTimeout(() => { if (confirmArchive === id) confirmArchive = null }, 3000); return }
		confirmArchive = null; onsheetarchive?.(id)
	}
	function deletePlace(id: string) {
		if (confirmDel !== id) { confirmDel = id; delErr = null; setTimeout(() => { if (confirmDel === id) confirmDel = null }, 3000); return }
		confirmDel = null
		const err = onplacedelete?.(id) ?? null
		delErr = err ? { id, msg: err } : null
	}

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
	// open the ancestors a caller asks for (buildings are open by default — un-collapse them too)
	$effect(() => {
		const ids = reveal; if (!ids.length) return
		untrack(() => {
			expanded = new Set([...expanded, ...ids.filter((i) => !i.startsWith('b:'))])
			const c = new Set(collapsed); for (const i of ids) c.delete(i); collapsed = c
		})
	})
	// Real tree: BUILDINGS start open (tracked as `collapsed` instead), so a building that appears later —
	// e.g. once the risers load and floors regroup — is open too. Everything else starts closed.
	let collapsed = $state(new Set<string>())
	const topIds = $derived(new Set(TREE_NODES.map((n) => n.id)))
	const openByDefault = (n: Node) => !!tree && (placesMode ? topIds.has(n.id) && !!n.place : n.folder === 'building')
	const openOf = (n: Node) => (openByDefault(n) ? !collapsed.has(n.id) : expanded.has(n.id))
	let search = $state('')
	function toggle(id: string) {
		const n = nodeById(id)
		if (n && openByDefault(n)) { const c = new Set(collapsed); c.has(id) ? c.delete(id) : c.add(id); collapsed = c; return }
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
			{#if placesMode && onplaceadd}
				<button title="New top-level place" aria-label="New place" onclick={() => addPlace(null)}><Icon name="home" size={14} /></button>
			{:else if onaddbuilding && tree}
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
		<span class="dn-name" title={PROJ.label}>{PROJ.label}</span>
	</button>
	{#if status}<div class="dn-status">{status}</div>{/if}
	{#if onseedplaces && !placesMode}
		<div class="dn-seed">
			{#if confirmSeed}
				<span>Create this project's Pages places from its floors, zones, rooms and rows? This writes to the project once.</span>
				<div class="dn-seed-btns"><button class="primary" onclick={() => { confirmSeed = false; onseedplaces?.() }}>Create</button><button onclick={() => (confirmSeed = false)}>Cancel</button></div>
			{:else}
				<span>Pages places aren't set up for this project yet — the tree below comes from the other tools' data.</span>
				<div class="dn-seed-btns"><button class="primary" onclick={() => (confirmSeed = true)}>Set up places…</button></div>
			{/if}
		</div>
	{/if}
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
		{#if n.drawing && n.sheet && placesMode}
			<!-- a stored Pages SHEET: opens a tab like any drawing; draggable between places, renamable, archivable -->
			<div class="dn-row leaf" class:active={activeDoc === (n.docId ?? n.id)} style:padding-left="{depth * 12 + 8}px" role="button" tabindex="0"
				{...dragProps(n)} class:drag-before={dropBefore(n)} class:drag-after={dropAfter(n) || dropInto(n)}
				onclick={() => onopen?.({ title: n.label, kind: n.drawing!, preview: true, floor, docId: n.docId ?? n.id })}
				ondblclick={() => onopen?.({ title: n.label, kind: n.drawing!, preview: false, floor, docId: n.docId ?? n.id })}
				onkeydown={(e) => { if (e.key === 'Enter') onopen?.({ title: n.label, kind: n.drawing!, preview: false, floor, docId: n.docId ?? n.id }) }}>
				<span class="dn-chev spacer"></span>
				<Icon name={drawingIcon[n.drawing]} size={13} />
				{#if renamingId === n.id}
					<input class="dn-rename" bind:value={renameText} use:focusSel onclick={(e) => e.stopPropagation()} ondblclick={(e) => e.stopPropagation()}
						onkeydown={(e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); commitAnyRename() } else if (e.key === 'Escape') renamingId = null }}
						onblur={commitAnyRename} />
				{:else}
					<span class="dn-name" title={n.label}>{n.label}</span>
					<span class="dn-acts-row">
						{#if onsheetrename}<button title="Rename" aria-label="Rename" onclick={(e) => { e.stopPropagation(); startRename(n) }}><Icon name="edit" size={12} /></button>{/if}
						{#if onsheetarchive}<button class:confirm={confirmArchive === n.id} title={confirmArchive === n.id ? 'Click again to archive' : 'Archive'} aria-label="Archive"
							onclick={(e) => { e.stopPropagation(); archiveSheet(n.id) }}><Icon name="trash" size={12} />{#if confirmArchive === n.id}<span>Archive?</span>{/if}</button>{/if}
					</span>
				{/if}
			</div>
		{:else if n.drawing}
			<!-- drawing leaf: opens a tab -->
			<!-- single-click = preview tab (italic, reused); double-click promotes it to a kept tab -->
			<button class="dn-row leaf" class:active={activeDoc === (n.docId ?? n.id)} style:padding-left="{depth * 12 + 8}px"
				onclick={() => onopen?.({ title: n.label, kind: n.drawing!, preview: true, floor, docId: n.docId ?? n.id })}
				ondblclick={() => onopen?.({ title: n.label, kind: n.drawing!, preview: false, floor, docId: n.docId ?? n.id })}>
				<span class="dn-chev spacer"></span>
				<Icon name={drawingIcon[n.drawing]} size={13} />
				<span class="dn-name" title={n.label}>{n.label}</span>
			</button>
		{:else}
			<!-- location folder: chevron toggles expand; the row selects it (props in right panel). A FLOOR row
			     also opens the floor's model tab — single click previews, double click keeps (like a drawing). -->
			<div class="dn-row folder" class:active={activeNode === n.id} style:padding-left="{depth * 12 + 8}px"
				{...dragProps(n)} class:drop-into={dropInto(n)} class:drag-before={dropBefore(n)} class:drag-after={dropAfter(n)}
				onclick={() => { onselectnode?.({ id: n.id, label: n.label, kind: n.place ? 'place' : n.folder ?? 'folder', floorNumber: n.floorNumber, building: n.building })
					if (n.place && onopenplace) { if (n.modelFloor) onopenplace(n.id, true) } else { const mf = modelFloorOf(n); if (mf) onopenfloor?.(mf, true) } }}
				ondblclick={() => { if (n.place && onopenplace) onopenplace(n.id, false); else { const mf = modelFloorOf(n); if (mf) onopenfloor?.(mf, false) } }}
				role="button" tabindex="0" onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onselectnode?.({ id: n.id, label: n.label, kind: n.folder ?? 'folder' }) } }}>
				{#if n.children?.length}
					<button class="dn-chev" title="Expand/collapse" aria-label="Expand/collapse"
						onclick={(e) => { e.stopPropagation(); toggle(n.id) }}><Icon name={isOpen ? 'chevronDown' : 'chevronRight'} size={12} /></button>
				{:else}
					<span class="dn-chev spacer"></span>
				{/if}
				<Icon name={folderIcon[n.folder ?? ''] ?? 'folder'} size={13} />
				{#if renamingId === n.id}
					<input class="dn-rename" bind:value={renameText} use:focusSel onclick={(e) => e.stopPropagation()} ondblclick={(e) => e.stopPropagation()}
						onkeydown={(e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); commitAnyRename() } else if (e.key === 'Escape') renamingId = null }}
						onblur={commitAnyRename} />
				{:else}
					<span class="dn-name" title={n.meta ? `${n.label} · ${n.meta}` : n.label}>{n.label}</span>
					{#if n.meta}<span class="dn-meta">{n.meta}</span>{/if}
					{#if placesMode && n.place}
						<span class="dn-acts-row">
							{#if onplaceimport && n.outletsDoc}<button class:confirm={confirmImport === n.id} title={confirmImport === n.id ? 'Click again to import outlets + trunks from the Outlets tool' : 'Import outlets + trunks from the Outlets tool'} aria-label="Import from Outlets tool"
								onclick={(e) => { e.stopPropagation(); importPlace(n.id) }}><Icon name="download" size={12} />{#if confirmImport === n.id}<span>Import?</span>{/if}</button>{/if}
							{#if onsheetadd}<button title="New sheet here" aria-label="New sheet" onclick={(e) => { e.stopPropagation(); addSheet(n.id) }}><Icon name="fileText" size={12} /></button>{/if}
							{#if onplaceadd}<button title="New place inside" aria-label="New place inside" onclick={(e) => { e.stopPropagation(); addPlace(n.id) }}><Icon name="plus" size={12} /></button>{/if}
							{#if onplacerename}<button title="Rename" aria-label="Rename" onclick={(e) => { e.stopPropagation(); startRename(n) }}><Icon name="edit" size={12} /></button>{/if}
							{#if onplacedelete}<button class:confirm={confirmDel === n.id} title={confirmDel === n.id ? 'Click again to delete' : 'Delete'} aria-label="Delete"
								onclick={(e) => { e.stopPropagation(); deletePlace(n.id) }}><Icon name="trash" size={12} />{#if confirmDel === n.id}<span>Delete?</span>{/if}</button>{/if}
						</span>
					{/if}
				{/if}
			</div>
			{#if delErr?.id === n.id}<div class="dn-status err" style:padding-left="{depth * 12 + 28}px">{delErr.msg}</div>{/if}
			{#if isOpen && n.children}
				{#each n.children as c (c.id)}{@render row(c, depth + 1, n.floor ?? (n.folder === 'floor' ? floorOf(n) : floor))}{/each}
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
	.dn-seed { margin:2px 6px 6px; padding:6px 8px; border:1px dashed var(--accent); border-radius:6px; font-size:11px; color:var(--muted); display:flex; flex-direction:column; gap:6px; }
	.dn-seed-btns { display:flex; gap:6px; }
	.dn-seed button { font-size:11px; padding:3px 9px; border-radius:4px; border:1px solid var(--line); background:var(--panel2); color:var(--text); cursor:pointer; }
	.dn-seed button.primary { background:var(--accent); border-color:var(--accent); color:#fff; }
	.dn-rename { flex:1; min-width:0; font-size:12px; font-weight:600; background:var(--input); color:var(--text); border:1px solid var(--accent); border-radius:3px; padding:0 4px; }
	.dn-rename:focus { outline:none; }
	/* per-row place actions: shown on hover (and while a delete waits for its confirm click) */
	.dn-acts-row { display:none; margin-left:auto; gap:1px; }
	.dn-row:hover .dn-acts-row, .dn-acts-row:has(.confirm) { display:inline-flex; }
	.dn-acts-row button { display:inline-flex; align-items:center; gap:3px; height:18px; min-width:18px; justify-content:center; padding:0 2px; border-radius:3px; border:none; background:none; color:var(--muted); cursor:pointer; font-size:10px; }
	.dn-acts-row button:hover { background:var(--line); color:var(--text); }
	.dn-acts-row button.confirm { color:#fff; background:#dc2626; padding:0 5px; }
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
