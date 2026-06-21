<script lang="ts">
	import { Window, Icon } from '$lib'
	import type { Model3dEditor } from './model3d-editor.svelte'
	import type { CondSeg, Model, WallSeg } from './types'
	import type { AnnotationEditor } from '../../annotations/annotations.svelte'
	import AnnotationControls from '../../edit/AnnotationControls.svelte'

	// Floating editor for the selected object in an active model3d viewport:
	// numeric properties, a per-segment list (walls/conduits), and layer
	// assignment. Edits go through editor.notify() so they persist + record undo.
	// `annEditor`/`tool` add the shared annotation toolbar + property editor.
	let { editor, model, annEditor, tool = $bindable('select') }: { editor: Model3dEditor; model: Model; annEditor: AnnotationEditor; tool?: string } = $props()

	const obj = $derived(editor.selIndex !== null ? model.objects[editor.selIndex] ?? null : null)
	const idx = $derived(editor.selIndex ?? 0)
	const layers = $derived(model.layers ?? [])
	const change = () => editor.notify()
	const num = (e: Event) => Number((e.currentTarget as HTMLInputElement).value)
	const wallOverride = (s: WallSeg) => s.thickness != null || s.h != null
	const condOverride = (s: CondSeg) => s.w != null || s.h != null || s.edges != null
	// Layers a new object can be created on (all except the reserved Background).
	const newLayers = $derived((model.layers ?? []).filter((l) => l.id !== 'background'))
</script>

