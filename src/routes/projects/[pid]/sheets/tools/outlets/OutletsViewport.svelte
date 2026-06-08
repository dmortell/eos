<script lang="ts">
	import { getContext } from 'svelte'
	import type { Firestore } from '$lib/db.svelte'
	import { PdfState } from '../../../uploads/parts/PdfState.svelte'
	import type { SheetViewport } from '../../types'
	import type { OutletsData, PageCalibration } from './types'
	import OutletsRender from './OutletsRender.svelte'
	import OutletsEditLayer from './OutletsEditLayer.svelte'
	import OutletsEditPanel from './OutletsEditPanel.svelte'
	import { OutletsEditor } from './outlets-editor.svelte'
	import { docSaver } from '../../edit/persist'

	const RENDER_SCALE = 2 // PDF rasterization scale (crispness)

	let { vp, zoom = 1, active = false, view = null, onview, hidden = [], locked = [] }: {
		vp: SheetViewport
		zoom?: number
		active?: boolean
		view?: { x: number; y: number; w: number; h: number } | null
		onview?: (v: { x: number; y: number; w: number; h: number; den: number }) => void
		hidden?: string[]
		locked?: string[]
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

	// ── Editing ── one editor per viewport instance; the source doc is the single source of truth.
	const editor = new OutletsEditor()
	// Mirror the doc into the editor while idle; once active, the editor owns the data. Seed at
	// least once even if mounted active (model mode opens active from the start).
	let seeded = false
	$effect(() => {
		const d = outletsData
		if (!active) { editor.seed(d); seeded = !!d; return }
		if (!seeded && d) { editor.seed(d); seeded = true }
	})
	// Persist edits (debounced) to the outlets doc.
	$effect(() => {
		const id = src?.outletsDocId
		if (!id) { editor.onChange = null; return }
		const saver = docSaver(db, 'outlets', id)
		editor.onChange = () => saver.save(editor.snapshot())
		return () => { saver.flush(); editor.onChange = null }
	})
	// Delete / Escape while active (capture phase so the sheet's handlers don't also fire).
	$effect(() => {
		if (!active) return
		const onKey = (e: KeyboardEvent) => {
			const f = (e.target as Element)?.closest?.('input, textarea, select, [contenteditable]')
			if (e.key === 'Delete' && !f && editor.sel) { e.preventDefault(); e.stopPropagation(); editor.deleteSel() }
			else if (e.key === 'Escape' && editor.draw) { e.preventDefault(); e.stopPropagation(); editor.finishDraw() }
		}
		window.addEventListener('keydown', onKey, true)
		return () => window.removeEventListener('keydown', onKey, true)
	})
</script>

{#if src}
	<OutletsRender
		outlets={editor.outlets}
		trunks={editor.trunks}
		rackPlacements={editor.rackPlacements}
		{racksById}
		{calibration}
		{pdfUrl} {pageW} {pageH}
		{vp} {view} {onview} {hidden}
		onsvg={(el) => editor.svg = el}>
		{#if active}
			<OutletsEditLayer {editor} {locked} />
		{/if}
	</OutletsRender>
	{#if active}
		<OutletsEditPanel {editor} />
	{/if}
{:else}
	<div class="flex h-full w-full items-center justify-center text-zinc-400 print:hidden" style:font-size="{14 / zoom}px">No outlets source</div>
{/if}
