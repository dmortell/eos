<script lang="ts">
	import { onMount, onDestroy, getContext } from 'svelte'
	import { PdfState } from './PdfState.svelte'
	import { useCadStores } from '../stores'
	import type { ShapeBase } from '../types/shape'

	let { shape }: { shape: ShapeBase & { src: string; pdfPage?: number; aspectRatio?: number } } = $props()

	const { shapes, data, page, view } = useCadStores()

	// Viewport tile context — when inside a viewport, use vpScale instead of paperScale
	let vpCtxFn: (() => { vpScale: number }) | undefined
	try { vpCtxFn = getContext('viewportTileContext') } catch {}

	let imageUrl = $state<string>('')
	let loading = $state(true)
	let error = $state(false)
	let currentScale = $state(0)

	const pageNum = $derived(shape.pdfPage ?? 1)
	const x = $derived(Math.min(shape.x1, shape.x2))
	const y = $derived(Math.min(shape.y1, shape.y2))
	const w = $derived(Math.abs(shape.x2 - shape.x1))
	const h = $derived(Math.abs(shape.y2 - shape.y1))

	// Quantized scale levels matching the plan
	const SCALE_LEVELS = [0.5, 1, 2, 3, 4, 6, 8]

	function quantizeScale(s: number): number {
		for (let i = 0; i < SCALE_LEVELS.length; i++) {
			if (s <= SCALE_LEVELS[i]) return SCALE_LEVELS[i]
		}
		return SCALE_LEVELS[SCALE_LEVELS.length - 1]
	}

	// Compute required render scale based on current zoom
	// shapeScreenWidth = shapeWorldWidth * (zoom / paperScale)
	// requiredScale = shapeScreenWidth / pdfPageWidth
	let pdfPageWidth = $state(0)

	const neededScale = $derived.by(() => {
		if (!pdfPageWidth || w === 0) return 2
		const effectivePaperScale = vpCtxFn ? vpCtxFn().vpScale : view.paperScale
		const shapeScreenWidth = w * (view.zoom / effectivePaperScale)
		const raw = shapeScreenWidth / pdfPageWidth
		return quantizeScale(Math.max(0.5, Math.min(raw, 8)))
	})

	let pdf: PdfState | null = null
	let renderTimer: ReturnType<typeof setTimeout> | null = null
	let renderAbort: AbortController | null = null
	let mounted = true

	// Re-render when page number changes
	let lastRenderedPage = $state(0)
	$effect(() => {
		const pn = pageNum
		if (pn === lastRenderedPage || loading || !pdf?.pdfDoc) return
		lastRenderedPage = pn
		// Debounce page change (wheel can fire rapidly)
		if (renderTimer) clearTimeout(renderTimer)
		renderTimer = setTimeout(async () => {
			if (!mounted || !pdf?.pdfDoc) return
			const dims = await pdf.getPageDimensions(pn)
			pdfPageWidth = dims.width
			const scale = quantizeScale(Math.max(0.5, Math.min(neededScale, 8)))
			await renderAtScale(scale)
		}, 150)
	})

	// Progressive re-render: when zoom changes, debounce a re-render at the needed scale
	$effect(() => {
		const needed = neededScale
		if (needed === currentScale || loading || error || !imageUrl) return
		if (renderTimer) clearTimeout(renderTimer)
		renderTimer = setTimeout(() => {
			if (mounted) renderAtScale(needed)
		}, 300)
	})

	async function renderAtScale(scale: number) {

		if (!pdf?.pdfDoc) return
		renderAbort?.abort()
		const ctrl = new AbortController()
		renderAbort = ctrl

		try {
			// Check cache first
			const key = `${shape.src}|${pageNum}|${scale}`
			const cached = PdfImage.cache.get(key)
			if (cached) {
				if (ctrl.signal.aborted) return

				revokeOldUrl(imageUrl)
				imageUrl = cached.objectUrl
				currentScale = scale
				return
			}


			const result = await pdf.renderToObjectUrl(pageNum, scale, ctrl.signal)
			if (ctrl.signal.aborted) {
				URL.revokeObjectURL(result.objectUrl)
				return
			}


			// Evict old cache entries if over memory limit
			evictIfNeeded(result.byteSize)

			PdfImage.cache.set(key, result)
			PdfImage.cacheBytes += result.byteSize

			revokeOldUrl(imageUrl)
			imageUrl = result.objectUrl
			currentScale = scale
		} catch (err: any) {
			if (err?.name === 'AbortError') return
			console.warn('PdfImage: re-render failed at scale', scale, err)
		}
	}

	function revokeOldUrl(url: string) {
		if (!url || url.startsWith('data:')) return
		// Don't revoke if it's still in the cache
		for (const entry of PdfImage.cache.values()) {
			if (entry.objectUrl === url) return
		}
		URL.revokeObjectURL(url)
	}

	/** Try to refresh an expired Dropbox temporary URL using the stored path */
	async function refreshUrl(): Promise<string | null> {
		const s = shape as any
		if (!s.assetPath || s.provider !== 'dropbox') {
			console.warn('PdfImage: cannot refresh — missing assetPath or provider', {
				id: shape.id, provider: s.provider, assetPath: s.assetPath
			})
			return null
		}
		try {
			const params = new URLSearchParams({ path: s.assetPath })
			const resp = await fetch(`/api/files/dropbox/${s.assetId || 'refresh'}?${params}`)
			const json = await resp.json()
			if (json.success && json.data?.downloadUrl) {
				console.log('PdfImage: URL refresh succeeded', { id: shape.id, path: s.assetPath })
				return json.data.downloadUrl
			}
			console.warn('PdfImage: refresh API returned failure', { id: shape.id, response: json })
		} catch (e) {
			console.warn('PdfImage: URL refresh fetch failed', { id: shape.id }, e)
		}
		return null
	}

	async function loadPdf(url: string) {
		pdf = new PdfState()
		await pdf.load(url)
		lastRenderedPage = pageNum

		// Save total page count on the shape so properties editor can use it
		// Skip if shape is rendered inside a viewport (not in active page's ShapeStore)
		if (pdf.totalPages && (shape as any).pdfNumPages !== pdf.totalPages && shapes.get(shape.id)) {
			shapes.update(shape.id, { pdfNumPages: pdf.totalPages } as any)
			data.saveShape(page.pid, shapes.get(shape.id)!)
		}

		// Get PDF page dimensions for scale calculation
		const dims = await pdf.getPageDimensions(pageNum)
		pdfPageWidth = dims.width

		// Initial render at scale=2 (or current needed scale)
		const initialScale = quantizeScale(Math.max(0.5, Math.min(neededScale, 8)))

		// Check cache
		const key = `${url}|${pageNum}|${initialScale}`
		const cached = PdfImage.cache.get(key)
		if (cached) {
			imageUrl = cached.objectUrl
			currentScale = initialScale
		} else {
			const result = await pdf.renderToObjectUrl(pageNum, initialScale)
			evictIfNeeded(result.byteSize)
			PdfImage.cache.set(key, result)
			PdfImage.cacheBytes += result.byteSize
			imageUrl = result.objectUrl
			currentScale = initialScale
		}

		// Update shape aspect ratio and bounds from PDF page dimensions
		// Skip if shape is rendered inside a viewport (not in active page's ShapeStore)
		if (dims.width && dims.height && shapes.get(shape.id)) {
			const ar = dims.width / dims.height
			const updates: any = { aspectRatio: ar }
			const currentW = Math.abs(shape.x2 - shape.x1)
			const currentH = Math.abs(shape.y2 - shape.y1)
			const currentAr = currentW / Math.max(currentH, 1)
			if (Math.abs(currentAr - 1) < 0.1) {
				const newH = currentW / ar
				const cy = (shape.y1 + shape.y2) / 2
				updates.y1 = cy - newH / 2
				updates.y2 = cy + newH / 2
			}
			shapes.update(shape.id, updates)
			data.saveShape(page.pid, shapes.get(shape.id)!)
		}
	}

	onMount(async () => {
		if (!shape.src) {
			console.warn('PdfImage: no src URL', { id: shape.id, name: (shape as any).name })
			error = true
			loading = false
			return
		}

		try {
			await loadPdf(shape.src)
		} catch (err) {
			const s = shape as any
			console.warn('PdfImage: load failed, attempting URL refresh...', {
				id: shape.id, name: s.name,
				hasAssetPath: !!s.assetPath, hasProvider: !!s.provider,
				provider: s.provider, assetPath: s.assetPath, assetId: s.assetId,
				srcPrefix: shape.src?.substring(0, 80),
			}, err)
			pdf?.destroy()
			pdf = null
			const freshUrl = await refreshUrl()
			if (freshUrl) {
				console.log('PdfImage: got fresh URL, retrying...', { id: shape.id })
				try {
					await loadPdf(freshUrl)
					if (shapes.get(shape.id)) {
						shapes.update(shape.id, { src: freshUrl } as any)
						data.saveShape(page.pid, shapes.get(shape.id)!)
					}
				} catch (retryErr) {
					console.warn('PdfImage: retry with fresh URL also failed', { id: shape.id }, retryErr)
					error = true
				}
			} else {
				console.warn('PdfImage: URL refresh returned null — cannot recover', {
					id: shape.id, provider: s.provider, assetPath: s.assetPath
				})
				error = true
			}
		} finally {
			loading = false
		}
	})

	onDestroy(() => {
		mounted = false
		if (renderTimer) clearTimeout(renderTimer)
		renderAbort?.abort()
		// Don't destroy pdf here - keep it alive for re-renders
		// It will be GC'd when the component is destroyed
		pdf?.destroy()
	})
