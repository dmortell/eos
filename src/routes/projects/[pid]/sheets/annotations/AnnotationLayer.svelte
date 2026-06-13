<svelte:options namespace="svg" />

<script lang="ts">
	// Annotation shapes inside the tool render <svg> (shared real-mm). Always visible; selection,
	// move, resize/rotate and point-drag are enabled only when `interactive` (active + Select tool).
	// Box kinds (text/rect/cloud/symbol/callout/leader) get TransformBox handles; line kinds
	// (line/arrow/dimension) get PointHandles; callout/leader also get a pointer handle.
	import type { AnnotationEditor } from './annotations.svelte'
	import type { Annotation } from '../types'
	import { box, boxCentre, bounds, textMetrics, fontMmOf, dashArray, cloudPath } from './geometry'
	import TransformBox from '../edit/TransformBox.svelte'
	import PointHandles from '../edit/PointHandles.svelte'

	// `hidden` / `locked` are the viewport's off-layer id lists; each annotation is filtered by its
	// own layer (custom or the default 'annotations'), so annotations on different layers toggle
	// independently.
	let { editor, interactive = false, hidden = [], locked = [], den = 1 }: { editor: AnnotationEditor; interactive?: boolean; hidden?: string[]; locked?: string[]; den?: number } = $props()

	const HL = '#06b6d4'
	const mid = `mk-${Math.random().toString(36).slice(2, 7)}`
	const lyrOf = (a: Annotation) => a.layerId ?? 'annotations'
	const isLocked = (a: Annotation) => locked.includes(lyrOf(a))

	const BOX = new Set(['text', 'rect', 'ellipse', 'cloud', 'symbol', 'callout', 'leader'])
	const POINTER = new Set(['callout', 'leader']) // box kinds that also have a pointer target
	const LINE = new Set(['line', 'arrow', 'dimension'])
	const isBoxKind = (a: Annotation) => BOX.has(a.kind)

	function down(a: Annotation, e: MouseEvent, movePointer = true) {
		if (!interactive || isLocked(a) || e.button !== 0) return
		e.stopPropagation(); editor.move(a, e, movePointer)
	}
	function dbl(a: Annotation, e: MouseEvent) {
		if (!interactive || isLocked(a)) return
		e.stopPropagation(); editor.requestTextFocus(a)
	}
	const HAS_TEXT = new Set(['text', 'callout', 'leader'])
	const mk = (h?: string) => (h && h !== 'none' ? `url(#${mid}-${h})` : undefined)
	const nearestCorner = (b: { x: number; y: number; w: number; h: number }, tx: number, ty: number) => {
		const cs = [[b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.h], [b.x + b.w, b.y + b.h]]
		return cs.reduce((best, c) => (Math.hypot(c[0] - tx, c[1] - ty) < Math.hypot(best[0] - tx, best[1] - ty) ? c : best))
	}
</script>

<defs>
	<marker id="{mid}-arrow" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="3.5" markerHeight="3.5" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="context-stroke" /></marker>
	<marker id="{mid}-dot" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto"><circle cx="5" cy="5" r="4" fill="context-stroke" /></marker>
	<marker id="{mid}-tick" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="9" markerHeight="9" orient="auto"><path d="M2,8 L8,2" stroke="context-stroke" stroke-width="1.6" /></marker>
</defs>

