/** Wrapper around pdfjs-dist for loading and rendering PDF pages */
import '$lib/url-parse-polyfill' // main-thread URL.parse polyfill (old iPad Safari) — before pdfjs loads
// @ts-ignore - pdfjs-dist has non-standard build paths
let pdfjs: any = null
// Vite resolves this to a hashed URL at build time - no manual /static copy needed
// @ts-ignore
// Legacy build: transpiled for older browsers (e.g. iPadOS 17.6 Safari, where the
// default v5 build's modern JS hangs pdf.js during parsing).
import pdfjsWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'

/**
 * iOS/iPadOS Safari (seen on iPadOS 17.6.1) can spawn pdf.js's module worker but
 * the handshake never completes and no `error` event fires — so pdf.js's own
 * fallback never kicks in and getDocument() hangs forever. Detect iOS and run
 * pdf.js on the main thread instead (registering the worker module globally makes
 * pdf.js use a same-thread "fake worker" rather than a real Worker).
 */
function isIOS(): boolean {
	if (typeof navigator === 'undefined') return false
	return /iP(hone|ad|od)/.test(navigator.userAgent) ||
		// iPadOS reports as desktop Safari ("Macintosh") but has touch points.
		(navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

let mainThreadWorkerReady: Promise<void> | null = null
function ensureMainThreadWorker(): Promise<void> {
	if (!mainThreadWorkerReady) {
		// @ts-ignore - pdfjs-dist worker build has no type declarations
		mainThreadWorkerReady = import('pdfjs-dist/legacy/build/pdf.worker.min.mjs').then((mod) => {
			;(globalThis as any).pdfjsWorker = mod
		})
	}
	return mainThreadWorkerReady
}

// Mobile Safari (iPad/iPhone) silently renders a blank canvas once it exceeds
// its size limits — ~16.7M px total area and ~4096px per side. Clamp the render
// scale so a full-page render never trips this (it would otherwise show nothing).
const MAX_CANVAS_AREA = 16_777_216
const MAX_CANVAS_SIDE = 4096

function safeCanvasScale(pageWidth: number, pageHeight: number, requestedScale: number): number {
	const areaScale = Math.sqrt(MAX_CANVAS_AREA / (pageWidth * pageHeight))
	const sideScale = MAX_CANVAS_SIDE / Math.max(pageWidth, pageHeight)
	return Math.max(0.01, Math.min(requestedScale, areaScale, sideScale))
}

export class PdfState {
	pdfDoc = $state<any>(null)
	pageNum = $state(1)
	totalPages = $state(0)
	/** OCG (layer) ids to hide when rendering — from `files/{id}.hiddenLayers`. */
	hiddenLayers: string[] = []
	/** Skip PDF markup annotations (revision clouds, comments) — from `files/{id}.hideMarkups`. */
	hideMarkups = false
	/**
	 * White-out rectangles per page (page-px at scale 1, same space as crop) —
	 * from `files/{id}.pages[n].masks`. Painted over the render, so they hide
	 * content even in layerless PDFs.
	 */
	masksByPage: Record<number, { x: number; y: number; width: number; height: number }[]> = {}
	private rendering: HTMLCanvasElement | null = null

	/** Apply the per-file display settings saved on a `files/{id}` doc. */
	applyFileSettings(fileDoc: any) {
		this.hiddenLayers = Array.isArray(fileDoc?.hiddenLayers) ? [...fileDoc.hiddenLayers] : []
		this.hideMarkups = !!fileDoc?.hideMarkups
		this.masksByPage = {}
		for (const [pageKey, pageData] of Object.entries(fileDoc?.pages ?? {})) {
			const masks = (pageData as any)?.masks
			if (Array.isArray(masks) && masks.length) this.masksByPage[+pageKey] = masks
		}
	}

	/** Paint the page's mask rects (white) over a rendered canvas region. */
	private paintMasks(ctx: CanvasRenderingContext2D, page: number, scale: number, offsetX = 0, offsetY = 0) {
		const masks = this.masksByPage[page]
		if (!masks?.length) return
		ctx.fillStyle = '#ffffff'
		for (const m of masks) {
			ctx.fillRect(m.x * scale - offsetX, m.y * scale - offsetY, m.width * scale, m.height * scale)
		}
	}

	/**
	 * List the PDF's optional content groups (CAD layers preserved by DWG→PDF
	 * export), flattened from the document's layer tree. Empty for layerless PDFs.
	 */
	async getLayers(): Promise<{ id: string; name: string }[]> {
		if (!this.pdfDoc) return []
		const config = await this.pdfDoc.getOptionalContentConfig()
		const layers: { id: string; name: string }[] = []
		const walk = (items: any[]) => {
			for (const item of items ?? []) {
				if (typeof item === 'string') layers.push({ id: item, name: config.getGroup(item)?.name ?? item })
				else if (item?.order) walk(item.order)
			}
		}
		walk(config.getOrder() ?? [])
		return layers
	}

	/**
	 * Find which layers visibly paint within `radius` page-px (scale-1 space,
	 * same as crop/masks) of a point. A PDF page has no object model to
	 * hit-test, so this diffs small tile renders with layer subsets hidden:
	 * a layer contributes if hiding it changes the tile's pixels. Uses an
	 * iterative binary search (~log2(n) renders per hit) and re-baselines after
	 * each hit so identical overdrawn copies (duplicated xref layers) are still
	 * found. Already-hidden layers/markups are ignored. `onProgress` receives
	 * the running render count (total is not known up front).
	 */
	async identifyLayersAt(
		page: number, x: number, y: number, radius = 8,
		onProgress?: (renders: number) => void
	): Promise<{ layers: { id: string; name: string }[]; markups: boolean }> {
		const pdfPage = await this.pdfDoc.getPage(page)
		const scale = 4
		const size = Math.ceil(radius * 2 * scale)
		const canvas = document.createElement('canvas')
		canvas.width = size
		canvas.height = size
		const ctx = canvas.getContext('2d', { willReadFrequently: true })!
		const viewport = pdfPage.getViewport({ scale })
		const transform: [number, number, number, number, number, number] =
			[1, 0, 0, 1, -(x - radius) * scale, -(y - radius) * scale]

		let renders = 0
		const renderRegion = async (extraHidden: string[], hideAnns = false): Promise<Uint8ClampedArray> => {
			const config = await this.pdfDoc.getOptionalContentConfig()
			for (const id of this.hiddenLayers) config.setVisibility(id, false)
			for (const id of extraHidden) config.setVisibility(id, false)
			ctx.clearRect(0, 0, size, size)
			await pdfPage.render({
				canvasContext: ctx, viewport, transform,
				optionalContentConfigPromise: Promise.resolve(config),
				...((hideAnns || this.hideMarkups) ? { annotationMode: 0 } : {}),
			}).promise
			onProgress?.(++renders)
			return ctx.getImageData(0, 0, size, size).data
		}

		// Tolerant compare — ignores sub-threshold antialiasing wobble.
		const differs = (a: Uint8ClampedArray, b: Uint8ClampedArray): boolean => {
			let changed = 0
			for (let i = 0; i < a.length; i += 4) {
				if (Math.abs(a[i] - b[i]) > 12 || Math.abs(a[i + 1] - b[i + 1]) > 12 || Math.abs(a[i + 2] - b[i + 2]) > 12) {
					if (++changed > 3) return true
				}
			}
			return false
		}

		const hiddenSet = new Set(this.hiddenLayers)
		let remaining = (await this.getLayers()).filter(l => !hiddenSet.has(l.id))
		const MAX_RENDERS = 60

		let base = await renderRegion([])

		// Markup annotations aren't OCG layers — test by disabling annotation painting.
		let markups = false
		if (!this.hideMarkups) markups = differs(base, await renderRegion([], true))

		const found: { id: string; name: string }[] = []
		while (found.length < 8 && remaining.length && renders < MAX_RENDERS) {
			const foundIds = found.map(f => f.id)
			// Anything left that still contributes?
			if (!differs(base, await renderRegion([...foundIds, ...remaining.map(l => l.id)]))) break
			// Binary search for one contributor. When a half tests clean it stays
			// hidden as context for the rest of the search (overdraw handling).
			let pool = remaining
			const ctxIds: string[] = []
			while (pool.length > 1 && renders < MAX_RENDERS) {
				const half = pool.slice(0, Math.ceil(pool.length / 2))
				if (differs(base, await renderRegion([...foundIds, ...ctxIds, ...half.map(l => l.id)]))) {
					pool = half
				} else {
					ctxIds.push(...half.map(l => l.id))
					pool = pool.slice(half.length)
				}
			}
			const hit = pool[0]
			found.push(hit)
			remaining = remaining.filter(l => l.id !== hit.id)
			// Re-baseline with hits hidden so the next pass sees what's still painted.
			base = await renderRegion(found.map(f => f.id))
		}
		pdfPage.cleanup()
		return { layers: found, markups }
	}

	/** Render params for hidden layers / markups — shared by full-page and tile renders. */
	private layerRenderParams(): Record<string, any> {
		const params: Record<string, any> = {}
		if (this.hiddenLayers.length && this.pdfDoc) {
			params.optionalContentConfigPromise = this.pdfDoc.getOptionalContentConfig().then((config: any) => {
				for (const id of this.hiddenLayers) config.setVisibility(id, false)
				return config
			})
		}
		if (this.hideMarkups) params.annotationMode = 0 // AnnotationMode.DISABLE
		return params
	}

	destroy() {
		if (this.pdfDoc) this.pdfDoc.destroy()
		this.pdfDoc = null
	}

	async load(url: string, onStep?: (step: string) => void) {
		onStep?.('init pdfjs')
		// @ts-ignore - pdfjs-dist uses non-standard build path
		if (!pdfjs) pdfjs = await import('pdfjs-dist/legacy/build/pdf')
		pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl
		// On iOS the real worker hangs; run pdf.js on the main thread there.
		if (isIOS()) await ensureMainThreadWorker()
		// Fetch the bytes on the main thread rather than handing pdf.js a `url` to
		// stream: iOS Safari can hang indefinitely on the worker's ranged/streamed
		// requests. A plain main-thread fetch uses normal CORS (proven to work on
		// desktop) and sidesteps that.
		onStep?.('fetching PDF')
		const resp = await fetch(url)
		if (!resp.ok) throw new Error(`Failed to fetch PDF (${resp.status})`)
		const data = await resp.arrayBuffer()
		onStep?.('parsing PDF')
		this.pdfDoc = await pdfjs.getDocument({ cMapUrl: 'pdfjs-dist/cmaps/', cMapPacked: true, data }).promise
		this.totalPages = this.pdfDoc.numPages
		if (this.pageNum < 1 || this.pageNum > this.totalPages) this.pageNum = 1
		return this.pdfDoc
	}

	/** Get PDF page dimensions at scale=1 (in PDF points, 72 DPI) */
	async getPageDimensions(page: number): Promise<{ width: number; height: number }> {
		const pdfPage = await this.pdfDoc.getPage(page)
		const viewport = pdfPage.getViewport({ scale: 1 })
		pdfPage.cleanup()
		return { width: viewport.width, height: viewport.height }
	}

	async render(options: { canvas: HTMLCanvasElement; page: number; scale?: number; rotation?: number }) {
		const { canvas, page, scale = 1, rotation } = options
		if (this.rendering === canvas) return { width: 0, height: 0 }
		this.rendering = canvas
		const pdfPage = await this.pdfDoc.getPage(page)
		// Clamp to mobile-Safari canvas limits so large pages don't render blank.
		const base = pdfPage.getViewport({ scale: 1, rotation })
		const safeScale = safeCanvasScale(base.width, base.height, scale)
		const viewport = pdfPage.getViewport({ scale: safeScale, rotation })
		canvas.width = Math.floor(viewport.width)
		// Logical (CSS / points) size is the canvas divided by the *actual* scale,
		// so clamping only lowers resolution — never the displayed/layout size.
		canvas.style.width = Math.floor(viewport.width / safeScale) + 'px'
		canvas.height = Math.floor(viewport.height)
		canvas.style.height = Math.floor(viewport.height / safeScale) + 'px'
		await pdfPage.render({ canvasContext: canvas.getContext('2d'), viewport, ...this.layerRenderParams() }).promise
		this.paintMasks(canvas.getContext('2d')!, page, safeScale)
		this.rendering = null
		pdfPage.cleanup()
		return { width: Math.floor(viewport.width / safeScale), height: Math.floor(viewport.height / safeScale) }
	}

	/** Render a page to a data URL for use as an image source */
	async renderToDataUrl(page: number, scale = 2): Promise<{ dataUrl: string; width: number; height: number }> {
		const canvas = document.createElement('canvas')
		const { width, height } = await this.render({ canvas, page, scale })
		const dataUrl = canvas.toDataURL('image/png')
		return { dataUrl, width, height }
	}

	/** Render a page to an object URL (faster than data URL, less memory) */
	async renderToObjectUrl(page: number, scale = 2, signal?: AbortSignal): Promise<{ objectUrl: string; width: number; height: number; byteSize: number }> {
		if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
		const canvas = document.createElement('canvas')
		const { width, height } = await this.render({ canvas, page, scale })
		if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
		const blob = await new Promise<Blob>((resolve, reject) => {
			canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/png')
		})
		if (signal?.aborted) {
			throw new DOMException('Aborted', 'AbortError')
		}
		const objectUrl = URL.createObjectURL(blob)
		return { objectUrl, width, height, byteSize: blob.size }
	}

	/**
	 * Render a tile (partial page region) to an object URL.
	 * The tile covers a TILE_SIZE x TILE_SIZE pixel region at the given scale.
	 */
	async renderTile(
		page: number,
		col: number,
		row: number,
		tileSize: number,
		scale: number,
		signal?: AbortSignal
	): Promise<{ objectUrl: string; byteSize: number }> {
		if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
		const pdfPage = await this.pdfDoc.getPage(page)
		const viewport = pdfPage.getViewport({ scale })

		const canvas = document.createElement('canvas')
		// Clip tile to actual page extent
		const tileX = col * tileSize
		const tileY = row * tileSize
		const w = Math.min(tileSize, Math.ceil(viewport.width) - tileX)
		const h = Math.min(tileSize, Math.ceil(viewport.height) - tileY)
		if (w <= 0 || h <= 0) {
			pdfPage.cleanup()
			throw new Error('Tile outside page bounds')
		}
		canvas.width = w
		canvas.height = h

		const ctx = canvas.getContext('2d')!
		// Offset the viewport so the tile region maps to canvas origin
		const transform: [number, number, number, number, number, number] = [
			1, 0, 0, 1, -tileX, -tileY
		]
		if (signal?.aborted) { pdfPage.cleanup(); throw new DOMException('Aborted', 'AbortError') }

		await pdfPage.render({
			canvasContext: ctx,
			viewport,
			transform,
			...this.layerRenderParams()
		}).promise
		this.paintMasks(ctx, page, scale, tileX, tileY)
		pdfPage.cleanup()

		if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
		const blob = await new Promise<Blob>((resolve, reject) => {
			canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/png')
		})
		if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')

		return {
			objectUrl: URL.createObjectURL(blob),
			byteSize: blob.size
		}
	}
}
