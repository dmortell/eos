<svelte:options namespace="svg" />

<script lang="ts">
	// Annotation shapes, rendered inside the tool render <svg> (shared real-mm space) so they pan,
	// zoom, and print with the content. Always visible; selectable/draggable only when `interactive`
	// (viewport active + Select tool). The background catcher / add-placement lives in
	// EditBackground; this layer only renders + moves existing annotations. `namespace="svg"` is
	// required because it is hosted via the render's {@render children} slot.
	import type { AnnotationEditor } from './annotations.svelte'
	import type { Annotation } from '../types'

	let { editor, interactive = false, locked = false, den = 1 }: { editor: AnnotationEditor; interactive?: boolean; locked?: boolean; den?: number } = $props()

	const PT = 25.4 / 72
	const mid = `mk-${Math.random().toString(36).slice(2, 7)}`
	// Text point-size → model-mm: paper points × scale-denominator, so text prints at its point size
	// and stays legible at any zoom (raw mm would be ~3mm = invisible in a metre-scale floorplan).
	let fontMm = $derived((pt: number) => pt * PT * (den || 1))

	function down(a: Annotation, e: MouseEvent) {
		if (!interactive || locked || e.button !== 0) return
		e.stopPropagation(); editor.move(a, e)
	}
	let pe = $derived(interactive && !locked ? 'auto' : 'none')

	// Transparent hit box (real-mm, padded) so small annotations are grabbable without pixel-precision.
	function hitBox(a: Annotation): { x: number; y: number; w: number; h: number } {
		const x2 = a.x2 ?? a.x, y2 = a.y2 ?? a.y
		let x = Math.min(a.x, x2), y = Math.min(a.y, y2), w = Math.abs(x2 - a.x), h = Math.abs(y2 - a.y)
		if (a.kind === 'text') { const f = fontMm(a.fontPt ?? 8); w = (a.text?.length || 1) * f * 0.6; h = f }
		else if (a.kind === 'symbol') { const R = 500; x = a.x - R; y = a.y - R; w = 2 * R; h = a.symbol === 'photo' ? 2.4 * R : 2 * R }
		const pad = Math.max(200, h * 0.6)
		return { x: x - pad, y: y - pad, w: w + 2 * pad, h: h + 2 * pad }
	}
</script>

<defs>
	<marker id={mid} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
		<path d="M0,0 L10,5 L0,10 z" fill="#dc2626" />
	</marker>
</defs>

{#each editor.annotations as a (a.id)}
	{@const sel = interactive && editor.isSel('ann', a.id)}
	{@const color = a.color ?? '#dc2626'}
	{@const hb = hitBox(a)}
	<g style:pointer-events="none">
		<!-- transparent hit target (handler on the element itself — SVG event delegation does not
		     reliably reach a handler on the wrapping <g> from a child) -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<rect x={hb.x} y={hb.y} width={hb.w} height={hb.h} fill="transparent" style:pointer-events={pe} style:cursor="move" onmousedown={(e: MouseEvent) => down(a, e)} />
		{#if a.kind === 'text'}
			<text x={a.x} y={a.y} font-size={fontMm(a.fontPt ?? 8)} fill={color} dominant-baseline="hanging">{a.text}</text>
		{:else if a.kind === 'arrow'}
			<line x1={a.x} y1={a.y} x2={a.x2 ?? a.x} y2={a.y2 ?? a.y} stroke={color} stroke-width="1.5" vector-effect="non-scaling-stroke" marker-end="url(#{mid})" />
		{:else if a.kind === 'rect'}
			{@const x = Math.min(a.x, a.x2 ?? a.x)}{@const y = Math.min(a.y, a.y2 ?? a.y)}
			<rect {x} {y} width={Math.abs((a.x2 ?? a.x) - a.x)} height={Math.abs((a.y2 ?? a.y) - a.y)} fill="none" stroke={color} stroke-width="1.5" vector-effect="non-scaling-stroke" />
		{:else if a.kind === 'symbol'}
			{@const R = 500}
			{#if a.symbol === 'photo'}
				<path d="M{a.x},{a.y} L{a.x - R * 0.8},{a.y + R * 1.4} L{a.x + R * 0.8},{a.y + R * 1.4} Z" fill="{color}22" stroke={color} stroke-width="1.5" vector-effect="non-scaling-stroke" />
				<circle cx={a.x} cy={a.y} r={R * 0.18} fill={color} />
			{:else if a.symbol === 'north'}
				<line x1={a.x} y1={a.y + R} x2={a.x} y2={a.y - R} stroke={color} stroke-width="1.5" vector-effect="non-scaling-stroke" marker-end="url(#{mid})" />
				<text x={a.x} y={a.y - R} font-size={R} fill={color} text-anchor="middle">N</text>
			{:else if a.symbol === 'outlet'}
				<circle cx={a.x} cy={a.y} r={R * 0.5} fill="{color}22" stroke={color} stroke-width="1.5" vector-effect="non-scaling-stroke" />
			{:else}
				<!-- section / detail markers -->
				<circle cx={a.x} cy={a.y} r={R} fill="white" stroke={color} stroke-width="1.5" vector-effect="non-scaling-stroke" stroke-dasharray={a.symbol === 'detail' ? '40 24' : undefined} />
				<text x={a.x} y={a.y} font-size={R * 0.9} fill={color} text-anchor="middle" dominant-baseline="middle">{a.link?.ref ?? '?'}</text>
			{/if}
		{/if}
		{#if sel}
			{@const bx = Math.min(a.x, a.x2 ?? a.x) - 400}{@const by = Math.min(a.y, a.y2 ?? a.y) - 400}
			<rect x={bx} y={by} width={Math.abs((a.x2 ?? a.x) - a.x) + 800} height={Math.abs((a.y2 ?? a.y) - a.y) + 800} fill="none" stroke="#06b6d4" stroke-width="1" stroke-dasharray="6 4" vector-effect="non-scaling-stroke" />
		{/if}
	</g>
{/each}