{#each editor.annotations as a (a.id)}
	{@const lyr = lyrOf(a)}
	{#if !hidden.includes(lyr)}
	{@const pe = interactive && !locked.includes(lyr) ? 'auto' : 'none'}
	{@const sel = interactive && editor.isSel('ann', a.id)}
	{@const multi = interactive && editor.selAnns.includes(a.id)}
	{@const color = a.color ?? '#dc2626'}
	{@const b = bounds(a, den)}
	{@const cx = b.x + b.w / 2}{@const cy = b.y + b.h / 2}
	{@const rot = a.rotation ? `rotate(${a.rotation} ${cx} ${cy})` : undefined}

	<!-- shape -->
	<g transform={isBoxKind(a) ? rot : undefined} style:color={color}>
		{#if a.kind === 'text' || a.kind === 'callout' || a.kind === 'leader'}
			{@const m = textMetrics(a, den)}
			{@const tb = box(a, den)}
			{@const ax = a.align === 'center' ? tb.x + tb.w / 2 : a.align === 'right' ? tb.x + tb.w : tb.x}
			{@const anchor = a.align === 'center' ? 'middle' : a.align === 'right' ? 'end' : 'start'}
			{#if a.kind === 'callout' && a.border !== false}
				<rect x={tb.x} y={tb.y} width={tb.w} height={tb.h} fill={a.fill ?? 'white'} fill-opacity={a.fill ? undefined : 0.6} stroke={color} stroke-width=".2" vector-effect="non-scaling-stroke" />
			{/if}
			<text x={ax} y={tb.y + m.fontMm} font-size={m.fontMm} fill={color} text-anchor={anchor}>
				{#each m.lines as ln, i (i)}<tspan x={ax} dy={i === 0 ? 0 : m.lineH}>{ln || ' '}</tspan>{/each}
			</text>
		{:else if a.kind === 'rect'}
			<rect x={b.x} y={b.y} width={b.w} height={b.h} fill={a.fill ?? 'none'} stroke={color} stroke-width=".5" stroke-dasharray={dashArray(a.dash)} vector-effect="non-scaling-stroke" />
		{:else if a.kind === 'ellipse'}
			<ellipse cx={cx} cy={cy} rx={b.w / 2} ry={b.h / 2} fill={a.fill ?? 'none'} stroke={color} stroke-width=".5" stroke-dasharray={dashArray(a.dash)} vector-effect="non-scaling-stroke" />
		{:else if a.kind === 'cloud'}
			{@const r = Math.max(150, Math.min(b.w, b.h) / 6)}
			<path d={cloudPath(b.x, b.y, b.w, b.h, r)} fill={a.fill ?? 'none'} stroke={color} stroke-width=".5" vector-effect="non-scaling-stroke" />
		{:else if a.kind === 'symbol'}
			{@const R = Math.min(b.w, b.h) / 2}
			{#if a.symbol === 'photo'}
				<path d="M{cx},{cy - R} L{cx - R * 0.8},{cy + R * 0.7} L{cx + R * 0.8},{cy + R * 0.7} Z" fill={a.fill ?? color} fill-opacity={a.fill ? undefined : 0.13} stroke={color} stroke-width=".5" vector-effect="non-scaling-stroke" />
				<circle cx={cx} cy={cy - R * 0.1} r={R * 0.18} fill={color} />
			{:else if a.symbol === 'north'}
				<line x1={cx} y1={cy + R} x2={cx} y2={cy - R} stroke={color} stroke-width="1.5" vector-effect="non-scaling-stroke" marker-end="url(#{mid}-arrow)" />
				<text x={cx} y={cy - R} font-size={R} fill={color} text-anchor="middle">N</text>
			{:else if a.symbol === 'outlet'}
				<circle cx={cx} cy={cy} r={R * 0.7} fill={a.fill ?? color} fill-opacity={a.fill ? undefined : 0.13} stroke={color} stroke-width=".5" vector-effect="non-scaling-stroke" />
			{:else if a.symbol === 'faceplate'}
				{@const pw = b.w * 0.6}{@const ph = b.h * 0.85}{@const ps = pw * 0.32}
				<rect x={cx - pw / 2} y={cy - ph / 2} width={pw} height={ph} rx={pw * 0.08} fill={a.fill ?? 'white'} stroke={color} stroke-width=".5" vector-effect="non-scaling-stroke" />
				<rect x={cx - ps / 2} y={cy - ph * 0.3} width={ps} height={ps} fill={color} fill-opacity="0.55" stroke={color} stroke-width=".1" vector-effect="non-scaling-stroke" />
				<rect x={cx - ps / 2} y={cy + ph * 0.3 - ps} width={ps} height={ps} fill={color} fill-opacity="0.55" stroke={color} stroke-width=".1" vector-effect="non-scaling-stroke" />
			{:else if a.symbol === 'door'}
				{@const dir = a.flip ? -1 : 1}{@const hx = a.flip ? b.x + b.w : b.x}{@const hy = b.y + b.h}
				<line x1={hx} y1={hy} x2={hx} y2={b.y} stroke={color} stroke-width="1.2" vector-effect="non-scaling-stroke" />
				<path d="M{hx},{b.y} A {b.h},{b.h} 0 0 {a.flip ? 0 : 1} {hx + dir * b.h},{hy}" fill="none" stroke={color} stroke-width="0.5" stroke-dasharray="20 12" vector-effect="non-scaling-stroke" />
			{:else}
				<circle cx={cx} cy={cy} r={R} fill={a.fill ?? 'white'} stroke={color} stroke-width=".5" vector-effect="non-scaling-stroke" stroke-dasharray={a.symbol === 'detail' ? '40 24' : undefined} />
				<text x={cx} y={cy} font-size={R * 0.9} fill={color} text-anchor="middle" dominant-baseline="middle">{a.link?.ref ?? '?'}</text>
			{/if}
		{/if}
	</g>

	<!-- pointer leader for callout/leader. The fat transparent overlay is a grab target:
	     dragging the line moves the whole callout (box + arrow tip) together. -->
	{#if POINTER.has(a.kind) && a.x2 != null}
		{@const tb = box(a, den)}{@const c = nearestCorner(tb, a.x2, a.y2 ?? a.y)}
		<line x1={c[0]} y1={c[1]} x2={a.x2} y2={a.y2} stroke={color} style:color={color} stroke-width=".5" stroke-dasharray={dashArray(a.dash)} vector-effect="non-scaling-stroke" marker-end={mk(a.end ?? 'arrow')} />
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<line x1={c[0]} y1={c[1]} x2={a.x2} y2={a.y2} stroke="transparent" stroke-width="200" style:pointer-events={pe} style:cursor="move" onmousedown={(e: MouseEvent) => down(a, e, true)} />
	{/if}

	<!-- line / arrow / dimension -->
	{#if LINE.has(a.kind)}
		{@const x2 = a.x2 ?? a.x}{@const y2 = a.y2 ?? a.y}
		{#if a.kind === 'dimension'}
			{@const dist = Math.round(Math.hypot(x2 - a.x, y2 - a.y))}
			{@const mx = (a.x + x2) / 2}{@const my = (a.y + y2) / 2}
			{@const ang = (Math.atan2(y2 - a.y, x2 - a.x) * 180) / Math.PI}
			{@const f = fontMmOf(a, den)}
			<line x1={a.x} y1={a.y} x2={x2} y2={y2} stroke={color} style:color={color} stroke-width=".5" vector-effect="non-scaling-stroke" marker-start="url(#{mid}-arrow)" marker-end="url(#{mid}-arrow)" />
			<text x={mx} y={my} transform="rotate({ang} {mx} {my})" dy={-f * 0.4} font-size={f} fill={color} text-anchor="middle">{dist}mm</text>
		{:else}
			<line x1={a.x} y1={a.y} x2={x2} y2={y2} stroke={color} style:color={color} stroke-width=".5" stroke-dasharray={dashArray(a.dash)} vector-effect="non-scaling-stroke" marker-start={mk(a.start)} marker-end={mk(a.end)} />
		{/if}
	{/if}

	<!-- hit target (move / select). Outline-only for cloud/rect so objects *inside* them stay
	     selectable; filled box for text/symbol/callout. -->
	{#if a.kind === 'cloud'}
		{@const r = Math.max(150, Math.min(b.w, b.h) / 6)}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<g transform={rot}><path d={cloudPath(b.x, b.y, b.w, b.h, r)} fill="none" stroke="transparent" stroke-width="300" style:pointer-events={pe} style:cursor="move" onmousedown={(e: MouseEvent) => down(a, e)} /></g>
	{:else if a.kind === 'rect'}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<g transform={rot}><rect x={b.x} y={b.y} width={b.w} height={b.h} fill="none" stroke="transparent" stroke-width="300" style:pointer-events={pe} style:cursor="move" onmousedown={(e: MouseEvent) => down(a, e)} /></g>
	{:else if a.kind === 'ellipse'}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<g transform={rot}><ellipse cx={cx} cy={cy} rx={b.w / 2} ry={b.h / 2} fill="none" stroke="transparent" stroke-width="300" style:pointer-events={pe} style:cursor="move" onmousedown={(e: MouseEvent) => down(a, e)} /></g>
	{:else if isBoxKind(a)}
		<!-- For callout/leader, dragging the box moves only the box (arrow tip stays put);
		     double-click jumps focus to the text field in the properties panel. -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<g transform={rot}><rect x={b.x - 60} y={b.y - 60} width={b.w + 120} height={b.h + 120} fill="transparent" style:pointer-events={pe} style:cursor="move" onmousedown={(e: MouseEvent) => down(a, e, !POINTER.has(a.kind))} ondblclick={HAS_TEXT.has(a.kind) ? (e: MouseEvent) => dbl(a, e) : undefined} /></g>
	{:else}
		{@const x2 = a.x2 ?? a.x}{@const y2 = a.y2 ?? a.y}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<line x1={a.x} y1={a.y} x2={x2} y2={y2} stroke="transparent" stroke-width="240" style:pointer-events={pe} style:cursor="move" onmousedown={(e: MouseEvent) => down(a, e)} />
	{/if}

	<!-- marquee multi-select highlight (a plain outline; full transform handles are single-select) -->
	{#if multi && !sel}
		<rect x={b.x} y={b.y} width={b.w} height={b.h} transform={rot} fill="none" stroke={HL} stroke-width=".5" stroke-dasharray="6 4" vector-effect="non-scaling-stroke" style:pointer-events="none" />
	{/if}

	<!-- selection handles -->
	{#if sel}
		{#if isBoxKind(a)}
			<TransformBox {editor} box={box(a, den)} rotation={a.rotation ?? 0}
				onresize={(_h, nb) => editor.setBox(a, nb)} onrotate={(d) => editor.setRotation(a, d)} />
			{#if POINTER.has(a.kind) && a.x2 != null}
				<PointHandles {editor} points={[{ x: a.x2, y: a.y2 ?? a.y }]} onmove={(_i, x, y) => editor.movePoint(a, 1, x, y)} />
			{/if}
		{:else}
			<PointHandles {editor} points={[{ x: a.x, y: a.y }, { x: a.x2 ?? a.x, y: a.y2 ?? a.y }]} onmove={(i, x, y) => editor.movePoint(a, i, x, y)} />
		{/if}
	{/if}
	{/if}
{/each}
