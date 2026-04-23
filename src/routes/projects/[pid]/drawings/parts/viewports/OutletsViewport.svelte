<script lang="ts">
	/**
	 * Outlets / trunk-route viewport.
	 *
	 * Subscribes to:
	 *   - `outlets/{pid}_F{NN}` — the outlets doc with outlets + trunks + routes
	 *     + selectedFileId + selectedPage
	 *   - `files/{selectedFileId}` — the calibration carrier (pages[n].origin +
	 *     scaleFactor for PDF-px ↔ real-world mm)
	 *
	 * Renders the PDF page as a background image with an SVG overlay containing
	 * outlet dots and trunk polylines. Real-world mm coordinates from the
	 * outlets doc are mapped back to PDF-px via the stored calibration, then
	 * scaled to the SVG viewBox so the overlay stays aligned with the underlay.
	 *
	 * Layer toggles come from the viewport source (`showOutlets`, `showTrunks`
	 * — both default true). Trunks are drawn as simple polylines along their
	 * waypoint list; full trunk-shape rendering is a follow-up.
	 */
	import type { Viewport } from '$lib/types/pages'
	import type { OutletConfig, Point } from '../../../outlets/parts/types'
	import { Firestore } from '$lib'

	let { viewport, db }: { viewport: Viewport; db: Firestore } = $props()

	let src = $derived(viewport.source.kind === 'outlets' ? viewport.source : null)
	let showOutlets = $derived(src?.showOutlets !== false)
	let showTrunks = $derived(src?.showTrunks !== false)

	let outletsDoc = $state<any>(null)
	$effect(() => {
		const id = src?.outletsDocId
		if (!id) { outletsDoc = null; return }
		const unsub = db.subscribeOne('outlets', id, (data: any) => { outletsDoc = data ?? null })
		return () => unsub?.()
	})

	let fileDoc = $state<any>(null)
	$effect(() => {
		const fid = outletsDoc?.selectedFileId
		if (!fid) { fileDoc = null; return }
		const unsub = db.subscribeOne('files', fid, (data: any) => { fileDoc = data ?? null })
		return () => unsub?.()
	})

	let pageNum = $derived<number>(outletsDoc?.selectedPage ?? 1)
	let calibration = $derived(fileDoc?.pages?.[pageNum - 1] ?? null)
	let crop = $derived(calibration?.crop as { x: number; y: number; width: number; height: number } | undefined)
	let scaleFactor = $derived<number>(calibration?.scaleFactor ?? 1)
	let origin = $derived<Point>(calibration?.origin ?? { x: 0, y: 0 })

	let pageUrl = $state<string | null>(null)
	let renderWidthPx = $state(0)
	let renderHeightPx = $state(0)
	$effect(() => {
		const url = fileDoc?.url
		if (!url) { pageUrl = null; return }

		let cancelled = false
		let objectUrl: string | null = null
		const controller = new AbortController()
		;(async () => {
			// eslint-disable-next-line @typescript-eslint/ban-ts-comment
			// @ts-expect-error allowImportingTsExtensions is off in this project
			const mod: any = await import('../../../uploads/parts/PdfState.svelte.ts')
			const pdf = new mod.PdfState()
			try {
				await pdf.load(url)
				if (cancelled) return
				const res = await pdf.renderToObjectUrl(pageNum, 2, controller.signal)
				if (cancelled) { URL.revokeObjectURL(res.objectUrl); return }
				objectUrl = res.objectUrl
				pageUrl = res.objectUrl
				renderWidthPx = res.width
				renderHeightPx = res.height
			} catch (e: any) {
				if (e?.name !== 'AbortError') console.warn('OutletsViewport: PDF render failed', e)
			} finally {
				pdf.destroy()
			}
		})()

		return () => {
			cancelled = true
			controller.abort()
			if (objectUrl) URL.revokeObjectURL(objectUrl)
		}
	})

	/**
	 * Map real-world mm → PDF-px using the calibration origin + scaleFactor.
	 * Both underlay and overlay share this coordinate space.
	 */
	function mmToPdfPx(p: Point): Point {
		return {
			x: origin.x + p.x / scaleFactor,
			y: origin.y + p.y / scaleFactor,
		}
	}

	/** viewBox in PDF-px, optionally cropped. Keeps the SVG aligned with the underlay. */
	let viewBox = $derived(
		crop
			? `${crop.x} ${crop.y} ${crop.width} ${crop.height}`
			: `0 0 ${renderWidthPx} ${renderHeightPx}`,
	)

	let outlets = $derived<OutletConfig[]>(outletsDoc?.outlets ?? [])
	let trunks = $derived<any[]>(outletsDoc?.trunks ?? [])
	let routes = $derived<any[]>(outletsDoc?.routes ?? [])

	const OUTLET_COLORS: Record<string, string> = {
		network: '#3b82f6', phone: '#8b5cf6', av: '#ec4899', printer: '#f59e0b',
		security: '#ef4444', ap: '#10b981', rb: '#6366f1', new: '#14b8a6', mep: '#94a3b8',
	}

	let noSource = $derived(!src?.outletsDocId)
