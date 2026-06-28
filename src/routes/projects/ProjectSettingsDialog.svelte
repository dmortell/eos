<script lang="ts">
	import { getContext } from 'svelte'
	import { Firestore, Button, Dialog, Icon, type Session } from '$lib'
	import ProjectLogoField from './ProjectLogoField.svelte'

	interface UserDoc {
		id: string
		uid?: string
		displayName?: string
		email?: string
	}

	export interface Project {
		id: string
		name: string
		clientCode?: string
		projectCode?: string
		description?: string
		client?: string
		address?: string
		author?: string
		logoUrl?: string
		companyName?: string
		companyLogoUrl?: string
		companyAddress?: string
		companyContact?: string
		titleBlockSections?: Record<string, boolean>
		members?: string[]
		ownerId?: string
		deleted?: boolean
	}

	// Title-block sections the user can include/exclude (absent / true = shown).
	const TB_SECTIONS: { key: string; label: string }[] = [
		{ key: 'company', label: 'Company block' },
		{ key: 'client', label: 'Client logo / name' },
		{ key: 'site', label: 'Site / address' },
		{ key: 'revisions', label: 'Revision history' },
		{ key: 'approvals', label: 'Drawn / Chk / App' },
		{ key: 'scaleSize', label: 'Scale / Size' },
	]

	let {
		open = $bindable(false),
		mode = 'edit' as 'create' | 'edit',
		project = null as Project | null,
		onsaved,
		onarchived,
	}: {
		open?: boolean
		mode?: 'create' | 'edit'
		project?: Project | null
		onsaved?: (id: string) => void
		onarchived?: (id: string) => void
	} = $props()

	let db = getContext('db') as Firestore
	let session = getContext('session') as Session

	let allUsers = $state<UserDoc[]>([])
	let role = $state('user')
	let confirmOpen = $state(false)

	let draftName = $state('')
	let draftDescription = $state('')
	let draftClientCode = $state('')
	let draftProjectCode = $state('')
	let draftClient = $state('')
	let draftAddress = $state('')
	let draftAuthor = $state('')
	let draftLogoUrl = $state('')
	let draftCompanyName = $state('')
	let draftCompanyLogoUrl = $state('')
	let draftCompanyAddress = $state('')
	let draftCompanyContact = $state('')
	let draftSections = $state<Record<string, boolean>>({})
	let draftMembers = $state<string[]>([])
	let memberSearch = $state('')

	$effect(() => {
		const unsubUsers = db.subscribeMany('users', data => { allUsers = data as unknown as UserDoc[] })
		return () => { unsubUsers?.() }
	})

	$effect(() => {
		const uid = session?.user?.uid
		if (!uid) { role = 'user'; return }
		const unsub = db.subscribeOne('users', uid, (data) => {
			role = typeof data?.role === 'string' ? data.role : 'user'
		})
		return () => { unsub?.() }
	})

	// Populate the draft fields once each time the dialog opens.
	let initialized = $state(false)
	$effect(() => {
		if (open && !initialized) {
			initialized = true
			if (mode === 'create') {
				draftName = ''
				draftDescription = ''
				draftClientCode = ''
				draftProjectCode = ''
				draftClient = ''
				draftAddress = ''
				draftAuthor = ''
				draftLogoUrl = ''
				draftCompanyName = ''
				draftCompanyLogoUrl = ''
				draftCompanyAddress = ''
				draftCompanyContact = ''
				draftSections = {}
				draftMembers = session?.user?.uid ? [session.user.uid] : []
			} else {
				draftName = project?.name || ''
				draftDescription = project?.description || ''
				draftClientCode = project?.clientCode || ''
				draftProjectCode = project?.projectCode || ''
				draftClient = project?.client || ''
				draftAddress = project?.address || ''
				draftAuthor = project?.author || ''
				draftLogoUrl = project?.logoUrl || ''
				draftCompanyName = project?.companyName || ''
				draftCompanyLogoUrl = project?.companyLogoUrl || ''
				draftCompanyAddress = project?.companyAddress || ''
				draftCompanyContact = project?.companyContact || ''
				draftSections = { ...(project?.titleBlockSections ?? {}) }
				draftMembers = [...(project?.members ?? [])]
			}
			memberSearch = ''
		} else if (!open && initialized) {
			initialized = false
		}
	})

	let memberResults = $derived.by(() => {
		const q = memberSearch.trim().toLowerCase()
		if (!q) return []
		return allUsers
			.filter(u => !draftMembers.includes(u.id) &&
				u.email && u.email.includes('@ei') &&
				((u.displayName?.toLowerCase().includes(q)) || (u.email?.toLowerCase().includes(q))))
			.slice(0, 5)
	})

	let draftMemberUsers = $derived(
		draftMembers.map(id => allUsers.find(u => u.id === id)).filter(Boolean) as UserDoc[]
	)

	function canEditProject(p: Project | null): boolean {
		if (!p) return false
		const uid = session?.user?.uid
		if (!uid) return false
		if (role === 'admin' || role === 'manager') return true
		return true		// return p.ownerId === uid
	}

	function addMember(userId: string) {
		if (!draftMembers.includes(userId)) draftMembers = [...draftMembers, userId]
		memberSearch = ''
	}

	function removeMember(userId: string) {
		draftMembers = draftMembers.filter(id => id !== userId)
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
				client: draftClient.trim() || '',
				address: draftAddress.trim() || '',
				author: draftAuthor.trim() || '',
				logoUrl: draftLogoUrl.trim() || '',
				companyName: draftCompanyName.trim() || '',
				companyLogoUrl: draftCompanyLogoUrl.trim() || '',
				companyAddress: draftCompanyAddress.trim() || '',
				companyContact: draftCompanyContact.trim() || '',
				titleBlockSections: { ...draftSections },
				members: draftMembers,
				ownerId: session?.user?.uid,
				createdAt: now,
				updatedAt: now,
				deleted: false,
			})
			open = false
			onsaved?.(id)
		} else if (project?.id) {
			if (!canEditProject(project)) return
			await db.save('projects', {
				id: project.id,
				name,
				description: draftDescription.trim() || '',
				client: draftClient.trim() || '',
				address: draftAddress.trim() || '',
				author: draftAuthor.trim() || '',
				logoUrl: draftLogoUrl.trim() || '',
				companyName: draftCompanyName.trim() || '',
				companyLogoUrl: draftCompanyLogoUrl.trim() || '',
				companyAddress: draftCompanyAddress.trim() || '',
				companyContact: draftCompanyContact.trim() || '',
				titleBlockSections: { ...draftSections },
				members: draftMembers,
				updatedAt: now,
			})
			open = false
			onsaved?.(project.id)
		}
	}

	async function confirmArchive() {
		if (!project?.id || !canEditProject(project)) return
		await db.save('projects', {
			id: project.id,
			deleted: true,
			deletedAt: new Date(),
			deletedBy: session?.user?.uid || null,
			updatedAt: new Date(),
		})
		confirmOpen = false
		open = false
		onarchived?.(project.id)
	}
