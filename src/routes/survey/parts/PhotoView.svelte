<script lang="ts">
	import { Button, Icon } from '$lib'
	import VoiceInput from './VoiceInput.svelte'
	import { updatePhoto, deletePhoto } from '../survey.svelte'
	import type { SurveyPhoto } from '../types'

	let {
		surveyId,
		photo,
		photos,
		onclose,
		ondeleted,
	}: {
		surveyId: string
		photo: SurveyPhoto
		photos: SurveyPhoto[]
		onclose: () => void
		ondeleted: () => void
	} = $props()

	let editing = $state(false)
	let title = $state(photo.title)
	let description = $state(photo.description ?? '')
	let deleting = $state(false)
	let currentIndex = $state(photos.findIndex((p) => p.id === photo.id))
	let currentPhoto = $derived(photos[currentIndex] ?? photo)

	// Sync edit fields when navigating
	$effect(() => {
		title = currentPhoto.title
		description = currentPhoto.description ?? ''
		editing = false
	})

	function fmtTime(ts: any): string {
		if (!ts) return ''
		const d = ts.toDate ? ts.toDate() : new Date(ts)
		return d.toLocaleDateString('ja', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
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
		<button type="button" class="flex h-8 w-8 items-center justify-center rounded" onclick={onclose}>
			<Icon name="arrowLeft" size={20} />
		</button>
		<span class="flex-1 truncate text-sm">{currentPhoto.title}</span>
		<span class="text-xs text-white/50">{currentIndex + 1}/{photos.length}</span>
		{#if !editing}
			<button type="button" class="flex h-8 w-8 items-center justify-center rounded hover:bg-white/10" onclick={() => (editing = true)}>
				<Icon name="edit" size={16} />
			</button>
		{/if}
	</div>

	<!-- Image -->
	<div class="flex flex-1 items-center justify-center overflow-hidden">
		<img src={currentPhoto.imageUrl} alt={currentPhoto.title} class="max-h-full max-w-full object-contain" />

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
				<VoiceInput bind:value={description} label="Description" placeholder="Description..." multiline rows={2} />
				<div class="flex gap-2 pt-1">
					<Button variant="outline" size="lg" onclick={() => (editing = false)} class="flex-1">Cancel</Button>
					<Button variant="primary" size="lg" onclick={handleSave} class="flex-1">Save</Button>
				</div>
			</div>
		{:else}
			<p class="text-sm font-medium">{currentPhoto.title}</p>
			{#if currentPhoto.description}
				<p class="mt-0.5 text-xs text-white/70">{currentPhoto.description}</p>
			{/if}
			<div class="mt-1.5 flex items-center gap-3 text-[11px] text-white/50">
				<span>{fmtTime(currentPhoto.capturedAt)}</span>
				{#if currentPhoto.latitude}
					<span class="flex items-center gap-0.5">
						<Icon name="mapPin" size={10} />
						{currentPhoto.latitude.toFixed(4)}, {currentPhoto.longitude?.toFixed(4)}
					</span>
				{/if}
			</div>
			<div class="mt-2">
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
