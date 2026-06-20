<script lang="ts">
	import { onMount, getContext } from 'svelte'
	import { page } from '$app/state'
	import { Firestore, Titlebar } from '$lib'
	import { Sheet } from './parts/sheet.svelte'
	import { PAPER } from './parts/types'
	import Sidebar from './parts/Sidebar.svelte'
	import PaperView from './parts/PaperView.svelte'
	import MaximizedView from './parts/MaximizedView.svelte'
	import Titleblock from './parts/Titleblock.svelte'
	import Menubar from './parts/Menubar.svelte'
	import InsertToolbar from './parts/InsertToolbar.svelte'
	import Panels from './parts/Panels.svelte'
	import StatusBar from './parts/StatusBar.svelte'
	import { connectFirestore, createSheet, deleteSheet } from './parts/persist.svelte'

	const sheet = new Sheet()
	const blockW = 50 // titleblock width

	// Project name for the titlebar.
	const db = getContext('db') as Firestore
	let projectName = $state('')
	$effect(() => {
		const pid = page.params.pid
		if (!pid) return
		const unsub = db.subscribeOne('projects', pid, (data: any) => { if (data?.name) projectName = data.name })
		return () => unsub?.()
	})

	// Connect models/views to Firestore (shared models + per-sheet views).
	onMount(() => {
		sheet.zoomToFit() // fit the sheet to the viewport on load (it starts small otherwise)
		const pid = page.params.pid
		if (!pid) return
		const dispose = connectFirestore(sheet, db, pid)
		return dispose
	})
</script>

<svelte:window onkeydown={sheet.onKeyDown} />

<div class="flex h-screen flex-col">
	<Titlebar title="{projectName} — Drawing Sheet" height={30} />
	<Menubar {sheet} />
	<InsertToolbar {sheet} />

	<!-- Sheet tabs: pick / rename / add named sheets (views per sheet, models shared) -->
	<div class="a-chrome flex items-center gap-2 border-b px-3 py-1 text-sm">
		<span class="text-xs text-gray-500">Sheet</span>
		<select class="rounded border px-2 py-0.5" value={sheet.currentSheetId} onchange={(e) => (sheet.currentSheetId = e.currentTarget.value)}>
			{#each sheet.sheetList as s (s.id)}
				<option value={s.id}>{s.name}</option>
			{/each}
		</select>
		<input class="w-40 rounded border px-2 py-0.5" placeholder="Sheet name" bind:value={sheet.sheetName} />
		<button class="rounded border px-2 py-0.5 hover:bg-gray-100" onclick={() => createSheet(sheet, db, page.params.pid!)}>＋ New sheet</button>
		{#if sheet.sheetList.length > 1}
			<button class="rounded border border-red-300 px-2 py-0.5 text-red-600 hover:bg-red-50" onclick={() => deleteSheet(sheet, db, page.params.pid!)}>Delete sheet</button>
		{/if}
	</div>

	<div class="flex min-h-0 flex-1">
		<Sidebar {sheet} />

		<!-- Canvas -->
		<div
			bind:this={sheet.viewport}
			role="application"
			class="relative min-w-0 flex-1 select-none overflow-hidden bg-gray-200 print:overflow-visible print:bg-white"
			onpointerdown={sheet.onCanvasPointerDown}
			ondblclick={sheet.onCanvasDblClick}
			onwheel={sheet.onWheel}
			oncontextmenu={(e) => e.preventDefault()}
		>
			<Panels {sheet} />

			<!-- rubber-band multi-select box (screen px from paper-mm) -->
			{#if sheet.marquee}
				{@const m = sheet.marquee}
				<div class="marquee"
					style="left:{sheet.tx + Math.min(m.x0, m.x1) * sheet.zoom}px; top:{sheet.ty + Math.min(m.y0, m.y1) * sheet.zoom}px; width:{Math.abs(m.x1 - m.x0) * sheet.zoom}px; height:{Math.abs(m.y1 - m.y0) * sheet.zoom}px;"
				></div>
			{/if}

			{#if sheet.maxView}
				<MaximizedView {sheet} />
			{:else}
				<!-- Paper -->
				<div
					class="paper absolute origin-top-left bg-white shadow-lg print:shadow-none"
					style="left:0; top:0; width:{PAPER.w}px; height:{PAPER.h}px; transform: translate({sheet.tx}px,{sheet.ty}px) scale({sheet.zoom});"
				>
					<svg class="absolute inset-0 block" width="100%" height="100%" viewBox="0 0 {PAPER.w} {PAPER.h}">
						{#each sheet.views as v (v.id)}
							<PaperView {sheet} view={v} />
						{/each}

						<!-- Titleblock -->
						<Titleblock width={blockW} />
					</svg>
				</div>
			{/if}

		</div>
	</div>

	<StatusBar {sheet} />
</div>

<style>
	/* Kill the browser focus outline on focusable SVG hit targets (views/objects). */
	:global(svg :focus),
	:global(svg :focus-visible) { outline: none; }

	/* Rubber-band multi-select box. */
	.marquee {
		position: absolute;
		z-index: 10;
		border: 1px dashed #2563eb;
		background: rgba(37, 99, 235, 0.08);
		pointer-events: none;
	}

	@media print {
		/* Print only the paper, at true A3 landscape size, no transform. */
		@page { size: A3 landscape; margin: 0; }
		:global(html, body) { background: #fff; }
		/* Hide all app chrome (menubar, insert toolbar, status bar) + any open menu portal. */
		:global(.a-chrome),
		:global([data-slot='menubar-content']) { display: none !important; }
		.paper {
			position: static !important;
			transform: none !important;
			/* Real A3 dimensions so the SVG (viewBox 0 0 420 297) prints to scale. */
			width: 420mm !important;
			height: 297mm !important;
		}
	}
</style>
