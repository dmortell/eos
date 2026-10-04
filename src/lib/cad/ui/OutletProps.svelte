<!-- Outlet properties: one outlet (label, tier, usage, mount, symbol, height, position, ports + their server rooms,
     circuits), or the fields several selected outlets share ("mixed" when they differ; an edit sets all). One edit =
     one undo step. -->
<script lang="ts">
	import type { CadProject } from '../app/project.svelte'
	import type { Workspace } from '../app/workspace.svelte'
	import type { Outlet } from '../domain/types'
	import { setPortLabel, renameOutlet, setPortCount } from '../domain/ports'
	import { traceCircuit } from '../domain/cords'
	import { defaultOutletBlock } from '../domain/blocks'
	import Trace from './Trace.svelte'

	let { project, ws, outlets }: { project: CadProject; ws: Workspace; outlets: Outlet[] } = $props()

	const serverRooms = $derived(project.index.spaces.filter((s) => s.kind === 'server room'))
	const usages = $derived(project.settings?.usages ?? [])
	const outletBlocks = $derived([...project.blocks.values()].filter((b) => b.category === 'outlet' || !b.builtin))
	const MOUNTS: Outlet['mount'][] = ['floor', 'wall', 'box', 'desk', 'ceiling']

	const put = (o: Outlet, label: string, patch: Partial<Outlet>) => project.store.transact(label, (tx) => tx.put({ ...o, ...patch }))
	const num = (v: string) => (v.trim() === '' ? undefined : Number(v))
	function setPort(o: Outlet, i: number, patch: Partial<Outlet['ports'][number]>) {
		put(o, `Port ${o.ports[i].label}`, { ports: o.ports.map((p, j) => (j === i ? { ...p, ...patch } : p)) })
	}
	/** The value they all share, or undefined when it differs (shown as "mixed"). */
	function same<V>(get: (o: Outlet) => V): V | undefined {
		const v = outlets.length ? get(outlets[0]) : undefined
		return outlets.every((o) => get(o) === v) ? v : undefined
	}
	function setOutlets(label: string, patch: (o: Outlet) => Partial<Outlet>) {
		project.store.transact(`${label} (${outlets.length} outlets)`, (tx) => { for (const o of outlets) tx.put({ ...o, ...patch(o) }) })
	}

	/** Rename an outlet (its ports follow); asks first if a printed panel would change. */
	function renameIt(o: Outlet, input: HTMLInputElement) {
		const next = input.value.trim()
		input.value = o.label
		if (next && next !== o.label) project.relabel(`Rename ${o.label} → ${next}`, [renameOutlet(o, next)], ws.ask2)
	}

	/** More / fewer ports. Fewer drops the removed ports' links — asked first when there are any. */
	function portCount(o: Outlet, input: HTMLInputElement) {
		const n = Number(input.value)
		input.value = String(o.ports.length)
		if (!Number.isFinite(n) || n < 1 || n === o.ports.length) return
		const r = setPortCount(project.index, o, n, project.settings?.defaults.outletCableType, { style: project.settings?.portSuffix ?? 'alpha', sep: project.settings?.portSeparator ?? '.' })
		const apply = () => project.store.transact(`${o.label}: ${r.outlet.ports.length} ports`, (tx) => { for (const id of r.dropLinks) tx.del(id); tx.put(r.outlet) })
		if (r.dropLinks.length) ws.ask2(`${o.label}: the removed port(s) are allocated — ${r.dropLinks.length} link(s) to panels will be removed.`, 'Remove ports', apply)
		else apply()
	}
</script>

