<script lang="ts">
	import { Button, Icon, Search, Spinner } from '$lib'
	import SurveyDialog from './SurveyDialog.svelte'
	import { createSurvey, subscribeProjects } from '../survey.svelte'
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
	let newProjectId = $state('')
	let creating = $state(false)

	// Project lookup for names
	let projects: Array<{ id: string; name: string }> = $state([])
	$effect(() => {
		const unsub = subscribeProjects((data) => { projects = data })
		return () => unsub()
	})
	let projectMap = $derived(new Map(projects.map(p => [p.id, p.name])))

	let filtered = $derived(
		searchQuery
			? surveys.filter((s) => s.name.toLowerCase().includes(searchQuery.toLowerCase()))
			: surveys
	)

	async function handleCreate() {
		if (!newName.trim()) return
		creating = true
		const projName = newProjectId ? (projectMap.get(newProjectId) ?? '') : undefined
		await createSurvey(userId, userName, newName.trim(), newDate, newProjectId || undefined, projName)
		creating = false
		showCreate = false
		newName = ''
		newProjectId = ''
	}

	function fmtDate(d: string) {
		if (!d) return ''
		return new Date(d).toLocaleDateString('en', { year: 'numeric', month: 'short', day: 'numeric' })
	}
</script>

<div class="mx-auto max-w-lg p-4">
	<!-- Header -->
	<div class="mb-4 flex items-center justify-between">
		<h1 class="text-lg font-semibold">Surveys</h1>
		<Button variant="primary" size="lg" icon="plus" onclick={() => (showCreate = true)}>New Photo Survey</Button>
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
				<button type="button" onclick={() => onselect(survey)}
					class="flex w-full items-center gap-3 rounded-xl border border-gray-200 bg-white p-3 text-left transition-colors hover:border-blue-300 hover:bg-blue-50/50 active:bg-blue-50"
				>
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
						<div class="flex items-center gap-2">
							<span class="text-xs text-gray-400">{survey.photoCount ?? 0} photos</span>
							{#if survey.projectName}
								<span class="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700">
									<Icon name="folder" size={10} />
									{survey.projectName}
								</span>
							{/if}
						</div>
					</div>
					<Icon name="chevronRight" size={16} class="shrink-0 text-gray-300" />
				</button>
			{/each}
		</div>
	{/if}
</div>

<SurveyDialog title="New Survey" bind:open={showCreate} bind:name={newName} bind:date={newDate} bind:projectId={newProjectId} saving={creating} onsave={handleCreate} />
