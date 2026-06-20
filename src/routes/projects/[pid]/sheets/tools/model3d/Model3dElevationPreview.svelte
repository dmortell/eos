<script lang="ts">
	import { Window } from '$lib'
	import Model3dRender from './Model3dRender.svelte'
	import Model3dEditLayer from './Model3dEditLayer.svelte'
	import { Model3dEditor } from './model3d-editor.svelte'
	import { project, objBounds, xyCenter, DEFAULT_YAW, DEFAULT_PITCH } from './projection'
	import { BASIS, DIR_LABEL, type Dir, type Model } from './types'
	import type { ModelStore } from './models.svelte'

	// Floating auto-fit elevation of the plan selection, for quick height editing.
	// Uses its OWN editor (same model, elevation direction) so drags here mutate the
	// shared model (persist via the store) without fighting the plan editor's svg/CTM.
	let { model, store, selIndex, direction = $bindable('front') }: {
		model: Model; store: ModelStore; selIndex: number | null; direction?: Dir
	} = $props()

	const ELEV: Dir[] = ['front', 'rear', 'left', 'right', 'iso']
	const sel = $derived(selIndex !== null ? model.objects[selIndex] ?? null : null)

	// Depth cull: only render objects within a band around the selection's depth, so
	// items far in front of / behind the selection don't clutter the elevation. The
	// in-plane axes are unbounded (huge); the depth axis is the selection ± margin.
	const depthClip = $derived.by(() => {
		if (!sel || direction === 'iso') return null
		const bb = objBounds(sel), M = 600, BIG = 1e7
		if (direction === 'front' || direction === 'rear') return { x0: -BIG, x1: BIG, y0: bb.y0 - M, y1: bb.y1 + M, z0: -BIG, z1: BIG }
		return { x0: bb.x0 - M, x1: bb.x1 + M, y0: -BIG, y1: BIG, z0: -BIG, z1: BIG } // left/right: depth = x
	})

	const ed = new Model3dEditor()
	$effect(() => { ed.model = model; ed.direction = direction; ed.onChange = () => store.save() })
	$effect(() => { if (selIndex !== null) ed.selectObj(selIndex); else ed.clearSel() })

	// Fit box: the selection's projected bounds, extended to include the level datums
	// so you can drag against FFL / ceiling.
	const autoView = $derived.by(() => {
		if (!sel) return null
		const b = BASIS[direction], piv = xyCenter(model.objects)
		let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
		for (const s of project(sel, direction, DEFAULT_YAW, DEFAULT_PITCH, piv.cx, piv.cy))
			for (const p of s.pts) { x0 = Math.min(x0, p.u); x1 = Math.max(x1, p.u); y0 = Math.min(y0, -p.v); y1 = Math.max(y1, -p.v) }
		if (x0 === Infinity) return null
		const lv = model.levels ? Object.values(model.levels).filter((z): z is number => z != null) : []
		for (const z of lv) { const sy = -b.vs * z; y0 = Math.min(y0, sy); y1 = Math.max(y1, sy) }
		const padX = (x1 - x0) * 0.15 + 100, padY = (y1 - y0) * 0.12 + 150
		return { x: x0 - padX, y: y0 - padY, w: (x1 - x0) + 2 * padX, h: (y1 - y0) + 2 * padY }
	})

	// Manual pan/zoom overrides the auto-fit until the selection or direction changes.
	let manual = $state<{ x: number; y: number; w: number; h: number } | null>(null)
	$effect(() => { selIndex; direction; manual = null })
	const view = $derived(manual ?? autoView)
	let boxEl = $state<HTMLDivElement>()
	// preserveAspectRatio="meet" letterboxes the viewBox, so px↔mm is a single
	// uniform scale (max of the two ratios) with a centring offset. Cursor (px) →
	// view (mm) must use both, or pan/zoom drift (esp. the non-fitting axis).
	const scaleOf = (v: { w: number; h: number }, r: DOMRect) => Math.max(v.w / r.width, v.h / r.height)
	const toMm = (cxp: number, cyp: number, v: { x: number; y: number; w: number; h: number }, r: DOMRect) => {
		const s = scaleOf(v, r), ox = (r.width - v.w / s) / 2, oy = (r.height - v.h / s) / 2
		return { x: v.x + (cxp - r.left - ox) * s, y: v.y + (cyp - r.top - oy) * s }
	}
	function onWheel(e: WheelEvent) {
		if (!view) return
		e.preventDefault()
		const r = boxEl!.getBoundingClientRect()
		const m = toMm(e.clientX, e.clientY, view, r) // keep this point fixed
		const k = e.deltaY > 0 ? 1.15 : 1 / 1.15 // wheel down = zoom out
		const w = view.w * k, h = view.h * k
		const s = Math.max(w / r.width, h / r.height), ox = (r.width - w / s) / 2, oy = (r.height - h / s) / 2
		manual = { x: m.x - (e.clientX - r.left - ox) * s, y: m.y - (e.clientY - r.top - oy) * s, w, h }
	}
	function onPan(e: MouseEvent) {
		if (e.button === 0 || !view) return // left = edit; middle/right = pan
		e.preventDefault(); e.stopPropagation()
		const r = boxEl!.getBoundingClientRect(), v0 = { ...view }, s = scaleOf(v0, r), sx = e.clientX, sy = e.clientY
		const mv = (ev: MouseEvent) => { manual = { ...v0, x: v0.x - (ev.clientX - sx) * s, y: v0.y - (ev.clientY - sy) * s } }
		const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up) }
		window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up)
	}

	// Minimal viewport for Model3dRender — `view` overrides the viewBox; all layers shown.
	const fakeVp = { id: 'elev-preview', x: 0, y: 0, w: 100, h: 80, layerOverrides: {}, source: { kind: 'model3d' } } as any
</script>

{#if sel}
	<Window title="Elevation — selection" name="model3d-elev-preview" right={10} top={330} open class="w-64 p-1 text-zinc-700">
		<div class="mb-1 flex gap-1">
			{#each ELEV as d (d)}
				<button class="flex-1 rounded border px-1 py-0.5 text-xs {direction === d ? 'bg-blue-600 text-white' : 'hover:bg-slate-100'}"
					onclick={() => (direction = d)}>{DIR_LABEL[d]}</button>
			{/each}
		</div>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div bind:this={boxEl} class="relative w-full overflow-hidden rounded border border-zinc-200 bg-white"
			style:height="180px" style:resize="vertical" style:min-height="120px"
			onwheel={onWheel} onmousedown={onPan} oncontextmenu={(e) => e.preventDefault()}>
			<Model3dRender {model} {direction} {view} clip={depthClip} vp={fakeVp} hiddenLines={direction === 'iso'} bw={false} onsvg={(el) => (ed.svg = el)}>
				{#if direction !== 'iso'}
					<Model3dEditLayer editor={ed} {model} {direction} interactive={true} zoom={1} />
				{/if}
			</Model3dRender>
		</div>
		<p class="mt-1 text-[10px] text-zinc-400">Drag top edge = height · wheel = zoom · right-drag = pan · ⤢ corner = resize.</p>
	</Window>
{/if}
