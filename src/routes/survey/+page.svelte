<script lang="ts">
	import { type Session, Spinner, Button } from '$lib'
	import { getContext, onMount } from 'svelte'
	import { subscribeSurveys } from './survey.svelte'
	import type { Survey, SurveyPhoto, ViewState } from './types'
	import SurveyHome from './parts/SurveyHome.svelte'
	import SurveyDetail from './parts/SurveyDetail.svelte'
	import PhotoEditor from './parts/PhotoEditor.svelte'
	import PhotoView from './parts/PhotoView.svelte'

	const session = getContext<Session>('session')

	let view: ViewState = $state('home')
	let surveys: Survey[] = $state([])
	let loading = $state(true)
	let currentSurvey: Survey | null = $state(null)
	let capturedBlob: Blob | null = $state(null)
	let capturedGeo: { latitude: number; longitude: number } | null = $state(null)
	let selectedPhoto: SurveyPhoto | null = $state(null)

	// --- History management ---
	let suppressPush = false

	function pushView(v: ViewState) {
		if (!suppressPush) {
			history.pushState({ view: v }, '')
		}
		view = v
	}

	function handlePopState(e: PopStateEvent) {
		suppressPush = true
		const target = e.state?.view as ViewState | undefined
		if (target === 'photo' || target === 'editor') {
			// Can't restore these views without their data, go to detail
			goDetail()
		} else if (target === 'detail' && currentSurvey) {
			goDetail()
		} else {
			goHome()
		}
		suppressPush = false
	}

	onMount(() => {
		// Replace initial entry so we have state on it
		history.replaceState({ view: 'home' }, '')
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
	/>
{:else if view === 'detail' && currentSurvey}
	<SurveyDetail
		survey={currentSurvey}
		onback={goHome}
		oncapture={handleCapture}
		onphoto={handleSelectPhoto}
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
	/>
{/if}
