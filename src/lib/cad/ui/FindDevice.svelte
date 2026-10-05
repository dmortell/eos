<!-- FIND A DEVICE / PANEL (backlog, Dave 2026-10-05): type part of a device's name, model or its rack's name — matches
     from the whole project. Enter (or a click) opens that room's rack view on the device's side, zoomed to its rack, with
     the device selected. -->
<script lang="ts">
	import type { CadProject } from '../app/project.svelte'
	import type { Workspace } from '../app/workspace.svelte'
	import type { Device, Rack } from '../domain/types'
	import type { ViewSpec } from '../views/space'
	import { naturalCompare } from '../domain/labels'
	import { tick } from 'svelte'

	let { project, ws, onview }: { project: CadProject; ws: Workspace; onview?: (s: ViewSpec) => void } = $props()

	let q = $state(''), at = $state(0)
	const hits = $derived.by(() => {
		const s = q.trim().toLowerCase()
		if (!s) return []
		return project.index.devices
			.map((d) => ({ d, r: project.index.get<Rack>(d.rackId) }))
			.filter(({ d, r }) => r?.type === 'rack' && `${d.name} ${d.model ?? ''} ${r.name}`.toLowerCase().includes(s))
			.sort((a, b) => naturalCompare(`${a.r!.name} ${a.d.name}`, `${b.r!.name} ${b.d.name}`))
			.slice(0, 10)
	})
	async function open(d: Device, r: Rack) {
		ws.levelId = r.levelId
		onview?.({ kind: 'row', spaceId: r.spaceId, face: d.mount === 'rear' || d.face === 'rear' ? 'rear' : 'front' })
		ws.select([d.id])
		q = ''
		await tick()
		ws.focus = r.id   // the whole rack in view, the device picked in it — set once the rack view is up (else the plan takes it)
	}
	function key(e: KeyboardEvent) {
		if (e.key === 'ArrowDown') { e.preventDefault(); at = Math.min(at + 1, hits.length - 1) }
		else if (e.key === 'ArrowUp') { e.preventDefault(); at = Math.max(at - 1, 0) }
		else if (e.key === 'Enter' && hits[at]) { e.preventDefault(); open(hits[at].d, hits[at].r!) }
		else if (e.key === 'Escape') q = ''
	}
</script>

<div class="fd">
	<input class="find" placeholder="Find a device / panel…" bind:value={q} oninput={() => (at = 0)} onkeydown={key} />
	{#if q.trim()}
		<div class="list">
			{#each hits as h, i (h.d.id)}
				<button class:on={i === at} onclick={() => open(h.d, h.r!)}>
					<span class="nm">{h.d.name}</span><span class="meta">{h.r!.name} · U{h.d.u} · {project.index.nameOf(h.r!.levelId)}</span>
				</button>
			{:else}
				<p class="none">No device matches</p>
			{/each}
		</div>
	{/if}
</div>

<style>
	.fd { position: relative; margin: 0 4px 4px; }
	.find { width: 100%; border: 1px solid var(--cad-line); border-radius: 4px; padding: 1px 4px; font-size: 12px; background: var(--cad-input); color: var(--cad-text); }
	.list { position: absolute; z-index: 20; left: 0; right: 0; top: calc(100% + 2px); max-height: 16rem; overflow: auto; background: var(--cad-panel); border: 1px solid var(--cad-line); border-radius: 4px; box-shadow: 0 6px 16px rgb(0 0 0 / 0.15); }
	.list button { display: flex; justify-content: space-between; gap: 0.5rem; width: 100%; padding: 2px 6px; font-size: 12px; text-align: left; }
	.list button:hover, .list button.on { background: var(--cad-sel, #dbeafe); }
	.nm { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.meta { flex: none; font-size: 11px; color: var(--cad-faint); }
	.none { padding: 2px 6px; font-size: 11px; color: var(--cad-faint); }
</style>
