<!-- Renumber the selected outlets / racks / labelled shapes: in pick order (the Renumber tool), reading order or label
     order; from a start number, by a step, in one number group, with a padding. Shows old → new before it applies, and
     the new labels someone else already has. One undo step; printed panels ask first (project.relabel). -->
<script lang="ts">
	import type { CadProject } from '../app/project.svelte'
	import type { Workspace } from '../app/workspace.svelte'
	import { untrack } from 'svelte'
	import type { Entity } from '../domain/drawing'
	import { labelOf, renumberable, orderFor, numberGroups, renumberEntities, startOf, clashes, type RenumberOrder } from '../domain/renumber'

	let { project, ws, open = false }: { project: CadProject; ws: Workspace; open?: boolean } = $props()

	const items = $derived(ws.selection.map((id) => project.index.get(id)).filter((e): e is Entity => renumberable(e)))
	// the Renumber tool numbers in click order; a selection made otherwise starts in reading order
	let order = $state<RenumberOrder>(untrack(() => ws.toolId) === 'renumber' ? 'pick' : 'reading')
	let group = $state(-1)
	let startText = $state('')
	let step = $state(1)
	let padText = $state('')

	const ordered = $derived(orderFor(items, order))
	const groups = $derived(numberGroups(labelOf(ordered[0]) ?? ''))
	const start = $derived(startText.trim() === '' ? startOf(ordered, group) : Number(startText))
	const pad = $derived(padText.trim() === '' ? undefined : Number(padText))
	const next = $derived(Number.isFinite(start) ? renumberEntities(ordered, { start, step: step || 1, group, pad }) : [])
	const byId = $derived(new Map(next.map((e) => [e.id, e])))
	const clash = $derived(clashes(next, project.index.byId.values()))

	function apply() {
		if (!next.length) return
		project.relabel(`Renumber ${next.length}`, next, ws.ask2)
		startText = ''
	}
</script>

<details class="rn" {open}>
	<summary class="font-semibold">Renumber {items.length}</summary>
	{#if !items.length}
		<p class="text-zinc-400">Click outlets, racks or labelled shapes in order (Renumber tool), or select several.</p>
	{:else}
		<label class="row">Order
			<select class="inp" bind:value={order}>
				<option value="pick">as picked</option><option value="reading">reading order (rows, then left → right)</option><option value="label">current labels</option>
			</select>
		</label>
		<label class="row">Number
			<select class="inp" bind:value={group} title="Which number in the label changes">
				{#each groups as g, i (i)}<option value={i - groups.length}>{g}{i === groups.length - 1 ? ' (last)' : ''}</option>{/each}
			</select>
		</label>
		<!-- blank Start = the first item's own number ("renumber from here") -->
		<label class="row">Start <input class="inp" type="number" value={startText} oninput={(e) => (startText = e.currentTarget.value)} placeholder={String(startOf(ordered, group))} /></label>
		<label class="row">Step <input class="inp" type="number" bind:value={step} /></label>
		<label class="row">Digits <input class="inp" type="number" min="1" value={padText} oninput={(e) => (padText = e.currentTarget.value)} placeholder="keep each label's" /></label>
		<ol class="pv">
			{#each ordered.slice(0, 12) as e (e.id)}
				{@const n = byId.get(e.id)}
				<li class="font-mono"><span class="text-zinc-500">{labelOf(e)}</span> → <span class:same={!n}>{labelOf(n ?? e)}</span></li>
			{/each}
			{#if ordered.length > 12}<li class="text-zinc-400">… {ordered.length - 12} more</li>{/if}
		</ol>
		{#if clash.length}<p class="text-amber-700">Already used: {clash.slice(0, 6).join(', ')}{clash.length > 6 ? ` +${clash.length - 6}` : ''}</p>{/if}
		<button class="btn" disabled={!next.length} onclick={apply}>Renumber {next.length}</button>
	{/if}
</details>

<style>
	.rn { display: flex; flex-direction: column; gap: 4px; padding-bottom: 6px; border-bottom: 1px solid var(--cad-line, #e4e4e7); }
	.rn > :global(* + *) { margin-top: 4px; }
	.row { display: grid; grid-template-columns: 6.5rem 1fr; align-items: center; gap: 0.25rem; }
	.inp { width: 100%; border: 1px solid var(--cad-line, #e4e4e7); border-radius: 4px; padding: 1px 4px; background: var(--cad-input, white); color: inherit; }
	.pv { max-height: 12rem; overflow: auto; padding-left: 1.4rem; list-style: decimal; }
	.same { color: var(--cad-muted, #a1a1aa); }
	.btn { border: 1px solid var(--cad-line, #d4d4d8); border-radius: 4px; padding: 0 6px; background: var(--cad-input, white); }
	.btn:disabled { opacity: 0.4; }
</style>
