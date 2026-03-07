<script lang="ts">
	import { onMount, onDestroy, getContext } from 'svelte'
	import { PdfState } from './PdfState.svelte'
	import { TileCache } from './TileCache'
	import { TileRenderer } from './TileRenderer'
	import { TILE_SIZE, computeTileScale, getVisibleTiles, tileWorldRect, tilePriority } from './TileGrid'
	import { useCadStores } from '../stores'
	import type { ShapeBase } from '../types/shape'

	let { shape }: { shape: ShapeBase & { src: string; pdfPage?: number; aspectRatio?: number } } = $props()

	const { shapes, data, page, view } = useCadStores()

	// Viewport tile context — set by ViewportContent when this image is inside a viewport
	interface VpTileContext {
		vpX: number; vpY: number; vpW: number; vpH: number
		modelX: number; modelY: number; vpScale: number
	}
	let vpCtxFn: (() => VpTileContext) | undefined
	try { vpCtxFn = getContext('viewportTileContext') } catch {}

	let loading = $state(true)
	let error = $state(false)
	let mounted = true

	// Overview image (low-res fallback always visible)
	let overviewUrl = $state<string>('')

	// Active tiles currently displayed (fractional positions within shape bounds)
	let activeTiles = $state<Array<{
		key: string; objectUrl: string
		fx: number; fy: number; fw: number; fh: number
	}>>([])

	const pageNum = $derived(shape.pdfPage ?? 1)
	const x = $derived(Math.min(shape.x1, shape.x2))
	const y = $derived(Math.min(shape.y1, shape.y2))
	const w = $derived(Math.abs(shape.x2 - shape.x1))
	const h = $derived(Math.abs(shape.y2 - shape.y1))

	let pdfPageWidth = $state(0)
	let pdfPageHeight = $state(0)
	let pdf: PdfState | null = null
	let updateTimer: ReturnType<typeof setTimeout> | null = null

	// Compute tile scale from current zoom (account for viewport magnification)
	const tileScale = $derived(computeTileScale(w, pdfPageWidth, view.zoom, vpCtxFn ? vpCtxFn().vpScale : view.paperScale))

