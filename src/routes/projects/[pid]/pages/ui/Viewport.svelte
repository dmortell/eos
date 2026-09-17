<script lang="ts">
	// Reusable viewport (kestrel-adoption mockup): a framed, activatable content area
	// used both inside a sheet's paper page (kind='floorplan') and as a standalone
	// model/elevation view filling the canvas (kind='model'). Activating it (click)
	// is the groundwork for using the CAD tools inside it. Fills its parent; the
	// parent sizes it. Mock content only — no Firestore.
	import { Icon } from '$lib'

	let { label = 'Viewport', scale = '', kind = 'floorplan', active = false, tool = 'Select', onactivate }:
		{ label?: string; scale?: string; kind?: 'floorplan' | 'model' | 'elevation'; active?: boolean; tool?: string; onactivate?: () => void } = $props()

	const tagIcon: Record<string, string> = { floorplan: 'mapPin', model: 'box', elevation: 'server' }
	// The active viewport reflects the current tool: draw tools use a crosshair, Select an arrow.
	const DRAW = new Set(['Line', 'Rectangle', 'Circle', 'Dimension', 'Text'])
	let cursor = $derived(!active ? 'pointer' : DRAW.has(tool) ? 'crosshair' : 'default')

	// ── floorplan mock: desk pods + outlet dots ──
	const desks: { x: number; y: number }[] = []
	for (let c = 0; c < 4; c++) for (let r = 0; r < 5; r++) desks.push({ x: 54 + c * 82, y: 44 + r * 38 })
	const DW = 56, DH = 26
	const outlets = desks.map((d, i) => ({ x: d.x + DW / 2, y: d.y + DH + 7, k: i % 4 === 0 ? 'p' : i % 4 === 2 ? 'a' : 'n' }))
	const outletColor: Record<string, string> = { p: '#f97316', n: '#3b82f6', a: '#10b981' }

	// ── model mock: a few isometric rack boxes on a grid floor ──
	const IX = 205, IY = 70, SX = 1.15, SY = 0.58
	const pt = (x: number, y: number, z: number) => `${IX + (x - z) * SX},${IY + (x + z) * SY - y * 1.1}`
	function box(x: number, z: number, w: number, d: number, h: number) {
		return {
			top: `${pt(x, h, z)} ${pt(x + w, h, z)} ${pt(x + w, h, z + d)} ${pt(x, h, z + d)}`,
			left: `${pt(x, 0, z)} ${pt(x, h, z)} ${pt(x, h, z + d)} ${pt(x, 0, z + d)}`,
			right: `${pt(x, 0, z + d)} ${pt(x, h, z + d)} ${pt(x + w, h, z + d)} ${pt(x + w, 0, z + d)}`,
		}
	}
	const racks = [box(20, 10, 26, 46, 60), box(60, 10, 26, 46, 60), box(100, 10, 26, 46, 60), box(20, 80, 26, 46, 42)]
	const floorGrid: string[] = []
	for (let i = 0; i <= 6; i++) { floorGrid.push(`${pt(i * 24, 0, 0)} ${pt(i * 24, 0, 144)}`); floorGrid.push(`${pt(0, 0, i * 24)} ${pt(144, 0, i * 24)}`) }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="vp" class:active role="button" tabindex="0" style:cursor
	onclick={(e) => { e.stopPropagation(); onactivate?.() }}
	onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onactivate?.() } }}>

	{#if kind === 'model' || kind === 'elevation'}
		<svg class="vp-svg model" viewBox="0 0 400 250" preserveAspectRatio="xMidYMid meet">
			{#each floorGrid as g (g)}<polyline points={g} fill="none" stroke="#d5deea" stroke-width="0.7" />{/each}
			{#each racks as b (b.top)}
				<polygon points={b.left} fill="#8aa0bf" stroke="#5c7396" stroke-width="0.6" />
				<polygon points={b.right} fill="#6f88ab" stroke="#4a5f7d" stroke-width="0.6" />
				<polygon points={b.top} fill="#a9bcd6" stroke="#7f95b4" stroke-width="0.6" />
			{/each}
		</svg>
	{:else}
		<svg class="vp-svg" viewBox="0 0 400 250" preserveAspectRatio="xMidYMid meet">
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
		</svg>
	{/if}

	<div class="vp-tag"><Icon name={tagIcon[kind]} size={10} /> {label}{#if scale}<span class="vp-scale">{scale}</span>{/if}</div>
	{#if active}<div class="vp-badge"><span class="vp-dot"></span>{tool} tool</div>{/if}
</div>

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
