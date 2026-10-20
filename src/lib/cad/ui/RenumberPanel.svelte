<!-- Renumber the selected outlets / racks / labelled shapes: in pick order (the Renumber tool), reading order or label
     order; from a start number, by a step, in one number group, with a padding. Shows old → new before it applies, and
     the new labels someone else already has. One undo step; printed panels ask first (project.relabel). -->
<script lang="ts">
	import type { CadProject } from '../app/project.svelte'
	import type { Workspace } from '../app/workspace.svelte'
	import { untrack } from 'svelte'
	import type { Entity } from '../domain/drawing'
	import { labelOf, renumberable, orderFor, numberGroups, renumberEntities, startOf, clashes, replaceInLabels, type RenumberOrder } from '../domain/renumber'

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

	// ── Replace: find / replace in the labels, or in outlets' port labels; plain text or a pattern ──
	let find = $state('')
	let repl = $state('')
	let regex = $state(false)
	let inPorts = $state(false)
	const hasOutlets = $derived(items.some((e) => e.type === 'outlet'))
	const replaced = $derived(replaceInLabels(items, { find, repl, regex, ports: inPorts && hasOutlets }))
	const edits = $derived(Array.isArray(replaced) ? replaced : [])
	const editById = $derived(new Map(edits.map((e) => [e.id, e])))
	/** What would go wrong: an empty label, or a label someone else (of the same kind) already has. */
	const replaceProblem = $derived(!Array.isArray(replaced) ? replaced.problem
		: inPorts && hasOutlets ? (edits.some((e) => e.type === 'outlet' && e.ports.some((p) => !p.label.trim())) ? 'A port label would be empty' : '')
		: edits.some((e) => !labelOf(e)?.trim()) ? 'A label would be empty' : '')
	const replaceClash = $derived(inPorts && hasOutlets ? [] : clashes(edits, project.index.byId.values()))
	/** One line of the preview: the label (or the first port label that changes), before → after. */
	function previewOf(e: Entity): [string, string] | null {
		const n = editById.get(e.id)
		if (!n) return null
		if (inPorts && e.type === 'outlet' && n.type === 'outlet') {
			const i = e.ports.findIndex((p, k) => p.label !== n.ports[k]?.label)
			const more = n.ports.filter((p, k) => p.label !== e.ports[k]?.label).length - 1
			return [e.ports[i].label, `${n.ports[i].label}${more > 0 ? ` (+${more} ports)` : ''}`]
		}
		return [labelOf(e) ?? '', labelOf(n) ?? '']
	}
	function applyReplace() {
		if (!edits.length || replaceProblem) return
		project.relabel(`Replace "${find}" → "${repl}" (${edits.length})`, edits, ws.ask2)
	}
</script>

<details class="rn" {open}>
	<summary class="font-semibold">{ws.renumberMode === 'replace' ? 'Find / replace in' : 'Renumber'} {items.length}</summary>
	<div class="modes" role="tablist">
		<button role="tab" class:on={ws.renumberMode === 'number'} aria-selected={ws.renumberMode === 'number'} onclick={() => (ws.renumberMode = 'number')}>Renumber</button>
		<button role="tab" class:on={ws.renumberMode === 'replace'} aria-selected={ws.renumberMode === 'replace'} onclick={() => (ws.renumberMode = 'replace')}>Find / replace</button>
	</div>
	{#if !items.length}
		<p class="text-zinc-400">Click outlets, racks or labelled shapes in order (Renumber tool), or select several (sheets too, in the Sheets tab).</p>
	{:else if ws.renumberMode === 'replace'}
		<label class="row">Find <input class="inp font-mono" bind:value={find} placeholder={regex ? 'a pattern, e.g. ^A\\.' : 'text'} /></label>
		<label class="row">Replace with <input class="inp font-mono" bind:value={repl} placeholder={regex ? '$1 … for groups' : '(nothing)'} /></label>
		{#if hasOutlets}
			<label class="row" title="Outlet labels (their ports follow), or only the outlets' port labels">In
				<select class="inp" bind:value={inPorts}><option value={false}>labels</option><option value={true}>port labels</option></select></label>
		{/if}
		<label class="row" title="A regular expression: ^ start, $ end, \d a digit, ( ) a group to reuse as $1">Pattern <span><input type="checkbox" bind:checked={regex} /> regular expression</span></label>
		{#if find}
			<ol class="pv">
				{#each ordered.flatMap((e) => { const p = previewOf(e); return p ? [p] : [] }).slice(0, 12) as [a, b], i (i)}
					<li class="font-mono"><span class="text-zinc-500">{a}</span> → {b}</li>
				{/each}
				{#if edits.length > 12}<li class="text-zinc-400">… {edits.length - 12} more</li>{/if}
				{#if !edits.length && !replaceProblem}<li class="text-zinc-400" style="list-style: none">No match</li>{/if}
			</ol>
		{/if}
		{#if replaceProblem}<p class="text-red-600">{replaceProblem}</p>{/if}
		{#if replaceClash.length}<p class="text-amber-700">Already used: {replaceClash.slice(0, 6).join(', ')}{replaceClash.length > 6 ? ` +${replaceClash.length - 6}` : ''}</p>{/if}
		<button class="btn" disabled={!edits.length || !!replaceProblem} onclick={applyReplace}>Replace in {edits.length}</button>
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
	.inp { width: 100%; border: 1px solid var(--cad-line, #e4e4e7); border-radius: 4px; padding: 1px 4px; background: var(--cad-input, white); color: inherit; }
	.pv { max-height: 12rem; overflow: auto; padding-left: 1.4rem; list-style: decimal; }
	.same { color: var(--cad-muted, #a1a1aa); }
	.modes { display: flex; gap: 2px; }
	.modes button { flex: 1; border: 1px solid var(--cad-line, #d4d4d8); border-radius: 4px; padding: 0 6px; background: var(--cad-input, white); color: inherit; }
	.modes button.on { background: var(--cad-sel, #dbeafe); font-weight: 600; }
	.btn { min-height: 20px; border: 1px solid var(--cad-line, #d4d4d8); border-radius: 4px; padding: 0 6px; background: var(--cad-input, white); }
	.btn:disabled { opacity: 0.4; }
</style>
