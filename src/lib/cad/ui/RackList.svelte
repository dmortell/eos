<!-- The racks of the open level, by server room. A rack not yet on the plan has "Place" (the next click puts it
     there); a placed rack is selected by clicking its name. -->
<script lang="ts">
	import type { CadProject } from '../app/project.svelte'
	import type { Workspace } from '../app/workspace.svelte'
	import type { Rack } from '../domain/types'
	import { naturalCompare } from '../domain/labels'
	import { racksInOrder, newServerRoom, nextRoomName } from '../domain/devices'
	import { markPrinted } from '../domain/ports'
	import { exportPanelLabels } from '../render/exports'
	import { downloadPanelSheets, unsupportedNote } from '../app/sheetsPdf'
	import type { Device } from '../domain/types'
	import type { ViewSpec } from '../views/space'
	import SideSection from './SideSection.svelte'
	import FindDevice from './FindDevice.svelte'

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
			return { space, name: project.index.nameOf(space) || 'No room', racks: rs.sort((a, b) => Number(!!a.at) - Number(!!b.at) || (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0)) }
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
	/** The room's panels drawn with their port labels, as a PDF for the installer; then the same "Mark printed" offer. */
	async function panelPdf(spaceId: string, name: string) {
		try {
			const r = await downloadPanelSheets(project, { id: spaceId, name })
			if (!r.pages) { ws.say(`${name} has no patch panels with ports`); return }
			ws.ask2(`${r.panels.length} panel(s) on ${r.pages} page(s)${unsupportedNote(r.unsupported, r.rasterised)}. Mark the panels of ${name} as printed?`, 'Mark printed',
				() => { const now = Date.now(); project.store.transact(`${name}: labels printed`, (tx) => { for (const d of r.panels) tx.put(markPrinted(project.index, d, now)) }) })
		} catch (e) { project.error = `Panel PDF failed: ${(e as Error).message}` }
	}
	function addRoom() {
		ws.askText('New server room name', nextRoomName(project.index, levelId), (t) => {
			if (!t.trim()) return
			const room = newServerRoom(project.index, levelId, t.trim())
			project.store.transact(`New server room ${room.name}`, (tx) => tx.put(room))
		})
	}
	/** The room at a glance (its name's tooltip): "4F · 2 rows · 6 racks · 48 devices". */
	function summary(spaceId: string, racks: Rack[]): string {
		const room = project.index.get(spaceId) as { levelId?: string } | undefined
		const rows = new Set(racks.map((r) => r.rowId).filter(Boolean)).size, devs = racks.reduce((n, r) => n + project.index.devicesIn(r.id).length, 0)
		return `${project.index.nameOf(room?.levelId)} · ${rows} row${rows === 1 ? '' : 's'} · ${racks.length} rack${racks.length === 1 ? '' : 's'} · ${devs} device${devs === 1 ? '' : 's'} — click to rename`
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
	function rename(spaceId: string, name: string) {
		const s = project.index.get(spaceId)
		if (s?.type !== 'space') return
		ws.askText('Room name', name, (t) => { if (t.trim() && t.trim() !== s.name) project.store.transact(`Rename room ${s.name} → ${t.trim()}`, (tx) => tx.put({ ...s, name: t.trim() })) })
	}
</script>

<SideSection key="racks" title="Racks">
	{#snippet actions()}<button title="Add a server room to this level (racks belong to a room)" onclick={addRoom}>+ Server room</button>{/snippet}
	<FindDevice {project} {ws} {onview} />
	{#each groups as g (g.space)}
		<div class="room">
			<button class="roomname" title={summary(g.space, g.racks)} onclick={() => rename(g.space, g.name)}>{g.name}</button>
			<span>
				<!-- room actions (exports) in a menu, so they aren't mistaken for views -->
				<select class="acts" title="Room actions" value="" onchange={(e) => { const v = e.currentTarget.value; e.currentTarget.value = ''; if (v === 'labels') labels(g.space, g.name); else if (v === 'pdf') panelPdf(g.space, g.name) }}>
					<option value="" disabled>⋯</option>
					<option value="labels">Export panel labels (Excel)…</option>
					<option value="pdf">Print panels with labels (PDF)…</option>
				</select>
				{#if onview}<button class="place" title="Open this room's rack view (its racks front / rear) in the active pane" onclick={() => onview({ kind: 'row', spaceId: g.space, face: 'front' })}>Rack view</button>{/if}
			</span>
		</div>
		{#each g.racks as r (r.id)}
			<div class="rack" class:sel={selected.has(r.id)}>
				<button class="name" onmousedown={(e) => { if (e.shiftKey) e.preventDefault() }} onclick={(e) => pick(r, e)} title="{project.index.devicesIn(r.id).length} devices · {r.heightU}U{r.patchFrame ? ' · patch frame (takes outlets)' : ''}">{r.name}{#if r.patchFrame}<span class="frame">frame</span>{/if}</button>
				{#if !r.at}
					<button class="place" class:armed={ws.toolId === 'rack' && ws.rackTool.target === r.id} onclick={() => ws.placeRack(r.id)}>Place</button>
				{/if}
			</div>
		{:else}
			<p class="px-2 text-[11px] text-zinc-400">No racks yet — draw them with the Rack tool</p>
		{/each}
	{/each}
</SideSection>

<style>
	.acts { width: 1.6rem; border: 0; background: transparent; color: var(--cad-muted); font-size: 12px; cursor: pointer; appearance: none; text-align: center; }
	.acts:hover { color: #2563eb; }
	/* the open list: a transparent select would show its options in the theme's text colour on the browser's own list */
	.acts option { background: var(--cad-panel); color: var(--cad-text); }
	.roomname { color: inherit; font-size: inherit; }
	.roomname:hover { color: #2563eb; text-decoration: underline; }
	.frame { margin-left: 6px; font-size: 10px; color: #0369a1; background: #e0f2fe; border-radius: 3px; padding: 0 3px; }
	.room { display: flex; align-items: center; justify-content: space-between; padding: 4px 4px 0; font-size: 11px; color: var(--cad-faint); }
	.rack { display: flex; align-items: center; justify-content: space-between; border-radius: 4px; padding: 0 4px; font-size: 12px; }
	.rack:hover { background: var(--cad-hover); }
	.rack.sel { background: var(--cad-pick); }
	.name { text-align: left; flex: 1; padding: 1px 4px; }
	.place { font-size: 11px; color: #2563eb; padding: 0 4px; border-radius: 3px; }
	.place:hover, .place.armed { background: var(--cad-sel); }
</style>
