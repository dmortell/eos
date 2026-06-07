<script lang="ts">
	import { tick } from 'svelte'
	import type { Annotation } from '$lib/types/pages'

	/**
	 * Renders page annotations inside the paper coordinate space (1px = 1mm at
	 * zoom 1, like viewports + title block):
	 *   - `text` — HTML divs; select, drag (4px threshold), double-click to edit
	 *     inline. Font size is pt → mm so it prints at true point size.
	 *   - `arrow` — an SVG line + arrowhead with `vector-effect="non-scaling-stroke"`
	 *     so it's a crisp hairline at any zoom and in PDF; a transparent wide hit
	 *     line makes it easy to grab. Dragging moves the whole arrow.
	 * Selection chrome is `print:*` so it never reaches the PDF.
	 */
	let { annotations, selectedId, pxPerMm, paperW, paperH, onselect, onupdate }: {
		annotations: Annotation[]
		selectedId: string | null
		/** Canvas zoom (px per mm) — converts drag deltas to mm. */
		pxPerMm: number
		paperW: number
		paperH: number
		onselect: (id: string) => void
		onupdate: (id: string, patch: Partial<Annotation>) => void
	} = $props()

	const THRESHOLD = 4
	const PT_TO_MM = 25.4 / 72 // 1pt in mm — paper px == mm, so this is the px font size
	let drag = $state<{ id: string; mx: number; my: number; sx: number; sy: number; ex: number; ey: number; moved: boolean; handle?: 'start' | 'end' } | null>(null)
	let editingId = $state<string | null>(null)

	let textAnns = $derived(annotations.filter(a => a.kind === 'text'))
	let lineAnns = $derived(annotations.filter(a => (a.kind === 'arrow' || a.kind === 'dimension') && a.endMm))
	let cloudAnns = $derived(annotations.filter(a => a.kind === 'cloud' && a.endMm))
	let symbolAnns = $derived(annotations.filter(a => a.kind === 'symbol'))
	/** Annotations with an end point (eligible for endpoint/corner handles). */
	let endAnns = $derived(annotations.filter(a => a.kind !== 'text' && a.endMm))

	const BUMP = 4 // revision-cloud scallop radius (mm)
	/** Closed path tracing a rect perimeter with outward quadratic bumps (revision cloud). */
	function cloudPath(x0: number, y0: number, x1: number, y1: number): string {
		const minX = Math.min(x0, x1), maxX = Math.max(x0, x1)
		const minY = Math.min(y0, y1), maxY = Math.max(y0, y1)
		const corners = [[minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY]]
		const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2
		let d = ''
		let first = true
		for (let i = 0; i < 4; i++) {
			const [ax, ay] = corners[i]
			const [bx, by] = corners[(i + 1) % 4]
			const elen = Math.hypot(bx - ax, by - ay) || 1
			const n = Math.max(1, Math.round(elen / (2 * BUMP)))
			for (let j = 0; j < n; j++) {
				const sx = ax + (bx - ax) * (j / n), sy = ay + (by - ay) * (j / n)
				const ex = ax + (bx - ax) * ((j + 1) / n), ey = ay + (by - ay) * ((j + 1) / n)
				const mxp = (sx + ex) / 2, myp = (sy + ey) / 2
				let ox = mxp - cx, oy = myp - cy
				const ol = Math.hypot(ox, oy) || 1
				ox /= ol; oy /= ol
				if (first) { d += `M${sx},${sy}`; first = false }
				d += ` Q${mxp + ox * BUMP},${myp + oy * BUMP} ${ex},${ey}`
			}
		}
		return d + ' Z'
	}

	/** Drag the whole annotation, or one endpoint (`handle`) of a line annotation. */
	function startMove(e: MouseEvent, a: Annotation, handle?: 'start' | 'end') {
		if (e.button !== 0 || editingId === a.id) return
		e.stopPropagation() // don't let the canvas place/deselect
		onselect(a.id)
		drag = { id: a.id, mx: e.clientX, my: e.clientY, sx: a.positionMm.x, sy: a.positionMm.y, ex: a.endMm?.x ?? 0, ey: a.endMm?.y ?? 0, moved: false, handle }
		window.addEventListener('mousemove', onMove)
		window.addEventListener('mouseup', onUp)
	}
	function onMove(e: MouseEvent) {
		const d = drag
		if (!d) return
		if (!d.moved) {
			if (Math.hypot(e.clientX - d.mx, e.clientY - d.my) < THRESHOLD) return
			d.moved = true
		}
		const dx = (e.clientX - d.mx) / pxPerMm
		const dy = (e.clientY - d.my) / pxPerMm
		const a = annotations.find(x => x.id === d.id)
		const hasEnd = !!a?.endMm
		let patch: Partial<Annotation>
		if (d.handle === 'start') patch = { positionMm: { x: d.sx + dx, y: d.sy + dy } }
		else if (d.handle === 'end') patch = { endMm: { x: d.ex + dx, y: d.ey + dy } }
		else patch = { positionMm: { x: d.sx + dx, y: d.sy + dy }, ...(hasEnd ? { endMm: { x: d.ex + dx, y: d.ey + dy } } : {}) }
		onupdate(d.id, patch)
	}
	function onUp() {
		drag = null
		window.removeEventListener('mousemove', onMove)
		window.removeEventListener('mouseup', onUp)
	}
	async function startEdit(e: MouseEvent, a: Annotation) {
		e.stopPropagation()
		const el = e.currentTarget as HTMLElement
		editingId = a.id
		await tick() // wait for contenteditable to apply, then focus + select all
		el.focus()
		const r = document.createRange()
		r.selectNodeContents(el)
		const sel = getSelection()
		sel?.removeAllRanges()
		sel?.addRange(r)
	}
	function endEdit(e: FocusEvent, a: Annotation) {
		const txt = (e.currentTarget as HTMLElement).innerText.replace(/\n$/, '')
		editingId = null
		if (txt !== (a.text ?? '')) onupdate(a.id, { text: txt })
	}
