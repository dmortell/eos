<script lang="ts">
	import { Icon } from '$lib'
	import { onMount } from 'svelte'

	let {
		onscanned,
		onclose,
	}: {
		onscanned: (value: string) => void
		onclose: () => void
	} = $props()

	let readerEl: HTMLDivElement | undefined = $state()
	let scanner: any = null
	let manualEntry = $state(false)
	let manualValue = $state('')
	let errorMsg = $state('')

	onMount(() => {
		startScanner()
		return () => { stopScanner() }
	})

	async function startScanner() {
		if (!readerEl) return
		try {
			const { Html5Qrcode } = await import('html5-qrcode')
			scanner = new Html5Qrcode(readerEl.id)
			await scanner.start(
				{ facingMode: 'environment' },
				{ fps: 10, qrbox: { width: 250, height: 250 } },
				(decoded: string) => {
					if (navigator.vibrate) navigator.vibrate(100)
					stopScanner()
					onscanned(decoded)
				},
				() => {} // ignore scan failures
			)
		} catch (e: any) {
			errorMsg = e?.message || 'Camera not available'
			manualEntry = true
		}
	}

	async function stopScanner() {
		try {
			if (scanner) {
				await scanner.stop()
				scanner.clear()
			}
		} catch {}
		scanner = null
	}

	function handleManualSubmit() {
		if (manualValue.trim()) {
			onscanned(manualValue.trim())
		}
	}
</script>

<div class="fixed inset-0 z-50 flex flex-col bg-black">
	<!-- Header -->
	<div class="flex items-center gap-2 px-3 py-2 text-white">
		<button type="button" class="flex h-10 w-10 items-center justify-center rounded-lg active:bg-white/10" onclick={onclose}>
			<Icon name="arrowLeft" size={22} />
		</button>
		<span class="flex-1 text-sm font-medium">Scan Barcode / QR Code</span>
		<button type="button" class="flex h-10 items-center gap-1 rounded-lg px-3 text-sm active:bg-white/10" onclick={() => (manualEntry = !manualEntry)}>
			<Icon name="edit" size={14} />
			{manualEntry ? 'Scan' : 'Type'}
		</button>
	</div>

	{#if manualEntry}
		<div class="flex flex-1 flex-col items-center justify-center gap-4 px-6">
			<p class="text-sm text-white/70">Enter barcode value manually</p>
			<input
				type="text"
				class="w-full rounded-lg border border-white/20 bg-white/10 px-4 py-3 text-base text-white placeholder:text-white/40"
				placeholder="Barcode or serial number..."
				bind:value={manualValue}
				autofocus
			/>
			<button
				type="button"
				class="w-full rounded-lg bg-blue-600 px-4 py-3 text-base font-medium text-white active:bg-blue-500 disabled:opacity-50"
				disabled={!manualValue.trim()}
				onclick={handleManualSubmit}
			>Use Value</button>
		</div>
	{:else}
		<!-- Scanner area -->
		<div class="flex flex-1 items-center justify-center">
			<div class="relative">
				<div id="barcode-reader" bind:this={readerEl} class="overflow-hidden rounded-xl"></div>
				{#if errorMsg}
					<p class="mt-4 text-center text-sm text-red-400">{errorMsg}</p>
				{/if}
			</div>
		</div>

		<!-- Guide text -->
		<div class="px-4 pb-6 text-center safe-bottom">
			<p class="text-sm text-white/60">Point camera at a barcode or QR code</p>
		</div>
	{/if}
</div>

<style>
	.safe-bottom {
		padding-bottom: max(1.5rem, env(safe-area-inset-bottom));
	}
	:global(#barcode-reader video) {
		border-radius: 0.75rem;
	}
	:global(#barcode-reader img[alt="Info icon"]) {
		display: none;
	}
</style>
