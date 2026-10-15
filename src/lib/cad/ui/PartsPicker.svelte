<!-- Which parts of a project a backup holds or a restore changes (ADR 0008 §2): the whole project, or models (levels)
     grouped by floor — ticking a floor ticks its area plans. Shared by Download backup, Back up now and restore. -->
<script lang="ts">
	import type { Floor, Parts } from '../domain/backupParts'

	let { floors, parts = $bindable(), allowAll = true }: { floors: Floor[]; parts: Parts; allowAll?: boolean } = $props()

	const chosen = $derived(new Set(parts === 'all' ? [] : parts))
	const set = (ids: Set<string>) => { parts = floors.flatMap((f) => f.models.map((m) => m.id)).filter((id) => ids.has(id)) }
	function toggleFloor(f: Floor, on: boolean) {
		const ids = new Set(chosen)
		for (const m of f.models) on ? ids.add(m.id) : ids.delete(m.id)
		set(ids)
	}
	function toggleModel(id: string, on: boolean) {
		const ids = new Set(chosen)
		on ? ids.add(id) : ids.delete(id)
		set(ids)
	}
	const all = (f: Floor) => f.models.every((m) => chosen.has(m.id))
	const some = (f: Floor) => f.models.some((m) => chosen.has(m.id))
</script>

<div class="pp">
	{#if allowAll}
		<label class="pp-mode"><input type="radio" checked={parts === 'all'} onchange={() => (parts = 'all')} /> Whole project <span class="pp-hint">— every model, sheets, views, layers, settings and releases</span></label>
		<label class="pp-mode"><input type="radio" checked={parts !== 'all'} onchange={() => (parts = [])} /> Chosen models</label>
	{/if}
	{#if parts !== 'all'}
		<div class="pp-tree">
			{#each floors as f (f.key)}
				{#if f.models.length > 1}
					<label class="pp-floor"><input type="checkbox" checked={all(f)} indeterminate={some(f) && !all(f)} onchange={(e) => toggleFloor(f, e.currentTarget.checked)} /> <b>{f.name}</b></label>
					{#each f.models as m (m.id)}
						<label class="pp-model"><input type="checkbox" checked={chosen.has(m.id)} onchange={(e) => toggleModel(m.id, e.currentTarget.checked)} /> {m.name}</label>
					{/each}
				{:else}
					<label class="pp-floor"><input type="checkbox" checked={all(f)} onchange={(e) => toggleFloor(f, e.currentTarget.checked)} /> <b>{f.models[0].name}</b></label>
				{/if}
			{:else}
				<div class="pp-hint">No models</div>
			{/each}
		</div>
		<div class="pp-hint">Sheets, views, layers and settings are only in a whole-project backup.</div>
	{/if}
</div>

<style>
	.pp { display: flex; flex-direction: column; gap: 4px; }
	.pp label { display: flex; align-items: center; gap: 5px; cursor: pointer; }
	.pp input { accent-color: #2563eb; }
	.pp-tree { max-height: 16rem; overflow-y: auto; border: 1px solid var(--cad-line, #e4e4e7); border-radius: 4px; padding: 4px 8px; margin-left: 18px; }
	.pp-model { padding-left: 20px; }
	.pp-hint { color: var(--cad-muted, #71717a); font-weight: 400; }
</style>
