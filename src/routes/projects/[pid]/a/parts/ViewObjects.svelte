<svelte:options namespace="svg" />

<script lang="ts">
	import type { Sheet } from './sheet.svelte'
	import { BASIS, u2paper, v2paper, type Conduit, type Obj, type View } from './types'
	import { project, posAlong, sizeAlong, faces3d, isoR, isoDepthR, xyCenter } from './projection'

	let { sheet, view, clickable }: { sheet: Sheet; view: View; clickable: boolean } = $props()

	const m = $derived(sheet.modelFor(view))
	// The 3D (iso) view is display-only — no in-plane object editing.
	const editable = $derived(clickable && view.direction !== 'iso')
	const pe = $derived(editable ? 'stroke' : 'none')
	const b = $derived(BASIS[view.direction])

	// Index of the selected object in this view (editable only while editable).
	const selIdx = $derived(
		editable && sheet.selectedObj?.viewId === view.id ? sheet.selectedObj.index : null,
	)

	// Effective px-per-paper-unit (paper canvas vs maximized overlay), so hit
	// areas and handles can be sized in screen pixels regardless of zoom.
	const ppu = $derived(sheet.maximizedId === view.id ? sheet.mzoom : sheet.zoom)
	const HS = $derived(7 / ppu) // handle square ≈ 7px
	const HSW = $derived(1 / ppu) // handle stroke ≈ 1px
	const HIT = $derived(10 / ppu) // line hit-area ≈ 10px wide
	const RI = $derived(2 / ppu) // insert handle radius
	const RE = $derived(2.4 / ppu) // extend handle radius
	const ENDS = ['start', 'end'] as const

	// Iso orbit: yaw angle + pivot (model x-y center).
	const yaw = $derived(view.yaw ?? 0)
	const pivot = $derived(m ? xyCenter(m.objects) : { cx: 0, cy: 0 })

	const px = (u: number, vv: number) => `${u2paper(view, u)},${v2paper(view, vv)}`

	// Project a 3D point to paper coords (for conduit handles).
	const projPaper = (p: { x: number; y: number; z: number }) => ({
		hx: u2paper(view, b.hs * p[b.h]),
		hy: v2paper(view, b.vs * p[b.v]),
	})
	const mid3 = (a: { x: number; y: number; z: number }, c: typeof a) => ({
		x: (a.x + c.x) / 2, y: (a.y + c.y) / 2, z: (a.z + c.z) / 2,
	})
	// Iso hidden-line render: all model faces, sorted far→near (painter's),
	// drawn opaque so nearer faces occlude hidden edges behind them.
	const isoFaces = $derived.by(() => {
		if (!m) return []
		const out: { pts: string; depth: number }[] = []
		for (const o of m.objects) for (const f of faces3d(o)) {
			out.push({
				pts: f.pts.map((p) => { const q = isoR(p, yaw, pivot.cx, pivot.cy); return px(q.u, q.v) }).join(' '),
				// Sort by the farthest vertex (not centroid): a big flat face then
				// can't wrongly occlude a small object sitting on/above it.
				depth: Math.max(...f.pts.map((p) => isoDepthR(p, yaw, pivot.cx, pivot.cy))),
			})
		}
		return out.sort((a, b) => b.depth - a.depth)
	})

	// "+" extend handle just beyond an end vertex, along the end segment.
	function extendPaper(o: Conduit, end: 'start' | 'end') {
		const n = o.path.length
		const i = end === 'end' ? n - 1 : 0
		const j = end === 'end' ? n - 2 : 1
		const a = projPaper(o.path[i]), c = projPaper(o.path[Math.max(0, Math.min(n - 1, j))])
		let dx = a.hx - c.hx, dy = a.hy - c.hy
		const len = Math.hypot(dx, dy) || 1
		return { hx: a.hx + (dx / len) * 6, hy: a.hy + (dy / len) * 6 }
	}

	// Edit handles for the selected object, projected to paper coords.
	type Handle = { hx: number; hy: number; cur: string; handle: string }
	function handlesFor(o: Obj): Handle[] {
		const b = BASIS[view.direction]
		const dir = view.direction
		const toPaper = (u: number, vv: number, cur: string, handle: string): Handle => ({
			hx: u2paper(view, u), hy: v2paper(view, vv), cur, handle,
		})

		if (o.type === 'prism') {
			const posH = posAlong(o, b.h), dimH = sizeAlong(o, b.h)
			const posV = posAlong(o, b.v), dimV = sizeAlong(o, b.v)
			const out: Handle[] = []
			for (const h1 of [false, true]) for (const v1 of [false, true]) {
				const u = b.hs * (posH + (h1 ? dimH : 0))
				const vv = b.vs * (posV + (v1 ? dimV : 0))
				const right = b.hs > 0 ? h1 : !h1
				const top = v1 // vs is always +1
				const cur = top === right ? 'nesw-resize' : 'nwse-resize'
				out.push(toPaper(u, vv, cur, `box:${h1 ? 'h1' : 'h0'}:${v1 ? 'v1' : 'v0'}`))
			}
			return out
		}

		// wall
		if (dir === 'plan') return o.pts.map((p, k) => toPaper(b.hs * p.x, b.vs * p.y, 'move', `p${k}`))
		const f = o.pts[0]
		const u = b.hs * (b.h === 'x' ? f.x : f.y)
		return [toPaper(u, b.vs * (o.z + o.h), 'ns-resize', 'p0')]
	}
