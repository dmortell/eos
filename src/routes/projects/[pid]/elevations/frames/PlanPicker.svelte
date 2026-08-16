<script lang="ts">
	/**
	 * Frames destination pane — floorplan tab (§14 F-3, panable/zoomable).
	 * Read-mostly picker: the calibrated PDF page with outlet dots positioned
	 * from their mm coordinates, colored by the linked location's coverage.
	 * Click an outlet to terminate the ARMED rear port to its location's next
	 * free port. Wheel zooms at the cursor, drag pans, ⤢ opens a large overlay.
	 * Full outlet editing stays in the Floorplan tool.
	 */
	import { Icon, Spinner, type Firestore } from '$lib'
	import { PdfState } from '../../uploads/parts/PdfState.svelte'
	import type { FramesEditor } from './frames-editor.svelte'

	let { db, pid, floor, editor }: { db: Firestore; pid: string; floor: number; editor: FramesEditor } = $props()

	let outletsDoc = $state<any>(null)
	let fileDoc = $state<any>(null)
	let pdfUrl = $state<string | null>(null)
	let pageW = $state(0)
	let pageH = $state(0)

	let docId = $derived(`${pid}_F${String(floor).padStart(2, '0')}`)

	$effect(() => {
		const unsub = db.subscribeOne('outlets', docId, (d: any) => { outletsDoc = d ?? null })
		return () => unsub?.()
	})
	$effect(() => {
		const fileId = outletsDoc?.selectedFileId
		if (!fileId) { fileDoc = null; return }
		const unsub = db.subscribeOne('files', fileId, (d: any) => { fileDoc = d ?? null })
		return () => unsub?.()
	})

	let pageNum = $derived(outletsDoc?.selectedPage ?? 1)
	let calibration = $derived.by(() => {
		const p = fileDoc?.pages?.[pageNum]
		if (p?.origin && p?.scale?.scale) return { origin: p.origin, scaleFactor: p.scale.scale as number }
		return null
	})

	const RENDER_SCALE = 2
	$effect(() => {
		const url = fileDoc?.url
		const pg = pageNum
		if (!url) { pdfUrl = null; return }
		let cancelled = false
		let localUrl: string | null = null
		const pdf = new PdfState()
		;(async () => {
			try {
				await pdf.load(url)
				if (cancelled) return
				const { objectUrl, width, height } = await pdf.renderToObjectUrl(pg, RENDER_SCALE)
				if (cancelled) { URL.revokeObjectURL(objectUrl); return }
				localUrl = objectUrl
				pdfUrl = objectUrl; pageW = width; pageH = height
			} catch {
				if (!cancelled) pdfUrl = null
			}
		})()
		return () => {
			cancelled = true
			if (localUrl) URL.revokeObjectURL(localUrl)
			pdf.destroy()
		}
	})

	/** mm → rendered-page px. */
	function toPagePx(mm: { x: number; y: number }): { x: number; y: number } {
		const c = calibration!
		return {
			x: (mm.x / c.scaleFactor + c.origin.x) * RENDER_SCALE,
			y: (mm.y / c.scaleFactor + c.origin.y) * RENDER_SCALE,
		}
	}

	let outlets = $derived((outletsDoc?.outlets ?? []) as any[])

	function coverageClass(o: any): string {
		if (!o.locationId) return 'bg-gray-300 border-gray-400'
		const loc = editor.locationById.get(o.locationId)
		const linked = editor.linkedPortsByLocation.get(o.locationId) ?? 0
		if (!loc) return 'bg-amber-300 border-amber-500'
		if (linked >= loc.portCount) return 'bg-emerald-400 border-emerald-600'
		if (linked > 0) return 'bg-amber-400 border-amber-600'
		return editor.termArm ? 'bg-blue-400 border-blue-600' : 'bg-sky-300 border-sky-500'
	}

	function pick(o: any) {
		if (!o.locationId) { editor.statusHint = `${o.label ?? 'Outlet'} is not linked to a location — link it in the Floorplan tool first`; return }
		if (!editor.termArm) { editor.statusHint = 'Arm a rear port first (click an unterminated port), then pick an outlet'; return }
		editor.terminateToLocation(o.locationId)
	}

	// ── Pan/zoom (per-container view state; wheel zooms at cursor, drag pans) ──
	let enlarged = $state(false)
	let view = $state({ x: 0, y: 0, zoom: 0.2 })
	let vpEl = $state<HTMLElement | null>(null)

	function fit() {
		if (!vpEl || !pageW) return
		const r = vpEl.getBoundingClientRect()
		const z = Math.min(r.width / pageW, r.height / pageH) || 0.2
		view = { x: (r.width - pageW * z) / 2, y: (r.height - pageH * z) / 2, zoom: z }
	}
	$effect(() => {
		pageW; pageH; enlarged
		// refit when the page or container changes
		requestAnimationFrame(fit)
	})

	/** Non-passive wheel + drag-pan; dots stay clickable (pan starts on any button drag). */
	function panzoom(el: HTMLElement) {
		const onWheel = (e: WheelEvent) => {
			e.preventDefault()
			const r = el.getBoundingClientRect()
			const mx = e.clientX - r.left, my = e.clientY - r.top
			const f = e.deltaY < 0 ? 1.2 : 1 / 1.2
			const z = Math.min(8, Math.max(0.05, view.zoom * f))
			const k = z / view.zoom
			view = { zoom: z, x: mx - (mx - view.x) * k, y: my - (my - view.y) * k }
		}
		const onDown = (e: MouseEvent) => {
			if (e.button === 0 && (e.target as HTMLElement).closest('[data-dot]')) return // let dot clicks through
			e.preventDefault()
			const sx = e.clientX, sy = e.clientY
			const start = { ...view }
			let moved = false
			const onMove = (ev: MouseEvent) => {
				const dx = ev.clientX - sx, dy = ev.clientY - sy
				if (Math.abs(dx) + Math.abs(dy) > 2) moved = true
				if (moved) view = { ...start, x: start.x + dx, y: start.y + dy }
			}
			const onUp = () => {
				window.removeEventListener('mousemove', onMove)
				window.removeEventListener('mouseup', onUp)
			}
			window.addEventListener('mousemove', onMove)
			window.addEventListener('mouseup', onUp)
		}
		el.addEventListener('wheel', onWheel, { passive: false })
		el.addEventListener('mousedown', onDown)
		el.addEventListener('contextmenu', e => e.preventDefault())
		return { destroy() { el.removeEventListener('wheel', onWheel); el.removeEventListener('mousedown', onDown) } }
	}
