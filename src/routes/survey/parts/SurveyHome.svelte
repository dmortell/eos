<script lang="ts">
	import { Button, Dialog, Icon, Input, Search, Spinner } from '$lib'
	import { createSurvey, deleteSurvey } from '../survey.svelte'
	import type { Survey } from '../types'

	let {
		surveys,
		userId,
		userName,
		loading,
		onselect,
	}: {
		surveys: Survey[]
		userId: string
		userName: string
		loading: boolean
		onselect: (survey: Survey) => void
	} = $props()

	let searchQuery = $state('')
	let showCreate = $state(false)
	let newName = $state('')
	let newDate = $state(new Date().toISOString().slice(0, 10))
	let creating = $state(false)

	let filtered = $derived(
		searchQuery
			? surveys.filter((s) => s.name.toLowerCase().includes(searchQuery.toLowerCase()))
			: surveys
	)

	async function handleCreate() {
		if (!newName.trim()) return
		creating = true
		await createSurvey(userId, userName, newName.trim(), newDate)
		creating = false
		showCreate = false
		newName = ''
	}

	function fmtDate(d: string) {
		if (!d) return ''
		return new Date(d).toLocaleDateString('ja', { year: 'numeric', month: 'short', day: 'numeric' })
	}
</script>

<div class="mx-auto max-w-lg p-4">
	<!-- Header -->
	<div class="mb-4 flex items-center justify-between">
		<h1 class="text-lg font-semibold">Surveys</h1>
		<Button variant="primary" size="sm" icon="plus" onclick={() => (showCreate = true)}>New</Button>
	</div>

	<!-- Search -->
	{#if surveys.length > 3}
		<div class="mb-3">
			<Search bind:value={searchQuery} placeholder="Search surveys..." />
		</div>
	{/if}

	<!-- List -->
	{#if loading}
		<div class="flex justify-center py-12"><Spinner /></div>
	{:else if filtered.length === 0}
		<div class="flex flex-col items-center gap-2 py-16 text-gray-400">
			<Icon name="camera" size={40} class="opacity-40" />
			<p class="text-sm">{surveys.length ? 'No matches' : 'No surveys yet'}</p>
			{#if !surveys.length}
				<p class="text-xs">Create your first survey to get started</p>
			{/if}
		</div>
	{:else}
		<div class="space-y-2">
			{#each filtered as survey (survey.id)}
				<button
					type="button"
					class="flex w-full items-center gap-3 rounded-xl border border-gray-200 bg-white p-3 text-left transition-colors hover:border-blue-300 hover:bg-blue-50/50 active:bg-blue-50"
					onclick={() => onselect(survey)}
				>
					<!-- Cover thumbnail -->
					{#if survey.coverPhoto}
						<img src={survey.coverPhoto} alt="" class="h-14 w-14 shrink-0 rounded-lg object-cover" />
					{:else}
						<div class="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-gray-100">
							<Icon name="image" size={20} class="text-gray-300" />
						</div>
					{/if}
					<div class="min-w-0 flex-1">
						<p class="truncate text-sm font-medium">{survey.name}</p>
						<p class="text-xs text-gray-500">{fmtDate(survey.date)}</p>
						<p class="text-xs text-gray-400">{survey.photoCount ?? 0} photos</p>
					</div>
					<Icon name="chevronRight" size={16} class="shrink-0 text-gray-300" />
				</button>
			{/each}
		</div>
	{/if}
</div>

<!-- Create dialog -->
<Dialog title="New Survey" bind:open={showCreate}>
	<div class="space-y-3">
		<Input bind:value={newName} label="Survey name" placeholder="e.g. Building A - Floor 1" />
		<Input bind:value={newDate} label="Date" type="date" />
		<div class="flex justify-end gap-2 pt-2">
			<Button variant="outline" onclick={() => (showCreate = false)}>Cancel</Button>
			<Button variant="primary" onclick={handleCreate} loading={creating} disabled={!newName.trim()}>Create</Button>
		</div>
	</div>
</Dialog>
