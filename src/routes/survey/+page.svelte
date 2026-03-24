<script lang="ts">
	import { type Session, Spinner, Button } from '$lib'
	import { getContext, onMount } from 'svelte'
	import { pushState, replaceState } from '$app/navigation'
	import { page } from '$app/state'
	import { subscribeSurveys } from './survey.svelte'
	import type { Survey, SurveyPhoto, ViewState } from './types'
	import SurveyHome from './parts/SurveyHome.svelte'
	import SurveyDetail from './parts/SurveyDetail.svelte'
	import PhotoEditor from './parts/PhotoEditor.svelte'
	import PhotoView from './parts/PhotoView.svelte'

	const session = getContext<Session>('session')

	// Extract ?project= query param for project-scoped views
	let initialProjectId = $derived(page.url.searchParams.get('project') ?? '')

	let view: ViewState = $state('home')
	let surveys: Survey[] = $state([])
	let loading = $state(true)
	let currentSurvey: Survey | null = $state(null)
	let capturedBlob: Blob | null = $state(null)
	let capturedGeo: { latitude: number; longitude: number } | null = $state(null)
	let selectedPhoto: SurveyPhoto | null = $state(null)
	let pendingFloorplanId: string | null = $state(null)

	// --- History management using SvelteKit shallow routing ---
	let suppressPush = false

	function pushView(v: ViewState) {
		if (!suppressPush) {
			pushState('', { surveyView: v })
		}
		view = v
	}

	function handlePopState() {
		suppressPush = true
		const target = page.state.surveyView as ViewState | undefined
		if (target === 'photo' || target === 'editor') {
			goDetail()
		} else if (target === 'detail' && currentSurvey) {
			goDetail()
		} else {
			goHome()
		}
		suppressPush = false
	}

	onMount(() => {
		replaceState('', { surveyView: 'home' })
	})

	// --- Subscriptions ---
	$effect(() => {
		const user = session?.user
		if (!user) { loading = false; surveys = []; return }
		loading = true
		const unsub = subscribeSurveys(user.uid, (data) => {
			surveys = data
			if (currentSurvey) {
				const updated = data.find((s) => s.id === currentSurvey!.id)
				if (updated) currentSurvey = updated
			}
			loading = false
		})
		return () => unsub()
	})

	// --- Navigation ---
	function selectSurvey(survey: Survey) {
		currentSurvey = survey
		pushView('detail')
	}

	function handleCapture(file: File, geo: { latitude: number; longitude: number } | null) {
		capturedBlob = file
		capturedGeo = geo
		pushView('editor')
	}

	function handlePhotoSaved() {
		capturedBlob = null
		capturedGeo = null
		pushView('detail')
	}

	function handleSelectPhoto(photo: SurveyPhoto) {
		selectedPhoto = photo
		pushView('photo')
	}

	function handleOpenFloorplan(floorplanId: string) {
		selectedPhoto = null
		pendingFloorplanId = floorplanId
		pushView('detail')
	}

	function goHome() {
		currentSurvey = null
		selectedPhoto = null
		capturedBlob = null
		pushView('home')
	}

	function goDetail() {
		selectedPhoto = null
		capturedBlob = null
		pushView('detail')
	}
</script>

<svelte:window onpopstate={handlePopState} />

<svelte:head>
	<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
</svelte:head>

{#if view === 'home'}
	<SurveyHome
		{surveys}
		{loading}
		userId={session?.user?.uid ?? ''}
		userName={session?.user?.displayName ?? session?.user?.email ?? ''}
		onselect={selectSurvey}
		projectFilter={initialProjectId}
	/>
{:else if view === 'detail' && currentSurvey}
	<SurveyDetail
		survey={currentSurvey}
		onback={goHome}
		oncapture={handleCapture}
		onphoto={handleSelectPhoto}
		openFloorplanId={pendingFloorplanId}
		onopenedfloorplan={() => { pendingFloorplanId = null }}
	/>
{:else if view === 'editor' && capturedBlob && currentSurvey}
	<PhotoEditor
		surveyId={currentSurvey.id}
		blob={capturedBlob}
		geo={capturedGeo}
		onclose={goDetail}
		onsaved={handlePhotoSaved}
		onretake={goDetail}
	/>
{:else if view === 'photo' && selectedPhoto && currentSurvey}
	<PhotoView
		surveyId={currentSurvey.id}
		photo={selectedPhoto}
		onclose={goDetail}
		ondeleted={goDetail}
		onopenfloorplan={handleOpenFloorplan}
	/>
{/if}
