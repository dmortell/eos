<script lang="ts">
	import { Dialog } from '$lib'
	import ProjectDetailsForm, { type DetailsPart } from './ProjectDetailsForm.svelte'

	export interface Project {
		id: string
		name: string
		clientCode?: string
		projectCode?: string
		description?: string
		client?: string
		address?: string
		/** The building this project is (User 2026-10-16: one project per building) — the title block's {BUILDING}. */
		buildingName?: string
		masterId?: string
		groupName?: string
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

	let {
		open = $bindable(false),
		mode = 'edit' as 'create' | 'edit',
		project = null as Project | null,
		onsaved,
		onarchived,
		lastCompany,
	}: {
		open?: boolean
		mode?: 'create' | 'edit'
		project?: Project | null
		onsaved?: (id: string) => void
		onarchived?: (id: string) => void
		/** A new project's "Your company" (name, logo, address, contact), from this user's last project (cad W10). */
		lastCompany?: { companyName?: string; companyLogoUrl?: string; companyAddress?: string; companyContact?: string }
	} = $props()

	// the same three parts as cad's Project settings shows (User 2026-10-16, option A): tabs down the left
	const PARTS: [DetailsPart, string][] = [['details', 'Details'], ['company', 'Company'], ['members', 'Members']]
	let part = $state<DetailsPart>('details')
	let dirty = $state(false), dirtyParts = $state<DetailsPart[]>([])
	$effect(() => { if (open) part = 'details' })
</script>

<Dialog bind:open wide title={mode === 'create' ? 'New project' : 'Project details'}>
	<!-- a fresh form each time it opens (its drafts start from the project) -->
	{#if open}
		<div class="flex gap-4 mt-1">
			<div class="flex flex-col gap-px w-28 shrink-0 border-r border-gray-200 pr-2" role="tablist" aria-orientation="vertical">
				{#each PARTS as [id, label] (id)}
					<button role="tab" aria-selected={part === id} class="text-left text-sm px-2 py-1 rounded {part === id ? 'bg-blue-100 text-blue-700 font-medium' : 'text-gray-500 hover:text-gray-800'}" onclick={() => (part = id)}>{label}{#if dirtyParts.includes(id)}<span class="text-amber-500 text-[9px] ml-1">●</span>{/if}</button>
				{/each}
			</div>
			<div class="flex-1 min-w-0">
				<ProjectDetailsForm {mode} {project} {part} {lastCompany} bind:dirty bind:dirtyParts
					onsaved={(id) => { open = false; onsaved?.(id) }} onarchived={(id) => { open = false; onarchived?.(id) }} oncancel={() => (open = false)} />
			</div>
		</div>
	{/if}
</Dialog>
