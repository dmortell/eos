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

	// Fit the sheet to the viewport on load (it starts small otherwise).
	onMount(() => sheet.zoomToFit())
</script>

<svelte:window onkeydown={sheet.onKeyDown} />

<div class="flex h-screen flex-col">
	<Titlebar title="{projectName} — Drawing Sheet" height={30} />
	<Menubar {sheet} />
	<InsertToolbar {sheet} />

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

						<!-- Paper border -->
						<!-- <rect x="0" y="0" width={PAPER.w} height={PAPER.h} fill="none" stroke="#000000" stroke-width="1" style="pointer-events:none" /> -->

						<!-- Titleblock -->
						<!-- <Titleblock width={blockW} /> -->
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
