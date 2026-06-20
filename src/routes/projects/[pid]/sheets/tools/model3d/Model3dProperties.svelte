<script lang="ts">
	import { getContext } from 'svelte'
	import type { Firestore } from '$lib/db.svelte'
	import PropSelect from '../../parts/PropSelect.svelte'
	import PropCheck from '../../parts/PropCheck.svelte'
	import type { Dir } from './types'
	import { DIRECTIONS, DIR_LABEL } from './types'
	import { modelStore } from './models.svelte'

	let { pid, modelId, direction, hiddenLines, onchange }: {
		pid: string
		modelId: number
		direction: Dir
		hiddenLines: boolean
		onchange: (p: { modelId: number; direction: Dir; hiddenLines: boolean }) => void
	} = $props()

	const db = getContext('db') as Firestore
	const store = $derived(modelStore(db, pid))
	const current = $derived(store.models.find((m) => m.id === modelId) ?? null)

	const emit = () => onchange({ modelId, direction, hiddenLines })

	function newModel() {
		const m = store.add()
		modelId = m.id
		emit()
	}
	function deleteModel() {
		if (!current || store.models.length <= 1) return
		store.remove(modelId)
		modelId = store.models[0]?.id ?? 1
		emit()
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

{#if direction === 'iso'}
	<PropCheck label="Hidden lines" value={hiddenLines}
		onchange={(e: Event) => { hiddenLines = (e.currentTarget as HTMLInputElement).checked; emit() }} />
{/if}
