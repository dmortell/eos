<svelte:options namespace="svg" />

<script lang="ts">
	// Annotation shapes inside the tool render <svg> (shared real-mm). Always visible; selection,
	// move, resize/rotate and point-drag are enabled only when `interactive` (active + Select tool).
	// Box kinds (text/rect/cloud/symbol/callout/leader) get TransformBox handles; line kinds
	// (line/arrow/dimension) get PointHandles; callout/leader also get a pointer handle.
	import type { AnnotationEditor } from './annotations.svelte'
	import type { Annotation } from '../types'
	import { box, boxCentre, bounds, textMetrics, fontMmOf, dashArray, dashCap, cloudPath } from './geometry'
	import { usageAbbr } from './outlet'
	import TransformBox from '../edit/TransformBox.svelte'
	import PointHandles from '../edit/PointHandles.svelte'

	// `hidden` / `locked` are the viewport's off-layer id lists; each annotation is filtered by its
	// own layer (custom or the default 'annotations'), so annotations on different layers toggle
	// independently.
	let { editor, interactive = false, hidden = [], locked = [], groupBox = false, den = 1, zoom = 1, objCount }: { editor: AnnotationEditor; interactive?: boolean; hidden?: string[]; locked?: string[]; groupBox?: boolean; den?: number; zoom?: number; objCount?: (layerId: string) => number } = $props()

	const SW = 0.1;		// default stroke width
	const HL = '#2563eb' // blue, matching object selection
	// Zoom-counter-scaled stroke so the multi-select box matches TransformBox exactly.
	const ss = $derived((zoom, editor.screenScale()) || 1)
	const mid = `mk-${Math.random().toString(36).slice(2, 7)}`
	const lyrOf = (a: Annotation) => a.layerId ?? 'annotations'
	const isLocked = (a: Annotation) => locked.includes(lyrOf(a))

	const BOX = new Set(['text', 'rect', 'ellipse', 'cloud', 'symbol', 'callout', 'image', 'grid', 'legend'])
	const POINTER = new Set(['callout']) // box kinds that also have a pointer target
	const LINE = new Set(['line', 'arrow', 'dimension'])
	const isBoxKind = (a: Annotation) => BOX.has(a.kind)
	// Callout text decoration (tolerates the legacy boolean border).
	const calloutBorder = (a: Annotation): 'none' | 'underline' | 'box' => {
		const b = a.border as unknown
		return (b === true || b === 'box') ? 'box' : (b === 'underline' ? 'underline' : 'none')
	}

	function down(a: Annotation, e: MouseEvent, movePointer = true) {
		if (!interactive || isLocked(a)) return
		if (e.button === 2) {
			// Right-click selects this annotation (so the context menu acts on what you clicked) unless
			// it's already selected. No stopProp → empty-area right-drag still pans.
			if (!editor.selAnns.includes(a.id) && !editor.isSel('ann', a.id)) { editor.select('ann', a.id); editor.clearMulti(); editor.peer?.clearMulti() }
			return
		}
		if (e.button !== 0) return
		e.stopPropagation(); editor.move(a, e, movePointer)
	}
	function dbl(a: Annotation, e: MouseEvent) {
		if (!interactive || isLocked(a)) return
		e.stopPropagation(); editor.requestTextFocus(a)
	}
	const HAS_TEXT = new Set(['text', 'callout'])
	// Legend (kind:'legend'): auto-rows from the layers; count = annotations filed on each layer.
	const lyrCount = (id: string) => editor.annotations.filter((x) => (x.layerId ?? 'annotations') === id).length
	const mk = (h?: string) => (h && h !== 'none' ? `url(#${mid}-${h})` : undefined)
	// Grid line positions: multiples of `size` (+ offset, aligned to the building origin) inside [start, start+len].
	const gridLines = (start: number, len: number, size: number, off: number) => {
		const out: number[] = []
		if (size <= 0) return out
		for (let g = Math.ceil((start - off) / size) * size + off; g <= start + len + 0.001; g += size) out.push(g)
		return out
	}
	// Dimension label text in the project's unit (mm/m/km/none).
	const fmtDim = (mm: number) => {
		const u = editor.annoDefaults?.dimUnit ?? 'mm'
		if (u === 'none') return `${Math.round(mm)}`
		if (u === 'm') return `${(mm / 1000).toFixed(2)}m`
		if (u === 'km') return `${(mm / 1e6).toFixed(3)}km`
		return `${Math.round(mm)}mm`
	}
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