</script>

{#if m}
	{#if view.direction === 'iso' && sheet.hiddenLines}
		<!-- hidden-line view: opaque faces, far→near -->
		{#each isoFaces as f, i (i)}
			<polygon points={f.pts} fill="#ffffff" stroke="#000000" stroke-width="0.4" style="pointer-events:none" />
		{/each}
	{:else}
	{#each m.objects as o, i (i)}
		{@const sel = sheet.isObjectSelected(view, i)}
		{@const stroke = sel ? '#2563eb' : '#000000'}
		{@const sw = sel ? 0.8 : 0.4}
		<g
			role="button" tabindex="-1" aria-label="object"
			style="cursor:move"
			onpointerdown={(e) => sheet.startObjectMove(e, view, i)}
		>
			{#each project(o, view.direction, yaw, pivot.cx, pivot.cy) as s, si (si)}
				{@const pts = s.pts.map((p) => px(p.u, p.v)).join(' ')}
				{#if s.closed}
					<!-- wide transparent hit area so thin lines are easy to click -->
					<polygon points={pts} fill="none" stroke="transparent" stroke-width={HIT}
						stroke-linejoin="round" style="pointer-events:{pe}" />
					<polygon points={pts} fill="none" {stroke} stroke-width={sw} style="pointer-events:none" />
				{:else}
					<polyline points={pts} fill="none" stroke="transparent" stroke-width={HIT}
						stroke-linejoin="round" stroke-linecap="round" style="pointer-events:{pe}" />
					<polyline points={pts} fill="none" {stroke} stroke-width={sw} style="pointer-events:none" />
				{/if}
			{/each}
		</g>
	{/each}

	{#if selIdx !== null && m.objects[selIdx]}
		{@const so = m.objects[selIdx]}
		{#if so.type === 'conduit'}
			<!-- segment midpoint "+" insert handles -->
			{#each so.path.slice(0, -1) as _p, si (si)}
				{@const mp = projPaper(mid3(so.path[si], so.path[si + 1]))}
				<circle
					class="ihandle" cx={mp.hx} cy={mp.hy} r={RI}
					style="pointer-events:all;cursor:copy;stroke-width:{HSW}"
					role="button" tabindex="-1" aria-label="insert point"
					onpointerdown={(e) => sheet.startInsert(e, view, selIdx, si)}
				/>
			{/each}
			<!-- "+" extend handles at both ends -->
			{#each ENDS as end (end)}
				{@const ep = extendPaper(so, end)}
				<circle
					class="ehandle" cx={ep.hx} cy={ep.hy} r={RE}
					style="pointer-events:all;cursor:crosshair;stroke-width:{HSW}"
					role="button" tabindex="-1" aria-label="extend"
					onpointerdown={(e) => sheet.startExtend(e, view, selIdx, end)}
				/>
			{/each}
			<!-- path vertex handles -->
			{#each so.path as p, vi (vi)}
				{@const pp = projPaper(p)}
				<rect
					class="vhandle {sheet.isVertexSelected(view, selIdx, vi) ? 'sel' : ''}"
					x={pp.hx - HS / 2} y={pp.hy - HS / 2} width={HS} height={HS}
					style="pointer-events:all;cursor:move;stroke-width:{HSW}"
					role="button" tabindex="-1" aria-label="vertex"
					onpointerdown={(e) => sheet.startConduitVertex(e, view, selIdx, vi)}
				/>
			{/each}
		{:else}
			{#each handlesFor(so) as h (h.handle)}
				<rect
					class="ohandle"
					x={h.hx - HS / 2} y={h.hy - HS / 2} width={HS} height={HS}
					style="pointer-events:all;cursor:{h.cur};stroke-width:{HSW}"
					role="button" tabindex="-1" aria-label="resize"
					onpointerdown={(e) => sheet.startObjectResize(e, view, selIdx, h.handle)}
				/>
			{/each}
		{/if}
	{/if}
	{/if}
{/if}

<style>
	.ohandle { fill: #fff; stroke: #2563eb; stroke-width: 0.4; }
	.vhandle { fill: #fff; stroke: #2563eb; stroke-width: 0.4; }
	.vhandle.sel { fill: #2563eb; }
	.ihandle { fill: #16a34a; stroke: #fff; stroke-width: 0.3; }
	.ehandle { fill: #fff; stroke: #16a34a; stroke-width: 0.5; }
</style>
