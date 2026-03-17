<script lang="ts">
	import { Button, Icon, Spinner } from '$lib'
	import PhotoGrid from './PhotoGrid.svelte'
	import ShareDialog from './ShareDialog.svelte'
	import { deleteSurvey, subscribePhotos } from '../survey.svelte'
	import type { Survey, SurveyPhoto } from '../types'

	let {
		survey,
		onback,
		oncamera,
		onphoto,
	}: {
		survey: Survey
		onback: () => void
		oncamera: () => void
		onphoto: (photo: SurveyPhoto, allPhotos: SurveyPhoto[]) => void
	} = $props()

	let photos: SurveyPhoto[] = $state([])
	let loading = $state(true)
	let showShare = $state(false)
	let showMenu = $state(false)

	$effect(() => {
		loading = true
		const unsub = subscribePhotos(survey.id, (data) => {
			photos = data
			loading = false
		})
		return () => unsub()
	})

	async function handleDelete() {
		await deleteSurvey(survey.id)
		onback()
	}

	function fmtDate(d: string) {
		if (!d) return ''
		return new Date(d).toLocaleDateString('ja', { year: 'numeric', month: 'short', day: 'numeric' })
	}
</script>

<div class="mx-auto flex h-dvh max-w-lg flex-col">
	<!-- Header -->
	<div class="flex items-center gap-2 border-b px-3 py-2">
		<button type="button" class="flex h-8 w-8 items-center justify-center rounded" onclick={onback}>
			<Icon name="arrowLeft" size={20} />
		</button>
		<div class="min-w-0 flex-1">
			<p class="truncate text-sm font-medium">{survey.name}</p>
			<p class="text-[11px] text-gray-500">{fmtDate(survey.date)} · {photos.length} photos</p>
		</div>
		<button type="button" class="flex h-8 w-8 items-center justify-center rounded hover:bg-gray-100" onclick={() => (showShare = true)} title="Share">
			<Icon name="share" size={16} />
		</button>
		<div class="relative">
			<button type="button" class="flex h-8 w-8 items-center justify-center rounded hover:bg-gray-100" onclick={() => (showMenu = !showMenu)}>
				<Icon name="ellipsisVertical" size={16} />
			</button>
			{#if showMenu}
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div class="fixed inset-0 z-10" onclick={() => (showMenu = false)}></div>
				<div class="absolute right-0 top-full z-20 mt-1 w-40 rounded-lg border bg-white py-1 shadow-lg">
					<Button variant="ghost" icon="trash" onclick={handleDelete} confirm={{ text: 'Delete survey?', confirmLabel: 'Delete', cancelLabel: 'Cancel' }} class="w-full justify-start text-red-600">
						Delete Survey
					</Button>
				</div>
			{/if}
		</div>
	</div>

	<!-- Photos -->
	<div class="flex-1 overflow-y-auto p-2">
		{#if loading}
			<div class="flex justify-center py-12"><Spinner /></div>
		{:else}
			<PhotoGrid {photos} onselect={(p) => onphoto(p, photos)} />
		{/if}
	</div>

	<!-- FAB -->
	<button
		type="button"
		class="fixed bottom-6 right-6 z-10 flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg transition-transform hover:bg-blue-500 active:scale-90"
		onclick={oncamera}
		style="bottom: max(1.5rem, env(safe-area-inset-bottom, 1.5rem))"
	>
		<Icon name="camera" size={24} />
	</button>
</div>

<ShareDialog {survey} bind:open={showShare} />
