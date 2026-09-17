<script lang="ts">
	// Reusable viewport (kestrel-adoption mockup) with mock CAD drawing modeled on
	// KestrelCad2 (src/app.js acceptPoint / preview / prompts, src/model.js entity
	// types): click-to-place tools with a rubber-band preview, and Select-tool
	// hit-testing. Used inside a sheet's paper page (kind='floorplan') and as a
	// standalone model view (kind='model'). The parent owns the entities/selection
	// (so drawing persists per document, tool + selection per view). Fills its parent.
	import { Icon } from '$lib'
	import { panzoom } from './panzoom'

	export type Pt = [number, number]
	export type Ent = { id: string; type: 'line' | 'rect' | 'circle' | 'dim' | 'text'; a?: Pt; b?: Pt; c?: Pt; r?: number; text?: string }
	export type View = { zoom: number; x: number; y: number }

	let { label = 'Viewport', scale = '', kind = 'floorplan', active = false, tool = 'Select',
		entities = [], sel = [], view = { zoom: 1, x: 0, y: 0 }, onactivate, onadd, onselect, onview }:
		{ label?: string; scale?: string; kind?: 'floorplan' | 'model' | 'elevation'; active?: boolean; tool?: string;
			entities?: Ent[]; sel?: string[]; view?: View; onactivate?: () => void; onadd?: (e: Ent) => void; onselect?: (ids: string[]) => void; onview?: (v: View) => void } = $props()

	const tagIcon: Record<string, string> = { floorplan: 'mapPin', model: 'box', elevation: 'server' }
	const DRAW = new Set(['Line', 'Rectangle', 'Circle', 'Dimension', 'Text'])
	let cursorStyle = $derived(!active ? 'pointer' : DRAW.has(tool) ? 'crosshair' : 'default')

	// ── background mock content ──
	const desks: { x: number; y: number }[] = []
	for (let c = 0; c < 4; c++) for (let r = 0; r < 5; r++) desks.push({ x: 54 + c * 82, y: 44 + r * 38 })
	const DW = 56, DH = 26
	const outlets = desks.map((d, i) => ({ x: d.x + DW / 2, y: d.y + DH + 7, k: i % 4 === 0 ? 'p' : i % 4 === 2 ? 'a' : 'n' }))
	const outletColor: Record<string, string> = { p: '#f97316', n: '#3b82f6', a: '#10b981' }
	const IX = 205, IY = 70, SX = 1.15, SY = 0.58
	const pt = (x: number, y: number, z: number) => `${IX + (x - z) * SX},${IY + (x + z) * SY - y * 1.1}`
	function boxF(x: number, z: number, w: number, d: number, h: number) {
		return {
			top: `${pt(x, h, z)} ${pt(x + w, h, z)} ${pt(x + w, h, z + d)} ${pt(x, h, z + d)}`,
			left: `${pt(x, 0, z)} ${pt(x, h, z)} ${pt(x, h, z + d)} ${pt(x, 0, z + d)}`,
			right: `${pt(x, 0, z + d)} ${pt(x, h, z + d)} ${pt(x + w, h, z + d)} ${pt(x + w, 0, z + d)}`,
		}
	}
	const racks = [boxF(20, 10, 26, 46, 60), boxF(60, 10, 26, 46, 60), boxF(100, 10, 26, 46, 60), boxF(20, 80, 26, 46, 42)]
	const floorGrid: string[] = []
	for (let i = 0; i <= 6; i++) { floorGrid.push(`${pt(i * 24, 0, 0)} ${pt(i * 24, 0, 144)}`); floorGrid.push(`${pt(0, 0, i * 24)} ${pt(144, 0, i * 24)}`) }

	// ── drawing (Kestrel-style) ──
	const INK = '#475569', SEL = '#0e7490'
	let svg: SVGSVGElement | undefined = $state()   // outer svg (viewBox space)
	let viewG: SVGGElement | undefined = $state()   // pan/zoom transform group (drawing space)
	let draft = $state<Pt[]>([])
	let cur = $state<Pt | null>(null)
	let seq = 0
	const uid = () => 'e' + Date.now().toString(36) + (seq++)
	const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1])
	const selSet = $derived(new Set(sel))

	// Client → drawing coords (through the view transform), for placing/hit-testing.
	function toLocal(e: MouseEvent): Pt | null {
		const m = viewG?.getScreenCTM(); if (!m) return null
		const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse())
		return [p.x, p.y]
	}
	// ── pan/zoom the viewport content (SVG group transform, in viewBox units) ──
	function onPan(dx: number, dy: number) {
		const m = svg?.getScreenCTM(); if (!m) return
		onview?.({ zoom: view.zoom, x: view.x + dx / m.a, y: view.y + dy / m.d })
	}
	function onZoom(f: number, cx: number, cy: number) {
		const m = svg?.getScreenCTM(); if (!m) return
		const p = new DOMPoint(cx, cy).matrixTransform(m.inverse())   // cursor in viewBox coords
		const nz = Math.min(8, Math.max(0.25, view.zoom * f)), r = nz / view.zoom
		onview?.({ zoom: nz, x: p.x - (p.x - view.x) * r, y: p.y - (p.y - view.y) * r })
	}
	// panzoom passes its node as a trailing arg (unused here)
	function onClick(e: MouseEvent) {
		e.stopPropagation()
		if (!active) { onactivate?.(); return }
		const p = toLocal(e); if (!p) return
		if (tool === 'Select') { onselect?.(hit(p)); return }
		if (tool === 'Text') { onadd?.({ id: uid(), type: 'text', a: p, text: 'TEXT' }); return }
		if (!draft.length) { draft = [p]; return }        // first point
		const a = draft[0]
		if (tool === 'Line') onadd?.({ id: uid(), type: 'line', a, b: p })
		else if (tool === 'Rectangle') onadd?.({ id: uid(), type: 'rect', a, b: p })
		else if (tool === 'Circle') onadd?.({ id: uid(), type: 'circle', c: a, r: Math.max(1, dist(a, p)) })
		else if (tool === 'Dimension') onadd?.({ id: uid(), type: 'dim', a, b: p })
		draft = []
	}
	function onMove(e: MouseEvent) { if (active) cur = toLocal(e) }
	function onCtx(e: MouseEvent) { if (active && draft.length) { e.preventDefault(); draft = [] } }
	function onKey(e: KeyboardEvent) { if (active && e.key === 'Escape') { draft = []; onselect?.([]) } }

	// hit-test (topmost first)
	function segDist(p: Pt, a: Pt, b: Pt) {
		const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy || 1
		let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L; t = Math.max(0, Math.min(1, t))
		return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy))
	}
	function hitEnt(e: Ent, p: Pt, thr: number): boolean {
		if (e.type === 'line' || e.type === 'dim') return segDist(p, e.a!, e.b!) < thr
		if (e.type === 'rect') { const x0 = Math.min(e.a![0], e.b![0]), y0 = Math.min(e.a![1], e.b![1]), x1 = Math.max(e.a![0], e.b![0]), y1 = Math.max(e.a![1], e.b![1]); return p[0] >= x0 - thr && p[0] <= x1 + thr && p[1] >= y0 - thr && p[1] <= y1 + thr }
		if (e.type === 'circle') return dist(e.c!, p) <= e.r! + thr
		if (e.type === 'text') return Math.abs(p[0] - e.a![0]) < 24 && Math.abs(p[1] - e.a![1]) < 10
		return false
	}
	function hit(p: Pt): string[] {
		for (let i = entities.length - 1; i >= 0; i--) if (hitEnt(entities[i], p, 8)) return [entities[i].id]
		return []
	}
	// Kestrel-style prompt
	let prompt = $derived.by(() => {
		if (!active) return ''
		const n = draft.length
		switch (tool) {
			case 'Select': return 'Click an element'
			case 'Line': return n ? 'Specify end point' : 'Specify first point'
			case 'Rectangle': return n ? 'Specify opposite corner' : 'Specify first corner'
			case 'Circle': return n ? 'Specify radius' : 'Specify center point'
			case 'Dimension': return n ? 'Specify second point' : 'Specify first point'
			case 'Text': return 'Click to place text'
			default: return tool + ' tool'
		}
	})
