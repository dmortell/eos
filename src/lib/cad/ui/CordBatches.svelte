<!-- CORD LABEL BATCHES (backlog, Dave 2026-10-11) in the Patch schedule · cord BOM dialog: the patch cords bought, a row
     per batch of pre-printed labels typed by hand (type, length, color, first … last label, ordered, delivered), with
     what the cords' Cord IDs use of it; then per type × length × color the cords against the labels bought, the
     shortfall and where the next order continues. Kept in the project settings (one undo step per edit). -->
<script lang="ts">
	import type { CadProject } from '../app/project.svelte'
	import type { CordBatch, ProjectSettings } from '../domain/types'
	import { batchUse, labelNeeds } from '../domain/cordBatches'
	import { sortedCableTypes } from '../domain/cableTypes'
	import { STANDARD_LENGTHS } from '../domain/cords'
	import { newId } from '../domain/ids'
	import ColorPick from './ColorPick.svelte'

	let { project, typeLabel }: { project: CadProject; typeLabel: (id: string) => string } = $props()

	const batches = $derived(project.settings?.cordBatches ?? [])
	const uses = $derived(batchUse(batches, project.index.cords))
	const needs = $derived(labelNeeds(batches, project.index.cords).filter((n) => n.labels || n.short)
		.sort((a, b) => typeLabel(a.cableType).localeCompare(typeLabel(b.cableType)) || a.lengthM - b.lengthM || a.colour.localeCompare(b.colour)))
	const wrong = $derived(uses.flatMap((u) => u.wrong))

	function write(label: string, next: CordBatch[]) {
		const st = project.settings
		if (st) project.store.transact(label, (tx) => tx.put({ ...st, cordBatches: next } as ProjectSettings))
	}
	const edit = (b: CordBatch, patch: Partial<CordBatch>) => write('Cord label batch', batches.map((x) => (x.id === b.id ? { ...x, ...patch } : x)))
	function add() {
		const d = project.settings?.defaults, short = needs.find((n) => n.short)
		write('New cord label batch', [...batches, { id: newId(), cableType: short?.cableType ?? d?.cordCableType ?? 'cat6a', lengthM: short?.lengthM ?? 2, colour: short?.colour ?? d?.cordColour ?? '#3b82f6', first: short?.nextOrder ?? '', last: '' }])
	}
	const num = (v: string) => (v.trim() === '' ? undefined : Math.max(0, Math.round(Number(v)) || 0))
</script>

