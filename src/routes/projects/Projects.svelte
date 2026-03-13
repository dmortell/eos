<script lang="ts">
	import { getContext } from "svelte";
	import { Firestore, Button, Dialog, type Session } from "$lib";
	let db = getContext('db') as Firestore
	let session = getContext('session') as Session
	let projects = $state<Project[]>([])
	let loading = $state(1)
	let role = $state('user')
	let cfg = getContext<{ locale: string }>('settings')
	let editorOpen = $state(false)
	let confirmOpen = $state(false)
	let mode = $state<'create' | 'edit'>('create')
	let selected = $state<Project | null>(null)
	let draftName = $state('')
	let draftDescription = $state('')
	let draftClientCode = $state('')
	let draftProjectCode = $state('')
	let searchQuery = $state('')
	let showOnlyMine = $state(false)
	let trashedOpen = $state(false)

	interface Project {
		id: string;
		name: string;
		clientCode?: string;
		projectCode?: string;
		description?: string;
		createdAt?: any;
		updatedAt?: any;
		ownerId?: string;
		deleted?: boolean;
		deletedAt?: any;
		deletedBy?: string;
	}

	let activeProjects = $derived.by(() => {
		let filtered = projects.filter(p => !p.deleted)

		// Filter by ownership
		if (showOnlyMine) {
			const uid = session?.user?.uid
			filtered = filtered.filter(p => p.ownerId === uid)
		}

		// Filter by search query
		if (searchQuery.trim()) {
			const q = searchQuery.toLowerCase()
			filtered = filtered.filter(p =>
				p.name.toLowerCase().includes(q) ||
				(p.description && p.description.toLowerCase().includes(q))
			)
		}

		return filtered
	})
	let trashedProjects = $derived.by(() => projects.filter(p => p.deleted))
	let canManageTrashDelete = $derived(role === 'admin' || role === 'manager')

	function canEditProject(project: Project | null): boolean {
		if (!project) return false
		const uid = session?.user?.uid
		if (!uid) return false
		if (role === 'admin' || role === 'manager') return true
		return true;		// return project.ownerId === uid
	}

	$effect(()=>{
		let unsub = db.subscribeMany('projects', data=>{ projects = data as unknown as Project[]; loading=0 })
		return () => { unsub?.() }
	})

	$effect(() => {
		const uid = session?.user?.uid
		if (!uid) {
			role = 'user'
			return
		}
		const unsub = db.subscribeOne('users', uid, (data) => {
			role = typeof data?.role === 'string' ? data.role : 'user'
		})
		return () => { unsub?.() }
	})

	function openCreate() {
		mode = 'create'
		selected = null
		draftName = ''
		draftDescription = ''
		draftClientCode = ''
		draftProjectCode = ''
		editorOpen = true
	}

	function openEdit(project: Project) {
		if (!canEditProject(project)) return
		mode = 'edit'
		selected = project
		draftName = project.name || ''
		draftDescription = project.description || ''
		draftClientCode = project.clientCode || ''
		draftProjectCode = project.projectCode || ''
		editorOpen = true
	}

	function normalizeCode(input: string): string {
		return input
			.trim()
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '')
	}

	async function generateUniqueProjectId(clientCode: string, projectCode: string): Promise<string> {
		const base = `${clientCode}-${projectCode}`
		for (let i = 0; i < 8; i += 1) {
			const num = Math.floor(Math.random() * 9000) + 1000
			const candidate = `${base}-${num}`
			const exists = await db.getOne('projects', candidate)
			if (!exists) return candidate
		}
		const fallback = `${base}-${Date.now().toString().slice(-6)}`
		return fallback
	}

	async function saveProject() {
		const name = draftName.trim()
		if (!name) return
		const now = new Date()
		if (mode === 'create') {
			const clientCode = normalizeCode(draftClientCode)
			const projectCode = normalizeCode(draftProjectCode)
			if (!clientCode || !projectCode) return
			const id = await generateUniqueProjectId(clientCode, projectCode)
			await db.save('projects', {
				id,
				name,
				clientCode,
				projectCode,
				description: draftDescription.trim() || '',
				ownerId: session?.user?.uid,
				createdAt: now,
				updatedAt: now,
				deleted: false,
			})
		} else if (selected?.id) {
			if (!canEditProject(selected)) return
			await db.save('projects', {
				id: selected.id,
				name,
				description: draftDescription.trim() || '',
				updatedAt: now,
			})
		}
		editorOpen = false
	}

	function askDelete(project: Project) {
		if (!canEditProject(project)) return
		selected = project
		confirmOpen = true
	}

	async function confirmDelete() {
		if (!selected?.id) return
		if (!canEditProject(selected)) return
		await db.save('projects', {
			id: selected.id,
			deleted: true,
			deletedAt: new Date(),
			deletedBy: session?.user?.uid || null,
			updatedAt: new Date(),
		})
		confirmOpen = false
		editorOpen = false
	}

	async function restore(project: Project) {
		await db.save('projects', {
			id: project.id,
			deleted: false,
			deletedAt: null,
			deletedBy: null,
			updatedAt: new Date(),
		})
	}
