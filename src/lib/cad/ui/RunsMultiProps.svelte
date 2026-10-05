<!-- SEVERAL RUNS at once (backlog "Edit several runs at once"): what they are (trunk / conduit / tray / wall / line),
     their size, where they run (each from its own level's heights), their tier and colour. A field shows the value
     they share, or "mixed"; an edit sets that one thing on every run, as one undo step. -->
<script lang="ts">
	import type { CadProject } from '../app/project.svelte'
	import { withStyle, type Shape } from '../domain/shapes'
	import ColorPick from './ColorPick.svelte'
	import type { Level } from '../domain/types'
	import { convertRun, kindOf, RUN_PLACES, placeNow, setRunPlace, type RunKind, type RunPlace } from '../domain/runEdit'

	let { project, runs }: { project: CadProject; runs: Shape[] } = $props()

	const heightsOf = (s: Shape) => (project.index.get(s.levelId ?? '') as Level | undefined)?.heights
	const shared = <T,>(f: (s: Shape) => T): T | null => { const vs = new Set(runs.map(f)); return vs.size === 1 ? [...vs][0] : null }
	const kind = $derived(shared(kindOf)), w = $derived(shared((s) => s.section?.w)), h = $derived(shared((s) => s.section?.h))
	const place = $derived(shared((s) => placeNow(s, heightsOf(s)))), tier = $derived(shared((s) => (s.role?.kind === 'containment' ? s.role.tier : undefined)))
	const colour = $derived(shared((s) => s.style?.stroke))
	const containment = $derived(runs.every((s) => s.role?.kind === 'containment'))
	const sized = $derived(runs.every((s) => !!s.section))
	const round = $derived(runs.every((s) => s.section?.round))

	function each(label: string, f: (s: Shape) => Shape | null) {
		project.store.transact(`${label} (${runs.length} runs)`, (tx) => { for (const s of runs) { const n = f(s); if (n) tx.put(n) } })
	}
	const setSize = (k: 'w' | 'h', v: number) => v > 0 && each(k === 'w' ? 'Run width' : 'Run height', (s) => (s.section ? { ...s, section: { ...s.section, [k]: v, ...(s.section.round ? { w: v, h: v } : {}) } } : null))
</script>

<p class="pt-1 font-semibold">{runs.length} runs</p>
<label class="row">Is a
	<select class="inp" value={kind ?? ''} onchange={(e) => e.currentTarget.value && each('Convert runs', (s) => convertRun(s, e.currentTarget.value as RunKind))}>
		{#if kind === null}<option value="">mixed</option>{/if}
		<option value="line">Line</option><option value="wall">Wall</option><option value="trunk">Trunk</option><option value="conduit">Conduit</option><option value="tray">Tray</option>
	</select></label>
{#if sized}
	<label class="row">{round ? 'Diameter' : 'Width'} <input class="inp" type="number" min="1" value={w ?? ''} placeholder="mixed" onchange={(e) => setSize('w', Number(e.currentTarget.value))} /></label>
	{#if !round}<label class="row">Height <input class="inp" type="number" min="1" value={h ?? ''} placeholder="mixed" onchange={(e) => setSize('h', Number(e.currentTarget.value))} /></label>{/if}
{/if}
{#if containment}
	<label class="row" title="Each run from its own level's heights (the nodes at its main height; drops keep their ends)">Location
		<select class="inp" value={place ?? 'mixed'} onchange={(e) => { const p = e.currentTarget.value as RunPlace; if (p in RUN_PLACES) each(`Runs ${RUN_PLACES[p]}`, (s) => setRunPlace(s, heightsOf(s), p)) }}>
			{#if place === null}<option value="mixed">mixed</option>{/if}
			<option value="">custom</option>
			{#each Object.entries(RUN_PLACES) as [k, label] (k)}<option value={k}>{label}</option>{/each}
		</select></label>
	<label class="row">Tier
		<select class="inp" value={tier ?? 'mixed'} onchange={(e) => { const t = e.currentTarget.value; if (t !== 'mixed') each('Run tier', (s) => (s.role?.kind === 'containment' ? { ...s, role: { ...s.role, tier: t as 'low' | 'high' | 'wall' } } : null)) }}>
			{#if tier === null}<option value="mixed">mixed</option>{/if}
			<option value="low">low</option><option value="high">high</option><option value="wall">wall</option>
		</select></label>
{/if}
<div class="row" title="Their own color on the plan (By layer = the tier's / layer's)">Color
	<ColorPick value={colour ?? undefined} mixed={colour === null} allowByLayer onchange={(v) => each('Run color', (s) => withStyle(s, { stroke: v }))} /></div>

<style>
	.row { display: grid; grid-template-columns: 6.5rem 1fr; align-items: center; gap: 0.25rem; }
	.inp { width: 100%; border: 1px solid var(--cad-line); border-radius: 4px; padding: 1px 4px; background: var(--cad-input); color: var(--cad-text); }
</style>
