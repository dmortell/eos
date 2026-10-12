<!-- A NOTE's properties (text, leader, revision cloud, dimension) — on a sheet, a plan or an elevation: its words and
     size, its colour, a text's background (backlog "Notes on plans and diagrams"), a dimension's kind and text. -->
<script lang="ts">
	import type { CadProject } from '../app/project.svelte'
	import type { Shape } from '../domain/shapes'
	import { dimLine } from '../views/plan'
	import ColorPick from './ColorPick.svelte'
	import Field from './fields/Field.svelte'
	import PropGroup from './PropGroup.svelte'
	import LayerPick from './LayerPick.svelte'

	let { project, s }: { project: CadProject; s: Shape } = $props()

	const put = (label: string, patch: Partial<Shape>) => project.store.transact(label, (tx) => tx.put({ ...s, ...patch } as Shape))
	const g = $derived(s.geom)
	const setGeom = (label: string, patch: Record<string, unknown>) => put(label, { geom: { ...s.geom, ...patch } as Shape['geom'] })
	function setStyle(label: string, patch: { stroke?: string; fill?: string }) {
		const st = { ...s.style, ...patch }
		for (const k of Object.keys(st) as (keyof typeof st)[]) if (st[k] === undefined) delete st[k]
		put(label, { style: Object.keys(st).length ? st : undefined })
	}
	const num = (v: string) => (v.trim() === '' ? undefined : Number(v))
	/** mm per point. */
	const PT = 25.4 / 72
	const TITLE = { text: 'Text', leader: 'Leader', cloud: 'Revision cloud', dimension: 'Dimension' } as Record<string, string>
	const measured = $derived(g.kind === 'dimension' ? Math.round(dimLine(g).len) : 0)
	/** The data fields a text can show (domain/fields.ts). */
	const FIELDS_TIP = 'Live values: {PROJECT} {LEVEL} {SHEET} {SHEET_TITLE} {DATE} · {COUNT:block name} = how many of that block are on this level (on a sheet: its viewports’ levels)'
</script>

<!-- groups (UX review "Properties groups"): its words · its style -->
<PropGroup kind="note" title={TITLE[g.kind] ?? 'Note'}>
{#if g.kind === 'text'}
	<label class="row" title="Several lines: Enter starts a new one · double-click the text (or F2) to edit it on the drawing. {FIELDS_TIP}">Text
		<textarea class="inp" rows={Math.min(6, Math.max(2, g.text.split('\n').length))} value={g.text} onchange={(e) => e.currentTarget.value.trim() && setGeom('Text', { text: e.currentTarget.value.replace(/\s+$/, '') })}></textarea></label>
	<label class="row" title="Its size on paper: mm, or points (1 pt = 0.353 mm)">Size
		<span class="flex items-center gap-1">
			<input class="inp" type="number" min="1" step="0.5" value={g.sizeMm} onchange={(e) => num(e.currentTarget.value) && setGeom('Text size', { sizeMm: Math.max(1, Number(e.currentTarget.value)) })} /> mm
			<input class="inp" type="number" min="3" step="1" value={Math.round((g.sizeMm / PT) * 10) / 10} onchange={(e) => num(e.currentTarget.value) && setGeom('Text size', { sizeMm: Math.max(1, Math.round(Number(e.currentTarget.value) * PT * 100) / 100) })} /> pt
		</span></label>
	<span class="row">Align
		<span class="seg">
			{#each [['left', 'Left'], ['centre', 'Centre'], ['right', 'Right']] as [a, label] (a)}
				<button class:on={(g.align ?? 'left') === a} title="{label} of its point" onclick={() => setGeom('Text align', { align: a === 'left' ? undefined : a })}>{label}</button>
			{/each}
		</span></span>
	<label class="row" title="A box width: the text wraps inside it (and is cut off at its sides). Blank = no box, lines as typed. On a sheet paper mm, on a drawing its mm.">Box width (mm)
		<input class="inp" type="number" min="1" value={g.width ?? ''} placeholder="none" onchange={(e) => { const v = Number(e.currentTarget.value); setGeom(v > 0 ? 'Text box width' : 'No text box', { width: v > 0 ? v : undefined }) }} /></label>
{:else if g.kind === 'leader'}
	<label class="row" title="Its words (several lines: Enter) · double-click the leader (or F2) to type them on the drawing. {FIELDS_TIP}">Text
		<textarea class="inp" rows={Math.min(6, Math.max(2, (g.text ?? '').split('\n').length))} value={g.text ?? ''} placeholder="(none)" onchange={(e) => setGeom('Leader text', { text: e.currentTarget.value.replace(/\s+$/, '') || undefined })}></textarea></label>
	<span class="row" title="A callout: a frame round its words">Border
		<span class="seg">
			{#each [['', 'None'], ['underline', 'Underline'], ['box', 'Box']] as [b, label] (b)}
				<button class:on={(g.border ?? '') === b} onclick={() => setGeom('Callout border', { border: b || undefined })}>{label}</button>
			{/each}
		</span></span>
{:else if g.kind === 'cloud'}
	<label class="row">Arc (mm) <input class="inp" type="number" min="2" step="1" value={g.arcMm ?? 6} onchange={(e) => num(e.currentTarget.value) && setGeom('Cloud arcs', { arcMm: Math.max(2, Number(e.currentTarget.value)) })} /></label>
{:else if g.kind === 'dimension'}
	<label class="row">Measures
		<select class="inp" value={g.mode} onchange={(e) => setGeom('Dimension kind', { mode: e.currentTarget.value })}>
			<option value="aligned">along the two points</option><option value="horizontal">horizontal</option><option value="vertical">vertical</option>
		</select></label>
	<label class="row" title="Blank = the measured length">Text <input class="inp" value={g.text ?? ''} placeholder={measured < 10000 ? `${measured}` : `${(measured / 1000).toFixed(1)} m`} onchange={(e) => setGeom('Dimension text', { text: e.currentTarget.value.trim() || undefined })} /></label>
	{#if g.textAt || g.gapA != null || g.gapB != null}
		<div class="row"><span></span><button class="btn" title="Its text centred over its line again, and the extension lines' usual gaps (the grips moved them)" onclick={() => { const { textAt: _t, gapA: _a, gapB: _b, ...rest } = g; put('Reset dimension handles', { geom: rest as Shape['geom'] }) }}>Reset handles</button></div>
	{/if}
{/if}
<LayerPick {project} ids={[s.id]} />
</PropGroup>
<PropGroup kind="note" title="Style">
<Field label="Color" title="The note's color (its lines and text); By layer = its layer's / the usual color">
	<ColorPick value={s.style?.stroke} allowByLayer onchange={(v) => setStyle('Note color', { stroke: v })} /></Field>
{#if g.kind === 'text'}
	<Field label="Background" title="A filled box behind the text, so it reads over the drawing">
		<ColorPick value={s.style?.fill ?? 'none'} allowNone onchange={(v) => setStyle(v && v !== 'none' ? 'Text background' : 'No text background', { fill: v && v !== 'none' ? v : undefined })} /></Field>
{/if}
</PropGroup>

<style>
	.btn { justify-self: start; border: 1px solid var(--cad-line); border-radius: 4px; padding: 0 6px; background: var(--cad-input); color: var(--cad-text); }
	.seg { display: inline-flex; border: 1px solid var(--cad-line); border-radius: 4px; overflow: hidden; width: fit-content; }
	.seg button { padding: 0 8px; color: var(--cad-muted); }
	.seg button.on { background: #2563eb; color: white; }
</style>
