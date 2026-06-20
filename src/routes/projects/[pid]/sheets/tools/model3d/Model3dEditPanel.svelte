<script lang="ts">
	import { Window } from '$lib'
	import type { Model3dEditor } from './model3d-editor.svelte'
	import type { Model } from './types'

	// Floating editor for the selected object in an active model3d viewport:
	// numeric properties + layer assignment. Edits go through editor.notify() so
	// they persist (ModelStore) and record an undo step.
	let { editor, model }: { editor: Model3dEditor; model: Model } = $props()

	const obj = $derived(editor.selIndex !== null ? model.objects[editor.selIndex] ?? null : null)
	const layers = $derived(model.layers ?? [])
	const change = () => editor.notify()
</script>

<Window title="Object" name="model3d-object" right={10} top={10} open class="w-56 p-2 text-zinc-700">
	{#if obj}
		<div class="space-y-1 text-xs">
			<div class="mb-1 font-semibold capitalize">{obj.type}</div>

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
				<div class="grid grid-cols-3 gap-1">
					<label class="block"><span class="text-zinc-400">Base Z</span>
						<input type="number" class="w-full rounded border px-1 py-0.5" bind:value={obj.z} oninput={change} /></label>
					<label class="block"><span class="text-zinc-400">Height</span>
						<input type="number" class="w-full rounded border px-1 py-0.5" bind:value={obj.h} oninput={change} /></label>
					<label class="block"><span class="text-zinc-400">Thick</span>
						<input type="number" class="w-full rounded border px-1 py-0.5" bind:value={obj.thickness} oninput={change} /></label>
				</div>
				<p class="text-zinc-400">{obj.pts.length} points</p>
				{#each obj.pts as p, i (i)}
					<div class="grid grid-cols-2 gap-1">
						<input type="number" class="w-full rounded border px-1 py-0.5" bind:value={p.x} oninput={change} />
						<input type="number" class="w-full rounded border px-1 py-0.5" bind:value={p.y} oninput={change} />
					</div>
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
				<p class="text-zinc-400">{obj.path.length} points</p>
				{#each obj.path as p, i (i)}
					<div class="grid grid-cols-3 gap-1">
						<input type="number" class="w-full rounded border px-1 py-0.5" bind:value={p.x} oninput={change} />
						<input type="number" class="w-full rounded border px-1 py-0.5" bind:value={p.y} oninput={change} />
						<input type="number" class="w-full rounded border px-1 py-0.5" bind:value={p.z} oninput={change} />
					</div>
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
