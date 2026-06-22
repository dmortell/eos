<script lang="ts">
	// Shape library window: built-in shapes + custom shapes (global Firestore `library` collection).
	// Drag a row onto the viewport to place it; "Save selection" stores the current selection globally.
	import { getContext } from 'svelte'
	import { Window, Search, Dialog, Icon } from '$lib'
	import { portal } from '../edit/portal'
	import type { Firestore } from '$lib/db.svelte'
	import { BUILTIN_SHAPES, type LibraryShape } from './shapes/library'
	import type { AnnotationEditor } from './annotations.svelte'

	let { editor, open = $bindable(true), ondrop }: {
		editor: AnnotationEditor
		open?: boolean
		ondrop: (shape: LibraryShape, clientX: number, clientY: number) => void
	} = $props()

	const db = getContext('db') as Firestore
	let custom = $state<LibraryShape[]>([])
	$effect(() => {
		const u = db.subscribeMany('library', (d) => (custom = d as unknown as LibraryShape[]))
		return () => u?.()
	})

	let query = $state('')
	const all = $derived([...BUILTIN_SHAPES, ...custom])
	const filtered = $derived(
		query
			? all.filter((s) => `${s.name} ${s.category} ${s.tags?.join(' ') ?? ''}`.toLowerCase().includes(query.toLowerCase()))
			: all,
	)
	const cats = $derived([...new Set(filtered.map((s) => s.category))])
	const isCustom = (s: LibraryShape) => custom.some((c) => c.id === s.id)

	// drag-to-place: ghost follows the cursor; drop fires ondrop with the client point
	let ghost = $state<{ name: string; x: number; y: number } | null>(null)
	let dragShape: LibraryShape | null = null
	function onMove(e: MouseEvent) { if (ghost) ghost = { ...ghost, x: e.clientX, y: e.clientY } }
	function onUp(e: MouseEvent) {
		window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp)
		const s = dragShape; dragShape = null; ghost = null
		if (s) ondrop(s, e.clientX, e.clientY)
	}
	function beginDrag(s: LibraryShape, e: MouseEvent) {
		if (e.button !== 0) return
		e.preventDefault()
		dragShape = s; ghost = { name: s.name, x: e.clientX, y: e.clientY }
		window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp)
	}

	// save the current selection as a custom shape (global)
	let saveOpen = $state(false), saveName = $state(''), saveCat = $state('Custom')
	function openSave() { saveName = ''; saveCat = 'Custom'; saveOpen = true }
	function doSave() {
		const shape = editor.shapeFromSelection(saveName.trim() || 'Shape', saveCat.trim() || 'Custom')
		if (!shape) return
		db.save('library', { ...shape, id: 'lib-' + Math.random().toString(36).slice(2, 10) })
		saveOpen = false
	}
	function del(id: string) { db.delete('library', id) }

	// a tiny representative preview per shape (first item's kind/symbol)
	const preview = (s: LibraryShape) => s.items[0]?.symbol ?? s.items[0]?.kind ?? 'rect'
</script>

<div use:portal>
	<Window title="Shapes" name="sheet-shapes" right={10} top={140} bind:open class="w-60 space-y-2 p-2 text-zinc-700">
		<Search bind:value={query} class="text-sm" />
		<button class="w-full rounded border border-zinc-300 px-2 py-1 text-xs hover:bg-slate-100 disabled:opacity-40"
			disabled={!editor.selAnns.length} onclick={openSave}>＋ Save selection as shape</button>

		<div class="max-h-80 space-y-2 overflow-auto">
			{#each cats as cat (cat)}
				<div>
					<div class="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-400">{cat}</div>
					<div class="space-y-0.5">
						{#each filtered.filter((s) => s.category === cat) as s (s.id)}
							{@const k = preview(s)}
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<div class="flex items-center gap-2 rounded border border-zinc-200 bg-zinc-50 p-1 text-xs hover:bg-zinc-100"
								style:cursor="grab" title="Drag onto the view to place" onmousedown={(e: MouseEvent) => beginDrag(s, e)}>
								<svg viewBox="0 0 24 24" width="22" height="22" class="shrink-0 rounded bg-white">
									{#if k === 'ellipse'}<ellipse cx="12" cy="12" rx="9" ry="6" fill="#e5e7eb" stroke="#374151" stroke-width="1" />
									{:else if k === 'line'}<line x1="3" y1="19" x2="21" y2="5" stroke="#374151" stroke-width="1.5" />
									{:else if k === 'arrow' || k === 'dimension'}<line x1="3" y1="12" x2="20" y2="12" stroke="#374151" stroke-width="1.5" marker-end="url(#la)" /><defs><marker id="la" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 z" fill="#374151" /></marker></defs>
									{:else if k === 'text'}<text x="12" y="17" text-anchor="middle" font-size="14" fill="#374151">T</text>
									{:else if k === 'callout'}<line x1="4" y1="20" x2="14" y2="8" stroke="#374151" stroke-width="1" /><rect x="12" y="4" width="9" height="6" fill="#e5e7eb" stroke="#374151" stroke-width="1" />
									{:else if k === 'outlet'}<path d="M12,4 L20,18 L4,18 Z" fill="#10b981" stroke="#374151" stroke-width="1" />
									{:else if k === 'cloud' || k === 'section' || k === 'elevation' || k === 'detail' || k === 'photo'}<circle cx="12" cy="12" r="8" fill="#fff" stroke="#374151" stroke-width="1" />
									{:else if k === 'north'}<path d="M12,3 L16,21 L12,16 L8,21 Z" fill="#374151" />
									{:else}<rect x="4" y="6" width="16" height="12" fill="#e5e7eb" stroke="#374151" stroke-width="1" />{/if}
								</svg>
								<span class="min-w-0 flex-1 truncate">{s.name}</span>
								{#if isCustom(s)}
									<button class="shrink-0 text-zinc-300 hover:text-red-500" title="Delete shape"
										onmousedown={(e: MouseEvent) => e.stopPropagation()} onclick={() => del(s.id)}><Icon name="trash" size={12} /></button>
								{/if}
							</div>
						{/each}
					</div>
				</div>
			{/each}
		</div>
	</Window>

	{#if ghost}
		<div class="pointer-events-none fixed z-[100] -translate-x-1/2 -translate-y-1/2 rounded border border-blue-400 bg-blue-50/90 px-2 py-0.5 text-xs text-blue-700 shadow"
			style:left="{ghost.x}px" style:top="{ghost.y}px">{ghost.name}</div>
	{/if}

	<Dialog title="Save shape" bind:open={saveOpen}>
		<div class="space-y-2 px-6 pb-3 text-xs">
			<label class="block text-zinc-500">Name
				<input class="h-7 w-full rounded border border-zinc-300 px-1.5 text-sm" bind:value={saveName} placeholder="My shape" /></label>
			<label class="block text-zinc-500">Category
				<input class="h-7 w-full rounded border border-zinc-300 px-1.5 text-sm" bind:value={saveCat} /></label>
			<div class="flex justify-end gap-2 pt-1">
				<button class="rounded border px-3 py-1 hover:bg-slate-100" onclick={() => (saveOpen = false)}>Cancel</button>
				<button class="rounded bg-blue-600 px-3 py-1 text-white hover:bg-blue-500" onclick={doSave}>Save</button>
			</div>
		</div>
	</Dialog>
</div>
