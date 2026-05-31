<script lang="ts">
	import { Firestore, Button, Icon } from '$lib'
	import { generateSvelteHelpers } from '@uploadthing/svelte'
	import type { OurFileRouter } from '../api/uploadthing/uploadthing'

	const { createUploadThing } = generateSvelteHelpers<OurFileRouter>()

	let { value = $bindable<string>(''), projectId = '' }: {
		value?: string
		projectId?: string
	} = $props()

	interface FileDoc {
		id: string
		name?: string
		url?: string
		projectId?: string
	}

	let db = new Firestore()
	let mode = $state<'upload' | 'library' | 'url'>('upload')
	let uploading = $state(false)
	let error = $state('')
	let fileInput = $state<HTMLInputElement>()

	// ── Uploads library (image files only) ──
	let libraryFiles = $state<FileDoc[]>([])
	const IMAGE_RE = /\.(png|jpe?g|gif|webp|svg|avif)(\?|$)/i

	function isImage(f: FileDoc): boolean {
		return IMAGE_RE.test(f.url ?? '') || IMAGE_RE.test(f.name ?? '')
	}

	// Subscribe to files only while the library tab is open; unsubscribe on leave.
	$effect(() => {
		if (mode !== 'library') return
		const unsub = db.subscribeMany('files', (data) => {
			libraryFiles = (data as unknown as FileDoc[]).filter(isImage)
		})
		return () => { unsub?.() }
	})

	// Current project's images first, then the rest.
	let sortedLibrary = $derived.by(() => {
		const mine = libraryFiles.filter(f => f.projectId === projectId)
		const others = libraryFiles.filter(f => f.projectId !== projectId)
		return [...mine, ...others]
	})

	// ── Upload (dedicated image route) ──
	const { startUpload } = createUploadThing('imageUploader', {
		onClientUploadComplete: (res) => {
			const f = Array.isArray(res) ? res[0] : null
			if (f?.ufsUrl) value = f.ufsUrl
			uploading = false
		},
		onUploadError: (e) => {
			error = e.message ?? 'Upload failed'
			uploading = false
			setTimeout(() => { error = '' }, 5000)
		},
	})

	async function handleFiles(list: FileList | null) {
		const f = list?.[0]
		if (!f) return
		uploading = true
		error = ''
		try {
			await startUpload([f])
		} catch (e: any) {
			error = e?.message ?? 'Upload failed'
			uploading = false
		}
	}

	function onInputChange(e: Event) {
		const input = e.currentTarget as HTMLInputElement
		handleFiles(input.files)
		input.value = ''
	}
</script>

<div class="space-y-2">
	<div class="flex items-center gap-3">
		<!-- Preview -->
		<div class="flex h-14 w-24 shrink-0 items-center justify-center rounded border border-gray-200 bg-gray-50 overflow-hidden">
			{#if value}
				<img src={value} alt="Logo preview" class="max-h-full max-w-full object-contain" />
			{:else}
				<Icon name="image" size={18} class="text-gray-300" />
			{/if}
		</div>
		<div class="min-w-0 flex-1">
			{#if value}
				<div class="truncate text-[11px] text-gray-500" title={value}>{value}</div>
				<button class="text-xs text-red-500 hover:underline" onclick={() => value = ''}>Remove logo</button>
			{:else}
				<div class="text-[11px] text-gray-400">No logo set. It will appear in drawing title blocks.</div>
			{/if}
		</div>
	</div>

	<!-- Mode toggle -->
	<div class="inline-flex rounded border border-gray-200 p-0.5 text-xs">
		<button class="rounded px-2 py-0.5 {mode === 'upload' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}"
			onclick={() => mode = 'upload'}>Upload</button>
		<button class="rounded px-2 py-0.5 {mode === 'library' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}"
			onclick={() => mode = 'library'}>From uploads</button>
		<button class="rounded px-2 py-0.5 {mode === 'url' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}"
			onclick={() => mode = 'url'}>URL</button>
	</div>

	{#if error}
		<div class="text-[11px] text-red-600">{error}</div>
	{/if}

	{#if mode === 'upload'}
		<input bind:this={fileInput} type="file" accept="image/*" class="hidden" onchange={onInputChange} />
		<Button variant="outline" icon="upload" disabled={uploading} onclick={() => fileInput?.click()}>
			{uploading ? 'Uploading…' : 'Choose image…'}
		</Button>
		<span class="ml-2 text-[10px] text-gray-400">PNG, JPG, SVG — up to 4MB</span>
	{:else if mode === 'library'}
		{#if sortedLibrary.length === 0}
			<div class="text-[11px] text-gray-400">No image files in uploads yet.</div>
		{:else}
			<div class="grid max-h-40 grid-cols-4 gap-1.5 overflow-y-auto rounded border border-gray-100 p-1.5">
				{#each sortedLibrary as f (f.id)}
					<button
						class="group relative flex aspect-square items-center justify-center rounded border bg-gray-50 overflow-hidden hover:border-blue-400 {value === f.url ? 'border-blue-500 ring-1 ring-blue-400' : 'border-gray-200'}"
						title={f.name ?? f.id}
						onclick={() => { if (f.url) value = f.url }}>
						<img src={f.url} alt={f.name ?? f.id} class="max-h-full max-w-full object-contain" />
					</button>
				{/each}
			</div>
		{/if}
	{:else if mode === 'url'}
		<input class="w-full rounded border px-2 py-1 text-sm" bind:value placeholder="https://example.com/logo.png" />
	{/if}
</div>
