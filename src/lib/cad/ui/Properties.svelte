<!-- Properties of the selection. One edit = one undo step. Fields per entity type; more types arrive with their
     tools (field descriptors per type replace this in a later slice — analysis §6.7). -->
<script lang="ts">
	import type { CadProject } from '../app/project.svelte'
	import type { Workspace } from '../app/workspace.svelte'
	import type { Entity } from '../domain/drawing'
	import type { Outlet, Rack } from '../domain/types'
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
</script>

<div class="space-y-3 p-3 text-xs">
	{#if !items.length}
		<p class="text-zinc-400">Nothing selected.</p>
	{:else if !one}
		<p class="font-semibold">{items.length} items selected</p>
	{:else if one.type === 'outlet'}
		{@const o = one}
		<p class="font-semibold">Outlet</p>
		<label class="row">Label <input class="inp font-mono" value={o.label} onchange={(e) => put(o, 'Label', { label: e.currentTarget.value })} /></label>
		<label class="row">Tier
			<select class="inp" value={o.tier} onchange={(e) => put(o, 'Tier', { tier: e.currentTarget.value as Outlet['tier'] })}><option value="low">Low</option><option value="high">High</option></select>
		</label>
		<label class="row">Mount
			<select class="inp" value={o.mount} onchange={(e) => put(o, 'Mount', { mount: e.currentTarget.value as Outlet['mount'] })}>
				{#each ['floor', 'wall', 'box', 'desk', 'ceiling'] as m (m)}<option value={m}>{m}</option>{/each}
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
				<input class="inp font-mono" value={p.label} onchange={(e) => setPort(o, i, { label: e.currentTarget.value })} />
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
		<p class="text-zinc-500">{project.index.devicesIn(r.id).length} devices · front faces the +y side when not rotated</p>
	{:else if one.type === 'shape' && one.geom.kind === 'path'}
		<PathProps {project} {ws} s={one} />
	{:else if one.type === 'shape'}
		<p class="font-semibold">{one.role?.kind ?? one.geom.kind}</p>
		<label class="row">Label <input class="inp" value={one.label ?? ''} onchange={(e) => put(one, 'Label', { label: e.currentTarget.value || undefined })} /></label>
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
