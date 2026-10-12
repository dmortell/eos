<!-- The racks of the open level, by server room. A rack not yet on the plan has "Place" (the next click puts it
     there); a placed rack is selected by clicking its name. -->
<script lang="ts">
	import { composing, enterKey } from './keyGuards'
	import type { CadProject } from '../app/project.svelte'
	import type { Workspace } from '../app/workspace.svelte'
	import type { Rack, RackRow } from '../domain/types'
	import { naturalCompare } from '../domain/labels'
	import { racksInOrder, newServerRoom, nextRoomName, moveRack, planOrder, rowKey } from '../domain/devices'
	import { DragReorder } from '$lib'
	import { markPrinted } from '../domain/ports'
	import { portUseByDevice } from '../domain/cords'
	import { exportPanelLabels } from '../render/exports'
	import { exportFrameSheets } from '../render/frameSheets'
	import { downloadPanelSheets, unsupportedNote } from '../app/sheetsPdf'
	import type { Device } from '../domain/types'
	import type { ViewSpec } from '../views/space'
	import SideSection from './SideSection.svelte'
	import FindDevice from './FindDevice.svelte'
	import ContextMenu from './ContextMenu.svelte'
	import InlineName from './InlineName.svelte'
	import type { MenuItem } from './cadMenus'

	let { project, ws, levelId, projectName, onview }: { project: CadProject; ws: Workspace; levelId: string; projectName: string; onview?: (s: ViewSpec) => void } = $props()

	const groups = $derived.by(() => {
		const racks = project.index.racks.filter((r) => r.levelId === levelId)
		const by = new Map<string, Rack[]>()
		// every server room of the level shows, even with no racks yet (a new room, before its first rack)
		for (const s of project.index.spaces) if (s.levelId === levelId && s.kind === 'server room') by.set(s.id, [])
		for (const r of racks) by.set(r.spaceId, [...(by.get(r.spaceId) ?? []), r])
		return [...by].map(([space, rs]) => {
			// unplaced racks first (they need "Place"), then the room's row order — the rack elevation's order
			const rank = new Map(racksInOrder(project.index, space).map((r, i) => [r.id, i]))
			// (a row put in order by hand lists in that order, so ▲ / ▼ move what you see)
			const sp = project.index.get(space), hand = sp?.type === 'space' ? sp.rackOrder ?? {} : {}
			const sorted = rs.sort((a, b) => (hand[rowKey(a)] ? 0 : Number(!!a.at) - Number(!!b.at)) || (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0))
			// the room › row › rack tree (backlog "Rack tree and row views"): its rows in order, then racks in no row
			const rows = [...project.index.byId.values()].filter((e): e is RackRow => e.type === 'rackRow' && e.spaceId === space).sort((a, b) => a.order - b.order)
			const parts = rows.length ? [...rows.map((row) => ({ row, racks: sorted.filter((r) => r.rowId === row.id) })), { row: null, racks: sorted.filter((r) => !r.rowId || !rows.some((x) => x.id === r.rowId)) }].filter((x) => x.row || x.racks.length) : [{ row: null, racks: sorted }]
			return { space, name: project.index.nameOf(space) || 'No room', racks: sorted, parts, hand }
		}).sort((a, b) => naturalCompare(a.name, b.name))
	})
	const selected = $derived(new Set(ws.selection))
	/** Export the room's panel labels, then offer to record them as printed (later changes then ask first). */
	async function labels(spaceId: string, name: string) {
		try {
			const r = await exportPanelLabels(project.index, projectName, { id: spaceId, name })
			const panels = r.panels.map((id) => project.index.get(id)).filter((d): d is Device => d?.type === 'device')
			if (panels.length) ws.ask2(`${r.rows} port labels exported. Mark the ${panels.length} panel(s) of ${name} as printed?`, 'Mark printed',
				() => { const now = Date.now(); project.store.transact(`${name}: labels printed`, (tx) => { for (const d of panels) tx.put(markPrinted(project.index, d, now)) }) })
		} catch (e) { project.error = `Export failed: ${(e as Error).message}` }
	}
	/** The room ⋯ menu (exports), opened under its button — the app's own menu, not a native select. */
	let roomMenu = $state<{ x: number; y: number; space: string; name: string } | null>(null)
	const roomItems = (m: { space: string; name: string }): MenuItem[] => [
		{ label: 'Export panel labels (Excel)…', title: 'Every port label as a list, for the label printer', run: () => labels(m.space, m.name) },
		{ label: 'Print panels with labels (PDF)…', title: 'The panels drawn with their labels, for the installer', run: () => panelPdf(m.space, m.name) },
		'-',
		{ label: 'Frame label sheets (Excel), a sheet per frame', title: 'RU rows × 24 ports, labels colored by usage (A3)', run: () => frames(m.space, m.name, false) },
		{ label: 'Frame label sheets (Excel), one sheet for the room', title: 'The room’s frames side by side, bottoms aligned (A3)', run: () => frames(m.space, m.name, true) },
	]
	/** The room's frames as label sheets in Excel (the Frames tool's grid layout): a sheet per frame or one for the room. */
	async function frames(spaceId: string, name: string, perRoom: boolean) {
		try {
			const r = await exportFrameSheets(project.index, projectName, [spaceId], perRoom)
			ws.say(r.racks ? `${name}: ${r.racks} frame(s) exported${perRoom ? ' on one sheet' : ''}` : `${name} has no racks with patch panels`)
		} catch (e) { project.error = `Export failed: ${(e as Error).message}` }
	}
	/** The room's panels drawn with their port labels, as a PDF for the installer; then the same "Mark printed" offer. */
	async function panelPdf(spaceId: string, name: string) {
		try {
			const r = await downloadPanelSheets(project, { id: spaceId, name })
			if (!r.pages) { ws.say(`${name} has no patch panels with ports`); return }
			ws.ask2(`${r.panels.length} panel(s) on ${r.pages} page(s)${unsupportedNote(r.unsupported, r.rasterised)}. Mark the panels of ${name} as printed?`, 'Mark printed',
				() => { const now = Date.now(); project.store.transact(`${name}: labels printed`, (tx) => { for (const d of r.panels) tx.put(markPrinted(project.index, d, now)) }) })
		} catch (e) { project.error = `Panel PDF failed: ${(e as Error).message}` }
	}
	// "+ Server room": a form in the list — which floor (the open one by default) and its name (Dave 2026-10-12)
	let adding = $state<{ levelId: string; name: string; typed: boolean } | null>(null)
	const floors = $derived([...project.index.levels].sort((a, b) => b.number - a.number || a.order - b.order))
	function startAdd() { adding = { levelId, name: nextRoomName(project.index, levelId), typed: false } }
	function pickFloor(id: string) { if (adding) adding = { ...adding, levelId: id, name: adding.typed ? adding.name : nextRoomName(project.index, id) } }
	function addRoom() {
		const a = adding, name = a?.name.trim()
		if (!a || !name) return
		const room = newServerRoom(project.index, a.levelId, name)
		project.store.transact(`New server room ${room.name}`, (tx) => tx.put(room))
		adding = null
		if (a.levelId !== levelId) ws.say(`${room.name} added on ${project.index.nameOf(a.levelId)} — open that floor to see it here`)
	}
	function focus(el: HTMLInputElement) { el.focus(); el.select() }
	/** Keys stay in the form (not the plan's shortcuts); Esc closes it. */
	function addKey(e: KeyboardEvent) { e.stopPropagation(); if (e.key === 'Escape' && !composing(e)) adding = null }
	/** The room at a glance (its name's tooltip): "4F · 2 rows · 6 racks · 48 devices". */
	function summary(spaceId: string, racks: Rack[]): string {
		const room = project.index.get(spaceId) as { levelId?: string } | undefined
		const rows = new Set(racks.map((r) => r.rowId).filter(Boolean)).size, devs = racks.reduce((n, r) => n + project.index.devicesIn(r.id).length, 0)
		return `${project.index.nameOf(room?.levelId)} · ${rows} row${rows === 1 ? '' : 's'} · ${racks.length} rack${racks.length === 1 ? '' : 's'} · ${devs} device${devs === 1 ? '' : 's'} — click to rename`
	}
	/** A rack's name tooltip: its devices, height and how its devices' ports are used. */
	const uses = $derived(portUseByDevice(project.index))
	function rackTip(r: Rack): string {
		const ds = project.index.devicesIn(r.id), u = ds.reduce((t, d) => { const x = uses.get(d.id); return { used: t.used + (x?.used ?? 0), ports: t.ports + d.portCount } }, { used: 0, ports: 0 })
		return `${ds.length} devices · ${r.heightU}U${u.ports ? ` · ports ${u.used} of ${u.ports} used, ${u.ports - u.used} free` : ''}${r.patchFrame ? ' · patch frame (takes outlets)' : ''}`
	}
	// click = one rack, Shift-click = every rack from the last one clicked (down the list), Ctrl-click = add / drop one
	let anchor: string | null = null
	function pick(r: Rack, e: MouseEvent) {
		const flat = groups.flatMap((g) => g.racks)
		if (e.shiftKey && anchor) {
			const i = flat.findIndex((x) => x.id === anchor), j = flat.findIndex((x) => x.id === r.id)
			if (i >= 0 && j >= 0) { ws.select(flat.slice(Math.min(i, j), Math.max(i, j) + 1).map((x) => x.id)); return }
		}
		anchor = r.id
		ws.select(e.ctrlKey || e.metaKey ? (selected.has(r.id) ? ws.selection.filter((x) => x !== r.id) : [...ws.selection, r.id]) : [r.id])
	}
	/** Drag a rack up / down its row (the rack view's order, Dave 2026-10-12), kept as the room's hand order for that row. */
	const drag = new DragReorder((id, targetId, after) => {
		const next = moveRack(project.index, id, targetId, after), r = project.index.get<Rack>(id)
		if (next) project.store.transact(`Rack order: ${r?.name ?? 'rack'}`, (tx) => tx.put(next))
		else ws.say('A rack moves within its own row — set its row in Properties to move it to another')
	}, (id) => groups.flatMap((g) => g.racks).findIndex((x) => x.id === id))
	function resetOrder(spaceId: string, key: string, what: string) {
		const s = project.index.get(spaceId)
		if (s?.type === 'space') project.store.transact(`${what}: rack order from the plan`, (tx) => tx.put(planOrder(s, key)))
	}
	function rename(spaceId: string, name: string) {
		const s = project.index.get(spaceId)
		if (s?.type === 'space') project.store.transact(`Rename room ${s.name} → ${name}`, (tx) => tx.put({ ...s, name }))
	}
