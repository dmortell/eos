<script lang="ts">
	import { type Session, Spinner, Button } from '$lib'
	import { getContext } from 'svelte'
	import { subscribeSurveys } from './survey.svelte'
	import type { Survey, SurveyPhoto, ViewState } from './types'
	import SurveyHome from './parts/SurveyHome.svelte'
	import SurveyDetail from './parts/SurveyDetail.svelte'
	import Camera from './parts/Camera.svelte'
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
	let detailPhotos: SurveyPhoto[] = $state([])

	// Subscribe to surveys when user is logged in
	$effect(() => {
		const user = session?.user
		if (!user) { loading = false; surveys = []; return }
		loading = true
		const unsub = subscribeSurveys(user.uid, (data) => {
			surveys = data
			// Update currentSurvey reference if it exists
			if (currentSurvey) {
				const updated = data.find((s) => s.id === currentSurvey!.id)
				if (updated) currentSurvey = updated
			}
			loading = false
		})
		return () => unsub()
	})

	function selectSurvey(survey: Survey) {
		currentSurvey = survey
		view = 'detail'
	}

	function openCamera() {
		view = 'camera'
	}

	function handleCapture(blob: Blob, geo: { latitude: number; longitude: number } | null) {
		capturedBlob = blob
		capturedGeo = geo
		view = 'editor'
	}

	function handlePhotoSaved() {
		capturedBlob = null
		capturedGeo = null
		view = 'detail'
	}

	function handleSelectPhoto(photo: SurveyPhoto, allPhotos: SurveyPhoto[]) {
		selectedPhoto = photo
		detailPhotos = allPhotos
		view = 'photo'
	}

	function goHome() {
		currentSurvey = null
		view = 'home'
	}

	function goDetail() {
		selectedPhoto = null
		capturedBlob = null
		view = 'detail'
	}
</script>

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
		oncamera={openCamera}
		onphoto={handleSelectPhoto}
	/>
{:else if view === 'camera'}
	<Camera oncapture={handleCapture} onclose={goDetail} />
{:else if view === 'editor' && capturedBlob && currentSurvey}
	<PhotoEditor
		surveyId={currentSurvey.id}
		blob={capturedBlob}
		geo={capturedGeo}
		onclose={goDetail}
		onsaved={handlePhotoSaved}
		onretake={openCamera}
	/>
{:else if view === 'photo' && selectedPhoto && currentSurvey}
	<PhotoView
		surveyId={currentSurvey.id}
		photo={selectedPhoto}
		photos={detailPhotos}
		onclose={goDetail}
		ondeleted={goDetail}
	/>
{/if}