</script>

<svelte:window onkeydown={onKey} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="vp" class:active role="button" tabindex="0" style:cursor={cursorStyle}
	use:panzoom={{ enabled: () => active, onpan: onPan, onzoom: onZoom }}
	onclick={onClick} onpointermove={onMove} oncontextmenu={onCtx}
	onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onactivate?.() } }}>

	<svg bind:this={svg} class="vp-svg {kind === 'model' || kind === 'elevation' ? 'model' : ''}" viewBox="0 0 400 250" preserveAspectRatio="xMidYMid meet">
		<g bind:this={viewG} transform="translate({view.x} {view.y}) scale({view.zoom})">
			<!-- background content -->
			{#if kind === 'model' || kind === 'elevation'}
				{#each floorGrid as g (g)}<polyline points={g} fill="none" stroke="#d5deea" stroke-width="0.7" />{/each}
				{#each racks as b (b.top)}
					<polygon points={b.left} fill="#8aa0bf" stroke="#5c7396" stroke-width="0.6" />
					<polygon points={b.right} fill="#6f88ab" stroke="#4a5f7d" stroke-width="0.6" />
					<polygon points={b.top} fill="#a9bcd6" stroke="#7f95b4" stroke-width="0.6" />
				{/each}
			{:else}
				<rect x="8" y="8" width="384" height="234" fill="#ffffff" stroke="#94a3b8" stroke-width="1.4" />
				{#each Array(19) as _, i (i)}<line x1={8 + i * 20} y1="8" x2={8 + i * 20} y2="242" stroke="#eef2f6" stroke-width="0.6" />{/each}
				{#each Array(12) as _, i (i)}<line x1="8" y1={8 + i * 20} x2="392" y2={8 + i * 20} stroke="#eef2f6" stroke-width="0.6" />{/each}
				<line x1="200" y1="8" x2="200" y2="150" stroke="#cbd5e1" stroke-width="1" />
				<line x1="8" y1="150" x2="392" y2="150" stroke="#cbd5e1" stroke-width="1" />
				{#each desks as d, i (i)}<rect x={d.x} y={d.y} width={DW} height={DH} rx="2" fill="#f1f5f9" stroke="#cbd5e1" stroke-width="0.7" />{/each}
				{#each outlets as o, i (i)}
					<circle cx={o.x} cy={o.y} r="5.5" fill={outletColor[o.k]} opacity="0.9" />
					<text x={o.x} y={o.y + 2.2} font-size="5.5" text-anchor="middle" fill="#fff" font-weight="700">{o.k === 'p' ? '4' : '6'}</text>
				{/each}
				<text x="24" y="230" font-size="9" fill="#64748b" font-weight="600">OFFICE — 33F</text>
			{/if}
			<!-- drawn entities + rubber-band preview -->
			{#each entities as e (e.id)}{@render drawn(e, selSet.has(e.id))}{/each}
			{#if active && draft.length && cur}{@render preview(draft[0], cur)}{/if}
		</g>
	</svg>

	<div class="vp-tag"><Icon name={tagIcon[kind]} size={10} /> {label}{#if scale}<span class="vp-scale">{scale}</span>{/if}</div>
	{#if active}<div class="vp-badge"><span class="vp-dot"></span>{tool} · {prompt} · {Math.round(view.zoom * 100)}%</div>{/if}
</div>

{#snippet drawn(e: Ent, seld: boolean)}
	{@const ink = seld ? SEL : INK}
	{@const w = seld ? 2 : 1.2}
	{#if e.type === 'line'}
		<line x1={e.a![0]} y1={e.a![1]} x2={e.b![0]} y2={e.b![1]} stroke={ink} stroke-width={w} />
	{:else if e.type === 'rect'}
		<rect x={Math.min(e.a![0], e.b![0])} y={Math.min(e.a![1], e.b![1])} width={Math.abs(e.b![0] - e.a![0])} height={Math.abs(e.b![1] - e.a![1])} fill="none" stroke={ink} stroke-width={w} />
	{:else if e.type === 'circle'}
		<circle cx={e.c![0]} cy={e.c![1]} r={e.r} fill="none" stroke={ink} stroke-width={w} />
	{:else if e.type === 'dim'}
		<line x1={e.a![0]} y1={e.a![1]} x2={e.b![0]} y2={e.b![1]} stroke={seld ? SEL : '#0e766e'} stroke-width={w} />
		<text x={(e.a![0] + e.b![0]) / 2} y={(e.a![1] + e.b![1]) / 2 - 3} font-size="9" fill={seld ? SEL : '#0e766e'} text-anchor="middle">{Math.round(dist(e.a!, e.b!))}</text>
	{:else if e.type === 'text'}
		<text x={e.a![0]} y={e.a![1]} font-size="11" fill={ink} font-weight="600">{e.text}</text>
	{/if}
{/snippet}

{#snippet preview(a: Pt, p: Pt)}
	{#if tool === 'Line' || tool === 'Dimension'}
		<line x1={a[0]} y1={a[1]} x2={p[0]} y2={p[1]} stroke={SEL} stroke-width="1" stroke-dasharray="4 3" />
	{:else if tool === 'Rectangle'}
		<rect x={Math.min(a[0], p[0])} y={Math.min(a[1], p[1])} width={Math.abs(p[0] - a[0])} height={Math.abs(p[1] - a[1])} fill="none" stroke={SEL} stroke-width="1" stroke-dasharray="4 3" />
	{:else if tool === 'Circle'}
		<circle cx={a[0]} cy={a[1]} r={dist(a, p)} fill="none" stroke={SEL} stroke-width="1" stroke-dasharray="4 3" />
	{/if}
{/snippet}

<style>
	.vp { position:relative; width:100%; height:100%; border:1.5px dashed #94a3b8; background:#fff; cursor:pointer; overflow:hidden; }
	.vp:hover { border-color:#5ac6d2; }
	.vp.active { border:1.5px solid #157a8b; box-shadow:0 0 0 2px #5ac6d233; cursor:default; }
	.vp-svg { display:block; width:100%; height:100%; }
	.vp-svg.model { background:#eef3f8; }
	.vp-tag {
		position:absolute; top:6px; left:6px; display:flex; align-items:center; gap:5px;
		font-size:9px; color:#475569; background:#ffffffcc; border:1px solid #e2e8f0; border-radius:3px; padding:2px 6px;
	}
	.vp-tag :global(svg) { color:#94a3b8; }
	.vp-scale { color:#94a3b8; font-family:Consolas,monospace; }
	.vp-badge {
		position:absolute; bottom:6px; left:6px; display:flex; align-items:center; gap:5px; font-size:8px; letter-spacing:.04em;
		color:#0e5866; background:#5ac6d222; border:1px solid #5ac6d2; border-radius:3px; padding:2px 6px;
	}
	.vp-dot { width:5px; height:5px; border-radius:50%; background:#157a8b; }
</style>
