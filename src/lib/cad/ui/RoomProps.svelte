<!-- A ROOM's properties (a space picked in the Navigator, the Racks window or a rack's "Room … ›" link): General (name,
     code — a server room's letter in port labels). A server room also has: Floor and ceiling (its own, for all its
     racks: rack views, elevations, cable heights) · Rows (add, rename, reorder, containment, delete) · Summary (racks,
     panels, ports used / free, outlets it serves) · Actions (rack view, place racks on the plan, delete it). -->
<script lang="ts">
	import type { CadProject } from '../app/project.svelte'
	import type { Workspace } from '../app/workspace.svelte'
	import type { Space, RackRow } from '../domain/types'
	import { newId } from '../domain/ids'
	import { untrack } from 'svelte'
	import { put } from './propsKit'
	import { deleteRoom, deleteRow } from '../app/navActions'
	import PropGroup from './PropGroup.svelte'
	import NameInput from './NameInput.svelte'
	import Field from './fields/Field.svelte'
	import TextField from './fields/TextField.svelte'

	let { project, ws, room }: { project: CadProject; ws: Workspace; room: Space } = $props()

	const server = $derived(room.kind === 'server room')
	const level = $derived(project.index.get(room.levelId))
	const levelCeil = $derived(level?.type === 'level' ? level.heights.clearHeightMm : undefined)
	const set = (label: string, patch: Partial<Space>) => put(project.store, room, label, patch)

	// ── rows: in their order ──
	const rows = $derived(project.index.ofType('rackRow').filter((e) => e.spaceId === room.id).sort((a, b) => a.order - b.order))
	const racks = $derived(project.index.racks.filter((r) => r.spaceId === room.id))
	const inRow = (id: string) => racks.filter((r) => r.rowId === id).length
	/** Swap a row with its neighbour (the rack view's row order); orders renumbered 0, 1, 2 … */
	function move(i: number, d: -1 | 1) {
		const j = i + d
		if (j < 0 || j >= rows.length) return
		const next = [...rows];
		[next[i], next[j]] = [next[j], next[i]]
		project.store.transact(`Row ${rows[i].name} ${d < 0 ? 'up' : 'down'}`, (tx) => next.forEach((w, k) => { if (w.order !== k) tx.put({ ...w, order: k }) }))
	}
	let adding = $state(false)
	$effect(() => { void ws.selection; untrack(() => { adding = false }) })
	function addRow(name: string) {
		adding = false
		const row: RackRow = { type: 'rackRow', id: newId(), spaceId: room.id, name, order: rows.length }
		project.store.transact(`New row ${name}`, (tx) => tx.put(row))
	}

	// ── summary: what the room holds and serves ──
	const summary = $derived.by(() => {
		const devs = racks.flatMap((r) => project.index.devicesIn(r.id)), panels = devs.filter((d) => d.kind === 'panel')
		let ports = 0, used = 0
		for (const d of panels) for (let p = 1; p <= d.portCount; p++) { ports++; if (project.index.linkAt({ on: d.id, port: p })) used++ }
		const served = project.index.outlets.filter((o) => o.ports.some((p) => p.serverRoomId === room.id))
		return { devices: devs.length, panels: panels.length, ports, used, outlets: served.length, outletPorts: served.reduce((n, o) => n + o.ports.filter((p) => p.serverRoomId === room.id).length, 0) }
	})
	const unplaced = $derived(racks.filter((r) => !r.at))
	function placeRacks() {
		ws.openInTab({ levelId: room.levelId, spec: { kind: 'plan' } })
		ws.placeRack(unplaced[0].id)
		ws.say(`Click on the plan where ${unplaced[0].name} goes${unplaced.length > 1 ? ` (${unplaced.length - 1} more to place after it: the Racks window lists them)` : ''}`)
	}
</script>

