<script lang="ts">
	import { Icon } from '$lib'
	import type { PrintSettings, PaperSize, PaperOrientation } from './types'
	import { SCALE_OPTIONS } from './types'

	let { settings = $bindable(), alignMode = $bindable(false), onprint, onsetview }: {
		settings: PrintSettings
		alignMode?: boolean
		onprint?: () => void
		onsetview?: () => void
	} = $props()

	let menuOpen = $state(false)

	function togglePaper() {
		settings = { ...settings, showPaper: !settings.showPaper }
		if (!settings.showPaper) alignMode = false
	}

	function setPaperSize(size: PaperSize) {
		settings = { ...settings, paperSize: size }
	}

	function setOrientation(o: PaperOrientation) {
		settings = { ...settings, orientation: o }
	}

	function setScale(value: number) {
		settings = { ...settings, scale: value }
	}

</script>

<svelte:window onclick={() => { menuOpen = false }} />

<div class="flex items-center gap-1">
	<div class="relative">
		<button
			class="flex items-center gap-1 px-2 py-1 rounded text-[11px] transition-colors
				{settings.showPaper ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:bg-gray-100'}"
			onclick={(e) => { e.stopPropagation(); if (!settings.showPaper) { settings = { ...settings, showPaper: true }; menuOpen = true } else { menuOpen = !menuOpen } }}>
			<Icon name="print" size={12} /> Preview
		</button>
		{#if menuOpen}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<div class="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-lg border border-gray-200 py-2 px-3 z-50 w-52"
				onclick={(e) => e.stopPropagation()}>

				<!-- Show/hide paper -->
				<label class="flex items-center gap-2 text-[11px] text-gray-600 mb-2 cursor-pointer">
					<input type="checkbox" checked={settings.showPaper}
						onchange={() => togglePaper()}
						class="rounded text-blue-600" />
					Show paper
				</label>

				{#if settings.showPaper}
					<!-- Paper size -->
					<div class="text-[10px] text-gray-400 mb-1">Paper size</div>
					<div class="flex gap-1 mb-2">
						{#each ['A3', 'A4'] as size}
							<button
								class="flex-1 px-2 py-0.5 rounded text-[11px] transition-colors
									{settings.paperSize === size ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:bg-gray-100 border border-gray-200'}"
								onclick={() => setPaperSize(size as PaperSize)}>
								{size}
							</button>
						{/each}
					</div>

					<!-- Orientation -->
					<div class="text-[10px] text-gray-400 mb-1">Orientation</div>
					<div class="flex gap-1 mb-2">
						<button
							class="flex-1 px-2 py-0.5 rounded text-[11px] transition-colors
								{settings.orientation === 'landscape' ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:bg-gray-100 border border-gray-200'}"
							onclick={() => setOrientation('landscape')}>
							Landscape
						</button>
						<button
							class="flex-1 px-2 py-0.5 rounded text-[11px] transition-colors
								{settings.orientation === 'portrait' ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:bg-gray-100 border border-gray-200'}"
							onclick={() => setOrientation('portrait')}>
							Portrait
						</button>
					</div>

					<!-- Scale -->
					<div class="text-[10px] text-gray-400 mb-1">Scale</div>
					<div class="flex gap-1 mb-2 flex-wrap">
						{#each SCALE_OPTIONS as opt}
							<button
								class="px-2 py-0.5 rounded text-[11px] transition-colors
									{settings.scale === opt.value ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:bg-gray-100 border border-gray-200'}"
								onclick={() => setScale(opt.value)}>
								{opt.label}
							</button>
						{/each}
					</div>

					<!-- Margins -->
					<div class="text-[10px] text-gray-400 mb-1">Margins (mm)</div>
					<input type="number" min="0" max="30" step="5"
						value={settings.margins}
						oninput={(e) => { settings = { ...settings, margins: parseInt((e.target as HTMLInputElement).value) || 0 } }}
						class="w-full px-2 py-0.5 rounded border border-gray-200 text-[11px] text-gray-600 mb-2" />

					<div class="border-t border-gray-100 pt-2 mt-1 space-y-1">
						<button
							class="w-full flex items-center justify-center gap-1 px-2 py-1 rounded text-[11px] text-gray-600 hover:bg-gray-100 border border-gray-200 transition-colors"
							onclick={() => onsetview?.()}>
							<Icon name="crosshair" size={12} /> Center Paper
						</button>
						<div class="flex gap-1">
							<button
								class="flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded text-[11px] bg-blue-600 text-white hover:bg-blue-700 transition-colors"
								onclick={() => onprint?.()}>
								<Icon name="print" size={12} /> Print
							</button>
							<button
								class="px-2 py-1 rounded text-[11px] text-gray-500 hover:bg-gray-100 border border-gray-200 transition-colors"
								onclick={() => { settings = { ...settings, showPaper: false }; alignMode = false; menuOpen = false }}>
								Hide
							</button>
						</div>
					</div>
				{/if}
			</div>
		{/if}
	</div>

	<!-- Align mode toggle — shown inline in toolbar when paper is visible -->
	{#if settings.showPaper}
		<button
			class="flex items-center gap-1 px-2 py-1 rounded text-[11px] transition-colors
				{alignMode ? 'bg-amber-100 text-amber-700' : 'text-gray-500 hover:bg-gray-100'}"
			onclick={() => { alignMode = !alignMode }}
			title={alignMode ? 'Pan mode: drawing moves under fixed paper. Click to return to normal pan.' : 'Click to align drawing on paper (paper stays fixed while you pan)'}>
			<Icon name="move" size={12} /> {alignMode ? 'Aligning' : 'Align'}
		</button>
	{/if}
</div>
