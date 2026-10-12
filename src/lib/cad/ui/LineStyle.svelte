<!-- A shape's LINE TYPE and LINEWEIGHT (backlog "Shape style", Dave 2026-10-05) — for one shape or several ("mixed"
     where they differ). "By layer" = the usual (its kind's) line. Drawn on screen, printed as set (mm) in PDF; DXF gets
     the line type. One undo step per edit. -->
<script lang="ts">
	import type { CadProject } from '../app/project.svelte'
	import type { Shape, LineEnd } from '../domain/shapes'
	import { DASHES, WEIGHTS } from '../views/display'
	import { shared, MIXED, plainLines } from './propsKit'

	let { project, shapes }: { project: CadProject; shapes: Shape[] } = $props()

	/** Not a real value: the "mixed" option. */
	const MIXED_KEY = '\u0000mixed'
	/** What they share, as the select's value (MIXED_KEY when they differ). */
	const keyOf = <T,>(f: (s: Shape) => T) => { const r = shared(shapes, f); return r.mixed ? MIXED_KEY : String(r.value) }
	const dash = $derived(keyOf((s) => s.style?.dash ?? ''))
	const weight = $derived(keyOf((s) => s.style?.weightMm ?? 0))
	const NAMES: Record<string, string> = { '': 'Solid (by layer)', dashed: 'Dashed', dotted: 'Dotted', dashdot: 'Dash-dot' }

	// end marks (arrow / dot / tick) — plain lines only
	const lines = $derived(plainLines(shapes))
	const endA = $derived(keyOf((s) => s.style?.ends?.a ?? '')), endB = $derived(keyOf((s) => s.style?.ends?.b ?? ''))
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
	<select class="inp" value={dash} onchange={(e) => { const v = e.currentTarget.value; if (v !== MIXED_KEY) set('Line type', { dash: v || undefined }) }}>
		{#if dash === MIXED_KEY}<option value={MIXED_KEY} disabled>{MIXED}</option>{/if}
		{#each ['', ...DASHES] as d (d)}<option value={d}>{NAMES[d]}</option>{/each}
	</select></label>
<label class="row" title="Its lineweight on paper (mm) — prints as set">Lineweight (mm)
	<select class="inp" value={weight} onchange={(e) => { const v = e.currentTarget.value; if (v !== MIXED_KEY) set('Lineweight', { weightMm: Number(v) || undefined }) }}>
		{#if weight === MIXED_KEY}<option value={MIXED_KEY} disabled>{MIXED}</option>{/if}
		<option value="0">By layer</option>
		{#each WEIGHTS as w (w)}<option value={String(w)}>{w} mm</option>{/each}
	</select></label>

{#if lines}
	{#each [['a', 'Start', endA], ['b', 'End', endB]] as [w, label, v] (w)}
		<label class="row" title="A mark on the line's {w === 'a' ? 'first point' : 'other end'}: an arrow, a dot or an architectural tick">{label}
			<select class="inp" value={v} onchange={(e) => { const x = e.currentTarget.value; if (x !== MIXED_KEY) setEnd(w as 'a' | 'b', x) }}>
				{#if v === MIXED_KEY}<option value={MIXED_KEY} disabled>{MIXED}</option>{/if}
				{#each ['', 'arrow', 'dot', 'tick'] as m (m)}<option value={m}>{END_NAMES[m]}</option>{/each}
			</select></label>
	{/each}
{/if}
