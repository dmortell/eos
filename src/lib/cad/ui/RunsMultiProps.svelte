<!-- SEVERAL RUNS at once (backlog "Edit several runs at once"): what they are (trunk / conduit / tray / wall / line),
     their size, where they run (each from its own level's heights), their tier and color (plain lines: line type,
     lineweight and end marks too). A field shows the value
     they share, or "mixed"; an edit sets that one thing on every run, as one undo step. -->
<script lang="ts">
	import type { CadProject } from '../app/project.svelte'
	import { withStyle, type Shape } from '../domain/shapes'
	import ColorPick from './ColorPick.svelte'
	import Field from './fields/Field.svelte'
	import PropGroup from './PropGroup.svelte'
	import LayerPick from './LayerPick.svelte'
	import type { Level } from '../domain/types'
	import { shared as sharedOf, MIXED, plainLines } from './propsKit'
	import LineStyle from './LineStyle.svelte'
	import { convertRun, kindOf, RUN_PLACES, placeNow, setRunPlace, type RunKind, type RunPlace } from '../domain/runEdit'

	let { project, runs }: { project: CadProject; runs: Shape[] } = $props()

	const heightsOf = (s: Shape) => (project.index.get(s.levelId ?? '') as Level | undefined)?.heights
	/** What the runs share, or null when they differ. */
	const shared = <T,>(f: (s: Shape) => T): T | null => { const r = sharedOf(runs, f); return r.mixed ? null : (r.value as T) }
	const kind = $derived(shared(kindOf)), w = $derived(shared((s) => s.section?.w)), h = $derived(shared((s) => s.section?.h))
	const place = $derived(shared((s) => placeNow(s, heightsOf(s)))), tier = $derived(shared((s) => (s.role?.kind === 'containment' ? s.role.tier : undefined)))
	const colour = $derived(shared((s) => s.style?.stroke))
	const containment = $derived(runs.every((s) => s.role?.kind === 'containment'))
	const lines = $derived(plainLines(runs))
	const sized = $derived(runs.every((s) => !!s.section))
	const round = $derived(runs.every((s) => s.section?.round))

	function each(label: string, f: (s: Shape) => Shape | null) {
		project.store.transact(`${label} (${runs.length} runs)`, (tx) => { for (const s of runs) { const n = f(s); if (n) tx.put(n) } })
	}
	/** Each run where its own tier runs: high → the ceiling plenum, low → under the floor, wall → on the wall. */
	const byTier = (s: Shape) => (s.role?.kind === 'containment' ? setRunPlace(s, heightsOf(s), s.role.tier === 'high' ? 'plenum' : s.role.tier === 'wall' ? 'wall' : 'floor') : null)
	const setSize = (k: 'w' | 'h', v: number) => v > 0 && each(k === 'w' ? 'Run width' : 'Run height', (s) => (s.section ? { ...s, section: { ...s.section, [k]: v, ...(s.section.round ? { w: v, h: v } : {}) } } : null))
</script>

<!-- the same groups as one run's: General · Size and height · Style -->
<PropGroup kind="runs" title="General">
	<label class="row">Kind
		<select class="inp" value={kind ?? ''} onchange={(e) => e.currentTarget.value && each('Convert runs', (s) => convertRun(s, e.currentTarget.value as RunKind))}>
			{#if kind === null}<option value="">{MIXED}</option>{/if}
			<option value="line">Line</option><option value="wall">Wall</option><option value="trunk">Trunk</option><option value="conduit">Conduit</option><option value="tray">Tray</option><option value="ladder">Ladder</option>
		</select></label>
	<LayerPick {project} ids={runs.map((s) => s.id)} />
</PropGroup>
{#if sized || containment}
	<PropGroup kind="runs" title="Size and height">
		{#if sized}
			<label class="row">{round ? 'Diameter' : 'Width'} (mm) <input class="inp" type="number" min="1" value={w ?? ''} placeholder={w === null ? MIXED : ''} onchange={(e) => setSize('w', Number(e.currentTarget.value))} /></label>
			{#if !round}<label class="row">Height (mm) <input class="inp" type="number" min="1" value={h ?? ''} placeholder={h === null ? MIXED : ''} onchange={(e) => setSize('h', Number(e.currentTarget.value))} /></label>{/if}
		{/if}
		{#if containment}
			<label class="row" title="Each run from its own level's heights (the nodes at its main height; drops keep their ends)">Location
				<select class="inp" value={place ?? 'mixed'} onchange={(e) => { const p = e.currentTarget.value; if (p === 'by-tier') each('Runs to their tier’s height', byTier); else if (p in RUN_PLACES) each(`Runs ${RUN_PLACES[p as RunPlace]}`, (s) => setRunPlace(s, heightsOf(s), p as RunPlace)) }}>
					{#if place === null}<option value="mixed">{MIXED}</option>{/if}
					<option value="">custom</option>
					{#each Object.entries(RUN_PLACES) as [k, label] (k)}<option value={k}>{label}</option>{/each}
					<!-- a mix of high and low runs (an import put them all at one height): each to where its tier runs -->
					<option value="by-tier">each by its tier (high: plenum · low: under floor)</option>
				</select></label>
			<label class="row">Tier
				<select class="inp" value={tier ?? 'mixed'} onchange={(e) => { const t = e.currentTarget.value; if (t !== 'mixed') each('Run tier', (s) => (s.role?.kind === 'containment' ? { ...s, role: { ...s.role, tier: t as 'low' | 'high' | 'wall' } } : null)) }}>
					{#if tier === null}<option value="mixed">{MIXED}</option>{/if}
					<option value="low">Low</option><option value="high">High</option><option value="wall">Wall</option>
				</select></label>
		{/if}
	</PropGroup>
{/if}
<PropGroup kind="runs" title="Style">
	<Field label="Color" title="Their own color on the plan (By layer = the tier's / layer's)">
		<ColorPick value={colour ?? undefined} mixed={colour === null} allowByLayer onchange={(v) => each(lines ? 'Line color' : 'Run color', (s) => withStyle(s, { stroke: v }))} /></Field>
	<!-- plain lines: line type, lineweight and end marks too, as one line has -->
	{#if lines}<LineStyle {project} shapes={runs} />{/if}
</PropGroup>
