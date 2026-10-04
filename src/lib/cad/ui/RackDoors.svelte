<!-- A cabinet's doors (their swings show on the plan: aisle clearance), for one rack or several. With several, a field
     shows the value they share, or "mixed"; an edit sets that one field on every cabinet (the other fields stay
     each rack's own). Racks that aren't cabinets or VCMs are left alone. -->
<script lang="ts">
	import type { CadProject } from '../app/project.svelte'
	import type { Rack } from '../domain/types'

	let { project, racks }: { project: CadProject; racks: Rack[] } = $props()

	type Doors = NonNullable<Rack['doors']>
	const cabinets = $derived(racks.filter((r) => r.kind === 'cabinet' || r.kind === 'vcm'))   // VCMs have doors too (Dave)
	/** The value every cabinet shares, or `null` when they differ. */
	function shared<K extends keyof Doors>(k: K): Doors[K] | null {
		const vs = new Set(cabinets.map((r) => r.doors?.[k]))
		return vs.size === 1 ? [...vs][0] : null
	}
	const front = $derived(shared('front')), rear = $derived(shared('rear')), hinge = $derived(shared('hinge'))
	const anySingle = $derived(cabinets.some((r) => r.doors?.front === 'single' || r.doors?.rear === 'single'))

	function set(patch: Doors) {
		const n = cabinets.length
		project.store.transact(n > 1 ? `Rack doors (${n} racks)` : 'Rack doors', (tx) => {
			for (const r of cabinets) {
				const next = { ...(r.doors ?? {}), ...patch }
				tx.put({ ...r, doors: next.front || next.rear ? next : undefined })
			}
		})
	}
	const face = (v: string) => (v === 'single' || v === 'split' ? v : undefined)
</script>

{#if cabinets.length}
	<label class="row" title={cabinets.length < racks.length ? `Sets the ${cabinets.length} cabinets; the other racks have no doors` : undefined}>Doors
		<span class="flex gap-1">
			<select class="inp" title="Front door" value={front === null ? 'mixed' : (front ?? '')} onchange={(e) => e.currentTarget.value !== 'mixed' && set({ front: face(e.currentTarget.value) })}>
				{#if front === null}<option value="mixed">front: mixed</option>{/if}
				<option value="">front: none</option><option value="single">front: single</option><option value="split">front: split</option>
			</select>
			<select class="inp" title="Rear door" value={rear === null ? 'mixed' : (rear ?? '')} onchange={(e) => e.currentTarget.value !== 'mixed' && set({ rear: face(e.currentTarget.value) })}>
				{#if rear === null}<option value="mixed">rear: mixed</option>{/if}
				<option value="">rear: none</option><option value="single">rear: single</option><option value="split">rear: split</option>
			</select>
		</span>
	</label>
	{#if anySingle}
		<label class="row" title="The side a single door hangs on, as seen standing at that face">Hinge
			<select class="inp" value={hinge === null ? 'mixed' : (hinge ?? 'left')} onchange={(e) => e.currentTarget.value !== 'mixed' && set({ hinge: e.currentTarget.value === 'right' ? 'right' : undefined })}>
				{#if hinge === null}<option value="mixed">mixed</option>{/if}
				<option value="left">left</option><option value="right">right</option>
			</select></label>
	{/if}
{/if}

<style>
	.row { display: grid; grid-template-columns: 6.5rem 1fr; align-items: center; gap: 0.25rem; }
	.inp { width: 100%; border: 1px solid var(--cad-line); border-radius: 4px; padding: 1px 4px; background: var(--cad-input); color: var(--cad-text); }
</style>
