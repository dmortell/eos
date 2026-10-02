<!-- A wall's openings (Phase 6.1): width, Z (bottom), H (height), swing / flip, delete. -->
<script lang="ts">
	import type { CadProject } from '../app/project.svelte'
	import type { Opening, Shape } from '../domain/shapes'

	let { project, s }: { project: CadProject; s: Shape } = $props()
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
	<p class="pt-1 font-semibold">Openings <span class="font-normal text-zinc-500">({ops.length})</span></p>
	<table class="w-full">
		<thead><tr class="text-zinc-500"><th>seg</th><th>W</th><th>Z</th><th>H</th><th>Swing</th><th></th></tr></thead>
		<tbody>
			{#each ops as o (o.id)}
				<tr>
					<td class="text-zinc-400">{segNo(o)}</td>
					<td><input class="inp" type="number" value={o.width} onchange={(e) => edit(o, { width: num(e.currentTarget.value, 100) })} /></td>
					<td><input class="inp" type="number" value={o.z} onchange={(e) => edit(o, { z: num(e.currentTarget.value) })} /></td>
					<td><input class="inp" type="number" value={o.h} onchange={(e) => edit(o, { h: num(e.currentTarget.value, 50) })} /></td>
					<td class="whitespace-nowrap">
						<select class="inp" value={o.swing ?? ''} onchange={(e) => edit(o, { swing: (e.currentTarget.value || undefined) as Opening['swing'] })}>
							<option value="">—</option><option value="left">left</option><option value="right">right</option>
						</select>
						{#if o.swing}<button class="x" title="Open to the other face" onclick={() => edit(o, { flip: !o.flip || undefined })}>⇅</button>{/if}
					</td>
					<td><button class="x" title="Delete this opening" onclick={() => put('Delete opening', ops.filter((x) => x.id !== o.id))}>✕</button></td>
				</tr>
			{/each}
		</tbody>
	</table>
{/if}

<style>
	th { font-weight: 400; text-align: left; font-size: 10px; padding: 0 2px; }
	td { padding: 1px 2px; }
	.inp { width: 3.6rem; border: 1px solid #e4e4e7; border-radius: 4px; padding: 0 3px; background: white; font-size: 11px; }
	select.inp { width: 3.8rem; }
	.x { color: #71717a; padding: 0 3px; }
	.x:hover { color: #dc2626; }
</style>
