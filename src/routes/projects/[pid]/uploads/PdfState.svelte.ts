/** Wrapper around pdfjs-dist for loading and rendering PDF pages */
// @ts-ignore - pdfjs-dist has non-standard build paths
let pdfjs: any = null
// Vite resolves this to a hashed URL at build time - no manual /static copy needed
// @ts-ignore
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

export class PdfState {
	pdfDoc = $state<any>(null)
	pageNum = $state(1)
	totalPages = $state(0)
	private rendering: HTMLCanvasElement | null = null

	destroy() {
		if (this.pdfDoc) this.pdfDoc.destroy()
		this.pdfDoc = null
	}

	async load(url: string) {
		// @ts-ignore - pdfjs-dist uses non-standard build path
		if (!pdfjs) pdfjs = await import('pdfjs-dist/build/pdf')
		pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl
		this.pdfDoc = await pdfjs.getDocument({ cMapUrl: 'pdfjs-dist/cmaps/', cMapPacked: true, url }).promise
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
		const viewport = pdfPage.getViewport({ scale, rotation })
		canvas.width = Math.floor(viewport.width)
		canvas.style.width = Math.floor(viewport.width / scale) + 'px'
		canvas.height = Math.floor(viewport.height)
		canvas.style.height = Math.floor(viewport.height / scale) + 'px'
		await pdfPage.render({ canvasContext: canvas.getContext('2d'), viewport }).promise
		this.rendering = null
		pdfPage.cleanup()
		return viewport
	}

	/** Render a page to a data URL for use as an image source */
	async renderToDataUrl(page: number, scale = 2): Promise<{ dataUrl: string; width: number; height: number }> {
		const canvas = document.createElement('canvas')
		const viewport = await this.render({ canvas, page, scale })
		const dataUrl = canvas.toDataURL('image/png')
		return {
			dataUrl,
			width: Math.floor(viewport.width / scale),
			height: Math.floor(viewport.height / scale)
		}
	}

	/** Render a page to an object URL (faster than data URL, less memory) */
	async renderToObjectUrl(page: number, scale = 2, signal?: AbortSignal): Promise<{ objectUrl: string; width: number; height: number; byteSize: number }> {
		if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
		const canvas = document.createElement('canvas')
		const viewport = await this.render({ canvas, page, scale })
		if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
		const blob = await new Promise<Blob>((resolve, reject) => {
			canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/png')
		})
		if (signal?.aborted) {
			throw new DOMException('Aborted', 'AbortError')
		}
		const objectUrl = URL.createObjectURL(blob)
		return {
			objectUrl,
			width: Math.floor(viewport.width / scale),
			height: Math.floor(viewport.height / scale),
			byteSize: blob.size
		}
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
