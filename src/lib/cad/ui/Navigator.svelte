<!-- The NAVIGATOR window (UX review S3): one tree for the model and the sheets (domain/navTree.ts) — buildings ›
     levels › their views, sections and server rooms (rack view, rows, racks); the riser view; the sheets by place,
     each unfolding to its viewports. A click opens the row's view in the active pane (a rack: its room's rack view,
     zoomed to it). The search box (Ctrl+K) filters as you type, keeping each match's parents. The open view's row is
     marked and its branch unfolded. Levels: rename / delete on hover; Floors…, Settings…, New sheet, PDF all on their
     headers. -->
<script lang="ts">
	import { duplicateSheets } from '../app/sheetActions'
	import { untrack } from 'svelte'
	import type { CadProject } from '../app/project.svelte'
	import type { Workspace } from '../app/workspace.svelte'
	import { specKey, type ViewSpec } from '../views/space'
	import { navTree, filterTree, pathTo, type NavNode, type NavOpts } from '../domain/navTree'
	import { renameLevel as renameLevelOf, deleteLevel as deleteLevelOf, renameRoom as renameRoomOf, deleteRoom as deleteRoomOf } from '../app/navActions'
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
	const tree = $derived.by(() => { void project.rev; return navTree(project.index, { sheetsBy, categories: project.sheetCategories }) })
	const shown = $derived(filterTree(tree, q))

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
		})
	})
	let lastCurrent = ''

	const renameLevel = (id: string) => renameLevelOf(project, ws, id)
	const deleteLevel = (id: string) => deleteLevelOf(project, ws, id)
	const renameRoom = (id: string) => renameRoomOf(project, ws, id)
	const deleteRoom = (id: string) => deleteRoomOf(project, ws, id)
	/** The first row a search shows that opens something (Enter opens it; Ctrl+Enter keeps its tab). */
	const firstOpen = (ns: NavNode[]): NavNode | undefined => { for (const n of ns) { if (n.open) return n; const c = firstOpen(n.children ?? []); if (c) return c } return undefined }
	// ── row menus (UX review L4, Dave: "the hidden buttons … are hard to spot"): a faint ⋮ on every row with commands,
	// the same menu on right-click; Delete only inside the menu (no ✕ under the pointer) ──
	let menu = $state<{ n: NavNode; x: number; y: number } | null>(null)
	function openMenu(n: NavNode, e: MouseEvent) { menu = { n, x: e.clientX, y: e.clientY } }
	function renameSheet(id: string) {
		const sh = project.index.get(id)
		if (sh?.type !== 'sheet') return
		ws.askText('Sheet title', sh.title, (t) => { if (t.trim() && t.trim() !== sh.title) project.store.transact(`Retitle ${sh.number}`, (tx) => tx.put({ ...sh, title: t.trim() })) })
	}
	function renumberSheet(id: string) {
		const sh = project.index.get(id)
		if (sh?.type !== 'sheet') return
		ws.askText('Sheet number', sh.number, (t) => { if (t.trim() && t.trim() !== sh.number) project.store.transact(`Renumber ${sh.number} → ${t.trim()}`, (tx) => tx.put({ ...sh, number: t.trim() })) })
	}
	function archiveSheet(id: string) {
		const sh = project.index.get(id)
		if (sh?.type === 'sheet') project.store.transact(`Archive ${sh.number}`, (tx) => tx.put({ ...sh, status: 'archived' }))
	}
	function renameSection(id: string) {
		const sc = project.index.get(id)
		if (sc?.type !== 'section') return
		ws.askText('Section name', sc.name, (t) => { if (t.trim() && t.trim() !== sc.name) project.store.transact(`Rename section ${sc.name} → ${t.trim()}`, (tx) => tx.put({ ...sc, name: t.trim() })) })
	}
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
		<input bind:this={search} placeholder="Find a level, view, sheet, room, rack… (Ctrl+K)" bind:value={q} onkeydown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); q = ''; search?.blur() } else if (e.key === 'Enter') { const n = firstOpen(shown); if (n) onopen(n, e.ctrlKey || e.metaKey) } }} />
	</div>
	<div class="tree" role="tree">
		{#each shown as n (n.key)}{@render row(n, 0)}{/each}
		{#if q && !shown.length}<p class="none">Nothing matches “{q}”.</p>{/if}
	</div>
</div>

{#if menu}<ContextMenu x={menu.x} y={menu.y} items={rowMenu(menu.n)} onclose={() => (menu = null)} />{/if}

{#snippet row(n: NavNode, depth: number)}
	{@const kids = n.children ?? []}
	{@const unfolded = !!q || open.has(n.key)}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="row k-{n.kind}" tabindex="-1" oncontextmenu={(e) => { if (rowMenu(n).length) { e.preventDefault(); openMenu(n, e) } }}
		onkeydown={(e) => { if (e.key === 'F2' && renameOf(n)) { e.preventDefault(); e.stopPropagation(); renameOf(n)!() } }} class:cur={isCurrent(n)} class:sel={!!n.select && ws.selection.includes(n.select)} style:padding-left="{4 + depth * 12}px" role="treeitem" aria-selected={isCurrent(n)} aria-expanded={kids.length ? unfolded : undefined}>
		{#if kids.length}<button class="tw" aria-label={unfolded ? 'Fold' : 'Unfold'} onclick={() => toggle(n.key)}>{unfolded ? '▾' : '▸'}</button>{:else}<span class="tw"></span>{/if}
		<button class="lbl" title={n.open ? 'Open (a preview tab) · double-click: keep it as a tab' : undefined} onclick={() => (n.open ? onopen(n) : toggle(n.key))} ondblclick={() => { if (n.open) onopen(n, true) }}>
			<Icon name={ICON[n.kind]} size={12} /><span class="t">{n.label}</span>
		</button>
		{#if n.open && n.kind !== 'rack' && tabbed.has(viewKey({ levelId: n.open.levelId, spec: n.open.spec }))}<span class="dot" title="Open in a tab"></span>{/if}
		{#if n.detail}<span class="d">{n.detail}</span>{/if}
		{#if n.kind === 'sheets'}<button class="act txt" title="A new A3 landscape sheet, opened in a tab" onclick={onnewsheet}>+ New</button>{/if}
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
	.act { padding: 0 4px; font-size: 11px; color: var(--cad-faint); border-radius: 3px; }
	.act.txt { color: var(--cad-muted); }
	.act.more { font-weight: 700; opacity: 0.55; }
	.row:hover .act { color: var(--cad-link, #2563eb); opacity: 1; }
	.act:hover { background: var(--cad-hover); }
	.none { padding: 8px; color: var(--cad-faint); }
</style>
