<script lang="ts">
	import { Button, Icon, Spinner } from '$lib'
	import VoiceInput from './VoiceInput.svelte'
	import { savePhoto } from '../survey.svelte'
	import { generateSvelteHelpers } from '@uploadthing/svelte'
	import type { OurFileRouter } from '../../api/uploadthing/uploadthing'

	const { createUploadThing } = generateSvelteHelpers<OurFileRouter>()

	let {
		surveyId,
		blob,
		geo,
		onclose,
		onsaved,
		onretake,
	}: {
		surveyId: string
		blob: Blob
		geo: { latitude: number; longitude: number } | null
		onclose: () => void
		onsaved: () => void
		onretake: () => void
	} = $props()

	let title = $state('')
	let description = $state('')
	let saving = $state(false)
	let uploadProgress = $state(0)
	let errorMsg = $state('')

	let previewUrl = $derived(URL.createObjectURL(blob))

	const { startUpload } = createUploadThing('imageUploader', {
		onUploadProgress: (p: number) => { uploadProgress = p },
	})

	async function handleSave() {
		if (!title.trim()) { errorMsg = 'Title is required'; return }
		saving = true
		errorMsg = ''
		try {
			const file = new File([blob], `survey-${Date.now()}.jpg`, { type: 'image/jpeg' })
			const res = await startUpload([file])
			if (!res?.[0]) throw new Error('Upload failed')
			const imageUrl = res[0].ufsUrl || res[0].url
			await savePhoto(surveyId, {
				title: title.trim(),
				description: description.trim() || undefined,
				imageUrl,
				latitude: geo?.latitude,
				longitude: geo?.longitude,
				capturedAt: new Date(),
				sortOrder: Date.now(),
			})
			onsaved()
		} catch (e: any) {
			errorMsg = e.message || 'Failed to save photo'
			saving = false
		}
	}
</script>

<div class="fixed inset-0 z-50 flex flex-col bg-white">
	<!-- Header -->
	<div class="flex items-center gap-2 border-b px-3 py-2">
		<button type="button" class="flex h-8 w-8 items-center justify-center rounded" onclick={onclose}>
			<Icon name="close" size={20} />
		</button>
		<span class="flex-1 text-sm font-medium">New Photo</span>
	</div>

	<div class="flex-1 overflow-y-auto">
		<!-- Preview -->
		<div class="bg-black">
			<img src={previewUrl} alt="Captured" class="mx-auto max-h-[40vh] object-contain" />
		</div>

		<!-- Form -->
		<div class="space-y-3 p-4">
			<VoiceInput bind:value={title} label="Title" placeholder="Photo title..." />
			<VoiceInput bind:value={description} label="Description" placeholder="Optional description..." multiline rows={2} />

			{#if geo}
				<div class="flex items-center gap-1.5 text-xs text-gray-500">
					<Icon name="mapPin" size={12} />
					<span>{geo.latitude.toFixed(5)}, {geo.longitude.toFixed(5)}</span>
				</div>
			{/if}

			{#if errorMsg}
				<p class="text-xs text-red-600">{errorMsg}</p>
			{/if}

			{#if saving}
				<div class="flex items-center gap-2 text-sm text-gray-600">
					<Spinner />
					<span>Uploading... {uploadProgress}%</span>
				</div>
			{/if}
		</div>
	</div>

	<!-- Actions -->
	<div class="safe-bottom flex gap-2 border-t p-3">
		<Button variant="outline" onclick={onretake} disabled={saving} class="flex-1">Retake</Button>
		<Button variant="primary" onclick={handleSave} loading={saving} class="flex-1">Save</Button>
	</div>
</div>

<style>
	.safe-bottom {
		padding-bottom: max(0.75rem, env(safe-area-inset-bottom));
	}
</style>