<Window title="Object" name="model3d-object" right={10} top={10} open class="w-64 p-2 text-zinc-700">
	<!-- Insert / place-tool — plan + elevations (Wall/Section stay plan-only) -->
	{#if editor.direction !== 'iso'}
		{#if editor.placing}
			<div class="mb-1 flex items-center gap-1 rounded bg-blue-50 px-1 py-1 text-xs">
				<span class="flex-1 text-blue-700">{editor.placing.kind === 'prism' ? 'Drag out the box (Shift = 15° while drawing lines)' : 'Click points · Shift = 15° · ⏎/dbl-click to finish'}</span>
				{#if editor.placing.kind !== 'prism'}<button class="rounded border px-1 py-0.5 hover:bg-white" onclick={() => editor.finishPlacing()}>Finish</button>{/if}
				<button class="rounded border px-1 py-0.5 hover:bg-white" onclick={() => editor.cancelPlacing()}>Cancel</button>
			</div>
		{:else if editor.sectionMode}
			<div class="mb-1 flex items-center gap-1 rounded bg-blue-50 px-1 py-1 text-xs">
				<span class="flex-1 text-blue-700">Drag a box on the plan to create an elevation</span>
				<button class="rounded border px-1 py-0.5 hover:bg-white" onclick={() => editor.cancelSection()}>Cancel</button>
			</div>
		{:else}
			<div class="mb-1 space-y-1 text-xs">
				<div class="truncate text-[11px] text-zinc-400" title="Set the active layer in the Layers window">New on <span class="font-medium text-zinc-600">{newLayers.find((l) => l.id === (editor.activeLayer ?? newLayers[0]?.id))?.name ?? '—'}</span></div>
				<div class="grid grid-cols-3 gap-1">
					<button class="whitespace-nowrap rounded border px-1 py-0.5 hover:bg-slate-100" onclick={() => editor.startPlacing('prism')}>＋Cuboid</button>
					{#if editor.direction === 'plan'}<button class="whitespace-nowrap rounded border px-1 py-0.5 hover:bg-slate-100" onclick={() => editor.startPlacing('wall')}>＋Wall</button>{/if}
					<button class="whitespace-nowrap rounded border px-1 py-0.5 hover:bg-slate-100" onclick={() => editor.startPlacing('conduit')}>＋Conduit</button>
				</div>
				{#if editor.direction === 'plan'}
					<button class="w-full whitespace-nowrap rounded border px-1 py-0.5 hover:bg-slate-100" title="Drag a box on the plan to create a clipped elevation viewport" onclick={() => editor.startSectionMode()}>⬚ Section → elevation</button>
				{/if}
			</div>
		{/if}
		<hr class="mb-1 border-zinc-200" />
	{/if}

	<!-- Annotations: live kinds as direct buttons + the shared property editor -->
	<AnnotationControls bind:tool editor={annEditor} showSelect={true}
		tools={['text', 'line', 'rect', 'arrow', 'ellipse', 'outlet', 'cloud', 'callout', 'dimension', 'symbol']} />
	<hr class="my-1 border-zinc-200" />

	{#if editor.multi.length > 1}
		<!-- multi-select: edit common props on all selected objects at once -->
		<div class="space-y-1 text-xs">
			<div class="mb-1 font-semibold">{editor.multi.length} objects</div>
			<div class="mb-1 flex flex-wrap gap-1">
				<button class="rounded border px-1.5 py-0.5 hover:bg-slate-100" title="Duplicate (Ctrl+D)" onclick={() => editor.duplicateSel()}>Duplicate</button>
				<button class="rounded border px-1.5 py-0.5 hover:bg-slate-100" title="Copy (Ctrl+C)" onclick={() => editor.copySel()}>Copy</button>
				<button class="rounded border border-red-300 px-1.5 py-0.5 text-red-600 hover:bg-red-50" title="Delete (Del)" onclick={() => editor.deleteSel()}>Delete</button>
			</div>
			<div class="grid grid-cols-2 gap-1">
				<label class="block"><span class="text-zinc-400">Height</span>
					<input type="number" class="w-full rounded border px-1 py-0.5" placeholder="mixed"
						value={editor.common((o) => ('h' in o ? (o as any).h : undefined)) ?? ''} oninput={(e) => editor.setMultiHeight(num(e))} /></label>
				<label class="block"><span class="text-zinc-400">Base Z</span>
					<input type="number" class="w-full rounded border px-1 py-0.5" placeholder="mixed"
						value={editor.common((o) => (o.type === 'prism' ? o.z : o.nodes[0]?.z)) ?? ''} oninput={(e) => editor.setMultiBaseZ(num(e))} /></label>
			</div>
			<label class="flex items-center justify-between gap-2">
				<span class="text-zinc-400">Layer</span>
				<select class="w-32 rounded border px-1 py-0.5" value={editor.common((o) => o.layer ?? '') ?? ''}
					onchange={(e) => editor.setMultiLayer((e.currentTarget as HTMLSelectElement).value || undefined)}>
					<option value="">{editor.common((o) => o.layer) === undefined ? '— mixed —' : '—'}</option>
					{#each layers as l (l.id)}<option value={l.id}>{l.name}</option>{/each}
				</select>
			</label>
		</div>
	{:else if obj}
		<div class="space-y-1 text-xs">
			<div class="mb-1 font-semibold capitalize">{obj.type === 'prism' ? 'Cuboid' : obj.type}</div>
			<!-- touch-friendly actions (mouse also has ctrl-drag + Ctrl+D/C/X/V) -->
			<div class="mb-1 flex flex-wrap gap-1">
				<button class="rounded border px-1.5 py-0.5 hover:bg-slate-100" title="Duplicate (Ctrl+D)" onclick={() => editor.duplicateSel()}>Duplicate</button>
				<button class="rounded border px-1.5 py-0.5 hover:bg-slate-100" title="Copy (Ctrl+C)" onclick={() => editor.copySel()}>Copy</button>
				<button class="rounded border px-1.5 py-0.5 hover:bg-slate-100" title="Paste (Ctrl+V)" onclick={() => editor.paste()}>Paste</button>
				<button class="rounded border border-red-300 px-1.5 py-0.5 text-red-600 hover:bg-red-50" title="Delete (Del)" onclick={() => editor.deleteSel()}>Delete</button>
			</div>

			{#if obj.type === 'prism'}
				<div class="grid grid-cols-3 gap-1">
					{#each ['x', 'y', 'z', 'w', 'h', 'd'] as const as k (k)}
						<label class="block"><span class="text-zinc-400 uppercase">{k}</span>
							<input type="number" class="w-full rounded border px-1 py-0.5" bind:value={obj[k]} oninput={change} /></label>
					{/each}
					<label class="block"><span class="text-zinc-400">Edges</span>
						<input type="number" min="3" max="24" class="w-full rounded border px-1 py-0.5" bind:value={obj.edges} oninput={change} /></label>
					<label class="block"><span class="text-zinc-400">Rot°</span>
						<input type="number" class="w-full rounded border px-1 py-0.5" value={obj.rot ?? 0} oninput={(e) => { obj.rot = num(e); change() }} /></label>
				</div>
			{:else if obj.type === 'wall'}
				<div class="grid grid-cols-2 gap-1">
					<label class="block"><span class="text-zinc-400">Height</span>
						<input type="number" class="w-full rounded border px-1 py-0.5" bind:value={obj.h} oninput={change} /></label>
					<label class="block"><span class="text-zinc-400">Thick</span>
						<input type="number" class="w-full rounded border px-1 py-0.5" bind:value={obj.thickness} oninput={change} /></label>
				</div>
				<div class="mt-1 flex items-center justify-between">
					<span class="text-zinc-400">Segments — Ctrl/Shift-click to multi-select</span>
					<div class="flex gap-1">
						<button class="rounded border px-1 hover:bg-slate-100" title="Select whole trunk" onclick={() => editor.selectAllSegments(idx)}>All</button>
						{#if editor.segCount() > 1}<button class="rounded border border-red-300 px-1 text-red-600 hover:bg-red-50" onclick={() => editor.deleteSelectedSegments()}>Delete {editor.segCount()}</button>{/if}
					</div>
				</div>
				{#each obj.segments as s, si (s.id)}
					<div class="flex items-center gap-1">
						<button class="flex-1 rounded px-1 py-0.5 text-left {editor.isSegment(idx, s.id) ? 'bg-blue-100' : 'hover:bg-zinc-100'}"
							onclick={(e) => editor.selectSegment(idx, s.id, e.ctrlKey || e.shiftKey || e.metaKey)}>Seg {si + 1}{#if wallOverride(s)} <span class="text-amber-600">●</span>{/if}</button>
						<button class="text-zinc-300 hover:text-red-500 disabled:opacity-30" title="Delete segment" disabled={obj.segments.length <= 1} onclick={() => editor.deleteSegment(idx, s.id)}><Icon name="trash" size={11} /></button>
					</div>
					{#if editor.isSegment(idx, s.id) && editor.segCount() === 1}
						<div class="grid grid-cols-2 gap-1 pl-2">
							<label class="block"><span class="text-zinc-400">Thick</span>
								<input type="number" class="w-full rounded border px-1 py-0.5" value={s.thickness ?? obj.thickness} oninput={(e) => { s.thickness = num(e); change() }} /></label>
							<label class="block"><span class="text-zinc-400">Height</span>
								<input type="number" class="w-full rounded border px-1 py-0.5" value={s.h ?? obj.h} oninput={(e) => { s.h = num(e); change() }} /></label>
						</div>
						{#if wallOverride(s)}<button class="pl-2 text-left text-zinc-400 hover:text-blue-600" onclick={() => { s.thickness = undefined; s.h = undefined; change() }}>↺ use wall default</button>{/if}
					{/if}
				{/each}
				{#if editor.segCount() > 1}
					<!-- shared override for the selected segments -->
					<div class="grid grid-cols-2 gap-1 pl-2">
						<label class="block"><span class="text-zinc-400">Thick (all)</span>
							<input type="number" class="w-full rounded border px-1 py-0.5" placeholder="mixed" oninput={(e) => editor.setSegAll({ thickness: num(e) })} /></label>
						<label class="block"><span class="text-zinc-400">Height (all)</span>
							<input type="number" class="w-full rounded border px-1 py-0.5" placeholder="mixed" oninput={(e) => editor.setSegAll({ h: num(e) })} /></label>
					</div>
					<button class="pl-2 text-left text-zinc-400 hover:text-blue-600" onclick={() => editor.setSegAll({ thickness: undefined, h: undefined })}>↺ use wall default</button>
				{/if}
			{:else if obj.type === 'conduit'}
				<div class="grid grid-cols-3 gap-1">
					<label class="block"><span class="text-zinc-400">W</span>
						<input type="number" class="w-full rounded border px-1 py-0.5" bind:value={obj.w} oninput={change} /></label>
					<label class="block"><span class="text-zinc-400">H</span>
						<input type="number" class="w-full rounded border px-1 py-0.5" bind:value={obj.h} oninput={change} /></label>
					<label class="block"><span class="text-zinc-400">Edges</span>
						<input type="number" min="3" max="24" class="w-full rounded border px-1 py-0.5" bind:value={obj.edges} oninput={change} /></label>
				</div>
				<div class="mt-1 flex items-center justify-between">
					<span class="text-zinc-400">Segments — Ctrl/Shift-click to multi-select</span>
					<div class="flex gap-1">
						<button class="rounded border px-1 hover:bg-slate-100" title="Select whole trunk" onclick={() => editor.selectAllSegments(idx)}>All</button>
						{#if editor.segCount() > 1}<button class="rounded border border-red-300 px-1 text-red-600 hover:bg-red-50" onclick={() => editor.deleteSelectedSegments()}>Delete {editor.segCount()}</button>{/if}
					</div>
				</div>
				{#each obj.segments as s, si (s.id)}
					<div class="flex items-center gap-1">
						<button class="flex-1 rounded px-1 py-0.5 text-left {editor.isSegment(idx, s.id) ? 'bg-blue-100' : 'hover:bg-zinc-100'}"
							onclick={(e) => editor.selectSegment(idx, s.id, e.ctrlKey || e.shiftKey || e.metaKey)}>Seg {si + 1}{#if condOverride(s)} <span class="text-amber-600">●</span>{/if}</button>
						<button class="text-zinc-300 hover:text-red-500 disabled:opacity-30" title="Delete segment" disabled={obj.segments.length <= 1} onclick={() => editor.deleteSegment(idx, s.id)}><Icon name="trash" size={11} /></button>
					</div>
					{#if editor.isSegment(idx, s.id) && editor.segCount() === 1}
						<div class="grid grid-cols-3 gap-1 pl-2">
							<label class="block"><span class="text-zinc-400">W</span>
								<input type="number" class="w-full rounded border px-1 py-0.5" value={s.w ?? obj.w} oninput={(e) => { s.w = num(e); change() }} /></label>
							<label class="block"><span class="text-zinc-400">H</span>
								<input type="number" class="w-full rounded border px-1 py-0.5" value={s.h ?? obj.h} oninput={(e) => { s.h = num(e); change() }} /></label>
							<label class="block"><span class="text-zinc-400">Edges</span>
								<input type="number" min="3" max="24" class="w-full rounded border px-1 py-0.5" value={s.edges ?? obj.edges} oninput={(e) => { s.edges = num(e); change() }} /></label>
						</div>
						{#if condOverride(s)}<button class="pl-2 text-left text-zinc-400 hover:text-blue-600" onclick={() => { s.w = undefined; s.h = undefined; s.edges = undefined; change() }}>↺ use conduit default</button>{/if}
					{/if}
				{/each}
				{#if editor.segCount() > 1}
					<!-- shared override for the selected segments -->
					<div class="grid grid-cols-3 gap-1 pl-2">
						<label class="block"><span class="text-zinc-400">W (all)</span>
							<input type="number" class="w-full rounded border px-1 py-0.5" placeholder="mixed" oninput={(e) => editor.setSegAll({ w: num(e) })} /></label>
						<label class="block"><span class="text-zinc-400">H (all)</span>
							<input type="number" class="w-full rounded border px-1 py-0.5" placeholder="mixed" oninput={(e) => editor.setSegAll({ h: num(e) })} /></label>
						<label class="block"><span class="text-zinc-400">Edges</span>
							<input type="number" min="3" max="24" class="w-full rounded border px-1 py-0.5" placeholder="mixed" oninput={(e) => editor.setSegAll({ edges: num(e) })} /></label>
					</div>
					<button class="pl-2 text-left text-zinc-400 hover:text-blue-600" onclick={() => editor.setSegAll({ w: undefined, h: undefined, edges: undefined })}>↺ use conduit default</button>
				{/if}
			{/if}

			<label class="mt-1 flex items-center justify-between gap-2">
				<span class="text-zinc-400">Layer</span>
				<select class="w-32 rounded border px-1 py-0.5" value={obj.layer ?? ''}
					onchange={(e) => { obj.layer = (e.currentTarget as HTMLSelectElement).value || undefined; change() }}>
					<option value="">—</option>
					{#each layers as l (l.id)}<option value={l.id}>{l.name}</option>{/each}
				</select>
			</label>
		</div>
	{:else}
		<p class="text-xs text-zinc-400">Select an object to edit its properties.</p>
	{/if}
</Window>
