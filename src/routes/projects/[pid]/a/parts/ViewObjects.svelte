<svelte:options namespace="svg" />

<script lang="ts">
	import type { Sheet } from './sheet.svelte'
	import { BASIS, u2paper, v2paper, type Obj, type View } from './types'
	import { project, posAlong, sizeAlong } from './projection'

	let { sheet, view, clickable }: { sheet: Sheet; view: View; clickable: boolean } = $props()

	const m = $derived(sheet.modelFor(view))
	const pe = $derived(clickable ? 'stroke' : 'none')

	// Index of the selected object in this view (editable only while clickable).
	const selIdx = $derived(
		clickable && sheet.selectedObj?.viewId === view.id ? sheet.selectedObj.index : null,
	)

	const HS = 2 // edit-handle size, paper mm

	const px = (u: number, vv: number) => `${u2paper(view, u)},${v2paper(view, vv)}`

	// Edit handles for the selected object, projected to paper coords.
	type Handle = { hx: number; hy: number; cur: string; handle: string }
	function handlesFor(o: Obj): Handle[] {
		const b = BASIS[view.direction]
		const dir = view.direction
		const toPaper = (u: number, vv: number, cur: string, handle: string): Handle => ({
			hx: u2paper(view, u), hy: v2paper(view, vv), cur, handle,
		})

		if (o.type === 'cuboid') {
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

		if (o.type === 'polygon') {
			if (dir === 'plan') return [toPaper(b.hs * (o.x + o.r), b.vs * o.y, 'ew-resize', 'radius')]
			// Elevation: a top handle that edits height.
			const u = b.hs * (b.h === 'x' ? o.x : o.y)
			return [toPaper(u, b.vs * (o.z + o.h), 'ns-resize', 'radius')]
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
		{#each handlesFor(m.objects[selIdx]) as h (h.handle)}
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

<style>
	.ohandle { fill: #fff; stroke: #2563eb; stroke-width: 0.4; }
</style>
