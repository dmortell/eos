<svelte:options namespace="svg" />

<script lang="ts">
	import type { Sheet } from './sheet.svelte'
	import { BASIS, u2paper, v2paper, type Conduit, type Obj, type View } from './types'
	import { project, posAlong, sizeAlong } from './projection'

	let { sheet, view, clickable }: { sheet: Sheet; view: View; clickable: boolean } = $props()

	const m = $derived(sheet.modelFor(view))
	const pe = $derived(clickable ? 'stroke' : 'none')
	const b = $derived(BASIS[view.direction])

	// Index of the selected object in this view (editable only while clickable).
	const selIdx = $derived(
		clickable && sheet.selectedObj?.viewId === view.id ? sheet.selectedObj.index : null,
	)

	const HS = 2 // edit-handle size, paper mm
	const ENDS = ['start', 'end'] as const

	const px = (u: number, vv: number) => `${u2paper(view, u)},${v2paper(view, vv)}`

	// Project a 3D point to paper coords (for conduit handles).
	const projPaper = (p: { x: number; y: number; z: number }) => ({
		hx: u2paper(view, b.hs * p[b.h]),
		hy: v2paper(view, b.vs * p[b.v]),
	})
	const mid3 = (a: { x: number; y: number; z: number }, c: typeof a) => ({
		x: (a.x + c.x) / 2, y: (a.y + c.y) / 2, z: (a.z + c.z) / 2,
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
	{#each m.objects as o, i (i)}
		{@const sel = sheet.isObjectSelected(view, i)}
		{@const stroke = sel ? '#2563eb' : '#000000'}
		{@const sw = sel ? 0.8 : 0.4}
		<g
			role="button" tabindex="-1" aria-label="object"
			style="cursor:move"
			onpointerdown={(e) => sheet.startObjectMove(e, view, i)}
		>
			{#each project(o, view.direction) as s, si (si)}
				{#if s.closed}
					<polygon
						points={s.pts.map((p) => px(p.u, p.v)).join(' ')}
						fill="none" {stroke} stroke-width={sw}
						style="pointer-events:{pe}"
					/>
				{:else}
					<polyline
						points={s.pts.map((p) => px(p.u, p.v)).join(' ')}
						fill="none" {stroke} stroke-width={sw}
						style="pointer-events:{pe}"
					/>
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
					class="ihandle" cx={mp.hx} cy={mp.hy} r="1.2"
					style="pointer-events:all;cursor:copy"
					role="button" tabindex="-1" aria-label="insert point"
					onpointerdown={(e) => sheet.startInsert(e, view, selIdx, si)}
				/>
			{/each}
			<!-- "+" extend handles at both ends -->
			{#each ENDS as end (end)}
				{@const ep = extendPaper(so, end)}
				<circle
					class="ehandle" cx={ep.hx} cy={ep.hy} r="1.5"
					style="pointer-events:all;cursor:crosshair"
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
					style="pointer-events:all;cursor:move"
					role="button" tabindex="-1" aria-label="vertex"
					onpointerdown={(e) => sheet.startConduitVertex(e, view, selIdx, vi)}
				/>
			{/each}
		{:else}
			{#each handlesFor(so) as h (h.handle)}
				<rect
					class="ohandle"
					x={h.hx - HS / 2} y={h.hy - HS / 2} width={HS} height={HS}
					style="pointer-events:all;cursor:{h.cur}"
					role="button" tabindex="-1" aria-label="resize"
					onpointerdown={(e) => sheet.startObjectResize(e, view, selIdx, h.handle)}
				/>
			{/each}
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