</script>

<script lang="ts" module>
	const MAX_CACHE_BYTES = 512 * 1024 * 1024 // 512 MB

	function evictIfNeeded(incomingBytes: number) {
		while (PdfImage.cacheBytes + incomingBytes > MAX_CACHE_BYTES && PdfImage.cache.size > 0) {
			// Evict first (oldest) entry
			const firstKey = PdfImage.cache.keys().next().value
			if (!firstKey) break
			const entry = PdfImage.cache.get(firstKey)!
			URL.revokeObjectURL(entry.objectUrl)
			PdfImage.cacheBytes -= entry.byteSize
			PdfImage.cache.delete(firstKey)
		}
	}

	/** Shared cache for rendered PDF pages: key = "src|page|scale" */
	export class PdfImage {
		static cache = new Map<string, { objectUrl: string; width: number; height: number; byteSize: number }>()
		static cacheBytes = 0
	}
</script>

{#if imageUrl}
	<image href={imageUrl} {x} {y} width={w} height={h} preserveAspectRatio="xMidYMid meet" data-type={shape.type} data-id={shape.id} cursor="move" />
{:else if loading}
	<rect {x} {y} width={w} height={h} fill="#f9fafb" stroke="#e5e7eb" stroke-width="1" data-type={shape.type} data-id={shape.id} cursor="move" />
	<text x={x + w/2} y={y + h/2} text-anchor="middle" dominant-baseline="middle" font-size="10" fill="#9ca3af" class="pointer-events-none">Loading PDF...</text>
{:else if error}
	<rect {x} {y} width={w} height={h} fill="#fef2f2" stroke="#fecaca" stroke-width="1" data-type={shape.type} data-id={shape.id} cursor="move" />
	<text x={x + w/2} y={y + h/2} text-anchor="middle" dominant-baseline="middle" font-size="10" fill="#ef4444" class="pointer-events-none">PDF load failed</text>
{/if}
