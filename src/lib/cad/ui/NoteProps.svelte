<!-- A NOTE's properties (text, leader, revision cloud, dimension) — on a sheet, a plan or an elevation: its words and
     size, its colour, a text's background (backlog "Notes on plans and diagrams"), a dimension's kind and text. -->
<script lang="ts">
	import type { CadProject } from '../app/project.svelte'
	import type { Shape } from '../domain/shapes'
	import { dimLine } from '../views/plan'

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
	const TITLE = { text: 'Text', leader: 'Leader', cloud: 'Revision cloud', dimension: 'Dimension' } as Record<string, string>
	const measured = $derived(g.kind === 'dimension' ? Math.round(dimLine(g).len) : 0)
</script>

<p class="font-semibold">{TITLE[g.kind] ?? 'Note'}</p>
{#if g.kind === 'text'}
	<label class="row">Text <input class="inp" value={g.text} onchange={(e) => e.currentTarget.value.trim() && setGeom('Text', { text: e.currentTarget.value.trim() })} /></label>
	<label class="row">Size (mm) <input class="inp" type="number" min="1" step="0.5" value={g.sizeMm} onchange={(e) => num(e.currentTarget.value) && setGeom('Text size', { sizeMm: Math.max(1, Number(e.currentTarget.value)) })} /></label>
{:else if g.kind === 'leader'}
	<label class="row">Text <input class="inp" value={g.text ?? ''} placeholder="(none)" onchange={(e) => setGeom('Leader text', { text: e.currentTarget.value.trim() || undefined })} /></label>
{:else if g.kind === 'cloud'}
	<label class="row">Arc (mm) <input class="inp" type="number" min="2" step="1" value={g.arcMm ?? 6} onchange={(e) => num(e.currentTarget.value) && setGeom('Cloud arcs', { arcMm: Math.max(2, Number(e.currentTarget.value)) })} /></label>
{:else if g.kind === 'dimension'}
	<label class="row">Measures
		<select class="inp" value={g.mode} onchange={(e) => setGeom('Dimension kind', { mode: e.currentTarget.value })}>
			<option value="aligned">along the two points</option><option value="horizontal">horizontal</option><option value="vertical">vertical</option>
		</select></label>
	<label class="row" title="Blank = the measured length">Text <input class="inp" value={g.text ?? ''} placeholder={measured < 1000 ? `${measured}` : `${(measured / 1000).toFixed(2)} m`} onchange={(e) => setGeom('Dimension text', { text: e.currentTarget.value.trim() || undefined })} /></label>
{/if}
<label class="row" title="The note's colour (its lines and text)">Colour
	<span class="flex items-center gap-1"><input type="color" value={s.style?.stroke ?? (g.kind === 'cloud' ? '#dc2626' : '#0f172a')} onchange={(e) => setStyle('Note colour', { stroke: e.currentTarget.value })} />
		{#if s.style?.stroke}<button class="btn" onclick={() => setStyle('Note colour', { stroke: undefined })}>Clear</button>{/if}</span></label>
{#if g.kind === 'text'}
	<label class="row" title="A filled box behind the text, so it reads over the drawing">Background
		<span class="flex items-center gap-1"><input type="checkbox" checked={!!s.style?.fill} onchange={(e) => setStyle(e.currentTarget.checked ? 'Text background' : 'No text background', { fill: e.currentTarget.checked ? '#ffffff' : undefined })} />
			{#if s.style?.fill}<input type="color" value={s.style.fill} onchange={(e) => setStyle('Text background', { fill: e.currentTarget.value })} />{/if}</span></label>
{/if}
<p class="text-zinc-500">Drag to move · Delete removes it</p>

<style>
	.row { display: grid; grid-template-columns: 6.5rem 1fr; align-items: center; gap: 0.25rem; }
	.inp { width: 100%; border: 1px solid var(--cad-line); border-radius: 4px; padding: 1px 4px; background: var(--cad-input); color: var(--cad-text); }
	.btn { border: 1px solid var(--cad-line); border-radius: 4px; padding: 0 6px; background: var(--cad-input); color: var(--cad-text); }
	.btn:hover { background: var(--cad-hover); }
</style>
