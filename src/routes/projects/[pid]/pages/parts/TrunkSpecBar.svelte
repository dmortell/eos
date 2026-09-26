<script lang="ts">
	// F1: the spec bar over a pane while the Trunk / Pipe tool is armed — what the next run is drawn as: a catalogue
	// item (or Custom), round / rectangular, W × H (round: its diameter), where it runs and, for Custom Z, its
	// underside height. Remembered per tool (ui/trunkSpec.svelte.ts); applies to runs drawn from now on.
	import { trunkSpecs, CATALOGUE, LOCATIONS, specZ, type TrunkLoc, type TrunkShape } from '../ui/trunkSpec.svelte'
	import type { Levels } from '../3dview/types'

	let { tool, levels }: { tool: 'Trunk' | 'Pipe'; levels?: Levels } = $props()
	const s = $derived(trunkSpecs.specs[tool])
	const set = (patch: Parameters<typeof trunkSpecs.set>[1]) => trunkSpecs.set(tool, { ...patch, ...(('w' in patch || 'h' in patch || 'shape' in patch) ? { cat: 'custom' } : {}) })
	const n = (e: Event) => Math.max(0, Math.round(Number((e.currentTarget as HTMLInputElement).value) || 0))
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="tsb" onpointerdown={(e) => e.stopPropagation()}>
	<span class="ttl">{tool}</span>
	<select title="Catalogue" value={s.cat} onchange={(e) => trunkSpecs.pick(tool, (e.currentTarget as HTMLSelectElement).value)}>
		<option value="custom">Custom</option>
		{#each CATALOGUE as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
	</select>
	<span class="seg" title="Profile">
		{#each [['rect', 'Rect'], ['round', 'Round']] as const as [v, l] (v)}
			<button class:on={s.shape === v} onclick={() => set({ shape: v as TrunkShape })}>{l}</button>
		{/each}
	</span>
	{#if s.shape === 'round'}
		<label title="Outside diameter (mm)">Ø<input type="number" min="1" value={s.w} onchange={(e) => set({ w: n(e), h: n(e) })} /></label>
	{:else}
		<label title="Width (mm)">W<input type="number" min="1" value={s.w} onchange={(e) => set({ w: n(e) })} /></label>
		<label title="Height (mm)">H<input type="number" min="1" value={s.h} onchange={(e) => set({ h: n(e) })} /></label>
	{/if}
	<select title="Where it runs (sets its height from the floor's levels)" value={s.loc} onchange={(e) => trunkSpecs.set(tool, { loc: (e.currentTarget as HTMLSelectElement).value as TrunkLoc })}>
		{#each LOCATIONS as [v, l] (v)}<option value={v}>{l}</option>{/each}
	</select>
	{#if s.loc === 'custom'}
		<label title="Underside height above the floor slab (mm)">Z<input type="number" min="0" step="50" value={s.z} onchange={(e) => trunkSpecs.set(tool, { z: n(e) })} /></label>
	{:else}
		<span class="z" title="Underside height from the location and the floor's levels">Z {Math.round(specZ(s, levels))}</span>
	{/if}
</div>

<style>
	.tsb { position:absolute; top:8px; left:50%; transform:translateX(-50%); z-index:7; display:flex; align-items:center; gap:6px;
		padding:4px 8px; background:var(--panel); border:1px solid var(--line); border-radius:7px; box-shadow:0 4px 14px #0006; font-size:11px; color:var(--muted); white-space:nowrap; }
	.ttl { font-weight:700; color:var(--text); }
	select, input { background:var(--input); color:var(--text); border:1px solid var(--line-soft); border-radius:4px; font-size:11px; padding:1px 4px; }
	input { width:52px; margin-left:3px; padding-left:5px; }
	label { display:inline-flex; align-items:center; }
	.seg { display:inline-flex; border:1px solid var(--line-soft); border-radius:4px; overflow:hidden; }
	.seg button { background:none; border:none; color:var(--muted); font-size:11px; padding:1px 7px; cursor:pointer; }
	.seg button.on { background:var(--accent); color:contrast-color(var(--accent)); }
	.z { font-family:Consolas, monospace; color:var(--text); }
</style>
