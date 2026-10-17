<!-- RACK properties, for one rack or several (the same groups and fields; with several a field shows what they share or
     "mixed", and an edit sets them all — one undo step): General · Position and size · Room, row, level · Product and
     notes. Fields only one rack can have (its name, X / Y, Place / Unplace, Copy link) show for one. -->
<script lang="ts">
	import type { CadProject } from '../app/project.svelte'
	import type { Workspace } from '../app/workspace.svelte'
	import type { Id, Rack, RackRow } from '../domain/types'
	import type { CatalogProduct } from '$lib/catalog/types'
	import { deviceCounts, newServerRoom, nextRoomName, moveRacksToLevel, racksToRoom } from '../domain/devices'
	import { naturalCompare, nextRowName } from '../domain/labels'
	import { newId } from '../domain/ids'
	import { untrack } from 'svelte'
	import { shared, putMany } from './propsKit'
	import PropGroup from './PropGroup.svelte'
	import NameInput from './NameInput.svelte'
	import RowProps from './RowProps.svelte'
	import RackDoors from './RackDoors.svelte'
	import LayerPick from './LayerPick.svelte'
	import ColorPick from './ColorPick.svelte'
	import Field from './fields/Field.svelte'
	import NumberField from './fields/NumberField.svelte'
	import TextField from './fields/TextField.svelte'
	import SelectField from './fields/SelectField.svelte'
	import CheckField from './fields/CheckField.svelte'

	let { project, ws, racks }: { project: CadProject; ws: Workspace; racks: Rack[] } = $props()

	const one = $derived(racks.length === 1 ? racks[0] : undefined)
	/** The built-in catalogue, for a product's spec sheet (loaded on demand: it is big). */
	let seed = $state<CatalogProduct[]>([])
	$effect(() => { void import('$lib/catalog/panduitSeed').then((m) => (seed = m.PANDUIT_SEED)) })
	const RACK_KINDS: [Rack['kind'], string][] = [['2-post', '2-post'], ['4-post', '4-post'], ['cabinet', 'cabinet'], ['vcm', 'VCM (vertical cable manager)'], ['desk', 'desk'], ['shelf', 'shelf']]
	/** What the racks share (or mixed). */
	const rk = <V,>(f: (r: Rack) => V) => shared(racks, f)
	const set = (label: string, patch: Partial<Rack>) => putMany(project.store, racks, label, patch, 'racks')
	/** Sizes must be real (a rack that collides on the plan is still allowed: it's a drawing). */
	function setSize(label: string, patch: Partial<Rack>) {
		const v = Object.values(patch)[0]
		if (v !== undefined && (!Number.isFinite(v) || (v as number) < 100)) { ws.say('Sizes are in mm (100 or more)'); return }
		set(label, patch)
	}

	// ── room, row, level ──
	const NEW_ROOM = '__newroom', NEW_ROW = '__new'
	const sameRoom = $derived(rk((r) => r.spaceId))
	const sameRow = $derived(rk((r) => r.rowId))
	// via the index (reactive); rows are few, so a scan is fine
	const rowsIn = (spaceId: Id) => project.index.ofType('rackRow').filter((e) => e.spaceId === spaceId).sort((a, b) => a.order - b.order)
	/** Rooms a rack can stand in: the server rooms of its level (and wherever it is now). */
	/** Racks from several levels have no room in common to move to (Review 2 Q2: the list was the first one's level). */
	const oneLevel = $derived(racks.every((r) => r.levelId === racks[0]?.levelId))
	const rooms = $derived(racks[0] ? project.index.spaces.filter((s) => (s.levelId === racks[0].levelId && s.kind === 'server room') || racks.some((r) => r.spaceId === s.id)).sort((a, b) => naturalCompare(a.name, b.name)) : [])
	/** Racks to another room; their row is dropped (rows belong to a room) — pick one there next. */
	function setRoom(spaceId: string) {
		if (spaceId === NEW_ROOM) { naming = 'room'; return }
		const moving = racks.filter((r) => r.spaceId !== spaceId)
		if (!moving.length) return
		const out = racksToRoom(project.index, moving, spaceId)
		project.store.transact(`${moving.length > 1 ? `${moving.length} racks` : moving[0].name} → ${project.index.nameOf(spaceId)}`, (tx) => { for (const e of out) tx.put(e) })
	}
	function setRow(value: string) {
		if (value === NEW_ROW) { naming = 'row'; return }
		project.store.transact('Rack row', (tx) => { for (const r of racks) tx.put({ ...r, rowId: value || undefined }) })
	}
	// "New server room…" / "New row…": the name is typed in a box under the field (not the status bar, User 2026-10-12)
	let naming = $state<'room' | 'row' | null>(null)
	$effect(() => { void ws.selection; untrack(() => { naming = null }) })   // another selection: the box goes
	function named(name: string) {
		const kind = naming, rs = racks
		naming = null
		if (!rs.length) return
		if (kind === 'room') {
			const room = newServerRoom(project.index, rs[0].levelId, name)
			const out = racksToRoom(project.index, rs, room.id)
			project.store.transact(`New room ${room.name}`, (tx) => { tx.put(room); for (const e of out) tx.put(e) })
		} else if (kind === 'row') {
			const row: RackRow = { type: 'rackRow', id: newId(), spaceId: rs[0].spaceId, name, order: rowsIn(rs[0].spaceId).length }
			project.store.transact(`New row ${row.name}`, (tx) => { tx.put(row); for (const r of rs) tx.put({ ...r, rowId: row.id }) })
		}
	}
	/** Racks to another level: devices, links and cords go with them; they come off that level's plan. */
	function moveToLevel(levelId: string) {
		const out = moveRacksToLevel(project.index, racks, levelId)
		if (!out.length) return
		project.store.transact(`${racks.length > 1 ? `${racks.length} racks` : racks[0].name} → ${project.index.nameOf(levelId)}`, (tx) => { for (const e of out) tx.put(e) })
		ws.say(`Moved to ${project.index.nameOf(levelId)} — open that level and use Place in the racks list to put them on its plan`)
	}
	/** `…/cad?rack=<id>`: opens the rack's room in the rack view, zoomed to the rack (CadShell). */
	function copyLink(r: Rack) {
		const url = new URL(location.pathname, location.origin)
		url.searchParams.set('rack', r.id)
		navigator.clipboard.writeText(url.toString()).then(() => ws.say(`Link to ${r.name} copied`), () => ws.say(url.toString()))
	}
	const color = $derived(rk((r) => r.color))
