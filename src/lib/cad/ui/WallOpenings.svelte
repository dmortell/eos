<!-- A wall's "slab to slab" switch and its openings (Phase 6.1): per opening two short lines that fit the sidebar —
     W / Z / H, then swing / flip / delete. The plan's handles do the same by dragging. -->
<script lang="ts">
	import type { CadProject } from '../app/project.svelte'
	import type { Opening, Shape } from '../domain/shapes'
	import type { Workspace } from '../app/workspace.svelte'

	let { project, ws, s }: { project: CadProject; ws: Workspace; s: Shape } = $props()
	const selId = $derived(ws.openingSel?.wallId === s.id ? ws.openingSel.openingId : null)
	const ops = $derived(s.role?.kind === 'wall' ? s.role.openings : [])
	const segNo = (o: Opening) => (s.geom.kind === 'path' ? s.geom.segs.findIndex((x) => x.id === o.segId) + 1 : 0)

	function put(label: string, next: Opening[]) {
		if (s.role?.kind !== 'wall') return
		const role = s.role
		project.store.transact(label, (tx) => tx.put({ ...s, role: { ...role, openings: next } }))
	}
	const edit = (o: Opening, patch: Partial<Opening>) => put('Edit opening', ops.map((x) => (x.id === o.id ? { ...x, ...patch } : x)))
	const num = (v: string, min = 0) => Math.max(min, Number(v) || 0)
</script>

{#if s.role?.kind === 'wall'}
	{@const role = s.role}
	<label class="flex items-center gap-1 pt-1" title="Full height from the structural slab to the slab above (IDF / UPS rooms): follows the level's floor heights">
		<input type="checkbox" checked={!!role.slabToSlab} onchange={(e) => { const on = e.currentTarget.checked; project.store.transact(on ? 'Wall slab to slab' : 'Wall to its own height', (tx) => tx.put({ ...s, role: { ...role, slabToSlab: on || undefined } })) }} />
		Slab to slab</label>
{/if}
{#if ops.length}
	<p class="pt-1 font-semibold">Openings <span class="font-normal text-zinc-500">({ops.length}) · drag their grips on the plan</span></p>
	{#each ops as o, i (o.id)}
		<!-- the selected hole (clicked on the plan) is highlighted; a click on a row selects that hole -->
		<div class="op" class:on={o.id === selId} role="presentation" onmousedown={() => ws.selectOpening(s.id, o.id)}>
			<div class="line">
				<span class="n" title="Segment {segNo(o)}">{i + 1}</span>
				<label>W <input class="inp" type="number" value={o.width} onchange={(e) => edit(o, { width: num(e.currentTarget.value, 100) })} /></label>
				<label title="Bottom above FFL">Z <input class="inp" type="number" value={o.z} onchange={(e) => edit(o, { z: num(e.currentTarget.value) })} /></label>
				<label title="Height">H <input class="inp" type="number" value={o.h} onchange={(e) => edit(o, { h: num(e.currentTarget.value, 50) })} /></label>
			</div>
			<div class="line">
				<span class="n"></span>
				<label>Swing
					<select class="inp sel" value={o.swing ?? ''} onchange={(e) => edit(o, { swing: (e.currentTarget.value || undefined) as Opening['swing'] })}>
						<option value="">none</option><option value="left">left</option><option value="right">right</option>
					</select></label>
				{#if o.swing}<button class="btn" title="Open to the other face" onclick={() => edit(o, { flip: !o.flip || undefined })}>Flip</button>{/if}
				<button class="btn del" title="Delete this opening" onclick={() => put('Delete opening', ops.filter((x) => x.id !== o.id))}>Delete</button>
			</div>
		</div>
	{/each}
{/if}

<style>
	.op { border-top: 1px solid #f4f4f5; padding: 2px 0; }
	.op.on { background: #fff7ed; box-shadow: inset 3px 0 0 #ea580c; }
	.line { display: flex; align-items: center; gap: 4px; margin: 1px 0; font-size: 11px; color: #52525b; }
	.n { width: 0.9rem; color: #a1a1aa; text-align: right; }
	.inp { width: 3.3rem; border: 1px solid #e4e4e7; border-radius: 4px; padding: 0 3px; background: white; font-size: 11px; }
	.sel { width: 4rem; }
	.btn { border: 1px solid #d4d4d8; border-radius: 4px; padding: 0 5px; background: white; font-size: 11px; }
	.btn:hover { background: #f4f4f5; }
	.del:hover { color: #dc2626; }
</style>
