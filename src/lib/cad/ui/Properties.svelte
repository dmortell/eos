<!-- Properties of the selection. One edit = one undo step. Fields per entity type; more types arrive with their
     tools (field descriptors per type replace this in a later slice — analysis §6.7). -->
<script lang="ts">
	import { sortedUsages } from '../domain/usages'
	import type { CadProject } from '../app/project.svelte'
	import type { Workspace } from '../app/workspace.svelte'
	import type { Entity, Sheet } from '../domain/drawing'
	import type { Id, Outlet, Rack, RackRow, Device, Space } from '../domain/types'
	import { placementProblem, deviceCounts, newServerRoom, nextRoomName, moveRacksToLevel, narrowDevice } from '../domain/devices'
	import { markPrinted, changedSincePrinted, portRanges } from '../domain/ports'
	import { naturalCompare } from '../domain/labels'
	import PortProps from './PortProps.svelte'
	import CordProps from './CordProps.svelte'
	import SheetProps from './SheetProps.svelte'
	import SheetMultiProps from './SheetMultiProps.svelte'
	import OutletProps from './OutletProps.svelte'
	import DeviceMultiProps from './DeviceMultiProps.svelte'
	import RowProps from './RowProps.svelte'
	import RackDoors from './RackDoors.svelte'
	import SectionProps from './SectionProps.svelte'
	import NoteProps from './NoteProps.svelte'
	import LegendProps from './LegendProps.svelte'
	import ColorPick from './ColorPick.svelte'
	import InsertAttrs from './InsertAttrs.svelte'
	import LineStyle from './LineStyle.svelte'
	import RunsMultiProps from './RunsMultiProps.svelte'
	import ShapesMultiProps from './ShapesMultiProps.svelte'
	import { groupSelection, ungroupSelection } from '../editor/commands'
	import RenumberPanel from './RenumberPanel.svelte'
	import LayerPick from './LayerPick.svelte'
	import PropsHeader from './PropsHeader.svelte'
	import PropGroup from './PropGroup.svelte'
	import { renumberable } from '../domain/renumber'
	import { repeatableEdit } from '../domain/repeatEdit'
	import { newId } from '../domain/ids'
	import { withStyle, type Shape } from '../domain/shapes'
	import PathProps from './PathProps.svelte'
	import RunFill from './RunFill.svelte'
	import WallOpenings from './WallOpenings.svelte'

	let { project, ws }: { project: CadProject; ws: Workspace } = $props()

	const items = $derived(ws.selection.map((id) => project.index.get(id)).filter((e): e is Entity => !!e))
	const one = $derived(items.length === 1 ? items[0] : undefined)

	const put = <T extends Entity>(e: T, label: string, patch: Partial<T>) => project.store.transact(label, (tx) => tx.put({ ...e, ...patch }))
	const num = (v: string) => (v.trim() === '' ? undefined : Number(v))

	/** Drawn shapes in the selection (not inserts) — what "Make block" can take. */
	const blockable = $derived(items.filter((e): e is Shape => e.type === 'shape' && e.geom.kind !== 'insert' && !!e.levelId))
	let busy = $state(false)

	const RACK_KINDS: Rack['kind'][] = ['2-post', '4-post', 'cabinet', 'vcm', 'desk', 'shelf']

	// ── several selected: common fields ──
	const outlets = $derived(items.filter((e): e is Outlet => e.type === 'outlet'))
	const devices = $derived(items.filter((e): e is Device => e.type === 'device'))
	/** The value they all share, or undefined when it differs (shown as "mixed"). */
	function same<T, V>(list: T[], get: (t: T) => V): V | undefined {
		const v = list.length ? get(list[0]) : undefined
		return list.every((t) => get(t) === v) ? v : undefined
	}
	function setRacks(label: string, patch: Partial<Rack>) {
		const v = Object.values(patch)[0]
		if (typeof v === 'number' && !Number.isFinite(v)) return
		project.store.transact(`${label} (${racks.length} racks)`, (tx) => { for (const r of racks) tx.put({ ...r, ...patch }) })
	}

	// ── racks → rows ──
	const NEW_ROW = '__new'
	const racks = $derived(items.filter((e): e is Rack => e.type === 'rack'))
	const sameRoom = $derived(racks.every((r) => r.spaceId === racks[0]?.spaceId))
	const sameRow = $derived(racks.every((r) => r.rowId === racks[0]?.rowId) ? racks[0]?.rowId : undefined)
	// via the index (reactive); rows are few, so a scan is fine
	const rowsIn = (spaceId: Id) => [...project.index.byId.values()].filter((e): e is RackRow => e.type === 'rackRow' && e.spaceId === spaceId).sort((a, b) => a.order - b.order)
	/** Rooms a rack can stand in: the server rooms of its level (and wherever it is now). */
	const roomsFor = (r: Rack) => project.index.spaces.filter((s) => (s.levelId === r.levelId && s.kind === 'server room') || s.id === r.spaceId).sort((a, b) => naturalCompare(a.name, b.name))
	/** Move racks to another room; their row is dropped (rows belong to a room) — pick one there next. */
	const NEW_ROOM = '__newroom'
	function setRoom(rs: Rack[], spaceId: string) {
		if (spaceId === NEW_ROOM) {
			const lv = rs[0].levelId
			ws.askText('New server room name', nextRoomName(project.index, lv), (name) => {
				if (!name.trim()) return
				const room = newServerRoom(project.index, lv, name.trim())
				project.store.transact(`New room ${room.name}`, (tx) => { tx.put(room); for (const r of rs) tx.put({ ...r, spaceId: room.id, rowId: undefined }) })
			})
			return
		}
		const moving = rs.filter((r) => r.spaceId !== spaceId)
		if (!moving.length) return
		project.store.transact(`${moving.length > 1 ? `${moving.length} racks` : moving[0].name} → ${project.index.nameOf(spaceId)}`, (tx) => { for (const r of moving) tx.put({ ...r, spaceId, rowId: undefined }) })
	}
	function setRow(rs: Rack[], value: string) {
		if (value !== NEW_ROW) { project.store.transact('Rack row', (tx) => { for (const r of rs) tx.put({ ...r, rowId: value || undefined }) }); return }
		const existing = rowsIn(rs[0].spaceId)
		ws.askText('Row name', `Row ${existing.length + 1}`, (name) => {
			if (!name.trim()) return
			const row: RackRow = { type: 'rackRow', id: newId(), spaceId: rs[0].spaceId, name: name.trim(), order: existing.length }
			project.store.transact(`New row ${row.name}`, (tx) => { tx.put(row); for (const r of rs) tx.put({ ...r, rowId: row.id }) })
		})
	}

	/** Racks to another level: devices, links and cords go with them; they come off that level's plan. */
	function moveToLevel(rs: Rack[], levelId: string) {
		const out = moveRacksToLevel(project.index, rs, levelId)
		if (!out.length) return
		project.store.transact(`${rs.length > 1 ? `${rs.length} racks` : rs[0].name} → ${project.index.nameOf(levelId)}`, (tx) => { for (const e of out) tx.put(e) })
		ws.say(`Moved to ${project.index.nameOf(levelId)} — open that level and use Place in the racks list to put them on its plan`)
	}

	/** Rack sizes: a rack that would collide on the plan is still allowed (it's a drawing), but sizes must be real. */
	function putSize(r: Rack, label: string, patch: Partial<Rack>) {
		const v = Object.values(patch)[0]
		if (v !== undefined && (!Number.isFinite(v) || (v as number) < 100)) { ws.say('Sizes are in mm (100 or more)'); return }
		put(r, label, patch)
	}

	// ── devices ──
	const KINDS: Device['kind'][] = ['panel', 'switch', 'manager', 'server', 'shelf', 'pdu', 'enclosure', 'other']
	/** A device edit that would overlap another or run off the rack is refused, with the reason. */
	function putDevice(d: Device, label: string, patch: Partial<Device>) {
		const next = { ...d, ...patch }, rack = project.index.get(d.rackId)
		const problem = rack?.type === 'rack' ? placementProblem(next, rack, project.index.devices) : null
		if (problem) { ws.say(problem); return }
		put(d, label, patch)
		ws.lastDeviceEdit = repeatableEdit(d, label, patch) ?? ws.lastDeviceEdit   // F4 repeats it on other devices
	}
	/** `…/cad?rack=<id>`: opens the rack's room in the rack view, zoomed to the rack (CadShell). */
	function copyRackLink(r: Rack) {
		const url = new URL(location.pathname, location.origin)
		url.searchParams.set('rack', r.id)
		navigator.clipboard.writeText(url.toString()).then(() => ws.say(`Link to ${r.name} copied`), () => ws.say(url.toString()))
	}
	function setUsage(d: Device, usage: string, on: boolean) {
		const cur = d.panel?.usages ?? [], usages = on ? [...new Set([...cur, usage])] : cur.filter((x) => x !== usage)
		putDevice(d, `${d.name} takes ${usages.join(', ') || 'any usage'}`, { panel: { tier: 'low', ...d.panel, usages: usages.length ? usages : undefined } })
	}
	function saveTemplate(d: Device) {
		ws.askText('Template name (global)', d.name, async (name) => {
			busy = true
			try { const t = await project.saveTemplate(d.id, name); if (t) ws.say(`Saved template "${t.name}"`) }
			catch (e) { project.error = `Save template failed: ${(e as Error).message}` }
			finally { busy = false }
		})
	}

	function makeBlock() {
		ws.askText('Block name', '', async (name) => {
			busy = true
			try { const id = await project.makeBlock(blockable.map((s) => s.id), name); if (id) ws.select([id]) }
			catch (e) { project.error = `Make block failed: ${(e as Error).message}` }
			finally { busy = false }
		})
	}