</script>

{#snippet nameBox(kind: 'room' | 'row')}
	{#if naming === kind && racks[0]}
		<div class="row"><span class="muted">{kind === 'room' ? 'New server room' : 'New row'}</span>
			<NameInput wide create value={kind === 'room' ? nextRoomName(project.index, racks[0].levelId) : nextRowName(rowsIn(racks[0].spaceId).map((w) => w.name))} placeholder="Its name"
				title="Enter: add it · Esc: cancel" onsave={named} oncancel={() => (naming = null)} /></div>
	{/if}
{/snippet}

<PropGroup kind="rack" title="General">
	{#if one}<TextField label="Name" value={one.name} onchange={(v) => v && set('Rename rack', { name: v })} />{/if}
	<SelectField label="Kind" value={rk((r) => r.kind).value} mixed={rk((r) => r.kind).mixed} options={RACK_KINDS} onchange={(v) => set('Rack kind', { kind: v as Rack['kind'] })} />
	<LayerPick {project} ids={racks.map((r) => r.id)} />
	<div class="acts ind">
		<!-- Renumber (User 2026-10-16): the Renumber tool, the selected racks as its first picks -->
		{#if ws.toolId !== 'renumber'}<button class="btn" title="The Renumber tool: the selected racks are the first picks — click the next ones in order, set start / step, then Renumber" onclick={() => ws.startRenumber()}>Renumber</button>{/if}
		{#if one}<button class="btn" title="A link that opens this rack's room in the rack view, zoomed to this rack (?rack=)" onclick={() => copyLink(one)}>Copy link</button>{/if}
	</div>
</PropGroup>
<PropGroup kind="rack" title="Position and size">
	{#if one?.at}
		{@const at = one.at}
		<NumberField label="X" unit="mm" value={Math.round(at.x)} onchange={(v) => v != null && set('Move rack', { at: { ...at, x: v } })} />
		<NumberField label="Y" unit="mm" value={Math.round(at.y)} onchange={(v) => v != null && set('Move rack', { at: { ...at, y: v } })} />
	{/if}
	<NumberField label="Height" unit="U" min={1} value={rk((r) => r.heightU).value} mixed={rk((r) => r.heightU).mixed} onchange={(v) => v != null && v >= 1 && set('Rack height', { heightU: v })} />
	<NumberField label="Width" unit="mm" min={100} value={rk((r) => r.widthMm).value} mixed={rk((r) => r.widthMm).mixed} onchange={(v) => setSize('Rack width', { widthMm: v })} />
	<NumberField label="Depth" unit="mm" min={100} value={rk((r) => r.depthMm).value} mixed={rk((r) => r.depthMm).mixed} onchange={(v) => setSize('Rack depth', { depthMm: v })} />
	<NumberField label="Height" unit="mm" blank title="Its height in mm; blank = worked out from its U" placeholder={one ? `from U: ${Math.round(one.heightU * 44.45 + 150)}` : 'from U'}
		value={rk((r) => r.heightMm).value} mixed={rk((r) => r.heightMm).mixed} onchange={(v) => setSize('Rack height', { heightMm: v })} />
	<NumberField label="Rotation" unit="°" title="Not rotated (0), its front faces the +y side; turned clockwise" value={rk((r) => r.rot ?? 0).value} mixed={rk((r) => r.rot ?? 0).mixed} onchange={(v) => v != null && set(racks.length > 1 ? 'Rotate racks' : 'Rotate rack', { rot: v })} />
	{#if one?.at}
		<div class="acts ind">
			<button class="btn" title="Turn 90° anticlockwise" onclick={() => set('Rotate rack', { rot: ((one.rot ?? 0) + 270) % 360 })}>⟲ 90°</button>
			<button class="btn" title="Turn 90° clockwise" onclick={() => set('Rotate rack', { rot: ((one.rot ?? 0) + 90) % 360 })}>⟳ 90°</button>
			<button class="btn" title="Take it off the plan (it stays in the project)" onclick={() => set('Unplace rack', { at: undefined })}>Unplace</button>
		</div>
	{:else if one}
		<div class="acts ind"><button class="btn" onclick={() => ws.placeRack(one.id)}>Place on plan</button></div>
	{/if}
</PropGroup>
<PropGroup kind="rack" title="Room, row, level">
	<SelectField label="Room" value={sameRoom.value} mixed={sameRoom.mixed} options={rooms.map((s) => [s.id, s.name] as const)} onchange={setRoom}
		disabled={!oneLevel} title={oneLevel ? undefined : 'These racks are on different levels — move them one level at a time'}>
		{#snippet extra()}<option value={NEW_ROOM}>New server room…</option>{/snippet}
	</SelectField>
	{@render nameBox('room')}
	{#if !sameRoom.mixed && sameRoom.value}
		<!-- the room's own settings (floor, ceiling, rows) are on the room: this selects it -->
		{@const room = project.index.get(sameRoom.value)}
		{#if room?.type === 'space'}<div class="acts ind"><button class="lnk" title="Select the room: its floor and ceiling, rows and summary" onclick={() => ws.select([room.id])}>Room {room.name} ›</button></div>{/if}
	{/if}
	{#if !sameRoom.mixed && racks[0]}
		<!-- racks drawn on the plan, then put in a row together (User: no row builder) -->
		<SelectField label="Row" value={sameRow.value ?? ''} mixed={sameRow.mixed} options={[['', '—'], ...rowsIn(racks[0].spaceId).map((row) => [row.id, row.name] as const)]} onchange={setRow}>
			{#snippet extra()}<option value={NEW_ROW}>New row…</option>{/snippet}
		</SelectField>
		{@render nameBox('row')}
		{#if sameRow.value}<RowProps {project} {ws} rowId={sameRow.value} />{/if}
	{/if}
	<CheckField label="Patch frame" text="takes outlets" title="Outlets are allocated to the panels of the room's patch frames (left to right). With none marked, every rack's panels take outlets."
		checked={racks.every((r) => r.patchFrame)} mixed={racks.some((r) => r.patchFrame) && !racks.every((r) => r.patchFrame)}
		onchange={(on) => set(on ? (racks.length > 1 ? 'Patch frames' : 'Patch frame') : (racks.length > 1 ? 'Not patch frames' : 'Not a patch frame'), { patchFrame: on || undefined })} />
	<RackDoors {project} {racks} />
	<SelectField label="Level" title="Move the rack (with its devices) to another level — it comes off the plan there" value={rk((r) => r.levelId).value} mixed={rk((r) => r.levelId).mixed}
		options={project.levels.map((l) => [l.id, l.name] as const)} onchange={moveToLevel} />
</PropGroup>
<PropGroup kind="rack" title="Product and notes">
	<TextField label="Maker" value={rk((r) => r.maker).value} mixed={rk((r) => r.maker).mixed} onchange={(v) => set('Rack maker', { maker: v || undefined })} />
	<TextField label="Model" value={rk((r) => r.model).value} mixed={rk((r) => r.model).mixed} onchange={(v) => set('Rack model', { model: v || undefined })} />
	<TextField label="Product" mono title="The catalogue product (SKU) — the rack BOM adds its accessories" value={rk((r) => r.catalogId).value} mixed={rk((r) => r.catalogId).mixed} onchange={(v) => set('Rack product', { catalogId: v || undefined })} />
	<!-- its spec sheet: typed, else its catalogue product's -->
	<TextField label="Spec sheet" title="A link to the product's data sheet (https://…); blank = its catalogue product's" value={rk((r) => r.productUrl).value} mixed={rk((r) => r.productUrl).mixed} onchange={(v) => set('Rack spec sheet', { productUrl: v?.trim() || undefined })} />
	{#if one}
		{@const url = one.productUrl ?? seed.find((p) => p.id === one.catalogId || p.sku === one.catalogId)?.productUrl}
		{#if url}<p class="muted"><a class="text-blue-600 underline" href={url} target="_blank" rel="noopener noreferrer">Open the spec sheet ↗</a></p>{/if}
	{/if}
	<Field label="Color">{#snippet children()}<ColorPick value={color.value} mixed={color.mixed} allowByLayer onchange={(v) => set('Rack color', { color: v })} />{/snippet}</Field>
	<TextField label="Notes" rows={one ? 2 : 0} value={rk((r) => r.notes).value} mixed={rk((r) => r.notes).mixed} onchange={(v) => set('Rack notes', { notes: v || undefined })} />
	<p class="muted">{deviceCounts(racks.flatMap((r) => project.index.devicesIn(r.id)))}{racks.length > 1 ? ` in ${racks.length} racks` : ''}</p>
</PropGroup>

<style>
	.lnk { color: var(--cad-link, #2563eb); }
	.lnk:hover { text-decoration: underline; }
</style>
