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
	 * outlet dots and trunk shapes. Real-world mm coordinates from the outlets
	 * doc are mapped back to PDF-px via the stored calibration, then scaled to
	 * the SVG viewBox so the overlay stays aligned with the underlay.
	 *
	 * Layer toggles come from the viewport source (`showOutlets`, `showTrunks`
	 * — both default true). Trunks now use the real `TrunkRenderer` from the
	 * outlets tool so pipe/rect shapes + ceiling-dashed styling appear exactly
	 * as in the editor; non-trunk `routes` still draw as simple polylines.
	 */
	import type { Viewport } from '$lib/types/pages'
	import type { OutletConfig, Point } from '../../../outlets/parts/types'
	import type { TrunkConfig } from '../../../outlets/trunks/types'
	import { Firestore } from '$lib'
	import TrunkRenderer from '../../../outlets/trunks/TrunkRenderer.svelte'

	let { viewport, db, onfit, active = false }: {
		viewport: Viewport
		db: Firestore
		/** Reports the real 1:N that fits the current frame, so a fit request (scale 0) can lock to a fixed scale. */
		onfit?: (scale: number) => void
		/** When activated (double-clicked into), existing outlets can be dragged to reposition them. */
		active?: boolean
	} = $props()

	let src = $derived(viewport.source.kind === 'outlets' ? viewport.source : null)
	let showOutlets = $derived(src?.showOutlets !== false)
	let showTrunks = $derived(src?.showTrunks !== false)
	let layers = $derived(src?.layers ?? {})

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

	/**
	 * World-scale rendering. The PDF page is rendered at its natural pixel size
	 * (renderWidthPx × renderHeightPx) and transformed into the viewport's
	 * paper-mm space (1 px = 1 paper-mm at canvas zoom 1):
	 *
	 *   - `viewport.scale > 0` → true drawing scale 1:N. 1 real-world mm maps to
	 *     (1/N) paper-mm. Since 1 PDF-px = `scaleFactor` mm, the PDF-px content is
	 *     scaled by `scaleFactor / N`. The view is panned by `contentOffsetMm`
	 *     (real-world mm), so the frame is a window onto the plan at exact scale.
	 *   - `viewport.scale === 0` → fit the whole page into the frame, centred
	 *     (the previous behaviour, now the explicit "Fit to viewport" option).
	 */
	let contentW = $derived(renderWidthPx)
	let contentH = $derived(renderHeightPx)
	let worldScale = $derived(scaleFactor > 0 && (viewport.scale ?? 0) > 0 ? scaleFactor / viewport.scale : 0)
	let fitScale = $derived(contentW && contentH ? Math.min(viewport.widthMm / contentW, viewport.heightMm / contentH) : 1)
	let innerScale = $derived(worldScale > 0 ? worldScale : fitScale)
	let offX = $derived(viewport.contentOffsetMm?.x ?? 0)
	let offY = $derived(viewport.contentOffsetMm?.y ?? 0)
	// Translate (PDF-px) applied inside scale(), origin top-left. Content pins to
	// the frame's top-left in both fit and fixed-scale modes (only `innerScale`
	// differs), so the one-shot fit→fixed lock is visually seamless. Pan shifts it
	// by `contentOffsetMm` (real-world mm → PDF-px via scaleFactor).
	let txPdf = $derived(-(offX / scaleFactor))
	let tyPdf = $derived(-(offY / scaleFactor))

	/**
	 * One-shot "fit": when `scale === 0` (a fit request), compute the real 1:N
	 * that fits the current frame and persist it via `onfit`. The viewport then
	 * behaves as a fixed-scale window — **resizing the frame crops instead of
	 * rescaling the content**. Choosing "Fit to viewport" again (scale → 0) at a
	 * new frame size re-runs this. The token guards against duplicate writes
	 * between the persist and the resulting prop update.
	 */
	let lastFitToken = ''
	$effect(() => {
		if ((viewport.scale ?? 0) !== 0) { lastFitToken = ''; return }
		if (!fitScale || scaleFactor <= 0 || !contentW) return
		const token = `${viewport.id}:${Math.round(viewport.widthMm)}x${Math.round(viewport.heightMm)}`
		if (token === lastFitToken) return
		lastFitToken = token
		onfit?.(Math.max(1, Math.round(scaleFactor / fitScale)))
	})

	let outlets = $derived<OutletConfig[]>(outletsDoc?.outlets ?? [])
	let trunks = $derived<TrunkConfig[]>(outletsDoc?.trunks ?? [])
	let routes = $derived<any[]>(outletsDoc?.routes ?? [])

	// Per-layer visibility (high/low outlets, primary/secondary trunks, ceiling/floor).
	let visibleOutlets = $derived(outlets.filter(o =>
		o.level === 'high' ? layers.outletsHigh !== false : layers.outletsLow !== false))
	let visibleTrunks = $derived(trunks.filter(t => {
		const okClass = t.isPrimary ? layers.trunksPrimary !== false : layers.trunksSecondary !== false
		const isCeiling = String(t.location ?? '').startsWith('ceiling')
		const okPlane = isCeiling ? layers.ceiling !== false : layers.floor !== false
		return okClass && okPlane
	}))

	const OUTLET_COLORS: Record<string, string> = {
		network: '#3b82f6', phone: '#8b5cf6', av: '#ec4899', printer: '#f59e0b',
		security: '#ef4444', ap: '#10b981', rb: '#6366f1', new: '#14b8a6', mep: '#94a3b8',
	}

	let noSource = $derived(!src?.outletsDocId)

	// ── In-place editing: drag existing outlets (only when activated) ──
	let svgEl = $state<SVGSVGElement | null>(null)
	/** Optimistic positions (outletId → mm) held from drag-commit until the doc echoes back, so the dot doesn't flash to its old spot. */
	let optimistic = $state<Record<string, Point>>({})
	let drag = $state<{ id: string } | null>(null)

	/** Effective position for an outlet — optimistic override (mid/just-after drag) else the stored value. */
	function outletPos(o: OutletConfig): Point { return optimistic[o.id] ?? o.position }

	// Drop each optimistic override once the source doc echoes the new position
	// (so the dot never flashes back to its old spot between commit and round-trip).
	$effect(() => {
		const docOutlets = outletsDoc?.outlets as OutletConfig[] | undefined
		if (drag || !docOutlets) return
		const ids = Object.keys(optimistic)
		if (!ids.length) return
		const next = { ...optimistic }
		let changed = false
		for (const id of ids) {
			const o = docOutlets.find(x => x.id === id)
			if (o && Math.hypot(o.position.x - optimistic[id].x, o.position.y - optimistic[id].y) < 1) {
				delete next[id]; changed = true
			}
		}
		if (changed) optimistic = next
	})

	/** Map a client point to real-world mm via the SVG's screen CTM (accounts for all canvas transforms). */
	function clientToMm(clientX: number, clientY: number): Point | null {
		const ctm = svgEl?.getScreenCTM()
		if (!ctm) return null
		const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse()) // → PDF-px (SVG user units)
		return { x: (p.x - origin.x) * scaleFactor, y: (p.y - origin.y) * scaleFactor }
	}

	// Mouse events (not pointer) so stopPropagation suppresses the frame's
	// pan-content mousedown when a drag starts on an outlet.
	function onEditMouseDown(e: MouseEvent) {
		if (!active || e.button !== 0) return
		const mm = clientToMm(e.clientX, e.clientY)
		if (!mm) return
		// Hit-test outlets (generous ~250 mm radius around the dot).
		let hit: OutletConfig | null = null
		let bestD = 250
		for (const o of visibleOutlets) {
			const d = Math.hypot(mm.x - o.position.x, mm.y - o.position.y)
			if (d <= bestD) { bestD = d; hit = o }
		}
		if (!hit) return // empty → let it bubble to the frame (pan)
		e.stopPropagation()
		e.preventDefault()
		drag = { id: hit.id }
		optimistic = { ...optimistic, [hit.id]: { ...hit.position } }
		window.addEventListener('mousemove', onEditMouseMove)
		window.addEventListener('mouseup', onEditMouseUp)
	}
	function onEditMouseMove(e: MouseEvent) {
		if (!drag) return
		const mm = clientToMm(e.clientX, e.clientY)
		if (mm) optimistic = { ...optimistic, [drag.id]: mm }
	}
	async function onEditMouseUp() {
		const d = drag
		drag = null
		window.removeEventListener('mousemove', onEditMouseMove)
		window.removeEventListener('mouseup', onEditMouseUp)
		if (!d || !src?.outletsDocId) return
		const pos = optimistic[d.id]
		if (!pos) return
		// Persist back to the live outlets doc (merge replaces just the outlets array).
		const next = (outletsDoc?.outlets ?? []).map((o: OutletConfig) => o.id === d.id ? { ...o, position: pos } : o)
		await db.save('outlets', { id: src.outletsDocId, outlets: next })
	}
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
		<!--
			PDF underlay + SVG overlay share one transformed box so they scale and
			pan together. Content is sized in natural PDF-px; the transform maps it
			into paper-mm space at the viewport's drawing scale (see derivations).
		-->
		<div class="absolute top-0 left-0"
			style:transform="scale({innerScale}) translate({txPdf}px, {tyPdf}px)"
			style:transform-origin="top left">
		<div class="relative" style:width="{contentW}px" style:height="{contentH}px">
			<img src={pageUrl} alt="floorplan" class="absolute top-0 left-0" style:width="{contentW}px" style:height="{contentH}px" draggable="false" />
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<svg bind:this={svgEl} class="absolute top-0 left-0" width={contentW} height={contentH}
				viewBox="0 0 {contentW} {contentH}"
				preserveAspectRatio="none"
				style:pointer-events={active ? 'auto' : 'none'}
				style:cursor={active ? 'move' : 'default'}
				onmousedown={onEditMouseDown}>
				{#if showTrunks}
					<!--
						Full trunk shapes via the outlets tool's own renderer.
						`toPx` shares the viewport's mm → PDF-px mapping so shapes
						line up with outlets + underlay. Passing empty selection /
						drawing sets makes it render in pure read-only mode.
					-->
					<TrunkRenderer
						trunks={visibleTrunks}
						{calibration}
						zoom={1}
						toPx={mmToPdfPx}
						selectedTrunkIds={new Set()}
						selectedNodeIds={new Set()} />

					<!--
						Secondary outlet→rack routes. Styled consistently with trunks:
						polyline body with rounded joins, waypoint bullets at every
						intermediate node, and an optional length pill at the route's
						midpoint. Simpler than full trunk geometry (no catalog shape
						spec), but at-a-glance readable on a drawing page.
					-->
					{#each routes as r (r.id)}
						{#if r.waypoints?.length >= 2}
							{@const pts = (r.waypoints as Point[]).map(w => mmToPdfPx(w))}
							{@const strokeW = 2 / scaleFactor * 1000}
							{@const nodeR = 2.5 / scaleFactor * 1000}
							{@const midIdx = Math.floor(pts.length / 2)}
							{@const mid = pts.length % 2 === 0
								? { x: (pts[midIdx - 1].x + pts[midIdx].x) / 2, y: (pts[midIdx - 1].y + pts[midIdx].y) / 2 }
								: pts[midIdx]}
							{@const lengthM = (r.length ?? 0) / 1000}
							<polyline points={pts.map(p => `${p.x},${p.y}`).join(' ')}
								fill="none" stroke="#2563eb" stroke-width={strokeW}
								stroke-linecap="round" stroke-linejoin="round" opacity="0.75" />
							<!-- Waypoint bullets — skip endpoints since those are the outlet dot / rack anchor. -->
							{#each pts.slice(1, -1) as wp}
								<circle cx={wp.x} cy={wp.y} r={nodeR} fill="#2563eb" opacity="0.9" />
							{/each}
							{#if lengthM > 0}
								{@const labelW = 5 / scaleFactor * 1000}
								{@const labelH = 3 / scaleFactor * 1000}
								<g transform="translate({mid.x - labelW / 2} {mid.y - labelH / 2})" class="pointer-events-none">
									<rect width={labelW} height={labelH} fill="white" stroke="#2563eb"
										stroke-width={strokeW * 0.3} rx={labelH * 0.15} opacity="0.95" />
									<text x={labelW / 2} y={labelH * 0.68} text-anchor="middle"
										font-size={labelH * 0.55} fill="#2563eb" font-weight="600">
										{lengthM.toFixed(1)}m
									</text>
								</g>
							{/if}
						{/if}
					{/each}
				{/if}

				{#if showOutlets}
					{#each visibleOutlets as o (o.id)}
						{@const p = mmToPdfPx(outletPos(o))}
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
		</div>
	{/if}
</div>
