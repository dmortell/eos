<script lang="ts">
	import { Icon, Spinner } from '$lib'
	import { subscribePhotos, updatePhoto } from '../survey.svelte'
	import { PdfState } from '../../projects/[pid]/uploads/parts/PdfState.svelte.ts'
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

	// PDF rendering — convert PDF page to an image URL
	let isPdf = $derived(floorplan.name?.toLowerCase().endsWith('.pdf') || floorplan.url?.includes('.pdf'))
	let resolvedUrl = $state(floorplan.url)
	let pdfState: PdfState | null = null

	$effect(() => {
		if (!isPdf) return
		let cancelled = false
		const pdf = new PdfState()
		pdfState = pdf
		pdf.load(floorplan.url).then(async () => {
			if (cancelled) return
			const { objectUrl, width, height } = await pdf.renderToObjectUrl(1, 2)
			if (cancelled) { URL.revokeObjectURL(objectUrl); return }
			resolvedUrl = objectUrl
			imgW = width
			imgH = height
			loaded = true
			fitToView()
		}).catch(() => {})
		return () => {
			cancelled = true
			pdf.destroy()
			if (resolvedUrl !== floorplan.url) URL.revokeObjectURL(resolvedUrl)
		}
	})

	let photos: SurveyPhoto[] = $state([])
	let pinnedPhotos = $derived(photos.filter(p => p.floorplanId === floorplan.id && p.pinX != null && p.pinY != null))
	let unpinnedPhotos = $derived(photos.filter(p => !p.floorplanId || p.floorplanId !== floorplan.id))

	// Place mode state
	let placeMode = $state(false)
	let selectedPhotoId: string | null = $state(null)
	let showDrawer = $state(false)
	let tappedPin: SurveyPhoto | null = $state(null)

	// Drag pin state
	let draggingPin: SurveyPhoto | null = null
	let dragStartX = 0
	let dragStartY = 0
	let dragMoved = false

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

	// --- Pin tap / drag ---
	function handlePinMouseDown(e: MouseEvent, photo: SurveyPhoto) {
		if (e.button !== 0) return
		e.stopPropagation()
		draggingPin = photo
		dragStartX = e.clientX
		dragStartY = e.clientY
		dragMoved = false
		document.addEventListener('mousemove', onPinDragMove)
		document.addEventListener('mouseup', onPinDragEnd)
	}

	function handlePinTouchStart(e: TouchEvent, photo: SurveyPhoto) {
		if (e.touches.length !== 1) return
		e.stopPropagation()
		draggingPin = photo
		dragStartX = e.touches[0].clientX
		dragStartY = e.touches[0].clientY
		dragMoved = false
		document.addEventListener('touchmove', onPinTouchMove, { passive: false })
		document.addEventListener('touchend', onPinTouchEnd)
	}

	function onPinDragMove(e: MouseEvent) {
		if (!draggingPin) return
		const dx = e.clientX - dragStartX
		const dy = e.clientY - dragStartY
		if (!dragMoved && Math.abs(dx) + Math.abs(dy) < 5) return
		dragMoved = true
		movePinTo(e.clientX, e.clientY)
	}

	function onPinTouchMove(e: TouchEvent) {
		if (!draggingPin || e.touches.length !== 1) return
		e.preventDefault()
		const dx = e.touches[0].clientX - dragStartX
		const dy = e.touches[0].clientY - dragStartY
		if (!dragMoved && Math.abs(dx) + Math.abs(dy) < 8) return
		dragMoved = true
		movePinTo(e.touches[0].clientX, e.touches[0].clientY)
	}

	function movePinTo(clientX: number, clientY: number) {
		if (!draggingPin || !containerEl) return
		const rect = containerEl.getBoundingClientRect()
		const x = (clientX - rect.left - vx) / zoom
		const y = (clientY - rect.top - vy) / zoom
		const pinX = Math.max(0, Math.min(1, x / imgW))
		const pinY = Math.max(0, Math.min(1, y / imgH))
		updatePhoto(surveyId, { id: draggingPin.id, pinX, pinY })
	}

	function onPinDragEnd() {
		if (draggingPin && !dragMoved) {
			tappedPin = draggingPin
		}
		draggingPin = null
		document.removeEventListener('mousemove', onPinDragMove)
		document.removeEventListener('mouseup', onPinDragEnd)
	}

	function onPinTouchEnd() {
		if (draggingPin && !dragMoved) {
			tappedPin = draggingPin
		}
		draggingPin = null
		document.removeEventListener('touchmove', onPinTouchMove)
		document.removeEventListener('touchend', onPinTouchEnd)
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

	// --- Direction rotation ---
	let rotatingDirection = $state(false)
	let rotateStartAngle = 0
	let rotateStartDir = 0

	function startRotate(e: MouseEvent | TouchEvent) {
		if (!tappedPin) return
		e.preventDefault()
		rotatingDirection = true
		const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
		const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
		const dial = (e.currentTarget as HTMLElement).getBoundingClientRect()
		const cx = dial.left + dial.width / 2
		const cy = dial.top + dial.height / 2
		rotateStartAngle = Math.atan2(clientY - cy, clientX - cx) * 180 / Math.PI
		rotateStartDir = tappedPin.direction ?? 0
		document.addEventListener('mousemove', onRotateMove)
		document.addEventListener('mouseup', onRotateEnd)
		document.addEventListener('touchmove', onRotateMove, { passive: false })
		document.addEventListener('touchend', onRotateEnd)
	}

	function onRotateMove(e: MouseEvent | TouchEvent) {
		if (!rotatingDirection || !tappedPin) return
		if ('preventDefault' in e) e.preventDefault()
		const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
		const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
		const dial = document.getElementById('direction-dial')
		if (!dial) return
		const rect = dial.getBoundingClientRect()
		const cx = rect.left + rect.width / 2
		const cy = rect.top + rect.height / 2
		const angle = Math.atan2(clientY - cy, clientX - cx) * 180 / Math.PI
		const delta = angle - rotateStartAngle
		let newDir = (rotateStartDir + delta) % 360
		if (newDir < 0) newDir += 360
		updatePhoto(surveyId, { id: tappedPin.id, direction: Math.round(newDir) })
	}

	function onRotateEnd() {
		rotatingDirection = false
		document.removeEventListener('mousemove', onRotateMove)
		document.removeEventListener('mouseup', onRotateEnd)
		document.removeEventListener('touchmove', onRotateMove)
		document.removeEventListener('touchend', onRotateEnd)
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
	<!-- svelte-ignore a11y_click_events_have_key_events -->
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
				src={resolvedUrl}
				alt={floorplan.name}
				onload={isPdf ? undefined : onImgLoad}
				class="pointer-events-none select-none"
				draggable="false"
			/>

			<!-- SVG overlay for pins -->
			{#if imgW && imgH}
				<svg class="pointer-events-none absolute left-0 top-0" width={imgW} height={imgH}>
					{#each pinnedPhotos as p, pIdx (p.id)}
						{@const px = (p.pinX ?? 0) * imgW}
						{@const py = (p.pinY ?? 0) * imgH}
						{@const pinSize = Math.max(12, 18 / zoom)}
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<g
							class="pointer-events-auto cursor-grab"
							transform="translate({px}, {py})"
							onmousedown={e => handlePinMouseDown(e, p)}
							ontouchstart={e => handlePinTouchStart(e, p)}
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
							<!-- Number inside pin -->
							<text
								x="0"
								y="{-pinSize * 0.3}"
								text-anchor="middle"
								dominant-baseline="central"
								font-size="{Math.max(7, 10 / zoom)}"
								fill="white"
								font-weight="700"
								style="user-select: none"
							>{photos.indexOf(p) + 1}</text>
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
					<p class="truncate text-sm font-medium"><span class="mr-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-[11px] font-bold text-white">{photos.indexOf(tappedPin) + 1}</span>{tappedPin.title}</p>
					{#if tappedPin.description}
						<p class="truncate text-xs text-gray-500">{tappedPin.description}</p>
					{/if}
					<p class="mt-0.5 text-[11px] text-gray-400">Drag pin on floorplan to reposition</p>
				</div>
			</div>

			<!-- Direction dial -->
			<div class="mt-3 flex items-center gap-3">
				<span class="text-xs font-medium text-gray-600">Direction</span>
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					id="direction-dial"
					class="relative h-12 w-12 shrink-0 cursor-grab rounded-full border-2 border-gray-200 bg-gray-50 active:cursor-grabbing"
					onmousedown={startRotate}
					ontouchstart={startRotate}
				>
					{#if true}
						{@const rad = ((tappedPin.direction ?? 0) - 90) * Math.PI / 180}
						<div class="absolute left-1/2 top-1/2 h-0.5 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gray-400"></div>
						<div
							class="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-600 shadow"
							style="left: {50 + Math.cos(rad) * 38}%; top: {50 + Math.sin(rad) * 38}%"
						></div>
						<svg class="absolute inset-0" viewBox="0 0 48 48">
							<line
								x1="24" y1="24"
								x2={24 + Math.cos(rad) * 18}
								y2={24 + Math.sin(rad) * 18}
								stroke="#2563eb" stroke-width="2" stroke-linecap="round"
							/>
						</svg>
					{/if}
				</div>
				<span class="text-xs tabular-nums text-gray-500">{Math.round(tappedPin.direction ?? 0)}°</span>
			</div>

			<div class="mt-3 flex gap-2">
				<button type="button" class="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white active:bg-blue-500" onclick={viewPinnedPhoto}>View Photo</button>
				<button type="button" class="flex items-center gap-1.5 rounded-lg border border-red-300 px-4 py-2.5 text-sm font-medium text-red-600 active:bg-red-50" onclick={removePin}>
					<Icon name="trash" size={14} />
					Remove Pin
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
						Select a photo below, then tap the floorplan
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
