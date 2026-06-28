<script lang="ts">
	// iPad PDF-render test for /3PAGE.pdf (static/3PAGE.pdf).
	//
	// Structurally this is the simple single-canvas viewer from
	// `sample-pdf-viewer`, but wired to THIS project's proven pdf.js recipe —
	// the sample's modern-build approach (`import 'pdfjs-dist'` + worker via
	// `new URL(... , import.meta.url)`) does NOT render under this repo's pdf.js
	// 5.5: getDocument succeeds but page.render().promise never settles (verified
	// on desktop, so it isn't iPad-specific). The pieces below are what the
	// uploads tool uses to render reliably, including on iPadOS Safari:
	//   • legacy build + `pdf.worker.min.mjs?url` (modern build hangs on old Safari)
	//   • on iOS, run pdf.js on the MAIN THREAD (the module worker handshake never
	//     completes on iPadOS and getDocument() would hang forever)
	//   • fetch the bytes ourselves and pass `data` (iOS Safari hangs on pdf.js's
	//     ranged/streamed `url` requests)
	//   • clamp the render scale to mobile-Safari's canvas pixel limits (a too-big
	//     canvas renders blank on iOS)
	// On-screen status/step + error readouts so it can be debugged on the iPad.
	import { onMount } from 'svelte'
	import '$lib/url-parse-polyfill' // main-thread URL.parse polyfill (old iPad Safari) — before pdfjs
	import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'

	const PDF_URL = '/3PAGE.pdf'
	const MAX_CANVAS_AREA = 16_777_216 // ~16.7M px (mobile Safari total-area limit)
	const MAX_CANVAS_SIDE = 4096 // px per side (mobile Safari)

	let canvas = $state<HTMLCanvasElement | null>(null)
	let status = $state('idle')
	let step = $state('')
	let errorMsg = $state('')
	let pageNum = $state(1)
	let pageCount = $state(0)
	let scale = $state(1)
	let rotation = $state(0)
	let canvasW = $state(0)
	let canvasH = $state(0)
	let appliedScale = $state(1)

	let pdfjs: any = null
	let pdfDoc: any = null
	let rendering = false

	function isIOS(): boolean {
		if (typeof navigator === 'undefined') return false
		return (
			/iP(hone|ad|od)/.test(navigator.userAgent) ||
			(navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
		)
	}

	let mainThreadWorkerReady: Promise<void> | null = null
	function ensureMainThreadWorker(): Promise<void> {
		if (!mainThreadWorkerReady) {
			// @ts-ignore - worker build has no type declarations
			mainThreadWorkerReady = import('pdfjs-dist/legacy/build/pdf.worker.min.mjs').then((mod) => {
				;(globalThis as any).pdfjsWorker = mod
			})
		}
		return mainThreadWorkerReady
	}

	// Lower the scale until the canvas fits mobile-Safari's limits.
	function safeCanvasScale(pageW: number, pageH: number, requested: number): number {
		let s = requested
		const fits = (sc: number) => {
			const w = pageW * sc, h = pageH * sc
			return w <= MAX_CANVAS_SIDE && h <= MAX_CANVAS_SIDE && w * h <= MAX_CANVAS_AREA
		}
		while (s > 0.1 && !fits(s)) s -= 0.1
		return Math.max(0.1, +s.toFixed(2))
	}

	async function load() {
		try {
			step = 'importing pdf.js (legacy build)'
			// @ts-ignore - non-standard build path
			pdfjs = await import('pdfjs-dist/legacy/build/pdf')
			pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl
			if (isIOS()) { step = 'iOS → main-thread worker'; await ensureMainThreadWorker() }

			step = 'fetching PDF bytes'
			const resp = await fetch(PDF_URL)
			if (!resp.ok) throw new Error(`fetch failed (${resp.status})`)
			const data = await resp.arrayBuffer()

			step = 'parsing PDF'
			pdfDoc = await pdfjs.getDocument({ cMapUrl: 'pdfjs-dist/cmaps/', cMapPacked: true, data }).promise
			pageCount = pdfDoc.numPages
			status = `loaded — ${pageCount} page(s)`
			step = ''
			await render(pageNum)
		} catch (e: any) {
			status = 'LOAD ERROR'
			errorMsg = e?.message ? `${e.name ?? 'Error'}: ${e.message}` : String(e)
			console.error('[view] load failed', e)
		}
	}

	async function render(num: number) {
		if (!pdfDoc || !canvas || rendering) return
		if (num < 1 || num > pageCount) return
		rendering = true
		try {
			step = `rendering page ${num}`
			const page = await pdfDoc.getPage(num)
			const base = page.getViewport({ scale: 1, rotation })
			const safe = safeCanvasScale(base.width, base.height, scale)
			appliedScale = safe
			const viewport = page.getViewport({ scale: safe, rotation })
			const ctx = canvas.getContext('2d')
			if (!ctx) throw new Error('no 2d context')
			canvas.width = Math.floor(viewport.width)
			canvas.height = Math.floor(viewport.height)
			// Don't set inline width/height — let CSS (`max-width:100%; height:auto`)
			// scale from the canvas's intrinsic attributes so the aspect ratio is
			// preserved on a narrow screen (inline height + max-width:100% stretched it).
			canvasW = canvas.width
			canvasH = canvas.height
			await page.render({ canvasContext: ctx, viewport }).promise
			page.cleanup()
			pageNum = num
			status = `page ${num} / ${pageCount}`
			step = ''
		} catch (e: any) {
			status = 'RENDER ERROR'
			errorMsg = e?.message ?? String(e)
			console.error('[view] render failed', e)
		} finally {
			rendering = false
		}
	}

	const prev = () => render(pageNum - 1)
	const next = () => render(pageNum + 1)
	const zoomIn = () => { scale = Math.min(4, +(scale + 0.25).toFixed(2)); render(pageNum) }
	const zoomOut = () => { scale = Math.max(0.25, +(scale - 0.25).toFixed(2)); render(pageNum) }
	const rotate = () => { rotation = (rotation + 90) % 360; render(pageNum) }

	onMount(load)
</script>

<div class="wrap">
	<header>
		<div class="bar">
			<button onclick={prev} disabled={pageNum <= 1}>‹ Prev</button>
			<span class="pg">{pageNum} / {pageCount || '–'}</span>
			<button onclick={next} disabled={pageNum >= pageCount}>Next ›</button>
			<button onclick={zoomOut}>−</button>
			<span class="pg">{Math.round(scale * 100)}%</span>
			<button onclick={zoomIn}>+</button>
			<button onclick={rotate}>⟳</button>
		</div>
		<div class="status" class:err={status.endsWith('ERROR')}>{status}{#if step} · {step}…{/if}</div>
		{#if errorMsg}
			<pre class="error">{errorMsg}</pre>
		{/if}
		<div class="meta">
			URL: {PDF_URL} · DPR: {typeof window !== 'undefined' ? window.devicePixelRatio : '?'}
			· canvas {canvasW}×{canvasH} · applied scale {appliedScale}×
		</div>
	</header>

	<div class="stage">
		<canvas bind:this={canvas}></canvas>
	</div>
</div>

<style>
	:global(body) { margin: 0; }
	.wrap {
		display: flex;
		flex-direction: column;
		min-height: 100dvh;
		font-family: ui-sans-serif, system-ui, sans-serif;
		background: #f4f4f5;
	}
	header {
		position: sticky;
		top: 0;
		z-index: 2;
		background: #18181b;
		color: #fafafa;
		padding: 0.5rem 0.75rem;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}
	.bar { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
	button {
		background: #27272a;
		color: #fafafa;
		border: 1px solid #3f3f46;
		border-radius: 0.375rem;
		padding: 0.5rem 0.75rem;
		font-size: 1rem;
		cursor: pointer;
		min-width: 2.75rem;
		min-height: 2.5rem;
	}
	button:disabled { opacity: 0.4; }
	.pg { font-variant-numeric: tabular-nums; min-width: 3.5rem; text-align: center; }
	.status { font-size: 0.85rem; color: #a1a1aa; }
	.status.err { color: #f87171; font-weight: 600; }
	.error {
		margin: 0;
		padding: 0.5rem;
		background: #450a0a;
		color: #fecaca;
		border-radius: 0.375rem;
		font-size: 0.8rem;
		white-space: pre-wrap;
		word-break: break-word;
	}
	.meta { font-size: 0.7rem; color: #71717a; }
	.stage {
		flex: 1;
		overflow: auto;
		display: flex;
		justify-content: center;
		align-items: flex-start;
		padding: 1rem;
		-webkit-overflow-scrolling: touch;
	}
	canvas {
		max-width: 100%;
		height: auto;
		background: #fff;
		box-shadow: 0 1px 6px rgba(0, 0, 0, 0.2);
		display: block;
	}
</style>
