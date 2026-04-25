<script lang="ts">
	/**
	 * Photo survey viewport.
	 *
	 * Two modes:
	 *   - 'album' (default): responsive tile grid of all photos in the survey
	 *   - 'single': one photo at `photoId` filling the viewport
	 *
	 * Photos live at `surveys/{surveyId}/photos/{photoId}` with an `imageUrl`.
	 * We subscribe lazily based on mode to avoid the full photo list load when
	 * only a single photo is embedded.
	 */
	import type { Viewport } from '$lib/types/pages'
	import type { SurveyPhoto, Survey } from '../../../../../survey/types'
	import { Firestore } from '$lib'
	import AnnotationOverlay from '../../../../../survey/parts/AnnotationOverlay.svelte'

	let { viewport, db }: { viewport: Viewport; db: Firestore } = $props()

	let src = $derived(viewport.source.kind === 'survey' ? viewport.source : null)
	let mode = $derived(src?.mode ?? 'album')

	let survey = $state<Survey | null>(null)
	let photos = $state<SurveyPhoto[]>([])

	$effect(() => {
		const id = src?.surveyId
		if (!id) { survey = null; photos = []; return }
		const unsubMeta = db.subscribeOne('surveys', id, (data: any) => { survey = (data as Survey) ?? null })
		const unsubPhotos = db.subscribeMany(`surveys/${id}/photos`, (docs: any[]) => {
			photos = (docs as SurveyPhoto[]).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
		})
		return () => { unsubMeta?.(); unsubPhotos?.() }
	})

	let singlePhoto = $derived<SurveyPhoto | null>(
		mode === 'single' && src?.photoId
			? photos.find(p => p.id === src.photoId) ?? null
			: null,
	)

	/**
	 * Natural image dimensions — captured on <img> load so the annotation
	 * overlay's SVG viewBox matches the drawn pin coordinate space. Until the
	 * image loads, the overlay stays hidden to avoid rendering at 0×0.
	 */
	let imgNaturalW = $state(0)
	let imgNaturalH = $state(0)
	function onSingleImgLoad(e: Event) {
		const img = e.currentTarget as HTMLImageElement
		imgNaturalW = img.naturalWidth
		imgNaturalH = img.naturalHeight
	}

	let tileCols = $derived(Math.max(1, Math.ceil(Math.sqrt(photos.length || 1))))
	let noSource = $derived(!src?.surveyId)
</script>

<div class="absolute inset-0 overflow-hidden pointer-events-none bg-white">
	{#if noSource}
		<div class="w-full h-full flex items-center justify-center text-[10px] text-zinc-400 italic">
			Pick a survey source in the properties panel
		</div>
	{:else if !survey}
		<div class="w-full h-full flex items-center justify-center text-[10px] text-zinc-400 italic">
			Loading…
		</div>
	{:else if mode === 'single'}
		{#if singlePhoto}
			<div class="w-full h-full flex flex-col">
				<!--
					Image + overlay share the same flex slot. The overlay's viewBox
					uses the image's natural dimensions, so drawn annotations align
					regardless of how the image is `object-contain`-fitted.
				-->
				<div class="relative flex-1 min-h-0 flex items-center justify-center">
					<img src={singlePhoto.imageUrl} alt={singlePhoto.title ?? 'survey photo'}
						class="max-w-full max-h-full object-contain" draggable="false"
						onload={onSingleImgLoad} />
					{#if (singlePhoto.annotations?.length ?? 0) > 0 && imgNaturalW > 0}
						<div class="absolute inset-0 flex items-center justify-center">
							<div class="relative" style:width="min(100%, {imgNaturalW}px)" style:aspect-ratio="{imgNaturalW} / {imgNaturalH}">
								<AnnotationOverlay
									width={imgNaturalW}
									height={imgNaturalH}
									annotations={singlePhoto.annotations ?? []}
									readonly={true} />
							</div>
						</div>
					{/if}
				</div>
				<div class="text-[2.4pt] text-zinc-600 text-center py-0.5 truncate">{singlePhoto.title || '—'}</div>
			</div>
		{:else}
			<div class="w-full h-full flex items-center justify-center text-[10px] text-red-400 italic">
				Photo not found in this survey
			</div>
		{/if}
	{:else if photos.length === 0}
		<div class="w-full h-full flex items-center justify-center text-[10px] text-zinc-400 italic">
			{survey.name} · no photos yet
		</div>
	{:else}
		<div class="w-full h-full overflow-auto p-0.5">
			<div class="text-[2.4pt] text-zinc-600 font-semibold mb-0.5 truncate">{survey.name} · {photos.length} photos</div>
			<div class="grid gap-0.5" style:grid-template-columns="repeat({tileCols}, minmax(0, 1fr))">
				{#each photos as p (p.id)}
					{@const annotationCount = p.annotations?.length ?? 0}
					<div class="aspect-square overflow-hidden bg-zinc-100 relative">
						<img src={p.imageUrl} alt={p.title ?? 'survey'} class="w-full h-full object-cover" draggable="false" />
						<!--
							Annotation-count badge — surfaces which tiles carry drawn
							notes at a glance. Hidden for tiles with no annotations.
						-->
						{#if annotationCount > 0}
							<div class="absolute top-0.5 right-0.5 bg-amber-500 text-white text-[1.6pt] font-bold rounded-full px-1 leading-tight"
								title="{annotationCount} annotation{annotationCount === 1 ? '' : 's'}">
								{annotationCount}
							</div>
						{/if}
					</div>
				{/each}
			</div>
		</div>
	{/if}
</div>
