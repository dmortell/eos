<script lang="ts">
	import { Icon, Spinner, Button } from '$lib'
	import { subscribeFloorplans, saveFloorplan, deleteFloorplan } from '../survey.svelte'
	import { generateSvelteHelpers } from '@uploadthing/svelte'
	import type { OurFileRouter } from '../../api/uploadthing/uploadthing'
	import type { SurveyFloorplan } from '../types'

	const { createUploadThing } = generateSvelteHelpers<OurFileRouter>()

	let { surveyId }: { surveyId: string } = $props()

	let floorplans: SurveyFloorplan[] = $state([])
	let loading = $state(true)
	let uploading = $state(false)
	let uploadProgress = $state(0)
	let errorMsg = $state('')

	$effect(() => {
		loading = true
		const unsub = subscribeFloorplans(surveyId, (data) => {
			floorplans = data
			loading = false
		})
		return () => unsub()
	})

	const { startUpload } = createUploadThing('floorplanUploader', {
		onUploadProgress: (p: number) => { uploadProgress = p },
	})

	async function handleFileSelect(e: Event) {
		const files = (e.target as HTMLInputElement).files
		if (!files?.length) return
		uploading = true
		uploadProgress = 0
		errorMsg = ''
		try {
			const res = await startUpload(Array.from(files))
			if (!res?.length) throw new Error('Upload failed')
			for (const file of res) {
				await saveFloorplan(surveyId, {
					name: file.name,
					url: file.ufsUrl || file.url,
					key: file.key,
					size: file.size,
					uploadedAt: new Date(),
				})
			}
		} catch (e: any) {
			errorMsg = e.message || 'Upload failed'
		} finally {
			uploading = false
		}
	}

	async function handleDelete(plan: SurveyFloorplan) {
		// Delete from UploadThing
		if (plan.key) {
			try { await fetch('/api/uploadthing/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: plan.key }) }) } catch {}
		}
		await deleteFloorplan(surveyId, plan.id)
	}

	function fmtSize(bytes: number): string {
		if (bytes < 1024) return bytes + ' B'
		if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB'
		return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
	}
</script>

<div class="flex flex-1 flex-col overflow-y-auto">
	{#if loading}
		<div class="flex justify-center py-12"><Spinner /></div>
	{:else if floorplans.length === 0 && !uploading}
		<div class="flex flex-col items-center justify-center gap-3 py-16 text-gray-400">
			<Icon name="fileText" size={40} class="opacity-40" />
			<p class="text-sm">No floorplans yet</p>
			<label class="flex cursor-pointer items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white active:bg-blue-500">
				<Icon name="upload" size={16} />
				Upload PDF or Image
				<input type="file" accept=".pdf,image/*" multiple class="hidden" onchange={handleFileSelect} />
			</label>
		</div>
	{:else}
		<div class="space-y-2 p-3">
			{#each floorplans as plan (plan.id)}
				<div class="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-3">
					<div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-100">
						<Icon name={plan.name?.endsWith('.pdf') ? 'fileText' : 'image'} size={20} class="text-gray-500" />
					</div>
					<div class="min-w-0 flex-1">
						<p class="truncate text-sm font-medium">{plan.name}</p>
						<p class="text-xs text-gray-400">{fmtSize(plan.size)}</p>
					</div>
					<a href={plan.url} target="_blank" rel="noopener" class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg active:bg-gray-100" title="Open">
						<Icon name="eye" size={18} class="text-gray-500" />
					</a>
					<Button variant="ghost" size="icon" icon="trash" confirm={{ text: 'Delete?', confirmLabel: 'Yes', cancelLabel: 'No' }} onclick={() => handleDelete(plan)} />
				</div>
			{/each}

			{#if uploading}
				<div class="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700">
					<Spinner />
					<span>Uploading... {uploadProgress}%</span>
				</div>
			{/if}

			{#if errorMsg}
				<p class="px-1 text-sm text-red-600">{errorMsg}</p>
			{/if}

			<!-- Upload more button -->
			<label class="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 py-4 text-sm text-gray-500 active:border-blue-400 active:text-blue-600">
				<Icon name="plus" size={16} />
				Add Floorplan
				<input type="file" accept=".pdf,image/*" multiple class="hidden" onchange={handleFileSelect} />
			</label>
		</div>
	{/if}
</div>
