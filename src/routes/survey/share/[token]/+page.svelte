<script lang="ts">
	import { Icon } from '$lib'

	let { data } = $props()
	let { survey, photos } = data

	let selectedIndex: number | null = $state(null)
	let currentPhoto = $derived(selectedIndex != null ? photos[selectedIndex] : null)

	function fmtDate(d: string) {
		if (!d) return ''
		return new Date(d).toLocaleDateString('en', { year: 'numeric', month: 'short', day: 'numeric' })
	}

	function fmtTime(ts: any): string {
		if (!ts) return ''
		const d = typeof ts === 'string' ? new Date(ts) : ts.toDate ? ts.toDate() : new Date(ts)
		return d.toLocaleDateString('en', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
	}

	function prev() { if (selectedIndex != null && selectedIndex > 0) selectedIndex-- }
	function next() { if (selectedIndex != null && selectedIndex < photos.length - 1) selectedIndex++ }

	function handleKeydown(e: KeyboardEvent) {
		if (selectedIndex == null) return
		if (e.key === 'ArrowLeft') prev()
		else if (e.key === 'ArrowRight') next()
		else if (e.key === 'Escape') selectedIndex = null
	}

	let touchStartX = 0
	function handleTouchStart(e: TouchEvent) { touchStartX = e.touches[0].clientX }
	function handleTouchEnd(e: TouchEvent) {
		const dx = e.changedTouches[0].clientX - touchStartX
		if (Math.abs(dx) > 60) { dx > 0 ? prev() : next() }
	}
</script>

<svelte:head>
	<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
	<title>{survey.name} — Photo Survey</title>
</svelte:head>
<svelte:window onkeydown={handleKeydown} />

<div class="mx-auto flex h-dvh max-w-lg flex-col bg-white">
	<!-- Header -->
	<div class="border-b px-4 py-3">
		<h1 class="text-lg font-semibold">{survey.name}</h1>
		<p class="text-sm text-gray-500">
			{fmtDate(survey.date)} · {photos.length} photos
			{#if survey.projectName}
				<span class="ml-1 inline-flex items-center gap-0.5 rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
					<Icon name="folder" size={9} />{survey.projectName}
				</span>
			{/if}
		</p>
		{#if survey.ownerName}
			<p class="mt-0.5 text-xs text-gray-400">by {survey.ownerName}</p>
		{/if}
	</div>

	<!-- Photo grid -->
	<div class="flex-1 overflow-y-auto p-2">
		{#if photos.length === 0}
			<div class="flex flex-col items-center gap-2 py-16 text-gray-400">
				<Icon name="image" size={40} class="opacity-40" />
				<p class="text-sm">No photos yet</p>
			</div>
		{:else}
			<div class="grid grid-cols-3 gap-1">
				{#each photos as photo, i (photo.id)}
					<button
						type="button"
						class="relative aspect-square overflow-hidden rounded-lg"
						onclick={() => (selectedIndex = i)}
					>
						<img src={photo.imageUrl} alt={photo.title} class="h-full w-full object-cover" loading="lazy" />
						{#if photo.title}
							<div class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-1.5 pb-1 pt-4">
								<p class="truncate text-[10px] text-white">{photo.title}</p>
							</div>
						{/if}
					</button>
				{/each}
			</div>
		{/if}
	</div>
</div>

<!-- Full-screen read-only photo viewer -->
{#if currentPhoto}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="fixed inset-0 z-50 flex flex-col bg-black" ontouchstart={handleTouchStart} ontouchend={handleTouchEnd}>
		<!-- Header -->
		<div class="flex items-center gap-2 bg-black/80 px-3 py-2 text-white backdrop-blur">
			<button type="button" class="flex h-10 w-10 items-center justify-center rounded-lg active:bg-white/10" onclick={() => (selectedIndex = null)}>
				<Icon name="arrowLeft" size={22} />
			</button>
			<span class="flex-1 truncate text-sm">{currentPhoto.title}</span>
			{#if photos.length > 1}
				<span class="text-xs text-white/50">{(selectedIndex ?? 0) + 1}/{photos.length}</span>
			{/if}
		</div>

		<!-- Image -->
		<div class="flex flex-1 items-center justify-center overflow-hidden">
			<img src={currentPhoto.imageUrl} alt={currentPhoto.title} class="max-h-full max-w-full object-contain" />

			{#if selectedIndex != null && selectedIndex > 0}
				<button type="button" class="absolute left-2 top-1/2 hidden -translate-y-1/2 rounded-full bg-black/50 p-2 text-white md:block" onclick={prev}>
					<Icon name="chevronLeft" size={24} />
				</button>
			{/if}
			{#if selectedIndex != null && selectedIndex < photos.length - 1}
				<button type="button" class="absolute right-2 top-1/2 hidden -translate-y-1/2 rounded-full bg-black/50 p-2 text-white md:block" onclick={next}>
					<Icon name="chevronRight" size={24} />
				</button>
			{/if}
		</div>

		<!-- Info -->
		<div class="safe-bottom bg-black/80 px-4 py-3 text-white backdrop-blur">
			<p class="text-base font-medium">{currentPhoto.title}</p>
			{#if currentPhoto.description}
				<p class="mt-0.5 text-sm text-white/70">{currentPhoto.description}</p>
			{/if}
			<div class="mt-1.5 flex items-center gap-3 text-xs text-white/50">
				<span>{fmtTime(currentPhoto.capturedAt)}</span>
				{#if currentPhoto.barcode}
					<span class="flex items-center gap-0.5">
						<Icon name="scan" size={12} />
						{currentPhoto.barcode}
					</span>
				{/if}
				{#if currentPhoto.latitude}
					<span class="flex items-center gap-0.5">
						<Icon name="mapPin" size={12} />
						{currentPhoto.latitude.toFixed(4)}, {currentPhoto.longitude?.toFixed(4)}
					</span>
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	.safe-bottom {
		padding-bottom: max(0.75rem, env(safe-area-inset-bottom));
	}
</style>
