<script lang="ts">
	import type { Viewport } from '$lib/types/pages'
	import { Firestore } from '$lib'

	let { viewport, db }: { viewport: Viewport; db: Firestore } = $props()

	let src = $derived(viewport.source.kind === 'floorplan' ? viewport.source : null)

	let fileDoc = $state<any>(null)
	$effect(() => {
		const id = src?.fileId
		if (!id) { fileDoc = null; return }
		const unsub = db.subscribeOne('files', id, (data: any) => { fileDoc = data ?? null })
		return () => unsub?.()
	})

	/**
	 * Render the PDF page to a blob URL once the file doc + page number
	 * resolve. The render runs at scale=2 for crispness when the page canvas
	 * zooms in. Renders are cached on (url, page) identity and re-triggered
	 * when either changes; the returned object URL is revoked on cleanup.
	 */
	let pageUrl = $state<string | null>(null)
	let loading = $state(false)
	let error = $state('')
	$effect(() => {
		const url = fileDoc?.url
		const pageNum = src?.pageNum ?? 1
		if (!url) { pageUrl = null; return }

		let cancelled = false
		let objectUrl: string | null = null
		const controller = new AbortController()
		loading = true
		error = ''
		;(async () => {
			// Dynamic import — the module is `.svelte.ts` which tsconfig rejects
			// as a static import path, but Vite handles it fine at runtime.
			// @ts-expect-error allowImportingTsExtensions is off in this project
			const mod: any = await import('../../../uploads/parts/PdfState.svelte.ts')
			const pdf = new mod.PdfState()
			try {
				await pdf.load(url)
				if (cancelled) return
				const res = await pdf.renderToObjectUrl(pageNum, 2, controller.signal)
				if (cancelled) { URL.revokeObjectURL(res.objectUrl); return }
				objectUrl = res.objectUrl
				pageUrl = res.objectUrl
				loading = false
			} catch (e: any) {
				if (e?.name !== 'AbortError' && !cancelled) {
					error = e?.message ?? 'Failed to render PDF'
					loading = false
				}
			} finally {
				pdf.destroy()
			}
		})()

		return () => {
			cancelled = true
			controller.abort()
			if (objectUrl) URL.revokeObjectURL(objectUrl)
		}
	})

	let noSource = $derived(!src?.fileId)
</script>

<div class="absolute inset-0 overflow-hidden pointer-events-none bg-white">
	{#if noSource}
		<div class="w-full h-full flex items-center justify-center text-[10px] text-zinc-400 italic">
			Pick a file source in the properties panel
		</div>
	{:else if error}
		<div class="w-full h-full flex items-center justify-center text-[10px] text-red-500 italic px-2 text-center">{error}</div>
	{:else if loading || !pageUrl}
		<div class="w-full h-full flex items-center justify-center text-[10px] text-zinc-400 italic">
			Rendering…
		</div>
	{:else}
		<img src={pageUrl} alt="floorplan page {src?.pageNum ?? 1}"
			class="w-full h-full object-contain" draggable="false" />
	{/if}
</div>