</script>

<Dialog bind:open title={mode === 'create' ? 'Create Project' : 'Project Settings'}>
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

		<!-- Title-block defaults (used in drawings) -->
		<div class="rounded border border-gray-200 bg-gray-50/60 p-2 space-y-2">
			<div class="text-[11px] font-medium uppercase tracking-wider text-gray-400">Drawing title block</div>
			<div class="grid grid-cols-2 gap-2">
				<div>
					<div class="text-xs text-gray-700">Client</div>
					<input class="w-full border rounded px-2 py-1 text-sm" bind:value={draftClient} placeholder="Client name" />
				</div>
				<div>
					<div class="text-xs text-gray-700">Default author</div>
					<input class="w-full border rounded px-2 py-1 text-sm" bind:value={draftAuthor} placeholder="Drawn by" />
				</div>
			</div>
			<div>
				<div class="text-xs text-gray-700">Address</div>
				<input class="w-full border rounded px-2 py-1 text-sm" bind:value={draftAddress} placeholder="Site / project address" />
			</div>
			<div>
				<div class="text-xs text-gray-700">Client logo</div>
				<ProjectLogoField bind:value={draftLogoUrl} projectId={project?.id ?? ''} />
			</div>

			<!-- Our company block -->
			<div class="rounded border border-gray-200 bg-white p-2 space-y-2">
				<div class="text-[11px] font-medium uppercase tracking-wider text-gray-400">Your company</div>
				<div class="grid grid-cols-2 gap-2">
					<div>
						<div class="text-xs text-gray-700">Company name</div>
						<input class="w-full border rounded px-2 py-1 text-sm" bind:value={draftCompanyName} placeholder="Your company" />
					</div>
					<div>
						<div class="text-xs text-gray-700">Contact</div>
						<input class="w-full border rounded px-2 py-1 text-sm" bind:value={draftCompanyContact} placeholder="Tel / email / web" />
					</div>
				</div>
				<div>
					<div class="text-xs text-gray-700">Company address</div>
					<input class="w-full border rounded px-2 py-1 text-sm" bind:value={draftCompanyAddress} placeholder="Company address" />
				</div>
				<div>
					<div class="text-xs text-gray-700">Company logo</div>
					<ProjectLogoField bind:value={draftCompanyLogoUrl} projectId={project?.id ?? ''} />
				</div>
			</div>

			<!-- Section include toggles -->
			<div>
				<div class="text-[11px] font-medium uppercase tracking-wider text-gray-400 mb-1">Include sections</div>
				<div class="grid grid-cols-2 gap-x-3 gap-y-1">
					{#each TB_SECTIONS as s (s.key)}
						<label class="flex items-center gap-1.5 text-xs text-gray-700">
							<input type="checkbox" checked={draftSections[s.key] !== false}
								onchange={(e) => draftSections = { ...draftSections, [s.key]: (e.currentTarget as HTMLInputElement).checked }} />
							{s.label}
						</label>
					{/each}
				</div>
			</div>
		</div>

		<!-- Members -->
		<div class="text-xs text-gray-700">Project Members</div>
		<div class="space-y-1">
			{#if draftMemberUsers.length > 0}
				<div class="flex flex-wrap gap-1">
					{#each draftMemberUsers as user (user.id)}
						<span class="inline-flex items-center gap-1 px-1.5 py-0.5 bg-blue-50 border border-blue-200 rounded text-xs text-blue-700">
							{user.displayName || user.email || user.id}
							<button class="text-blue-400 hover:text-red-500" onclick={() => removeMember(user.id)} title="Remove">
								<Icon name="close" size={10} />
							</button>
						</span>
					{/each}
				</div>
			{/if}
			<div class="relative">
				<input class="w-full border rounded px-2 py-1 text-sm" bind:value={memberSearch} placeholder="Search users by name or email..." />
				{#if memberResults.length > 0}
					<div class="absolute z-10 left-0 right-0 mt-0.5 bg-white border rounded shadow-lg max-h-40 overflow-y-auto">
						{#each memberResults as user (user.id)}
							<button class="w-full text-left px-2 py-1 text-xs hover:bg-blue-50 flex items-center gap-2"
								onclick={() => addMember(user.id)}>
								<span class="font-medium text-gray-700">{user.displayName || '(no name)'}</span>
								{#if user.email}<span class="text-gray-400">{user.email}</span>{/if}
							</button>
						{/each}
					</div>
				{/if}
			</div>
		</div>

		{#if mode === 'edit' && project && !canEditProject(project)}
			<div class="text-xs text-amber-700">You do not have permission to edit this project.</div>
		{/if}
		<div class="flex justify-between gap-2 pt-1">
			<div>
				{#if mode === 'edit' && project && canEditProject(project)}
					<Button variant="danger" onclick={() => confirmOpen = true}>Archive Project</Button>
				{/if}
			</div>
			<div class="flex gap-2">
				<Button variant="outline" onclick={() => open = false}>Cancel</Button>
				<Button variant="primary" onclick={saveProject} disabled={!draftName.trim() || (mode === 'create' && (!normalizeCode(draftClientCode) || !normalizeCode(draftProjectCode))) || (mode === 'edit' && project ? !canEditProject(project) : false)}>Save</Button>
			</div>
		</div>
	</div>
</Dialog>

<Dialog bind:open={confirmOpen} title="Archive Project?">
	<div class="space-y-2 mt-1 text-sm">
		<div>This will move <strong>{project?.name}</strong> to Archived.</div>
		<div class="text-xs text-gray-600">Project data is not permanently deleted and can be restored later.</div>
		<div class="flex justify-end gap-2 pt-1">
			<Button variant="outline" onclick={() => confirmOpen = false}>Cancel</Button>
			<Button variant="danger" onclick={confirmArchive}>Archive</Button>
		</div>
	</div>
</Dialog>
