<!-- The Outlet tool's options in the tool bar: what the NEXT outlet gets (ports, tier, usage, mount, zone, server room, cable). Blank =
     like the last one placed (the tool's usual habit); a value set here sticks until it's changed. -->
<script lang="ts">
	import { sortedCableTypes } from '../domain/cableTypes'
	import { sortedUsages } from '../domain/usages'
	import type { CadProject } from '../app/project.svelte'
	import type { Workspace } from '../app/workspace.svelte'
	import type { Outlet } from '../domain/types'
	import { naturalCompare } from '../domain/labels'

	let { project, ws }: { project: CadProject; ws: Workspace } = $props()

	const MOUNTS: Outlet['mount'][] = ['floor', 'wall', 'box', 'desk', 'ceiling']
	const NONE = '(none)'   // the select's value for "no usage" ('' there means "as last")
	const zones = $derived(project.index.spaces.filter((s) => s.kind === 'zone' && s.levelId === ws.levelId).sort((a, b) => naturalCompare(a.name, b.name)))
	// the open level's server rooms first, then the others (a riser to another floor's)
	const serverRooms = $derived(project.index.spaces.filter((s) => s.kind === 'server room').sort((a, b) => Number(a.levelId !== ws.levelId) - Number(b.levelId !== ws.levelId) || naturalCompare(a.name, b.name)))
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
	<select class="tpl" value={ws.outletNext.usage === '' ? NONE : ws.outletNext.usage ?? ''} onchange={(e) => { const v = e.currentTarget.value; set('usage', v === NONE ? '' : v || undefined) }}>
		<option value="">as last</option><option value={NONE}>(none)</option>
		{#each sortedUsages(project.settings) as u (u.id)}<option value={u.id}>{u.label}</option>{/each}
	</select></label>
<label class="opt">Mount
	<select class="tpl" value={ws.outletNext.mount ?? ''} onchange={(e) => set('mount', (e.currentTarget.value || undefined) as Outlet['mount'] | undefined)}>
		<option value="">as last</option>
		{#each MOUNTS as m (m)}<option value={m}>{m}</option>{/each}
	</select></label>
<label class="opt" title="The next outlet's zone (blank = like the last one) — the open level's zones">Zone
	<select class="tpl" value={ws.outletNext.zoneId ?? ''} onchange={(e) => set('zoneId', e.currentTarget.value || undefined)}>
		<option value="">as last</option>
		{#each zones as z (z.id)}<option value={z.id}>{z.name}</option>{/each}
	</select></label>
<label class="opt" title="The server room its ports run to (blank = like the last one; the first outlet on a level: the level's server room when it has one)">Server room
	<select class="tpl" value={ws.outletNext.serverRoomId ?? ''} onchange={(e) => set('serverRoomId', e.currentTarget.value || undefined)}>
		<option value="">as last</option>
		{#each serverRooms as s (s.id)}<option value={s.id}>{s.name}{s.levelId !== ws.levelId ? ` (${project.index.nameOf(s.levelId)})` : ''}</option>{/each}
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
