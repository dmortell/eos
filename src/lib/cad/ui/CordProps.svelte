<!-- A patch cord (Phase 3.5): its ends (with the labels they carry), the circuit it is part of, type / color / length
     (auto unless locked), cord ID, notes, and the install workflow — add → installed; installed → change / remove
     (marked, not deleted); revert a change or removal. -->
<script lang="ts">
	import { sortedCableTypes } from '../domain/cableTypes'
	import type { CadProject } from '../app/project.svelte'
	import type { Workspace } from '../app/workspace.svelte'
	import type { Cord } from '../domain/types'
	import { cordLength, installCord, revertCord, removeCord, setStatus, traceCircuit, STANDARD_LENGTHS, CORD_STATUSES, replacedText } from '../domain/cords'
	import Trace from './Trace.svelte'
	import ColorPick from './ColorPick.svelte'
	import Field from './fields/Field.svelte'
	import PropGroup from './PropGroup.svelte'
	import { toneStyle } from './StatusChip.svelte'

	let { project, ws, c }: { project: CadProject; ws: Workspace; c: Cord } = $props()

	const put = (label: string, patch: Partial<Cord>) => project.store.transact(label, (tx) => tx.put({ ...c, ...patch }))
	/** the whole cord (status rules drop `previous`, which a patch over `c` would keep) */
	const set = (label: string, next: Cord) => project.store.transact(label, (tx) => tx.put(next))
	const end = (r: Cord['a']) => project.index.portPlace(r)   // includes the face
	const label = (r: Cord['a']) => project.index.portLabel(r)
	const auto = $derived(cordLength(project.index, c.a, c.b))
	const typeLabel = (id: string) => project.settings?.cableTypes.find((t) => t.id === id)?.label ?? id
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
		<!-- any status, to fix a mistake (backlog "Set any status"); the buttons below are the install workflow -->
		<span class="k">Status</span><span><select class="stsel status" style={toneStyle(c.status)} value={c.status} title="Set the status directly (to fix a mistake) — the buttons below follow the install workflow"
			onchange={(e) => set('Cord status', setStatus(c, e.currentTarget.value as Cord['status']))}>
			{#each CORD_STATUSES as st (st)}<option value={st}>{st}</option>{/each}
		</select></span>
		<span class="k">From</span><span>{end(c.a)}<br /><span class="font-mono text-zinc-500">{label(c.a) || '—'}</span></span>
		<span class="k">To</span><span>{end(c.b)}<br /><span class="font-mono text-zinc-500">{label(c.b) || '—'}</span></span>
	</div>
	{#if c.status === 'replace'}<p class="text-zinc-500">Replaces the cord there now{replacedText(c, typeLabel) ? ` — ${replacedText(c, typeLabel)}` : ': set the new type, color or length below'}</p>
	{:else if c.previous}<p class="text-zinc-500">Was: {end(c.previous.a)} → {end(c.previous.b)} ({c.previous.status})</p>{/if}
	<div class="acts">
		{#if c.status !== 'installed'}<button title={c.status === 'remove' ? 'Taken out on site — the record goes' : 'Done on site'} onclick={install}>{c.status === 'remove' ? 'Removed on site' : 'Installed'}</button>{/if}
		<!-- a planned (add) cord is just deleted: the header's Delete / the Delete key -->
		{#if c.status !== 'remove' && c.status !== 'add'}<button title="Mark it to come out on site — it stays in the record until Removed on site (the Delete key does the same)" onclick={remove}>Mark for removal</button>{/if}
		{#if c.previous}<button title="Back to the ends and status before the change / removal" onclick={() => set('Revert cord', revertCord(c))}>Revert</button>{/if}
	</div>
</PropGroup>
<PropGroup kind="cord" title="Cable">
	<label class="row">Type
		<select class="inp" value={c.cableType} onchange={(e) => { put('Cord type', { cableType: e.currentTarget.value }); ws.cordDefaults.cableType = e.currentTarget.value }}>
			{#each sortedCableTypes(project.settings) as t (t.id)}<option value={t.id}>{t.label}</option>{/each}
			{#if !(project.settings?.cableTypes ?? []).some((t) => t.id === c.cableType)}<option value={c.cableType}>{c.cableType}</option>{/if}
		</select>
	</label>
	<Field label="Color"><ColorPick value={c.colour} onchange={(v) => { if (!v) return; put('Cord color', { colour: v }); ws.cordDefaults.colour = v }} /></Field>
	<Field label="Length" unit="m">
		<span class="flex items-center gap-1">
			<select class="inp" value={String(c.lengthM)} onchange={(e) => put('Cord length', { lengthM: Number(e.currentTarget.value), lengthLocked: true })}>
				{#each STANDARD_LENGTHS as l (l)}<option value={String(l)}>{l}</option>{/each}
				{#if !STANDARD_LENGTHS.includes(c.lengthM)}<option value={String(c.lengthM)}>{c.lengthM}</option>{/if}
			</select>
			<label title="Locked = keeps this length when the ends move; unlocked = estimated from the racks ({auto} m now)"><input type="checkbox" checked={c.lengthLocked} onchange={(e) => put(e.currentTarget.checked ? 'Lock length' : 'Auto length', e.currentTarget.checked ? { lengthLocked: true } : { lengthLocked: false, lengthM: auto })} /> lock</label>
		</span>
	</Field>
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
	.stsel { border: 1px solid transparent; cursor: pointer; }
	.stsel:hover { border-color: var(--cad-line); }
	.status { font-size: 10px; font-weight: 600; border-radius: 3px; padding: 0 4px; text-transform: uppercase; }
	.acts { display: flex; flex-wrap: wrap; gap: 4px; }
	.acts button { border: 1px solid var(--cad-line); border-radius: 4px; padding: 0 6px; background: var(--cad-input); color: var(--cad-text); }
	.acts button:hover { background: var(--cad-hover); }
</style>
