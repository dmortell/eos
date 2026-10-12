<!-- Outlet properties: one outlet (label, tier, usage, mount, symbol, height, position, ports + their server rooms,
     circuits), or the fields several selected outlets share ("mixed" when they differ; an edit sets all). One edit =
     one undo step. -->
<script lang="ts">
	import { sortedUsages } from '../domain/usages'
	import { sortedCableTypes } from '../domain/cableTypes'
	import type { CadProject } from '../app/project.svelte'
	import type { Workspace } from '../app/workspace.svelte'
	import type { Outlet, Space } from '../domain/types'
	import { naturalCompare, portsFromLabel } from '../domain/labels'
	import { newId } from '../domain/ids'
	import { setPortLabel, renameOutlet, setPortCount } from '../domain/ports'
	import { traceCircuit } from '../domain/cords'
	import { defaultOutletBlock } from '../domain/blocks'
	import Trace from './Trace.svelte'
	import PropGroup from './PropGroup.svelte'
	import UsageButtons from './UsageButtons.svelte'
	import NameInput from './NameInput.svelte'
	import { outletZ } from '../domain/routing'
	import LayerPick from './LayerPick.svelte'
	import { shared, MIXED, num } from './propsKit'

	let { project, ws, outlets }: { project: CadProject; ws: Workspace; outlets: Outlet[] } = $props()

	const serverRooms = $derived(project.index.spaces.filter((s) => s.kind === 'server room'))
	const usages = $derived(sortedUsages(project.settings))
	const outletBlocks = $derived([...project.blocks.values()].filter((b) => (b.category === 'outlet' || !b.builtin) && !b.retired))
	const MOUNTS: Outlet['mount'][] = ['floor', 'wall', 'box', 'desk', 'ceiling']

	const put = (o: Outlet, label: string, patch: Partial<Outlet>) => project.store.transact(label, (tx) => tx.put({ ...o, ...patch }))
	function setPort(o: Outlet, i: number, patch: Partial<Outlet['ports'][number]>) {
		put(o, `Port ${o.ports[i].label}`, { ports: o.ports.map((p, j) => (j === i ? { ...p, ...patch } : p)) })
	}
	/** The value they all share, or `mixedAs` when they differ. */
	const pick = <V,>(get: (o: Outlet) => V, mixedAs: V): V => { const sh = shared(outlets, get); return sh.mixed ? mixedAs : (sh.value as V) }
	const isMixed = <V,>(get: (o: Outlet) => V) => shared(outlets, get).mixed
	const cableTypes = $derived(sortedCableTypes(project.settings))
	/** The cable every port of the outlet takes (undefined: its ports differ). */
	const cableOf = (o: Outlet): string | undefined => { const t = o.ports[0]?.cableType; return o.ports.every((p) => p.cableType === t) ? t : undefined }
	function setOutlets(label: string, patch: (o: Outlet) => Partial<Outlet>) {
		project.store.transact(`${label} (${outlets.length} outlets)`, (tx) => { for (const o of outlets) tx.put({ ...o, ...patch(o) }) })
	}

	/** Rename an outlet (its ports follow); asks first if a printed panel would change. */
	function renameIt(o: Outlet, input: HTMLInputElement) {
		const next = input.value.trim()
		input.value = o.label
		if (next && next !== o.label) project.relabel(`Rename ${o.label} → ${next}`, [renameOutlet(o, next)], ws.ask2)
	}

	/** More / fewer ports, on one outlet or several. Fewer drops the removed ports' links — asked first when there are any. */
	function portCount(list: Outlet[], input: HTMLInputElement) {
		const n = Number(input.value)
		input.value = String(list.every((o) => o.ports.length === list[0].ports.length) ? list[0].ports.length : '')
		if (!Number.isFinite(n) || n < 1) return
		const style = { style: project.settings?.portSuffix ?? 'alpha', sep: project.settings?.portSeparator ?? '.' }
		const rs = list.filter((o) => o.ports.length !== n).map((o) => setPortCount(project.index, o, n, project.settings?.defaults.outletCableType, style))
		if (!rs.length) return
		const drops = rs.flatMap((r) => r.dropLinks), name = rs.length === 1 ? rs[0].outlet.label : `${rs.length} outlets`
		const apply = () => project.store.transact(`${name}: ${n} ports`, (tx) => { for (const id of drops) tx.del(id); for (const r of rs) tx.put(r.outlet) })
		if (drops.length) ws.ask2(`${name}: the removed port(s) are allocated — ${drops.length} link(s) to panels will be removed.`, 'Remove ports', apply)
		else apply()
	}

	/** The rooms (numbered office rooms, not server rooms / zones) on the outlets' level; "+" makes a new one. */
	const rooms = $derived(project.index.spaces.filter((s) => s.kind === 'room' && s.levelId === outlets[0]?.levelId).sort((a, b) => naturalCompare(a.name, b.name)))
	function setRoom(value: string, select: HTMLSelectElement) {
		if (value !== '+') { setOutlets('Room', () => ({ roomId: value || undefined })); return }
		select.value = pick((o) => o.roomId ?? '', '?')
		newRoom = true   // its name in a box under the field (not the status bar)
	}
	let newRoom = $state(false)

	/** The zones of the outlets' level (backlog "Zones and server rooms when placing outlets"); "+" makes a new one. */
	const zones = $derived(project.index.spaces.filter((s) => s.kind === 'zone' && s.levelId === outlets[0]?.levelId).sort((a, b) => naturalCompare(a.name, b.name)))
	let newZone = $state(false)
	function setZone(value: string, select: HTMLSelectElement) {
		if (value !== '+') { setOutlets('Zone', () => ({ zoneId: value || undefined })); return }
		select.value = pick((o) => o.zoneId ?? '', '?')
		newZone = true
	}
	function addZone(name: string) {
		newZone = false
		const levelId = outlets[0]?.levelId
		if (!levelId) return
		const zone: Space = { type: 'space', id: newId(), levelId, kind: 'zone', name, code: name.replace(/^zone\s*/i, '') || name, order: zones.length }
		project.store.transact(`Zone ${name} (${outlets.length} outlet${outlets.length === 1 ? '' : 's'})`, (tx) => { tx.put(zone); for (const o of outlets) tx.put({ ...o, zoneId: zone.id }) })
	}
	function addRoom(name: string) {
		newRoom = false
		const levelId = outlets[0]?.levelId
		if (!levelId) return
		const room: Space = { type: 'space', id: newId(), levelId, kind: 'room', name, code: name, order: rooms.length }
		project.store.transact(`Room ${name} (${outlets.length} outlet${outlets.length === 1 ? '' : 's'})`, (tx) => { tx.put(room); for (const o of outlets) tx.put({ ...o, roomId: room.id }) })
	}

	/** Outlets whose port labels don't carry their own label (Dave: Journey 245 kept ports 056.A after a renumber): made
	 *  again from the label. */
	const portFix = $derived(outlets.map((o) => portsFromLabel(o, project.settings?.portSuffix ?? 'alpha', project.settings?.portSeparator ?? '.')).filter((o): o is Outlet => !!o))
	const fixPorts = () => project.relabel(`Ports from label (${portFix.length} outlet${portFix.length === 1 ? '' : 's'})`, portFix, ws.ask2)
