<script lang="ts">
	import { Titlebar, Firestore } from '$lib'
	import { Icon } from '$lib'
	import { createUploadThing } from './uploader'
	import { goto } from '$app/navigation'

	interface FileDoc {
		id: string
		name?: string
		url?: string
		key?: string
		size?: number
		pageCount?: number
		projectId?: string
		uploadedAt?: any
		updatedAt?: any
		pages?: Record<number, PageInfo>
		[key: string]: unknown
	}

	interface PageInfo {
		crop?: { x: number; y: number; width: number; height: number }
		origin?: { x: number; y: number }
		scale?: { distance: number; scale: number; units: string; x1: number; y1: number; x2: number; y2: number; offset: number }
	}

	let { files = [], projectName = '', projectId = '', ondelete }: {
		files: FileDoc[]
		projectName?: string
		projectId?: string
		ondelete?: (fileId: string, utKey?: string) => void
	} = $props()

	let db = new Firestore()
	let confirmingDelete = $state<string | null>(null)
	let search = $state('')
	let uploading = $state(false)
	let uploadProgress = $state<Record<string, number>>({})
	let uploadError = $state('')
	let dragOver = $state(false)

	// Fetch project names for grouping
	let projects = $state<Record<string, string>>({})
	$effect(() => {
		const unsub = db.subscribeMany('projects', data => {
			const map: Record<string, string> = {}
			for (const p of data) if (p.id && p.name) map[p.id as string] = p.name as string
			projects = map
		})
		return () => { unsub?.() }
	})

	let filtered = $derived(
		files
			.filter(f => !search || (f.name ?? f.id).toLowerCase().includes(search.toLowerCase()))
			.sort((a, b) => (a.name ?? a.id).localeCompare(b.name ?? b.id))
	)

	let totalSize = $derived(filtered.reduce((sum, f) => sum + (f.size ?? 0), 0))

	// Group filtered files by projectId
	let grouped = $derived.by(() => {
		const groups: { pid: string; name: string; files: FileDoc[] }[] = []
		const map = new Map<string, FileDoc[]>()
		for (const f of filtered) {
			const pid = (f.projectId as string) || ''
			if (!map.has(pid)) map.set(pid, [])
			map.get(pid)!.push(f)
		}
		// Current project first, then others alphabetically
		if (map.has(projectId)) {
			groups.push({ pid: projectId, name: projects[projectId] || projectName || projectId, files: map.get(projectId)! })
			map.delete(projectId)
		}
		const rest = [...map.entries()].sort((a, b) => {
			const nameA = projects[a[0]] || a[0] || 'Unassigned'
			const nameB = projects[b[0]] || b[0] || 'Unassigned'
			return nameA.localeCompare(nameB)
		})
		for (const [pid, files] of rest) {
			groups.push({ pid, name: projects[pid] || pid || 'Unassigned', files })
		}
		return groups
	})

	// UploadThing
	const { startUpload } = createUploadThing('floorplanUploader', {
		onClientUploadComplete: (res) => {
			if (Array.isArray(res)) {
				for (const file of res) {
					db.save('files', {
						id: file.name,
						name: file.name,
						url: file.ufsUrl,
						key: file.key,
						size: file.size,
						projectId,
						uploadedAt: new Date(),
					})
				}
			}
			uploading = false
			uploadProgress = {}
		},
		onUploadError: (error) => {
			uploadError = error.message
			uploading = false
			uploadProgress = {}
			setTimeout(() => { uploadError = '' }, 5000)
		},
		onUploadProgress: (progress) => {
			// progress is a number 0-100
		},
	})

	let fileInput: HTMLInputElement

	function selectFiles() {
		fileInput?.click()
	}

	async function handleFiles(fileList: FileList | null) {
		if (!fileList?.length) return
		const arr = Array.from(fileList)
		uploading = true
		uploadError = ''
		for (const f of arr) uploadProgress[f.name] = 0
		try {
			await startUpload(arr)
		} catch (e: any) {
			uploadError = e.message ?? 'Upload failed'
			uploading = false
			uploadProgress = {}
		}
	}

	function onInputChange(e: Event) {
		const input = e.currentTarget as HTMLInputElement
		handleFiles(input.files)
		input.value = ''
	}

	function onDrop(e: DragEvent) {
		e.preventDefault()
		dragOver = false
		handleFiles(e.dataTransfer?.files ?? null)
	}

	function onDragOver(e: DragEvent) {
		e.preventDefault()
		dragOver = true
	}

	function onDragLeave() {
		dragOver = false
	}

	function formatSize(bytes?: number): string {
		if (!bytes) return '—'
		if (bytes < 1024) return `${bytes} B`
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
	}

	function formatDate(ts: any): string {
		if (!ts) return '—'
		try {
			const d = ts.toDate ? ts.toDate() : new Date(ts)
			return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
		} catch { return '—' }
	}

	function fileStatus(file: FileDoc): { hasOrigin: boolean; hasScale: boolean } {
		const pages = file.pages ?? {}
		// Check page 1 for origin/scale (primary page setup)
		const p = pages[1] ?? pages[0]
		return { hasOrigin: !!p?.origin, hasScale: !!(p?.scale?.scale) }
	}

	function openFile(file: FileDoc, tool?: string) {
		const url = `/projects/${projectId}/uploads/${encodeURIComponent(file.id)}` + (tool ? `?tool=${tool}` : '')
		goto(url)
	}

	function doDelete(file: FileDoc) {
		confirmingDelete = null
		ondelete?.(file.id, file.key)
	}

	function groupSize(files: FileDoc[]): number {
		return files.reduce((sum, f) => sum + (f.size ?? 0), 0)
	}
