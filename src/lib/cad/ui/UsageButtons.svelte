<!-- USAGE BUTTONS (backlog "Usage buttons", G128): one button per usage of the project's list, in its color, instead of
     a select — the picked one filled. "—" = none (draws nothing under the symbol). A value the list doesn't have shows
     as its own button; `mixed` (several outlets that differ) picks none. -->
<script lang="ts">
	import type { Usage } from '../domain/usages'

	let { usages, value, mixed = false, onpick }: { usages: Usage[]; value: string | undefined; mixed?: boolean; onpick: (id: string) => void } = $props()

	const list = $derived(value && !mixed && !usages.some((u) => u.id === value) ? [...usages, { id: value, label: value, color: '#71717a' }] : usages)
	const on = (id: string) => !mixed && (value ?? '') === id
</script>

<span class="usages" role="radiogroup" aria-label="Usage">
	<button role="radio" aria-checked={on('')} class:on={on('')} title="None — no usage shown under the symbol" onclick={() => onpick('')}>—</button>
	{#each list as u (u.id)}
		<button role="radio" aria-checked={on(u.id)} class:on={on(u.id)} style:--c={u.color} title={u.label} onclick={() => onpick(u.id)}>{u.label}</button>
	{/each}
</span>

<style>
	.usages { display: flex; flex-wrap: wrap; gap: 2px; }
	button { --c: #71717a; font-size: 10.5px; line-height: 16px; padding: 0 5px; border-radius: 3px; border: 1px solid var(--c); color: var(--c); background: var(--cad-input, white); max-width: 7rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	button:hover { background: var(--cad-hover); }
	button.on { background: var(--c); color: white; font-weight: 600; }
</style>
