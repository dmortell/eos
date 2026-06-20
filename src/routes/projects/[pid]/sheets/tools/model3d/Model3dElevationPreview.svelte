<script lang="ts">
	import { Window } from '$lib'
	import Model3dRender from './Model3dRender.svelte'
	import Model3dEditLayer from './Model3dEditLayer.svelte'
	import { Model3dEditor } from './model3d-editor.svelte'
	import { project, DEFAULT_YAW, DEFAULT_PITCH } from './projection'
	import { BASIS, DIR_LABEL, type Dir, type Model } from './types'
	import type { ModelStore } from './models.svelte'

	// Floating auto-fit elevation of the plan selection, for quick height editing.
	// Uses its OWN editor (same model, elevation direction) so drags here mutate the
	// shared model (persist via the store) without fighting the plan editor's svg/CTM.
	let { model, store, selIndex, direction = $bindable('front') }: {
		model: Model; store: ModelStore; selIndex: number | null; direction?: Dir
	} = $props()

	const ELEV: Dir[] = ['front', 'rear', 'left', 'right']
	const sel = $derived(selIndex !== null ? model.objects[selIndex] ?? null : null)

	const ed = new Model3dEditor()
	$effect(() => { ed.model = model; ed.direction = direction; ed.onChange = () => store.save() })
	$effect(() => { if (selIndex !== null) ed.selectObj(selIndex); else ed.clearSel() })

	// Fit box: the selection's projected bounds, extended to include the level datums
	// so you can drag against FFL / ceiling.
	const view = $derived.by(() => {
		if (!sel) return null
		const b = BASIS[direction]
		let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
		for (const s of project(sel, direction, DEFAULT_YAW, DEFAULT_PITCH, 0, 0))
			for (const p of s.pts) { x0 = Math.min(x0, p.u); x1 = Math.max(x1, p.u); y0 = Math.min(y0, -p.v); y1 = Math.max(y1, -p.v) }
		if (x0 === Infinity) return null
		const lv = model.levels ? Object.values(model.levels).filter((z): z is number => z != null) : []
		for (const z of lv) { const sy = -b.vs * z; y0 = Math.min(y0, sy); y1 = Math.max(y1, sy) }
		const padX = (x1 - x0) * 0.15 + 100, padY = (y1 - y0) * 0.12 + 150
		return { x: x0 - padX, y: y0 - padY, w: (x1 - x0) + 2 * padX, h: (y1 - y0) + 2 * padY }
	})

	// Minimal viewport for Model3dRender — `view` overrides the viewBox; all layers shown.
	const fakeVp = { id: 'elev-preview', x: 0, y: 0, w: 100, h: 80, layerOverrides: {}, source: { kind: 'model3d' } } as any
</script>

{#if sel}
	<Window title="Elevation — selection" name="model3d-elev-preview" right={10} top={330} open class="w-64 p-1 text-zinc-700">
		<div class="mb-1 flex gap-1">
			{#each ELEV as d (d)}
				<button class="flex-1 rounded border px-1 py-0.5 text-xs {direction === d ? 'bg-blue-600 text-white' : 'hover:bg-slate-100'}"
					onclick={() => (direction = d)}>{DIR_LABEL[d]}</button>
			{/each}
		</div>
		<div class="relative h-44 w-full overflow-hidden rounded border border-zinc-200 bg-white">
			<Model3dRender {model} {direction} {view} vp={fakeVp} hiddenLines={false} bw={false} onsvg={(el) => (ed.svg = el)}>
				<Model3dEditLayer editor={ed} {model} {direction} interactive={true} zoom={1} />
			</Model3dRender>
		</div>
		<p class="mt-1 text-[10px] text-zinc-400">Drag the top edge to set height. Datums = floor/ceiling levels.</p>
	</Window>
{/if}
