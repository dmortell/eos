<script lang="ts">
	import { page } from '$app/state'
	import { getContext } from 'svelte'
	import { Firestore, Titlebar, Spinner } from '$lib'
	import type { SheetDoc } from '../types'
	import type { TitleBlockProjectDefaults } from '../parts/TitleBlock.svelte'
	import SheetEditor from '../SheetEditor.svelte'

	let db = getContext('db') as Firestore
	let pid = $derived(page.params.pid)
	let sheetId = $derived(page.params.sheetId)

	let sheet = $state<SheetDoc | null>(null)
	let project = $state<TitleBlockProjectDefaults>({})
	let floors = $state<{ number: number }[]>([])
	let loading = $state(true)

	// Sheet doc
	$effect(() => {
		if (!pid || !sheetId) return
		loading = true
		const unsub = db.subscribeOne(`projects/${pid}/sheets`, sheetId, (data: any) => {
			// subscribeOne returns { id } for a missing doc; treat absence of real fields as "not found".
			sheet = data && (data.title !== undefined || data.paper !== undefined) ? (data as SheetDoc) : null
			loading = false
		})
		return () => { unsub?.() }
	})

	// Project defaults for the title block
	$effect(() => {
		if (!pid) return
		const unsub = db.subscribeOne('projects', pid, (data: any) => {
			project = {
				name: data?.name,
				author: data?.author,
				address: data?.address,
				logoUrl: data?.logoUrl,
				client: data?.client,
			}
			floors = Array.isArray(data?.floors) && data.floors.length ? data.floors : [{ number: 1 }]
		})
		return () => { unsub?.() }
	})
</script>

<!-- App shell: a viewport-tall flex column. The titlebar takes its natural height;
     everything below (SheetEditor → menubar / canvas / status bar) flexes to fill the rest. -->
<div class="flex h-[100dvh] flex-col overflow-hidden">
	<Titlebar title={sheet ? `Sheet — ${sheet.title}` : 'Sheet'} height={30} />
	{#if loading}
		<div class="flex flex-1 items-center justify-center">
			<Spinner>Loading sheet...</Spinner>
		</div>
	{:else if sheet}
		<SheetEditor {sheet} {project} {floors} {db} pid={pid ?? ''} />
	{:else}
		<div class="flex flex-1 items-center justify-center text-sm text-zinc-400">Sheet not found.</div>
	{/if}
</div>

<style>
	/* Full-height app shell: ensure the titlebar + editor fill the viewport and no more. */
	:global(.technical-drawing-text) {
		/* Most construction docs use all caps */
		/* text-transform: uppercase; */
		font-family: monospace, 'Helvetica Neue', Helvetica, 'Arial Narrow', Arial, sans-serif, Verdana , Futura;
		/* letter-spacing: 0.2px; */
	}
	/* <link rel="stylesheet" href="https://googleapis.com"> */
	.hand-drafted-notes {
		font-family: 'Architects Daughter', cursive;
	}
	.dimension-labels {
		font-family: 'Roboto Mono', Monaco, Consolas, monospace;
	}
	.wire-label {
		background-color: #ffffff !important;
		color: #000000 !important;
		position: absolute;
		padding: 1px 3px;
		/* Forces the PDF generator to render the white protective mask over lines */
		-webkit-print-color-adjust: exact;
		print-color-adjust: exact;
	}
	.equipment-schedule tr,
	.electrical-notes p {
		page-break-inside: avoid;
		break-inside: avoid;
	}
/* ensure text scales accurately to traditional architectural plotting sizes when printed to a standard 24"×36" (Arch D) or 36"×48" (Arch E) sheet, use absolute point (pt) or pixel (px) values rather than responsive viewport units (vw or vh) */
.drawing-title  { font-size: 18pt; font-weight: bold; } /* Main Titles */
.panel-headers  { font-size: 12pt; font-weight: bold; } /* Schedule Headers */
.circuit-labels { font-size: 8pt;  font-weight: normal; } /* Small Conduit/Wire Tags */

</style>
