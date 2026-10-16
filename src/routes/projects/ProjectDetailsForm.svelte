<!-- A project's details as one form in three parts (User 2026-10-16, "Project settings vs details" option A):
     Details (name, codes, client, address, building, author, client logo, title block sections, Archive) · Company (your
     company block) · Members. One instance keeps its drafts while the parts are switched, so the Projects page's dialog
     and cad's Project settings (three tabs of its own, handed in by the cad route) show the same fields the same way.
     Nothing is written until Save; `dirty` says there are unsaved edits (the tab's ● in cad). `part` null = hidden
     (kept mounted, so its drafts survive a look at another tab). -->
<script lang="ts">
	import { getContext, untrack } from 'svelte'
	import { Firestore, Button, Icon, type Session } from '$lib'
	import ProjectLogoField from './ProjectLogoField.svelte'
	import { fullName } from '$lib/projectGroups'
	import type { Project } from './ProjectSettingsDialog.svelte'

	export type DetailsPart = 'details' | 'company' | 'members'

	interface UserDoc { id: string; uid?: string; displayName?: string; email?: string }

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
		mode = 'edit',
		project = null,
		part = 'details',
		dirty = $bindable(false),
		dirtyParts = $bindable([]),
		lastCompany,
		onsaved,
		onarchived,
		oncancel,
	}: {
		mode?: 'create' | 'edit'
		project?: Project | null
		part?: DetailsPart | null
		dirty?: boolean
		/** The parts with unsaved edits. */
		dirtyParts?: DetailsPart[]
		/** A new project's "Your company" (name, logo, address, contact), from this user's last project (cad W10). */
		lastCompany?: { companyName?: string; companyLogoUrl?: string; companyAddress?: string; companyContact?: string }
		onsaved?: (id: string) => void
		/** Given: Details shows Archive Project. */
		onarchived?: (id: string) => void
		/** Given: a Cancel button beside Save (the Projects page's dialog); cad's tabs have Discard instead. */
		oncancel?: () => void
	} = $props()

	let db = getContext('db') as Firestore
	let session = getContext('session') as Session

	let allUsers = $state<UserDoc[]>([])
	let role = $state('user')
	let confirmArchive = $state(false)
	let saving = $state(false)

	type Draft = {
		name: string; description: string; clientCode: string; projectCode: string; client: string; address: string; building: string
		author: string; logoUrl: string; companyName: string; companyLogoUrl: string; companyAddress: string; companyContact: string
		sections: Record<string, boolean>; members: string[]
	}
	let d = $state<Draft>(fromProject())
	let memberSearch = $state('')

	/** The fields as the project has them (or a new project's start). */
	function fromProject(): Draft {
		if (mode === 'create') return {
			name: '', description: '', clientCode: '', projectCode: '', client: '', address: '', building: '', author: '', logoUrl: '',
			// "Your company" as on this user's last project — not typed again for every project (cad W10, B50)
			companyName: lastCompany?.companyName ?? '', companyLogoUrl: lastCompany?.companyLogoUrl ?? '',
			companyAddress: lastCompany?.companyAddress ?? '', companyContact: lastCompany?.companyContact ?? '',
			sections: {}, members: session?.user?.uid ? [session.user.uid] : [],
		}
		const p = project
		return {
			// a building of a group shows its group's name here (read-only: renamed on the Projects page)
			name: (p?.masterId ? p.groupName : p?.name) || p?.name || '', description: p?.description || '',
			clientCode: p?.clientCode || '', projectCode: p?.projectCode || '', client: p?.client || '', address: p?.address || '',
			building: p?.buildingName || '', author: p?.author || '', logoUrl: p?.logoUrl || '', companyName: p?.companyName || '',
			companyLogoUrl: p?.companyLogoUrl || '', companyAddress: p?.companyAddress || '', companyContact: p?.companyContact || '',
			sections: { ...(p?.titleBlockSections ?? {}) }, members: [...(p?.members ?? [])],
		}
	}
	// another project (cad's route keeps one form for the open project): start again from it
	let shownId = untrack(() => project?.id)
	$effect(() => { const id = project?.id; untrack(() => { if (id !== shownId) { shownId = id; d = fromProject() } }) })

	// which parts have unsaved edits (the ● on just those tabs)
	const COMPANY: (keyof Draft)[] = ['companyName', 'companyLogoUrl', 'companyAddress', 'companyContact']
	const partOf = (k: keyof Draft): DetailsPart => k === 'members' ? 'members' : COMPANY.includes(k) ? 'company' : 'details'
	const norm = (k: keyof Draft, v: unknown) => JSON.stringify(k === 'members' ? [...(v as string[])].sort() : v)
	$effect(() => {
		const now = $state.snapshot(d) as Draft, was = fromProject()
		const parts = mode === 'create' ? [] : [...new Set((Object.keys(now) as (keyof Draft)[]).filter((k) => norm(k, now[k]) !== norm(k, was[k])).map(partOf))]
		untrack(() => { if (parts.join() !== dirtyParts.join()) dirtyParts = parts; if (dirty !== !!parts.length) dirty = !!parts.length })
	})

	$effect(() => {
		const unsubUsers = db.subscribeMany('users', data => { allUsers = data as unknown as UserDoc[] })
		return () => { unsubUsers?.() }
	})
	$effect(() => {
		const uid = session?.user?.uid
		if (!uid) { role = 'user'; return }
		const unsub = db.subscribeOne('users', uid, (data) => { role = typeof data?.role === 'string' ? data.role : 'user' })
		return () => { unsub?.() }
	})

	let memberResults = $derived.by(() => {
		const q = memberSearch.trim().toLowerCase()
		if (!q) return []
		return allUsers
			.filter(u => !d.members.includes(u.id) && u.email && u.email.includes('@ei') &&
				((u.displayName?.toLowerCase().includes(q)) || (u.email?.toLowerCase().includes(q))))
			.slice(0, 5)
	})
	let memberUsers = $derived(d.members.map(id => allUsers.find(u => u.id === id)).filter(Boolean) as UserDoc[])

	function canEdit(): boolean {
		if (mode === 'create') return true
		if (!project || !session?.user?.uid) return false
		if (role === 'admin' || role === 'manager') return true
		return true		// return project.ownerId === uid
	}
	function addMember(userId: string) { if (!d.members.includes(userId)) d.members = [...d.members, userId]; memberSearch = '' }
	function removeMember(userId: string) { d.members = d.members.filter(id => id !== userId) }

	function normalizeCode(input: string): string {
		return input.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
	}
	async function generateUniqueProjectId(clientCode: string, projectCode: string): Promise<string> {
		const base = `${clientCode}-${projectCode}`
		for (let i = 0; i < 8; i += 1) {
			const candidate = `${base}-${Math.floor(Math.random() * 9000) + 1000}`
			if (!(await db.getOne('projects', candidate))) return candidate
		}
		return `${base}-${Date.now().toString().slice(-6)}`
	}

	const canSave = $derived(!!d.name.trim() && canEdit() && (mode !== 'create' || (!!normalizeCode(d.clientCode) && !!normalizeCode(d.projectCode))))
	const fields = () => ({
		description: d.description.trim(), client: d.client.trim(), address: d.address.trim(), buildingName: d.building.trim(),
		author: d.author.trim(), logoUrl: d.logoUrl.trim(), companyName: d.companyName.trim(), companyLogoUrl: d.companyLogoUrl.trim(),
		companyAddress: d.companyAddress.trim(), companyContact: d.companyContact.trim(), titleBlockSections: { ...d.sections }, members: [...d.members],
	})

	/** Write the drafts (the Save button; cad's "Save the details?" on closing). */
	export async function save(): Promise<void> {
		if (!canSave || saving) return
		saving = true
		try {
			const name = d.name.trim(), now = new Date()
			if (mode === 'create') {
				const clientCode = normalizeCode(d.clientCode), projectCode = normalizeCode(d.projectCode)
				const id = await generateUniqueProjectId(clientCode, projectCode)
				await db.save('projects', { id, name, clientCode, projectCode, ...fields(), ownerId: session?.user?.uid, createdAt: now, updatedAt: now, deleted: false })
				onsaved?.(id)
			} else if (project?.id) {
				// a building of a group: its title follows the group and its building name (User 2026-10-16)
				await db.save('projects', { id: project.id, name: project.masterId ? fullName(project.groupName ?? name, d.building) : name, ...fields(), updatedAt: now })
				onsaved?.(project.id)
			}
		} finally { saving = false }
	}
	/** Back to what the project has (Discard). */
	export function discard(): void { d = fromProject() }

	async function archive() {
		if (!project?.id || !canEdit()) return
		await db.save('projects', { id: project.id, deleted: true, deletedAt: new Date(), deletedBy: session?.user?.uid || null, updatedAt: new Date() })
		confirmArchive = false
		onarchived?.(project.id)
	}
