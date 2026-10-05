<!-- The Outlet tool's options in the tool bar: what the NEXT outlet gets (ports, tier, usage, mount, cable). Blank =
     like the last one placed (the tool's usual habit); a value set here sticks until it's changed. -->
<script lang="ts">
	import { sortedCableTypes } from '../domain/cableTypes'
	import { sortedUsages } from '../domain/usages'
	import type { CadProject } from '../app/project.svelte'
	import type { Workspace } from '../app/workspace.svelte'
	import type { Outlet } from '../domain/types'

	let { project, ws }: { project: CadProject; ws: Workspace } = $props()

	const MOUNTS: Outlet['mount'][] = ['floor', 'wall', 'box', 'desk', 'ceiling']
	const set = <K extends keyof Workspace['outletNext']>(k: K, v: Workspace['outletNext'][K] | undefined) => {
		const next = { ...ws.outletNext }
		if (v === undefined) delete next[k]
		else next[k] = v
		ws.outletNext = next
	}
</script>

<span class="mx-2 h-5 w-px bg-zinc-200"></span>
<label class="opt" title="Ports on the next outlet (blank = like the last one)">Ports
	<input type="number" min="1" max="48" value={ws.outletNext.ports ?? ''} placeholder="last"
		onchange={(e) => { const n = Number(e.currentTarget.value); set('ports', e.currentTarget.value.trim() && Number.isInteger(n) && n >= 1 ? n : undefined) }} /></label>
<label class="opt">Tier
	<select class="tpl" value={ws.outletNext.tier ?? ''} onchange={(e) => set('tier', (e.currentTarget.value || undefined) as Outlet['tier'] | undefined)}>
		<option value="">as last</option><option value="low">low</option><option value="high">high</option>
	</select></label>
<label class="opt">Usage
	<select class="tpl" value={ws.outletNext.usage ?? ''} onchange={(e) => set('usage', e.currentTarget.value || undefined)}>
		<option value="">as last</option>
		{#each sortedUsages(project.settings) as u (u.id)}<option value={u.id}>{u.label}</option>{/each}
	</select></label>
<label class="opt">Mount
	<select class="tpl" value={ws.outletNext.mount ?? ''} onchange={(e) => set('mount', (e.currentTarget.value || undefined) as Outlet['mount'] | undefined)}>
		<option value="">as last</option>
		{#each MOUNTS as m (m)}<option value={m}>{m}</option>{/each}
	</select></label>
<label class="opt">Cable
	<select class="tpl" value={ws.outletNext.cableType ?? ''} onchange={(e) => set('cableType', e.currentTarget.value || undefined)}>
		<option value="">as last</option>
		{#each sortedCableTypes(project.settings) as t (t.id)}<option value={t.id}>{t.label}</option>{/each}
	</select></label>

<style>
	.opt { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; color: var(--cad-muted); margin-left: 6px; }
	.opt input { width: 3.5rem; border: 1px solid var(--cad-line); border-radius: 4px; padding: 0 4px; background: var(--cad-input); color: var(--cad-text); }
	.tpl { max-width: 8rem; border: 1px solid var(--cad-line); border-radius: 4px; padding: 0 2px; font-size: 12px; background: var(--cad-input); color: var(--cad-text); }
</style>