</script>

{#snippet viewport()}
	{#if !outletsDoc?.selectedFileId}
		<div class="p-3 text-[11px] text-gray-400">No floorplan selected for this floor — pick one in the Floorplan tool.</div>
	{:else if !pdfUrl}
		<div class="p-4 flex justify-center"><Spinner /></div>
	{:else}
		<div class="absolute inset-0 overflow-hidden bg-gray-100" use:panzoom bind:this={vpEl}>
			<div class="absolute origin-top-left" style:transform="translate({view.x}px, {view.y}px) scale({view.zoom})"
				style:width="{pageW}px" style:height="{pageH}px">
				<img src={pdfUrl} alt="floorplan" class="absolute inset-0 w-full h-full select-none" draggable="false" />
				{#if calibration}
					{#each outlets as o (o.id)}
						{@const p = toPagePx(o.position)}
						<button
							data-dot
							class="absolute rounded-full border {coverageClass(o)} hover:scale-125 transition-transform"
							style:width="{Math.max(10, 14 / view.zoom)}px"
							style:height="{Math.max(10, 14 / view.zoom)}px"
							style:left="{p.x}px" style:top="{p.y}px"
							style:transform="translate(-50%, -50%)"
							title={`${o.label ?? o.id}${o.locationId ? '' : ' — not linked to a location'}${editor.termArm && o.locationId ? '\nclick: terminate armed port here' : ''}`}
							onclick={() => pick(o)}></button>
					{/each}
				{/if}
			</div>
			{#if !calibration}
				<div class="absolute inset-x-0 top-0 p-2 text-[10px] text-amber-600 bg-amber-50/90">Floorplan not calibrated — outlet positions unavailable.</div>
			{/if}
			<div class="absolute bottom-1 right-1 flex gap-1">
				<button class="w-6 h-6 flex items-center justify-center rounded bg-white/90 border border-gray-200 text-gray-500 hover:bg-white" title="Fit" onclick={fit}><Icon name="crosshair" size={12} /></button>
				{#if !enlarged}
					<button class="w-6 h-6 flex items-center justify-center rounded bg-white/90 border border-gray-200 text-gray-500 hover:bg-white" title="Enlarge" onclick={() => enlarged = true}><Icon name="expand" size={12} /></button>
				{/if}
			</div>
		</div>
	{/if}
{/snippet}

{#if enlarged}
	<div class="fixed inset-0 bg-black/40 z-50 flex items-center justify-center print:hidden">
		<div class="relative bg-white rounded-lg shadow-xl border border-gray-200 w-[85vw] h-[85vh] overflow-hidden">
			<div class="absolute top-2 right-2 z-10">
				<button class="w-7 h-7 flex items-center justify-center rounded bg-white border border-gray-200 text-gray-500 hover:bg-gray-50 shadow"
					title="Close" onclick={() => enlarged = false}><Icon name="x" size={14} /></button>
			</div>
			{@render viewport()}
		</div>
	</div>
{:else}
	<div class="flex-1 relative min-h-0">
		{@render viewport()}
	</div>
{/if}