</script>

<div class="p-2 pb-10">
	<div class="flex items-center justify-between mb-2 gap-2">
		<h1 class="text-sm font-semibold">Projects</h1>
		<div class="flex items-center gap-2 flex-1 max-w-md">
			<input type="text" class="flex-1 border rounded px-2 py-1 text-xs" placeholder="Search projects..."
				bind:value={searchQuery}
			/>
			<label class="text-xs flex items-center gap-1 border rounded px-2 py-0.5 bg-white whitespace-nowrap">
				<input type="checkbox" bind:checked={showOnlyMine} />
				<span>My Projects</span>
			</label>
			<Button icon="plus" variant="primary" class="text-xs px-2 py-0.5" onclick={openCreate}>New Project</Button>
		</div>
	</div>

	{#if loading}
		<div class="text-xs text-gray-500">Loading projects...</div>
	{:else if activeProjects.length===0}
		<div class="text-xs text-gray-500">
			{#if searchQuery.trim() || showOnlyMine}
				No projects match your filters
			{:else}
				No active projects
			{/if}
		</div>
	{:else}
		<div class="border rounded bg-white divide-y divide-gray-100">
		{#each activeProjects as project}
			<div class="flex items-center justify-between text-xs px-1.5 py-1 gap-2">
				<div class="flex items-start gap-1.5 min-w-0">
					<div class="w-2 h-2 rounded-full bg-green-500 shrink-0 mt-1"></div>
					<div class="min-w-0">
						<a href='/projects/{project.id}' class="text-blue-600 hover:text-blue-400 truncate leading-tight">{project.name}</a>
						<div class="flex items-center gap-2 min-w-0">
							<div class="w-24 shrink-0 text-[10px] text-gray-500 leading-tight">{project.createdAt ? project.createdAt.toDate().toLocaleDateString(cfg.locale) :''}</div>
							{#if project.description}<div class="text-[10px] text-gray-600 truncate leading-tight">{project.description}</div>{/if}
						</div>
					</div>
				</div>
				<div class="flex items-center gap-1 shrink-0">
					{#if canEditProject(project)}
						<Button class="text-xs px-1.5 py-0" variant="outline" onclick={() => openEdit(project)}>Edit</Button>
					{/if}
				</div>
			</div>
		{/each}
		</div>
	{/if}

	<details class="mt-2 border rounded bg-gray-50" open={trashedOpen}>
		<summary class="cursor-pointer text-xs px-2 py-1 select-none">Archived ({trashedProjects.length})</summary>
		<div class="px-2 pb-2 space-y-1">
			{#if trashedProjects.length===0}
				<div class="text-xs text-gray-500">Archive is empty</div>
			{:else}
				{#each trashedProjects as project}
					<div class="flex items-center justify-between text-xs gap-2 border rounded bg-white px-2 py-1">
						<div class="min-w-0">
							<div class="font-medium truncate">{project.name}</div>
							<div class="text-gray-500">Deleted: {project.deletedAt?.toDate ? project.deletedAt.toDate().toLocaleDateString(cfg.locale) : ''}</div>
						</div>
						{#if project.description}<div class="text-gray-600 truncate leading-tight">{project.description}</div>{/if}
						<div class="flex items-center gap-1 shrink-0">
							{#if canManageTrashDelete}
								<Button class="text-xs px-1.5 py-0" variant="danger" disabled title="Coming soon - permanent deletion across collections">Delete Permanently</Button>
							{:else}
								<!-- <span class="text-[10px] text-gray-500">Permanent delete: admin/manager</span> -->
							{/if}
							<Button class="text-xs px-1.5 py-0" variant="outline" title="Move project back to active list" onclick={() => restore(project)}>Restore to Active</Button>
						</div>
					</div>
				{/each}
			{/if}
		</div>
	</details>
</div>

<Dialog bind:open={editorOpen} title={mode === 'create' ? 'Create Project' : 'Edit Project'}>
	<div class="space-y-2 mt-1">
		{#if mode === 'create'}
			<div class="grid grid-cols-2 gap-2">
				<div>
					<div class="text-xs text-gray-700">Client Code</div>
					<input class="w-full border rounded px-2 py-1 text-sm" bind:value={draftClientCode} placeholder="ex: acme" maxlength="12" />
				</div>
				<div>
					<div class="text-xs text-gray-700">Project Code</div>
					<input class="w-full border rounded px-2 py-1 text-sm" bind:value={draftProjectCode} placeholder="ex: hqfit" maxlength="12" />
				</div>
			</div>
			<div class="text-[10px] text-gray-500">
				Firestore ID preview: {normalizeCode(draftClientCode) || 'client'}-{normalizeCode(draftProjectCode) || 'project'}-####
			</div>
		{/if}
		<div class="text-xs text-gray-700">Name</div>
		<input class="w-full border rounded px-2 py-1 text-sm" bind:value={draftName} placeholder="Project name" />
		<div class="text-xs text-gray-700">Description</div>
		<textarea class="w-full border rounded px-2 py-1 text-sm" bind:value={draftDescription} rows="4" placeholder="Optional description"></textarea>
		{#if mode === 'edit' && selected && !canEditProject(selected)}
			<div class="text-xs text-amber-700">You do not have permission to edit this project.</div>
		{/if}
		<div class="flex justify-between gap-2 pt-1">
			<div>
				{#if mode === 'edit' && selected && canEditProject(selected)}
					<Button variant="outline" onclick={() => { if (selected) askDelete(selected) }}>Archive Project</Button>
				{/if}
			</div>
			<div class="flex gap-2">
			<Button variant="outline" onclick={() => editorOpen = false}>Cancel</Button>
			<Button variant="primary" onclick={saveProject} disabled={!draftName.trim() || (mode === 'create' && (!normalizeCode(draftClientCode) || !normalizeCode(draftProjectCode))) || (mode === 'edit' && selected ? !canEditProject(selected) : false)}>Save</Button>
			</div>
		</div>
	</div>
</Dialog>

<div class="fixed bottom-0 left-0 right-0 z-10 border-t border-gray-200 bg-white/95 px-3 py-1.5 text-xs text-gray-600 backdrop-blur">
	<div class="mx-auto flex max-w-6xl items-center justify-between gap-2">
		<span>Status: Ready</span>
		<a
			href="https://github.com/dmortell/eos/issues"
			target="_blank"
			rel="noopener noreferrer"
			class="inline-flex items-center gap-1.5 text-blue-600 hover:text-blue-500 hover:underline"
		>
			<svg viewBox="0 0 16 16" aria-hidden="true" class="h-3.5 w-3.5 fill-current">
				<path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.5-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.56 7.56 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"/>
			</svg>
			Issues and Feature Requests
		</a>
	</div>
</div>

<Dialog bind:open={confirmOpen} title="Archive Project?">
	<div class="space-y-2 mt-1 text-sm">
		<div>This will move <strong>{selected?.name}</strong> to Archived.</div>
		<div class="text-xs text-gray-600">Project data is not permanently deleted and can be restored later.</div>
		<div class="flex justify-end gap-2 pt-1">
			<Button variant="outline" onclick={() => confirmOpen = false}>Cancel</Button>
			<Button variant="danger" onclick={confirmDelete}>Archive</Button>
		</div>
	</div>
</Dialog>
