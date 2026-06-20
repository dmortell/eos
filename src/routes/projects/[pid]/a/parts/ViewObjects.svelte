<svelte:options namespace="svg" />

<script lang="ts">
	import type { Sheet } from './sheet.svelte'
	import { BASIS, u2paper, v2paper, type Conduit, type Prism, type Wall, type View } from './types'
	import { project, posAlong, sizeAlong, faces3d, isoR, isoDepthR, xyCenter, DEFAULT_YAW, DEFAULT_PITCH } from './projection'

	type P3 = { x: number; y: number; z: number }

	let { sheet, view, clickable }: { sheet: Sheet; view: View; clickable: boolean } = $props()

	// The 3D (iso) view is display-only — no in-plane object editing.
	const editable = $derived(clickable && view.direction !== 'iso')
	const m = $derived(sheet.modelFor(view))
	const b = $derived(BASIS[view.direction])
	const pe = $derived(editable ? 'stroke' : 'none')
	const selIdx = $derived(editable && sheet.selectedObj?.viewId === view.id ? sheet.selectedObj.index : null)

	// Sizes in screen px regardless of zoom (paper canvas vs maximized overlay).
	const ppu = $derived(sheet.maximizedId === view.id ? sheet.mzoom : sheet.zoom)
	const HS = $derived(7 / ppu) // handle square ≈ 7px
	const HSW = $derived(1 / ppu) // handle stroke ≈ 1px
	const HIT = $derived(10 / ppu) // line hit-area ≈ 10px wide
	const HR = $derived(3.2 / ppu) // round handle radius
	const ENDS = ['start', 'end'] as const

	// Iso orbit: yaw/pitch angles + pivot (model x-y center).
	const yaw = $derived(view.yaw ?? DEFAULT_YAW)
	const pitch = $derived(view.pitch ?? DEFAULT_PITCH)
	const pivot = $derived(m ? xyCenter(m.objects) : { cx: 0, cy: 0 })

	const px = (u: number, vv: number) => `${u2paper(view, u)},${v2paper(view, vv)}`
	const polyPoints = (s: { pts: { u: number; v: number }[]; closed: boolean }) =>
		(s.closed ? [...s.pts, s.pts[0]] : s.pts).map((p) => px(p.u, p.v)).join(' ')
	const proj3 = (p: P3) => ({ hx: u2paper(view, b.hs * p[b.h]), hy: v2paper(view, b.vs * p[b.v]) })
	const mid = (a: P3, c: P3): P3 => ({ x: (a.x + c.x) / 2, y: (a.y + c.y) / 2, z: (a.z + c.z) / 2 })

	// Iso hidden-line faces, sorted far→near (painter's, by farthest vertex so a
	// big flat face can't wrongly occlude a small object sitting on/above it).
	const isoFaces = $derived.by(() => {
		if (!m) return []
		return m.objects.flatMap((o) => faces3d(o)).map((f) => ({
			pts: f.pts.map((p) => { const q = isoR(p, yaw, pitch, pivot.cx, pivot.cy); return px(q.u, q.v) }).join(' '),
			depth: Math.max(...f.pts.map((p) => isoDepthR(p, yaw, pitch, pivot.cx, pivot.cy))),
		})).sort((x, y) => y.depth - x.depth)
	})

	// "+" extend handle just beyond an end vertex, along the end segment.
	function extendPaper(o: Conduit, end: 'start' | 'end') {
		const n = o.path.length
		const i = end === 'end' ? n - 1 : 0
		const j = Math.max(0, Math.min(n - 1, end === 'end' ? n - 2 : 1))
		const a = proj3(o.path[i]), c = proj3(o.path[j])
		const dx = a.hx - c.hx, dy = a.hy - c.hy
		const len = Math.hypot(dx, dy) || 1
		return { hx: a.hx + (dx / len) * 6, hy: a.hy + (dy / len) * 6 }
	}

	// Resize handles for a prism (corners) or wall (vertices / height).
	type Resize = { hx: number; hy: number; cur: string; handle: string }
	function resizeHandles(o: Prism | Wall): Resize[] {
		const toPaper = (u: number, vv: number, cur: string, handle: string): Resize => ({ hx: u2paper(view, u), hy: v2paper(view, vv), cur, handle })
		if (o.type === 'prism') {
			const posH = posAlong(o, b.h), dimH = sizeAlong(o, b.h)
			const posV = posAlong(o, b.v), dimV = sizeAlong(o, b.v)
			const out: Resize[] = []
			for (const h1 of [false, true]) for (const v1 of [false, true]) {
				const right = b.hs > 0 ? h1 : !h1
				const cur = v1 === right ? 'nesw-resize' : 'nwse-resize'
				out.push(toPaper(b.hs * (posH + (h1 ? dimH : 0)), b.vs * (posV + (v1 ? dimV : 0)), cur, `box:${h1 ? 'h1' : 'h0'}:${v1 ? 'v1' : 'v0'}`))
			}
			return out
		}
		if (view.direction === 'plan') return o.pts.map((p, k) => toPaper(b.hs * p.x, b.vs * p.y, 'move', `p${k}`))
		const f = o.pts[0]
		return [toPaper(b.hs * (b.h === 'x' ? f.x : f.y), b.vs * (o.z + o.h), 'ns-resize', 'p0')]
	}

	// Unified handle list for the selected object (empty unless editable).
	type HView = { round: boolean; x: number; y: number; size: number; cls: string; cur: string; act: (e: PointerEvent) => void }
	const handles = $derived.by<HView[]>(() => {
		const i = selIdx
		const so = i === null ? null : m?.objects[i]
		if (i === null || !so) return []
		if (so.type === 'conduit') {
			const out: HView[] = so.path.map((p, vi): HView => {
				const q = proj3(p)
				return { round: false, x: q.hx, y: q.hy, size: HS, cls: `vhandle ${sheet.isVertexSelected(view, i, vi) ? 'sel' : ''}`, cur: 'move', act: (e) => sheet.startConduitVertex(e, view, i, vi) }
			})
			for (let s = 0; s < so.path.length - 1; s++) {
				const q = proj3(mid(so.path[s], so.path[s + 1]))
				out.push({ round: true, x: q.hx, y: q.hy, size: HR, cls: 'ihandle', cur: 'copy', act: (e) => sheet.startInsert(e, view, i, s) })
			}
			for (const end of ENDS) {
				const q = extendPaper(so, end)
				out.push({ round: true, x: q.hx, y: q.hy, size: HR, cls: 'ehandle', cur: 'crosshair', act: (e) => sheet.startExtend(e, view, i, end) })
			}
			return out
		}
		return resizeHandles(so).map((h): HView => ({ round: false, x: h.hx, y: h.hy, size: HS, cls: 'ohandle', cur: h.cur, act: (e) => sheet.startObjectResize(e, view, i, h.handle) }))
	})
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
			{@const col = sel ? '#2563eb' : '#000000'}
			{@const sw = sel ? 0.8 : 0.4}
			<g role="button" tabindex="-1" aria-label="object" style="cursor:move" onpointerdown={(e) => sheet.startObjectMove(e, view, i)}>
				{#each project(o, view.direction, yaw, pitch, pivot.cx, pivot.cy) as s, si (si)}
					{@const d = polyPoints(s)}
					<!-- wide transparent hit area so thin lines are easy to click, then the visible line -->
					<polyline points={d} fill="none" stroke="transparent" stroke-width={HIT} stroke-linejoin="round" stroke-linecap="round" style="pointer-events:{pe}" />
					<polyline points={d} fill="none" stroke={col} stroke-width={sw} style="pointer-events:none" />
				{/each}
			</g>
		{/each}
		{#each handles as h, i (i)}
			{#if h.round}
				<circle class={h.cls} cx={h.x} cy={h.y} r={h.size} role="button" tabindex="-1" aria-label="handle"
					style="pointer-events:all;cursor:{h.cur};stroke-width:{HSW}" onpointerdown={h.act} />
			{:else}
				<rect class={h.cls} x={h.x - h.size / 2} y={h.y - h.size / 2} width={h.size} height={h.size} role="button" tabindex="-1" aria-label="handle"
					style="pointer-events:all;cursor:{h.cur};stroke-width:{HSW}" onpointerdown={h.act} />
			{/if}
		{/each}
	{/if}
{/if}

<style>
	.ohandle, .vhandle { fill: #fff; stroke: #2563eb; stroke-width: 0.4; }
	.vhandle.sel { fill: #2563eb; }
	.ihandle { fill: #16a34a; stroke: #fff; stroke-width: 0.3; }
	.ehandle { fill: #fff; stroke: #16a34a; stroke-width: 0.5; }
</style>
