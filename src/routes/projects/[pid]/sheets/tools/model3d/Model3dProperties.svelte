<script lang="ts">
	import { getContext } from 'svelte'
	import type { Firestore } from '$lib/db.svelte'
	import PropSelect from '../../parts/PropSelect.svelte'
	import PropCheck from '../../parts/PropCheck.svelte'
	import type { Dir, Underlay } from './types'
	import { DIRECTIONS, DIR_LABEL } from './types'
	import { modelStore } from './models.svelte'

	let { pid, modelId, direction, hiddenLines, bw, onchange }: {
		pid: string
		modelId: number
		direction: Dir
		hiddenLines: boolean
		bw: boolean
		onchange: (p: { modelId: number; direction: Dir; hiddenLines: boolean; bw: boolean }) => void
	} = $props()

	const db = getContext('db') as Firestore
	const store = $derived(modelStore(db, pid))
	const current = $derived(store.models.find((m) => m.id === modelId) ?? null)

	const emit = () => onchange({ modelId, direction, hiddenLines, bw })

	// Building level datum lines (model-wide; shown in elevation views).
	const LEVELS = [['floorSlab', 'Floor slab'], ['raisedFloor', 'Raised floor (FFL)'], ['ceilingTile', 'Ceiling tile'], ['ceilingSlab', 'Ceiling slab']] as const
	function setLevel(k: string, v: string) {
		if (!current) return
		current.levels ??= {}
		const n = Number(v)
		if (v === '' || Number.isNaN(n)) delete (current.levels as any)[k]; else (current.levels as any)[k] = n
		store.save()
	}

	function newModel() { const m = store.add(); modelId = m.id; emit() }
	function deleteModel() {
		if (!current || store.models.length <= 1) return
		store.remove(modelId); modelId = store.models[0]?.id ?? 1; emit()
	}

	// ── Underlay (model-scoped, per direction) ──
	let files = $state<{ id: string; name?: string; pageCount?: number }[]>([])
	$effect(() => {
		if (!pid) return
		const unsub = db.subscribeWhere('files', 'projectId', pid, (d: any) => (files = d))
		return () => unsub?.()
	})
	// Underlays for this direction (array order = z-order; later = on top).
	const dirUnderlays = $derived((current?.underlays ?? []).filter((u) => u.dir === direction))
	const fileOf = (u: Underlay) => files.find((f) => f.id === u.fileId) ?? null
	const uid = () => `u${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`

	function addUnderlay() {
		if (!current) return
		current.underlays ??= []
		current.underlays.push({ id: uid(), dir: direction, fileId: files[0]?.id ?? '' })
		store.save()
	}
	function setU(id: string, patch: Partial<Underlay>) {
		const u = current?.underlays?.find((x) => x.id === id)
		if (u) { Object.assign(u, patch); store.save() }
	}
	function removeU(id: string) {
		if (current?.underlays) { current.underlays = current.underlays.filter((u) => u.id !== id); store.save() }
	}
	// Move within the direction's z-order; rebuild keeping other-direction items.
	function reorder(id: string, delta: number) {
		if (!current?.underlays) return
		const ds = current.underlays.filter((u) => u.dir === direction)
		const others = current.underlays.filter((u) => u.dir !== direction)
		const i = ds.findIndex((u) => u.id === id), j = i + delta
		if (i < 0 || j < 0 || j >= ds.length) return
		;[ds[i], ds[j]] = [ds[j], ds[i]]
		current.underlays = [...others, ...ds]
		store.save()
	}
</script>

