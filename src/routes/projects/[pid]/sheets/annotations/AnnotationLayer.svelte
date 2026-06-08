<script lang="ts">
	import type { AnnotationEditor } from './annotations.svelte'
	import type { Annotation } from '../types'

	let { editor, active = false }: { editor: AnnotationEditor; active?: boolean } = $props()

	const PT = 25.4 / 72
	const mid = `mk-${Math.random().toString(36).slice(2, 7)}`
	let addMode = $derived(active && editor.tool !== 'select')

	function bg(e: MouseEvent) {
		if (e.button !== 0) return
		const w = editor.toWorld(e); if (!w) return
		e.stopPropagation()
		if (editor.tool === 'arrow' || editor.tool === 'rect') editor.startShape(w)
		else editor.click(w)
	}
	function down(a: Annotation, e: MouseEvent) {
		if (!active || editor.tool !== 'select' || e.button !== 0) return
		e.stopPropagation(); editor.move(a, e)
	}
	const sw = (n: number) => ({ 'stroke-width': n })
</script>

<defs>
	<marker id={mid} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
		<path d="M0,0 L10,5 L0,10 z" fill="#dc2626" />
	</marker>
</defs>

<!-- background catcher only while an add-tool is armed (so select-mode clicks fall through) -->
{#if addMode}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<!-- pe:auto needed because the overlay <svg> is pointer-events:none -->
	<rect x="-1e6" y="-1e6" width="2e6" height="2e6" fill="transparent" style:pointer-events="auto" style:cursor="crosshair" onmousedown={bg} />
{/if}

{#each editor.annotations as a (a.id)}
	{@const sel = active && editor.isSel('ann', a.id)}
	{@const pe = active && editor.tool === 'select' ? 'auto' : 'none'}
	{@const color = a.color ?? '#dc2626'}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<g style:pointer-events={pe} style:cursor="move" onmousedown={(e: MouseEvent) => down(a, e)}>
		{#if a.kind === 'text'}
			<text x={a.x} y={a.y} font-size={(a.fontPt ?? 8) * PT} fill={color} dominant-baseline="hanging">{a.text}</text>
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