{#if outlets.length > 1}
	<p class="pt-1 font-semibold">{outlets.length} outlets</p>
	<label class="row">Tier
		<select class="inp" value={same((o) => o.tier) ?? ''} onchange={(e) => setOutlets('Tier', () => ({ tier: e.currentTarget.value as Outlet['tier'] }))}>
			{#if !same((o) => o.tier)}<option value="">mixed</option>{/if}<option value="low">Low</option><option value="high">High</option>
		</select>
	</label>
	<label class="row">Usage
		<select class="inp" value={same((o) => o.usage) ?? ''} onchange={(e) => setOutlets('Usage', () => ({ usage: e.currentTarget.value }))}>
			{#if !same((o) => o.usage)}<option value="">mixed</option>{/if}
			{#each usages as u (u.id)}<option value={u.id}>{u.label}</option>{/each}
		</select>
	</label>
	<label class="row">Mount
		<select class="inp" value={same((o) => o.mount) ?? ''} onchange={(e) => setOutlets('Mount', () => ({ mount: e.currentTarget.value as Outlet['mount'] }))}>
			{#if !same((o) => o.mount)}<option value="">mixed</option>{/if}
			{#each MOUNTS as m (m)}<option value={m}>{m}</option>{/each}
		</select>
	</label>
	<label class="row">Server room
		<select class="inp" value={same((o) => (o.ports.every((p) => p.serverRoomId === o.ports[0]?.serverRoomId) ? o.ports[0]?.serverRoomId ?? '' : '?')) ?? '?'}
			onchange={(e) => { const id = e.currentTarget.value || undefined; setOutlets('Server room', (o) => ({ ports: o.ports.map((p) => ({ ...p, serverRoomId: id })) })) }}>
			<option value="?" disabled>mixed</option><option value="">—</option>
			{#each serverRooms as s (s.id)}<option value={s.id}>{s.name}</option>{/each}
		</select>
	</label>
	<label class="row">Height (Z, mm) <input class="inp" type="number" value={same((o) => o.z) ?? ''} placeholder="mixed" onchange={(e) => setOutlets('Height', () => ({ z: num(e.currentTarget.value) }))} /></label>
{:else if outlets.length === 1}
	{@const o = outlets[0]}
	<p class="font-semibold">Outlet</p>
	<label class="row">Label <input class="inp font-mono" value={o.label} onchange={(e) => renameIt(o, e.currentTarget)} /></label>
	<label class="row">Tier
		<select class="inp" value={o.tier} onchange={(e) => put(o, 'Tier', { tier: e.currentTarget.value as Outlet['tier'] })}><option value="low">Low</option><option value="high">High</option></select>
	</label>
	<label class="row">Usage
		<select class="inp" value={o.usage} onchange={(e) => put(o, 'Usage', { usage: e.currentTarget.value })}>
			{#if !usages.some((u) => u.id === o.usage)}<option value={o.usage}>{o.usage || '—'}</option>{/if}
			{#each usages as u (u.id)}<option value={u.id}>{u.label}</option>{/each}
		</select>
	</label>
	<label class="row">Mount
		<select class="inp" value={o.mount} onchange={(e) => put(o, 'Mount', { mount: e.currentTarget.value as Outlet['mount'] })}>
			{#each MOUNTS as m (m)}<option value={m}>{m}</option>{/each}
		</select>
	</label>
	<label class="row">Symbol
		<select class="inp" value={o.blockId ?? ''} onchange={(e) => put(o, 'Symbol', { blockId: e.currentTarget.value || undefined })}>
			<option value="">Auto: {project.blockOf(defaultOutletBlock(o))?.name ?? 'by usage/mount'}</option>
			{#each outletBlocks as b (b.id)}<option value={b.id}>{b.name}</option>{/each}
		</select>
	</label>
	<label class="row">Height (Z, mm) <input class="inp" type="number" value={o.z ?? ''} onchange={(e) => put(o, 'Height', { z: num(e.currentTarget.value) })} /></label>
	{#if o.at}
		<label class="row">X <input class="inp" type="number" value={Math.round(o.at.x)} onchange={(e) => put(o, 'Move', { at: { ...o.at!, x: Number(e.currentTarget.value) } })} /></label>
		<label class="row">Y <input class="inp" type="number" value={Math.round(o.at.y)} onchange={(e) => put(o, 'Move', { at: { ...o.at!, y: Number(e.currentTarget.value) } })} /></label>
	{/if}
	<label class="row">Ports <input class="inp" type="number" min="1" max="48" value={o.ports.length} onchange={(e) => portCount(o, e.currentTarget)} /></label>
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
	{#each o.ports as p (p.port)}
		{@const steps = traceCircuit(project.index, { on: o.id, port: p.port })}
		{#if steps.length > 1}<Trace {project} {steps} />{/if}
	{/each}
{/if}

<style>
	.row { display: grid; grid-template-columns: 6.5rem 1fr; align-items: center; gap: 0.25rem; }
	.inp { width: 100%; border: 1px solid var(--cad-line); border-radius: 4px; padding: 1px 4px; background: var(--cad-input); color: var(--cad-text); }
</style>