<PropSelect label="Model" value={String(modelId)} onchange={(e: Event) => { modelId = Number((e.currentTarget as HTMLSelectElement).value); emit() }}>
	{#each store.models as m (m.id)}<option value={String(m.id)}>{m.name}</option>{/each}
</PropSelect>

{#if current}
	<div class="flex items-center gap-1">
		<input class="min-w-0 flex-1 rounded border px-1 py-0.5 text-xs" value={current.name}
			oninput={(e) => store.rename(modelId, (e.currentTarget as HTMLInputElement).value)} />
		<button class="shrink-0 rounded border px-1.5 py-0.5 text-xs hover:bg-slate-100" title="New model" onclick={newModel}>＋</button>
		<button class="shrink-0 rounded border border-red-300 px-1.5 py-0.5 text-xs text-red-600 hover:bg-red-50 disabled:opacity-40"
			title="Delete model" disabled={store.models.length <= 1} onclick={deleteModel}>🗑</button>
	</div>
{/if}

<PropSelect label="View" bind:value={direction} onchange={emit}>
	{#each DIRECTIONS as d (d)}<option value={d}>{DIR_LABEL[d]}</option>{/each}
</PropSelect>

{#if current}
	<!-- Building levels (mm): datum lines drawn in elevation views. Blank = hidden. -->
	<details class="text-xs">
		<summary class="cursor-pointer text-zinc-500">Levels (elevation datums)</summary>
		<div class="mt-1 space-y-1">
			{#each LEVELS as [k, lbl] (k)}
				<label class="flex items-center justify-between gap-2">
					<span class="text-zinc-500">{lbl}</span>
					<input type="number" class="w-20 rounded border px-1 py-0.5" placeholder="—"
						value={(current.levels as any)?.[k] ?? ''} oninput={(e) => setLevel(k, (e.currentTarget as HTMLInputElement).value)} />
				</label>
			{/each}
		</div>
	</details>
{/if}

{#if direction === 'iso'}
	<PropCheck label="Hidden lines" value={hiddenLines}
		onchange={(e: Event) => { hiddenLines = (e.currentTarget as HTMLInputElement).checked; emit() }} />
{/if}

<PropCheck label="B / W" value={bw}
	onchange={(e: Event) => { bw = (e.currentTarget as HTMLInputElement).checked; emit() }} />

<!-- Underlays (floorplans / images) for this view — drag/resize on the canvas -->
<hr class="my-1 border-zinc-200" />
<div class="flex items-center justify-between">
	<span class="text-xs font-medium text-zinc-500">Underlays</span>
	<button class="rounded border px-1.5 py-0.5 text-xs hover:bg-slate-100" onclick={addUnderlay}>＋ Add</button>
</div>
{#each dirUnderlays as u, idx (u.id)}
	{@const f = fileOf(u)}
	<div class="mt-1 space-y-1 rounded border border-zinc-200 p-1">
		<div class="flex items-center gap-1">
			<select class="min-w-0 flex-1 rounded border px-1 py-0.5 text-xs" value={u.fileId}
				onchange={(e) => setU(u.id, { fileId: (e.currentTarget as HTMLSelectElement).value, pageNum: 1, rect: undefined })}>
				<option value="">— pick file —</option>
				{#each files as ff (ff.id)}<option value={ff.id}>{ff.name ?? ff.id}</option>{/each}
			</select>
			<button class="rounded px-1 text-xs hover:bg-slate-100 disabled:opacity-30" title="Bring forward" disabled={idx === dirUnderlays.length - 1} onclick={() => reorder(u.id, 1)}>↑</button>
			<button class="rounded px-1 text-xs hover:bg-slate-100 disabled:opacity-30" title="Send back" disabled={idx === 0} onclick={() => reorder(u.id, -1)}>↓</button>
			<button class="rounded px-1 text-xs text-red-600 hover:bg-red-50" title="Remove" onclick={() => removeU(u.id)}>✕</button>
		</div>
		{#if (f?.pageCount ?? 1) > 1}
			<select class="w-full rounded border px-1 py-0.5 text-xs" value={String(u.pageNum ?? 1)}
				onchange={(e) => setU(u.id, { pageNum: Number((e.currentTarget as HTMLSelectElement).value), rect: undefined })}>
				{#each Array.from({ length: f?.pageCount ?? 1 }, (_, i) => i + 1) as pn (pn)}<option value={String(pn)}>Page {pn}</option>{/each}
			</select>
		{/if}
		<div class="flex items-center gap-2">
			<input type="range" min="0.1" max="1" step="0.05" class="min-w-0 flex-1" value={u.opacity ?? 0.5}
				oninput={(e) => setU(u.id, { opacity: Number((e.currentTarget as HTMLInputElement).value) })} title="Opacity" />
			<label class="flex shrink-0 items-center gap-1 text-xs text-zinc-500">
				<input type="checkbox" checked={u.flip ?? false} onchange={(e) => setU(u.id, { flip: (e.currentTarget as HTMLInputElement).checked })} /> flip
			</label>
			<button class="shrink-0 rounded border px-1 py-0.5 text-xs hover:bg-slate-100" title="Reset position/size" onclick={() => setU(u.id, { rect: undefined })}>Reset</button>
		</div>
	</div>
{/each}
