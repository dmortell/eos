<script lang="ts">
	import { onMount } from 'svelte'
	import { Icon } from '$lib'

	let {
		oncapture,
		onclose,
	}: {
		oncapture: (blob: Blob, geo: { latitude: number; longitude: number } | null) => void
		onclose: () => void
	} = $props()

	let videoEl: HTMLVideoElement | undefined = $state()
	let flash = $state(false)
	let error = $state('')

	// Non-reactive — no $state so they don't trigger effect loops
	let stream: MediaStream | null = null
	let currentFacing: 'environment' | 'user' = 'environment'
	let geoPromise: Promise<{ latitude: number; longitude: number } | null> | null = null

	onMount(() => {
		startCamera()
		geoPromise = getGeo()
		return () => stopCamera()
	})

	async function getGeo() {
		if (!navigator.geolocation) return null
		return new Promise<{ latitude: number; longitude: number } | null>((resolve) => {
			navigator.geolocation.getCurrentPosition(
				(pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
				() => resolve(null),
				{ enableHighAccuracy: true, timeout: 5000 }
			)
		})
	}

	async function startCamera() {
		stopCamera()
		error = ''
		try {
			stream = await navigator.mediaDevices.getUserMedia({
				video: { facingMode: currentFacing, width: { ideal: 1920 }, height: { ideal: 1080 } },
				audio: false,
			})
			if (videoEl) {
				videoEl.srcObject = stream
				await videoEl.play().catch(() => {})
			}
		} catch (e: any) {
			if (e.name === 'NotAllowedError') error = 'Camera permission denied. Please allow camera access in your browser settings.'
			else error = 'Could not access camera: ' + (e.message || e.name)
		}
	}

	function stopCamera() {
		stream?.getTracks().forEach((t) => t.stop())
		stream = null
	}

	async function capture() {
		if (!videoEl || !stream) return
		const canvas = document.createElement('canvas')
		canvas.width = videoEl.videoWidth
		canvas.height = videoEl.videoHeight
		const ctx = canvas.getContext('2d')!
		ctx.drawImage(videoEl, 0, 0)

		// Flash effect
		flash = true
		setTimeout(() => (flash = false), 200)

		// Vibrate if supported
		navigator.vibrate?.(50)

		canvas.toBlob(
			async (blob) => {
				if (!blob) return
				const geo = await (geoPromise ?? getGeo())
				oncapture(blob, geo)
			},
			'image/jpeg',
			0.85
		)
	}

	function switchCamera() {
		currentFacing = currentFacing === 'environment' ? 'user' : 'environment'
		startCamera()
	}

	function handleFileInput(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0]
		if (!file) return
		geoPromise?.then((geo) => oncapture(file, geo))
	}
</script>

<div class="fixed inset-0 z-50 flex flex-col bg-black">
	<!-- Flash overlay -->
	{#if flash}
		<div class="absolute inset-0 z-10 bg-white opacity-80 transition-opacity duration-200"></div>
	{/if}

	<!-- Video -->
	{#if error}
		<div class="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center text-white">
			<Icon name="camera" size={48} class="opacity-50" />
			<p class="text-sm">{error}</p>
			<label class="cursor-pointer rounded-lg bg-white/20 px-4 py-2 text-sm backdrop-blur">
				Choose from gallery
				<input type="file" accept="image/*" capture="environment" class="hidden" onchange={handleFileInput} />
			</label>
		</div>
	{:else}
		<!-- svelte-ignore a11y_media_has_caption -->
		<video bind:this={videoEl} autoplay playsinline muted class="flex-1 object-cover"></video>
	{/if}

	<!-- Controls -->
	<div class="safe-bottom flex items-center justify-between px-6 py-4">
		<!-- Close -->
		<button type="button" class="flex h-12 w-12 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur" onclick={onclose}>
			<Icon name="close" size={24} />
		</button>

		<!-- Capture -->
		<button type="button" class="flex h-[72px] w-[72px] items-center justify-center rounded-full border-4 border-white bg-white/30 transition-transform active:scale-90" onclick={capture} disabled={!!error}>
			<div class="h-14 w-14 rounded-full bg-white"></div>
		</button>

		<!-- Switch camera -->
		<button type="button" class="flex h-12 w-12 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur" onclick={switchCamera}>
			<Icon name="switchCamera" size={22} />
		</button>
	</div>
</div>

<style>
	.safe-bottom {
		padding-bottom: max(1rem, env(safe-area-inset-bottom));
	}
</style>
