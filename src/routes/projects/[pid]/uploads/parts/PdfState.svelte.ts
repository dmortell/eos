/** Wrapper around pdfjs-dist for loading and rendering PDF pages */
import '$lib/url-parse-polyfill' // main-thread URL.parse polyfill (old iPad Safari) — before pdfjs loads
// @ts-ignore - pdfjs-dist has non-standard build paths
let pdfjs: any = null
// Vite resolves this to a hashed URL at build time - no manual /static copy needed
// @ts-ignore
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

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
		mainThreadWorkerReady = import('pdfjs-dist/build/pdf.worker.min.mjs').then((mod) => {
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
	private rendering: HTMLCanvasElement | null = null

	destroy() {
		if (this.pdfDoc) this.pdfDoc.destroy()
		this.pdfDoc = null
	}

	async load(url: string, onStep?: (step: string) => void) {
		onStep?.('init pdfjs')
		// @ts-ignore - pdfjs-dist uses non-standard build path
		if (!pdfjs) pdfjs = await import('pdfjs-dist/build/pdf')
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
		await pdfPage.render({ canvasContext: canvas.getContext('2d'), viewport }).promise
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
			transform
		}).promise
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
