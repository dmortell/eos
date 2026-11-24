<!-- The COMMAND PALETTE (backlog 34, Kestrel B2; Ctrl+K): one box near the top of the drawing. Type part of a name to
     GO somewhere (what the Navigator's search finds — levels, views, sheets and their viewports, rooms, racks, devices,
     outlets) or part of a command to RUN it (every menu item, by its menu path). ↑ / ↓ move, Enter goes / runs
     (Ctrl+Enter opens a place in a kept tab), Esc closes. The Navigator's own search box stays as it was. -->
<script lang="ts">
	import { tick } from 'svelte'
	import type { CadProject } from '../app/project.svelte'
	import { navTree, findItems, type NavNode, type FindItem } from '../domain/navTree'
	import { menuCommands, paletteHits, placeHits, type PaletteCmd, type PlaceHit } from '../domain/palette'
	import { composing } from './keyGuards'
	import type { Menu } from './cadMenus'

	let { project, menus, onopen, onclose }: {
		project: CadProject; menus: Menu[]
		/** Go to a place (as a Navigator row); `keep` = a kept tab, not the preview one. */
		onopen: (n: NavNode | FindItem, keep: boolean) => void
		onclose: () => void
	} = $props()

	let q = $state(''), at = $state(0), box: HTMLInputElement | undefined = $state(), list: HTMLDivElement | undefined = $state()
	$effect(() => { void tick().then(() => box?.focus()) })

	const tree = $derived(navTree(project.dataIndex))
	const cmds = $derived(menuCommands(menus))
	const hits = $derived.by(() => {
		if (!q.trim()) return { places: [], cmds: [] }
		const places = placeHits(tree, findItems(project.dataIndex, q).items, q)
		return paletteHits(q, places, cmds)
	})
	/** One list for ↑ / ↓: the places, then the commands. */
	const rows = $derived<({ place: PlaceHit } | { cmd: PaletteCmd })[]>([...hits.places.map((place) => ({ place })), ...hits.cmds.map((cmd) => ({ cmd }))])
	$effect(() => { void q; at = 0 })

	function go(i: number, keep = false) {
		const r = rows[i]
		if (!r) return
		onclose()
		if ('place' in r) onopen(r.place.n, keep)
		else r.cmd.run()
	}
	function key(e: KeyboardEvent) {
		if (composing(e)) return
		if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onclose() }
		else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
			e.preventDefault()
			if (!rows.length) return
			at = (at + (e.key === 'ArrowDown' ? 1 : rows.length - 1)) % rows.length
			void tick().then(() => list?.querySelector('.on')?.scrollIntoView({ block: 'nearest' }))
		} else if (e.key === 'Enter') { e.preventDefault(); go(at, e.ctrlKey || e.metaKey) }
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="veil" onpointerdown={(e) => { if (e.target === e.currentTarget) onclose() }}>
	<div class="pal" role="dialog" aria-label="Command palette">
		<input bind:this={box} bind:value={q} onkeydown={key} placeholder="Go to a level, sheet, room, rack, outlet … or run a command" aria-label="Search places and commands" />
		<div class="list" bind:this={list}>
			{#if !q.trim()}
				<p class="hint">Type part of a name — a level (3F), a sheet (S006), a room, a rack, a device, an outlet — or of a command (new sheet, BOM, split). Enter goes / runs; Ctrl+Enter opens a place in a kept tab.</p>
			{:else if !rows.length}
				<p class="hint">Nothing matches “{q}”.</p>
			{:else}
				{#if hits.places.length}<p class="h">Go to</p>{/if}
				{#each hits.places as p, i (p.n.key)}
					<button class="row" class:on={i === at} onpointerenter={() => (at = i)} onclick={(e) => go(i, e.ctrlKey || e.metaKey)}>
						<span class="t">{p.n.label}</span>
						<span class="d">{[p.n.detail, p.where].filter(Boolean).join(' · ')}</span>
					</button>
				{/each}
				{#if hits.cmds.length}<p class="h">Commands</p>{/if}
				{#each hits.cmds as c, j (c.key)}
					{@const i = hits.places.length + j}
					<button class="row" class:on={i === at} title={c.title} onpointerenter={() => (at = i)} onclick={() => go(i)}>
						<span class="t">{c.label}</span>
						<span class="d">{c.path.split(' › ').slice(0, -1).join(' › ')}</span>
						{#if c.shortcut}<kbd>{c.shortcut}</kbd>{/if}
					</button>
				{/each}
			{/if}
		</div>
	</div>
</div>

<style>
	.veil { position: fixed; inset: 0; z-index: 60; background: rgb(0 0 0 / 0.12); display: flex; justify-content: center; align-items: flex-start; padding-top: 12vh; }
	.pal { width: min(36rem, calc(100vw - 32px)); background: var(--cad-panel, #fff); color: var(--cad-text, #18181b); border: 1px solid var(--cad-line, #d4d4d8); border-radius: 8px; box-shadow: 0 12px 32px rgb(0 0 0 / 0.18); overflow: hidden; }
	input { width: 100%; border: 0; border-bottom: 1px solid var(--cad-line, #e4e4e7); padding: 10px 12px; font-size: 14px; background: transparent; color: inherit; outline: none; }
	.list { max-height: 55vh; overflow-y: auto; padding: 4px 0; }
	.h { margin: 6px 12px 2px; font-size: 10.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: var(--cad-muted, #71717a); }
	.hint { margin: 8px 12px; font-size: 12px; color: var(--cad-muted, #71717a); }
	.row { display: flex; align-items: baseline; gap: 8px; width: 100%; text-align: left; padding: 4px 12px; font-size: 13px; }
	.row.on { background: var(--cad-sel, #dbeafe); }
	.t { flex: none; max-width: 60%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.d { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11.5px; color: var(--cad-muted, #71717a); }
	kbd { flex: none; font-size: 10.5px; color: var(--cad-muted, #71717a); border: 1px solid var(--cad-line, #d4d4d8); border-radius: 3px; padding: 0 4px; }
</style>