/*
Tiling is expensive but necessary for large zoom. If you’re doing deep zoom (like maps), use:
	{pdfId}_{page}_{zoomLevel}_{tileX}_{tileY}
But only tile when Page size is large, eg > viewport × 2 or Zoom > 200%
Otherwise single full-page raster is cheaper.

Because this is CAD (not Google Maps), Most users zoom 25% 50% 100% 200% 400%
So instead of arbitrary scaling, quantize zoom levels. Render only at: 72 DPI 144 DPI 288 DPI 576 DPI
Then scale slightly in-between. This reduces render combinations dramatically.

Rendering pdf at different qualities and tiled versions for large zoom takes resources.
For a serious app, cache with OPFS + IndexedDB index
PDFs are currently stored in dropbox and box, with maybe gdrive or teams in future.
Store fileId, fileVersion, binaryBlob, lastAccessed.
Cache key should include fileId, fileVersion, pageNumber, dpi and tileCoords (if tiled).
Use ETag, Last-Modified, File version ID (Dropbox & Box provide this). Using size & lastAccessed, evict with LRU when exceeding size threshold (e.g., 1–2GB).

When user opens page, consider rendering 100% DPI immediately, then schedule idle tasks for Pre-render 200% and Pre-render 50%

PDFs are mostly used as background references, so Pre-convert them once to Optimized image pyramid, Store that pyramid in OPFS, Then never touch PDF again during runtime.

*/

	// Reactive tile update on zoom/pan
	$effect(() => {
		// Track dependencies
		const _scale = tileScale
		const _vx = view.x
		const _vy = view.y
		const _zoom = view.zoom
		if (loading || error || !overviewUrl || !pdfPageWidth) return
		if (updateTimer) clearTimeout(updateTimer)
		updateTimer = setTimeout(() => {
			if (mounted) updateVisibleTiles()
		}, 200)
	})

	/** Try to refresh an expired Dropbox URL */
	async function refreshUrl(): Promise<string | null> {
		const s = shape as any
		if (!s.assetPath || s.provider !== 'dropbox') {
			console.warn('PdfTiledImage: cannot refresh — missing assetPath or provider', {
				id: shape.id, provider: s.provider, assetPath: s.assetPath
			})
			return null
		}
		try {
			const params = new URLSearchParams({ path: s.assetPath })
			const resp = await fetch(`/api/files/dropbox/${s.assetId || 'refresh'}?${params}`)
			const json = await resp.json()
			if (json.success && json.data?.downloadUrl) {
				console.log('PdfTiledImage: URL refresh succeeded', { id: shape.id, path: s.assetPath })
				return json.data.downloadUrl
			}
			console.warn('PdfTiledImage: refresh API returned failure', { id: shape.id, response: json })
		} catch (e) {
			console.warn('PdfTiledImage: URL refresh fetch failed', { id: shape.id }, e)
		}
		return null
	}

	async function loadPdf(url: string) {
		pdf = new PdfState()
		await pdf.load(url)

		const dims = await pdf.getPageDimensions(pageNum)
		pdfPageWidth = dims.width
		pdfPageHeight = dims.height

		// Render low-res overview (scale=0.5) for fallback
		const result = await pdf.renderToObjectUrl(pageNum, 0.5)
		overviewUrl = result.objectUrl

		// Update shape aspect ratio
		if (dims.width && dims.height) {
			let changed = 0
			const ar = dims.width / dims.height
			const updates: any = { aspectRatio: ar }
			const currentW = Math.abs(shape.x2 - shape.x1)
			const currentH = Math.abs(shape.y2 - shape.y1)
			const currentAr = currentW / Math.max(currentH, 1)
			if (updates.ar!=shape.aspectRatio) changed=1
			if (Math.abs(currentAr - 1) < 0.1) {
				const newH = currentW / ar
				const cy = (shape.y1 + shape.y2) / 2
				updates.y1 = cy - newH / 2
				updates.y2 = cy + newH / 2
				if (updates.y1!=shape.y1 || updates.y2!=shape.y2) changed=1
			}
			if (changed){
				shapes.update(shape.id, updates)
				const updated = shapes.get(shape.id)
				if (updated) data.saveShape(page.pid, updated)
			}
		}
	}

	/** Convert absolute world rect to fractional position within shape bounds */
	function toFractional(rect: { x: number; y: number; width: number; height: number }) {
		return { fx: (rect.x - x) / w, fy: (rect.y - y) / h, fw: rect.width / w, fh: rect.height / h }
	}

	function updateVisibleTiles() {
		if (!pdfPageWidth || !pdfPageHeight) return
		const canvasRect = view.canvas?.getBoundingClientRect()
		if (!canvasRect) return

		// Compute effective view parameters for shapes inside a viewport
		// The viewport content transform changes how model coords map to screen:
		//   screen = (model - modelCenter) * (paperScale/vpScale) + vpCenter → paper world → screen
		// We compute effective viewX/Y/paperScale so getVisibleTiles uses model coords directly
		let effectiveViewX = view.x, effectiveViewY = view.y
		let effectivePaperScale = view.paperScale
		let clipMinX: number | undefined, clipMinY: number | undefined
		let clipMaxX: number | undefined, clipMaxY: number | undefined

		if (vpCtxFn) {
			const vp = vpCtxFn()
			const zps = view.zoom / view.paperScale
			effectivePaperScale = vp.vpScale
			// Effective view offset: accounts for viewport frame position + content transform
			effectiveViewX = view.x + (vp.vpX + vp.vpW / 2) * zps - vp.modelX * view.zoom / vp.vpScale
			effectiveViewY = view.y + (vp.vpY + vp.vpH / 2) * zps - vp.modelY * view.zoom / vp.vpScale
			// Clip to viewport frame bounds in screen pixels
			clipMinX = vp.vpX * zps + view.x
			clipMinY = vp.vpY * zps + view.y
			clipMaxX = (vp.vpX + vp.vpW) * zps + view.x
			clipMaxY = (vp.vpY + vp.vpH) * zps + view.y
		}

		const visible = getVisibleTiles(
			x, y, x + w, y + h,
			pdfPageWidth, pdfPageHeight,
			tileScale,
			effectiveViewX, effectiveViewY, view.zoom, effectivePaperScale,
			canvasRect.width, canvasRect.height,
			shape.src, pageNum,
			clipMinX, clipMinY, clipMaxX, clipMaxY
		)

		if (visible.length === 0) {
			activeTiles = []
			return
		}

		// Compute center tile for priority
		const centerCol = visible.reduce((s, t) => s + t.col, 0) / visible.length
		const centerRow = visible.reduce((s, t) => s + t.row, 0) / visible.length

		// Cancel old tile requests
		PdfTiledImage.renderer.cancelAll(`${shape.src}|${pageNum}|`)

		// Request tiles
		const newTiles = [...activeTiles.filter(t =>
			visible.some(v => v.key === t.key)
		)]

		for (const tile of visible) {
			// Already active?
			if (newTiles.some(t => t.key === tile.key)) continue

			// Check cache
			const cached = PdfTiledImage.tileCache.get(tile.key)
			if (cached) {
				const rect = tileWorldRect(
					tile.col, tile.row, TILE_SIZE, tile.scale,
					pdfPageWidth, pdfPageHeight, x, y, w, h
				)
				newTiles.push({ key: tile.key, objectUrl: cached.objectUrl, ...toFractional(rect) })
				continue
			}

			// Enqueue render
			const priority = tilePriority(tile.col, tile.row, Math.round(centerCol), Math.round(centerRow))
			PdfTiledImage.renderer.enqueue({
				src: shape.src,
				pageNum,
				col: tile.col,
				row: tile.row,
				scale: tile.scale,
				priority,
				onComplete: (objectUrl, _w, _h, _byteSize) => {
					if (!mounted) return
					const rect = tileWorldRect(
						tile.col, tile.row, TILE_SIZE, tile.scale,
						pdfPageWidth, pdfPageHeight, x, y, w, h
					)
					activeTiles = [...activeTiles.filter(t => t.key !== tile.key), {
						key: tile.key, objectUrl, ...toFractional(rect)
					}]
				}
			})
		}

		activeTiles = newTiles
	}

	onMount(async () => {
		if (!shape.src) {
			error = true
			loading = false
			return
		}

		try {
			await loadPdf(shape.src)
		} catch (err) {
			const s = shape as any
			console.warn('PdfTiledImage: load failed, attempting URL refresh...', {
				id: shape.id, name: s.name,
				hasAssetPath: !!s.assetPath, hasProvider: !!s.provider,
				provider: s.provider, assetPath: s.assetPath,
				srcPrefix: shape.src?.substring(0, 80),
			}, err)
			pdf?.destroy()
			pdf = null
			const freshUrl = await refreshUrl()
			if (freshUrl) {
				console.log('PdfTiledImage: got fresh URL, retrying...', { id: shape.id })
				try {
					await loadPdf(freshUrl)
					shapes.update(shape.id, { src: freshUrl } as any)
					const refreshed = shapes.get(shape.id)
					if (refreshed) data.saveShape(page.pid, refreshed)
				} catch (retryErr) {
					console.warn('PdfTiledImage: retry with fresh URL also failed', { id: shape.id }, retryErr)
					error = true
				}
			} else {
				console.warn('PdfTiledImage: URL refresh returned null — cannot recover', { id: shape.id })
				error = true
			}
		} finally {
			loading = false
		}
	})

	onDestroy(() => {
		mounted = false
		if (updateTimer) clearTimeout(updateTimer)
		PdfTiledImage.renderer.cancelAll(`${shape.src}|${pageNum}|`)
		if (overviewUrl) URL.revokeObjectURL(overviewUrl)
		pdf?.destroy()
	})
