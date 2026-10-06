<!-- A patch cord (Phase 3.5): its ends (with the labels they carry), the circuit it is part of, type / colour / length
     (auto unless locked), cord ID, notes, and the install workflow — add → installed; installed → change / remove
     (marked, not deleted); revert a change or removal. -->
<script lang="ts">
	import { sortedCableTypes } from '../domain/cableTypes'
	import type { CadProject } from '../app/project.svelte'
	import type { Workspace } from '../app/workspace.svelte'
	import type { Cord } from '../domain/types'
	import { cordLength, installCord, revertCord, removeCord, traceCircuit, STANDARD_LENGTHS } from '../domain/cords'
	import Trace from './Trace.svelte'
	import ColorPick from './ColorPick.svelte'
	import PropGroup from './PropGroup.svelte'

	let { project, ws, c }: { project: CadProject; ws: Workspace; c: Cord } = $props()

	const put = (label: string, patch: Partial<Cord>) => project.store.transact(label, (tx) => tx.put({ ...c, ...patch }))
	const end = (r: Cord['a']) => project.index.portPlace(r)   // includes the face
	const label = (r: Cord['a']) => project.index.portLabel(r)
	const auto = $derived(cordLength(project.index, c.a, c.b))
	const steps = $derived(traceCircuit(project.index, { on: c.a.on, port: c.a.port }))

	function install() {
		const n = installCord(c)
		project.store.transact('Cord installed', (tx) => (n ? tx.put(n) : tx.del(c.id)))
	}
	function remove() {
		const n = removeCord(c)
		project.store.transact(n ? 'Mark cord for removal' : 'Delete cord', (tx) => (n ? tx.put(n) : tx.del(c.id)))
		if (!n) ws.select([])
	}
</script>

<!-- groups (UX review "Properties groups"): Ends (with its status and the install workflow) · Cable · Circuit -->
<PropGroup kind="cord" title="Ends">
	<div class="ends">
		<span class="k">Status</span><span><span class="status s-{c.status}">{c.status}</span></span>
		<span class="k">From</span><span>{end(c.a)}<br /><span class="font-mono text-zinc-500">{label(c.a) || '—'}</span></span>
		<span class="k">To</span><span>{end(c.b)}<br /><span class="font-mono text-zinc-500">{label(c.b) || '—'}</span></span>
	</div>
	{#if c.previous}<p class="text-zinc-500">Was: {end(c.previous.a)} → {end(c.previous.b)} ({c.previous.status})</p>{/if}
	<div class="acts">
		{#if c.status !== 'installed'}<button title={c.status === 'remove' ? 'Taken out on site — the record goes' : 'Done on site'} onclick={install}>{c.status === 'remove' ? 'Removed on site' : 'Installed'}</button>{/if}
		{#if c.status !== 'remove'}<button title={c.status === 'add' ? 'Not installed yet — deleted outright' : 'Mark it to come out on site'} onclick={remove}>{c.status === 'add' ? 'Delete' : 'Remove'}</button>{/if}
		{#if c.previous}<button title="Back to the ends and status before the change / removal" onclick={() => put('Revert cord', revertCord(c))}>Revert</button>{/if}
	</div>
</PropGroup>
<PropGroup kind="cord" title="Cable">
	<label class="row">Type
		<select class="inp" value={c.cableType} onchange={(e) => { put('Cord type', { cableType: e.currentTarget.value }); ws.cordDefaults.cableType = e.currentTarget.value }}>
			{#each sortedCableTypes(project.settings) as t (t.id)}<option value={t.id}>{t.label}</option>{/each}
			{#if !(project.settings?.cableTypes ?? []).some((t) => t.id === c.cableType)}<option value={c.cableType}>{c.cableType}</option>{/if}
		</select>
	</label>
	<div class="row">Color <ColorPick value={c.colour} onchange={(v) => { if (!v) return; put('Cord color', { colour: v }); ws.cordDefaults.colour = v }} /></div>
	<div class="row">
		<span>Length (m)</span>
		<span class="flex items-center gap-1">
			<select class="inp" value={String(c.lengthM)} onchange={(e) => put('Cord length', { lengthM: Number(e.currentTarget.value), lengthLocked: true })}>
				{#each STANDARD_LENGTHS as l (l)}<option value={String(l)}>{l}</option>{/each}
				{#if !STANDARD_LENGTHS.includes(c.lengthM)}<option value={String(c.lengthM)}>{c.lengthM}</option>{/if}
			</select>
			<label title="Locked = keeps this length when the ends move; unlocked = estimated from the racks ({auto} m now)"><input type="checkbox" checked={c.lengthLocked} onchange={(e) => put(e.currentTarget.checked ? 'Lock length' : 'Auto length', e.currentTarget.checked ? { lengthLocked: true } : { lengthLocked: false, lengthM: auto })} /> lock</label>
		</span>
	</div>
	<label class="row">Cord ID <input class="inp font-mono" value={c.cordId ?? ''} onchange={(e) => put('Cord ID', { cordId: e.currentTarget.value.trim() || undefined })} /></label>
	<label class="row">Notes <input class="inp" value={c.notes ?? ''} onchange={(e) => put('Cord notes', { notes: e.currentTarget.value || undefined })} /></label>
</PropGroup>
{#if steps.length > 1}
	<PropGroup kind="cord" title="Circuit">
		<Trace {project} {steps} />
	</PropGroup>
{/if}

<style>
	.ends { display: grid; grid-template-columns: 2.5rem 1fr; gap: 2px 6px; }
	.k { color: var(--cad-muted); }
	.status { font-size: 10px; font-weight: 600; border-radius: 3px; padding: 0 4px; text-transform: uppercase; }
	.s-add { background: #dcfce7; color: #166534; }
	.s-change { background: #fef9c3; color: #854d0e; }
	.s-remove { background: #fee2e2; color: #991b1b; }
	.s-installed { background: #e4e4e7; color: #3f3f46; }
	.row { display: grid; grid-template-columns: 6.5rem 1fr; align-items: center; gap: 0.25rem; }
	.inp { width: 100%; border: 1px solid var(--cad-line); border-radius: 4px; padding: 1px 4px; background: var(--cad-input); color: var(--cad-text); }
	.acts { display: flex; flex-wrap: wrap; gap: 4px; }
	.acts button { border: 1px solid var(--cad-line); border-radius: 4px; padding: 0 6px; background: var(--cad-input); color: var(--cad-text); }
	.acts button:hover { background: var(--cad-hover); }
</style>
