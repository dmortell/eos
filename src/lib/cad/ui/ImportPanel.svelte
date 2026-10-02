<!-- An empty project: preview what the legacy tools hold (read-only), then write it in on an explicit click. -->
<script lang="ts">
	import type { CadProject } from '../app/project.svelte'
	import type { ImportResult } from '../persist/import/legacy'

	let { project, projectName }: { project: CadProject; projectName: string } = $props()

	let busy = $state(false)
	let preview = $state.raw<ImportResult | null>(null)
	let err = $state<string | null>(null)

	const tally = (xs: { type?: string; code?: string }[], key: 'type' | 'code') =>
		Object.entries(xs.reduce<Record<string, number>>((m, x) => { const k = x[key] ?? '?'; m[k] = (m[k] ?? 0) + 1; return m }, {})).sort((a, b) => b[1] - a[1])

	async function load() {
		busy = true; err = null
		try { preview = await project.previewImport() } catch (e) { err = (e as Error).message } finally { busy = false }
	}
	function apply() {
		if (!preview) return
		try { project.applyImport(preview); preview = null } catch (e) { err = (e as Error).message }
	}
</script>

<div class="mx-auto mt-10 max-w-xl space-y-4 rounded-xl border border-zinc-200 bg-white p-5 text-sm shadow-sm">
	<p class="text-base font-semibold">No cad data in {projectName} yet</p>
	<p class="text-zinc-600">Bring in what the existing tools hold — Frames locations, racks and devices, panel allocation, patch cords,
		and the Outlets plans (positions, trunks, floorplans). The old tools are not changed.</p>
	{#if !preview}
		<button class="rounded bg-blue-600 px-3 py-1.5 text-white disabled:opacity-50" disabled={busy} onclick={load}>
			{busy ? 'Reading the legacy tools…' : 'Preview import'}
		</button>
	{:else}
		<div class="grid grid-cols-2 gap-x-6 gap-y-0.5">
			{#each tally(preview.entities, 'type') as [k, n] (k)}<span class="text-zinc-500">{k}</span><span class="font-mono">{n}</span>{/each}
		</div>
		{#if preview.issues.length}
			<details class="rounded bg-amber-50 p-2">
				<summary class="cursor-pointer">{preview.issues.length} things to check after import</summary>
				<ul class="mt-1 max-h-48 list-disc overflow-auto pl-5 text-xs">
					{#each preview.issues.slice(0, 200) as i, n (n)}<li><b>{i.code}</b> — {i.message}</li>{/each}
				</ul>
			</details>
		{/if}
		<div class="flex gap-2">
			<button class="rounded bg-blue-600 px-3 py-1.5 text-white" onclick={apply}>Import {preview.entities.length} items into {projectName}</button>
			<button class="rounded border px-3 py-1.5" onclick={() => (preview = null)}>Cancel</button>
		</div>
		<p class="text-xs text-zinc-500">One undo step. Writes to <code>projects/…/cadEntities</code> only.</p>
	{/if}
	{#if err}<p class="text-red-600">{err}</p>{/if}
</div>
