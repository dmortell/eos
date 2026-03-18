<script lang="ts">
	import { Button, Icon, Spinner } from '$lib'
	import PhotoGrid from './PhotoGrid.svelte'
	import FloorplanTab from './FloorplanTab.svelte'
	import FloorplanView from './FloorplanView.svelte'
	import ShareDialog from './ShareDialog.svelte'
	import SurveyDialog from './SurveyDialog.svelte'
	import { deleteSurvey, updateSurvey, subscribePhotos, subscribeProjects, subscribeFloorplans } from '../survey.svelte'
	import { exportPdf, exportZip } from '../export'
	import type { Survey, SurveyPhoto, SurveyFloorplan } from '../types'

	let {
		survey,
		onback,
		oncapture,
		onphoto,
	}: {
		survey: Survey
		onback: () => void
		oncapture: (file: File, geo: { latitude: number; longitude: number } | null) => void
		onphoto: (photo: SurveyPhoto) => void
	} = $props()

	let fileInput: HTMLInputElement | undefined = $state()
	let geoResult: { latitude: number; longitude: number } | null = null

	// Pre-fetch geo
	if (typeof navigator !== 'undefined' && navigator.geolocation) {
		navigator.geolocation.getCurrentPosition(
			(pos) => { geoResult = { latitude: pos.coords.latitude, longitude: pos.coords.longitude } },
			() => {},
			{ enableHighAccuracy: true, timeout: 5000 }
		)
	}

	function handleFile(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0]
		if (!file) return
		oncapture(file, geoResult)
		if (fileInput) fileInput.value = ''
	}

	let photos: SurveyPhoto[] = $state([])
	let loading = $state(true)
	let showShare = $state(false)
	let showMenu = $state(false)
	let showEdit = $state(false)
	let editName = $state(survey.name)
	let editDate = $state(survey.date)
	let editProjectId = $state(survey.projectId ?? '')
	let tab: 'photos' | 'floorplans' = $state('photos')
	let activeFloorplan: SurveyFloorplan | null = $state(null)

	$effect(() => {
		loading = true
		const unsub = subscribePhotos(survey.id, (data) => {
			photos = data
			loading = false
		})
		return () => unsub()
	})

	async function handleDelete() {
		showMenu = false
		await deleteSurvey(survey.id)
		onback()
	}

	// Project lookup
	let projects: Array<{ id: string; name: string }> = $state([])
	$effect(() => {
		const unsub = subscribeProjects((data) => { projects = data })
		return () => unsub()
	})
	let projectMap = $derived(new Map(projects.map(p => [p.id, p.name])))

	async function handleEditSave() {
		if (!editName.trim()) return
		const projName = editProjectId ? (projectMap.get(editProjectId) ?? '') : ''
		await updateSurvey({ id: survey.id, name: editName.trim(), date: editDate, projectId: editProjectId || '', projectName: projName })
		showEdit = false
	}

	function openEditDialog() {
		editName = survey.name
		editDate = survey.date
		editProjectId = survey.projectId ?? ''
		showMenu = false
		showEdit = true
	}

	function fmtDate(d: string) {
		if (!d) return ''
		return new Date(d).toLocaleDateString('en', { year: 'numeric', month: 'short', day: 'numeric' })
	}
</script>