</script>

<!-- Symbol geometry drawn in unit coords (centred at 0,0, ~±0.5) so it can be
     scaled by `sizeMm`. `currentColor` follows the group's `color`. -->
{#snippet symGeo(id: string)}
	{#if id === 'level'}
		<polygon points="0,0 0.2,-0.32 -0.2,-0.32" fill="currentColor" stroke="none" />
		<line x1="-0.5" y1="0" x2="0.5" y2="0" stroke="currentColor" vector-effect="non-scaling-stroke" />
	{:else if id === 'bubble'}
		<circle cx="0" cy="0" r="0.46" fill="white" stroke="currentColor" vector-effect="non-scaling-stroke" />
		<line x1="0" y1="-0.46" x2="0" y2="0.46" stroke="currentColor" vector-effect="non-scaling-stroke" stroke-dasharray="0.06 0.04" />
	{:else}
		<!-- north arrow -->
		<polygon points="0,-0.5 0.16,0.05 0,-0.06 -0.16,0.05" fill="currentColor" stroke="none" />
		<line x1="0" y1="0.05" x2="0" y2="0.42" stroke="currentColor" vector-effect="non-scaling-stroke" />
		<text x="0" y="0.62" font-size="0.26" text-anchor="middle" fill="currentColor" stroke="none">N</text>
	{/if}
{/snippet}

<!-- Vector annotations (arrows + dimensions + revision clouds) — one SVG in
     paper-mm. Visible hairline + transparent wide hit target for easy grabbing. -->
{#if lineAnns.length || cloudAnns.length || symbolAnns.length}
	<svg class="absolute top-0 left-0" width="{paperW}px" height="{paperH}px"
		viewBox="0 0 {paperW} {paperH}" preserveAspectRatio="none" style="overflow:visible">
		<defs>
			<marker id="ann-arrowhead" markerWidth="5" markerHeight="5" refX="4" refY="2.5"
				orient="auto-start-reverse" markerUnits="strokeWidth">
				<path d="M0,0 L5,2.5 L0,5 Z" fill="context-stroke" />
			</marker>
		</defs>

		{#each lineAnns as a (a.id)}
			{@const sx = a.positionMm.x}
			{@const sy = a.positionMm.y}
			{@const ex = a.endMm!.x}
			{@const ey = a.endMm!.y}
			{@const col = selectedId === a.id ? '#3b82f6' : (a.color ?? '#111827')}
			{@const sw = selectedId === a.id ? 1.75 : 1}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<line x1={sx} y1={sy} x2={ex} y2={ey} stroke="transparent" stroke-width="10"
				vector-effect="non-scaling-stroke" style="cursor:move; pointer-events:stroke" onmousedown={e => startMove(e, a)} />
			{#if a.kind === 'arrow'}
				<line x1={sx} y1={sy} x2={ex} y2={ey} stroke={col} stroke-width={sw}
					vector-effect="non-scaling-stroke" marker-end="url(#ann-arrowhead)" style="pointer-events:none" />
			{:else}
				{@const dx = ex - sx}
				{@const dy = ey - sy}
				{@const len = Math.hypot(dx, dy) || 1}
				{@const nx = -dy / len}
				{@const ny = dx / len}
				{@const tk = 2}
				{@const mx = (sx + ex) / 2}
				{@const my = (sy + ey) / 2}
				{@const rawDeg = Math.atan2(dy, dx) * 180 / Math.PI}
				{@const labDeg = rawDeg > 90 || rawDeg < -90 ? rawDeg + 180 : rawDeg}
				{@const lx = mx + nx * 3}
				{@const ly = my + ny * 3}
				{@const label = len >= 1000 ? `${(len / 1000).toFixed(2)} m` : `${Math.round(len)} mm`}
				<line x1={sx} y1={sy} x2={ex} y2={ey} stroke={col} stroke-width={sw} vector-effect="non-scaling-stroke" style="pointer-events:none" />
				<line x1={sx - nx * tk} y1={sy - ny * tk} x2={sx + nx * tk} y2={sy + ny * tk} stroke={col} stroke-width={sw} vector-effect="non-scaling-stroke" style="pointer-events:none" />
				<line x1={ex - nx * tk} y1={ey - ny * tk} x2={ex + nx * tk} y2={ey + ny * tk} stroke={col} stroke-width={sw} vector-effect="non-scaling-stroke" style="pointer-events:none" />
				<text x={lx} y={ly} font-size="3" fill={col} text-anchor="middle" dominant-baseline="middle"
					transform="rotate({labDeg} {lx} {ly})"
					style="pointer-events:none; paint-order:stroke" stroke="white" stroke-width="0.6">{label}</text>
			{/if}
		{/each}

		{#each cloudAnns as a (a.id)}
			{@const col = selectedId === a.id ? '#3b82f6' : (a.color ?? '#dc2626')}
			{@const sw = selectedId === a.id ? 1.75 : 1}
			{@const d = cloudPath(a.positionMm.x, a.positionMm.y, a.endMm!.x, a.endMm!.y)}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<path {d} fill="transparent" stroke="transparent" stroke-width="8"
				vector-effect="non-scaling-stroke" style="cursor:move; pointer-events:stroke" onmousedown={e => startMove(e, a)} />
			<path {d} fill="none" stroke={col} stroke-width={sw} vector-effect="non-scaling-stroke" style="pointer-events:none" />
		{/each}

		{#each symbolAnns as a (a.id)}
			{@const sz = a.sizeMm ?? 15}
			{@const col = selectedId === a.id ? '#3b82f6' : (a.color ?? '#111827')}
			<g transform="translate({a.positionMm.x} {a.positionMm.y}) rotate({a.rotationDeg ?? 0}) scale({sz})" style:color={col}>
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<circle r="0.6" fill="transparent" style="cursor:move; pointer-events:all" onmousedown={e => startMove(e, a)} />
				{@render symGeo(a.symbol ?? 'north')}
				{#if selectedId === a.id}
					<circle r="0.6" fill="none" stroke="#3b82f6" stroke-width="1" vector-effect="non-scaling-stroke" stroke-dasharray="3 2" />
				{/if}
			</g>
		{/each}

		<!-- Endpoint / corner handles for the selected vector annotation. -->
		{#each endAnns as a (a.id)}
			{#if selectedId === a.id}
				{@const hr = 4 / pxPerMm}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<circle cx={a.positionMm.x} cy={a.positionMm.y} r={hr} fill="white" stroke="#3b82f6" stroke-width={1.5 / pxPerMm}
					style="cursor:move; pointer-events:all" onmousedown={e => startMove(e, a, 'start')} />
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<circle cx={a.endMm!.x} cy={a.endMm!.y} r={hr} fill="white" stroke="#3b82f6" stroke-width={1.5 / pxPerMm}
					style="cursor:move; pointer-events:all" onmousedown={e => startMove(e, a, 'end')} />
			{/if}
		{/each}
	</svg>
{/if}

<!-- Text — HTML divs. -->
{#each textAnns as a (a.id)}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="absolute whitespace-pre leading-tight outline-offset-1 {selectedId === a.id ? 'outline-1 outline-blue-500 print:outline-none' : ''}"
		style:left="{a.positionMm.x}px"
		style:top="{a.positionMm.y}px"
		style:font-size="{(a.fontPt ?? 10) * PT_TO_MM}px"
		style:color={a.color ?? '#111827'}
		style:cursor={editingId === a.id ? 'text' : 'move'}
		contenteditable={editingId === a.id}
		onmousedown={e => startMove(e, a)}
		ondblclick={e => startEdit(e, a)}
		onblur={e => endEdit(e, a)}
	>{a.text ?? ''}</div>
{/each}
