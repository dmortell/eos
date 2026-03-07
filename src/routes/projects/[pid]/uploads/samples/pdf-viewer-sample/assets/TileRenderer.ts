/** Priority-based tile render queue with concurrency control */

import { PdfState } from './PdfState.svelte'
import type { TileCache } from './TileCache'
import { TILE_SIZE } from './TileGrid'

interface TileRequest {
	key: string
	src: string
	pageNum: number
	col: number
	row: number
	scale: number
	priority: number
	aborted: boolean
	onComplete: (objectUrl: string, width: number, height: number, byteSize: number) => void
}

export class TileRenderer {
	private queue: TileRequest[] = []
	private active = 0
	private maxConcurrent: number
	private cache: TileCache
	private pdfs = new Map<string, PdfState>()
	private loadingPdfs = new Map<string, Promise<PdfState>>()

	constructor(cache: TileCache, maxConcurrent = 3) {
		this.cache = cache
		this.maxConcurrent = maxConcurrent
	}

	/** Request a tile to be rendered. Returns immediately. */
	enqueue(request: {
		src: string
		pageNum: number
		col: number
		row: number
		scale: number
		priority: number
		onComplete: (objectUrl: string, width: number, height: number, byteSize: number) => void
	}): () => void {
		const key = `${request.src}|${request.pageNum}|${request.scale}|${request.col}|${request.row}`

		// Check cache first
		const cached = this.cache.get(key)
		if (cached) {
			request.onComplete(cached.objectUrl, cached.width, cached.height, cached.byteSize)
			return () => {}
		}

		// Remove existing request for same tile (superseded)
		const existingIdx = this.queue.findIndex(r => r.key === key)
		if (existingIdx >= 0) this.queue.splice(existingIdx, 1)

		const req: TileRequest = { ...request, key, aborted: false }
		this.queue.push(req)
		this.queue.sort((a, b) => a.priority - b.priority)
		this.flush()

		return () => { req.aborted = true }
	}

	/** Cancel all pending requests and optionally filter by prefix */
	cancelAll(prefix?: string): void {
		if (prefix) {
			this.queue = this.queue.filter(r => {
				if (r.key.startsWith(prefix)) { r.aborted = true; return false }
				return true
			})
		} else {
			for (const r of this.queue) r.aborted = true
			this.queue = []
		}
	}

	private async flush(): Promise<void> {
		while (this.active < this.maxConcurrent && this.queue.length > 0) {
			const req = this.queue.shift()!
			if (req.aborted) continue

			// Skip if already cached (may have been rendered by another request)
			const cached = this.cache.get(req.key)
			if (cached) {
				req.onComplete(cached.objectUrl, cached.width, cached.height, cached.byteSize)
				continue
			}

			this.active++
			this.renderTile(req).finally(() => {
				this.active--
				this.flush()
			})
		}
	}

	private async renderTile(req: TileRequest): Promise<void> {
		try {
			const pdf = await this.getPdf(req.src)
			if (req.aborted) return

			const result = await pdf.renderTile(
				req.pageNum, req.col, req.row, TILE_SIZE, req.scale
			)
			if (req.aborted) {
				URL.revokeObjectURL(result.objectUrl)
				return
			}

			// Determine tile dimensions
			const pdfPage = await pdf.pdfDoc.getPage(req.pageNum)
			const viewport = pdfPage.getViewport({ scale: req.scale })
			const tileX = req.col * TILE_SIZE
			const tileY = req.row * TILE_SIZE
			const w = Math.min(TILE_SIZE, Math.ceil(viewport.width) - tileX)
			const h = Math.min(TILE_SIZE, Math.ceil(viewport.height) - tileY)
			pdfPage.cleanup()

			this.cache.set(req.key, {
				objectUrl: result.objectUrl,
				byteSize: result.byteSize,
				width: w,
				height: h
			})

			req.onComplete(result.objectUrl, w, h, result.byteSize)
		} catch (err: any) {
			if (err?.name === 'AbortError' || req.aborted) return
			console.warn('TileRenderer: render failed', req.key, err)
		}
	}

	/** Get or load a PdfState for a given URL */
	private async getPdf(src: string): Promise<PdfState> {
		const existing = this.pdfs.get(src)
		if (existing?.pdfDoc) return existing

		// Avoid duplicate loads
		const loading = this.loadingPdfs.get(src)
		if (loading) return loading

		const promise = (async () => {
			const pdf = new PdfState()
			await pdf.load(src)
			this.pdfs.set(src, pdf)
			this.loadingPdfs.delete(src)
			return pdf
		})()
		this.loadingPdfs.set(src, promise)
		return promise
	}

	/** Clean up all held PDF documents */
	destroy(): void {
		this.cancelAll()
		for (const pdf of this.pdfs.values()) pdf.destroy()
		this.pdfs.clear()
		this.loadingPdfs.clear()
	}
}
