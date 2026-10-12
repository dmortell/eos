<!-- The NAVIGATOR window (UX review S3): one tree for the model and the sheets (domain/navTree.ts) — buildings ›
     levels › their views, sections and server rooms (rack view, rows, racks); the riser view; the sheets by place,
     each unfolding to its viewports. A click opens the row's view in the active pane (a rack: its room's rack view,
     zoomed to it). The search box (Ctrl+K) filters as you type, keeping each match's parents, and lists the devices and
     outlets found under the tree; ↑ / ↓ move a highlight over everything it shows that opens, Enter opens it (Ctrl+Enter
     keeps its tab), and the results stay after a click (a double-click keeps the tab; Esc clears). The open view's row is
     marked and its branch unfolded. Levels: rename / delete on hover; Floors…, Settings…, New sheet, PDF all on their
     headers. -->
<script lang="ts">
	import { KEYS } from './shellKeys'
	import { composing } from './keyGuards'
	import { issueStatesOf } from '../app/issueStates.svelte'
	import { duplicateSheets } from '../app/sheetActions'
	import { untrack, tick } from 'svelte'
	import type { CadProject } from '../app/project.svelte'
	import type { Workspace } from '../app/workspace.svelte'
	import { specKey, type ViewSpec } from '../views/space'
	import { navTree, filterTree, pathTo, findItems, searchHits, type NavNode, type NavOpts, type FindItem } from '../domain/navTree'
	import { renameLevel as renameLevelOf, deleteLevel as deleteLevelOf, renameRoom as renameRoomOf, deleteRoom as deleteRoomOf, applyRename } from '../app/navActions'
	import NameInput from './NameInput.svelte'
	import { Icon } from '$lib'
	import { viewKey } from '../app/tabs.svelte'
	import ContextMenu from './ContextMenu.svelte'
	import type { MenuItem } from './cadMenus'

	let { project, ws, current, onopen, tabbed, onfloors, onsettings, onnewsheet, onpdfall, onpdf }: {
		project: CadProject; ws: Workspace
		/** What the active pane shows (its row is marked). */
		current: { levelId?: string; spec: ViewSpec }
		/** A single click opens the row in the preview tab; a double-click (`keep`) in a kept tab. */
		onopen: (n: NavNode, keep?: boolean) => void
		/** The views that have an open tab (their view keys): their rows get a dot (UX review D2). */
		tabbed: Set<string>
		onfloors: () => void; onsettings: () => void; onnewsheet: () => void; onpdfall: () => void; onpdf: (sheetId: string) => void
	} = $props()

	let q = $state('')
	let search: HTMLInputElement | undefined = $state()
	// Ctrl+K (and the menu) ask for the search box
	$effect(() => { if (ws.navSearch) untrack(() => { search?.focus(); search?.select() }) })

	// how the Sheets node groups (place / category / level / package — its ⋮), per project in this browser
	type SheetsBy = NonNullable<NavOpts['sheetsBy']>
	const byKey = () => `cad-nav-sheets:${project.pid}`
	let sheetsBy = $state<SheetsBy>((() => { try { return (localStorage.getItem(byKey()) as SheetsBy | null) ?? 'place' } catch { return 'place' } })())
	function groupSheets(b: SheetsBy) { sheetsBy = b; try { localStorage.setItem(byKey(), b) } catch { /* blocked */ } }
	const states = $derived(issueStatesOf(project))
	// final changes only (dataRev): the tree does not rebuild on each frame of a drag
	const tree = $derived.by(() => navTree(project.dataIndex, { sheetsBy, categories: project.sheetCategories }))
	const shown = $derived(filterTree(tree, q))
	/** Devices and outlets matching the search too (review R56), under the tree's matches. */
	const finds = $derived.by(() => findItems(project.dataIndex, q))
	// a find opens and the results stay (a double-click then keeps its tab; Esc clears the search)
	function openFind(n: FindItem, keep = false) { onopen(n, keep); if (n.focus) ws.focus = n.focus }
	/** Enter / ↑ / ↓ in the search: the highlighted row of everything it shows that opens (tree rows, then finds). */
	const hits = $derived(q.trim() ? searchHits(shown, finds.items) : [])
	let at = $state(0)
	const hiKey = $derived(hits[Math.min(at, hits.length - 1)]?.key)
	function openHit(n: NavNode, keep: boolean) { if (n.key.startsWith('find:')) openFind(n, keep); else onopen(n, keep) }
	function searchKey(e: KeyboardEvent) {
		if (composing(e)) return
		if (e.key === 'Escape') { e.stopPropagation(); q = ''; search?.blur() }
		else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
			if (!hits.length) return
			e.preventDefault()
			at = Math.max(0, Math.min(hits.length - 1, at + (e.key === 'ArrowDown' ? 1 : -1)))
			void tick().then(() => treeEl?.querySelector('.hi')?.scrollIntoView({ block: 'nearest' }))
		} else if (e.key === 'Enter') { const n = hits[Math.min(at, hits.length - 1)]; if (n) { e.preventDefault(); openHit(n, e.ctrlKey || e.metaKey) } }
	}

	// which branches are open: kept per project in this browser; a search opens everything it shows
	const storeKey = () => `cad-nav:${project.pid}`
	let open = $state<Set<string>>(read())
	function read(): Set<string> {
		try { const v = localStorage.getItem(storeKey()); if (v) return new Set(JSON.parse(v)) } catch { /* storage blocked */ }
		return new Set(['bld:none', 'sheets'])
	}
	function save() { try { localStorage.setItem(storeKey(), JSON.stringify([...open])) } catch { /* storage blocked */ } }
	function toggle(k: string) { const n = new Set(open); if (n.has(k)) n.delete(k); else n.add(k); open = n; save() }

	/** Is this row the view the active pane shows? (Rooms, not each of their racks; sheets, not their viewports.) */
	const isCurrent = (n: NavNode) => !!n.open && n.kind !== 'rack' && n.kind !== 'viewport' && n.kind !== 'row' && specKey(n.open.spec) === specKey(current.spec)
		&& (!n.open.levelId || current.spec.kind === 'sheet' || n.open.levelId === current.levelId)
	// the open view's branch unfolds (once per view: folding it again sticks)
	$effect(() => {
		const key = `${current.levelId}:${specKey(current.spec)}`
		untrack(() => {
			if (key === lastCurrent) return
			lastCurrent = key
			const path = pathTo(tree, isCurrent)
			if (path) { const n = new Set(open); for (const k of path.slice(0, -1)) n.add(k); open = n; save() }
			// …and scrolls into sight (review R50: on a sheet the tree stayed on 1F)
			void tick().then(() => treeEl?.querySelector('.row.cur')?.scrollIntoView({ block: 'nearest' }))
		})
	})
	let lastCurrent = ''
	let treeEl: HTMLDivElement | undefined = $state()

	const renameLevel = (id: string) => renameLevelOf(project, ws, id)
	const deleteLevel = (id: string) => deleteLevelOf(project, ws, id)
	const renameRoom = (id: string) => renameRoomOf(project, ws, id)
	const deleteRoom = (id: string) => deleteRoomOf(project, ws, id)
	// ── row menus (UX review L4, Dave: "the hidden buttons … are hard to spot"): a faint ⋮ on every row with commands,
	// the same menu on right-click; Delete only inside the menu (no ✕ under the pointer) ──
	let menu = $state<{ n: NavNode; x: number; y: number } | null>(null)
	function openMenu(n: NavNode, e: MouseEvent) { menu = { n, x: e.clientX, y: e.clientY } }
	// renames happen in the row (ws.navRename): its label becomes an input — unfolded to it first (Project › Rename this level…)
	const renameSheet = (id: string) => { ws.navRename = { id, field: 'title' } }
	const renumberSheet = (id: string) => { ws.navRename = { id, field: 'number' } }
	$effect(() => {
		const r = ws.navRename
		if (!r) return
		untrack(() => {
			const path = pathTo(tree, (n) => n.id === r.id && n.kind !== 'rack')
			if (path) { const n = new Set(open); for (const k of path.slice(0, -1)) n.add(k); open = n; save() }
		})
	})
	/** The text the input starts with: a sheet's title or number, else the name. */
	function renameValue(id: string, field?: 'title' | 'number'): string {
		const e = project.index.get(id)
		return e?.type === 'sheet' ? e[field ?? 'title'] : e && 'name' in e ? String(e.name ?? '') : ''
	}
	function archiveSheet(id: string) {
		const sh = project.index.get(id)
		if (sh?.type === 'sheet') project.store.transact(`Archive ${sh.number}`, (tx) => tx.put({ ...sh, status: 'archived' }))
		if (sh?.type === 'sheet') ws.say(`${sh.number} archived — Undo brings it back (Tables › Sheets shows archived ones)`)
	}
	const renameSection = (id: string) => { ws.navRename = { id } }
	/** F2 on a focused row renames it (UX review L4). */
	function renameOf(n: NavNode): (() => void) | null {
		const id = n.id
		if (!id) return null
		return n.kind === 'level' ? () => renameLevel(id) : n.kind === 'room' ? () => renameRoom(id) : n.kind === 'sheet' ? () => renameSheet(id) : n.kind === 'section' ? () => renameSection(id) : null
	}
	/** A row's commands (empty = no ⋮). */
	function rowMenu(n: NavNode): MenuItem[] {
		const id = n.id, open = n.open ? [{ label: n.kind === 'room' ? 'Open rack view' : n.kind === 'level' ? 'Open plan' : 'Open', run: () => onopen(n, true) } as MenuItem] : []
		if (n.kind === 'level' && id) return [...open, '-', { label: 'Rename…', key: 'F2', run: () => renameLevel(id) }, { label: 'Delete level…', run: () => deleteLevel(id) }]
		if (n.kind === 'room' && id) return [...open, '-', { label: 'Rename…', run: () => renameRoom(id) }, { label: 'Delete room…', run: () => deleteRoom(id) }]
		if (n.kind === 'sheet' && id) return [...open, '-', { label: 'Rename…', run: () => renameSheet(id) }, { label: 'Renumber…', run: () => renumberSheet(id) }, { label: 'PDF', run: () => onpdf(id) }, { label: 'Duplicate', run: () => ws.select(duplicateSheets(project, [id])) }, '-', { label: 'Archive', run: () => archiveSheet(id) }]
		if (n.kind === 'section' && id) return [...open, '-', { label: 'Rename…', run: () => renameSection(id) }, { label: 'Delete section', run: () => { ws.select([id]); ws.remove() } }]
		if (n.kind === 'sheets') return [{ label: 'New sheet', run: onnewsheet }, { label: 'PDF of all sheets', run: onpdfall }, '-',
			...(['place', 'category', 'level', 'package'] as const).map((b) => ({ label: `Group by ${b}`, checked: sheetsBy === b, run: () => groupSheets(b) }))]
		if (n.kind === 'building') return [{ label: 'Floors…', run: onfloors }, { label: 'Settings…', run: onsettings }]
		return []
	}
	const ICON: Record<NavNode['kind'], string> = { building: 'home', level: 'layers', view: 'rect', section: 'scan', room: 'server', row: 'rows', rack: 'server', riser: 'route', sheets: 'fileText', place: 'folder', sheet: 'fileText', viewport: 'panels' }
