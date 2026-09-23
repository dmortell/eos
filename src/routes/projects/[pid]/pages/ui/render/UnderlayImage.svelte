<svelte:options namespace="svg" />

<script lang="ts" module>
	// Rendered PAGES, cached for the session by file url + page + the file's layer settings. Rasterising a
	// big PDF takes seconds, and a Viewport re-mounts on every tab switch — so each page is rendered ONCE and
	// its object URL kept (never revoked while cached).
	const pageCache = new Map<string, Promise<{ url: string; w: number; h: number }>>()
</script>

<script lang="ts">
	// A model's PLAN underlay — the floor's calibrated floorplan (a PDF page from `files/{fileId}`, as the
	// outlets tool uses it), drawn behind the model in real mm. Adapted from sheets/tools/model3d/
	// Model3dUnderlayImage.svelte, read-only: the placement comes from the file's page calibration every time
	// (origin → model (0,0), `scale.scale` = mm per PDF px; Pages' plan is y-down like the PDF, so no flip),
	// clipped to the page's crop. In dark model space the page is inverted (white paper → dark, black lines →
	// light) so it reads like an AutoCAD xref. Reports its rect so the Viewport can zoom to extents.
	import { getContext } from 'svelte'
	import { PdfState } from '../../../uploads/parts/PdfState.svelte'
	import type { Firestore } from '$lib'
	import type { Underlay, UnderlayRect } from '../../3dview/types'

	let { underlay, dark = false, onrect }: { underlay: Underlay; dark?: boolean; onrect?: (r: UnderlayRect | null) => void } = $props()

	const db = getContext('db') as Firestore | undefined
	const pageNum = $derived(underlay.pageNum ?? 1)
	const RENDER_SCALE = 2

	let fileDoc = $state<{ url?: string; pageCount?: number; pages?: Record<string, { origin?: { x: number; y: number }; scale?: { scale?: number }; crop?: { x: number; y: number; width: number; height: number } }> } | null>(null)
	$effect(() => {
		if (!db || !underlay.fileId) { fileDoc = null; return }
		const unsub = db.subscribeOne('files', underlay.fileId, (d) => (fileDoc = (d as typeof fileDoc) ?? null))
		return () => unsub?.()
	})
	const calib = $derived.by(() => {
		const p = fileDoc?.pages?.[pageNum]
		// the scale is required (mm per PDF px); a page scaled but never given an origin (e.g. Hibiya 12F / 10F)
		// is placed with its top-left corner at (0,0) — the outlets tool needs both, display only needs the scale
		return p?.scale?.scale ? { origin: p.origin ?? { x: 0, y: 0 }, sf: Number(p.scale.scale) } : null
	})

	// rasterise the page once per file / page (object URL, revoked on change)
	let url = $state<string | null>(null), pw = $state(0), ph = $state(0)
	$effect(() => {
		const u = fileDoc?.url, pg = pageNum, fd = fileDoc
		if (!u) { url = null; pw = 0; ph = 0; return }
		if (/\.pdf($|\?)/i.test(u) || fd?.pageCount) {
			const settings = fd as { hiddenLayers?: string[]; hideMarkups?: boolean } | null
			const key = `${u}|${pg}|${(settings?.hiddenLayers ?? []).join(',')}|${settings?.hideMarkups ? 1 : 0}`
			let job = pageCache.get(key)
			if (!job) {
				job = (async () => {
					const pdf = new PdfState()
					pdf.applyFileSettings(fd)   // the file's hidden OCG layers / markups, like every other tool
					try { await pdf.load(u); const r = await pdf.renderToObjectUrl(pg, RENDER_SCALE); return { url: r.objectUrl, w: r.width, h: r.height } }
					finally { pdf.destroy() }
				})()
				pageCache.set(key, job)
				job.catch(() => pageCache.delete(key))   // a failed render may be retried later
			}
			let cancelled = false
			job.then((r) => { if (!cancelled) { url = r.url; pw = r.w; ph = r.h } }, () => { if (!cancelled) url = null })
			return () => { cancelled = true }
		}
		url = u
		const img = new Image(); img.onload = () => { pw = img.naturalWidth; ph = img.naturalHeight }; img.src = u
	})

	// placement in model mm: the calibrated origin sits at (0,0); an explicit `rect` overrides
	const rect = $derived<UnderlayRect | null>(underlay.rect ?? (calib && pw && ph ? { x: -calib.origin.x * calib.sf, y: -calib.origin.y * calib.sf, w: pw * calib.sf, h: ph * calib.sf } : null))
	const cropRect = $derived.by(() => {
		const c = fileDoc?.pages?.[pageNum]?.crop
		if (!c || !rect || !pw || !ph) return null
		return { x: rect.x + (c.x / pw) * rect.w, y: rect.y + (c.y / ph) * rect.h, w: (c.width / pw) * rect.w, h: (c.height / ph) * rect.h }
	})
	// what is actually visible (the crop, else the page) — the Viewport's zoom-to-extents box
	$effect(() => { onrect?.(url ? (cropRect ?? rect) : null) })
	const cid = $derived('ulay-' + underlay.id)
</script>

{#if url && rect}
	{#if cropRect}<clipPath id={cid}><rect x={cropRect.x} y={cropRect.y} width={cropRect.w} height={cropRect.h} /></clipPath>{/if}
	<g clip-path={cropRect ? `url(#${cid})` : undefined} style:filter={dark ? 'invert(1) hue-rotate(180deg)' : undefined}>
		<image href={url} x={rect.x} y={rect.y} width={rect.w} height={rect.h} opacity={underlay.opacity ?? (dark ? 0.55 : 0.6)}
			preserveAspectRatio="none" style:pointer-events="none" />
	</g>
{/if}