<PropGroup kind="room" title="General">
	<TextField label="Name" value={room.name} onchange={(v) => v && v !== room.name && set(`Rename room ${room.name} → ${v}`, { name: v })} />
	<TextField label="Code" mono title={server ? 'The server room’s letter or code in port labels (the S of FF.Z.NNN-SPP)' : 'Its short code'} value={room.code} onchange={(v) => set('Room code', { code: v || undefined })} />
	<Field label="Level">{#snippet children()}<span class="muted">{project.index.nameOf(room.levelId)}</span>{/snippet}</Field>
	{#if !server}
		<!-- W30: an EPS (electrical / riser room) names the riser view's EPS box round the riser inside it -->
		<Field label="Kind" title="An EPS (riser room): the riser view names its EPS box after it">{#snippet children()}
			<select class="inp" value={room.kind} onchange={(e) => set('Room kind', { kind: e.currentTarget.value })}>
				<option value="room">Room</option><option value="eps">EPS (riser room)</option>
				{#if room.kind !== 'room' && room.kind !== 'eps'}<option value={room.kind}>{room.kind}</option>{/if}
			</select>
		{/snippet}</Field>
	{/if}
</PropGroup>
{#if server}
	<PropGroup kind="room" title="Floor and ceiling">
		<Field label="Floor" unit="FL mm" title="The room's floor, mm above the level's FFL (a step up or a sunken slab; − = below). Its racks stand on it — rack views, elevations and cable heights.">
			{#snippet children(id)}<input class="inp" type="number" step="10" aria-labelledby={id} value={room.floorMm ?? ''} placeholder="+0" onchange={(e) => { const v = e.currentTarget.value.trim(); set(`${room.name} floor`, { floorMm: v === '' || Number(v) === 0 ? undefined : Number(v) }) }} />{/snippet}
		</Field>
		<Field label="Ceiling" unit="FL mm" title="The room's ceiling, mm above the level's FFL; blank = the level's ceiling. Drawn in its rack views.">
			{#snippet children(id)}<input class="inp" type="number" step="10" aria-labelledby={id} value={room.ceilingMm ?? ''} placeholder={levelCeil != null ? `+${levelCeil} (level)` : 'level'} onchange={(e) => { const v = e.currentTarget.value.trim(); set(`${room.name} ceiling`, { ceilingMm: v === '' ? undefined : Number(v) }) }} />{/snippet}
		</Field>
	</PropGroup>
	<PropGroup kind="room" title="Rows">
		{#each rows as w, i (w.id)}
			<div class="rw">
				<input class="inp" value={w.name} aria-label="Row name" title="Row name" onchange={(e) => { const t = e.currentTarget.value.trim(); if (t && t !== w.name) project.store.transact(`Rename row ${w.name} → ${t}`, (tx) => tx.put({ ...w, name: t })) }} />
				<select class="inp" value={w.containment ?? 'none'} aria-label="Containment" title="Aisle containment: hot (HAC), cold (CAC) or both — adds the matching caps, kits and end panels to the rack BOM"
					onchange={(e) => project.store.transact('Row containment', (tx) => tx.put({ ...w, containment: e.currentTarget.value === 'none' ? undefined : (e.currentTarget.value as RackRow['containment']) }))}>
					<option value="none">no containment</option><option value="hac">hot aisle (HAC)</option><option value="cac">cold aisle (CAC)</option><option value="combined">both</option>
				</select>
				<button class="lnk" title="Its Properties (and its racks)" onclick={() => ws.select([w.id])}>{inRow(w.id)}</button>
				<button class="btn" disabled={i === 0} title="Move up (the rack view's row order)" onclick={() => move(i, -1)}>▲</button>
				<button class="btn" disabled={i === rows.length - 1} title="Move down" onclick={() => move(i, 1)}>▼</button>
				<button class="btn del" title="Delete this row (its racks stay in the room, in no row; Undo brings it back)" onclick={() => { deleteRow(project, w.id); ws.say(`Deleted row ${w.name} (its racks stay in the room) — Undo brings it back`) }}>✕</button>
			</div>
		{:else}
			<p class="muted">No rows yet</p>
		{/each}
		{#if adding}
			<div class="row"><span class="muted">New row</span><NameInput wide create value={`Row ${rows.length + 1}`} placeholder="Its name" title="Enter: add it · Esc: cancel" onsave={addRow} oncancel={() => (adding = false)} /></div>
		{:else}
			<div class="acts"><button class="btn" title="A new row in this room (put racks in it from a rack's Row field)" onclick={() => (adding = true)}>+ Row</button></div>
		{/if}
	</PropGroup>
	<PropGroup kind="room" title="Summary">
		<div class="sum">
			<span>Racks</span><span>{racks.length}{unplaced.length ? ` (${unplaced.length} not on the plan)` : ''}</span>
			<span>Devices</span><span>{summary.devices}</span>
			<span>Panels</span><span>{summary.panels}</span>
			<span>Panel ports</span><span>{summary.used} used · {summary.ports - summary.used} free</span>
			<span>Outlets served</span><span>{summary.outlets} ({summary.outletPorts} port{summary.outletPorts === 1 ? '' : 's'})</span>
		</div>
	</PropGroup>
{/if}
<div class="acts">
	{#if server}
		<button class="btn" title="This room's racks, front and rear, in the active pane" onclick={() => ws.openInTab({ levelId: room.levelId, spec: { kind: 'row', spaceId: room.id, face: 'front' } })}>Open rack view</button>
		{#if unplaced.length}<button class="btn" title="Open the plan and place the racks not on it yet, one click each" onclick={placeRacks}>Place racks on the plan ({unplaced.length})</button>{/if}
	{/if}
	<button class="btn del" title="Delete the room — with its racks, asked first when it has some; Undo brings it back" onclick={() => deleteRoom(project, ws, room.id)}>Delete room…</button>
</div>

<style>
	/* a row: name, containment, its racks (a click selects the row), ▲ ▼ ✕ */
	.rw { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto auto auto auto; align-items: center; gap: 3px; margin-bottom: 2px; }
	.lnk { min-width: 1.2rem; color: var(--cad-link, #2563eb); }
	.lnk:hover { text-decoration: underline; }
	.sum { display: grid; grid-template-columns: 6.5rem 1fr; gap: 1px 0.25rem; }
	.sum span:nth-child(odd) { color: var(--cad-muted); }
</style>
