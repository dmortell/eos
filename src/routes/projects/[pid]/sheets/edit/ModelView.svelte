<script lang="ts">
	// Full-area "model mode" host: re-hosts a viewport's content (same ViewportContent / editor)
	// filling the content area with its own free pan/zoom, no paper chrome. Mounted in place by
	// SheetEditor (a $state toggle) — no route, no refresh.
	import ViewportContent from '../ViewportContent.svelte'
	import type { SheetViewport } from '../types'
	import type { ViewportEditor } from '../viewports.svelte'

	let { vp, vps, onexit }: { vp: SheetViewport; vps: ViewportEditor; onexit: () => void } = $props()

	let el: HTMLDivElement | undefined = $state()
	let cw = $state(1), ch = $state(1)
	let view = $state<{ x: number; y: number; w: number; h: number } | null>(null)

	// Persist each model view's pan/zoom locally, keyed by viewport, so reopening restores it.
	const storeKey = `eos.modelview.${vp.id}`
	function loadView() { try { const r = localStorage.getItem(storeKey); return r ? JSON.parse(r) : null } catch { return null } }
	function saveView() { if (view) try { localStorage.setItem(storeKey, JSON.stringify(view)) } catch {} }

	// The render's <svg> uses preserveAspectRatio="xMidYMid meet", so the on-screen scale is uniform
	// `min(cw/view.w, ch/view.h)` px-per-mm with the content letterbox-centred. Map screen↔world
	// through that scale + offset (assuming view aspect == container is what broke pan when the
	// render reported its window before the container was measured).
	const fit = () => {
		const s = Math.min(cw / view!.w, ch / view!.h)
		return { s, offX: (cw - view!.w * s) / 2, offY: (ch - view!.h * s) / 2 }
	}
	const toWorld = (cxp: number, cyp: number) => { const { s, offX, offY } = fit(); return { x: view!.x + (cxp - offX) / s, y: view!.y + (cyp - offY) / s } }

	// Seed from the saved view, else from the render's first reported window (expanded to the
	// container aspect so nothing is letterboxed), then take over pan/zoom.
	function capture(v: { x: number; y: number; w: number; h: number; den: number }) {
		if (view || cw <= 1 || ch <= 1) return // wait for the container to be measured
		const saved = loadView()
		if (saved) { view = saved; return }
		const ar = cw / ch || 1
		let { x, y, w, h } = v
		if (w / h < ar) { const nw = h * ar; x -= (nw - w) / 2; w = nw }
		else { const nh = w / ar; y -= (nh - h) / 2; h = nh }
		view = { x, y, w, h }
	}

	let panning = $state(false)
	let px = 0, py = 0, vx0 = 0, vy0 = 0
	function down(e: MouseEvent) {
		if (!(e.button === 1 || e.button === 2) || !view) return // middle/right pans; left edits
		e.preventDefault(); e.stopPropagation()
		panning = true; px = e.clientX; py = e.clientY; vx0 = view.x; vy0 = view.y
		window.addEventListener('mousemove', move); window.addEventListener('mouseup', up)
	}
	function move(e: MouseEvent) {
		if (!panning || !view) return
		const { s } = fit() // px per mm — pan 1:1 with the cursor regardless of aspect
		view = { ...view, x: vx0 - (e.clientX - px) / s, y: vy0 - (e.clientY - py) / s }
	}
	function up() { panning = false; window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); saveView() }
	function wheel(e: WheelEvent) {
		if (!view || !el) return
		e.preventDefault()
		const r = el.getBoundingClientRect()
		const w0 = toWorld(e.clientX - r.left, e.clientY - r.top) // world point under the cursor
		const f = e.deltaY < 0 ? 1 / 1.1 : 1.1
		view = { ...view, w: view.w * f, h: view.h * f }
		const w1 = toWorld(e.clientX - r.left, e.clientY - r.top) // same screen point after resize
		view = { ...view, x: view.x + (w0.x - w1.x), y: view.y + (w0.y - w1.y) } // keep cursor pinned
		// Re-baseline an in-progress pan so zooming mid-pan doesn't snap back on the next move.
		if (panning) { px = e.clientX; py = e.clientY; vx0 = view.x; vy0 = view.y }
		saveView()
	}
	$effect(() => {
		const e2 = el; if (!e2) return
		const noctx = (ev: Event) => ev.preventDefault()
		e2.addEventListener('wheel', wheel, { passive: false })
		e2.addEventListener('mousedown', down)
		e2.addEventListener('contextmenu', noctx)
		return () => {
			e2.removeEventListener('wheel', wheel); e2.removeEventListener('mousedown', down); e2.removeEventListener('contextmenu', noctx)
			window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up)
		}
	})
</script>

<!-- z below the portaled floating windows (z-10) so palettes/annotate panels stay on top, but
     above the sheet canvas so the paper/other viewports are covered. -->
<div class="absolute inset-0 z-[5] flex flex-col bg-white">
	<div class="flex items-center gap-2 border-b border-slate-200 bg-white px-2 py-1 text-sm">
		<span class="font-medium text-zinc-700">Model — {vp.label || vp.source.kind}</span>
		<button class="ml-auto rounded px-2 py-0.5 hover:bg-slate-100" onclick={onexit} title="Back to sheet (Esc)">⤡ Sheet</button>
	</div>
	<div bind:this={el} bind:clientWidth={cw} bind:clientHeight={ch}
		class="relative min-h-0 flex-1 overflow-hidden bg-zinc-50"
		style:cursor={panning ? 'grabbing' : 'default'}>
		<ViewportContent {vp} {vps} active view={view ?? null} onview={capture} zoom={1} />
	</div>
</div>
