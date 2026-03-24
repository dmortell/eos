<script lang="ts">
	import { Icon } from '$lib'
	import type { SurveyPhoto } from '../types'

	let {
		surveyName,
		surveyDate,
		photos,
	}: {
		surveyName: string
		surveyDate: string
		photos: SurveyPhoto[]
	} = $props()

	function fmtDate(d: string | Date | unknown) {
		if (!d) return ''
		const date = typeof d === 'string' ? new Date(d) : d instanceof Date ? d : null
		if (!date || isNaN(date.getTime())) return ''
		return date.toLocaleDateString('en', { year: 'numeric', month: 'short', day: 'numeric' })
	}

	function fmtTime(d: string | Date | unknown) {
		if (!d) return ''
		const date = typeof d === 'string' ? new Date(d) : d instanceof Date ? d : null
		if (!date || isNaN(date.getTime())) return ''
		return date.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })
	}

	function handlePrint() {
		window.print()
	}
</script>

<!-- Running header/footer — position:fixed repeats on every printed page -->
<div class="print-header">
	<span>{surveyName}</span>
	{#if surveyDate}
		<span>{fmtDate(surveyDate)}</span>
	{/if}
</div>
<div class="print-footer"></div>

<!-- Print button (hidden when printing) -->
<div class="flex items-center justify-end gap-2 px-4 py-2 print:hidden">
	<button
		type="button"
		class="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white active:bg-blue-700"
		onclick={handlePrint}
	>
		<Icon name="print" size={16} />
		Print Album
	</button>
</div>

<!-- Album cover (first page only, hidden in running header) -->
<div class="album-cover mb-4 px-4 print:mb-2 print:pt-8">
	<h1 class="text-xl font-bold print:text-2xl">{surveyName}</h1>
	{#if surveyDate}
		<p class="text-sm text-gray-500">{fmtDate(surveyDate)}</p>
	{/if}
	<p class="mt-1 text-xs text-gray-400">{photos.length} photos</p>
</div>

<!-- Photo grid -->
<div class="album-grid px-4">
	{#each photos as photo}
		<div class="album-item">
			<img src={photo.imageUrl} alt={photo.title || 'Photo'} class="album-img" />
			<div class="album-caption">
				{#if photo.title}
					<p class="font-medium">{photo.title}</p>
				{/if}
				{#if photo.capturedAt}
					<p class="text-gray-500">{fmtDate(photo.capturedAt)} {fmtTime(photo.capturedAt)}</p>
				{/if}
				{#if photo.description}
					<p class="text-gray-600">{photo.description}</p>
				{/if}
			</div>
		</div>
	{/each}
</div>

<style>
	/* ---- Screen ---- */
	.print-header, .print-footer {
		display: none;
	}

	.album-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 1rem;
	}

	@media (min-width: 1024px) {
		.album-grid {
			grid-template-columns: repeat(3, 1fr);
		}
	}

	@media (min-width: 1280px) {
		.album-grid {
			grid-template-columns: repeat(4, 1fr);
		}
	}

	.album-item {
		break-inside: avoid;
	}

	.album-img {
		width: 100%;
		aspect-ratio: 4 / 3;
		object-fit: cover;
		border-radius: 0.375rem;
	}

	.album-caption {
		padding: 0.25rem 0;
		font-size: 0.75rem;
		line-height: 1.2;
	}

	/* ---- Print ---- */
	@page {
		margin: 15mm 10mm 15mm 10mm;
	}

	@media print {
		/* Running header: fixed = repeats on every page */
		.print-header {
			display: flex;
			justify-content: space-between;
			position: fixed;
			top: 0;
			left: 0;
			right: 0;
			font-size: 8pt;
			color: #888;
			border-bottom: 0.5pt solid #ddd;
			padding-bottom: 2pt;
		}

		/* Running footer with page counter */
		.print-footer {
			display: block;
			position: fixed;
			bottom: 0;
			left: 0;
			right: 0;
			text-align: center;
			font-size: 8pt;
			color: #888;
			border-top: 0.5pt solid #ddd;
			padding-top: 2pt;
			counter-increment: page-counter;
		}
		.print-footer::after {
			content: counter(page) " / " counter(pages);
		}

		.album-grid {
			gap: 0.5rem;
			/* make room for running header/footer */
			margin-top: 4mm;
			margin-bottom: 4mm;
		}

		.album-img {
			border-radius: 0;
		}

		.album-caption {
			font-size: 8pt;
		}

		.album-item {
			break-inside: avoid;
			page-break-inside: avoid;
		}
	}

	/* Landscape: 3 columns */
	@media print and (orientation: landscape) {
		.album-grid {
			grid-template-columns: repeat(3, 1fr);
		}
	}

	/* Portrait: 2 columns */
	@media print and (orientation: portrait) {
		.album-grid {
			grid-template-columns: repeat(2, 1fr);
		}
	}
</style>
