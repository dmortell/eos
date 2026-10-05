<!-- The NAVIGATOR window (UX review S3): one tree for the model and the sheets (domain/navTree.ts) — buildings ›
     levels › their views, sections and server rooms (rack view, rows, racks); the riser view; the sheets by place,
     each unfolding to its viewports. A click opens the row's view in the active pane (a rack: its room's rack view,
     zoomed to it). The search box (Ctrl+K) filters as you type, keeping each match's parents. The open view's row is
     marked and its branch unfolded. Levels: rename / delete on hover; Floors…, Settings…, New sheet, PDF all on their
     headers. -->
<script lang="ts">
	import { untrack } from 'svelte'
	import type { CadProject } from '../app/project.svelte'
	import type { Workspace } from '../app/workspace.svelte'
	import type { Level } from '../domain/types'
	import { specKey, type ViewSpec } from '../views/space'
	import { navTree, filterTree, pathTo, type NavNode } from '../domain/navTree'
	import { deleteEntities, levelContents, deleteImpact, impactText } from '../editor/commands'
	import { Icon } from '$lib'
	import { viewKey } from '../app/tabs.svelte'

	let { project, ws, current, onopen, tabbed, onfloors, onsettings, onnewsheet, onpdfall }: {
		project: CadProject; ws: Workspace
		/** What the active pane shows (its row is marked). */
		current: { levelId?: string; spec: ViewSpec }
		/** A single click opens the row in the preview tab; a double-click (`keep`) in a kept tab. */
		onopen: (n: NavNode, keep?: boolean) => void
		/** The views that have an open tab (their view keys): their rows get a dot (UX review D2). */
		tabbed: Set<string>
		onfloors: () => void; onsettings: () => void; onnewsheet: () => void; onpdfall: () => void
	} = $props()

	let q = $state('')
	let search: HTMLInputElement | undefined = $state()
	// Ctrl+K (and the menu) ask for the search box
	$effect(() => { if (ws.navSearch) untrack(() => { search?.focus(); search?.select() }) })

	const tree = $derived.by(() => { void project.rev; return navTree(project.index) })
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

	function renameLevel(id: string) {
		const l = project.index.get(id) as Level | undefined
		if (l?.type !== 'level') return
		ws.askText('Level name', l.name, (t) => { if (t.trim() && t.trim() !== l.name) project.store.transact(`Rename level ${l.name} → ${t.trim()}`, (tx) => tx.put({ ...l, name: t.trim() })) })
	}
	function deleteLevel(id: string) {
		const l = project.index.get(id) as Level | undefined
		if (l?.type !== 'level') return
		const on = levelContents(project.store.all(), l.id)
		ws.ask2(`Delete level ${l.name} and everything on it (${on.length} item${on.length === 1 ? '' : 's'}: outlets, racks + devices, links, cords, drawing, floorplan, rooms)? Undo brings it back.`, 'Delete level', () => {
			deleteEntities(project.store, [l.id, ...on])
			if (ws.levelId === l.id) ws.levelId = project.levels.find((x) => x.id !== l.id)?.id ?? null
		})
	}
	// ── server rooms: rename, delete (Dave: "how to delete unused items like SER-B?") ──
	function renameRoom(id: string) {
		const r = project.index.get(id)
		if (r?.type !== 'space') return
		ws.askText('Room name', r.name, (t) => { if (t.trim() && t.trim() !== r.name) project.store.transact(`Rename room ${r.name} → ${t.trim()}`, (tx) => tx.put({ ...r, name: t.trim() })) })
	}
	/** A room goes with its racks (and their devices, links, cords) and rows; outlet ports and panels that name it as
	 *  their server room keep the id but show none (said in the question). An empty room just goes (Undo brings it back). */
	function deleteRoom(id: string) {
		const r = project.index.get(id)
		if (r?.type !== 'space') return
		const racks = project.index.racks.filter((k) => k.spaceId === id).map((k) => k.id)
		const rows = [...project.index.byId.values()].filter((e) => e.type === 'rackRow' && e.spaceId === id).map((e) => e.id)
		const ports = project.index.outlets.reduce((n, o) => n + o.ports.filter((pt) => pt.serverRoomId === id).length, 0)
		const go = () => deleteEntities(project.store, [id, ...rows, ...racks])
		const also = [racks.length ? `${racks.length} rack${racks.length === 1 ? '' : 's'} (with their devices, links and cords)` : '', impactText(deleteImpact(project.store, racks)) ?? ''].filter(Boolean)[0]
		if (!racks.length && !ports) return go()
		ws.ask2(`Delete room ${r.name}${also ? ` with ${also}` : ''}?${ports ? ` ${ports} outlet port${ports === 1 ? '' : 's'} name it as their server room — they'll have none.` : ''} Undo brings it back.`, 'Delete room', go)
	}
	/** The first row a search shows that opens something (Enter opens it; Ctrl+Enter keeps its tab). */
	const firstOpen = (ns: NavNode[]): NavNode | undefined => { for (const n of ns) { if (n.open) return n; const c = firstOpen(n.children ?? []); if (c) return c } return undefined }
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

{#snippet row(n: NavNode, depth: number)}
	{@const kids = n.children ?? []}
	{@const unfolded = !!q || open.has(n.key)}
	<div class="row k-{n.kind}" class:cur={isCurrent(n)} class:sel={!!n.select && ws.selection.includes(n.select)} style:padding-left="{4 + depth * 12}px" role="treeitem" aria-selected={isCurrent(n)} aria-expanded={kids.length ? unfolded : undefined}>
		{#if kids.length}<button class="tw" aria-label={unfolded ? 'Fold' : 'Unfold'} onclick={() => toggle(n.key)}>{unfolded ? '▾' : '▸'}</button>{:else}<span class="tw"></span>{/if}
		<button class="lbl" title={n.open ? 'Open (a preview tab) · double-click: keep it as a tab' : undefined} onclick={() => (n.open ? onopen(n) : toggle(n.key))} ondblclick={() => { if (n.open) onopen(n, true) }}>
			<Icon name={ICON[n.kind]} size={12} /><span class="t">{n.label}</span>
		</button>
		{#if n.open && n.kind !== 'rack' && tabbed.has(viewKey({ levelId: n.open.levelId, spec: n.open.spec }))}<span class="dot" title="Open in a tab"></span>{/if}
		{#if n.detail}<span class="d">{n.detail}</span>{/if}
		{#if n.kind === 'level' && n.id}
			{@const id = n.id}
			<button class="act" title="Rename this level" onclick={() => renameLevel(id)}>✎</button>
			<button class="act del" title="Delete this level and everything on it" onclick={() => deleteLevel(id)}>✕</button>
		{:else if n.kind === 'room' && n.id}
			{@const id = n.id}
			<button class="act" title="Rename this server room" onclick={() => renameRoom(id)}>✎</button>
			<button class="act del" title="Delete this server room (with its racks)" onclick={() => deleteRoom(id)}>✕</button>
		{:else if n.kind === 'building'}
			<button class="act txt" title="The building's floors, their names and heights" onclick={onfloors}>Floors…</button>
			<button class="act txt" title="The project's outlet usages and cable types" onclick={onsettings}>Settings…</button>
		{:else if n.kind === 'sheets'}
			<button class="act txt" title="A new A3 landscape sheet, opened in the active pane" onclick={onnewsheet}>+ New</button>
			<button class="act txt" title="Every sheet in one PDF (download)" onclick={onpdfall}>PDF all</button>
		{/if}
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
	.act { visibility: hidden; padding: 0 3px; font-size: 11px; color: var(--cad-muted); }
	.act.txt { color: var(--cad-link, #2563eb); }
	.row:hover .act { visibility: visible; }
	.act.del:hover { color: #dc2626; }
	.none { padding: 8px; color: var(--cad-faint); }
</style>
