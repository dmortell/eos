<script lang="ts">
	import type { Sheet } from './sheet.svelte'
	import ViewObjects from './ViewObjects.svelte'

	let { sheet }: { sheet: Sheet } = $props()
</script>

<!-- Maximized model view: fills the whole content area, hides the others.
     Free pan/zoom around model space with a transient camera (mtx/mty/mzoom);
     the view's stored viewport is untouched. -->
{#if sheet.maxView}
	{@const mv = sheet.maxView}
	<div
		class="absolute inset-0 overflow-hidden bg-white"
		role="application"
		onpointerdown={(e) => { e.stopPropagation(); sheet.maxPanStart(e) }}
		onwheel={(e) => sheet.maxWheel(e)}
		oncontextmenu={(e) => e.preventDefault()}
	>
		<svg
			class="absolute block"
			width={mv.fw} height={mv.fh}
			viewBox="{mv.fx} {mv.fy} {mv.fw} {mv.fh}"
			style="left:0; top:0; overflow:visible; transform-origin:0 0; transform: translate({sheet.mtx}px,{sheet.mty}px) scale({sheet.mzoom});"
		>
			<ViewObjects {sheet} view={mv} clickable={true} />
		</svg>
		<button
			class="absolute right-3 top-3 rounded border bg-white px-2 py-1 text-sm"
			title="Restore view"
			onpointerdown={(e) => e.stopPropagation()}
			onclick={() => sheet.toggleMax(mv)}
		>🗗</button>
	</div>
{/if}
