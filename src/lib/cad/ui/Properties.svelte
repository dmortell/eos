<!-- Properties of the selection. One edit = one undo step. Fields per entity type; more types arrive with their
     tools (field descriptors per type replace this in a later slice — analysis §6.7). -->
<script lang="ts">
	import type { CadProject } from '../app/project.svelte'
	import type { Workspace } from '../app/workspace.svelte'
	import type { Entity } from '../domain/drawing'
	import type { Id, Outlet, Rack, RackRow, Device } from '../domain/types'
	import { placementProblem } from '../domain/devices'
	import { setPortLabel, renameOutlet, markPrinted, changedSincePrinted, portRanges } from '../domain/ports'
	import PortProps from './PortProps.svelte'
	import { newId } from '../domain/ids'
	import type { Shape } from '../domain/shapes'
	import { defaultOutletBlock } from '../domain/blocks'
	import PathProps from './PathProps.svelte'

	let { project, ws }: { project: CadProject; ws: Workspace } = $props()

	const items = $derived(ws.selection.map((id) => project.index.get(id)).filter((e): e is Entity => !!e))
	const one = $derived(items.length === 1 ? items[0] : undefined)
	const serverRooms = $derived(project.index.spaces.filter((s) => s.kind === 'server room'))

	const put = <T extends Entity>(e: T, label: string, patch: Partial<T>) => project.store.transact(label, (tx) => tx.put({ ...e, ...patch }))
	const num = (v: string) => (v.trim() === '' ? undefined : Number(v))

	function setPort(o: Outlet, i: number, patch: Partial<Outlet['ports'][number]>) {
		put(o, `Port ${o.ports[i].label}`, { ports: o.ports.map((p, j) => (j === i ? { ...p, ...patch } : p)) })
	}

	const outletBlocks = $derived([...project.blocks.values()].filter((b) => b.category === 'outlet' || !b.builtin))
	/** Drawn shapes in the selection (not inserts) — what "Make block" can take. */
	const blockable = $derived(items.filter((e): e is Shape => e.type === 'shape' && e.geom.kind !== 'insert' && !!e.levelId))
	let busy = $state(false)

	// ── racks → rows ──
	const NEW_ROW = '__new'
	const racks = $derived(items.filter((e): e is Rack => e.type === 'rack'))
	const sameRoom = $derived(racks.every((r) => r.spaceId === racks[0]?.spaceId))
	const sameRow = $derived(racks.every((r) => r.rowId === racks[0]?.rowId) ? racks[0]?.rowId : undefined)
	// via the index (reactive); rows are few, so a scan is fine
	const rowsIn = (spaceId: Id) => [...project.index.byId.values()].filter((e): e is RackRow => e.type === 'rackRow' && e.spaceId === spaceId).sort((a, b) => a.order - b.order)
	function setRow(rs: Rack[], value: string) {
		if (value !== NEW_ROW) { project.store.transact('Rack row', (tx) => { for (const r of rs) tx.put({ ...r, rowId: value || undefined }) }); return }
		const existing = rowsIn(rs[0].spaceId)
		ws.askText('Row name', `Row ${existing.length + 1}`, (name) => {
			if (!name.trim()) return
			const row: RackRow = { type: 'rackRow', id: newId(), spaceId: rs[0].spaceId, name: name.trim(), order: existing.length }
			project.store.transact(`New row ${row.name}`, (tx) => { tx.put(row); for (const r of rs) tx.put({ ...r, rowId: row.id }) })
		})
	}

	/** Rename an outlet (its ports follow); asks first if a printed panel would change. */
	function renameIt(o: Outlet, input: HTMLInputElement) {
		const next = input.value.trim()
		input.value = o.label
		if (next && next !== o.label) project.relabel(`Rename ${o.label} → ${next}`, [renameOutlet(o, next)], ws.ask2)
	}

	/** Rack sizes: a rack that would collide on the plan is still allowed (it's a drawing), but sizes must be real. */
	function putSize(r: Rack, label: string, patch: Partial<Rack>) {
		const v = Object.values(patch)[0]
		if (v !== undefined && (!Number.isFinite(v) || (v as number) < 100)) { ws.say('Sizes are in mm (100 or more)'); return }
		put(r, label, patch)
	}

	// ── devices ──
	const KINDS: Device['kind'][] = ['panel', 'switch', 'manager', 'server', 'shelf', 'pdu', 'other']
	/** A device edit that would overlap another or run off the rack is refused, with the reason. */
	function putDevice(d: Device, label: string, patch: Partial<Device>) {
		const next = { ...d, ...patch }, rack = project.index.get(d.rackId)
		const problem = rack?.type === 'rack' ? placementProblem(next, rack, project.index.devices) : null
		if (problem) { ws.say(problem); return }
		put(d, label, patch)
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

<div class="space-y-3 p-3 text-xs">
	{#if !items.length}
		<p class="text-zinc-400">Nothing selected.</p>
	{:else if !one}
		<p class="font-semibold">{items.length} items selected</p>
		{#if racks.length > 1 && sameRoom}
			<!-- racks drawn on the plan, then put in a row together (Dave: no row builder) -->
			<label class="row">Row of {racks.length} racks
				<select class="inp" value={sameRow ?? ''} onchange={(e) => setRow(racks, e.currentTarget.value)}>
					<option value="">—</option>
					{#each rowsIn(racks[0].spaceId) as row (row.id)}<option value={row.id}>{row.name}</option>{/each}
					<option value={NEW_ROW}>New row…</option>
				</select>
			</label>
		{/if}
		{#if blockable.length}
			<button class="btn" disabled={busy} title="Turn the selected shapes into a global block and put one insert in their place" onclick={makeBlock}>Make block from {blockable.length} shapes…</button>
		{/if}
	{:else if one.type === 'outlet'}
		{@const o = one}
		<p class="font-semibold">Outlet</p>
		<label class="row">Label <input class="inp font-mono" value={o.label} onchange={(e) => renameIt(o, e.currentTarget)} /></label>
		<label class="row">Tier
			<select class="inp" value={o.tier} onchange={(e) => put(o, 'Tier', { tier: e.currentTarget.value as Outlet['tier'] })}><option value="low">Low</option><option value="high">High</option></select>
		</label>
		<label class="row">Mount
			<select class="inp" value={o.mount} onchange={(e) => put(o, 'Mount', { mount: e.currentTarget.value as Outlet['mount'] })}>
				{#each ['floor', 'wall', 'box', 'desk', 'ceiling'] as m (m)}<option value={m}>{m}</option>{/each}
			</select>
		</label>
		<label class="row">Symbol
			<select class="inp" value={o.blockId ?? ''} onchange={(e) => put(o, 'Symbol', { blockId: e.currentTarget.value || undefined })}>
				<option value="">Auto — {project.blockOf(defaultOutletBlock(o))?.name ?? 'by usage / mount'}</option>
				{#each outletBlocks as b (b.id)}<option value={b.id}>{b.name}</option>{/each}
			</select>
		</label>
		<label class="row">Height (Z, mm) <input class="inp" type="number" value={o.z ?? ''} onchange={(e) => put(o, 'Height', { z: num(e.currentTarget.value) })} /></label>
		{#if o.at}
			<label class="row">X <input class="inp" type="number" value={Math.round(o.at.x)} onchange={(e) => put(o, 'Move', { at: { ...o.at!, x: Number(e.currentTarget.value) } })} /></label>
			<label class="row">Y <input class="inp" type="number" value={Math.round(o.at.y)} onchange={(e) => put(o, 'Move', { at: { ...o.at!, y: Number(e.currentTarget.value) } })} /></label>
		{/if}
		<p class="pt-1 font-semibold">Ports</p>
		{#each o.ports as p, i (p.port)}
			<div class="grid grid-cols-[1.5rem_1fr_6rem] items-center gap-1">
				<span class="text-zinc-400">{p.port}</span>
				<input class="inp font-mono" value={p.label} onchange={(e) => { const t = e.currentTarget.value; e.currentTarget.value = p.label; const n = setPortLabel(project.index, { on: o.id, port: p.port }, t); if (n) project.relabel(`Port ${p.label}`, [n], ws.ask2) }} />
				<select class="inp" value={p.serverRoomId ?? ''} onchange={(e) => setPort(o, i, { serverRoomId: e.currentTarget.value || undefined })}>
					<option value="">—</option>
					{#each serverRooms as s (s.id)}<option value={s.id}>{s.name}</option>{/each}
				</select>
			</div>
		{/each}
	{:else if one.type === 'rack'}
		{@const r = one as Rack}
		<p class="font-semibold">Rack</p>
		<label class="row">Name <input class="inp" value={r.name} onchange={(e) => put(r, 'Rename rack', { name: e.currentTarget.value })} /></label>
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
		<label class="row">Row
			<select class="inp" value={r.rowId ?? ''} onchange={(e) => setRow([r], e.currentTarget.value)}>
				<option value="">—</option>
				{#each rowsIn(r.spaceId) as row (row.id)}<option value={row.id}>{row.name}</option>{/each}
				<option value={NEW_ROW}>New row…</option>
			</select>
		</label>
		<p class="text-zinc-500">{project.index.devicesIn(r.id).length} devices · front faces the +y side when not rotated</p>
	{:else if one.type === 'device'}
		{@const d = one as Device}
		{@const rack = project.index.get(d.rackId) as Rack | undefined}
		<p class="font-semibold">Device <span class="font-normal text-zinc-500">in {rack?.name ?? '?'}</span></p>
		<label class="row">Name <input class="inp" value={d.name} onchange={(e) => putDevice(d, 'Rename device', { name: e.currentTarget.value })} /></label>
		<label class="row">Kind
			<select class="inp" value={d.kind} onchange={(e) => putDevice(d, 'Device kind', { kind: e.currentTarget.value as Device['kind'] })}>
				{#each KINDS as k (k)}<option value={k}>{k}</option>{/each}
			</select>
		</label>
		<label class="row">U (bottom) <input class="inp" type="number" value={d.u} onchange={(e) => putDevice(d, 'Move device', { u: Number(e.currentTarget.value) })} /></label>
		<label class="row">Height (U) <input class="inp" type="number" min="1" value={d.heightU} onchange={(e) => putDevice(d, 'Device height', { heightU: Number(e.currentTarget.value) })} /></label>
		<label class="row">Face
			<select class="inp" value={d.face} onchange={(e) => putDevice(d, 'Device face', { face: e.currentTarget.value as Device['face'] })}>
				{#each ['front', 'rear', 'both', 'none'] as f (f)}<option value={f}>{f}</option>{/each}
			</select>
		</label>
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
		<button class="btn" disabled={busy} title="Save this device's size, ports and kind as a GLOBAL template (every project)" onclick={() => saveTemplate(d)}>Save as template…</button>
		{#if ws.portSel?.on === d.id}<PortProps {project} {ws} sel={ws.portSel} />{/if}
	{:else if one.type === 'shape' && one.geom.kind === 'path'}
		<PathProps {project} {ws} s={one} />
		<button class="btn" disabled={busy} onclick={makeBlock}>Make block…</button>
	{:else if one.type === 'shape' && one.geom.kind === 'insert'}
		{@const g = one.geom}
		{@const b = project.blockOf(g.blockId)}
		<p class="font-semibold">Block: {b?.name ?? 'missing block'}</p>
		<label class="row">Rotation <input class="inp" type="number" value={g.rot ?? 0} onchange={(e) => put(one, 'Rotate', { geom: { ...g, rot: Number(e.currentTarget.value) || undefined } })} /></label>
		<label class="row">Scale <input class="inp" type="number" step="0.1" value={g.scale ?? 1} onchange={(e) => put(one, 'Scale', { geom: { ...g, scale: Number(e.currentTarget.value) || undefined } })} /></label>
		{#if b}<button class="btn" title="Replace this insert with the block's shapes, to edit them freely" onclick={() => ws.select(project.explode(one.id))}>Explode</button>{/if}
	{:else if one.type === 'shape'}
		<p class="font-semibold">{one.role?.kind ?? one.geom.kind}</p>
		<label class="row">Label <input class="inp" value={one.label ?? ''} onchange={(e) => put(one, 'Label', { label: e.currentTarget.value || undefined })} /></label>
		{#if blockable.length}<button class="btn" disabled={busy} onclick={makeBlock}>Make block…</button>{/if}
	{:else}
		<p class="font-semibold">{one.type}</p>
	{/if}
</div>

<style>
	.row { display: grid; grid-template-columns: 6.5rem 1fr; align-items: center; gap: 0.25rem; }
	.inp { width: 100%; border: 1px solid #e4e4e7; border-radius: 4px; padding: 1px 4px; background: white; }
	.btn { border: 1px solid #d4d4d8; border-radius: 4px; padding: 0 6px; background: white; }
	.btn:hover { background: #f4f4f5; }
</style>
