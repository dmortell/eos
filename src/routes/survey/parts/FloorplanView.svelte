<script lang="ts">
	import { Icon, Spinner } from '$lib'
	import { subscribePhotos, updatePhoto } from '../survey.svelte'
	import type { SurveyPhoto, SurveyFloorplan } from '../types'
	import { onMount } from 'svelte'

	let {
		surveyId,
		floorplan,
		onclose,
		onphoto,
	}: {
		surveyId: string
		floorplan: SurveyFloorplan
		onclose: () => void
		onphoto: (photo: SurveyPhoto) => void
	} = $props()

	// --- State ---
	let containerEl: HTMLDivElement | undefined = $state()
	let imgEl: HTMLImageElement | undefined = $state()
	let vx = $state(0)
	let vy = $state(0)
	let zoom = $state(1)
	let imgW = $state(0)
	let imgH = $state(0)
	let loaded = $state(false)

	let photos: SurveyPhoto[] = $state([])
	let pinnedPhotos = $derived(photos.filter(p => p.floorplanId === floorplan.id && p.pinX != null && p.pinY != null))
	let unpinnedPhotos = $derived(photos.filter(p => !p.floorplanId || p.floorplanId !== floorplan.id))

	// Place mode state
	let placeMode = $state(false)
	let selectedPhotoId: string | null = $state(null)
	let showDrawer = $state(false)
	let tappedPin: SurveyPhoto | null = $state(null)

	// Subscribe to photos
	$effect(() => {
		const unsub = subscribePhotos(surveyId, (data) => { photos = data })
		return () => unsub()
	})

	// --- Image load ---
	function onImgLoad() {
		if (!imgEl) return
		imgW = imgEl.naturalWidth
		imgH = imgEl.naturalHeight
		loaded = true
		fitToView()
	}

	function fitToView() {
		if (!containerEl || !imgW || !imgH) return
		const rect = containerEl.getBoundingClientRect()
		const pad = 20
		const scaleX = (rect.width - pad) / imgW
		const scaleY = (rect.height - pad) / imgH
		zoom = Math.min(scaleX, scaleY, 4)
		vx = (rect.width - imgW * zoom) / 2
		vy = (rect.height - imgH * zoom) / 2
	}

	// --- Pan/Zoom ---
	let panning = false
	let panStartX = 0
	let panStartY = 0

	function onWheel(e: WheelEvent) {
		e.preventDefault()
		if (!containerEl) return
		if (e.ctrlKey || e.altKey || e.metaKey) {
			// Zoom
			const rect = containerEl.getBoundingClientRect()
			const mx = e.clientX - rect.left
			const my = e.clientY - rect.top
			const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15
			const newZoom = Math.min(10, Math.max(0.1, zoom * factor))
			const s = newZoom / zoom
			vx = mx - (mx - vx) * s
			vy = my - (my - vy) * s
			zoom = newZoom
		} else {
			vx -= e.deltaX
			vy -= e.deltaY
		}
	}

	// Touch pan/pinch
	let touches: Touch[] = []
	let lastTouchDist = 0
	let lastTouchMidX = 0
	let lastTouchMidY = 0

	function onTouchStart(e: TouchEvent) {
		if (e.touches.length === 1) {
			// Single finger pan
			panning = true
			panStartX = e.touches[0].clientX - vx
			panStartY = e.touches[0].clientY - vy
		} else if (e.touches.length === 2) {
			// Pinch zoom
			panning = false
			const t = e.touches
			lastTouchDist = Math.hypot(t[1].clientX - t[0].clientX, t[1].clientY - t[0].clientY)
			lastTouchMidX = (t[0].clientX + t[1].clientX) / 2
			lastTouchMidY = (t[0].clientY + t[1].clientY) / 2
		}
	}

	function onTouchMove(e: TouchEvent) {
		e.preventDefault()
		if (e.touches.length === 1 && panning) {
			vx = e.touches[0].clientX - panStartX
			vy = e.touches[0].clientY - panStartY
		} else if (e.touches.length === 2 && containerEl) {
			const t = e.touches
			const dist = Math.hypot(t[1].clientX - t[0].clientX, t[1].clientY - t[0].clientY)
			const midX = (t[0].clientX + t[1].clientX) / 2
			const midY = (t[0].clientY + t[1].clientY) / 2
			const rect = containerEl.getBoundingClientRect()
			const factor = dist / lastTouchDist
			const newZoom = Math.min(10, Math.max(0.1, zoom * factor))
			const s = newZoom / zoom
			const cx = midX - rect.left
			const cy = midY - rect.top
			vx = cx - (cx - vx) * s + (midX - lastTouchMidX)
			vy = cy - (cy - vy) * s + (midY - lastTouchMidY)
			zoom = newZoom
			lastTouchDist = dist
			lastTouchMidX = midX
			lastTouchMidY = midY
		}
	}

	function onTouchEnd() {
		panning = false
	}

	// Mouse pan (right/middle click)
	function onMouseDown(e: MouseEvent) {
		if (e.button === 1 || e.button === 2) {
			e.preventDefault()
			panning = true
			panStartX = e.clientX - vx
			panStartY = e.clientY - vy
			document.addEventListener('mousemove', onPanMove)
			document.addEventListener('mouseup', onPanUp)
		}
	}

	function onPanMove(e: MouseEvent) {
		if (panning) {
			vx = e.clientX - panStartX
			vy = e.clientY - panStartY
		}
	}

	function onPanUp() {
		panning = false
		document.removeEventListener('mousemove', onPanMove)
		document.removeEventListener('mouseup', onPanUp)
	}

	onMount(() => {
		if (!containerEl) return
		containerEl.addEventListener('wheel', onWheel, { passive: false })
		return () => {
			containerEl?.removeEventListener('wheel', onWheel)
		}
	})

	function onContextMenu(e: MouseEvent) { e.preventDefault() }

	// --- Click on floorplan to place pin ---
	function handleFloorplanClick(e: MouseEvent) {
		if (!placeMode || !selectedPhotoId || !containerEl) return
		const rect = containerEl.getBoundingClientRect()
		const x = (e.clientX - rect.left - vx) / zoom
		const y = (e.clientY - rect.top - vy) / zoom
		const pinX = x / imgW
		const pinY = y / imgH
		if (pinX < 0 || pinX > 1 || pinY < 0 || pinY > 1) return
		updatePhoto(surveyId, { id: selectedPhotoId, floorplanId: floorplan.id, pinX, pinY, direction: 0 })
		selectedPhotoId = null
		placeMode = false
		showDrawer = false
	}

	// --- Pin tap ---
	function handlePinClick(e: MouseEvent, photo: SurveyPhoto) {
		e.stopPropagation()
		tappedPin = photo
	}

	function closePinPopup() {
		tappedPin = null
	}

	function viewPinnedPhoto() {
		if (tappedPin) {
			onphoto(tappedPin)
		}
	}

	async function removePin() {
		if (!tappedPin) return
		await updatePhoto(surveyId, { id: tappedPin.id, floorplanId: '', pinX: undefined as any, pinY: undefined as any, direction: undefined as any })
		tappedPin = null
	}

	function openDrawer() {
		placeMode = true
		showDrawer = true
		tappedPin = null
	}

	function selectForPlacing(photoId: string) {
		selectedPhotoId = photoId
	}

	function cancelPlace() {
		placeMode = false
		selectedPhotoId = null
		showDrawer = false
	}
