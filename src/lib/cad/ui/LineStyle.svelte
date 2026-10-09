<!-- A shape's LINE TYPE and LINEWEIGHT (backlog "Shape style", Dave 2026-10-05) — for one shape or several ("mixed"
     where they differ). "By layer" = the usual (its kind's) line. Drawn on screen, printed as set (mm) in PDF; DXF gets
     the line type. One undo step per edit. -->
<script lang="ts">
	import type { CadProject } from '../app/project.svelte'
	import type { Shape, LineEnd } from '../domain/shapes'
	import { DASHES, WEIGHTS } from '../views/display'

	let { project, shapes }: { project: CadProject; shapes: Shape[] } = $props()

	const shared = <T,>(f: (s: Shape) => T): T | null => { const v = new Set(shapes.map(f)); return v.size === 1 ? [...v][0] : null }
	const dash = $derived(shared((s) => s.style?.dash ?? ''))
	const weight = $derived(shared((s) => s.style?.weightMm ?? 0))
	const NAMES: Record<string, string> = { '': 'Solid (by layer)', dashed: 'Dashed', dotted: 'Dotted', dashdot: 'Dash-dot' }

	// end marks (arrow / dot / tick) — plain lines only
	const lines = $derived(shapes.every((s) => s.geom.kind === 'path' && !s.role))
	const endA = $derived(shared((s) => s.style?.ends?.a ?? '')), endB = $derived(shared((s) => s.style?.ends?.b ?? ''))
	const END_NAMES: Record<string, string> = { '': 'None', arrow: 'Arrow', dot: 'Dot', tick: 'Tick' }
	function setEnd(which: 'a' | 'b', v: string) {
		project.store.transact(shapes.length > 1 ? `Line ${which === 'a' ? 'start' : 'end'} (${shapes.length})` : `Line ${which === 'a' ? 'start' : 'end'}`, (tx) => {
			for (const s of shapes) {
				const ends = { ...s.style?.ends, [which]: (v || undefined) as LineEnd | undefined }
				if (!ends.a) delete ends.a
				if (!ends.b) delete ends.b
				const st: NonNullable<Shape['style']> = { ...s.style, ends }
				if (!Object.keys(ends).length) delete st.ends
				tx.put({ ...s, style: Object.keys(st).length ? st : undefined })
			}
		})
	}

	function set(label: string, patch: { dash?: string; weightMm?: number }) {
		project.store.transact(shapes.length > 1 ? `${label} (${shapes.length})` : label, (tx) => {
			for (const s of shapes) {
				const st: NonNullable<Shape['style']> = { ...s.style, ...patch }
				if (!st.dash) delete st.dash
				if (!st.weightMm) delete st.weightMm
				tx.put({ ...s, style: Object.keys(st).length ? st : undefined })
			}
		})
	}
</script>

<label class="row" title="Its line type (Solid = as usual)">Line type
	<select class="inp" value={dash ?? 'mixed'} onchange={(e) => { const v = e.currentTarget.value; if (v !== 'mixed') set('Line type', { dash: v || undefined }) }}>
		{#if dash === null}<option value="mixed">mixed</option>{/if}
		{#each ['', ...DASHES] as d (d)}<option value={d}>{NAMES[d]}</option>{/each}
	</select></label>
<label class="row" title="Its lineweight on paper (mm) — prints as set">Lineweight
	<select class="inp" value={weight === null ? 'mixed' : String(weight)} onchange={(e) => { const v = e.currentTarget.value; if (v !== 'mixed') set('Lineweight', { weightMm: Number(v) || undefined }) }}>
		{#if weight === null}<option value="mixed">mixed</option>{/if}
		<option value="0">By layer</option>
		{#each WEIGHTS as w (w)}<option value={String(w)}>{w} mm</option>{/each}
	</select></label>

{#if lines}
	{#each [['a', 'Start', endA], ['b', 'End', endB]] as [w, label, v] (w)}
		<label class="row" title="A mark on the line's {w === 'a' ? 'first point' : 'other end'}: an arrow, a dot or an architectural tick">{label}
			<select class="inp" value={v ?? 'mixed'} onchange={(e) => { const x = e.currentTarget.value; if (x !== 'mixed') setEnd(w as 'a' | 'b', x) }}>
				{#if v === null}<option value="mixed">mixed</option>{/if}
				{#each ['', 'arrow', 'dot', 'tick'] as m (m)}<option value={m}>{END_NAMES[m]}</option>{/each}
			</select></label>
	{/each}
{/if}

<style>
	.row { display: grid; grid-template-columns: 6.5rem 1fr; align-items: center; gap: 0.25rem; }
	.inp { width: 100%; border: 1px solid var(--cad-line); border-radius: 4px; padding: 1px 4px; background: var(--cad-input); color: var(--cad-text); }
</style>
