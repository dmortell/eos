<!-- The legend of the open level: every block used (outlet symbols and inserts) with a preview and how many. The same
     counts feed a printed legend on sheets later (Phase 4). -->
<script lang="ts">
	import type { CadProject } from '../app/project.svelte'
	import type { Workspace } from '../app/workspace.svelte'
	import type { Id } from '../domain/types'
	import { defaultOutletBlock } from '../domain/blocks'
	import { blockPrims } from '../views/blocks'
	import { primBounds, unionBounds } from '../views/display'
	import Prims from './Prims.svelte'

	let { project, levelId, ws }: { project: CadProject; levelId: string; ws?: Workspace } = $props()
	/** Your own blocks can be deleted from the library here (drawings that use them keep them). */
	function retire(id: Id, name: string) {
		ws?.ask2(`Delete block ${name} from the library (every project)? What's already drawn keeps it. This can't be undone.`, 'Delete block', () => project.retireBlock(id))
	}

	const rows = $derived.by(() => {
		const n = new Map<Id, number>()
		for (const o of project.index.outlets) if (o.levelId === levelId && o.at) { const id = o.blockId ?? defaultOutletBlock(o); n.set(id, (n.get(id) ?? 0) + 1) }
		for (const s of project.index.shapes) if (s.levelId === levelId && s.geom.kind === 'insert') n.set(s.geom.blockId, (n.get(s.geom.blockId) ?? 0) + 1)
		return [...n].map(([id, count]) => {
			const b = project.blockOf(id)
			const prims = b ? blockPrims(b, { at: { x: 0, y: 0 } }, 1, { LABEL: '' }, id, b.category === 'outlet' ? 'outlet outlet-low' : 'shape') : []
			const bb = unionBounds(prims.map(primBounds)) ?? { x0: -1, y0: -1, x1: 1, y1: 1 }
			const pad = Math.max(bb.x1 - bb.x0, bb.y1 - bb.y0) * 0.15 || 0.5
			return { id, name: b?.name ?? 'Missing block', count, prims, viewBox: `${bb.x0 - pad} ${bb.y0 - pad} ${bb.x1 - bb.x0 + 2 * pad} ${bb.y1 - bb.y0 + 2 * pad}` }
		}).sort((a, b) => b.count - a.count)
	})
</script>

{#if rows.length}
	<p class="hdr">Symbols</p>
	{#each rows as r (r.id)}
		<div class="row" title={r.name}>
			<svg class="pv" viewBox={r.viewBox}><Prims prims={r.prims} selected={new Set()} /></svg>
			<span class="nm">{r.name}</span>
			<span class="ct">{r.count}</span>
			{#if ws && !project.blockOf(r.id)?.builtin && !project.blockOf(r.id)?.retired && project.blockOf(r.id)}<button class="del" title="Delete this block from the library" onclick={() => retire(r.id, r.name)}>✕</button>{:else}<span></span>{/if}
		</div>
	{/each}
{/if}

<style>
	.hdr { margin-top: 0.75rem; padding: 0 0.25rem 0.25rem; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.025em; color: var(--cad-muted); }
	.row { display: grid; grid-template-columns: 1.4rem 1fr auto 0.8rem; align-items: center; gap: 0.35rem; padding: 1px 4px; font-size: 12px; }
	.del { visibility: hidden; font-size: 10px; color: var(--cad-faint); }
	.row:hover .del { visibility: visible; }
	.del:hover { color: #dc2626; }
	.pv { width: 1.3rem; height: 1.3rem; }
	.nm { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.ct { font-size: 11px; color: var(--cad-faint); }
</style>