</script>

<Titlebar title={projectName ? `${projectName} — Uploads` : 'Uploads'} />

<input bind:this={fileInput} type="file" accept=".pdf,image/*" multiple class="hidden" onchange={onInputChange} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="flex-1 overflow-hidden flex flex-col bg-gray-50" style="height: calc(100vh - 33px)"
	ondrop={onDrop} ondragover={onDragOver} ondragleave={onDragLeave}>

	<!-- Toolbar -->
	<div class="flex items-center gap-3 px-4 py-2 bg-white border-b border-gray-200">
		<div class="flex items-center gap-2 flex-1">
			<Icon name="fileText" class="h-4 w-4 text-gray-400" />
			<div class="text-xs text-gray-500 font-medium">{filtered.length} file{filtered.length !== 1 ? 's' : ''} ({formatSize(totalSize)})</div>
			<div class="text-xs text-gray-400 ml-4">Drag PDF floorplans here, or click Upload</div>

		</div>
		{#if files.length > 5}
			<input type="text" bind:value={search} placeholder="Filter files..."
				class="w-48 h-7 px-2 text-xs border border-gray-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-400" />
		{/if}
		<button class="h-7 px-3 text-[11px] bg-blue-600 text-white rounded hover:bg-blue-500 transition-colors flex items-center gap-1.5"
			onclick={selectFiles} disabled={uploading}>
			<Icon name="upload" size={12} />
			{uploading ? 'Uploading...' : 'Upload'}
		</button>
	</div>

	{#if uploadError}
		<div class="px-4 py-1.5 bg-red-50 border-b border-red-200 text-xs text-red-600">{uploadError}</div>
	{/if}

	{#if uploading}
		<div class="px-4 py-1.5 bg-blue-50 border-b border-blue-200 text-xs text-blue-600 flex items-center gap-2">
			<Icon name="spinner" size={12} class="animate-spin" />
			Uploading {Object.keys(uploadProgress).length} file{Object.keys(uploadProgress).length !== 1 ? 's' : ''}...
		</div>
	{/if}

	<!-- Drop overlay -->
	{#if dragOver}
		<div class="absolute inset-0 z-10 bg-blue-500/10 border-2 border-dashed border-blue-400 rounded flex items-center justify-center pointer-events-none">
			<div class="bg-white rounded-lg shadow-lg px-6 py-4 text-center">
				<Icon name="upload" class="h-8 w-8 text-blue-500 mx-auto mb-2" />
				<p class="text-sm font-medium text-blue-700">Drop files to upload</p>
			</div>
		</div>
	{/if}

	<!-- File list -->
	<div class="flex-1 overflow-y-auto p-4">
		{#if files.length === 0 && !uploading}
			<div class="flex flex-col items-center justify-center h-full text-gray-400 gap-2">
				<Icon name="upload" class="h-10 w-10 text-gray-300" />
				<p class="text-sm">No files uploaded yet</p>
			</div>
		{:else if filtered.length === 0}
			<p class="text-xs text-gray-400 text-center py-8">No files match "{search}"</p>
		{:else}
			{#each grouped as group (group.pid)}
				<details open={group.pid === projectId} class="mb-2">
					<summary class="flex items-center gap-2 px-3 py-1.5 cursor-pointer select-none rounded hover:bg-gray-100 text-xs font-medium text-gray-600">
						<Icon name="folder" size={13} class="text-gray-400" />
						{group.name}
						<span class="text-gray-400 font-normal">{group.files.length} file{group.files.length !== 1 ? 's' : ''} ({formatSize(groupSize(group.files))})</span>
					</summary>

					<div class="space-y-0.5 mt-1">
						<!-- Header -->
						<div class="grid grid-cols-[1fr_70px_45px_120px_100px_32px] gap-2 px-3 py-1 text-[10px] text-gray-400 uppercase tracking-wider font-medium">
							<span>Name</span>
							<span>Size</span>
							<span>Pg</span>
							<span>Status</span>
							<span>Uploaded</span>
							<span></span>
						</div>

						{#each group.files as file (file.id)}
							{@const status = fileStatus(file)}
							<div class="grid grid-cols-[1fr_70px_45px_120px_100px_32px] gap-2 items-center px-3 py-1 rounded bg-white border border-gray-100 hover:border-gray-200 transition-colors">
								<!-- Name -->
								<div class="flex items-center gap-2 min-w-0">
									<Icon name="fileText" class="h-3.5 w-3.5 text-gray-400 shrink-0" />
									<div class="min-w-0">
										{#if file.url}
											<button
												class="text-xs text-gray-700 hover:text-blue-600 truncate block text-left cursor-pointer"
												title={file.name ?? file.id}
												onclick={() => openFile(file)}>
												{file.name ?? file.id}
											</button>
										{:else}
											<span class="text-xs text-gray-700 truncate block">{file.name ?? file.id}</span>
										{/if}
									</div>
								</div>

								<!-- Size -->
								<span class="text-[11px] text-gray-500 tabular-nums">{formatSize(file.size)}</span>

								<!-- Pages -->
								<span class="text-[11px] text-gray-500 tabular-nums">{file.pageCount ?? '—'}</span>

								<!-- Origin / Scale status -->
								<div class="flex items-center gap-2">
									{#if !status.hasOrigin}
										<button class="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 border border-amber-200 hover:bg-amber-100 cursor-pointer"
											title="Set origin" onclick={(e) => { e.stopPropagation(); openFile(file, 'origin') }}>Set origin</button>
									{:else if !status.hasScale}
										<button class="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 border border-amber-200 hover:bg-amber-100 cursor-pointer"
											title="Set scale" onclick={(e) => { e.stopPropagation(); openFile(file, 'scale') }}>Set scale</button>
									{:else}
										<Icon name="check" class="h-3 w-3 text-green-500" />
										<span class="text-[10px] text-green-600">Ready</span>
									{/if}
								</div>

								<!-- Date -->
								<span class="text-[11px] text-gray-500">{formatDate(file.uploadedAt ?? file.updatedAt)}</span>

								<!-- Delete -->
								<div class="flex justify-end">
									{#if confirmingDelete === file.id}
										<div class="flex items-center gap-1">
											<button class="px-1.5 py-0.5 bg-red-600 text-white rounded text-[10px] hover:bg-red-700" onclick={() => doDelete(file)}>Yes</button>
											<button class="px-1.5 py-0.5 bg-gray-200 text-gray-600 rounded text-[10px] hover:bg-gray-300" onclick={() => confirmingDelete = null}>No</button>
										</div>
									{:else}
										<button
											class="text-gray-300 hover:text-red-500 transition-colors"
											title="Delete file"
											onclick={() => confirmingDelete = file.id}>
											<Icon name="trash" class="h-3.5 w-3.5" />
										</button>
									{/if}
								</div>
							</div>
						{/each}
					</div>
				</details>
			{/each}
		{/if}
	</div>
</div>
