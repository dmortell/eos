<script lang="ts">
	import { onMount } from 'svelte'
	import { Icon } from '$lib'

	type UploadedFile = {
		name: string
		displayName: string
		size: number
		lastModified: string
	}

	type SelectedFile = {
		name: string
		size: number
		lastModified: number
	}

	let fileInput = $state<HTMLInputElement | null>(null)
	let uploading = $state(false)
	let error = $state('')
	let uploadedFiles = $state<UploadedFile[]>([])
	let selectedFiles = $state<SelectedFile[]>([])

	const formatBytes = (bytes: number) => {
		if (bytes < 1024) return `${bytes} B`
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
	}

	const formatDate = (value: string) =>
		new Date(value).toLocaleString(undefined, {
			year: 'numeric',
			month: 'short',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit'
		})

	const getIconName = (fileName: string) => {
		const ext = fileName.split('.').pop()?.toLowerCase()
		if (!ext) return 'fileText'
		if (['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(ext)) return 'fileImage'
		return 'fileText'
	}

	const onSelectFiles = (event: Event) => {
		const target = event.currentTarget as HTMLInputElement
		selectedFiles = Array.from(target.files ?? []).map((file) => ({
			name: file.name,
			size: file.size,
			lastModified: file.lastModified
		}))
	}

	const loadUploadedFiles = async () => {
		const response = await fetch('/upload')
		const data = await response.json()
		uploadedFiles = (data.files ?? []) as UploadedFile[]
	}

	onMount(loadUploadedFiles)

	const onSubmit = async (event: SubmitEvent) => {
		error = ''
		event.preventDefault()
		if (!fileInput?.files?.length) return

		uploading = true
		try {
			const formData = new FormData()
			formData.append('fileMetadata', JSON.stringify(selectedFiles))
			for (const file of fileInput.files) {
				formData.append('files', file)
			}

			const response = await fetch('/upload', { method: 'POST', body: formData })
			const data = await response.json()
			if (response.ok) {
				uploadedFiles = (data.files ?? []) as UploadedFile[]
				fileInput.value = ''
				selectedFiles = []
			} else {
				error = data.error ?? 'Upload failed'
			}
		} catch (e) {
			error = e instanceof Error ? e.message : 'Upload failed'
		} finally {
			uploading = false
		}
	}
</script>

{#snippet fileDetail(name: string, isoDate: string, size: number)}
	<div class="flex min-w-0 items-center gap-2">
		<Icon name={getIconName(name)} size={16} class="shrink-0 text-muted-foreground" />
		<div class="min-w-0">
			<p class="truncate text-foreground">{name}</p>
			<p class="text-xs text-muted-foreground">{formatDate(isoDate)}</p>
		</div>
	</div>
	<span class="shrink-0 text-xs text-muted-foreground">{formatBytes(size)}</span>
{/snippet}

<section class="mx-auto w-full max-w-4xl px-4 py-4 sm:px-6 lg:px-8">
	<div class="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
		<div class="border-b border-border bg-gradient-to-r from-slate-100 to-zinc-100 p-4 sm:p-4 dark:from-slate-900 dark:to-zinc-900">
			<h2 class="text-lg font-semibold text-card-foreground sm:text-xl">Upload Files</h2>
			<p class="mt-1 text-sm text-muted-foreground">Select one or more files and upload them to the local storage folder.</p>
		</div>

		<form onsubmit={onSubmit} class="space-y-4 p-4 sm:p-4">
			<label class="block">
				<input bind:this={fileInput} type="file" name="files" multiple
					onchange={onSelectFiles}
					class="block w-full cursor-pointer rounded xxborder border-input bg-background xxpx-3 xxpy-2 text-sm text-foreground file:mr-3 file:rounded-md file:border file:border-slate-300 file:bg-secondary file:px-3 file:py-2 file:text-sm file:font-medium file:text-secondary-foreground hover:file:bg-slate-200"
					/>
			</label>

			{#if selectedFiles.length > 0}
				<div class="rounded-lg border border-border bg-muted/30 p-3">
					<p class="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Selected files ({selectedFiles.length})</p>
					<ul class="space-y-1.5">
						{#each selectedFiles as file (file.name + file.lastModified)}
							<li class="flex items-center justify-between gap-3 rounded-md bg-background px-2.5 py-2 text-sm">
								{@render fileDetail(file.name, new Date(file.lastModified).toISOString(), file.size)}
							</li>
						{/each}
					</ul>
				</div>
				<button
					type="submit"
					disabled={uploading || selectedFiles.length === 0}
					class="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
				>
					{uploading ? 'Uploading...' : 'Upload files'}
				</button>
			{/if}

			{#if error}
				<p class="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
			{/if}
		</form>

		<div class="border-t border-border p-4 sm:p-6">
			<div class="mb-3 flex items-center justify-between gap-3">
				<h3 class="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Uploaded files</h3>
				<span class="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground">{uploadedFiles.length}</span>
			</div>

			{#if uploadedFiles.length === 0}
				<p class="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">No files uploaded yet.</p>
			{:else}
				<ul class="divide-y divide-border overflow-hidden rounded-lg border border-border">
					{#each uploadedFiles as file (file.name)}
						<li class="flex items-center justify-between gap-3 bg-background px-3 py-2.5 text-sm">
							{@render fileDetail(file.displayName || file.name, file.lastModified, file.size)}
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	</div>
</section>
