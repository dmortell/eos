<!-- The PROPERTIES HEADER (UX11): what is selected — its kind (with an icon), its name or label, its layer — with
     Select similar and Delete (the Delete key's action: asks first when more goes with it). -->
<script lang="ts">
	import type { CadProject } from '../app/project.svelte'
	import type { Workspace } from '../app/workspace.svelte'
	import type { Entity } from '../domain/drawing'
	import { Icon } from '$lib'
	import { ALIGN_LABEL, type AlignHow } from '../editor/align'
	import { canMove } from '../editor/behaviours'
	import { selectionKinds, countsText, kindOf, kindIcon } from './propsKit'

	let { project, ws, items }: { project: CadProject; ws: Workspace; items: Entity[] } = $props()

	const one = $derived(items.length === 1 ? items[0] : undefined)
	const movable = $derived(items.filter(canMove).length)
	const ALIGN: [AlignHow, string][] = [['left', 'alignLeftEdges'], ['centre', 'alignCentresX'], ['right', 'alignRightEdges'], ['top', 'alignTopEdges'], ['middle', 'alignMiddlesY'], ['bottom', 'alignBottomEdges'], ['across', 'distributeX'], ['down', 'distributeY']]
	const kind = $derived.by((): [string, string] => {
		// several: what they are, "3 racks · 5 outlets"
		if (!one) { const ks = selectionKinds(items); return [countsText(ks.map((k) => [k.items.length, k.one, k.many])), ks.length === 1 ? (kindIcon(ks[0].key) ?? 'copy') : 'copy'] }
		if (one.type === 'sheet' && ws.viewportId) return ['Viewport', 'panels']
		return kindOf(one)
	})
	const name = $derived.by(() => {
		if (!one) return ''
		if (one.type === 'sheet') return ws.viewportId ? `on ${one.number}` : `${one.number} ${one.title}`
		if (one.type === 'shape' && one.geom.kind === 'insert') return project.blockOf(one.geom.blockId)?.name ?? ''
		return project.index.nameOf(one.id)
	})
	const layer = $derived.by(() => {
		const ids = new Set(items.map((e) => (e as { layerId?: string }).layerId ?? ''))
		if (ids.size !== 1) return ids.size ? 'mixed layers' : ''
		const id = [...ids][0]
		return id ? project.index.nameOf(id) || id.replace(/^sys:/, '') : ''
	})
</script>

<div class="hd">
	<Icon name={kind[1]} size={14} />
	<div class="t">
		<b>{kind[0]}</b>{#if name}<span class="n" title={name}>{name}</span>{/if}
		{#if layer}<span class="l" title="Layer">{layer}</span>{/if}
	</div>
	<button title="Select everything in this view like the selection (Edit › Select similar)" onclick={() => ws.selectSimilar()}><Icon name="sparkles" size={13} /></button>
	<button class="del" title="Delete (the Delete key) — asks first when more goes with it; Undo brings it back" onclick={ws.remove}><Icon name="trash" size={13} /></button>
</div>
{#if movable >= 2}
	<!-- align / distribute (backlog "Align / distribute"): as the active view draws them; a group counts as one -->
	<div class="al" role="group" aria-label="Align">
		<span>Align</span>
		{#each ALIGN as [how, icon] (how)}
			<button title={ALIGN_LABEL[how]} disabled={(how === 'across' || how === 'down') && movable < 3} onclick={() => ws.align(how)}><Icon name={icon} size={13} /></button>
			{#if how === 'right' || how === 'bottom'}<i></i>{/if}
		{/each}
	</div>
{/if}

<style>
	.hd { display: flex; align-items: center; gap: 6px; padding-bottom: 4px; margin-bottom: 2px; color: var(--cad-muted); }
	.t { flex: 1; min-width: 0; display: flex; flex-wrap: wrap; align-items: baseline; gap: 0 6px; }
	b { color: var(--cad-text); font-size: 12px; }
	.n { color: var(--cad-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }
	.l { font-size: 10px; padding: 0 5px; border-radius: 8px; background: var(--cad-hover); color: var(--cad-muted); }
	button { display: inline-flex; padding: 3px; border-radius: 4px; color: var(--cad-muted); }
	button:hover { background: var(--cad-hover); color: var(--cad-text); }
	button.del:hover { color: #dc2626; }
	.al { display: flex; align-items: center; gap: 1px; margin: -2px 0 4px; font-size: 11px; color: var(--cad-muted); }
	.al span { margin-right: 4px; }
	.al i { width: 1px; height: 14px; margin: 0 3px; background: var(--cad-line); }
	.al button:disabled { opacity: 0.35; }
</style>