</script>

<script lang="ts" module>
	import { TileCache as _TileCache } from './TileCache'
	import { TileRenderer as _TileRenderer } from './TileRenderer'

	/** Shared tile cache and renderer across all PdfTiledImage instances */
	export class PdfTiledImage {
		static tileCache = new _TileCache(256 * 1024 * 1024) // 256 MB
		static renderer = new _TileRenderer(PdfTiledImage.tileCache, 3)
	}
</script>

<!-- Always show overview image as background -->
{#if overviewUrl}
	<image href={overviewUrl} {x} {y} width={w} height={h}
		preserveAspectRatio="xMidYMid meet"
		data-type={shape.type} data-id={shape.id} cursor="move"
		opacity={activeTiles.length > 0 ? 0.3 : 1} />
{/if}

<!-- Overlay high-res tiles (fractional positions recomputed from current shape bounds) -->
{#each activeTiles as tile (tile.key)}
	<image
		href={tile.objectUrl}
		x={x + tile.fx * w} y={y + tile.fy * h}
		width={tile.fw * w} height={tile.fh * h}
		preserveAspectRatio="none"
		class="pointer-events-none"
	/>
{/each}

<!-- Hit target for interaction (transparent) -->
{#if overviewUrl || activeTiles.length > 0}
	<rect {x} {y} width={w} height={h}
		fill="transparent"
		data-type={shape.type} data-id={shape.id} cursor="move" />
{/if}

{#if loading}
	<rect {x} {y} width={w} height={h} fill="#f9fafb" stroke="#e5e7eb" stroke-width="1" data-type={shape.type} data-id={shape.id} cursor="move" />
	<text x={x + w/2} y={y + h/2} text-anchor="middle" dominant-baseline="middle" font-size="10" fill="#9ca3af" class="pointer-events-none">Loading PDF...</text>
{:else if error}
	<rect {x} {y} width={w} height={h} fill="#fef2f2" stroke="#fecaca" stroke-width="1" data-type={shape.type} data-id={shape.id} cursor="move" />
	<text x={x + w/2} y={y + h/2} text-anchor="middle" dominant-baseline="middle" font-size="10" fill="#ef4444" class="pointer-events-none">PDF load failed</text>
{/if}