</script>

{#if roomMenu}<ContextMenu x={roomMenu.x} y={roomMenu.y} items={roomItems(roomMenu)} onclose={() => (roomMenu = null)} />{/if}
<SideSection key="racks" title="Racks">
	{#snippet actions()}<button title="Add a server room (racks belong to a room)" onclick={startAdd}>+ Server room</button>{/snippet}
	{#if adding}
		<!-- the new room: its floor and name; Enter adds, Esc closes -->
		<div class="add">
			<label>Floor <select value={adding.levelId} onchange={(e) => pickFloor(e.currentTarget.value)} onkeydown={addKey}>
				{#each floors as l (l.id)}<option value={l.id}>{l.name}{l.id === levelId ? ' (open)' : ''}</option>{/each}</select></label>
			<label>Name <input use:focus value={adding.name} oninput={(e) => { if (adding) adding = { ...adding, name: e.currentTarget.value, typed: true } }} onkeydown={(e) => { addKey(e); if (enterKey(e)) addRoom() }} /></label>
			<span class="btns"><button onclick={() => (adding = null)}>Cancel</button><button class="go" disabled={!adding.name.trim()} onclick={addRoom}>Add room</button></span>
		</div>
	{/if}
	<FindDevice {project} {ws} {onview} />
	{#each groups as g (g.space)}
		<div class="room">
			<InlineName value={g.name} title={summary(g.space, g.racks)} onsave={(t) => rename(g.space, t)} />
			<span>
				<!-- room actions (exports) in a menu, so they aren't mistaken for views -->
				{#if project.index.get(g.space)?.type === 'space'}<button class="place" class:armed={ws.selection.length === 1 && ws.selection[0] === g.space} title="Select the room: its Properties (floor and ceiling, rows, summary)" onclick={() => ws.select([g.space])}>Properties</button>{/if}
				<button class="acts" title="Room actions (exports)" onclick={(e) => { const b = e.currentTarget.getBoundingClientRect(); roomMenu = { x: b.left, y: b.bottom + 2, space: g.space, name: g.name } }}>⋯</button>
				{#if onview}<button class="place" title="Open this room's rack view (its racks front / rear) in the active pane" onclick={() => onview({ kind: 'row', spaceId: g.space, face: 'front' })}>Rack view</button>{/if}
			</span>
		</div>
		{#each g.parts as part (part.row?.id ?? '')}
			{#if part.row}
				{@const row = part.row}
				<div class="rowh"><span><InlineName value={row.name} title="Click to rename this row" onsave={(t) => project.store.transact(`Rename row ${row.name} → ${t}`, (tx) => tx.put({ ...row, name: t }))} /> <span class="n">{part.racks.length}</span></span>
					<span>
						{#if g.hand[row.id]}<button class="place" title="Put this row's racks back in the plan's order (left to right as drawn)" onclick={() => resetOrder(g.space, row.id, row.name)}>↺ plan order</button>{/if}
						{#if onview}<button class="place" title="Open this row's rack view" onclick={() => onview({ kind: 'row', spaceId: g.space, face: 'front', rowId: row.id })}>Row view</button>{/if}
					</span></div>
			{:else if g.parts.length > 1 || g.hand.none}<div class="rowh"><span>No row</span>
				{#if g.hand.none}<button class="place" title="Put these racks back in the plan's order (left to right as drawn)" onclick={() => resetOrder(g.space, 'none', g.name)}>↺ plan order</button>{/if}</div>{/if}
		{#each part.racks as r (r.id)}
			<!-- dragged up / down its row: the rack view's order, fixed by hand where the plan gets it wrong -->
			<div class="rack" class:sel={selected.has(r.id)} class:inrow={!!part.row} {...drag.row(r.id)} class:drag-before={drag.isBefore(r.id)} class:drag-after={drag.isAfter(r.id)}>
				<span class="grip" title="Drag up / down its row to change the rack view's order" aria-hidden="true">⠿</span>
				<button class="name" onmousedown={(e) => { if (e.shiftKey) e.preventDefault() }} onclick={(e) => pick(r, e)} title={rackTip(r)}>{#if r.name.trim()}{r.name}{:else}<span class="nameless">{r.kind}{r.model ? ` · ${r.model}` : ''}</span>{/if}{#if r.patchFrame}<span class="frame">frame</span>{/if}</button>
				{#if !r.at}
					<button class="place" class:armed={ws.toolId === 'rack' && ws.rackTool.target === r.id} onclick={() => ws.placeRack(r.id)}>Place</button>
				{/if}
			</div>
		{/each}
		{:else}
			<p class="px-2 text-[11px] text-zinc-400">No racks yet — draw them with the Rack tool</p>
		{/each}
	{/each}
</SideSection>

<style>
	.acts { width: 1.6rem; min-height: 20px; color: var(--cad-muted); font-size: 12px; border-radius: 3px; }
	.acts:hover { color: #2563eb; background: var(--cad-hover); }
	.add { display: grid; gap: 3px; margin: 0 4px 6px; padding: 6px; font-size: 11px; border: 1px solid var(--cad-line); border-radius: 4px; background: var(--cad-hover); }
	.add label { display: grid; grid-template-columns: 2.6rem 1fr; align-items: center; gap: 4px; color: var(--cad-muted); }
	.add select, .add input { min-width: 0; font-size: 12px; color: var(--cad-text); background: var(--cad-input); border: 1px solid var(--cad-line); border-radius: 3px; padding: 0 3px; }
	.add .btns { display: flex; justify-content: flex-end; gap: 4px; }
	.add .btns button { padding: 0 8px; border: 1px solid var(--cad-line); border-radius: 3px; background: var(--cad-input); }
	.add .btns .go { background: #2563eb; border-color: #2563eb; color: white; }
	.add .btns .go:disabled { opacity: 0.5; }
	.frame { margin-left: 6px; font-size: 10px; color: #0369a1; background: #e0f2fe; border-radius: 3px; padding: 0 3px; }
	.room { display: flex; align-items: center; justify-content: space-between; padding: 4px 4px 0; font-size: 11px; color: var(--cad-faint); }
	.rack { display: flex; align-items: center; justify-content: space-between; border-radius: 4px; padding: 0 4px; font-size: 12px; }
	.rack:hover { background: var(--cad-hover); }
	.rack.inrow { padding-left: 14px; }
	.rowh { display: flex; align-items: center; justify-content: space-between; padding: 2px 4px 0 8px; font-size: 11px; color: var(--cad-muted); font-weight: 600; }
	.rowh .n { font-weight: 400; color: var(--cad-faint); }
	.rack.sel { background: var(--cad-pick); }
	.name { text-align: left; flex: 1; padding: 1px 4px; }
	.nameless { color: var(--cad-muted); font-style: italic; }
	/* the drag grip: on hover, and on a selected row or one with the focus; always on a touch screen */
	.grip { visibility: hidden; cursor: grab; color: var(--cad-faint); font-size: 10px; padding-right: 2px; }
	.rack:hover .grip, .rack:focus-within .grip, .rack.sel .grip { visibility: visible; }
	@media (hover: none) { .grip { visibility: visible; } }
	.rack.drag-before { box-shadow: inset 0 2px 0 var(--cad-link, #2563eb); }
	.rack.drag-after { box-shadow: inset 0 -2px 0 var(--cad-link, #2563eb); }
	.place { min-height: 20px; font-size: 11px; color: #2563eb; padding: 0 4px; border-radius: 3px; }
	.place:hover, .place.armed { background: var(--cad-sel); }
</style>
