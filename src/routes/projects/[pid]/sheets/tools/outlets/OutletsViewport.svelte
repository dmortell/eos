<script lang="ts">
	import { getContext } from 'svelte'
	import type { Firestore } from '$lib/db.svelte'
	import { PdfState } from '../../../uploads/parts/PdfState.svelte'
	import type { SheetViewport } from '../../types'
	import type { OutletsData, PageCalibration } from './types'
	import OutletsRender from './OutletsRender.svelte'

	const RENDER_SCALE = 2 // PDF rasterization scale (crispness)

	let { vp, zoom = 1, active = false, view = null, onview }: {
		vp: SheetViewport
		zoom?: number
		active?: boolean
		view?: { x: number; y: number; w: number; h: number } | null
		onview?: (v: { x: number; y: number; w: number; h: number; den: number }) => void
	} = $props()
	const db = getContext('db') as Firestore

	let src = $derived(vp.source.kind === 'outlets' ? vp.source : null)

	let outletsData = $state<OutletsData | null>(null)
	let fileDoc = $state<any>(null)
	let racksById = $state<Record<string, { widthMm: number; depthMm: number; label?: string; heightU?: number }>>({})

	// outlets doc (outlets / trunks / rackPlacements + default file & page)
	$effect(() => {
		const id = src?.outletsDocId
		if (!id) { outletsData = null; return }
		const unsub = db.subscribeOne('outlets', id, (d: any) => { outletsData = d ?? null })
		return () => unsub?.()
	})

	// file + page: explicit override on the viewport, else the outlets doc's current selection
	let fileId = $derived(src?.fileId ?? outletsData?.selectedFileId ?? null)
	let pageNum = $derived(src?.pageNum ?? outletsData?.selectedPage ?? 1)

	// floorplan file doc (url + per-page calibration)
	$effect(() => {
		if (!fileId) { fileDoc = null; return }
		const unsub = db.subscribeOne('files', fileId, (d: any) => { fileDoc = d ?? null })
		return () => unsub?.()
	})

	// placed-rack dimensions: the floor's room docs (A–D) keyed by rack id
	$effect(() => {
		const base = src?.outletsDocId
		if (!base) { racksById = {}; return }
		const map: Record<string, { widthMm: number; depthMm: number; label?: string; heightU?: number }> = {}
		const unsubs = ['A', 'B', 'C', 'D'].map(room =>
			db.subscribeOne('racks', `${base}_R${room}`, (d: any) => {
				const racks = Array.isArray(d?.racks) ? d.racks : []
				for (const r of racks) map[r.id] = { widthMm: r.widthMm, depthMm: r.depthMm, label: r.label, heightU: r.heightU }
				racksById = { ...map }
			})
		)
		return () => unsubs.forEach(u => u?.())
	})

	let calibration = $derived.by<PageCalibration | null>(() => {
		const p = fileDoc?.pages?.[pageNum]
		if (p?.origin && p?.scale?.scale) return { origin: p.origin, scaleFactor: p.scale.scale, crop: p.crop }
		return null
	})

	// ── Rasterize the PDF page to an object URL (revoked on change/unmount) ──
	let pdfUrl = $state<string | null>(null)
	let pageW = $state(0)
	let pageH = $state(0)
	$effect(() => {
		const url = fileDoc?.url
		const pg = pageNum
		if (!url) { pdfUrl = null; pageW = 0; pageH = 0; return }
		let cancelled = false
		let localUrl: string | null = null
		const pdf = new PdfState()
		;(async () => {
			try {
				await pdf.load(url)
				if (cancelled) return
				const { objectUrl, width, height } = await pdf.renderToObjectUrl(pg, RENDER_SCALE)
				if (cancelled) { URL.revokeObjectURL(objectUrl); return }
				localUrl = objectUrl
				pdfUrl = objectUrl; pageW = width; pageH = height
			} catch {
				if (!cancelled) { pdfUrl = null }
			}
		})()
		return () => {
			cancelled = true
			if (localUrl) URL.revokeObjectURL(localUrl)
			pdf.destroy()
		}
	})
</script>

{#if src}
	<OutletsRender
		outlets={outletsData?.outlets ?? []}
		trunks={outletsData?.trunks ?? []}
		rackPlacements={outletsData?.rackPlacements ?? []}
		{racksById}
		{calibration}
		{pdfUrl} {pageW} {pageH}
		{vp} {view} {onview} />
{:else}
	<div class="flex h-full w-full items-center justify-center text-zinc-400 print:hidden" style:font-size="{14 / zoom}px">No outlets source</div>
{/if}