</script>

{#if portFix.length}
	{@const o = outlets.find((x) => x.id === portFix[0].id)}
	<p class="warn" title="A panel port linked to one of these shows the port's label — it doesn't match the outlet">
		{portFix.length === 1 ? 'Its' : `${portFix.length} outlets'`} port labels don't match {portFix.length === 1 ? 'its label' : 'their labels'} ({o?.label}: {o?.ports[0]?.label} …)
		<button class="wbtn" title="Label those ports from the outlet's label again (e.g. 245.A, 245.B) — ports that contain the label are left alone; Undo puts them back" onclick={fixPorts}>Ports from label</button>
	</p>
{/if}
{#if outlets.length > 1}
	<!-- the same groups and order as one outlet's; a field shows what they share or "mixed", an edit sets them all -->
	<PropGroup kind="outlet" title="General">
		<!-- "—" clears it (Dave: most outlets don't need their usage shown) — it then draws nothing under the symbol -->
		<div class="row">Usage
			<UsageButtons {usages} value={pick((o) => o.usage ?? '', undefined)} mixed={isMixed((o) => o.usage ?? '')} onpick={(id) => setOutlets('Usage', () => ({ usage: id }))} />
		</div>
		<label class="row">Tier
			<select class="inp" value={pick((o) => o.tier, '')} onchange={(e) => setOutlets('Tier', () => ({ tier: e.currentTarget.value as Outlet['tier'] }))}>
				{#if isMixed((o) => o.tier)}<option value="">{MIXED}</option>{/if}<option value="low">Low</option><option value="high">High</option>
			</select>
		</label>
		<label class="row">Mount
			<select class="inp" value={pick((o) => o.mount, '' as Outlet['mount'])} onchange={(e) => setOutlets('Mount', () => ({ mount: e.currentTarget.value as Outlet['mount'] }))}>
				{#if isMixed((o) => o.mount)}<option value="">{MIXED}</option>{/if}
				{#each MOUNTS as m (m)}<option value={m}>{m}</option>{/each}
			</select>
		</label>
		<!-- the cable its ports take (backlog "Cable type per outlet"): one pick sets every port -->
		<label class="row">Cable
			<select class="inp" value={pick((o) => cableOf(o) ?? '?', '?')} onchange={(e) => { const t = e.currentTarget.value; setOutlets('Cable type', (o) => ({ ports: o.ports.map((p) => ({ ...p, cableType: t })) })) }}>
				{#if pick((o) => cableOf(o) ?? '?', '?') === '?'}<option value="?" disabled>{MIXED}</option>{/if}
				{#each cableTypes as t (t.id)}<option value={t.id}>{t.label}</option>{/each}
			</select>
		</label>
		<LayerPick {project} ids={outlets.map((o) => o.id)} />
	</PropGroup>
	<PropGroup kind="outlet" title="Position">
		<label class="row" title="Height above the floor (FFL); blank = the default for each one's mount">Z (mm) <input class="inp" type="number" value={pick((o) => o.z, undefined) ?? ''} placeholder={isMixed((o) => o.z) ? MIXED : 'mount default'} onchange={(e) => { const z = num(e.currentTarget.value); if (z !== null) setOutlets('Height', () => ({ z })) }} /></label>
		<label class="row" title="Show them in elevations and sections too (on a wall); otherwise only on the plan">Elevations
			<span><input type="checkbox" checked={outlets.every((o) => o.inElevations)} indeterminate={outlets.some((o) => o.inElevations) && !outlets.every((o) => o.inElevations)}
				onchange={(e) => { const on = e.currentTarget.checked; setOutlets(on ? 'Show in elevations' : 'Plan only', () => ({ inElevations: on || undefined })) }} /> show in elevations</span>
		</label>
		{@render roomField()}
		{@render zoneField()}
	</PropGroup>
	<PropGroup kind="outlet" title="Ports">
		<label class="row">Ports <input class="inp" type="number" min="1" max="48" value={pick((o) => o.ports.length, undefined) ?? ''} placeholder={isMixed((o) => o.ports.length) ? MIXED : ''} onchange={(e) => portCount(outlets, e.currentTarget)} /></label>
		<label class="row">Server room
			<select class="inp" value={pick((o) => (o.ports.every((p) => p.serverRoomId === o.ports[0]?.serverRoomId) ? o.ports[0]?.serverRoomId ?? '' : '?'), '?')}
				onchange={(e) => { const id = e.currentTarget.value || undefined; setOutlets('Server room', (o) => ({ ports: o.ports.map((p) => ({ ...p, serverRoomId: id })) })) }}>
				<option value="?" disabled>{MIXED}</option><option value="">—</option>
				{#each serverRooms as s (s.id)}<option value={s.id}>{s.name}</option>{/each}
			</select>
		</label>
	</PropGroup>
{:else if outlets.length === 1}
	{@const o = outlets[0]}
	{@const lv = project.index.get(o.levelId)}
	<!-- groups (UX review "Outlet Properties still flat"): General (with its layer) · Position · Ports · Circuit -->
	<PropGroup kind="outlet" title="General">
		<label class="row">Label <input class="inp font-mono" value={o.label} onchange={(e) => renameIt(o, e.currentTarget)} /></label>
		<div class="row">Usage <UsageButtons {usages} value={o.usage} onpick={(id) => id !== (o.usage ?? '') && put(o, 'Usage', { usage: id })} /></div>
		<label class="row">Tier
			<select class="inp" value={o.tier} onchange={(e) => put(o, 'Tier', { tier: e.currentTarget.value as Outlet['tier'] })}><option value="low">Low</option><option value="high">High</option></select>
		</label>
		<label class="row">Mount
			<select class="inp" value={o.mount} onchange={(e) => put(o, 'Mount', { mount: e.currentTarget.value as Outlet['mount'] })}>
				{#each MOUNTS as m (m)}<option value={m}>{m}</option>{/each}
			</select>
		</label>
		<label class="row">Cable
			<select class="inp" value={cableOf(o) ?? '?'} onchange={(e) => { const t = e.currentTarget.value; put(o, 'Cable type', { ports: o.ports.map((p) => ({ ...p, cableType: t })) }) }}>
				{#if !cableOf(o)}<option value="?" disabled>{MIXED}</option>{/if}
				{#each cableTypes as t (t.id)}<option value={t.id}>{t.label}</option>{/each}
				{#if cableOf(o) && !cableTypes.some((t) => t.id === cableOf(o))}<option value={cableOf(o)}>{cableOf(o)}</option>{/if}
			</select>
		</label>
		<label class="row">Symbol
			<select class="inp" value={o.blockId ?? ''} onchange={(e) => put(o, 'Symbol', { blockId: e.currentTarget.value || undefined })}>
				<option value="">Auto: {project.blockOf(defaultOutletBlock(o))?.name ?? 'by usage/mount'}</option>
				{#each outletBlocks as b (b.id)}<option value={b.id}>{b.name}</option>{/each}
				{#if o.blockId && project.blockOf(o.blockId)?.retired}<option value={o.blockId}>{project.blockOf(o.blockId)?.name} (retired)</option>{/if}
			</select>
		</label>
		<LayerPick {project} ids={[o.id]} />
	</PropGroup>
	<PropGroup kind="outlet" title="Position">
		<!-- a blank height shows the default it uses (a floor box 0, a wall outlet 300, a ceiling one the ceiling) -->
		<label class="row" title="Height above the floor (FFL); blank = the default for its mount">Z (mm) <input class="inp" type="number" value={o.z ?? ''} placeholder="{outletZ({ ...o, z: undefined }, lv?.type === 'level' ? lv : undefined)} — {o.mount} default" onchange={(e) => { const z = num(e.currentTarget.value); if (z !== null) put(o, 'Height', { z }) }} /></label>
		<label class="row" title="Show it in elevations and sections too (on a wall); otherwise only on the plan">Elevations
			<span><input type="checkbox" checked={!!o.inElevations} onchange={(e) => put(o, e.currentTarget.checked ? 'Show in elevations' : 'Plan only', { inElevations: e.currentTarget.checked || undefined })} /> show in elevations</span></label>
		{#if o.at}
			<label class="row">X <input class="inp" type="number" value={Math.round(o.at.x)} onchange={(e) => put(o, 'Move', { at: { ...o.at!, x: Number(e.currentTarget.value) } })} /></label>
			<label class="row">Y <input class="inp" type="number" value={Math.round(o.at.y)} onchange={(e) => put(o, 'Move', { at: { ...o.at!, y: Number(e.currentTarget.value) } })} /></label>
		{/if}
		{@render roomField()}
		{@render zoneField()}
	</PropGroup>
	<PropGroup kind="outlet" title="Ports">
		<label class="row">Ports <input class="inp" type="number" min="1" max="48" value={o.ports.length} onchange={(e) => portCount([o], e.currentTarget)} /></label>
		{#each o.ports as p, i (p.port)}
			<div class="grid grid-cols-[1.5rem_1fr_6rem] items-center gap-1">
				<span class="text-zinc-400">{p.port}</span>
				<input class="inp font-mono" value={p.label} onchange={(e) => { const t = e.currentTarget.value; e.currentTarget.value = p.label; const n = setPortLabel(project.index, { on: o.id, port: p.port }, t); if (n) project.relabel(`Port ${p.label}`, [n], ws.ask2) }} />
				<select class="inp" value={p.serverRoomId ?? ''} title="Its server room" onchange={(e) => setPort(o, i, { serverRoomId: e.currentTarget.value || undefined })}>
					<option value="">—</option>
					{#each serverRooms as s (s.id)}<option value={s.id}>{s.name}</option>{/each}
				</select>
			</div>
		{/each}
	</PropGroup>
	{@const traced = o.ports.map((p) => traceCircuit(project.index, { on: o.id, port: p.port })).filter((st) => st.length > 1)}
	{#if traced.length}
		<PropGroup kind="outlet" title="Circuit">
			{#each traced as steps, k (k)}<Trace {project} {steps} />{/each}
		</PropGroup>
	{/if}
{/if}

{#snippet roomField()}
	<label class="row" title="The room it's in (a numbered office room — not its server room)">Room
		<select class="inp" value={pick((o) => o.roomId ?? '', '?')} onchange={(e) => setRoom(e.currentTarget.value, e.currentTarget)}>
			<option value="?" disabled>{MIXED}</option><option value="">—</option>
			{#each rooms as r (r.id)}<option value={r.id}>{r.name}</option>{/each}
			<option value="+">New room…</option>
		</select>
	</label>
	{#if newRoom}<div class="row"><span class="text-zinc-500">New room</span><NameInput wide placeholder="Its number or name — Enter adds it" onsave={addRoom} oncancel={() => (newRoom = false)} /></div>{/if}
{/snippet}

{#snippet zoneField()}
	<label class="row" title="The zone of the floor it's in (the Z of its port labels in the Frames format) — the next outlets placed take it too">Zone
		<select class="inp" value={pick((o) => o.zoneId ?? '', '?')} onchange={(e) => setZone(e.currentTarget.value, e.currentTarget)}>
			<option value="?" disabled>{MIXED}</option><option value="">—</option>
			{#each zones as z (z.id)}<option value={z.id}>{z.name}</option>{/each}
			<option value="+">New zone…</option>
		</select>
	</label>
	{#if newZone}<div class="row"><span class="text-zinc-500">New zone</span><NameInput wide placeholder="Its name or code — Enter adds it" onsave={addZone} oncancel={() => (newZone = false)} /></div>{/if}
{/snippet}

<style>
	.warn { margin: 2px 0 6px; padding: 3px 6px; border-radius: 4px; font-size: 11px; color: #92400e; background: #fef3c7; }
	.wbtn { margin-left: 4px; border: 1px solid #d97706; border-radius: 4px; padding: 0 6px; background: white; color: #92400e; }
	.wbtn:hover { background: #fffbeb; }
</style>
