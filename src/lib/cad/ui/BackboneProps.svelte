<!-- A backbone cable picked (in the riser view, where a group of them is one line): its GROUP's label and colour in the
     riser view — the project's (settings.riser.groups by views/riser.ts backboneKey), so every riser viewport shows the
     same. Blank label = "24 × cat6a · 12m"; By layer colour = by its cable type (fibre amber, copper blue). -->
<script lang="ts">
	import type { CadProject } from '../app/project.svelte'
	import type { Link } from '../domain/types'
	import PropGroup from './PropGroup.svelte'
	import ColorPick from './ColorPick.svelte'
	import { backboneKey } from '../views/riser'

	let { project, link }: { project: CadProject; link: Link } = $props()

	const key = $derived(backboneKey(project.index, link))
	const own = $derived(key ? project.settings?.riser?.groups?.[key] : undefined)
	const ends = $derived(`${project.index.nameOf(link.a.on)} ↔ ${project.index.nameOf(link.b.on)}`)

	function set(label: string, patch: { label?: string; color?: string }) {
		const st = project.settings
		if (!st || !key) return
		const next = { ...own, ...patch }
		for (const k of ['label', 'color'] as const) if (!next[k]) delete next[k]
		const { [key]: _, ...groups } = st.riser?.groups ?? {}
		const riser = { ...st.riser, groups: Object.keys(next).length ? { ...groups, [key]: next } : groups }
		project.store.transact(label, (tx) => tx.put({ ...st, riser }))
	}
</script>

<PropGroup kind="backbone" title="Backbone">
	<p class="text-zinc-500">{link.cableType ?? 'cable'} · {ends}</p>
	{#if key}
		<label class="row" title="The group's words in the riser view (blank = count × type · length)">Riser label
			<input class="inp" value={own?.label ?? ''} placeholder="count × type · length" onchange={(e) => set('Riser group label', { label: e.currentTarget.value.trim() || undefined })} /></label>
		<div class="row" title="The group's line in the riser view (By layer = by its cable type: fibre amber, copper blue)">Riser colour
			<ColorPick value={own?.color} allowByLayer onchange={(v) => set('Riser group colour', { color: v })} /></div>
	{/if}
</PropGroup>

<style>
	.row { display: grid; grid-template-columns: 6.5rem 1fr; align-items: center; gap: 0.25rem; }
	.inp { width: 100%; border: 1px solid var(--cad-line); border-radius: 4px; padding: 1px 4px; background: var(--cad-input); color: var(--cad-text); }
</style>
