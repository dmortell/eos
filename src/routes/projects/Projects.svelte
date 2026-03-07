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
	let searchQuery = $state('')
	let showOnlyMine = $state(false)

	interface Project {
		id: string;
		name: string;
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
		editorOpen = true
	}

	function openEdit(project: Project) {
		if (!canEditProject(project)) return
		mode = 'edit'
		selected = project
		draftName = project.name || ''
		draftDescription = project.description || ''
		editorOpen = true
	}

	async function saveProject() {
		const name = draftName.trim()
		if (!name) return
		const now = new Date()
		if (mode === 'create') {
			await db.save('projects', {
				name,
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

<div class="p-2">
	<div class="flex items-center justify-between mb-2">
		<h1 class="text-sm font-semibold">Projects</h1>
		<Button icon="plus" variant="primary" class="text-xs px-2 py-0.5" onclick={openCreate}>New Project</Button>
	</div>

	<div class="flex items-center gap-2 mb-2">
		<input 
			type="text" 
			class="flex-1 border rounded px-2 py-1 text-xs" 
			placeholder="Search projects..." 
			bind:value={searchQuery}
		/>
		<label class="flex items-center gap-1.5 text-xs cursor-pointer select-none whitespace-nowrap">
			<input 
				type="checkbox" 
				class="rounded" 
				bind:checked={showOnlyMine}
			/>
			<span>My Projects</span>
		</label>
	</div>

	{#if loading}
		<div class="text-xs text-gray-500">Loading projects...</div>
	{:else if activeProjects.length===0}
		<div class="text-xs text-gray-500">No active projects</div>
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

	<details class="mt-2 border rounded bg-gray-50" open={trashedProjects.length > 0}>
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
			<Button variant="primary" onclick={saveProject} disabled={!draftName.trim() || (mode === 'edit' && selected ? !canEditProject(selected) : false)}>Save</Button>
			</div>
		</div>
	</div>
</Dialog>

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
