<script lang="ts">
	import { getContext, untrack } from "svelte";
	import { Firestore, Button, type Session } from "$lib";
	import InputNew from "$lib/ui/InputNew.svelte";
	import Checkbox from "$lib/ui/Checkbox.svelte";
	import ProjectSettingsDialog from "./ProjectSettingsDialog.svelte";
	import GroupDialog from './GroupDialog.svelte'
	import { sortGrouped, groupOf, type GroupAction } from '$lib/projectGroups'
	import { formatDate } from "$lib/utils/date";
	import { goto, replaceState } from "$app/navigation";
	import { page } from "$app/state";
	let db = getContext('db') as Firestore
	let session = getContext('session') as Session
	let projects = $state<Project[]>([])
	let loading = $state(1)
	let role = $state('user')
	let cfg = getContext<{ locale: string }>('settings')
	let editorOpen = $state(false)
	let mode = $state<'create' | 'edit'>('create')
	let selected = $state<Project | null>(null)
	let searchQuery = $state('')
	let showOnlyMine = $state(false)
	let trashedOpen = $state(false)
	/** The group dialog's action (add a building, move, rename, ungroup, delete a building). */
	let groupAction = $state<GroupAction | null>(null)

	interface Project {
		id: string;
		name: string;
		clientCode?: string;
		projectCode?: string;
		description?: string;
		client?: string;
		address?: string;
		author?: string;
		logoUrl?: string;
		companyName?: string;
		companyLogoUrl?: string;
		companyAddress?: string;
		companyContact?: string;
		members?: string[];
		createdAt?: any;
		updatedAt?: any;
		ownerId?: string;
		deleted?: boolean;
		deletedAt?: any;
		deletedBy?: string;
		/** Project groups (User 2026-10-16): the group it's a building of, the group's name, its building's name. */
		masterId?: string;
		groupName?: string;
		buildingName?: string;
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

		return sortGrouped(filtered)
	})
	let trashedProjects = $derived.by(() => projects.filter(p => p.deleted))
	/** "Your company" from this user's most recent project that has one — a new project starts with it (cad W10). */
	const ms = (t: any) => (t?.toMillis ? t.toMillis() : t?.seconds ? t.seconds * 1000 : t instanceof Date ? t.getTime() : 0)
	let lastCompany = $derived.by(() => {
		const uid = session?.user?.uid
		const mine = projects.filter((p) => !p.deleted && p.ownerId === uid && (p.companyName || p.companyLogoUrl)).sort((a, b) => ms(b.createdAt) - ms(a.createdAt))
		const p = mine[0]
		return p ? { companyName: p.companyName, companyLogoUrl: p.companyLogoUrl, companyAddress: p.companyAddress, companyContact: p.companyContact } : undefined
	})
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
		editorOpen = true
	}
	// cad's Project › New project… comes here as ?new=1: the New Project dialog opens at once (the param is dropped)
	$effect(() => {
		if (page.url.searchParams.get('new') !== '1') return
		untrack(() => {
			openCreate()
			const u = new URL(page.url); u.searchParams.delete('new')
			replaceState(u, {})
		})
	})

	function openEdit(project: Project) {
		if (!canEditProject(project)) return
		mode = 'edit'
		selected = project
		editorOpen = true
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
	<div class="row justify-between mb-2">
		<h1>Projects</h1>
		<div class="row">
			<Checkbox bind:value={showOnlyMine}>My Projects</Checkbox>
			<InputNew placeholder="Search..." class="min-w-40 flex-1" bind:value={searchQuery} />
			<Button icon="plus" variant="primary" onclick={openCreate}>New Project</Button>
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
		{#each activeProjects as project, i (project.id)}
			<!-- a group's header before its first building (User 2026-10-16: buildings are projects, grouped) -->
			{#if project.masterId && project.masterId !== activeProjects[i - 1]?.masterId}
				<div class="flex items-center justify-between px-1.5 py-1 gap-2 bg-gray-50">
					<div class="text-sm font-semibold text-gray-700 truncate">{groupOf(project)}</div>
					{#if canEditProject(project)}<div class="flex gap-1 shrink-0">
						<Button variant="outline" title="A new building in this group (a project of its own: details, members and cad settings copied)" onclick={() => (groupAction = { kind: 'add', project })}>+ Building</Button>
						<Button variant="outline" title="Rename the group (every building's title follows)" onclick={() => (groupAction = { kind: 'rename', project })}>Rename</Button>
					</div>{/if}
				</div>
			{/if}
			<div class="flex items-center justify-between xxtext-xs px-1.5 py-1 gap-2" class:pl-6={!!project.masterId}>
				<div class="flex items-start gap-1.5 min-w-0">
					<div class="w-2 h-2 rounded-full bg-green-500 shrink-0 mt-1"></div>
					<div class="min-w-0">
						<a href='/projects/{project.id}' class="text-blue-600 hover:text-blue-400 truncate leading-tight" title={project.name}>{project.masterId ? (project.buildingName || project.name) : project.name}</a>
						<div class="flex items-center gap-2 min-w-0">
							<div class="w-24 shrink-0 text-xs text-gray-500 leading-tight">{formatDate(project.createdAt, cfg.locale)}</div>
							{#if project.description}<div class="text-xs text-gray-600 truncate leading-tight">{project.description}</div>{/if}
						</div>
					</div>
				</div>
				{#if canEditProject(project)}<div class="flex items-center gap-1 shrink-0">
					<Button variant="outline" onclick={() => openEdit(project)} title="Edit details">Edit</Button>
					<!-- its group commands (User 2026-10-16): add / move / ungroup / delete a building -->
					<details class="relative">
						<summary class="list-none cursor-pointer px-2 py-0.5 rounded border text-sm text-gray-600 hover:bg-gray-50" title="Buildings: add, move, ungroup, delete">⋯</summary>
						<div class="absolute right-0 z-20 mt-1 w-56 rounded border bg-white shadow p-1 text-sm">
							<button class="block w-full text-left px-2 py-1 rounded hover:bg-gray-100" onclick={(e) => { e.currentTarget.closest('details')?.removeAttribute('open'); groupAction = { kind: 'add', project } }}>Add a building…</button>
							<button class="block w-full text-left px-2 py-1 rounded hover:bg-gray-100" onclick={(e) => { e.currentTarget.closest('details')?.removeAttribute('open'); groupAction = { kind: 'move', project } }}>{project.masterId ? 'Move to another project…' : 'Group with another project…'}</button>
							{#if project.masterId}
								<button class="block w-full text-left px-2 py-1 rounded hover:bg-gray-100" onclick={(e) => { e.currentTarget.closest('details')?.removeAttribute('open'); groupAction = { kind: 'ungroup', project } }}>Ungroup (a project of its own)</button>
								<button class="block w-full text-left px-2 py-1 rounded hover:bg-gray-100 text-red-600" onclick={(e) => { e.currentTarget.closest('details')?.removeAttribute('open'); groupAction = { kind: 'delete', project } }}>Delete this building…</button>
							{/if}
						</div>
					</details>
				</div>{/if}
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
							<div class="text-gray-500">Deleted: {formatDate(project.deletedAt, cfg.locale)}</div>
						</div>
						{#if project.description}<div class="text-gray-600 truncate leading-tight">{project.description}</div>{/if}
						<div class="flex items-center gap-1 shrink-0">
							{#if canManageTrashDelete}
								<Button class="text-xs px-1.5 py-0" variant="danger" disabled title="Coming soon - permanent deletion across collections">Delete Permanently</Button>
							{/if}
							<Button class="text-xs px-1.5 py-0" variant="outline" title="Move project back to active list" onclick={() => restore(project)}>Restore to Active</Button>
						</div>
					</div>
				{/each}
			{/if}
		</div>
	</details>
</div>

<!-- a new project opens straight in cad, on its first-run steps (cad backlog W9) -->
<ProjectSettingsDialog bind:open={editorOpen} {mode} project={selected} {lastCompany} onsaved={(id) => { if (mode === 'create') void goto(`/projects/${id}/cad`) }} />
<GroupDialog bind:action={groupAction} projects={projects} uid={session?.user?.uid} onadded={(id: string) => void goto(`/projects/${id}/cad`)} />

<div class="fixed bottom-0 left-0 right-0 z-10 border-t border-gray-200 bg-white/95 px-3 py-1.5 text-xs text-gray-600 backdrop-blur">
	<div class="mx-auto flex max-w-6xl items-center justify-between gap-2">
		<span></span>
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
