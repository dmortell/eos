<svelte:options namespace="svg" />

<script lang="ts">
	import { getContext } from 'svelte'
	import { page } from '$app/state'
	import { PdfState } from '../../../uploads/parts/PdfState.svelte'
	import type { Firestore } from '$lib/db.svelte'
	import type { Underlay } from './types'
	import type { ModelStore } from './models.svelte'

	// One underlay image, drawn behind the model geometry (in the render's real-mm
	// viewBox). Resolves the file, rasterizes the page (PDF) / loads the image, and
	// back-fills the placement rect from the file calibration the first time.
	let { underlay, store }: { underlay: Underlay; store: ModelStore } = $props()

	const db = getContext('db') as Firestore
	const pid = $derived(page.params.pid ?? '')
	const pageNum = $derived(underlay.pageNum ?? 1)
	const RENDER_SCALE = 2

	let fileDoc = $state<any>(null)
	$effect(() => {
		if (!underlay.fileId) { fileDoc = null; return }
		const unsub = db.subscribeOne('files', underlay.fileId, (d: any) => (fileDoc = d ?? null))
		return () => unsub?.()
	})

	const calib = $derived.by(() => {
		const p = fileDoc?.pages?.[pageNum]
		return p?.origin && p?.scale?.scale ? { origin: p.origin as { x: number; y: number }, scaleFactor: p.scale.scale as number } : null
	})

	let url = $state<string | null>(null), pw = $state(0), ph = $state(0)
	$effect(() => {
		const u = fileDoc?.url, pg = pageNum
		if (!u) { url = null; pw = 0; ph = 0; return }
		if (/\.pdf($|\?)/i.test(u) || fileDoc?.pageCount) {
			let cancelled = false, local: string | null = null
			const pdf = new PdfState()
			;(async () => {
				try {
					await pdf.load(u); if (cancelled) return
					const r = await pdf.renderToObjectUrl(pg, RENDER_SCALE)
					if (cancelled) { URL.revokeObjectURL(r.objectUrl); return }
					local = r.objectUrl; url = r.objectUrl; pw = r.width; ph = r.height
				} catch { if (!cancelled) url = null }
			})()
			return () => { cancelled = true; if (local) URL.revokeObjectURL(local); pdf.destroy() }
		}
		url = u
		const img = new Image(); img.onload = () => { pw = img.naturalWidth; ph = img.naturalHeight }; img.src = u
	})

	// Calibration-derived default rect (world-mm).
	const defRect = $derived(calib && pw && ph
		? { x: -calib.origin.x * calib.scaleFactor, y: -calib.origin.y * calib.scaleFactor, w: pw * calib.scaleFactor, h: ph * calib.scaleFactor }
		: null)
	// Back-fill the rect once so it's draggable/resizable and the edit layer can find it.
	$effect(() => {
		if (defRect && !underlay.rect) { underlay.rect = { ...defRect }; store.save() }
	})

	const rect = $derived(underlay.rect ?? defRect)
	// Mirror vertically within the rect (file y-down → model y-up).
	const tf = $derived(rect && underlay.flip ? `matrix(1 0 0 -1 0 ${2 * rect.y + rect.h})` : '')
</script>

{#if url && rect}
	<image href={url} x={rect.x} y={rect.y} width={rect.w} height={rect.h} transform={tf}
		opacity={underlay.opacity ?? 0.5} preserveAspectRatio="none" style:pointer-events="none" />
{/if}
