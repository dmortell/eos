<script lang="ts">
	import { Icon } from '$lib'
	import type { SurveyPhoto } from '../types'

	let {
		photos,
		onselect,
	}: {
		photos: SurveyPhoto[]
		onselect: (photo: SurveyPhoto) => void
	} = $props()

	function fmtTime(ts: any): string {
		if (!ts) return ''
		const d = ts.toDate ? ts.toDate() : new Date(ts)
		return d.toLocaleDateString('ja', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
	}
</script>

{#if photos.length === 0}
	<div class="flex flex-col items-center justify-center gap-2 py-16 text-gray-400">
		<Icon name="camera" size={40} class="opacity-40" />
		<p class="text-sm">No photos yet</p>
		<p class="text-xs">Tap the camera button to get started</p>
	</div>
{:else}
	<div class="grid grid-cols-3 gap-1 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
		{#each photos as photo (photo.id)}
			<button
				type="button"
				class="group relative aspect-square overflow-hidden rounded bg-gray-100"
				onclick={() => onselect(photo)}
			>
				<img
					src={photo.imageUrl}
					alt={photo.title}
					loading="lazy"
					class="h-full w-full object-cover transition-transform group-hover:scale-105"
				/>
				<!-- Overlay -->
				<div class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-1.5 pb-1.5 pt-6">
					<p class="truncate text-[11px] font-medium text-white">{photo.title}</p>
					<p class="text-[10px] text-white/70">{fmtTime(photo.capturedAt)}</p>
				</div>
				{#if photo.latitude}
					<span class="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/40 text-white">
						<Icon name="mapPin" size={10} />
					</span>
				{/if}
			</button>
		{/each}
	</div>
{/if}
