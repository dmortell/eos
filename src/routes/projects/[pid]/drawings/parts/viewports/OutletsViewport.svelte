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
	import type { TrunkConfig, TrunkNode, TrunkSegment } from '../../../outlets/trunks/types'
	import { OUTLET_DEFAULTS } from '../../../outlets/parts/constants'
	import { hitTestNode, hitTestSegment, splitSegment, genId } from '../../../outlets/trunks/geometry'
	import { portal } from '../../../outlets/trunks/portal'
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

	// ── In-place editing: drag existing outlets & trunk nodes (only when activated) ──
	let svgEl = $state<SVGSVGElement | null>(null)
	type DragTarget = { kind: 'outlet'; id: string } | { kind: 'node'; trunkId: string; nodeId: string }
	let drag = $state<DragTarget | null>(null)
	/** Optimistic outlet positions (outletId → mm), held until the doc echoes back. */
	let optOutlets = $state<Record<string, Point>>({})
	/** Optimistic trunk-node positions (`${trunkId}:${nodeId}` → mm). */
	let optNodes = $state<Record<string, Point>>({})
	const nodeKey = (trunkId: string, nodeId: string) => `${trunkId}:${nodeId}`

	/** Effective position for an outlet — optimistic override (mid/just-after drag) else stored. */
	function outletPos(o: OutletConfig): Point { return optOutlets[o.id] ?? o.position }

	/** Trunks with any dragged node positions overridden, for rendering. */
	let renderTrunks = $derived(
		Object.keys(optNodes).length === 0
			? visibleTrunks
			: visibleTrunks.map(t => ({
				...t,
				nodes: t.nodes.map(n => {
					const o = optNodes[nodeKey(t.id, n.id)]
					return o ? { ...n, position: o } : n
				}),
			})),
	)

	// Drop each optimistic override once the source doc echoes the new position
	// (so an element never flashes back to its old spot between commit and round-trip).
	$effect(() => {
		const docOutlets = outletsDoc?.outlets as OutletConfig[] | undefined
		const docTrunks = outletsDoc?.trunks as TrunkConfig[] | undefined
		if (drag) return
		const oIds = Object.keys(optOutlets)
		if (oIds.length && docOutlets) {
			const next = { ...optOutlets }; let changed = false
			for (const id of oIds) {
				const o = docOutlets.find(x => x.id === id)
				if (o && Math.hypot(o.position.x - optOutlets[id].x, o.position.y - optOutlets[id].y) < 1) { delete next[id]; changed = true }
			}
			if (changed) optOutlets = next
		}
		const nKeys = Object.keys(optNodes)
		if (nKeys.length && docTrunks) {
			const next = { ...optNodes }; let changed = false
			for (const key of nKeys) {
				const [tid, nid] = key.split(':')
				const n = docTrunks.find(t => t.id === tid)?.nodes.find(x => x.id === nid)
				if (n && Math.hypot(n.position.x - optNodes[key].x, n.position.y - optNodes[key].y) < 1) { delete next[key]; changed = true }
			}
			if (changed) optNodes = next
		}
	})

	/** Map a client point to real-world mm via the SVG's screen CTM (accounts for all canvas transforms). */
	function clientToMm(clientX: number, clientY: number): Point | null {
		const ctm = svgEl?.getScreenCTM()
		if (!ctm) return null
		const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse()) // → PDF-px (SVG user units)
		return { x: (p.x - origin.x) * scaleFactor, y: (p.y - origin.y) * scaleFactor }
	}

	// Mouse events (not pointer) so stopPropagation suppresses the frame's
	// pan/content mousedown when a drag starts on an element. Left-drag on an
	// outlet or trunk node moves it; left-drag on empty bubbles to the frame
	// (which does nothing on left when active) — middle/right still pans.
	function onEditMouseDown(e: MouseEvent) {
		if (!active || e.button !== 0) return
		const mm = clientToMm(e.clientX, e.clientY)
		if (!mm) return
		// Add-outlet tool: click drops a new outlet at the point (stays in tool for
		// repeated adds). Defaults from the outlets tool so the doc stays valid.
		if (editMode === 'outlet') {
			e.stopPropagation()
			e.preventDefault()
			void persistOutlets([...(outletsDoc?.outlets ?? []), { id: genId('o'), position: mm, ...OUTLET_DEFAULTS }])
			return
		}
		// Nearest outlet or trunk node within ~250 mm.
		let best: { d: number; target: DragTarget; start: Point } | null = null
		for (const o of visibleOutlets) {
			const d = Math.hypot(mm.x - o.position.x, mm.y - o.position.y)
			if (d <= 250 && (!best || d < best.d)) best = { d, target: { kind: 'outlet', id: o.id }, start: { ...o.position } }
		}
		for (const t of visibleTrunks) {
			for (const n of t.nodes) {
				const d = Math.hypot(mm.x - n.position.x, mm.y - n.position.y)
				if (d <= 250 && (!best || d < best.d)) best = { d, target: { kind: 'node', trunkId: t.id, nodeId: n.id }, start: { ...n.position } }
			}
		}
		if (!best) return // empty → let it bubble to the frame
		e.stopPropagation()
		e.preventDefault()
		drag = best.target
		if (best.target.kind === 'outlet') optOutlets = { ...optOutlets, [best.target.id]: best.start }
		else optNodes = { ...optNodes, [nodeKey(best.target.trunkId, best.target.nodeId)]: best.start }
		window.addEventListener('mousemove', onEditMouseMove)
		window.addEventListener('mouseup', onEditMouseUp)
	}
	function onEditMouseMove(e: MouseEvent) {
		const d = drag
		if (!d) return
		const mm = clientToMm(e.clientX, e.clientY)
		if (!mm) return
		if (d.kind === 'outlet') optOutlets = { ...optOutlets, [d.id]: mm }
		else optNodes = { ...optNodes, [nodeKey(d.trunkId, d.nodeId)]: mm }
	}
	async function onEditMouseUp() {
		const d = drag
		drag = null
		window.removeEventListener('mousemove', onEditMouseMove)
		window.removeEventListener('mouseup', onEditMouseUp)
		if (!d || !src?.outletsDocId) return
		if (d.kind === 'outlet') {
			const pos = optOutlets[d.id]
			if (!pos) return
			const next = (outletsDoc?.outlets ?? []).map((o: OutletConfig) => o.id === d.id ? { ...o, position: pos } : o)
			await db.save('outlets', { id: src.outletsDocId, outlets: next })
		} else {
			const pos = optNodes[nodeKey(d.trunkId, d.nodeId)]
			if (!pos) return
			const next = (outletsDoc?.trunks ?? []).map((t: TrunkConfig) =>
				t.id === d.trunkId ? { ...t, nodes: t.nodes.map(n => n.id === d.nodeId ? { ...n, position: pos } : n) } : t)
			await db.save('outlets', { id: src.outletsDocId, trunks: next })
		}
	}

	// ── In-viewport add / disconnect tools ──
	let editMode = $state<'select' | 'outlet'>('select')
	type TrunkMenu = { x: number; y: number; trunkId: string; kind: 'node' | 'segment'; nodeId?: string; segmentId?: string; pointMm: Point; canDisconnect: boolean }
	let trunkMenu = $state<TrunkMenu | null>(null)
	// Reset edit state when the viewport is deactivated.
	$effect(() => { if (!active) { editMode = 'select'; trunkMenu = null } })

	async function persistOutlets(outlets: OutletConfig[]) {
		if (src?.outletsDocId) await db.save('outlets', { id: src.outletsDocId, outlets })
	}
	async function persistTrunks(trunks: TrunkConfig[]) {
		if (src?.outletsDocId) await db.save('outlets', { id: src.outletsDocId, trunks })
	}

	/** Right-click a trunk node/segment → open the edit context menu. */
	function onEditContextMenu(e: MouseEvent) {
		if (!active) return
		const mm = clientToMm(e.clientX, e.clientY)
		if (!mm) return
		for (const t of visibleTrunks) {
			const node = hitTestNode(mm, t.nodes, 250)
			if (node) {
				e.preventDefault(); e.stopPropagation()
				const segs = t.segments.filter(s => s.nodes[0] === node.id || s.nodes[1] === node.id)
				trunkMenu = { x: e.clientX, y: e.clientY, trunkId: t.id, kind: 'node', nodeId: node.id, pointMm: mm, canDisconnect: segs.length >= 2 }
				return
			}
			const seg = hitTestSegment(mm, t.nodes, t.segments, 0)
			if (seg) {
				e.preventDefault(); e.stopPropagation()
				trunkMenu = { x: e.clientX, y: e.clientY, trunkId: t.id, kind: 'segment', segmentId: seg.segment.id, pointMm: mm, canDisconnect: false }
				return
			}
		}
	}

	function menuInsertNode() {
		const m = trunkMenu; trunkMenu = null
		if (m?.kind !== 'segment' || !m.segmentId) return
		const t = (outletsDoc?.trunks ?? []).find((x: TrunkConfig) => x.id === m.trunkId)
		if (!t) return
		const { trunk } = splitSegment(t, m.segmentId, m.pointMm)
		void persistTrunks((outletsDoc?.trunks ?? []).map((x: TrunkConfig) => x.id === m.trunkId ? trunk : x))
	}
	function menuDisconnect() {
		const m = trunkMenu; trunkMenu = null
		if (m?.kind !== 'node' || !m.nodeId) return
		const t = (outletsDoc?.trunks ?? []).find((x: TrunkConfig) => x.id === m.trunkId)
		const node = t?.nodes.find((n: TrunkNode) => n.id === m.nodeId)
		const segs = t?.segments.filter((s: TrunkSegment) => s.nodes[0] === m.nodeId || s.nodes[1] === m.nodeId) ?? []
		if (!t || !node || segs.length < 2) return
		// Split the junction: move the last segment onto a fresh coincident node.
		const seg = segs[segs.length - 1]
		const newId = genId('tn')
		const newNode: TrunkNode = { id: newId, position: { ...node.position }, z: node.z }
		const updated = { ...t, nodes: [...t.nodes, newNode],
			segments: t.segments.map((s: TrunkSegment) => s.id === seg.id
				? { ...s, nodes: (s.nodes[0] === m.nodeId ? [newId, s.nodes[1]] : [s.nodes[0], newId]) as [string, string] } : s) }
		void persistTrunks((outletsDoc?.trunks ?? []).map((x: TrunkConfig) => x.id === m.trunkId ? updated : x))
	}
	function menuDeleteNode() {
		const m = trunkMenu; trunkMenu = null
		if (m?.kind !== 'node' || !m.nodeId) return
		const t = (outletsDoc?.trunks ?? []).find((x: TrunkConfig) => x.id === m.trunkId)
		if (!t) return
		const connected = t.segments.filter((s: TrunkSegment) => s.nodes[0] === m.nodeId || s.nodes[1] === m.nodeId)
		let segments = t.segments.filter((s: TrunkSegment) => s.nodes[0] !== m.nodeId && s.nodes[1] !== m.nodeId)
		// Degree-2 node → reconnect its two neighbours so the run stays continuous.
		if (connected.length === 2) {
			const a = connected[0].nodes[0] === m.nodeId ? connected[0].nodes[1] : connected[0].nodes[0]
			const b = connected[1].nodes[0] === m.nodeId ? connected[1].nodes[1] : connected[1].nodes[0]
			if (a !== b && !segments.some((s: TrunkSegment) => (s.nodes[0] === a && s.nodes[1] === b) || (s.nodes[0] === b && s.nodes[1] === a)))
				segments = [...segments, { id: genId('ts'), nodes: [a, b] as [string, string] }]
		}
		const nodes = t.nodes.filter((n: TrunkNode) => n.id === m.nodeId ? false : segments.some((s: TrunkSegment) => s.nodes[0] === n.id || s.nodes[1] === n.id))
		const trunks = (outletsDoc?.trunks ?? []) as TrunkConfig[]
		// Drop the trunk entirely if it no longer has a drawable segment.
		void persistTrunks(segments.length === 0 ? trunks.filter(x => x.id !== m.trunkId) : trunks.map(x => x.id === m.trunkId ? { ...t, nodes, segments } : x))
	}
	function menuDeleteTrunk() {
		const m = trunkMenu; trunkMenu = null
		if (!m) return
		void persistTrunks((outletsDoc?.trunks ?? []).filter((x: TrunkConfig) => x.id !== m.trunkId))
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
				style:cursor={active ? (editMode === 'outlet' ? 'copy' : 'move') : 'default'}
				onmousedown={onEditMouseDown}
				oncontextmenu={onEditContextMenu}>
				{#if showTrunks}
					<!--
						Full trunk shapes via the outlets tool's own renderer.
						`toPx` shares the viewport's mm → PDF-px mapping so shapes
						line up with outlets + underlay. Passing empty selection /
						drawing sets makes it render in pure read-only mode.
					-->
					<TrunkRenderer
						trunks={renderTrunks}
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
			<!-- Draggable handles when activated: trunk-node vertices (outlets are already dots). -->
					{#if active && showTrunks}
						{#each renderTrunks as t (t.id)}
							{#each t.nodes as n (n.id)}
								{@const np = mmToPdfPx(n.position)}
								{@const hr = Math.max(3, 150 / scaleFactor)}
								<circle cx={np.x} cy={np.y} r={hr} fill="#06b6d4" stroke="white" stroke-width={hr * 0.25} opacity="0.9" />
							{/each}
						{/each}
					{/if}
				</svg>
		</div>
		</div>
	{/if}

	{#if active}
		<!-- Edit toolbar — unscaled, pinned to the viewport's top-left. -->
		<div class="absolute top-1 left-1 z-10 flex gap-0.5 rounded border border-zinc-300 bg-white/95 shadow-sm p-0.5 print:hidden" style="pointer-events:auto">
			{#each [{ m: 'select', label: 'Select' }, { m: 'outlet', label: '+ Outlet' }] as opt (opt.m)}
				<button class="px-1.5 py-0.5 text-[10px] rounded {editMode === opt.m ? 'bg-blue-600 text-white' : 'text-zinc-600 hover:bg-zinc-100'}"
					onmousedown={(e) => { e.stopPropagation(); editMode = opt.m as 'select' | 'outlet' }}>{opt.label}</button>
			{/each}
			<span class="px-1 self-center text-[9px] text-zinc-400">right-click a trunk to edit</span>
		</div>
	{/if}

	{#if trunkMenu}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div use:portal class="fixed inset-0 z-40" onmousedown={() => trunkMenu = null}
			oncontextmenu={(e) => { e.preventDefault(); trunkMenu = null }}></div>
		<div use:portal class="fixed z-50 min-w-32 rounded-md border border-zinc-200 bg-white shadow-lg py-1 text-xs"
			style:left="{trunkMenu.x}px" style:top="{trunkMenu.y}px">
			{#if trunkMenu.kind === 'segment'}
				<button class="block w-full text-left px-3 py-1 hover:bg-zinc-100" onclick={menuInsertNode}>Insert node</button>
			{:else}
				{#if trunkMenu.canDisconnect}
					<button class="block w-full text-left px-3 py-1 hover:bg-zinc-100" onclick={menuDisconnect}>Disconnect node</button>
				{/if}
				<button class="block w-full text-left px-3 py-1 hover:bg-zinc-100" onclick={menuDeleteNode}>Delete node</button>
			{/if}
			<button class="block w-full text-left px-3 py-1 hover:bg-zinc-100 text-red-600" onclick={menuDeleteTrunk}>Delete trunk</button>
		</div>
	{/if}
</div>