</script>

<div class="nav">
	<div class="find">
		<Icon name="search" size={12} />
		<input bind:this={search} placeholder="Find a level, view, sheet, room, rack, device, outlet… ({KEYS.find})" bind:value={q} oninput={() => (at = 0)} onkeydown={searchKey} />
	</div>
	<div class="tree" role="tree" bind:this={treeEl}>
		{#each shown as n (n.key)}{@render row(n, 0)}{/each}
		{#if finds.items.length}
			<p class="fh">Devices and outlets</p>
			{#each finds.items as f (f.key)}
				<button class="fr" class:hi={hiKey === f.key} title="Open it, selected (double-click: keep the tab)" onclick={() => openFind(f)} ondblclick={() => openFind(f, true)}><Icon name={f.kind === 'rack' ? 'server' : 'circleDot'} size={12} /><span class="t">{f.label}</span><span class="d">{f.detail}</span></button>
			{/each}
			{#if finds.more}<p class="none">{finds.more} more — type more of the name to narrow it</p>{/if}
		{/if}
		{#if q && !shown.length && !finds.items.length}<p class="none">Nothing matches “{q}”.</p>{/if}
	</div>
</div>

{#if menu}<ContextMenu x={menu.x} y={menu.y} items={rowMenu(menu.n)} onclose={() => (menu = null)} />{/if}

{#snippet row(n: NavNode, depth: number)}
	{@const kids = n.children ?? []}
	{@const unfolded = !!q || open.has(n.key)}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="row k-{n.kind}" tabindex="-1" oncontextmenu={(e) => { if (rowMenu(n).length) { e.preventDefault(); openMenu(n, e) } }}
		onkeydown={(e) => { if (e.key === 'F2' && renameOf(n)) { e.preventDefault(); e.stopPropagation(); renameOf(n)!() } }} class:cur={isCurrent(n)} class:hi={hiKey === n.key} class:sel={!!n.select && ws.selection.includes(n.select)} style:padding-left="{4 + depth * 12}px" role="treeitem" aria-selected={isCurrent(n)} aria-expanded={kids.length ? unfolded : undefined}>
		{#if kids.length}<button class="tw" aria-label={unfolded ? 'Fold' : 'Unfold'} onclick={() => toggle(n.key)}>{unfolded ? '▾' : '▸'}</button>{:else}<span class="tw"></span>{/if}
		{#if ws.navRename && n.id === ws.navRename.id && n.kind !== 'rack'}
			{@const r = ws.navRename}
			<span class="lbl"><Icon name={ICON[n.kind]} size={12} />
				<NameInput wide value={renameValue(r.id, r.field)} title={r.field === 'number' ? 'Sheet number' : r.field === 'title' ? 'Sheet title' : 'Name'}
					onsave={(t) => { const { id, field } = r; ws.navRename = null; applyRename(project, id, t, field) }} oncancel={() => (ws.navRename = null)} /></span>
		{:else}
		<button class="lbl" title={n.open ? 'Open (a preview tab) · double-click: keep it as a tab' : undefined} onclick={() => (n.open ? onopen(n) : toggle(n.key))} ondblclick={() => { if (n.open) onopen(n, true) }}>
			<Icon name={ICON[n.kind]} size={12} /><span class="t">{n.label}</span>
			<!-- a sheet changed since its last issue (only known while the register's Issue column works them out) -->
			{#if n.kind === 'sheet' && n.id}{@const sh = project.dataIndex.get(n.id)}{#if sh?.type === 'sheet' && states.of(sh) === 'changed'}<span class="chg" title="Changed since its last issue ({sh.revisions?.at(-1)?.code})">●</span>{/if}{/if}
		</button>
		{/if}
		{#if n.open && n.kind !== 'rack' && tabbed.has(viewKey({ levelId: n.open.levelId, spec: n.open.spec }))}<span class="dot" title="Open in a tab"></span>{/if}
		{#if n.detail}<span class="d">{n.detail}</span>{/if}
		{#if n.kind === 'sheets'}<button class="act txt" title="A new A3 landscape sheet, opened in a tab" onclick={onnewsheet}>+ New</button>{/if}
		{#if renameOf(n) && ws.navRename?.id !== n.id}<button class="act ren" title={n.kind === 'sheet' ? 'Rename (its title; Renumber is in ⋮) — F2' : 'Rename — F2'} onclick={() => renameOf(n)!()}><Icon name="edit" size={11} /></button>{/if}
		{#if rowMenu(n).length}<button class="act more" title="Commands (or right-click the row)" onclick={(e) => openMenu(n, e)}>⋮</button>{/if}
	</div>
	{#if unfolded}{#each kids as c (c.key)}{@render row(c, depth + 1)}{/each}{/if}
{/snippet}

<style>
	.nav { display: flex; flex-direction: column; height: 100%; min-height: 0; font-size: 12px; }
	.find { display: flex; align-items: center; gap: 4px; margin: 6px; padding: 0 6px; border: 1px solid var(--cad-line); border-radius: 5px; background: var(--cad-input); color: var(--cad-muted); }
	.find input { flex: 1; min-width: 0; border: 0; outline: 0; padding: 3px 0; background: transparent; color: var(--cad-text); font-size: 12px; }
	.tree { flex: 1; min-height: 0; overflow: auto; padding-bottom: 6px; }
	.row { display: flex; align-items: center; gap: 2px; padding-right: 4px; border-radius: 4px; }
	.row:hover { background: var(--cad-hover); }
	.row:focus-visible { outline: 1px solid #93c5fd; outline-offset: -1px; }
	.row.cur { background: var(--cad-sel); }
	.row.sel .t { color: #1d4ed8; font-weight: 600; }
	.tw { width: 14px; flex: 0 0 14px; font-size: 9px; color: var(--cad-muted); text-align: center; }
	.lbl { flex: 1; min-width: 0; display: flex; align-items: center; gap: 5px; padding: 1px 0; text-align: left; color: var(--cad-text); }
	.lbl :global(svg) { flex: 0 0 auto; color: var(--cad-faint); }
	.t { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.k-building .t, .k-sheets .t { font-weight: 600; text-transform: uppercase; font-size: 11px; letter-spacing: 0.02em; color: var(--cad-muted); }
	.k-level .t { font-weight: 600; }
	.dot { width: 6px; height: 6px; flex: 0 0 6px; border-radius: 50%; background: #2563eb; opacity: 0.6; }
	.d { font-size: 10px; color: var(--cad-faint); white-space: nowrap; }
	.act { min-width: 20px; min-height: 20px; padding: 0 4px; font-size: 11px; color: var(--cad-faint); border-radius: 3px; }
	.act.txt { color: var(--cad-muted); }
	.act.more { font-weight: 700; opacity: 0.55; }
	/* ✎: on hover, and on the current / selected row or one with the focus (keyboard); always on a touch screen */
	.act.ren { display: none; align-items: center; justify-content: center; }
	.row:hover .act.ren, .row:focus-within .act.ren, .row.cur .act.ren, .row.sel .act.ren { display: inline-flex; }
	@media (hover: none) { .act.ren { display: inline-flex; } }
	.row:hover .act { color: var(--cad-link, #2563eb); opacity: 1; }
	.act:hover { background: var(--cad-hover); }
	.none { padding: 8px; color: var(--cad-faint); }
	.fh { margin: 6px 4px 2px; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.02em; color: var(--cad-muted); }
	.fr { display: flex; align-items: center; gap: 5px; width: 100%; padding: 1px 4px 1px 18px; border-radius: 4px; text-align: left; color: var(--cad-text); }
	.fr:hover { background: var(--cad-hover); }
	/* the search's highlighted row (↑ / ↓; Enter opens it) */
	.row.hi, .fr.hi { outline: 1px solid #93c5fd; outline-offset: -1px; }
	.fr :global(svg) { flex: 0 0 auto; color: var(--cad-faint); }
	.fr .d { margin-left: auto; padding-left: 6px; }
	.chg { color: #d97706; font-size: 9px; margin-left: 2px; }
</style>
