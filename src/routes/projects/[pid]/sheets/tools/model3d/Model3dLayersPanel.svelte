<script lang="ts">
	import { Window, Icon } from '$lib'
	import type { Model3dEditor } from './model3d-editor.svelte'
	import type { Model } from './types'

	// Layers of the active model3d model (separate from the sheet's annotation
	// layers). Visibility/lock/colour/name edits persist + undo via editor.notify().
	let { editor, model }: { editor: Model3dEditor; model: Model } = $props()

	const layers = $derived(model.layers ?? [])
	const change = () => editor.notify()
	const uid = () => `L${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`

	function add() {
		model.layers ??= []
		model.layers.push({ id: uid(), name: `Layer ${model.layers.length + 1}`, color: '#888888', visible: true, locked: false })
		change()
	}
	function del(id: string) {
		if (model.layers) model.layers = model.layers.filter((l) => l.id !== id)
		change()
	}
</script>

<Window title="Model layers" name="model3d-layers" left={10} top={330} open class="w-56 p-2 text-zinc-700">
	<div class="space-y-1">
		<div class="flex justify-end">
			<button class="flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs hover:bg-slate-100" onclick={add}>
				<Icon name="plus" size={11} /> Layer
			</button>
		</div>
		{#each layers as l (l.id)}
			<div class="flex items-center gap-1 text-xs">
				<label class="relative h-3 w-3 shrink-0 cursor-pointer rounded-sm ring-1 ring-zinc-300" style:background={l.color} title="Colour">
					<input type="color" class="absolute inset-0 h-full w-full cursor-pointer opacity-0" value={l.color}
						oninput={(e) => { l.color = (e.currentTarget as HTMLInputElement).value; change() }} />
				</label>
				<input class="min-w-0 flex-1 rounded border-transparent bg-transparent px-1 py-0.5 hover:border-zinc-200 focus:border-zinc-300"
					value={l.name} oninput={(e) => { l.name = (e.currentTarget as HTMLInputElement).value; change() }} />
				<button class="shrink-0 rounded p-0.5 text-zinc-500 hover:bg-zinc-100" title="Show / hide"
					onclick={() => { l.visible = !l.visible; change() }}>
					<Icon name={l.visible ? 'eye' : 'eyeSlash'} size={14} />
				</button>
				<button class="shrink-0 rounded p-0.5 hover:bg-zinc-100 {l.locked ? 'text-red-600' : 'text-zinc-500'}" title="Lock / unlock"
					onclick={() => { l.locked = !l.locked; change() }}>
					<Icon name={l.locked ? 'lock' : 'lockOpen'} size={14} />
				</button>
				<button class="shrink-0 rounded p-0.5 text-zinc-300 hover:text-red-500 disabled:opacity-30" title="Delete layer"
					disabled={layers.length <= 1} onclick={() => del(l.id)}>
					<Icon name="trash" size={12} />
				</button>
			</div>
		{/each}
	</div>
</Window>