</script>

<div class="fixed inset-0 z-50 flex flex-col bg-gray-100">
	<!-- Header -->
	<div class="flex items-center gap-2 border-b bg-white px-3 py-2">
		<button type="button" class="flex h-10 w-10 items-center justify-center rounded-lg active:bg-gray-100" onclick={onclose}>
			<Icon name="arrowLeft" size={22} />
		</button>
		<div class="min-w-0 flex-1">
			<p class="truncate text-sm font-medium">{floorplan.name}</p>
			<p class="text-[11px] text-gray-500">{pinnedPhotos.length} pins · {unpinnedPhotos.length} unplaced</p>
		</div>
		<button type="button" class="flex h-10 items-center gap-1.5 rounded-lg bg-blue-600 px-3 text-sm font-medium text-white active:bg-blue-500" onclick={fitToView}>
			<Icon name="expand" size={14} />
			Fit
		</button>
		{#if !placeMode}
			<button type="button" class="flex h-10 items-center gap-1.5 rounded-lg border border-gray-300 px-3 text-sm font-medium active:bg-gray-100" onclick={openDrawer}>
				<Icon name="mapPin" size={14} />
				Place
			</button>
		{:else}
			<button type="button" class="flex h-10 items-center gap-1.5 rounded-lg border border-red-300 px-3 text-sm font-medium text-red-600 active:bg-red-50" onclick={cancelPlace}>
				<Icon name="close" size={14} />
				Cancel
			</button>
		{/if}
	</div>

	<!-- Floorplan canvas area -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		bind:this={containerEl}
		class="flex-1 cursor-grab overflow-hidden active:cursor-grabbing"
		oncontextmenu={onContextMenu}
		onmousedown={onMouseDown}
		onclick={handleFloorplanClick}
		ontouchstart={onTouchStart}
		ontouchmove={onTouchMove}
		ontouchend={onTouchEnd}
	>
		{#if !loaded}
			<div class="flex h-full items-center justify-center"><Spinner /></div>
		{/if}

		<div style:transform="translate({vx}px, {vy}px) scale({zoom})" style:transform-origin="0 0" class="relative">
			<img
				bind:this={imgEl}
				src={floorplan.url}
				alt={floorplan.name}
				onload={onImgLoad}
				class="pointer-events-none select-none"
				draggable="false"
			/>

			<!-- SVG overlay for pins -->
			{#if imgW && imgH}
				<svg class="pointer-events-none absolute left-0 top-0" width={imgW} height={imgH}>
					{#each pinnedPhotos as p (p.id)}
						{@const px = (p.pinX ?? 0) * imgW}
						{@const py = (p.pinY ?? 0) * imgH}
						{@const pinSize = Math.max(12, 18 / zoom)}
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<g
							class="pointer-events-auto cursor-pointer"
							transform="translate({px}, {py})"
							onclick={e => handlePinClick(e, p)}
						>
							<!-- Pin drop shadow -->
							<circle cx="0" cy="0" r={pinSize * 0.6} fill="rgba(0,0,0,0.2)" />
							<!-- Pin circle -->
							<circle cx="0" cy="{-pinSize * 0.3}" r={pinSize * 0.5} fill="#2563eb" stroke="white" stroke-width={Math.max(1, 2 / zoom)} />
							<!-- Direction arrow -->
							{#if p.direction != null}
								{@const angle = (p.direction - 90) * Math.PI / 180}
								{@const arrowLen = pinSize * 0.9}
								<line
									x1="0"
									y1="{-pinSize * 0.3}"
									x2="{Math.cos(angle) * arrowLen}"
									y2="{-pinSize * 0.3 + Math.sin(angle) * arrowLen}"
									stroke="#2563eb"
									stroke-width={Math.max(1.5, 2.5 / zoom)}
									stroke-linecap="round"
								/>
							{/if}
							<!-- Label -->
							<text
								x="0"
								y="{pinSize * 0.7}"
								text-anchor="middle"
								font-size="{Math.max(8, 11 / zoom)}"
								fill="#1e40af"
								font-weight="600"
							>{p.title?.slice(0, 12) || '?'}</text>
						</g>
					{/each}
				</svg>
			{/if}
		</div>
	</div>

	<!-- Pin popup -->
	{#if tappedPin}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="fixed inset-0 z-20" onclick={closePinPopup}></div>
		<div class="fixed bottom-0 left-0 right-0 z-30 rounded-t-2xl border-t bg-white p-4 shadow-lg safe-bottom">
			<div class="flex items-center gap-3">
				<img src={tappedPin.imageUrl} alt={tappedPin.title} class="h-16 w-16 shrink-0 rounded-lg object-cover" />
				<div class="min-w-0 flex-1">
					<p class="truncate text-sm font-medium">{tappedPin.title}</p>
					{#if tappedPin.description}
						<p class="truncate text-xs text-gray-500">{tappedPin.description}</p>
					{/if}
				</div>
			</div>
			<div class="mt-3 flex gap-2">
				<button type="button" class="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white active:bg-blue-500" onclick={viewPinnedPhoto}>View Photo</button>
				<button type="button" class="rounded-lg border border-red-300 px-4 py-2.5 text-sm font-medium text-red-600 active:bg-red-50" onclick={removePin}>
					<Icon name="trash" size={16} />
				</button>
				<button type="button" class="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium active:bg-gray-100" onclick={closePinPopup}>Close</button>
			</div>
		</div>
	{/if}

	<!-- Place mode drawer -->
	{#if showDrawer}
		<div class="fixed bottom-0 left-0 right-0 z-20 rounded-t-2xl border-t bg-white shadow-lg safe-bottom" style="max-height: 40vh">
			<div class="flex items-center justify-between px-4 pt-3 pb-2">
				<p class="text-sm font-medium">
					{#if selectedPhotoId}
						Tap floorplan to place pin
					{:else}
						Select a photo to place
					{/if}
				</p>
				<button type="button" class="text-xs text-gray-500 active:text-gray-700" onclick={cancelPlace}>Cancel</button>
			</div>
			<div class="flex gap-2 overflow-x-auto px-4 pb-4">
				{#each unpinnedPhotos as p (p.id)}
					<button
						type="button"
						class="shrink-0 rounded-lg border-2 p-1 transition-colors {selectedPhotoId === p.id ? 'border-blue-600 bg-blue-50' : 'border-transparent'}"
						onclick={() => selectForPlacing(p.id)}
					>
						<img src={p.imageUrl} alt={p.title} class="h-16 w-16 rounded object-cover" />
						<p class="mt-1 w-16 truncate text-center text-[10px]">{p.title || 'Untitled'}</p>
					</button>
				{/each}
				{#if unpinnedPhotos.length === 0}
					<p class="py-4 text-sm text-gray-400">All photos are placed on floorplans</p>
				{/if}
			</div>
		</div>
	{/if}

	<!-- Place mode indicator -->
	{#if placeMode && selectedPhotoId}
		<div class="pointer-events-none fixed left-1/2 top-16 z-30 -translate-x-1/2 rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-lg">
			Tap on the floorplan to place pin
		</div>
	{/if}
</div>

<style>
	.safe-bottom {
		padding-bottom: max(0.75rem, env(safe-area-inset-bottom));
	}
</style>
