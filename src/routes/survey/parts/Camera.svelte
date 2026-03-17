<script lang="ts">
	import { Icon } from '$lib'

	let {
		oncapture,
		onclose,
	}: {
		oncapture: (blob: Blob, geo: { latitude: number; longitude: number } | null) => void
		onclose: () => void
	} = $props()

	let fileInput: HTMLInputElement | undefined = $state()
	let geoResult: { latitude: number; longitude: number } | null = null

	// Pre-fetch geo so it's ready when photo is taken
	if (typeof navigator !== 'undefined' && navigator.geolocation) {
		navigator.geolocation.getCurrentPosition(
			(pos) => { geoResult = { latitude: pos.coords.latitude, longitude: pos.coords.longitude } },
			() => {},
			{ enableHighAccuracy: true, timeout: 5000 }
		)
	}

	function openCamera() {
		fileInput?.click()
	}

	function handleFile(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0]
		if (!file) return
		oncapture(file, geoResult)
	}

	// Auto-open the native camera picker on mount
	$effect(() => {
		if (fileInput) fileInput.click()
	})
</script>

<!-- Hidden file input — capture="environment" opens native camera on mobile -->
<input
	bind:this={fileInput}
	type="file"
	accept="image/*"
	capture="environment"
	class="hidden"
	onchange={handleFile}
/>

<!-- Fallback UI shown briefly while native picker opens, or if user cancels -->
<div class="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-black text-white">
	<Icon name="camera" size={48} class="opacity-50" />
	<p class="text-sm text-white/70">Opening camera...</p>

	<div class="flex gap-4">
		<button
			type="button"
			class="flex items-center gap-2 rounded-lg bg-white/20 px-5 py-3 text-sm backdrop-blur active:bg-white/30"
			onclick={openCamera}
		>
			<Icon name="camera" size={18} />
			Take Photo
		</button>
		<button
			type="button"
			class="flex items-center gap-2 rounded-lg bg-white/20 px-5 py-3 text-sm backdrop-blur active:bg-white/30"
			onclick={onclose}
		>
			Cancel
		</button>
	</div>
</div>