<div class="cb">
	<div class="title"><b>Cord label batches</b><span class="hint">the cords bought, with their labels as printed — e.g. 2AR-0001 to 2AR-0100</span><button class="btn" onclick={add} title="Add a batch (a type × length × color still short of labels first, from where its last order ended)">+ Batch</button></div>
	{#if batches.length}
		<table>
			<thead><tr><th>Type</th><th>Length</th><th>Color</th><th>First label</th><th>Last label</th><th class="n" title="Labels in the range">Labels</th><th class="n">Ordered</th><th class="n">Delivered</th><th class="n" title="Cords whose Cord ID is in the range">Used</th><th class="n">Free</th><th title="The next free label after the last one used">Next</th><th></th></tr></thead>
			<tbody>
				{#each uses as u (u.batch.id)}
					{@const b = u.batch}
					<tr>
						<td><select value={b.cableType} onchange={(e) => edit(b, { cableType: e.currentTarget.value })}>
							{#each sortedCableTypes(project.settings) as t (t.id)}<option value={t.id}>{t.label}</option>{/each}
							{#if !(project.settings?.cableTypes ?? []).some((t) => t.id === b.cableType)}<option value={b.cableType}>{b.cableType}</option>{/if}</select></td>
						<td><input class="len" type="number" min="0.1" step="0.1" list="cad-batch-lengths" aria-label="Length (m)" value={b.lengthM}
							onchange={(e) => { const m = Math.round(Number(e.currentTarget.value) * 100) / 100; if (m > 0) edit(b, { lengthM: m }); else e.currentTarget.value = String(b.lengthM) }} /> m</td>
						<td><ColorPick value={b.colour} onchange={(v) => { if (v) edit(b, { colour: v }) }} /></td>
						<td><input class="lbl" class:bad={!u.range && !!b.first && !!b.last} value={b.first} placeholder="2AR-0001" onchange={(e) => edit(b, { first: e.currentTarget.value.trim() })} /></td>
						<td><input class="lbl" class:bad={!u.range && !!b.first && !!b.last} value={b.last} placeholder="2AR-0100" title={!u.range && b.first && b.last ? 'The first and last label need the same text before a number that counts up' : ''} onchange={(e) => edit(b, { last: e.currentTarget.value.trim() })} /></td>
						<td class="n">{u.range ? u.count : '—'}</td>
						<td class="n"><input class="cnt" type="number" min="0" value={b.ordered ?? ''} placeholder={u.range ? String(u.count) : ''} onchange={(e) => edit(b, { ordered: num(e.currentTarget.value) })} /></td>
						<td class="n"><input class="cnt" type="number" min="0" value={b.delivered ?? ''} placeholder="0" onchange={(e) => edit(b, { delivered: num(e.currentTarget.value) })} /></td>
						<td class="n">{u.used.length}</td>
						<td class="n">{u.range ? u.free : ''}</td>
						<td class="mono" title={u.lastUsed ? `Last used: ${u.lastUsed}` : 'None used yet'}>{u.next ?? (u.range ? 'all used' : '')}</td>
						<td><button class="x" title="Delete this batch (Undo brings it back)" onclick={() => write('Delete cord label batch', batches.filter((x) => x.id !== b.id))}>✕</button></td>
					</tr>
				{/each}
			</tbody>
		</table>
		<datalist id="cad-batch-lengths">{#each STANDARD_LENGTHS as l (l)}<option value={l}></option>{/each}</datalist>
	{/if}
	{#if wrong.length}<p class="warn">{wrong.length} cord{wrong.length === 1 ? '' : 's'} carry a label from a batch of another type, length or color: {wrong.slice(0, 6).map((c) => c.cordId).join(', ')}{wrong.length > 6 ? ' …' : ''}</p>{/if}
	{#if needs.length}
		<table class="needs">
			<thead><tr><th>Type · length · color</th><th class="n" title="Cords of this kind (not being removed)">Cords</th><th class="n" title="Labels ordered in its batches">Labels</th><th class="n">Delivered</th><th class="n" title="Cords more than the labels ordered">Short</th><th title="The label after the last one bought — where the next order continues">Next order from</th></tr></thead>
			<tbody>
				{#each needs as n (n.key)}
					<tr><td><span class="sw" style:background={n.colour}></span>{typeLabel(n.cableType)} · {n.lengthM} m</td><td class="n">{n.cords}</td><td class="n">{n.labels}</td><td class="n">{n.delivered}</td><td class="n" class:short={n.short > 0}>{n.short || ''}</td><td class="mono">{n.nextOrder ?? '—'}</td></tr>
				{/each}
			</tbody>
		</table>
	{:else if !batches.length}<p class="hint">No batches yet.</p>{/if}
</div>

<style>
	.len { width: 4.5rem; }
	.cb { margin-top: 14px; }
	.title { display: flex; align-items: baseline; gap: 8px; }
	.title .hint { flex: 1; }
	.hint { color: var(--cad-muted, #71717a); font-size: 11px; }
	.btn { border: 1px solid var(--cad-line, #d4d4d8); border-radius: 4px; padding: 0 8px; background: var(--cad-input, white); }
	table { width: 100%; border-collapse: collapse; margin-top: 6px; }
	th { text-align: left; font-weight: 600; color: var(--cad-muted, #52525b); border-bottom: 1px solid var(--cad-line, #e4e4e7); padding: 2px 4px; }
	td { padding: 1px 4px; border-bottom: 1px solid var(--cad-line-faint, #f4f4f5); }
	.n { text-align: right; white-space: nowrap; }
	.mono { font-family: ui-monospace, monospace; white-space: nowrap; }
	select, input { border: 1px solid var(--cad-line, #d4d4d8); border-radius: 3px; padding: 0 3px; background: var(--cad-input, white); color: inherit; font-size: 11px; min-width: 0; }
	.lbl { width: 5.8rem; font-family: ui-monospace, monospace; }
	.short { color: #dc2626; font-weight: 600; }
	.cnt { width: 3.2rem; text-align: right; }
	.bad { color: #dc2626; border-color: #dc2626; font-weight: 600; }
	.x { color: var(--cad-muted, #71717a); }
	.x:hover { color: #dc2626; }
	.warn { margin: 4px 0 0; color: #b45309; font-size: 11px; }
	.needs { margin-top: 10px; }
	.sw { display: inline-block; width: 8px; height: 8px; border-radius: 2px; margin-right: 4px; vertical-align: middle; }
</style>