</script>

<div class="space-y-1 p-3 text-xs">
	{#if ws.toolId === 'renumber'}
		<RenumberPanel {project} {ws} open />
	{:else if items.filter(renumberable).length > 1}
		<RenumberPanel {project} {ws} />
	{/if}
	{#if items.length}<PropsHeader {project} {ws} {items} />{/if}
	{#if !items.length}
		<p class="text-zinc-400">Nothing selected.</p>
	{:else if !one}
		{#if racks.length > 1}
			<label class="row">Room of {racks.length} racks
				<select class="inp" value={sameRoom ? racks[0].spaceId : ''} onchange={(e) => e.currentTarget.value && setRoom(racks, e.currentTarget.value)}>
					{#if !sameRoom}<option value="">mixed</option>{/if}
					{#each roomsFor(racks[0]) as s (s.id)}<option value={s.id}>{s.name}</option>{/each}
					<option value={NEW_ROOM}>New server room…</option>
				</select>
			</label>
		{/if}
		{#if racks.length > 1 && sameRoom}
			<!-- racks drawn on the plan, then put in a row together (Dave: no row builder) -->
			<label class="row">Row of {racks.length} racks
				<select class="inp" value={sameRow ?? ''} onchange={(e) => setRow(racks, e.currentTarget.value)}>
					<option value="">—</option>
					{#each rowsIn(racks[0].spaceId) as row (row.id)}<option value={row.id}>{row.name}</option>{/each}
					<option value={NEW_ROW}>New row…</option>
				</select>
			</label>
			{#if sameRow}<RowProps {project} {ws} rowId={sameRow} />{/if}
		{/if}
		{#if racks.length > 1}
			<p class="text-zinc-500">{deviceCounts(racks.flatMap((r) => project.index.devicesIn(r.id)))} in {racks.length} racks</p>
			<label class="row">Level
				<select class="inp" value={same(racks, (r) => r.levelId) ?? ''} onchange={(e) => e.currentTarget.value && moveToLevel(racks, e.currentTarget.value)}>
					{#if !same(racks, (r) => r.levelId)}<option value="">mixed</option>{/if}
					{#each project.levels as l (l.id)}<option value={l.id}>{l.name}</option>{/each}
				</select>
			</label>
			<!-- common rack fields: a value shown when they all share it, blank ("mixed") when they don't; an edit sets all -->
			<label class="row">Kind
				<select class="inp" value={same(racks, (r) => r.kind) ?? ''} onchange={(e) => e.currentTarget.value && setRacks('Rack kind', { kind: e.currentTarget.value as Rack['kind'] })}>
					{#if !same(racks, (r) => r.kind)}<option value="">mixed</option>{/if}
					{#each RACK_KINDS as k (k)}<option value={k}>{k}</option>{/each}
				</select>
			</label>
			<label class="row">Maker <input class="inp" value={same(racks, (r) => r.maker ?? '') ?? ''} placeholder={same(racks, (r) => r.maker ?? '') === undefined ? 'mixed' : ''} onchange={(e) => setRacks('Rack maker', { maker: e.currentTarget.value.trim() || undefined })} /></label>
			<label class="row">Model <input class="inp" value={same(racks, (r) => r.model ?? '') ?? ''} placeholder={same(racks, (r) => r.model ?? '') === undefined ? 'mixed' : ''} onchange={(e) => setRacks('Rack model', { model: e.currentTarget.value.trim() || undefined })} /></label>
			<label class="row">Notes <input class="inp" value={same(racks, (r) => r.notes ?? '') ?? ''} placeholder={same(racks, (r) => r.notes ?? '') === undefined ? 'mixed' : ''} onchange={(e) => setRacks('Rack notes', { notes: e.currentTarget.value.trim() || undefined })} /></label>
			<label class="row">Width (mm) <input class="inp" type="number" min="100" value={same(racks, (r) => r.widthMm) ?? ''} placeholder="mixed" onchange={(e) => setRacks('Rack width', { widthMm: Number(e.currentTarget.value) })} /></label>
			<label class="row">Depth (mm) <input class="inp" type="number" min="100" value={same(racks, (r) => r.depthMm) ?? ''} placeholder="mixed" onchange={(e) => setRacks('Rack depth', { depthMm: Number(e.currentTarget.value) })} /></label>
			<label class="row">Height (U) <input class="inp" type="number" min="1" value={same(racks, (r) => r.heightU) ?? ''} placeholder="mixed" onchange={(e) => setRacks('Rack height', { heightU: Number(e.currentTarget.value) })} /></label>
			<label class="row">Height (mm) <input class="inp" type="number" value={same(racks, (r) => r.heightMm) ?? ''} placeholder="mixed / from U" onchange={(e) => setRacks('Rack height', { heightMm: num(e.currentTarget.value) })} /></label>
			<label class="row">Rotation <input class="inp" type="number" value={same(racks, (r) => r.rot ?? 0) ?? ''} placeholder="mixed" onchange={(e) => setRacks('Rotate racks', { rot: Number(e.currentTarget.value) })} /></label>
			<label class="row">Patch frame
				<span><input type="checkbox" checked={racks.every((r) => r.patchFrame)} indeterminate={racks.some((r) => r.patchFrame) && !racks.every((r) => r.patchFrame)}
					onchange={(e) => setRacks(e.currentTarget.checked ? 'Patch frames' : 'Not patch frames', { patchFrame: e.currentTarget.checked || undefined })} /> takes outlets</span>
			</label>
			<RackDoors {project} {racks} />
		{/if}
		{#if outlets.length > 1}<OutletProps {project} {ws} {outlets} />{/if}
		{#if devices.length > 1}<DeviceMultiProps {project} {ws} {devices} />{/if}
		{@const sheetsSel = items.filter((e): e is Sheet => e.type === 'sheet')}
		{#if sheetsSel.length > 1}<SheetMultiProps {project} {ws} sheets={sheetsSel} />{/if}
		{@const runs = items.filter((e): e is Shape => e.type === 'shape' && e.geom.kind === 'path')}
		{#if runs.length > 1}<RunsMultiProps {project} {runs} />{/if}
		{@const others = items.filter((e): e is Shape => e.type === 'shape' && e.geom.kind !== 'path')}
		{#if others.length > 1}<ShapesMultiProps {project} shapes={others} />{/if}
		{@const placed = others.filter((s) => s.geom.kind === 'insert' && s.levelId)}
		{#if placed.length > 1}
			{@const on = (s: Shape) => s.geom.kind === 'insert' && !!s.geom.inElevations}
			<label class="row" title="Show these blocks in elevations and sections too (wall faceplates); otherwise only on the plan">Elevations
				<span><input type="checkbox" checked={placed.every(on)} indeterminate={placed.some(on) && !placed.every(on)}
					onchange={(e) => { const v = e.currentTarget.checked || undefined; project.store.transact(`${v ? 'Show in elevations' : 'Plan only'} (${placed.length} blocks)`, (tx) => { for (const s of placed) tx.put({ ...s, geom: { ...s.geom, inElevations: v } } as Shape) }) }} /> show in elevations</span></label>
		{/if}
		{#if others.filter((s) => s.geom.kind === 'insert').length > 1}<InsertAttrs {project} inserts={others} />{/if}
		{#if blockable.length}
			<button class="btn" disabled={busy} title="Turn the selected shapes into a global block and put one insert in their place" onclick={makeBlock}>Make block from {blockable.length} shapes…</button>
		{/if}
		<!-- groups: shapes that select and move as one (Ctrl+G / Ctrl+Shift+G) -->
		{@const drawn = items.filter((e): e is Shape => e.type === 'shape')}
		<div class="flex gap-1">
			{#if drawn.length >= 2}<button class="btn" title="Group these shapes: a click on one selects them all (Ctrl+G)" onclick={() => { const r = groupSelection(project.store, ws.selection); ws.say('problem' in r ? r.problem : `Grouped ${r.n} shapes`) }}>Group</button>{/if}
			{#if drawn.some((s) => s.groupId)}<button class="btn" title="Take these shapes out of their group (Ctrl+Shift+G)" onclick={() => ws.say(`Ungrouped ${ungroupSelection(project.store, ws.selection)} shapes`)}>Ungroup</button>{/if}
		</div>
	{:else if one.type === 'outlet'}
		<OutletProps {project} {ws} outlets={[one]} />
	{:else if one.type === 'rack'}
		{@const r = one as Rack}
		<PropGroup kind="rack" title="General">
			<label class="row">Name <input class="inp" value={r.name} onchange={(e) => put(r, 'Rename rack', { name: e.currentTarget.value })} /></label>
			<label class="row">Kind
				<select class="inp" value={r.kind} onchange={(e) => put(r, 'Rack kind', { kind: e.currentTarget.value as Rack['kind'] })}>
					{#each RACK_KINDS as k (k)}<option value={k}>{k === 'vcm' ? 'VCM (vertical cable manager)' : k}</option>{/each}
				</select>
			</label>
			<div class="flex gap-1" style="padding-left: 6.75rem"><button class="btn" title="A link that opens this rack's room in the rack view, zoomed to this rack (?rack=)" onclick={() => copyRackLink(r)}>Copy link</button></div>
		</PropGroup>
		<PropGroup kind="rack" title="Position and size">
			{#if r.at}
				<label class="row">X <input class="inp" type="number" value={Math.round(r.at.x)} onchange={(e) => put(r, 'Move rack', { at: { ...r.at!, x: Number(e.currentTarget.value) } })} /></label>
				<label class="row">Y <input class="inp" type="number" value={Math.round(r.at.y)} onchange={(e) => put(r, 'Move rack', { at: { ...r.at!, y: Number(e.currentTarget.value) } })} /></label>
			{/if}
			<label class="row">Height (U) <input class="inp" type="number" value={r.heightU} onchange={(e) => put(r, 'Rack height', { heightU: Number(e.currentTarget.value) })} /></label>
			<label class="row">Width (mm) <input class="inp" type="number" min="100" value={r.widthMm} onchange={(e) => putSize(r, 'Rack width', { widthMm: Number(e.currentTarget.value) })} /></label>
			<label class="row">Depth (mm) <input class="inp" type="number" min="100" value={r.depthMm} onchange={(e) => putSize(r, 'Rack depth', { depthMm: Number(e.currentTarget.value) })} /></label>
			<label class="row">Height (mm) <input class="inp" type="number" value={r.heightMm ?? ''} placeholder="from U: {Math.round(r.heightU * 44.45 + 150)}" onchange={(e) => putSize(r, 'Rack height', { heightMm: num(e.currentTarget.value) })} /></label>
			<label class="row">Rotation <input class="inp" type="number" value={r.rot ?? 0} onchange={(e) => put(r, 'Rotate rack', { rot: Number(e.currentTarget.value) })} /></label>
			{#if r.at}
				<div class="flex gap-1" style="padding-left: 6.75rem">
					<button class="btn" title="Turn 90° anticlockwise" onclick={() => put(r, 'Rotate rack', { rot: ((r.rot ?? 0) + 270) % 360 })}>⟲ 90°</button>
					<button class="btn" title="Turn 90° clockwise" onclick={() => put(r, 'Rotate rack', { rot: ((r.rot ?? 0) + 90) % 360 })}>⟳ 90°</button>
					<button class="btn" title="Take it off the plan (it stays in the project)" onclick={() => put(r, 'Unplace rack', { at: undefined })}>Unplace</button>
				</div>
			{:else}
				<button class="btn" onclick={() => ws.placeRack(r.id)}>Place on plan</button>
			{/if}
		</PropGroup>
		<PropGroup kind="rack" title="Room, row, level">
			<label class="row">Room
				<select class="inp" value={r.spaceId} onchange={(e) => { const v = e.currentTarget.value; e.currentTarget.value = r.spaceId; setRoom([r], v) }}>
					{#each roomsFor(r) as s (s.id)}<option value={s.id}>{s.name}</option>{/each}
					<option value={NEW_ROOM}>New server room…</option>
				</select>
			</label>
			<label class="row">Row
				<select class="inp" value={r.rowId ?? ''} onchange={(e) => setRow([r], e.currentTarget.value)}>
					<option value="">—</option>
					{#each rowsIn(r.spaceId) as row (row.id)}<option value={row.id}>{row.name}</option>{/each}
					<option value={NEW_ROW}>New row…</option>
				</select>
			</label>
			{#if r.rowId}<RowProps {project} {ws} rowId={r.rowId} />{/if}
			{@const room = project.index.get(r.spaceId)}
			{#if room?.type === 'space'}
				<!-- the server room's own floor / ceiling (rack elevation context): the room's, for all its racks -->
				{@const lv = project.index.get(r.levelId)}
				{@const levelCeil = lv?.type === 'level' ? lv.heights.clearHeightMm : undefined}
				<label class="row" title="The room's floor, mm above the level's FFL (a step up or a sunken slab; − = below). Its racks stand on it — rack views, elevations and cable heights. For every rack in {room.name}.">Room floor
					<span class="flex items-center gap-1">FL <input class="inp" type="number" step="10" value={room.floorMm ?? ''} placeholder="+0" onchange={(e) => { const v = e.currentTarget.value.trim(); project.store.transact(`${room.name} floor`, (tx) => tx.put({ ...room, floorMm: v === '' || Number(v) === 0 ? undefined : Number(v) })) }} /> mm</span></label>
				<label class="row" title="The room's ceiling, mm above the level's FFL; blank = the level's ceiling. Drawn in its rack views. For every rack in {room.name}.">Room ceiling
					<span class="flex items-center gap-1">FL <input class="inp" type="number" step="10" value={room.ceilingMm ?? ''} placeholder={levelCeil != null ? `+${levelCeil} (level)` : 'level'} onchange={(e) => { const v = e.currentTarget.value.trim(); project.store.transact(`${room.name} ceiling`, (tx) => tx.put({ ...room, ceilingMm: v === '' ? undefined : Number(v) })) }} /> mm</span></label>
			{/if}
			<label class="row" title="Outlets are allocated to the panels of the room's patch frames (left to right). With none marked, every rack's panels take outlets.">Patch frame
				<span><input type="checkbox" checked={!!r.patchFrame} onchange={(e) => put(r, e.currentTarget.checked ? 'Patch frame' : 'Not a patch frame', { patchFrame: e.currentTarget.checked || undefined })} /> takes outlets</span>
			</label>
			<RackDoors {project} racks={[r]} />
			<label class="row">Level
				<select class="inp" value={r.levelId} title="Move the rack (with its devices) to another level — it comes off the plan there" onchange={(e) => moveToLevel([r], e.currentTarget.value)}>
					{#each project.levels as l (l.id)}<option value={l.id}>{l.name}</option>{/each}
				</select>
			</label>
		</PropGroup>
		<PropGroup kind="rack" title="Product and notes">
			<label class="row">Maker <input class="inp" value={r.maker ?? ''} onchange={(e) => put(r, 'Rack maker', { maker: e.currentTarget.value.trim() || undefined })} /></label>
			<label class="row">Model <input class="inp" value={r.model ?? ''} onchange={(e) => put(r, 'Rack model', { model: e.currentTarget.value.trim() || undefined })} /></label>
			<label class="row" title="The catalogue product (SKU) — the rack BOM adds its accessories">Product <input class="inp font-mono" value={r.catalogId ?? ''} onchange={(e) => put(r, 'Rack product', { catalogId: e.currentTarget.value.trim() || undefined })} /></label>
			<div class="row">Color <ColorPick value={r.color} allowByLayer onchange={(v) => put(r, 'Rack color', { color: v })} /></div>
			<label class="row">Notes <textarea class="inp" rows="2" value={r.notes ?? ''} onchange={(e) => put(r, 'Rack notes', { notes: e.currentTarget.value.trim() || undefined })}></textarea></label>
		</PropGroup>
		<p class="text-zinc-500">{deviceCounts(project.index.devicesIn(r.id))} · front faces the +y side when not rotated</p>
	{:else if one.type === 'device'}
		{@const d = one as Device}
		{@const rack = project.index.get(d.rackId) as Rack | undefined}
		<p class="text-zinc-500">in {rack?.name ?? '?'}</p>
		<!-- the selected PORTS first, above the device's own groups: what you clicked is what you want to act on (Dave
		     2026-10-07: "Patch to…" was hard to find at the bottom) -->
		{#if ws.portSel?.on === d.id}<div class="ports-first"><PortProps {project} {ws} sel={ws.portSel} /></div>{/if}
		<PropGroup kind="device" title="General">
			<label class="row">Name <input class="inp" value={d.name} onchange={(e) => putDevice(d, 'Rename device', { name: e.currentTarget.value })} /></label>
			<label class="row">Kind
				<select class="inp" value={d.kind} onchange={(e) => putDevice(d, 'Device kind', { kind: e.currentTarget.value as Device['kind'] })}>
					{#each KINDS as k (k)}<option value={k}>{k}</option>{/each}
				</select>
			</label>
		</PropGroup>
		<PropGroup kind="device" title="Position">
			<label class="row">U (bottom) <input class="inp" type="number" value={d.u} onchange={(e) => putDevice(d, 'Move device', { u: Number(e.currentTarget.value) })} /></label>
			<label class="row">Height (U) <input class="inp" type="number" min="1" value={d.heightU} onchange={(e) => putDevice(d, 'Device height', { heightU: Number(e.currentTarget.value) })} /></label>
			<label class="row">Face
				<select class="inp" value={d.face} onchange={(e) => putDevice(d, 'Device face', { face: e.currentTarget.value as Device['face'] })}>
					{#each ['front', 'rear', 'both', 'none'] as f (f)}<option value={f}>{f}</option>{/each}
				</select>
			</label>
			{#if d.face === 'both' && d.kind !== 'pdu'}
				<label class="row" title="Fixed to one side only: it then shares its U with a device on the other side (when their depths fit)">Mount
					<select class="inp" value={d.mount ?? ''} onchange={(e) => putDevice(d, 'Device mount', { mount: (e.currentTarget.value || undefined) as Device['mount'] })}>
						<option value="">full depth</option><option value="front">front</option><option value="rear">rear</option>
					</select></label>
			{/if}
			{#if d.kind === 'pdu'}
				<!-- a 0U PDU (backlog "0U PDUs"): its side, its power inlets and its sockets — drawn on the strip; drag it across the rack to change sides -->
				<label class="row" title="The side of the rack it's on, as seen from the front (or drag it across)">Side
					<select class="inp" value={d.pduSide ?? 'left'} onchange={(e) => putDevice(d, 'PDU side', { pduSide: e.currentTarget.value === 'right' ? 'right' : undefined })}>
						<option value="left">left</option><option value="right">right</option>
					</select></label>
				<label class="row" title="Power inlets (feeds in), drawn at its bottom">Inlets <input class="inp" type="number" min="0" max="4" value={d.inlets ?? 0} onchange={(e) => putDevice(d, 'PDU inlets', { inlets: Math.max(0, Math.min(4, Number(e.currentTarget.value) || 0)) || undefined })} /></label>
				<label class="row" title="Sockets (outlets) along the strip">Sockets <input class="inp" type="number" min="0" max="48" value={d.outlets ?? 0} onchange={(e) => putDevice(d, 'PDU sockets', { outlets: Math.max(0, Math.min(48, Number(e.currentTarget.value) || 0)) || undefined })} /></label>
			{/if}
			{#if d.kind !== 'pdu'}
				<label class="row" title="Allow it to share Us with another device on the same side (a shelf always may) — the rack view marks the clash: those U numbers bold red with “!”">Overlap
					<span><input type="checkbox" checked={!!d.overlapOk} onchange={(e) => putDevice(d, e.currentTarget.checked ? 'May overlap' : 'No overlap', { overlapOk: e.currentTarget.checked || undefined })} /> may overlap{d.kind === 'shelf' ? ' (a shelf always may)' : ''}</span></label>
			{/if}
		</PropGroup>
		<PropGroup kind="device" title="Product and size">
			<label class="row">Maker <input class="inp" value={d.maker ?? ''} onchange={(e) => putDevice(d, 'Device maker', { maker: e.currentTarget.value.trim() || undefined })} /></label>
			<label class="row">Model <input class="inp" value={d.model ?? ''} onchange={(e) => putDevice(d, 'Device model', { model: e.currentTarget.value.trim() || undefined })} /></label>
			<label class="row">Width (mm) <input class="inp" type="number" min="10" value={d.widthMm ?? ''} placeholder="19-inch" onchange={(e) => putDevice(d, 'Device width', { widthMm: num(e.currentTarget.value) })} /></label>
			<label class="row">Depth (mm) <input class="inp" type="number" min="10" value={d.depthMm ?? ''} onchange={(e) => putDevice(d, 'Device depth', { depthMm: num(e.currentTarget.value) })} /></label>
			{#if rack && narrowDevice(d) && d.widthMm! < rack.widthMm}
				<label class="row" title="Sideways from the rack's centre, seen from the front (+ = right). Dragging it in the rack view moves it in 25 mm steps.">Offset X (mm)
					<input class="inp" type="number" step="25" value={d.offsetX ?? 0} onchange={(e) => { const room = (rack.widthMm - (d.widthMm ?? 0)) / 2, v = Math.max(-room, Math.min(room, Number(e.currentTarget.value) || 0)); putDevice(d, 'Device offset', { offsetX: v || undefined }) }} /></label>
			{/if}
		</PropGroup>
		<PropGroup kind="device" title="Ports and labels">
			<label class="row">Ports <input class="inp" type="number" min="0" value={d.portCount} onchange={(e) => putDevice(d, 'Port count', { portCount: Number(e.currentTarget.value) })} /></label>
			{#if d.portCount}
				<label class="row">Numbering
					<select class="inp" value={d.portNumbering ?? 'row'} onchange={(e) => putDevice(d, 'Port numbering', { portNumbering: e.currentTarget.value === 'column' ? 'column' : undefined })}>
						<option value="row">Across (2 beside 1)</option><option value="column">Down (2 under 1)</option>
					</select>
				</label>
			{/if}
			{#if d.kind === 'panel'}
				<label class="row">Tier
					<select class="inp" value={d.panel?.tier ?? 'low'} onchange={(e) => putDevice(d, 'Panel tier', { panel: { ...d.panel, tier: e.currentTarget.value as 'low' | 'high' } })}><option value="low">Low</option><option value="high">High</option></select>
				</label>
			{/if}
			{#if d.kind === 'panel'}
				<div class="row" title="Allocation puts an outlet on a panel of its usage first; a panel with none ticked is general (takes any usage without a panel of its own)">
					<span>Takes</span>
					<span class="usages">
						{#each sortedUsages(project.settings) as u (u.id)}
							<label><input type="checkbox" checked={!!d.panel?.usages?.includes(u.id)} onchange={(e) => setUsage(d, u.id, e.currentTarget.checked)} /> {u.label}</label>
						{/each}
						{#if !d.panel?.usages?.length}<span class="text-zinc-400">any usage (general)</span>{/if}
					</span>
				</div>
			{/if}
			{#if d.kind === 'panel' && d.portCount}
				{@const stale = changedSincePrinted(project.index, d)}
				<div class="row">
					<span>Labels</span>
					<span>
						{#if d.panel?.labelsPrintedAt}
							printed {new Date(d.panel.labelsPrintedAt).toLocaleDateString()}{#if stale.length}<span class="text-red-600"> · {stale.length} changed since ({portRanges(stale)})</span>{/if}
						{:else}<span class="text-zinc-400">not printed</span>{/if}
					</span>
				</div>
				<div class="flex gap-1" style="padding-left: 6.75rem">
					<button class="btn" title="Record that this panel's labels are printed and stuck on: later changes to them ask first, and differences are flagged" onclick={() => put(d, `${d.name} labels printed`, markPrinted(project.index, d, Date.now()))}>{d.panel?.labelsPrintedAt ? 'Printed again' : 'Mark printed'}</button>
					{#if d.panel?.labelsPrintedAt}<button class="btn" title="Forget the printed labels (no more warnings)" onclick={() => put(d, `${d.name} not printed`, { panel: { ...d.panel!, labelsPrintedAt: undefined, printedLabels: undefined } })}>Clear</button>{/if}
				</div>
			{/if}
		</PropGroup>
		<button class="btn" disabled={busy} title="Save this device's size, ports and kind as a GLOBAL template (every project)" onclick={() => saveTemplate(d)}>Save as template…</button>
	{:else if one.type === 'sheet'}
		<SheetProps {project} {ws} s={one} />
	{:else if one.type === 'cord'}
		<CordProps {project} {ws} c={one} />
	{:else if one.type === 'section'}
		<SectionProps {project} {ws} s={one} />
	{:else if one.type === 'shape' && (one.geom.kind === 'text' || one.geom.kind === 'leader' || one.geom.kind === 'cloud' || one.geom.kind === 'dimension')}
		<NoteProps {project} s={one} />
	{:else if one.type === 'shape' && one.geom.kind === 'legend'}
		<LegendProps {project} s={one} />
	{:else if one.type === 'shape' && one.geom.kind === 'path'}
		<PathProps {project} {ws} s={one} />
		{#if one.role?.kind === 'containment'}<RunFill {project} {ws} s={one} />{/if}
		{#if one.role?.kind === 'wall'}<WallOpenings {project} {ws} s={one} />{/if}
		<button class="btn" disabled={busy} onclick={makeBlock}>Make block…</button>
	{:else if one.type === 'shape' && one.geom.kind === 'insert'}
		{@const g = one.geom}
		{@const b = project.blockOf(g.blockId)}
		{#if !b}<p class="text-red-600">The block is missing</p>{/if}
		<label class="row">Rotation <input class="inp" type="number" value={g.rot ?? 0} onchange={(e) => put(one, 'Rotate', { geom: { ...g, rot: Number(e.currentTarget.value) || undefined } })} /></label>
		<label class="row">Scale <input class="inp" type="number" step="0.1" value={g.scale ?? 1} onchange={(e) => put(one, 'Scale', { geom: { ...g, scale: Number(e.currentTarget.value) || undefined } })} /></label>
		<label class="row" title="Height above FFL: where it shows in elevations and sections">Height (Z) <input class="inp" type="number" step="50" value={g.z ?? 0} onchange={(e) => put(one, 'Block height', { geom: { ...g, z: Number(e.currentTarget.value) || undefined } })} /></label>
		{#if one.levelId}
			<label class="row" title="Show it in elevations and sections too (a wall faceplate); otherwise only on the plan">Elevations
				<span><input type="checkbox" checked={!!g.inElevations} onchange={(e) => put(one, e.currentTarget.checked ? 'Show in elevations' : 'Plan only', { geom: { ...g, inElevations: e.currentTarget.checked || undefined } })} /> show in elevations</span></label>
		{/if}
		<InsertAttrs {project} inserts={[one]} />
		{#if b}<button class="btn" title="Replace this insert with the block's shapes, to edit them freely" onclick={() => ws.select(project.explode(one.id))}>Explode</button>{/if}
		{#if b && !b.builtin && !b.retired}
			<button class="btn del" title="Delete the block from the library (all projects): it can't be picked any more, but drawings that use it keep it"
				onclick={() => ws.ask2(`Delete block ${b.name} from the library (every project)? Inserts already placed keep drawing it. This can't be undone.`, 'Delete block', () => project.retireBlock(b.id))}>Delete block…</button>
		{:else if b?.retired}<p class="text-zinc-500">Deleted from the library (kept here)</p>{/if}
	{:else if one.type === 'shape'}
		<PropGroup kind="shape" title="General">
			<label class="row">Label <input class="inp" value={one.label ?? ''} onchange={(e) => put(one, 'Label', { label: e.currentTarget.value || undefined })} /></label>
		</PropGroup>
		{#if one.geom.kind === 'image'}
			<!-- a picture (Insert › Image…): which file; its box is resized by its grips -->
			{@const g = one.geom}
			<PropGroup kind="shape" title="Image">
				<p class="text-zinc-500" title="The file in Uploads">{g.fileId}{g.page && g.page > 1 ? ` · page ${g.page}` : ''} · {Math.round(g.size.x)} × {Math.round(g.size.y)}{one.sheetId ? ' mm on paper' : ' mm'}</p>
			</PropGroup>
		{:else}
		<PropGroup kind="shape" title="Style">
			<div class="row" title="Its own line color (By layer = its layer's)">Color
				<ColorPick value={one.style?.stroke} allowByLayer onchange={(v) => project.store.transact(v ? 'Color' : 'Color by layer', (tx) => tx.put(withStyle(one, { stroke: v })))} /></div>
			<LineStyle {project} shapes={[one]} />
		</PropGroup>
		{/if}
		{#if ['rect', 'circle', 'ellipse', 'polygon'].includes(one.geom.kind) && one.levelId && one.plane?.kind !== 'vertical'}
			<!-- a region on the plan: how tall it is (0 = flat) and where its base is — a box / desk (backlog "Box / desk tool") -->
			<label class="row" title="How tall it stands (mm); 0 = flat — a box shows in elevations and sections">Height
				<input class="inp" type="number" min="0" step="10" value={one.extent ?? 0} onchange={(e) => { const v = Math.max(0, Number(e.currentTarget.value) || 0); put(one, v ? 'Box height' : 'Flat', { extent: v || undefined }) }} /></label>
			<label class="row" title="Its base above the floor (mm)">Z
				<input class="inp" type="number" step="10" value={one.plane?.kind === 'plan' ? one.plane.z : 0} onchange={(e) => { const z = Number(e.currentTarget.value) || 0; put(one, 'Box Z', { plane: z ? { kind: 'plan', z } : undefined }) }} /></label>
		{/if}
		{#if ['rect', 'circle', 'ellipse', 'polygon'].includes(one.geom.kind)}
			<div class="row" title="Fill it with a color, or None">Fill
				<ColorPick value={one.style?.fill ?? 'none'} allowNone onchange={(v) => project.store.transact(v && v !== 'none' ? 'Fill' : 'No fill', (tx) => tx.put(withStyle(one, { fill: v })))} /></div>
		{/if}
		{#if one.geom.kind === 'rect'}
			<label class="row" title="A thick line on the box's back edge (its local −y side), like racks — which way a desk or cabinet faces">Back line
				<span><input type="checkbox" checked={!!one.backLine} onchange={(e) => put(one, e.currentTarget.checked ? 'Back line' : 'No back line', { backLine: e.currentTarget.checked || undefined })} /> on the back edge</span></label>
			<RackDoors {project} boxes={[one]} />
		{/if}
		{#if blockable.length}<button class="btn" disabled={busy} onclick={makeBlock}>Make block…</button>{/if}
	{:else}
		<p class="font-semibold">{one.type}</p>
	{/if}
	<LayerPick {project} ids={ws.selection} />
</div>

<style>
	.usages { display: flex; flex-wrap: wrap; gap: 2px 8px; }
	.usages label { white-space: nowrap; }
	.row { display: grid; grid-template-columns: 6.5rem 1fr; align-items: center; gap: 0.25rem; }
	.inp { width: 100%; border: 1px solid var(--cad-line); border-radius: 4px; padding: 1px 4px; background: var(--cad-input); color: var(--cad-text); }
	.btn { border: 1px solid var(--cad-line); border-radius: 4px; padding: 0 6px; background: var(--cad-input); color: var(--cad-text); }
	.btn:hover { background: var(--cad-hover); }
	.btn.del:hover { color: #dc2626; }
	.ports-first { border: 1px solid #bfdbfe; background: color-mix(in srgb, #2563eb 5%, var(--cad-panel, #fff)); border-radius: 6px; padding: 0 8px 6px; margin: 4px 0 8px; }
</style>