<div class="mx-auto flex h-dvh max-w-lg flex-col">
	<!-- Header -->
	<div class="flex items-center gap-2 border-b px-3 py-2">
		<button type="button" class="flex h-10 w-10 items-center justify-center rounded-lg active:bg-gray-100" onclick={onback}>
			<Icon name="arrowLeft" size={22} />
		</button>
		<div class="min-w-0 flex-1">
			<p class="truncate text-sm font-medium">{survey.name}</p>
			<p class="text-[11px] text-gray-500">
				{fmtDate(survey.date)} · {photos.length} photos
				{#if survey.projectName}
					<span class="ml-1 inline-flex items-center gap-0.5 rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
						<Icon name="folder" size={9} />{survey.projectName}
					</span>
				{/if}
			</p>
		</div>
		<button type="button" class="flex h-10 w-10 items-center justify-center rounded-lg active:bg-gray-100" onclick={() => (showShare = true)} title="Share">
			<Icon name="share" size={18} />
		</button>
		<div class="relative">
			<button type="button" class="flex h-10 w-10 items-center justify-center rounded-lg active:bg-gray-100" onclick={() => (showMenu = !showMenu)}>
				<Icon name="ellipsisVertical" size={18} />
			</button>
			{#if showMenu}
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div class="fixed inset-0 z-10" onclick={() => (showMenu = false)}></div>
				<div class="absolute right-0 top-full z-20 mt-1 w-48 rounded-lg border bg-white py-1 shadow-lg">
					<!-- <Button type="button" icon="edit" class="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm active:bg-gray-100" onclick={openEditDialog}> -->
					<Button variant="ghost" size="lg" icon="edit" class="w-full justify-start" onclick={openEditDialog}>
						<!-- <Icon name="edit" size={16} /> -->
						Edit Survey
					</Button>
					<hr class="mb-2"/>
					<Button variant="ghost" size="lg" icon="trash" onclick={handleDelete} confirm={{ text: 'Delete survey?', confirmLabel: 'Delete', cancelLabel: 'Cancel' }} class="w-full justify-start text-red-600">
						Delete Survey
					</Button>
				</div>
			{/if}
		</div>
	</div>

	<!-- Tab bar -->
	<div class="flex border-b">
		<button
			type="button"
			class="flex flex-1 items-center justify-center gap-1.5 py-2.5 text-sm font-medium transition-colors {tab === 'photos' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 active:text-gray-700'}"
			onclick={() => (tab = 'photos')}
		>
			<Icon name="image" size={16} />
			Photos
		</button>
		<button
			type="button"
			class="flex flex-1 items-center justify-center gap-1.5 py-2.5 text-sm font-medium transition-colors {tab === 'floorplans' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 active:text-gray-700'}"
			onclick={() => (tab = 'floorplans')}
		>
			<Icon name="fileText" size={16} />
			Floorplans
		</button>
	</div>

	<!-- Tab content -->
	{#if tab === 'photos'}
		<div class="flex-1 overflow-y-auto p-2">
			{#if loading}
				<div class="flex justify-center py-12"><Spinner /></div>
			{:else}
				<PhotoGrid {photos} onselect={onphoto} />
			{/if}
		</div>

		<!-- Hidden file input for native camera -->
		<input bind:this={fileInput} type="file" accept="image/*" capture="environment" class="hidden" onchange={handleFile} />

		<!-- FAB — opens native camera directly -->
		<label
			class="fixed bottom-6 right-6 z-10 flex h-14 w-14 cursor-pointer items-center justify-center rounded-full bg-blue-600 text-white shadow-lg transition-transform hover:bg-blue-500 active:scale-90"
			style="bottom: max(1.5rem, env(safe-area-inset-bottom, 1.5rem))"
		>
			<Icon name="camera" size={24} />
			<input type="file" accept="image/*" capture="environment" class="hidden" onchange={handleFile} />
		</label>
	{:else}
		<FloorplanTab surveyId={survey.id} onselect={(plan) => { activeFloorplan = plan }} />
	{/if}
</div>

{#if activeFloorplan}
	<FloorplanView
		surveyId={survey.id}
		floorplan={activeFloorplan}
		onclose={() => { activeFloorplan = null }}
		onphoto={onphoto}
	/>
{/if}

<SurveyDialog title="Edit Survey" bind:open={showEdit} bind:name={editName} bind:date={editDate} bind:projectId={editProjectId} onsave={handleEditSave} />
<ShareDialog {survey} bind:open={showShare} />