</script>

<div class="absolute inset-0 overflow-hidden pointer-events-none bg-white">
	{#if noSource}
		<div class="w-full h-full flex items-center justify-center text-[10px] text-zinc-400 italic">
			Pick an outlets source in the properties panel
		</div>
	{:else if !outletsDoc}
		<div class="w-full h-full flex items-center justify-center text-[10px] text-zinc-400 italic">
			Loading…
		</div>
	{:else if !fileDoc}
		<div class="w-full h-full flex items-center justify-center text-[10px] text-zinc-400 italic">
			No floorplan selected on this outlets doc
		</div>
	{:else if !pageUrl || renderWidthPx === 0}
		<div class="w-full h-full flex items-center justify-center text-[10px] text-zinc-400 italic">
			Rendering floorplan…
		</div>
	{:else}
		<!-- PDF underlay + SVG overlay share the same container so they scale together -->
		<div class="relative w-full h-full">
			<img src={pageUrl} alt="floorplan" class="absolute inset-0 w-full h-full object-contain" draggable="false" />
			<svg class="absolute inset-0 w-full h-full"
				viewBox={viewBox}
				preserveAspectRatio="xMidYMid meet">
				{#if showTrunks}
					{#each routes as r (r.id)}
						{#if r.waypoints?.length >= 2}
							{@const pts = [r.waypoints[0], ...r.waypoints].map((w: Point) => mmToPdfPx(w))}
							<polyline points={pts.map((p: Point) => `${p.x},${p.y}`).join(' ')}
								fill="none" stroke="#2563eb" stroke-width={2 / scaleFactor * 1000} stroke-linecap="round" opacity="0.7" />
						{/if}
					{/each}
					{#each trunks as t (t.id)}
						{#if t.waypoints?.length >= 2}
							{@const pts = t.waypoints.map((w: Point) => mmToPdfPx(w))}
							<polyline points={pts.map((p: Point) => `${p.x},${p.y}`).join(' ')}
								fill="none" stroke="#14b8a6" stroke-width={3 / scaleFactor * 1000} stroke-linecap="round" opacity="0.8" />
						{/if}
					{/each}
				{/if}

				{#if showOutlets}
					{#each outlets as o (o.id)}
						{@const p = mmToPdfPx(o.position)}
						{@const color = OUTLET_COLORS[o.usage] ?? '#64748b'}
						{@const r = Math.max(3, 200 / scaleFactor)}
						<g>
							<circle cx={p.x} cy={p.y} r={r} fill={color} stroke="white"
								stroke-width={r * 0.2} opacity="0.9" />
							{#if o.label}
								<text x={p.x + r * 1.4} y={p.y + r * 0.4} font-size={r * 1.5} fill="#1f2937"
									style="paint-order: stroke" stroke="white" stroke-width={r * 0.3}>{o.label}</text>
							{/if}
						</g>
					{/each}
				{/if}
			</svg>
		</div>
	{/if}
</div>