</script>

{#if part}
<div class="pdf space-y-2">
	{#if part === 'details'}
		{#if mode === 'create'}
			<div class="grid grid-cols-2 gap-2">
				<label><span>Client code</span><input bind:value={d.clientCode} placeholder="ex: acme" maxlength="12" /></label>
				<label><span>Project code</span><input bind:value={d.projectCode} placeholder="ex: hqfit" maxlength="12" /></label>
			</div>
			<div class="note">Project id: {normalizeCode(d.clientCode) || 'client'}-{normalizeCode(d.projectCode) || 'project'}-####</div>
		{/if}
		<label><span>Name</span><input bind:value={d.name} placeholder="Project name" disabled={!!project?.masterId && mode === 'edit'} title={project?.masterId ? 'A building of a project group: rename the group on the Projects page (its title is “Group – Building”)' : undefined} /></label>
		<label><span>Description</span><textarea bind:value={d.description} rows="3" placeholder="Optional description"></textarea></label>
		<div class="head">Title block</div>
		<div class="grid grid-cols-2 gap-2">
			<label><span>Client</span><input bind:value={d.client} placeholder="Client name" /></label>
			<label><span>Default author</span><input bind:value={d.author} placeholder="Drawn by" /></label>
		</div>
		<label><span>Address</span><input bind:value={d.address} placeholder="Site / project address" /></label>
		<label><span>Building</span><input bind:value={d.building} placeholder="e.g. building1 — the title block's {'{'}BUILDING{'}'}" /></label>
		<div><span class="lbl">Client logo</span><ProjectLogoField bind:value={d.logoUrl} projectId={project?.id ?? ''} /></div>
		<div class="head">Include in the title block</div>
		<div class="grid grid-cols-2 gap-x-3 gap-y-1">
			{#each TB_SECTIONS as s (s.key)}
				<label class="check"><input type="checkbox" checked={d.sections[s.key] !== false}
					onchange={(e) => d.sections = { ...d.sections, [s.key]: e.currentTarget.checked }} />{s.label}</label>
			{/each}
		</div>
	{:else if part === 'company'}
		<div class="note">Your company's block on the title block. A new project starts with the one from your last project.</div>
		<div class="grid grid-cols-2 gap-2">
			<label><span>Company name</span><input bind:value={d.companyName} placeholder="Your company" /></label>
			<label><span>Contact</span><input bind:value={d.companyContact} placeholder="Tel / email / web" /></label>
		</div>
		<label><span>Company address</span><input bind:value={d.companyAddress} placeholder="Company address" /></label>
		<div><span class="lbl">Company logo</span><ProjectLogoField bind:value={d.companyLogoUrl} projectId={project?.id ?? ''} /></div>
	{:else}
		<div class="note">Members see this project in their Projects list.</div>
		{#if memberUsers.length}
			<div class="flex flex-wrap gap-1">
				{#each memberUsers as user (user.id)}
					<span class="chip">{user.displayName || user.email || user.id}
						<button title="Remove" onclick={() => removeMember(user.id)}><Icon name="close" size={10} /></button></span>
				{/each}
			</div>
		{/if}
		<div class="relative">
			<input class="w-full" bind:value={memberSearch} placeholder="Add a member: search by name or email…" />
			{#if memberResults.length}
				<div class="results">
					{#each memberResults as user (user.id)}
						<button onclick={() => addMember(user.id)}><b>{user.displayName || '(no name)'}</b>{#if user.email} <i>{user.email}</i>{/if}</button>
					{/each}
				</div>
			{/if}
		</div>
	{/if}

	{#if mode === 'edit' && project && !canEdit()}<div class="text-xs text-amber-700">You do not have permission to edit this project.</div>{/if}
	<div class="foot">
		{#if part === 'details' && onarchived && mode === 'edit' && project && canEdit()}
			<Button variant="danger" onclick={() => (confirmArchive = true)}>Archive project…</Button>
		{/if}
		<span class="grow">{#if dirty}<span class="unsaved">● Unsaved changes</span>{/if}</span>
		{#if oncancel}<Button variant="outline" onclick={oncancel}>Cancel</Button>
		{:else if dirty}<Button variant="outline" onclick={discard}>Discard</Button>{/if}
		<Button variant="primary" onclick={save} disabled={!canSave || saving || (mode === 'edit' && !dirty)}>{mode === 'create' ? 'Create' : 'Save'}</Button>
	</div>
	{#if confirmArchive}
		<div class="archive">
			<p>Move <strong>{project?.name}</strong> to Archived? Its data is kept and can be restored later.</p>
			<div class="flex justify-end gap-2"><Button variant="outline" onclick={() => (confirmArchive = false)}>Cancel</Button><Button variant="danger" onclick={archive}>Archive</Button></div>
		</div>
	{/if}
</div>
{/if}

<style>
	.pdf { font-size: 13px; }
	.pdf label:not(.check) { display: block; }
	.pdf label > span, .lbl { display: block; font-size: 12px; color: #52525b; margin-bottom: 2px; }
	.pdf input:not([type='checkbox']), .pdf textarea { width: 100%; border: 1px solid #d4d4d8; border-radius: 4px; padding: 4px 8px; font-size: 13px; background: white; color: #18181b; }
	.pdf input:disabled { background: #f4f4f5; color: #71717a; }
	.check { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #3f3f46; }
	.head { margin-top: 10px; font-size: 11px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.05em; color: #a1a1aa; }
	.note { font-size: 11px; color: #71717a; }
	.chip { display: inline-flex; align-items: center; gap: 4px; padding: 1px 6px; border: 1px solid #bfdbfe; background: #eff6ff; border-radius: 4px; font-size: 12px; color: #1d4ed8; }
	.chip button { color: #60a5fa; }
	.chip button:hover { color: #ef4444; }
	.results { position: absolute; z-index: 10; left: 0; right: 0; margin-top: 2px; background: white; border: 1px solid #d4d4d8; border-radius: 4px; box-shadow: 0 6px 16px rgb(0 0 0 / 0.12); max-height: 10rem; overflow-y: auto; }
	.results button { display: flex; gap: 8px; width: 100%; text-align: left; padding: 4px 8px; font-size: 12px; }
	.results button:hover { background: #eff6ff; }
	.results i { color: #a1a1aa; font-style: normal; }
	.foot { display: flex; align-items: center; gap: 8px; padding-top: 12px; }
	.foot .grow { flex: 1; }
	.unsaved { color: #d97706; font-size: 12px; }
	.archive { margin-top: 8px; padding: 10px; border: 1px solid #fca5a5; border-radius: 6px; background: #fef2f2; font-size: 12px; }
	.archive p { margin: 0 0 8px; }
</style>
