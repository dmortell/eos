<script lang="ts">
	import { Button, Icon, Spinner } from '$lib'
	import VoiceInput from './VoiceInput.svelte'
	import BarcodeScanner from './BarcodeScanner.svelte'
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
	let barcode = $state('')
	let saving = $state(false)
	let uploadProgress = $state(0)
	let errorMsg = $state('')
	let previewReady = $state(false)
	let previewUrl = $state('')
	let showScanner = $state(false)

	// Generate preview — this can take a moment for large photos
	$effect(() => {
		previewReady = false
		const url = URL.createObjectURL(blob)
		previewUrl = url
		// Wait for image to decode before showing
		const img = new Image()
		img.onload = () => { previewReady = true }
		img.onerror = () => { previewReady = true }
		img.src = url
		return () => URL.revokeObjectURL(url)
	})

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
				barcode: barcode || undefined,
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
	<div class="flex items-center gap-2 border-b px-4 py-3">
		<button type="button" class="flex h-10 w-10 items-center justify-center rounded-lg active:bg-gray-100" onclick={onclose}>
			<Icon name="close" size={22} />
		</button>
		<span class="flex-1 text-base font-semibold">New Photo</span>
	</div>

	<div class="flex-1 overflow-y-auto overscroll-contain">
		<!-- Preview -->
		<div class="flex items-center justify-center bg-black" style="min-height: 30vh">
			{#if previewReady}
				<img src={previewUrl} alt="Captured" class="mx-auto max-h-[35vh] object-contain" />
			{:else}
				<div class="flex flex-col items-center gap-2 py-8 text-white/60">
					<Spinner />
					<span class="text-sm">Loading photo...</span>
				</div>
			{/if}
		</div>

		<!-- Form -->
		<div class="space-y-4 p-4">
			<div class="flex items-end gap-2">
				<div class="min-w-0 flex-1">
					<VoiceInput bind:value={title} label="Title" placeholder="Photo title..." />
				</div>
				<button type="button" class="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-gray-300 active:bg-gray-100" title="Scan barcode" onclick={() => (showScanner = true)}>
					<Icon name="scan" size={20} />
				</button>
			</div>
			<VoiceInput bind:value={description} label="Description" placeholder="Optional description..." multiline />

			{#if geo}
				<div class="flex items-center gap-1.5 text-sm text-gray-500">
					<Icon name="mapPin" size={14} />
					<span>{geo.latitude.toFixed(5)}, {geo.longitude.toFixed(5)}</span>
				</div>
			{/if}

			{#if errorMsg}
				<p class="text-sm text-red-600">{errorMsg}</p>
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
	<div class="safe-bottom flex gap-3 border-t px-4 py-3">
		<button
			type="button"
			class="flex-1 rounded-lg border border-gray-300 px-4 py-3 text-base font-medium text-gray-700 active:bg-gray-100"
			disabled={saving}
			onclick={onretake}
		>
			Retake
		</button>
		<button
			type="button"
			class="flex-1 rounded-lg bg-blue-600 px-4 py-3 text-base font-medium text-white active:bg-blue-500 disabled:opacity-50"
			disabled={saving}
			onclick={handleSave}
		>
			{#if saving}
				Uploading... {uploadProgress}%
			{:else}
				Save
			{/if}
		</button>
	</div>
</div>

{#if showScanner}
	<BarcodeScanner
		onscanned={(val) => { title = title ? `${title} ${val}` : val; barcode = val; showScanner = false }}
		onclose={() => (showScanner = false)}
	/>
{/if}

<style>
	.safe-bottom {
		padding-bottom: max(0.75rem, env(safe-area-inset-bottom));
	}
</style>
