<script lang="ts">
	// Right-sidebar BLOCKS panel (D5): the global block library by category, with search and a preview of each.
	// Click a block to place it (each click in the active viewport drops one; Esc stops), or drag it onto a
	// viewport. Custom blocks (made with "Save as block") can be deleted here; the built-in ones can't.
	import { Icon } from '$lib'
	import { blockList, deleteBlock, isDefaultBlock } from '../blocks.svelte'
	import { blockExtent, type BlockDef } from '../ui/blocks'

	let { armed = null, onarm }: { armed?: string | null; onarm: (id: string | null) => void } = $props()
	let q = $state('')
	const CAT: Record<string, string> = { outlet: 'Outlets', marker: 'Markers', eltag: 'Elevation tags', north: 'North arrows', faceplate: 'Faceplates', door: 'Doors', legend: 'Legends', custom: 'Custom' }
	const groups = $derived.by(() => {
		const by = new Map<string, BlockDef[]>()
		for (const b of blockList()) if (!q || b.name.toLowerCase().includes(q.toLowerCase())) by.set(b.category ?? 'custom', [...(by.get(b.category ?? 'custom') ?? []), b])
		return [...by].sort((a, b) => (CAT[a[0]] ?? a[0]).localeCompare(CAT[b[0]] ?? b[0]))
	})
	const vb = (b: BlockDef) => { const [x0, y0, x1, y1] = blockExtent(b), m = Math.max(x1 - x0, y1 - y0) * 0.12 || 20; return `${x0 - m} ${y0 - m} ${x1 - x0 + 2 * m} ${y1 - y0 + 2 * m}` }
	const col = (c?: string) => (!c || c === 'byblock' ? 'currentColor' : c)
	let confirmDel = $state<string | null>(null)
	function del(id: string) { if (confirmDel !== id) { confirmDel = id; setTimeout(() => { if (confirmDel === id) confirmDel = null }, 3000); return } confirmDel = null; deleteBlock(id) }
</script>

<div class="bp">
	<div class="bp-search"><Icon name="search" size={12} /><input placeholder="Search blocks…" bind:value={q} /></div>
	<!-- one status line, always there (the list never jumps when a block is armed) -->
	<div class="bp-armed" class:on={!!armed}>{armed ? 'Click in a viewport to place · Esc stops' : 'Click a block to place it, or drag it in'}</div>
	{#each groups as [cat, list] (cat)}
		<div class="bp-sec">{CAT[cat] ?? cat}</div>
		<div class="bp-grid">
			{#each list as b (b.id)}
				<div class="bp-item" class:on={armed === b.id} role="button" tabindex="0" title="{b.name} — click to place, or drag onto a viewport" draggable="true"
					ondragstart={(e) => { e.dataTransfer?.setData('application/x-pages-block', b.id); e.dataTransfer?.setData('text/plain', b.name) }}
					onclick={() => onarm(armed === b.id ? null : b.id)} onkeydown={(e) => { if (e.key === 'Enter') onarm(b.id) }}>
					<svg viewBox={vb(b)}>
						{#each b.shapes as s (s.id)}
							{#if s.type === 'rect'}<rect x={Math.min(s.a![0], s.b![0])} y={Math.min(s.a![1], s.b![1])} width={Math.abs(s.b![0] - s.a![0])} height={Math.abs(s.b![1] - s.a![1])} fill={s.fill && s.fill !== 'none' ? col(s.fill) : 'none'} stroke={col(s.color)} vector-effect="non-scaling-stroke" />
							{:else if s.type === 'ellipse'}<ellipse cx={(s.a![0] + s.b![0]) / 2} cy={(s.a![1] + s.b![1]) / 2} rx={Math.abs(s.b![0] - s.a![0]) / 2} ry={Math.abs(s.b![1] - s.a![1]) / 2} fill={s.fill && s.fill !== 'none' ? col(s.fill) : 'none'} stroke={col(s.color)} vector-effect="non-scaling-stroke" />
							{:else if s.type === 'polyline'}<polyline points={(s.pts ?? []).map((p) => p.join(',')).join(' ')} fill={s.fill && s.fill !== 'none' ? col(s.fill) : 'none'} stroke={col(s.color)} vector-effect="non-scaling-stroke" />
							{:else if s.type === 'text' && s.a}<text x={s.a[0]} y={s.a[1]} font-size="120" fill="currentColor">{s.text}</text>{/if}
						{/each}
					</svg>
					<span>{b.name}</span>
					{#if !isDefaultBlock(b.id)}<button class="bp-del" class:confirm={confirmDel === b.id} title="Delete this custom block (for every project)" onclick={(e) => { e.stopPropagation(); del(b.id) }}>{confirmDel === b.id ? 'Delete?' : '×'}</button>{/if}
				</div>
			{/each}
		</div>
	{/each}
	<div class="bp-hint">Make your own: select shapes, then Properties › Save as block.</div>
</div>

<style>
	.bp { flex:1; overflow-y:auto; min-height:0; padding:6px; scrollbar-width:thin; }
	.bp-search { display:flex; align-items:center; gap:6px; padding:4px 6px; margin:2px; border:1px solid var(--line); border-radius:5px; color:var(--faint); }
	.bp-search input { flex:1; min-width:0; background:none; border:none; color:var(--text); font-size:12px; }
	.bp-search input:focus { outline:none; }
	.bp-armed { font-size:10px; line-height:14px; height:14px; color:var(--faint); padding:4px 6px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
	.bp-armed.on { color:var(--accent); font-weight:600; }
	.bp-sec { font-size:9px; text-transform:uppercase; letter-spacing:.1em; color:var(--faint); padding:10px 4px 4px; }
	.bp-grid { display:grid; grid-template-columns:repeat(3, 1fr); gap:4px; }
	.bp-item { position:relative; display:flex; flex-direction:column; align-items:center; gap:2px; padding:5px 3px; border:1px solid var(--line-soft); border-radius:5px; cursor:grab; color:var(--text); background:var(--panel2); }
	.bp-item:hover { border-color:var(--accent-dim); }
	.bp-item.on { border-color:var(--accent); background:var(--active); }
	.bp-item svg { width:100%; height:42px; }
	.bp-item span { font-size:9px; text-align:center; color:var(--muted); line-height:1.15; max-height:2.3em; overflow:hidden; }
	.bp-del { position:absolute; top:2px; right:2px; font-size:10px; line-height:1; padding:1px 4px; border:none; border-radius:3px; background:none; color:var(--faint); cursor:pointer; }
	.bp-del.confirm { background:#dc2626; color:#fff; }
	.bp-hint { font-size:10px; color:var(--faint); padding:10px 6px; }
</style>