<!-- Shared text renderers: `caption` = one-line label (dimension value, symbol labels/refs),
     `textBlock` = the multi-line text body (text + callout). One code path, many callers. -->
{#snippet caption(p: { x: number; y: number; size: number; fill: string; text: string | number; anchor?: string; baseline?: string; dy?: number; weight?: number; transform?: string })}
	<text x={p.x} y={p.y} dy={p.dy} font-size={p.size} fill={p.fill} text-anchor={p.anchor ?? 'middle'}
		dominant-baseline={p.baseline} font-weight={p.weight} transform={p.transform} style:pointer-events="none">{p.text}</text>
{/snippet}
{#snippet textBlock(x: number, topY: number, m: { fontMm: number; lineH: number; lines: string[] }, fill: string, anchor: string)}
	<text {x} y={topY + m.fontMm} font-size={m.fontMm} {fill} text-anchor={anchor}>
		{#each m.lines as ln, i (i)}<tspan {x} dy={i === 0 ? 0 : m.lineH}>{ln || ' '}</tspan>{/each}
	</text>
{/snippet}

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
		{#if a.kind === 'text' || a.kind === 'callout'}
			{@const m = textMetrics(a, den)}
			{@const tb = box(a, den)}
			{@const ax = a.align === 'center' ? tb.x + tb.w / 2 : a.align === 'right' ? tb.x + tb.w : tb.x}
			{@const anchor = a.align === 'center' ? 'middle' : a.align === 'right' ? 'end' : 'start'}
			{@const cb = a.kind === 'callout' ? calloutBorder(a) : 'none'}
			{#if cb === 'box'}
				<rect x={tb.x} y={tb.y} width={tb.w} height={tb.h} fill={a.fill ?? 'white'} fill-opacity={a.fill ? undefined : 0.6} stroke={color} stroke-width={SW} vector-effect="non-scaling-stroke" />
			{/if}
			{@render textBlock(ax, tb.y, m, color, anchor)}
			{#if cb === 'underline'}
				<line x1={tb.x} y1={tb.y + tb.h} x2={tb.x + tb.w} y2={tb.y + tb.h} stroke={color} stroke-width={SW} vector-effect="non-scaling-stroke" />
			{/if}
		{:else if a.kind === 'grid'}
			{@const gs = a.grid?.size || 500}
			<!-- 28a: a floor grid takes its colour from its LAYER (not a props colour). -->
			{@const gc = editor.layers.find((l) => l.id === lyr)?.color ?? '#9ca3af'}
			<rect x={b.x} y={b.y} width={b.w} height={b.h} fill={a.fill ?? 'none'} stroke={gc} stroke-width=".5" vector-effect="non-scaling-stroke" />
			{#each gridLines(b.x, b.w, gs, a.grid?.ox ?? 0) as gx (gx)}
				<line x1={gx} y1={b.y} x2={gx} y2={b.y + b.h} stroke={gc} stroke-width=".25" vector-effect="non-scaling-stroke" />
			{/each}
			{#each gridLines(b.y, b.h, gs, a.grid?.oy ?? 0) as gy (gy)}
				<line x1={b.x} y1={gy} x2={b.x + b.w} y2={gy} stroke={gc} stroke-width=".25" vector-effect="non-scaling-stroke" />
			{/each}
		{:else if a.kind === 'legend'}
			{@const lg = a.legend ?? {}}
			{@const exc = new Set(lg.exclude ?? [])}
			{@const rows = editor.layers.filter((l) => !exc.has(l.id))}
			{@const fm = fontMmOf(a, den)}
			{@const pad = fm * 0.6}{@const rh = fm * 1.5}
			{@const maxRows = Math.max(0, Math.floor((b.h - pad - rh) / rh))}
			<rect x={b.x} y={b.y} width={b.w} height={b.h} fill={a.fill ?? 'white'} fill-opacity={a.fill ? undefined : 0.92} stroke={color} stroke-width={a.strokeWidth ?? 0.5} vector-effect="non-scaling-stroke" />
			{@render caption({ x: b.x + pad, y: b.y + pad + fm * 0.95, size: fm * 1.1, fill: color, weight: 700, anchor: 'start', text: lg.title || 'Legend' })}
			{#each rows.slice(0, maxRows) as l, i (l.id)}
				{@const ry = b.y + pad + rh * (i + 1)}
				<rect x={b.x + pad} y={ry + rh * 0.1} width={fm} height={fm} fill={l.color} stroke={color} stroke-width=".2" vector-effect="non-scaling-stroke" />
				{@render caption({ x: b.x + pad + fm * 1.6, y: ry + fm, size: fm, fill: color, anchor: 'start', text: lg.showCount === false ? l.name : `${l.name} (${(objCount?.(l.id) ?? 0) + lyrCount(l.id)})` })}
			{/each}
		{:else if a.kind === 'rect'}
			<rect x={b.x} y={b.y} width={b.w} height={b.h} fill={a.fill ?? 'none'} stroke={color} stroke-width={a.strokeWidth ?? SW} stroke-dasharray={dashArray(a.dash)} stroke-linecap={dashCap(a.dash)} vector-effect="non-scaling-stroke" />
		{:else if a.kind === 'ellipse'}
			<ellipse cx={cx} cy={cy} rx={b.w / 2} ry={b.h / 2} fill={a.fill ?? 'none'} stroke={color} stroke-width={a.strokeWidth ?? SW} stroke-dasharray={dashArray(a.dash)} stroke-linecap={dashCap(a.dash)} vector-effect="non-scaling-stroke" />
		{:else if a.kind === 'cloud'}
			{@const r = Math.max(150, Math.min(b.w, b.h) / 6)}
			<path d={cloudPath(b.x, b.y, b.w, b.h, r)} fill={a.fill ?? 'none'} stroke={color} stroke-width={SW*2} vector-effect="non-scaling-stroke" />
		{:else if a.kind === 'symbol'}
			{@const R = Math.min(b.w, b.h) / 2}
			{#if a.symbol === 'photo'}
				<path d="M{cx},{cy - R} L{cx - R * 0.8},{cy + R * 0.7} L{cx + R * 0.8},{cy + R * 0.7} Z" fill={a.fill ?? color} fill-opacity={a.fill ? undefined : 0.13} stroke={color} stroke-width={SW} vector-effect="non-scaling-stroke" />
				<circle cx={cx} cy={cy - R * 0.1} r={R * 0.18} fill={color} />
			{:else if a.symbol === 'north'}
				<line x1={cx} y1={cy + R} x2={cx} y2={cy - R} stroke={color} stroke-width={SW} vector-effect="non-scaling-stroke" marker-end="url(#{mid}-arrow)" />
				{@render caption({ x: cx, y: cy - R, size: R, fill: color, text: 'N' })}
			{:else if a.symbol === 'outlet'}
				{@const o = a.outlet ?? {}}
				{@const oc = a.color ?? editor.layers.find((l) => l.id === lyr)?.color ?? color}
				{@const mt = o.mount ?? 'box'}
				{@const low = (o.level ?? 'low') === 'low'}
				{@const sw = low ? 0.5 : 1}
				<!-- equilateral triangle pointing DOWN, circumradius tR (~20% smaller). The
				     circle is its circumcircle and the square wraps its width. Container +
				     triangle are filled with the layer colour; the triangle keeps a white
				     edge + white port count so it stays legible on the filled container. -->
				{@const tR = R * 0.52}
				{@const hw = tR * 0.866}
				{@const tri = `M${cx},${cy + tR} L${cx - hw},${cy - tR * 0.5} L${cx + hw},${cy - tR * 0.5} Z`}
				{#if mt === 'floor'}
					<rect x={cx - hw} y={cy + tR * 0.25 - hw} width={hw * 2} height={hw * 2} fill={oc} fill-opacity={low ? 0.85 : 0.4} stroke={oc} stroke-width={sw} vector-effect="non-scaling-stroke" />
				{:else if mt === 'box'}
					<circle cx={cx} cy={cy} r={tR} fill={oc} fill-opacity={low ? 0.85 : 0.4} stroke={oc} stroke-width={sw} vector-effect="non-scaling-stroke" />
				{/if}
				<path d={tri} fill={oc} stroke="#000" stroke-width={sw * 0.45} vector-effect="non-scaling-stroke" stroke-linejoin="round" />
				<!-- ports count, in the (wide, upper) part of the down-triangle -->
				{@render caption({ x: cx, y: cy + tR * 0.1, size: tR * 1.2, fill: 'white', baseline: 'middle', weight: 600, text: o.ports ?? 2 })}
				<!-- label above -->
				{#if a.text}{@render caption({ x: cx, y: cy - R * 0.42, size: R * 0.5, fill: oc, text: a.text })}{/if}
				<!-- usage abbrev below (blank for network) -->
				{#if usageAbbr(o.usage)}{@render caption({ x: cx, y: cy + R * 0.94, size: R * 0.45, fill: oc, text: usageAbbr(o.usage) })}{/if}
			{:else if a.symbol === 'faceplate'}
				{@const pw = b.w * 0.6}{@const ph = b.h * 0.85}{@const ps = pw * 0.32}
				<rect x={cx - pw / 2} y={cy - ph / 2} width={pw} height={ph} rx={pw * 0.0} fill={a.fill ?? 'white'} stroke={color} stroke-width={SW} vector-effect="non-scaling-stroke" />
				<rect x={cx - ps / 2} y={cy - ph * 0.3} width={ps} height={ps} fill={color} fill-opacity="0.55" stroke={color} stroke-width={SW} vector-effect="non-scaling-stroke" />
				<rect x={cx - ps / 2} y={cy + ph * 0.3 - ps} width={ps} height={ps} fill={color} fill-opacity="0.55" stroke={color} stroke-width={SW} vector-effect="non-scaling-stroke" />
			{:else if a.symbol === 'elevation'}
				<!-- elevation/section tag: centre circle = drawing no. (link.ref). Up to 4
				     directional arrows (a.arms n/e/s/w). Each arm is a 45°/45°/90° corner of
				     a square (rotated 45°) circumscribing the circle: tip on the cardinal axis
				     at cr·√2, the two 45° sides running down to the circle's tangent points
				     (at the diagonals), no base. Defaults to a single south arrow (a.text)
				     when no arms are set, so existing tags keep working. -->
				{@const cr = R * 0.5}
				{@const t = cr / Math.SQRT2}
				{@const d = cr * Math.SQRT2}
				{@const arms = a.arms ?? (a.text ? { s: a.text } : { s: '' })}
				{@const DIRS = [['n', 0, -1], ['e', 1, 0], ['s', 0, 1], ['w', -1, 0]] as const}
				{#each DIRS as [dir, ux, uy] (dir)}
					{#if (arms as any)[dir] != null}
						<!-- tangent corner → tip → tangent corner; two 45° sides only, no base -->
						<path d="M{cx + (ux - uy) * t},{cy + (ux + uy) * t} L{cx + ux * d},{cy + uy * d} L{cx + (ux + uy) * t},{cy + (uy - ux) * t}"
							fill="none" stroke={color} stroke-width={SW} vector-effect="non-scaling-stroke" stroke-linejoin="round" />
						<!-- ref label between circle edge and tip -->
						{@render caption({ x: cx + ux * cr * 1.18, y: cy + uy * cr * 1.18, size: cr * 0.5, fill: color, baseline: 'central', text: (arms as any)[dir] || '–' })}
					{/if}
				{/each}
				<circle cx={cx} cy={cy} r={cr} fill={a.fill ?? 'white'} stroke={color} stroke-width={SW} vector-effect="non-scaling-stroke" />
				{@render caption({ x: cx, y: cy, size: cr * 0.95, fill: color, baseline: 'middle', text: a.link?.ref ?? '?' })}
			{:else if a.symbol === 'door'}
				{@const dir = a.flip ? -1 : 1}{@const hx = a.flip ? b.x + b.w : b.x}{@const hy = b.y + b.h}
				<line x1={hx} y1={hy} x2={hx} y2={b.y} stroke={color} stroke-width={SW} vector-effect="non-scaling-stroke" />
				<path d="M{hx},{b.y} A {b.h},{b.h} 0 0 {a.flip ? 0 : 1} {hx + dir * b.h},{hy}" fill="none" stroke={color} stroke-width={SW} vector-effect="non-scaling-stroke" />
			{:else}
				<circle cx={cx} cy={cy} r={R} fill={a.fill ?? 'white'} stroke={color} stroke-width=".5" vector-effect="non-scaling-stroke" stroke-dasharray={a.symbol === 'detail' ? '40 24' : undefined} />
				{@render caption({ x: cx, y: cy, size: R * 0.9, fill: color, baseline: 'middle', text: a.link?.ref ?? '?' })}
			{/if}
		{:else if a.kind === 'image'}
			{#if a.src}
				<image href={a.src} x={b.x} y={b.y} width={b.w} height={b.h} preserveAspectRatio="xMidYMid meet" />
			{:else}
				<rect x={b.x} y={b.y} width={b.w} height={b.h} fill="#f8fafc" stroke={color} stroke-width={SW} stroke-dasharray="8 5" vector-effect="non-scaling-stroke" />
				{@render caption({ x: cx, y: cy, size: Math.min(b.w, b.h) / 6, fill: '#94a3b8', baseline: 'central', text: 'image — set URL' })}
			{/if}
		{/if}
	</g>

	<!-- pointer leader for callout/leader. The fat transparent overlay is a grab target:
	     dragging the line moves the whole callout (box + arrow tip) together. -->
	{#if POINTER.has(a.kind) && a.x2 != null}
		{@const tb = box(a, den)}{@const c = nearestCorner(tb, a.x2, a.y2 ?? a.y)}
		<line x1={c[0]} y1={c[1]} x2={a.x2} y2={a.y2} stroke={color} style:color={color} stroke-width={a.strokeWidth ?? SW*2} stroke-dasharray={dashArray(a.dash)} stroke-linecap={dashCap(a.dash)} vector-effect="non-scaling-stroke" marker-end={mk(a.end ?? 'arrow')} />
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<line x1={c[0]} y1={c[1]} x2={a.x2} y2={a.y2} stroke="transparent" stroke-width="200" style:pointer-events={pe} style:cursor="move" onmousedown={(e: MouseEvent) => down(a, e, true)} />
	{/if}

	<!-- line / arrow / dimension — one path. Dimension auto-labels its length (+arrow heads by
	     default); line/arrow show the optional user label (a.text) along the segment. -->
	{#if LINE.has(a.kind)}
		{@const x2 = a.x2 ?? a.x}{@const y2 = a.y2 ?? a.y}
		{@const isDim = a.kind === 'dimension'}
		{@const hd = isDim ? 'arrow' : 'none'}
		<line x1={a.x} y1={a.y} x2={x2} y2={y2} stroke={color} style:color={color} stroke-width={a.strokeWidth ?? SW}
			stroke-dasharray={dashArray(a.dash)} stroke-linecap={dashCap(a.dash)} vector-effect="non-scaling-stroke"
			marker-start={mk(a.start ?? hd)} marker-end={mk(a.end ?? hd)} />
		{@const lbl = isDim ? fmtDim(Math.hypot(x2 - a.x, y2 - a.y)) : (a.text ?? '')}
		{#if lbl}
			{@const t = a.labelPos === 'start' ? 0.15 : a.labelPos === 'end' ? 0.85 : 0.5}
			{@const lx = a.x + (x2 - a.x) * t}{@const ly = a.y + (y2 - a.y) * t}
			{@const ang = (Math.atan2(y2 - a.y, x2 - a.x) * 180) / Math.PI}
			{@const f = fontMmOf(a, den)}
			{@render caption({ x: lx, y: ly, dy: -f * 0.4, size: f, fill: color, transform: `rotate(${ang} ${lx} ${ly})`, text: lbl })}
		{/if}
	{/if}

	<!-- hit target (move / select). Outline-only for cloud/rect so objects *inside* them stay
	     selectable; filled box for text/symbol/callout. -->
	{#if a.kind === 'cloud'}
		{@const r = Math.max(150, Math.min(b.w, b.h) / 6)}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<g transform={rot}><path d={cloudPath(b.x, b.y, b.w, b.h, r)} fill="none" stroke="transparent" stroke-width="300" style:pointer-events={pe} style:cursor="move" onmousedown={(e: MouseEvent) => down(a, e)} /></g>
	{:else if a.kind === 'rect' || a.kind === 'grid'}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<g transform={rot}><rect x={b.x} y={b.y} width={b.w} height={b.h} fill="none" stroke="transparent" stroke-width="300" style:pointer-events={pe} style:cursor="move" onmousedown={(e: MouseEvent) => down(a, e)} /></g>
	{:else if a.kind === 'ellipse'}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<g transform={rot}><ellipse cx={cx} cy={cy} rx={b.w / 2} ry={b.h / 2} fill="none" stroke="transparent" stroke-width="300" style:pointer-events={pe} style:cursor="move" onmousedown={(e: MouseEvent) => down(a, e)} /></g>
	{:else if a.kind === 'symbol' && a.symbol === 'outlet'}
		<!-- tight hit on the outlet body (circle + triangle), NOT the full 1000mm symbol box -->
		{@const R = Math.min(b.w, b.h) / 2}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<circle cx={cx} cy={cy} r={R * 0.66} fill="transparent" style:pointer-events={pe} style:cursor="move" onmousedown={(e: MouseEvent) => down(a, e)} />
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

	<!-- selection highlight. Line kinds (line/arrow/dimension) get a solid thin blue line along
	     the segment for BOTH click- and marquee-select (so they look the same; click just adds the
	     endpoint handles). Box kinds keep the dashed bbox outline for marquee-select. -->
	{#if (sel || multi) && LINE.has(a.kind)}
		{@const ex = a.x2 ?? a.x}{@const ey = a.y2 ?? a.y}
		<line x1={a.x} y1={a.y} x2={ex} y2={ey} stroke={HL} stroke-opacity={a.groupId ? 0.4 : 1} stroke-width={1.75 / ss} style:pointer-events="none" />
	{:else if multi && !sel}
		<rect x={b.x} y={b.y} width={b.w} height={b.h} transform={rot} fill="none" stroke={HL} stroke-opacity={a.groupId ? 0.4 : 1} stroke-width={1.75 / ss} stroke-dasharray="{4 / ss} {3 / ss}" style:pointer-events="none" />
	{/if}

	<!-- selection handles -->
	{#if sel}
		{#if isBoxKind(a)}
			<!-- groupBox: the host shows a unified transform box for this single item → skip the per-item box -->
			{#if !groupBox}
				<TransformBox {editor} {zoom} box={box(a, den)} rotation={a.rotation ?? 0}
					resizable={a.kind !== 'text' && a.kind !== 'callout'} onresize={(_h, nb) => editor.setBox(a, nb)} onrotate={(d) => editor.setRotation(a, d)} />
			{/if}
			{#if POINTER.has(a.kind) && a.x2 != null}
				<PointHandles {editor} {zoom} anchor={{ x: cx, y: cy }} points={[{ x: a.x2, y: a.y2 ?? a.y }]} onmove={(_i, x, y) => editor.movePoint(a, 1, x, y)} />
			{/if}
		{:else}
			<PointHandles {editor} {zoom} points={[{ x: a.x, y: a.y }, { x: a.x2 ?? a.x, y: a.y2 ?? a.y }]} onmove={(i, x, y) => editor.movePoint(a, i, x, y)} />
		{/if}
	{/if}
	{/if}
{/each}
