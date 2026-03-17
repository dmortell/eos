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
</script>

<div class="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-black text-white">
	<Icon name="camera" size={48} class="opacity-50" />

	<!-- Take photo — opens native camera -->
	<label class="flex items-center gap-2 rounded-full bg-blue-600 px-6 py-3 text-base font-medium active:bg-blue-500">
		<Icon name="camera" size={20} />
		Take Photo
		<input type="file" accept="image/*" capture="environment" class="hidden" onchange={handleFile} />
	</label>

	<!-- Choose from gallery -->
	<label class="flex items-center gap-2 rounded-full bg-white/20 px-6 py-3 text-sm backdrop-blur active:bg-white/30">
		<Icon name="image" size={18} />
		Choose from Gallery
		<input type="file" accept="image/*" class="hidden" onchange={handleFile} />
	</label>

	<button
		type="button"
		class="mt-4 text-sm text-white/50 active:text-white/80"
		onclick={onclose}
	>
		Cancel
	</button>
</div>
