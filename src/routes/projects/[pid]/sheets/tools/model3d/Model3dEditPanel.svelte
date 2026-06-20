<script lang="ts">
	import { Window, Icon } from '$lib'
	import type { Model3dEditor } from './model3d-editor.svelte'
	import type { CondSeg, Model, WallSeg } from './types'

	// Floating editor for the selected object in an active model3d viewport:
	// numeric properties, a per-segment list (walls/conduits), and layer
	// assignment. Edits go through editor.notify() so they persist + record undo.
	let { editor, model }: { editor: Model3dEditor; model: Model } = $props()

	const obj = $derived(editor.selIndex !== null ? model.objects[editor.selIndex] ?? null : null)
	const idx = $derived(editor.selIndex ?? 0)
	const layers = $derived(model.layers ?? [])
	const change = () => editor.notify()
	const num = (e: Event) => Number((e.currentTarget as HTMLInputElement).value)
	const wallOverride = (s: WallSeg) => s.thickness != null || s.h != null
	const condOverride = (s: CondSeg) => s.w != null || s.h != null || s.edges != null
</script>

<Window title="Object" name="model3d-object" right={10} top={10} open class="w-56 p-2 text-zinc-700">
	{#if obj}
		<div class="space-y-1 text-xs">
			<div class="mb-1 font-semibold capitalize">{obj.type}</div>
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
				</div>
			{:else if obj.type === 'wall'}
				<div class="grid grid-cols-2 gap-1">
					<label class="block"><span class="text-zinc-400">Height</span>
						<input type="number" class="w-full rounded border px-1 py-0.5" bind:value={obj.h} oninput={change} /></label>
					<label class="block"><span class="text-zinc-400">Thick</span>
						<input type="number" class="w-full rounded border px-1 py-0.5" bind:value={obj.thickness} oninput={change} /></label>
				</div>
				<p class="mt-1 text-zinc-400">Segments — defaults above; click to override</p>
				{#each obj.segments as s, si (s.id)}
					<div class="flex items-center gap-1">
						<button class="flex-1 rounded px-1 py-0.5 text-left {editor.isSegment(idx, s.id) ? 'bg-blue-100' : 'hover:bg-zinc-100'}"
							onclick={() => editor.selectSegment(idx, s.id)}>Seg {si + 1}{#if wallOverride(s)} <span class="text-amber-600">●</span>{/if}</button>
						<button class="text-zinc-300 hover:text-red-500 disabled:opacity-30" title="Delete segment" disabled={obj.segments.length <= 1} onclick={() => editor.deleteSegment(idx, s.id)}><Icon name="trash" size={11} /></button>
					</div>
					{#if editor.isSegment(idx, s.id)}
						<div class="grid grid-cols-2 gap-1 pl-2">
							<label class="block"><span class="text-zinc-400">Thick</span>
								<input type="number" class="w-full rounded border px-1 py-0.5" value={s.thickness ?? obj.thickness} oninput={(e) => { s.thickness = num(e); change() }} /></label>
							<label class="block"><span class="text-zinc-400">Height</span>
								<input type="number" class="w-full rounded border px-1 py-0.5" value={s.h ?? obj.h} oninput={(e) => { s.h = num(e); change() }} /></label>
						</div>
						{#if wallOverride(s)}<button class="pl-2 text-left text-zinc-400 hover:text-blue-600" onclick={() => { s.thickness = undefined; s.h = undefined; change() }}>↺ use wall default</button>{/if}
					{/if}
				{/each}
			{:else if obj.type === 'conduit'}
				<div class="grid grid-cols-3 gap-1">
					<label class="block"><span class="text-zinc-400">W</span>
						<input type="number" class="w-full rounded border px-1 py-0.5" bind:value={obj.w} oninput={change} /></label>
					<label class="block"><span class="text-zinc-400">H</span>
						<input type="number" class="w-full rounded border px-1 py-0.5" bind:value={obj.h} oninput={change} /></label>
					<label class="block"><span class="text-zinc-400">Edges</span>
						<input type="number" min="3" max="24" class="w-full rounded border px-1 py-0.5" bind:value={obj.edges} oninput={change} /></label>
				</div>
				<p class="mt-1 text-zinc-400">Segments — defaults above; click to override</p>
				{#each obj.segments as s, si (s.id)}
					<div class="flex items-center gap-1">
						<button class="flex-1 rounded px-1 py-0.5 text-left {editor.isSegment(idx, s.id) ? 'bg-blue-100' : 'hover:bg-zinc-100'}"
							onclick={() => editor.selectSegment(idx, s.id)}>Seg {si + 1}{#if condOverride(s)} <span class="text-amber-600">●</span>{/if}</button>
						<button class="text-zinc-300 hover:text-red-500 disabled:opacity-30" title="Delete segment" disabled={obj.segments.length <= 1} onclick={() => editor.deleteSegment(idx, s.id)}><Icon name="trash" size={11} /></button>
					</div>
					{#if editor.isSegment(idx, s.id)}
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
