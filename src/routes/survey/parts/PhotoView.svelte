<script lang="ts">
	import { Button, Icon } from '$lib'
	import VoiceInput from './VoiceInput.svelte'
	import FloorplanMinimap from './FloorplanMinimap.svelte'
	import { updatePhoto, deletePhoto, subscribePhotos } from '../survey.svelte'
	import type { SurveyPhoto } from '../types'

	let {
		surveyId,
		photo,
		onclose,
		ondeleted,
	}: {
		surveyId: string
		photo: SurveyPhoto
		onclose: () => void
		ondeleted: () => void
	} = $props()

	let editing = $state(false)
	let title = $state(photo.title)
	let description = $state(photo.description ?? '')
	let deleting = $state(false)
	let currentIndex = $state(0)
	let photos: SurveyPhoto[] = $state([])

	// Live subscription so edits are reflected immediately
	$effect(() => {
		const unsub = subscribePhotos(surveyId, (data) => {
			photos = data
			// Set initial index on first load
			if (photos.length && currentIndex === 0) {
				const idx = data.findIndex((p) => p.id === photo.id)
				if (idx >= 0) currentIndex = idx
			}
		})
		return () => unsub()
	})

	let currentPhoto = $derived(photos[currentIndex] ?? photo)

	// Sync edit fields when navigating between photos
	$effect(() => {
		title = currentPhoto.title
		description = currentPhoto.description ?? ''
		editing = false
	})

	function fmtTime(ts: any): string {
		if (!ts) return ''
		const d = ts.toDate ? ts.toDate() : new Date(ts)
		return d.toLocaleDateString('en', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
	}

	async function handleSave() {
		await updatePhoto(surveyId, { id: currentPhoto.id, title: title.trim(), description: description.trim() || undefined })
		editing = false
	}

	async function handleDelete() {
		deleting = true
		await deletePhoto(surveyId, currentPhoto.id)
		deleting = false
		ondeleted()
	}

	function prev() { if (currentIndex > 0) currentIndex-- }
	function next() { if (currentIndex < photos.length - 1) currentIndex++ }

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'ArrowLeft') prev()
		else if (e.key === 'ArrowRight') next()
		else if (e.key === 'Escape') onclose()
	}

	let touchStartX = 0
	function handleTouchStart(e: TouchEvent) { touchStartX = e.touches[0].clientX }
	function handleTouchEnd(e: TouchEvent) {
		const dx = e.changedTouches[0].clientX - touchStartX
		if (Math.abs(dx) > 60) { dx > 0 ? prev() : next() }
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="fixed inset-0 z-50 flex flex-col bg-black" ontouchstart={handleTouchStart} ontouchend={handleTouchEnd}>
	<!-- Header -->
	<div class="flex items-center gap-2 bg-black/80 px-3 py-2 text-white backdrop-blur">
		<button type="button" class="flex h-10 w-10 items-center justify-center rounded-lg active:bg-white/10" onclick={onclose}>
			<Icon name="arrowLeft" size={22} />
		</button>
		<span class="flex-1 truncate text-sm">{currentPhoto.title}</span>
		{#if photos.length > 1}
			<span class="text-xs text-white/50">{currentIndex + 1}/{photos.length}</span>
		{/if}
		{#if !editing}
			<button type="button" class="flex h-10 w-10 items-center justify-center rounded-lg active:bg-white/10" onclick={() => (editing = true)}>
				<Icon name="edit" size={18} />
			</button>
		{/if}
	</div>

	<!-- Image -->
	<div class="relative flex flex-1 items-center justify-center overflow-hidden">
		<img src={currentPhoto.imageUrl} alt={currentPhoto.title} class="max-h-full max-w-full object-contain" />

		<!-- Floorplan minimap -->
		<FloorplanMinimap {surveyId} photo={currentPhoto} />

		<!-- Nav arrows (desktop) -->
		{#if currentIndex > 0}
			<button type="button" class="absolute left-2 top-1/2 hidden -translate-y-1/2 rounded-full bg-black/50 p-2 text-white md:block" onclick={prev}>
				<Icon name="chevronLeft" size={24} />
			</button>
		{/if}
		{#if currentIndex < photos.length - 1}
			<button type="button" class="absolute right-2 top-1/2 hidden -translate-y-1/2 rounded-full bg-black/50 p-2 text-white md:block" onclick={next}>
				<Icon name="chevronRight" size={24} />
			</button>
		{/if}
	</div>

	<!-- Info / Edit panel -->
	<div class="safe-bottom bg-black/80 px-4 py-3 text-white backdrop-blur">
		{#if editing}
			<div class="space-y-2">
				<VoiceInput bind:value={title} label="Title" placeholder="Photo title..." />
				<VoiceInput bind:value={description} label="Description" placeholder="Description..." multiline />
				<div class="flex gap-3 pt-2">
					<button type="button" class="flex-1 rounded-lg border border-white/30 px-4 py-3 text-base font-medium active:bg-white/10" onclick={() => (editing = false)}>Cancel</button>
					<button type="button" class="flex-1 rounded-lg bg-blue-600 px-4 py-3 text-base font-medium active:bg-blue-500" onclick={handleSave}>Save</button>
				</div>
			</div>
		{:else}
			<p class="text-base font-medium">{currentPhoto.title}</p>
			{#if currentPhoto.description}
				<p class="mt-0.5 text-sm text-white/70">{currentPhoto.description}</p>
			{/if}
			<div class="mt-1.5 flex items-center gap-3 text-xs text-white/50">
				<span>{fmtTime(currentPhoto.capturedAt)}</span>
				{#if currentPhoto.latitude}
					<span class="flex items-center gap-0.5">
						<Icon name="mapPin" size={12} />
						{currentPhoto.latitude.toFixed(4)}, {currentPhoto.longitude?.toFixed(4)}
					</span>
				{/if}
			</div>
			<div class="mt-3">
				<Button variant="danger" size="sm" icon="trash" confirm={{ text: 'Delete?', confirmLabel: 'Yes', cancelLabel: 'No' }} loading={deleting} onclick={handleDelete}>Delete</Button>
			</div>
		{/if}
	</div>
</div>

<style>
	.safe-bottom {
		padding-bottom: max(0.75rem, env(safe-area-inset-bottom));
	}
</style>
